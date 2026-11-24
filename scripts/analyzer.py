"""Pure combat-log analysis engine for Ula'tek Mythic WarcraftLogs reports."""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

from scripts.spells_config import (
    CLASS_BASELINE_DEFS,
    CLASS_DEFAULT_INTERRUPT,
    DEMONIC_HEALTHSTONE_CD_SEC,
    DEMONIC_HEALTHSTONE_ID,
    HEALTH_POTION_CD_SEC,
    MYTHIC_DIFFICULTY,
    P2_AVOIDABLE_IDS,
    P3_AVOIDABLE_SPELL_NAMES,
    P3_KICK_SPELL_NAMES,
    RAID_SPIKE_ABILITY_IDS,
    SPELL_CAUSTIC_WAVES,
    SPELL_FALLING_DEBRIS,
    SPELL_GRASPING_FANGS_DEBUFF,
    SPELL_MALICE_CAST,
    SPELL_MALICE_DMG,
    SPELL_MELEE,
    SPELL_MOTHERS_WRATH_DMG,
    SPELL_NECROTIC_VAPORS,
    SPELL_NOXIOUS_SHELL_DEBUFF,
    SPELL_NOXIOUS_SHELL_DMG,
    SPELL_NOXIOUS_SPLASH,
    SPELL_PUTRID_MEMBRANE_DEBUFF,
    SPELL_PUTRID_MEMBRANE_DMG,
    SPELL_RANCID_YOLK,
    SPELL_SOUL_CONSTRICTOR,
    SPELL_SPECTRAL_COILS_CAST,
    SPELL_SPECTRAL_COILS_DMG,
    SPELL_STONE_VENOM_DEBUFF,
    SPELL_STONE_VENOM_DMG,
    TANK_DEFAULT_INTERRUPT,
    ULATEK_ENCOUNTER_ID,
    defensive_mitigates,
    get_defensive_cooldown_ms,
    get_healer_instant_specs,
    get_interrupt_cooldown_ms,
    infer_damage_school,
    is_avoidable_defensive_death,
    is_defensive_buff,
    is_healer_direct_heal,
    is_healer_external_spell,
    is_health_potion,
    is_healthstone,
    is_interrupt_spell,
    is_trackable_personal_def,
)

REPORT_CODE_RE = re.compile(r"(?:warcraftlogs\.com/reports/|^[a-zA-Z0-9]{16}$)")
REPORT_URL_EXTRACT_RE = re.compile(r"warcraftlogs\.com/reports/([a-zA-Z0-9]{16})")
RAW_CODE_RE = re.compile(r"^[a-zA-Z0-9]{16}$")


def extract_report_code(url_or_code: str) -> str:
    """Extract a 16-char WarcraftLogs report code from a URL or raw code."""
    text = (url_or_code or "").strip()
    if RAW_CODE_RE.match(text):
        return text
    m = REPORT_URL_EXTRACT_RE.search(text)
    if m:
        return m.group(1)
    raise ValueError(f"Ungültige WarcraftLogs-URL oder Report-Code: {url_or_code!r}")


def format_rel_time(ms: float) -> str:
    """Format milliseconds into MM:SS.mmm."""
    clamped = max(0.0, float(ms))
    total_sec = clamped / 1000.0
    minutes = int(total_sec // 60)
    seconds = total_sec - minutes * 60
    return f"{minutes:02d}:{seconds:06.3f}"


def build_events_url(
    report_code: str,
    fight_id: int,
    target_id: int,
    timestamp: int,
    fight_start: int,
    fight_end: int,
    window_ms: int = 3000,
) -> str:
    start_ms = max(int(fight_start), int(timestamp) - window_ms)
    end_ms = min(int(fight_end), int(timestamp) + window_ms)
    return (
        f"https://www.warcraftlogs.com/reports/{report_code}"
        f"?fight={fight_id}&type=damage-taken&view=events&source={target_id}"
        f"&start={start_ms}&end={end_ms}"
    )


def build_replay_url(
    report_code: str,
    fight_id: int,
    rel_ms: int,
    lead_ms: int = 3000,
) -> str:
    pos = max(0, int(rel_ms) - lead_ms)
    return (
        f"https://www.warcraftlogs.com/reports/{report_code}"
        f"?fight={fight_id}&view=replay&position={pos}"
    )


def build_damage_window_url(
    report_code: str,
    fight_id: int,
    start_ts: int,
    end_ts: int,
) -> str:
    return (
        f"https://www.warcraftlogs.com/reports/{report_code}"
        f"?fight={fight_id}&type=damage-done&start={int(start_ts)}&end={int(end_ts)}"
    )


def _detect_tanks(
    actors: dict[int, dict[str, Any]],
    events_by_fight: dict[int, list[dict[str, Any]]],
) -> list[int]:
    """Auto-detect up to 2 raid tanks via Stone Venom debuffs and Boss/Gore Rattle melees."""
    sv_counts: Counter[int] = Counter()
    melee_counts: Counter[int] = Counter()
    for fevs in events_by_fight.values():
        for ev in fevs:
            tid = ev.get("targetID")
            if tid not in actors or actors[tid].get("type") != "Player":
                continue
            aid = ev.get("abilityGameID")
            if aid in (SPELL_STONE_VENOM_DEBUFF, SPELL_STONE_VENOM_DMG):
                sv_counts[tid] += 1
            elif ev.get("type") == "damage" and aid == SPELL_MELEE:
                src_name = actors.get(ev.get("sourceID"), {}).get("name", "")
                if src_name in ("Ula'tek", "Gore Rattle"):
                    melee_counts[tid] += 1

    # Combine with strong weight on Stone Venom
    combined: Counter[int] = Counter()
    for tid, cnt in sv_counts.items():
        combined[tid] += cnt * 10
    for tid, cnt in melee_counts.items():
        combined[tid] += cnt

    return [tid for tid, _ in combined.most_common(2)]


def _build_player_known_defs(
    actors: dict[int, dict[str, Any]],
    abilities: dict[int, str],
    events_by_fight: dict[int, list[dict[str, Any]]],
) -> dict[int, dict[str, str]]:
    """Build each player's personal defensive kit from class baseline + abilities actually used in this report."""
    known: dict[int, dict[str, str]] = {}
    for pid, actor in actors.items():
        if actor.get("type") != "Player":
            continue
        kit: dict[str, str] = {}
        for base_name in CLASS_BASELINE_DEFS.get(actor.get("subType", ""), ()):
            kit[base_name.lower()] = base_name
        known[pid] = kit

    for fevs in events_by_fight.values():
        for ev in fevs:
            t = ev.get("type")
            if t not in ("applybuff", "cast"):
                continue
            aid = ev.get("abilityGameID")
            ab_name = (abilities.get(aid, "") or "").strip()
            if not is_trackable_personal_def(ab_name):
                continue
            src = ev.get("sourceID")
            tgt = ev.get("targetID")
            pid = src if src in known else (tgt if tgt in known else None)
            if pid is not None and (src == tgt or src == pid or src is None):
                known[pid].setdefault(ab_name.lower(), ab_name)
    return known


def _build_player_interrupts(
    actors: dict[int, dict[str, Any]],
    abilities: dict[int, str],
    events_by_fight: dict[int, list[dict[str, Any]]],
    tank_id_set: set[int],
) -> dict[int, tuple[str, int]]:
    """Map each player with an interrupt to (spell_name, cooldown_ms) via class defaults + observed casts/interrupts."""
    kit: dict[int, tuple[str, int]] = {}
    for pid, actor in actors.items():
        if actor.get("type") != "Player":
            continue
        cls = actor.get("subType", "")
        if cls in CLASS_DEFAULT_INTERRUPT:
            sp, cd = CLASS_DEFAULT_INTERRUPT[cls]
            kit[pid] = (sp, cd * 1000)
        elif pid in tank_id_set and cls in TANK_DEFAULT_INTERRUPT:
            sp, cd = TANK_DEFAULT_INTERRUPT[cls]
            kit[pid] = (sp, cd * 1000)

    # Also auto-discover players of hybrid classes who actually cast/interrupted with a kick spell in the report
    for fevs in events_by_fight.values():
        for ev in fevs:
            t = ev.get("type")
            if t not in ("interrupt", "cast"):
                continue
            src = ev.get("sourceID")
            if src not in actors or actors[src].get("type") != "Player":
                continue
            ab_name = (abilities.get(ev.get("abilityGameID"), "") or "").strip()
            if is_interrupt_spell(ab_name):
                kit[src] = (ab_name, get_interrupt_cooldown_ms(ab_name))
    return kit


def _build_egg_carrier_analysis(
    sorted_fights: list[dict[str, Any]],
    actors: dict[int, dict[str, Any]],
    events_by_fight: dict[int, list[dict[str, Any]]],
    egg_fails: list[dict[str, Any]],
    report_code: str,
) -> tuple[list[str], list[dict[str, Any]]]:
    """Build per-round egg carrier uptime, Noxious Shell (1307617) DoT damage, and missed-pickup events."""
    # Pre-index egg fails (wave hits & 2-carrier collisions) by (fight_id, target_id)
    fail_by_fp: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    for ef in egg_fails:
        if ef.get("kind") in ("caustic_waves", "egg_collision"):
            fail_by_fp[(int(ef["fight_id"]), int(ef["target_id"]))].append(ef)

    # First pass: collect Spectral Coils rounds and carrier pull presence to auto-detect regular carriers
    fight_rounds: dict[int, list[list[int]]] = {}
    carrier_pull_counts: Counter[int] = Counter()
    pulls_with_rounds = 0

    for fight in sorted_fights:
        fid = int(fight["id"])
        fevs = sorted(events_by_fight.get(fid, []), key=lambda e: int(e["timestamp"]))
        coil_casts = [
            int(ev["timestamp"])
            for ev in fevs
            if ev.get("abilityGameID") == SPELL_SPECTRAL_COILS_CAST and ev.get("type") == "cast"
        ]
        rounds: list[list[int]] = []
        for ts in coil_casts:
            if not rounds or ts - rounds[-1][-1] > 20000:
                rounds.append([ts])
            else:
                rounds[-1].append(ts)
        fight_rounds[fid] = rounds
        if rounds:
            pulls_with_rounds += 1
            seen_in_fight: set[int] = set()
            for ev in fevs:
                if ev.get("abilityGameID") == SPELL_NOXIOUS_SHELL_DEBUFF and ev.get("type") == "applydebuff":
                    tid = ev.get("targetID")
                    if tid in actors and actors[tid].get("type") == "Player":
                        seen_in_fight.add(int(tid))
            for pid in seen_in_fight:
                carrier_pull_counts[pid] += 1

    if pulls_with_rounds <= 1:
        min_regular_pulls = 1
    else:
        min_regular_pulls = max(2, math.ceil(pulls_with_rounds * 0.4))

    regular_carrier_ids = sorted(
        (pid for pid, cnt in carrier_pull_counts.items() if cnt >= min_regular_pulls),
        key=lambda pid: (-carrier_pull_counts[pid], actors[pid]["name"]),
    )
    regular_carrier_set = set(regular_carrier_ids)
    regular_carrier_names = [actors[pid]["name"] for pid in regular_carrier_ids]

    carrier_events: list[dict[str, Any]] = []

    for pull_idx, fight in enumerate(sorted_fights, start=1):
        fid = int(fight["id"])
        f_start = int(fight["startTime"])
        f_end = int(fight["endTime"])
        is_kill = bool(fight.get("kill", False))
        rounds = fight_rounds.get(fid, [])
        fevs = sorted(events_by_fight.get(fid, []), key=lambda e: int(e["timestamp"]))

        # Track player deaths for deaths_before and dead-check on missed pickups
        all_death_ts: list[int] = []
        deaths_by_player: dict[int, list[int]] = defaultdict(list)
        shell_dmg_by_player: dict[int, list[tuple[int, int]]] = defaultdict(list)

        for ev in fevs:
            t = ev.get("type")
            ts = int(ev["timestamp"])
            tid = ev.get("targetID")
            if t == "death" and tid in actors and actors[tid].get("type") == "Player":
                all_death_ts.append(ts)
                deaths_by_player[int(tid)].append(ts)
            elif t == "damage" and ev.get("abilityGameID") == SPELL_NOXIOUS_SHELL_DMG and tid in actors:
                amt = int(ev.get("amount", 0) or 0)
                if amt > 0:
                    shell_dmg_by_player[int(tid)].append((ts, amt))

        all_death_ts.sort()

        def _count_deaths_before(ts: int) -> int:
            return sum(1 for dts in all_death_ts if dts < ts)

        # Extract Noxious Shell (1307612) hold intervals per player
        active_start: dict[int, int] = {}
        intervals: list[tuple[int, int, int, bool]] = []  # (pid, start_ts, end_ts, ended_at_wipe)
        for ev in fevs:
            if ev.get("abilityGameID") != SPELL_NOXIOUS_SHELL_DEBUFF:
                continue
            tid = ev.get("targetID")
            if tid not in actors or actors[tid].get("type") != "Player":
                continue
            pid = int(tid)
            ts = int(ev["timestamp"])
            t = ev.get("type")
            if t == "applydebuff":
                if pid not in active_start:
                    active_start[pid] = ts
            elif t == "removedebuff":
                st = active_start.pop(pid, None)
                if st is not None:
                    intervals.append((pid, st, ts, False))
        for pid, st in active_start.items():
            intervals.append((pid, st, f_end, True))

        # Track which regular carriers participated in each round
        carried_in_round: dict[int, set[int]] = defaultdict(set)
        friendly_ids = {int(x) for x in (fight.get("friendlyPlayers") or []) if int(x) in actors}

        for iv_idx, (pid, st, en, ended_at_wipe) in enumerate(intervals):
            duration_ms = max(0, en - st)
            # Assign to the first round whose last_coil >= st - 2000
            target_round_idx: int | None = None
            for r_i, r_coils in enumerate(rounds):
                if r_coils[-1] >= st - 2000:
                    target_round_idx = r_i
                    break

            player_name = actors[pid]["name"]
            player_class = actors[pid].get("subType", "")
            p_dmg_ticks = [
                (dts, amt)
                for dts, amt in shell_dmg_by_player.get(pid, [])
                if st - 200 <= dts <= en + 200
            ]
            total_shell_dmg = sum(amt for _, amt in p_dmg_ticks)

            # Check whether this interval ended in a wave hit or 2-carrier egg collision
            matched_fail = next(
                (
                    ef
                    for ef in fail_by_fp.get((fid, pid), [])
                    if abs(int(ef["timestamp"]) - en) <= 150
                ),
                None,
            )

            pre_dmg_sec: list[int] = []
            post_break_dmg = 0
            post_break_ms = 0
            held_before_break_ms = duration_ms
            ref_break_ts = en

            if target_round_idx is not None:
                r_num = target_round_idx + 1
                r_coils = rounds[target_round_idx]
                carried_in_round[r_num].add(pid)
                matched_coil = next((c for c in r_coils if abs(en - c) <= 1500), None)
                ref_break_ts = matched_coil if matched_coil is not None else r_coils[0]
                held_before_break_ms = max(0, min(en, ref_break_ts) - st)
                missed_break = (matched_fail is None) and (en > r_coils[-1] + 2000)

                if matched_fail is not None:
                    status = "hit_fail"
                    break_reason = str(matched_fail["kind"])
                elif missed_break:
                    status = "missed_break"
                    break_reason = "missed_break"
                    post_break_ms = max(0, en - (r_coils[-1] + 1500))
                elif matched_coil is not None:
                    status = "ok"
                    break_reason = "spectral_coils"
                elif any(abs(dts - en) <= 1500 for dts in deaths_by_player.get(pid, [])):
                    status = "player_death"
                    break_reason = "player_death"
                elif ended_at_wipe:
                    status = "wiped_before_break"
                    break_reason = "wiped_before_break"
                else:
                    status = "ok"
                    break_reason = "other"

                # Bucket pre-break damage ticks by integer second before ref_break_ts
                max_sec_needed = max(0, int(held_before_break_ms // 1000)) + 2
                buckets = [0] * min(125, max(1, max_sec_needed))
                for dts, amt in p_dmg_ticks:
                    if missed_break and dts > r_coils[-1] + 1500:
                        post_break_dmg += amt
                    elif dts <= ref_break_ts + 200:
                        sec_before = max(0, int((ref_break_ts - dts) // 1000))
                        if sec_before < len(buckets):
                            buckets[sec_before] += amt
                        else:
                            buckets[-1] += amt
                # Trim trailing zeros to keep JSON compact
                while len(buckets) > 1 and buckets[-1] == 0:
                    buckets.pop()
                pre_dmg_sec = buckets if any(buckets) else []
            else:
                r_num = len(rounds) + 1
                status = "hit_fail" if matched_fail is not None else "wiped_before_break"
                break_reason = str(matched_fail["kind"]) if matched_fail is not None else "wiped_before_break"
                held_before_break_ms = 0

            pickup_rel_ms = max(0, st - f_start)
            end_rel_ms = max(0, en - f_start)
            is_reg = pid in regular_carrier_set
            if is_reg:
                dead_regs_at_pickup: list[str] = []
                all_regs_alive: bool | None = None
            else:
                dead_regs_at_pickup = sorted(
                    actors[rpid]["name"]
                    for rpid in regular_carrier_ids
                    if (not friendly_ids or rpid in friendly_ids)
                    and any(dts < st for dts in deaths_by_player.get(rpid, []))
                )
                all_regs_alive = len(dead_regs_at_pickup) == 0

            # Enrich matched egg_fail (caustic_waves or egg_collision) with backup/regular-alive metadata
            if matched_fail is not None:
                matched_fail["is_regular"] = is_reg
                matched_fail["all_regulars_alive_at_pickup"] = all_regs_alive
                matched_fail["dead_regulars_at_pickup"] = dead_regs_at_pickup

            carrier_events.append(
                {
                    "id": f"{report_code}-{fid}-{pid}-{st}-{iv_idx}-ec",
                    "pull_num": pull_idx,
                    "fight_id": fid,
                    "is_kill": is_kill,
                    "round_num": r_num,
                    "player": player_name,
                    "class": player_class,
                    "target_id": pid,
                    "is_regular": is_reg,
                    "all_regulars_alive_at_pickup": all_regs_alive,
                    "dead_regulars_at_pickup": dead_regs_at_pickup,
                    "status": status,
                    "break_reason": break_reason,
                    "player_was_dead": False,
                    "pickup_rel_time": format_rel_time(pickup_rel_ms),
                    "pickup_rel_ms": pickup_rel_ms,
                    "end_rel_time": format_rel_time(end_rel_ms),
                    "end_rel_ms": end_rel_ms,
                    "break_rel_time": format_rel_time(max(0, ref_break_ts - f_start)),
                    "timestamp": st,
                    "duration_ms": duration_ms,
                    "held_before_break_ms": held_before_break_ms,
                    "post_break_ms": post_break_ms,
                    "total_shell_dmg": total_shell_dmg,
                    "pre_dmg_sec": pre_dmg_sec,
                    "post_break_dmg": post_break_dmg,
                    "deaths_before": _count_deaths_before(st),
                    "events_url": build_events_url(report_code, fid, pid, st, f_start, f_end, window_ms=max(3000, duration_ms)),
                    "replay_url": build_replay_url(report_code, fid, pickup_rel_ms),
                }
            )

        # Check missed pickups for regular carriers on every completed Spectral Coils round
        for r_i, r_coils in enumerate(rounds):
            r_num = r_i + 1
            first_coil = r_coils[0]
            check_ts = max(f_start, first_coil - 3000)
            deaths_at_round = _count_deaths_before(max(f_start, first_coil - 5000))
            for pid in regular_carrier_ids:
                if friendly_ids and pid not in friendly_ids:
                    continue
                if pid in carried_in_round.get(r_num, set()):
                    continue
                # Was player already dead before this egg round's pickup window closed?
                p_deaths = deaths_by_player.get(pid, [])
                was_dead = any(dts < check_ts for dts in p_deaths)
                rel_ms = max(0, first_coil - f_start)
                carrier_events.append(
                    {
                        "id": f"{report_code}-{fid}-{pid}-r{r_num}-miss",
                        "pull_num": pull_idx,
                        "fight_id": fid,
                        "is_kill": is_kill,
                        "round_num": r_num,
                        "player": actors[pid]["name"],
                        "class": actors[pid].get("subType", ""),
                        "target_id": pid,
                        "is_regular": True,
                        "all_regulars_alive_at_pickup": None,
                        "dead_regulars_at_pickup": [],
                        "status": "missed_dead" if was_dead else "missed_alive",
                        "break_reason": "missed_dead" if was_dead else "missed_alive",
                        "player_was_dead": was_dead,
                        "pickup_rel_time": "—",
                        "pickup_rel_ms": rel_ms,
                        "end_rel_time": "—",
                        "end_rel_ms": rel_ms,
                        "break_rel_time": format_rel_time(rel_ms),
                        "timestamp": first_coil,
                        "duration_ms": 0,
                        "held_before_break_ms": 0,
                        "post_break_ms": 0,
                        "total_shell_dmg": 0,
                        "pre_dmg_sec": [],
                        "post_break_dmg": 0,
                        "deaths_before": deaths_at_round,
                        "events_url": build_events_url(report_code, fid, pid, first_coil, f_start, f_end, window_ms=8000),
                        "replay_url": build_replay_url(report_code, fid, max(0, rel_ms - 8000)),
                    }
                )

    carrier_events.sort(key=lambda x: (x["pull_num"], x["round_num"], x["timestamp"], x["player"]))
    return regular_carrier_names, carrier_events


def analyze_report_events(
    meta: dict[str, Any],
    fights: list[dict[str, Any]],
    actors: dict[int, dict[str, Any]],
    abilities: dict[int, str],
    events_by_fight: dict[int, list[dict[str, Any]]],
    report_code: str,
    label: str | None = None,
    encounter_id: int = ULATEK_ENCOUNTER_ID,
    difficulty: int = MYTHIC_DIFFICULTY,
    extra_tables: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run complete Ula'tek Mythic analysis across all fights in a report."""
    sorted_fights = sorted(fights, key=lambda f: f["startTime"])
    tank_ids = _detect_tanks(actors, events_by_fight)
    tank_id_set = set(tank_ids)
    player_known_defs = _build_player_known_defs(actors, abilities, events_by_fight)
    player_interrupts = _build_player_interrupts(actors, abilities, events_by_fight, tank_id_set)
    extra = extra_tables or {}
    ability_schools: dict[int, int] = {
        int(k): int(v) for k, v in (extra.get("ability_schools") or {}).items()
    }
    heart_windows_by_fight: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for hw in extra.get("heart_windows") or []:
        heart_windows_by_fight[int(hw["fight_id"])].append(hw)
    warden_dmg_by_fight: dict[int, dict[int, int]] = {
        int(fid): {int(pid): int(val) for pid, val in pmap.items()}
        for fid, pmap in (extra.get("warden_dmg_by_fight") or {}).items()
    }
    p3_boss_dmg_by_fight: dict[int, dict[int, int]] = {
        int(fid): {int(pid): int(val) for pid, val in pmap.items()}
        for fid, pmap in (extra.get("p3_boss_dmg_by_fight") or {}).items()
    }

    pulls_out: list[dict[str, Any]] = []
    egg_fails: list[dict[str, Any]] = []
    wave_fails: list[dict[str, Any]] = []
    tank_fails: list[dict[str, Any]] = []
    defensive_events: list[dict[str, Any]] = []
    consumable_usage: list[dict[str, Any]] = []
    heart_phases: list[dict[str, Any]] = []
    phase_events: list[dict[str, Any]] = []
    warden_summaries: list[dict[str, Any]] = []
    p3_summaries: list[dict[str, Any]] = []
    removal_summary: Counter[str] = Counter()
    player_pulls_present: Counter[int] = Counter()

    for pull_idx, fight in enumerate(sorted_fights, start=1):
        fid = int(fight["id"])
        f_start = int(fight["startTime"])
        f_end = int(fight["endTime"])
        is_kill = bool(fight.get("kill", False))
        fevs = sorted(events_by_fight.get(fid, []), key=lambda e: int(e["timestamp"]))

        # Track players active in this fight (prefer WCL friendlyPlayers if provided)
        fight_players: set[int] = set()
        for pid in fight.get("friendlyPlayers") or []:
            if pid in actors and actors[pid].get("type") == "Player":
                fight_players.add(int(pid))
        player_deaths: list[tuple[int, int, dict[str, Any]]] = []
        deaths_by_player: dict[int, list[int]] = defaultdict(list)
        seen_death_keys: set[tuple[int, int]] = set()

        for ev in fevs:
            for key in ("sourceID", "targetID"):
                aid_actor = ev.get(key)
                if aid_actor in actors and actors[aid_actor].get("type") == "Player":
                    fight_players.add(aid_actor)
            if ev.get("type") == "death":
                tid = ev.get("targetID")
                if tid in actors and actors[tid].get("type") == "Player":
                    ts = int(ev["timestamp"])
                    dkey = (tid, ts)
                    if dkey not in seen_death_keys:
                        seen_death_keys.add(dkey)
                        player_deaths.append((ts, tid, ev))
                        deaths_by_player[tid].append(ts)

        for pid in fight_players:
            player_pulls_present[pid] += 1

        def count_deaths_before(ts: int) -> int:
            return sum(1 for dts, _, _ in player_deaths if dts < ts)

        # ---- 1. Index events for Egg Fails & Wave Fails ----
        coils_casts: list[int] = []
        coils_dmg_by_p: dict[int, list[int]] = defaultdict(list)
        cw_hits_by_p: dict[int, list[dict[str, Any]]] = defaultdict(list)
        splash_by_p: dict[int, list[dict[str, Any]]] = defaultdict(list)
        other_boss_dmg_by_p: dict[int, list[tuple[int, str]]] = defaultdict(list)
        constrictor_by_p: dict[int, list[int]] = defaultdict(list)
        putrid_by_p: dict[int, list[int]] = defaultdict(list)
        rancid_by_p: dict[int, list[int]] = defaultdict(list)
        shell_removes: list[dict[str, Any]] = []

        PASSIVE_NON_SHELL_BREAK_DMG = {
            SPELL_NOXIOUS_SPLASH,
            SPELL_NOXIOUS_SHELL_DMG,
            SPELL_CAUSTIC_WAVES,
            SPELL_NECROTIC_VAPORS,
            SPELL_PUTRID_MEMBRANE_DMG,
            SPELL_STONE_VENOM_DMG,
        }

        # Track consumables & active defensive buffs across the fight
        pot_counts: Counter[int] = Counter()
        hs_counts: Counter[int] = Counter()
        def_cd_casts: Counter[int] = Counter()

        # Pre-scan Healing Potion & Healthstone cast timestamps so <35% drops can detect immediate reactions (+3.5s)
        pot_cast_ts_by_p: dict[int, list[int]] = defaultdict(list)
        hs_cast_ts_by_p: dict[int, list[int]] = defaultdict(list)
        for ev in fevs:
            if ev.get("type") != "cast":
                continue
            esrc = ev.get("sourceID")
            etid = ev.get("targetID")
            actor_id = esrc if esrc in actors and actors[esrc].get("type") == "Player" else etid
            if actor_id not in actors or actors[actor_id].get("type") != "Player":
                continue
            eaid = ev.get("abilityGameID")
            eab = abilities.get(eaid, "")
            ets = int(ev["timestamp"])
            if is_health_potion(eaid, eab):
                pot_cast_ts_by_p[actor_id].append(ets)
            elif is_healthstone(eaid, eab):
                hs_cast_ts_by_p[actor_id].append(ets)

        # Cooldown readiness state per player inside this fight
        last_def_used_ts: dict[int, dict[str, int]] = defaultdict(dict)
        last_pot_ts: dict[int, int] = {}
        last_hs_ts: dict[int, tuple[int, bool]] = {}
        seen_def_death_keys: set[tuple[int, int]] = set()

        # Also track active defensive buff intervals per player via single pass
        active_tank_defs: dict[int, set[str]] = defaultdict(set)
        active_all_defs: dict[int, set[str]] = defaultdict(set)

        # Heart Phase & P2/P3 tracking per fight
        debris_hits_in_fight: list[tuple[int, int]] = []  # (player_id, ts)
        fang_breaks: list[tuple[int, int]] = []  # (ts, player_id)
        malice_missed_casts: list[tuple[int, int, str, list[dict[str, str]], list[dict[str, str]]]] = []
        last_malice_miss_by_inst: dict[int, int] = {}
        malice_dmg_events: list[tuple[int, int]] = []  # (ts, amount)
        vicious_missed_casts: list[tuple[int, list[dict[str, str]], list[dict[str, str]]]] = []
        last_vicious_miss_ts = -999999
        warden_death_ts: list[int] = []
        last_kick_ts: dict[int, int] = {}
        last_player_activity_ts: dict[int, int] = {}

        # Pre-scan P2 Doomscale Warden damage & interrupts per instance -> exact Side 1 vs Side 2 player mapping
        warden_dmg_by_inst: dict[int, Counter[int]] = defaultdict(Counter)
        for ev in fevs:
            et = ev.get("type")
            esrc = ev.get("sourceID")
            etgt = ev.get("targetID")
            if esrc not in actors or actors[esrc].get("type") != "Player":
                continue
            if etgt in actors and actors[etgt].get("name") == "Doomscale Warden":
                inst = int(ev.get("targetInstance") or 1)
                if et == "damage":
                    warden_dmg_by_inst[inst][esrc] += max(1, int(ev.get("amount", 0) or 0))
                elif et == "interrupt":
                    warden_dmg_by_inst[inst][esrc] += 1000

        side_players: dict[int, set[int]] = defaultdict(set)
        all_warden_players: set[int] = set()
        for inst, pmap in warden_dmg_by_inst.items():
            all_warden_players.update(pmap.keys())
        for pid in all_warden_players:
            best_inst = max(warden_dmg_by_inst.keys(), key=lambda i: warden_dmg_by_inst[i].get(pid, 0))
            if warden_dmg_by_inst[best_inst].get(pid, 0) > 0:
                side_players[best_inst].add(pid)

        inst_to_side: dict[int, str] = {}
        inst_to_side_tank_class: dict[int, str] = {}
        for inst in sorted(warden_dmg_by_inst.keys()):
            side_tanks = [tk for tk in tank_ids if tk in side_players[inst]]
            if side_tanks:
                inst_to_side[inst] = f"{actors[side_tanks[0]]['name']} Seite"
                inst_to_side_tank_class[inst] = actors[side_tanks[0]].get("subType", "")
            else:
                inst_to_side[inst] = f"Warden #{inst}"
                inst_to_side_tank_class[inst] = ""

        def compute_kick_readiness(
            candidate_pids: set[int], ts_now: int
        ) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
            rdy_list: list[dict[str, str]] = []
            cd_list: list[dict[str, str]] = []
            for pid in sorted(candidate_pids, key=lambda x: actors[x]["name"]):
                if pid not in player_interrupts:
                    continue
                # Skip players who are currently dead (died before ts_now and no activity after death)
                prev_deaths = [dt for dt in deaths_by_player.get(pid, []) if dt < ts_now]
                if prev_deaths:
                    last_dt = max(prev_deaths)
                    if last_player_activity_ts.get(pid, -1) <= last_dt:
                        continue
                sp_name, cd_ms = player_interrupts[pid]
                entry = {"player": actors[pid]["name"], "class": actors[pid].get("subType", ""), "spell": sp_name}
                used_at = last_kick_ts.get(pid)
                if used_at is None or (ts_now - used_at) >= cd_ms:
                    rdy_list.append(entry)
                else:
                    cd_list.append(entry)
            return rdy_list, cd_list

        def compute_readiness(
            pid: int, ts_now: int, dmg_school: str = "all"
        ) -> tuple[list[str], bool, bool, bool]:
            active_low = {n.lower() for n in active_all_defs[pid]}
            ready: list[str] = []
            for low_name, disp_name in player_known_defs.get(pid, {}).items():
                if low_name in active_low:
                    continue
                if not defensive_mitigates(disp_name, dmg_school):
                    continue
                used_at = last_def_used_ts[pid].get(low_name)
                if used_at is None or (ts_now - used_at) >= get_defensive_cooldown_ms(low_name):
                    ready.append(disp_name)
            ready.sort()
            pot_used_at = last_pot_ts.get(pid)
            pot_rdy = (pot_used_at is None) or ((ts_now - pot_used_at) >= HEALTH_POTION_CD_SEC * 1000)
            hs_info = last_hs_ts.get(pid)
            if hs_info is None:
                hs_rdy = True
            else:
                hs_used_at, is_demonic_hs = hs_info
                hs_rdy = is_demonic_hs and ((ts_now - hs_used_at) >= DEMONIC_HEALTHSTONE_CD_SEC * 1000)
            return ready, pot_rdy, hs_rdy, (bool(ready) or pot_rdy or hs_rdy)

        # Track Stone Venom Boss-Cast burst windows per tank (Mother's Wrath cast + max 5s!)
        sv_burst_start: dict[int, int] = {}
        sv_burst_end: dict[int, int] = {}
        sv_stacks: dict[int, int] = defaultdict(int)
        sv_window_fail: dict[int, dict[str, Any] | None] = defaultdict(lambda: None)

        # Track last Ula'tek tanking event timestamp per tank (Melee or Stone Venom)
        last_boss_tank_ts: dict[int, int] = {}

        # Track low-HP spike cooldown per player (dedupe within 4000ms per spike)
        last_spike_event_ts: dict[int, int] = {}

        # Track which CW event timestamps broke a Noxious Shell (filled after shell pass)
        cw_broke_shell_keys: set[tuple[int, int]] = set()

        def _finalize_sv_fail(tk_id: int) -> None:
            pending = sv_window_fail[tk_id]
            b_start = sv_burst_start.pop(tk_id, None)
            b_end = sv_burst_end.pop(tk_id, None)
            if pending is None:
                return
            window_start = b_start if b_start is not None else pending["timestamp"]
            window_end = (b_end if b_end is not None else pending["timestamp"]) + 5000
            matched_death = None
            for dts, dtid, dev in player_deaths:
                if dtid == tk_id and window_start <= dts <= window_end:
                    matched_death = (dts, dev)
                    break
            if matched_death is not None:
                dts, dev = matched_death
                kaid = dev.get("killingAbilityGameID")
                pending["lethal"] = True
                pending["death_rel_time"] = format_rel_time(dts - f_start)
                pending["death_ability"] = abilities.get(kaid, str(kaid)) if kaid else "Unbekannt"
            else:
                pending["lethal"] = False
                pending["death_rel_time"] = None
                pending["death_ability"] = None
            tank_fails.append(pending)
            sv_window_fail[tk_id] = None

        for ev in fevs:
            t = ev.get("type")
            aid = ev.get("abilityGameID")
            ab_name = abilities.get(aid, "")
            src_id = ev.get("sourceID")
            tid = ev.get("targetID")
            ts = int(ev["timestamp"])

            if aid == SPELL_SPECTRAL_COILS_CAST and t == "cast":
                coils_casts.append(ts)
            elif aid == SPELL_SPECTRAL_COILS_DMG and t == "damage":
                if tid in actors and actors[tid].get("type") == "Player":
                    coils_dmg_by_p[tid].append(ts)
            elif aid == SPELL_CAUSTIC_WAVES and t == "damage" and not ev.get("tick"):
                if tid in actors and actors[tid].get("type") == "Player":
                    cw_hits_by_p[tid].append(ev)
            elif aid == SPELL_NOXIOUS_SPLASH and t == "damage":
                if tid in actors and actors[tid].get("type") == "Player":
                    splash_by_p[tid].append(ev)
            elif (
                t == "damage"
                and not ev.get("tick")
                and tid in actors
                and actors[tid].get("type") == "Player"
                and src_id != tid
                and aid not in PASSIVE_NON_SHELL_BREAK_DMG
                and aid != SPELL_SPECTRAL_COILS_DMG
            ):
                other_boss_dmg_by_p[tid].append((ts, ab_name or str(aid)))
            elif aid == SPELL_SOUL_CONSTRICTOR and t == "applydebuff":
                constrictor_by_p[tid].append(ts)
            elif aid == SPELL_PUTRID_MEMBRANE_DEBUFF and t in ("applydebuff", "applydebuffstack"):
                putrid_by_p[tid].append(ts)
            elif aid == SPELL_RANCID_YOLK and t == "applydebuff":
                rancid_by_p[tid].append(ts)
            elif aid == SPELL_NOXIOUS_SHELL_DEBUFF and t == "removedebuff":
                shell_removes.append(ev)

            # Consumables (cast or heal)
            if t in ("cast", "heal"):
                actor_id = src_id if src_id in actors and actors[src_id].get("type") == "Player" else tid
                if actor_id in actors and actors[actor_id].get("type") == "Player":
                    if t == "cast" and is_health_potion(aid, ab_name):
                        pot_counts[actor_id] += 1
                        last_pot_ts[actor_id] = ts
                    elif t == "cast" and is_healthstone(aid, ab_name):
                        hs_counts[actor_id] += 1
                        is_dem = aid == DEMONIC_HEALTHSTONE_ID or "demonic" in (ab_name or "").lower()
                        last_hs_ts[actor_id] = (ts, is_dem)

            # Defensive buff state machine
            if tid in actors and actors[tid].get("type") == "Player":
                if t in ("applybuff", "refreshbuff", "applybuffstack"):
                    if is_defensive_buff(ab_name, for_tank_stone_venom=False):
                        if ab_name not in active_all_defs[tid]:
                            def_cd_casts[tid] += 1
                            if is_trackable_personal_def(ab_name):
                                last_def_used_ts[tid][ab_name.lower()] = ts
                        active_all_defs[tid].add(ab_name)
                    if is_defensive_buff(ab_name, for_tank_stone_venom=True):
                        active_tank_defs[tid].add(ab_name)
                elif t == "removebuff":
                    active_all_defs[tid].discard(ab_name)
                    active_tank_defs[tid].discard(ab_name)
            if t == "cast" and src_id in actors and actors[src_id].get("type") == "Player":
                if is_trackable_personal_def(ab_name):
                    last_def_used_ts[src_id][ab_name.lower()] = ts

            # Heart Phase & P2 / P3 event capture
            ab_low = (ab_name or "").strip().lower()
            if t == "damage" and not ev.get("tick") and tid in actors and actors[tid].get("type") == "Player":
                if aid == SPELL_FALLING_DEBRIS:
                    debris_hits_in_fight.append((tid, ts))
                    rel_ms = ts - f_start
                    ovk = int(ev.get("overkill", 0) or 0)
                    phase_events.append(
                        {
                            "id": f"{report_code}-{fid}-{tid}-{ts}-debris",
                            "kind": "falling_debris",
                            "phase": "heart",
                            "player": actors[tid]["name"],
                            "class": actors[tid].get("subType", ""),
                            "target_id": tid,
                            "ability": ab_name or "Falling Debris",
                            "detail": None,
                            "gap_ms": None,
                            "damage": int(ev.get("amount", 0) or 0),
                            "lethal": ovk > 0 or any(abs(dt - ts) <= 50 for dt in deaths_by_player[tid]),
                            "pull_num": pull_idx,
                            "fight_id": fid,
                            "is_kill": is_kill,
                            "rel_time": format_rel_time(rel_ms),
                            "rel_ms": rel_ms,
                            "timestamp": ts,
                            "deaths_before": count_deaths_before(ts),
                            "events_url": build_events_url(report_code, fid, tid, ts, f_start, f_end),
                            "replay_url": build_replay_url(report_code, fid, rel_ms),
                        }
                    )
                elif aid in P2_AVOIDABLE_IDS:
                    rel_ms = ts - f_start
                    ovk = int(ev.get("overkill", 0) or 0)
                    phase_events.append(
                        {
                            "id": f"{report_code}-{fid}-{tid}-{ts}-p2av-{aid}",
                            "kind": "p2_avoidable",
                            "phase": "p2",
                            "player": actors[tid]["name"],
                            "class": actors[tid].get("subType", ""),
                            "target_id": tid,
                            "ability": ab_name or str(aid),
                            "detail": None,
                            "gap_ms": None,
                            "damage": int(ev.get("amount", 0) or 0),
                            "lethal": ovk > 0 or any(abs(dt - ts) <= 50 for dt in deaths_by_player[tid]),
                            "pull_num": pull_idx,
                            "fight_id": fid,
                            "is_kill": is_kill,
                            "rel_time": format_rel_time(rel_ms),
                            "rel_ms": rel_ms,
                            "timestamp": ts,
                            "deaths_before": count_deaths_before(ts),
                            "events_url": build_events_url(report_code, fid, tid, ts, f_start, f_end),
                            "replay_url": build_replay_url(report_code, fid, rel_ms),
                        }
                    )
                elif any(s in ab_low for s in P3_AVOIDABLE_SPELL_NAMES):
                    rel_ms = ts - f_start
                    ovk = int(ev.get("overkill", 0) or 0)
                    phase_events.append(
                        {
                            "id": f"{report_code}-{fid}-{tid}-{ts}-p3av-{aid}",
                            "kind": "p3_avoidable",
                            "phase": "p3",
                            "player": actors[tid]["name"],
                            "class": actors[tid].get("subType", ""),
                            "target_id": tid,
                            "ability": ab_name or str(aid),
                            "detail": None,
                            "gap_ms": None,
                            "damage": int(ev.get("amount", 0) or 0),
                            "lethal": ovk > 0 or any(abs(dt - ts) <= 50 for dt in deaths_by_player[tid]),
                            "pull_num": pull_idx,
                            "fight_id": fid,
                            "is_kill": is_kill,
                            "rel_time": format_rel_time(rel_ms),
                            "rel_ms": rel_ms,
                            "timestamp": ts,
                            "deaths_before": count_deaths_before(ts),
                            "events_url": build_events_url(report_code, fid, tid, ts, f_start, f_end),
                            "replay_url": build_replay_url(report_code, fid, rel_ms),
                        }
                    )
                elif aid == SPELL_MALICE_DMG:
                    malice_dmg_events.append((ts, int(ev.get("amount", 0) or 0)))

            if t == "removedebuff" and aid == SPELL_GRASPING_FANGS_DEBUFF and tid in actors and actors[tid].get("type") == "Player":
                if not any(-100 <= dt - ts <= 150 for dt in deaths_by_player[tid]):
                    fang_breaks.append((ts, tid))

            if src_id in actors and actors[src_id].get("type") == "Player" and t in ("damage", "cast", "interrupt", "heal"):
                last_player_activity_ts[src_id] = ts

            if t == "interrupt" and src_id in actors and actors[src_id].get("type") == "Player":
                last_kick_ts[src_id] = ts
                ex_aid = ev.get("extraAbilityGameID")
                ex_name = (abilities.get(ex_aid, "") or "").strip()
                ex_low = ex_name.lower()
                if ex_aid == SPELL_MALICE_CAST or "malice" in ex_low:
                    rel_ms = ts - f_start
                    t_inst = int(ev.get("targetInstance") or 1)
                    side_label = inst_to_side.get(t_inst, f"Warden #{t_inst}")
                    side_t_cls = inst_to_side_tank_class.get(t_inst, "")
                    other_side_pids = {p for p in side_players.get(t_inst, set()) if p != src_id}
                    rdy_other, cd_other = compute_kick_readiness(other_side_pids, ts)
                    phase_events.append(
                        {
                            "id": f"{report_code}-{fid}-{src_id}-{ts}-mkick",
                            "kind": "malice_kick",
                            "phase": "p2",
                            "side": side_label,
                            "side_tank_class": side_t_cls,
                            "player": actors[src_id]["name"],
                            "class": actors[src_id].get("subType", ""),
                            "target_id": src_id,
                            "ability": ex_name or "Malice",
                            "detail": ab_name or "Interrupt",
                            "ready_kickers": rdy_other,
                            "on_cd_kickers": cd_other,
                            "gap_ms": None,
                            "damage": 0,
                            "lethal": False,
                            "pull_num": pull_idx,
                            "fight_id": fid,
                            "is_kill": is_kill,
                            "rel_time": format_rel_time(rel_ms),
                            "rel_ms": rel_ms,
                            "timestamp": ts,
                            "deaths_before": count_deaths_before(ts),
                            "events_url": build_events_url(report_code, fid, src_id, ts, f_start, f_end),
                            "replay_url": build_replay_url(report_code, fid, rel_ms),
                        }
                    )
                elif any(s in ex_low for s in P3_KICK_SPELL_NAMES):
                    rel_ms = ts - f_start
                    other_pids = {p for p in fight_players if p != src_id}
                    rdy_other, cd_other = compute_kick_readiness(other_pids, ts)
                    phase_events.append(
                        {
                            "id": f"{report_code}-{fid}-{src_id}-{ts}-vkick",
                            "kind": "vicious_echoes_kick",
                            "phase": "p3",
                            "side": "Phase 3",
                            "side_tank_class": "",
                            "player": actors[src_id]["name"],
                            "class": actors[src_id].get("subType", ""),
                            "target_id": src_id,
                            "ability": ex_name or "Vicious Echoes",
                            "detail": ab_name or "Interrupt",
                            "ready_kickers": rdy_other,
                            "on_cd_kickers": cd_other,
                            "gap_ms": None,
                            "damage": 0,
                            "lethal": False,
                            "pull_num": pull_idx,
                            "fight_id": fid,
                            "is_kill": is_kill,
                            "rel_time": format_rel_time(rel_ms),
                            "rel_ms": rel_ms,
                            "timestamp": ts,
                            "deaths_before": count_deaths_before(ts),
                            "events_url": build_events_url(report_code, fid, src_id, ts, f_start, f_end),
                            "replay_url": build_replay_url(report_code, fid, rel_ms),
                        }
                    )

            if t == "cast":
                if src_id in actors and actors[src_id].get("type") == "Player" and is_interrupt_spell(ab_name):
                    last_kick_ts[src_id] = ts
                if aid == SPELL_MALICE_CAST:
                    s_inst = int(ev.get("sourceInstance") or 1)
                    if (ts - last_malice_miss_by_inst.get(s_inst, -999999)) >= 2500:
                        last_malice_miss_by_inst[s_inst] = ts
                        side_label = inst_to_side.get(s_inst, f"Warden #{s_inst}")
                        rdy_k, cd_k = compute_kick_readiness(side_players.get(s_inst, set()), ts)
                        malice_missed_casts.append((ts, s_inst, side_label, rdy_k, cd_k))
                elif any(s in ab_low for s in P3_KICK_SPELL_NAMES):
                    if (ts - last_vicious_miss_ts) >= 2500:
                        last_vicious_miss_ts = ts
                        rdy_k, cd_k = compute_kick_readiness(fight_players, ts)
                        vicious_missed_casts.append((ts, rdy_k, cd_k))

            if t == "death" and tid in actors and actors[tid].get("name") == "Doomscale Warden":
                warden_death_ts.append(ts)

            # Boss tank tracking (Ula'tek Melee or Stone Venom on tank)
            if tid in tank_id_set:
                src_name = actors.get(src_id, {}).get("name", "")
                if (t == "damage" and aid == SPELL_MELEE and src_name == "Ula'tek") or aid in (
                    SPELL_STONE_VENOM_DEBUFF,
                    SPELL_STONE_VENOM_DMG,
                ):
                    last_boss_tank_ts[tid] = ts

            # Stone Venom Boss-Cast burst window (Mother's Wrath stack application + max 5s!)
            is_sv_stack_event = (
                tid in tank_id_set
                and (
                    (aid == SPELL_STONE_VENOM_DEBUFF and t in ("applydebuff", "applydebuffstack"))
                    or (aid == SPELL_MOTHERS_WRATH_DMG and t == "damage")
                )
            )
            if is_sv_stack_event:
                if tid in sv_burst_end and (ts - sv_burst_end[tid]) > 3000:
                    _finalize_sv_fail(tid)
                if tid not in sv_burst_start:
                    sv_burst_start[tid] = ts
                    sv_burst_end[tid] = ts
                    sv_window_fail[tid] = None
                    if aid == SPELL_STONE_VENOM_DEBUFF:
                        sv_stacks[tid] = int(ev.get("stack", 1))
                else:
                    sv_burst_end[tid] = ts
                    if aid == SPELL_STONE_VENOM_DEBUFF:
                        if "stack" in ev:
                            sv_stacks[tid] = int(ev["stack"])
                        elif t == "applydebuffstack":
                            sv_stacks[tid] = max(1, sv_stacks[tid] + 1)
                if sv_window_fail[tid] is not None and sv_stacks[tid] > sv_window_fail[tid]["stacks"]:
                    sv_window_fail[tid]["stacks"] = sv_stacks[tid]
            elif tid in tank_id_set and aid == SPELL_STONE_VENOM_DEBUFF and t == "removedebuff":
                sv_stacks[tid] = 0

            if tid in tank_id_set and tid in sv_burst_end and t == "damage":
                if ts > sv_burst_end[tid] + 5000:
                    _finalize_sv_fail(tid)
                else:
                    hp = ev.get("hitPoints")
                    mhp = ev.get("maxHitPoints")
                    if hp is not None and mhp and mhp > 0:
                        hp_pct = round((hp / mhp) * 100.0, 1)
                        dmg_school = infer_damage_school(aid, ability_schools)
                        mitigating_tank_defs = [
                            d for d in active_tank_defs[tid] if defensive_mitigates(d, dmg_school)
                        ]
                        if hp_pct < 30.0 and not mitigating_tank_defs:
                            rel_ms = ts - f_start
                            cur_fail = sv_window_fail[tid]
                            if cur_fail is None:
                                other_tanks = [actors[ot]["name"] for ot in tank_ids if ot != tid]
                                r_defs, r_pot, r_hs, r_any = compute_readiness(tid, ts, dmg_school)
                                sv_window_fail[tid] = {
                                    "id": f"{report_code}-{fid}-{tid}-{ts}-sv",
                                    "kind": "stone_venom_no_def",
                                    "tank": actors[tid]["name"],
                                    "tank_class": actors[tid].get("subType", ""),
                                    "tank_id": tid,
                                    "victim": None,
                                    "victim_class": None,
                                    "other_tank": other_tanks[0] if other_tanks else None,
                                    "tank_was_dead": False,
                                    "min_hp_pct": hp_pct,
                                    "stacks": max(1, sv_stacks[tid]),
                                    "lethal": False,
                                    "death_rel_time": None,
                                    "death_ability": None,
                                    "ready_defs": r_defs,
                                    "pot_ready": r_pot,
                                    "hs_ready": r_hs,
                                    "any_ready": r_any,
                                    "pull_num": pull_idx,
                                    "fight_id": fid,
                                    "is_kill": is_kill,
                                    "rel_time": format_rel_time(rel_ms),
                                    "rel_ms": rel_ms,
                                    "timestamp": ts,
                                    "deaths_before": count_deaths_before(ts),
                                    "events_url": build_events_url(report_code, fid, tid, ts, f_start, f_end),
                                    "replay_url": build_replay_url(report_code, fid, rel_ms),
                                }
                            else:
                                if hp_pct < cur_fail["min_hp_pct"]:
                                    cur_fail["min_hp_pct"] = hp_pct
                                if sv_stacks[tid] > cur_fail["stacks"]:
                                    cur_fail["stacks"] = sv_stacks[tid]

            # Tentacle aggro fail: non-tank killed by Gore Rattle Melee (1) ONLY!
            if t == "death" and tid in actors and actors[tid].get("type") == "Player":
                kid = ev.get("killerID")
                killer_name = actors.get(kid, {}).get("name", "")
                kaid = ev.get("killingAbilityGameID")
                if killer_name == "Gore Rattle" and kaid == SPELL_MELEE and tid not in tank_id_set:
                    # Determine which tank was on Ula'tek (boss tank) -> the other tank failed tentacle aggro
                    boss_tank_id = None
                    best_boss_ts = -1
                    for tk in tank_ids:
                        bts = last_boss_tank_ts.get(tk, -1)
                        if bts >= ts - 8000 and bts > best_boss_ts:
                            best_boss_ts = bts
                            boss_tank_id = tk
                    if boss_tank_id is not None and len(tank_ids) >= 2:
                        failed_tank_id = next(tk for tk in tank_ids if tk != boss_tank_id)
                        other_tank_id = boss_tank_id
                    elif tank_ids:
                        failed_tank_id = tank_ids[0]
                        other_tank_id = tank_ids[1] if len(tank_ids) > 1 else None
                    else:
                        failed_tank_id = None
                        other_tank_id = None

                    tank_was_dead = False
                    if failed_tank_id is not None:
                        tank_was_dead = any(dts < ts for dts in deaths_by_player.get(failed_tank_id, []))

                    # If the responsible tank was already dead, this is not a tank fail
                    if not tank_was_dead:
                        rel_ms = ts - f_start
                        tank_fails.append(
                            {
                                "id": f"{report_code}-{fid}-{tid}-{ts}-ta",
                                "kind": "tentacle_aggro",
                                "tank": actors[failed_tank_id]["name"] if failed_tank_id else "Unbekannt",
                                "tank_class": actors[failed_tank_id].get("subType", "") if failed_tank_id else "",
                                "tank_id": failed_tank_id or 0,
                                "victim": actors[tid]["name"],
                                "victim_class": actors[tid].get("subType", ""),
                                "other_tank": actors[other_tank_id]["name"] if other_tank_id else None,
                                "tank_was_dead": False,
                                "min_hp_pct": None,
                                "stacks": None,
                                "lethal": True,
                                "death_rel_time": format_rel_time(rel_ms),
                                "death_ability": "Gore Rattle Melee",
                                "ready_defs": [],
                                "pot_ready": False,
                                "hs_ready": False,
                                "any_ready": False,
                                "pull_num": pull_idx,
                                "fight_id": fid,
                                "is_kill": is_kill,
                                "rel_time": format_rel_time(rel_ms),
                                "rel_ms": rel_ms,
                                "timestamp": ts,
                                "deaths_before": count_deaths_before(ts),
                                "events_url": build_events_url(report_code, fid, tid, ts, f_start, f_end),
                                "replay_url": build_replay_url(report_code, fid, rel_ms),
                            }
                        )

            # Defensive / Low-HP spike & Death tracking
            if tid in actors and actors[tid].get("type") == "Player":
                if t == "damage" and aid in RAID_SPIKE_ABILITY_IDS and not ev.get("tick"):
                    hp = ev.get("hitPoints")
                    mhp = ev.get("maxHitPoints")
                    if hp is not None and mhp and mhp > 0:
                        hp_pct = round((hp / mhp) * 100.0, 1)
                        if 0.0 < hp_pct < 35.0 and (ts - last_spike_event_ts.get(tid, -999999)) >= 4000:
                            last_spike_event_ts[tid] = ts
                            rel_ms = ts - f_start
                            dmg_school = infer_damage_school(aid, ability_schools)
                            defs_now = sorted(
                                d for d in active_all_defs[tid] if defensive_mitigates(d, dmg_school)
                            )
                            r_defs, r_pot, r_hs, _r_any = compute_readiness(tid, ts, dmg_school)
                            used_pot_here = any(ts - 1500 <= pts <= ts + 3500 for pts in pot_cast_ts_by_p[tid])
                            used_hs_here = any(ts - 1500 <= hts <= ts + 3500 for hts in hs_cast_ts_by_p[tid])
                            used_any_here = bool(defs_now) or used_pot_here or used_hs_here
                            pot_rdy_eff = r_pot and not used_pot_here
                            hs_rdy_eff = r_hs and not used_hs_here
                            any_rdy_eff = bool(r_defs) or pot_rdy_eff or hs_rdy_eff
                            defensive_events.append(
                                {
                                    "id": f"{report_code}-{fid}-{tid}-{ts}-sp",
                                    "kind": "low_hp_spike",
                                    "player": actors[tid]["name"],
                                    "class": actors[tid].get("subType", ""),
                                    "target_id": tid,
                                    "pull_num": pull_idx,
                                    "fight_id": fid,
                                    "is_kill": is_kill,
                                    "rel_time": format_rel_time(rel_ms),
                                    "rel_ms": rel_ms,
                                    "timestamp": ts,
                                    "deaths_before": count_deaths_before(ts),
                                    "trigger_ability": ab_name or str(aid),
                                    "hp_pct": hp_pct,
                                    "had_def_cd": bool(defs_now),
                                    "active_defs": defs_now,
                                    "used_pot_here": used_pot_here,
                                    "used_hs_here": used_hs_here,
                                    "used_any_here": used_any_here,
                                    "ready_defs": r_defs,
                                    "pot_ready": pot_rdy_eff,
                                    "hs_ready": hs_rdy_eff,
                                    "any_ready": any_rdy_eff,
                                    "pot_used_in_pull": pot_counts[tid] > 0,
                                    "hs_used_in_pull": hs_counts[tid] > 0,
                                    "events_url": build_events_url(report_code, fid, tid, ts, f_start, f_end),
                                    "replay_url": build_replay_url(report_code, fid, rel_ms),
                                }
                            )
                elif t == "death":
                    dkey = (tid, ts)
                    if dkey in seen_def_death_keys:
                        continue
                    seen_def_death_keys.add(dkey)
                    rel_ms = ts - f_start
                    kaid = ev.get("killingAbilityGameID")
                    kab_name = abilities.get(kaid, str(kaid)) if kaid else "Unbekannt"
                    if is_avoidable_defensive_death(kaid, kab_name):
                        continue
                    dmg_school = infer_damage_school(kaid, ability_schools)
                    defs_now = sorted(
                        d for d in active_all_defs[tid] if defensive_mitigates(d, dmg_school)
                    )
                    r_defs, r_pot, r_hs, _r_any = compute_readiness(tid, ts, dmg_school)
                    used_pot_here = any(ts - 3500 <= pts <= ts for pts in pot_cast_ts_by_p[tid])
                    used_hs_here = any(ts - 3500 <= hts <= ts for hts in hs_cast_ts_by_p[tid])
                    used_any_here = bool(defs_now) or used_pot_here or used_hs_here
                    pot_rdy_eff = r_pot and not used_pot_here
                    hs_rdy_eff = r_hs and not used_hs_here
                    any_rdy_eff = bool(r_defs) or pot_rdy_eff or hs_rdy_eff
                    defensive_events.append(
                        {
                            "id": f"{report_code}-{fid}-{tid}-{ts}-dt",
                            "kind": "death",
                            "player": actors[tid]["name"],
                            "class": actors[tid].get("subType", ""),
                            "target_id": tid,
                            "pull_num": pull_idx,
                            "fight_id": fid,
                            "is_kill": is_kill,
                            "rel_time": format_rel_time(rel_ms),
                            "rel_ms": rel_ms,
                            "timestamp": ts,
                            "deaths_before": count_deaths_before(ts),
                            "trigger_ability": kab_name,
                            "hp_pct": 0.0,
                            "had_def_cd": bool(defs_now),
                            "active_defs": defs_now,
                            "used_pot_here": used_pot_here,
                            "used_hs_here": used_hs_here,
                            "used_any_here": used_any_here,
                            "ready_defs": r_defs,
                            "pot_ready": pot_rdy_eff,
                            "hs_ready": hs_rdy_eff,
                            "any_ready": any_rdy_eff,
                            "pot_used_in_pull": pot_counts[tid] > 0,
                            "hs_used_in_pull": hs_counts[tid] > 0,
                            "events_url": build_events_url(report_code, fid, tid, ts, f_start, f_end),
                            "replay_url": build_replay_url(report_code, fid, rel_ms),
                        }
                    )

        # Flush any still-open Stone Venom window at fight end
        for tk in list(sv_window_fail.keys()):
            _finalize_sv_fail(tk)

        # ---- 1b. Finalize P2 / P3 & Heart Phase summaries for this fight ----
        # Blight Vein overlaps (Grasping Fangs broken within <= 2500ms of previous break)
        fang_breaks.sort(key=lambda x: x[0])
        for idx_fb in range(1, len(fang_breaks)):
            prev_ts, prev_pid = fang_breaks[idx_fb - 1]
            cur_ts, cur_pid = fang_breaks[idx_fb]
            gap = cur_ts - prev_ts
            if 0 <= gap <= 2500:
                rel_ms = cur_ts - f_start
                phase_events.append(
                    {
                        "id": f"{report_code}-{fid}-{cur_pid}-{cur_ts}-bvo",
                        "kind": "blight_vein_overlap",
                        "phase": "p2",
                        "player": actors[cur_pid]["name"],
                        "class": actors[cur_pid].get("subType", ""),
                        "target_id": cur_pid,
                        "ability": "Blight Vein Overlap",
                        "detail": actors[prev_pid]["name"],
                        "gap_ms": gap,
                        "damage": 0,
                        "lethal": False,
                        "pull_num": pull_idx,
                        "fight_id": fid,
                        "is_kill": is_kill,
                        "rel_time": format_rel_time(rel_ms),
                        "rel_ms": rel_ms,
                        "timestamp": cur_ts,
                        "deaths_before": count_deaths_before(cur_ts),
                        "events_url": build_events_url(report_code, fid, cur_pid, cur_ts, f_start, f_end),
                        "replay_url": build_replay_url(report_code, fid, rel_ms),
                    }
                )

        # Missed Malice casts (P2)
        for mts, s_inst, side_label, rdy_k, cd_k in malice_missed_casts:
            rel_ms = mts - f_start
            total_malice_dmg = sum(amt for dts, amt in malice_dmg_events if mts <= dts <= mts + 5000)
            phase_events.append(
                {
                    "id": f"{report_code}-{fid}-{mts}-{s_inst}-mmiss",
                    "kind": "malice_missed",
                    "phase": "p2",
                    "side": side_label,
                    "side_tank_class": inst_to_side_tank_class.get(s_inst, ""),
                    "player": f"{side_label} (nicht gekickt)",
                    "class": "",
                    "target_id": 0,
                    "ability": "Malice",
                    "detail": "Cast durchgekommen",
                    "ready_kickers": rdy_k,
                    "on_cd_kickers": cd_k,
                    "gap_ms": None,
                    "damage": total_malice_dmg,
                    "lethal": False,
                    "pull_num": pull_idx,
                    "fight_id": fid,
                    "is_kill": is_kill,
                    "rel_time": format_rel_time(rel_ms),
                    "rel_ms": rel_ms,
                    "timestamp": mts,
                    "deaths_before": count_deaths_before(mts),
                    "events_url": f"https://www.warcraftlogs.com/reports/{report_code}?fight={fid}&type=damage-taken&ability={SPELL_MALICE_DMG}&start={max(f_start, mts - 2000)}&end={min(f_end, mts + 5000)}",
                    "replay_url": build_replay_url(report_code, fid, rel_ms),
                }
            )

        # Missed Vicious Echoes casts (P3)
        for vts, rdy_k, cd_k in vicious_missed_casts:
            rel_ms = vts - f_start
            phase_events.append(
                {
                    "id": f"{report_code}-{fid}-{vts}-vmiss",
                    "kind": "vicious_echoes_missed",
                    "phase": "p3",
                    "side": "Phase 3",
                    "player": "Raid (nicht gekickt)",
                    "class": "",
                    "target_id": 0,
                    "ability": "Vicious Echoes",
                    "detail": "Raid-Stun durchgekommen",
                    "ready_kickers": rdy_k,
                    "on_cd_kickers": cd_k,
                    "gap_ms": None,
                    "damage": 0,
                    "lethal": False,
                    "pull_num": pull_idx,
                    "fight_id": fid,
                    "is_kill": is_kill,
                    "rel_time": format_rel_time(rel_ms),
                    "rel_ms": rel_ms,
                    "timestamp": vts,
                    "deaths_before": count_deaths_before(vts),
                    "events_url": f"https://www.warcraftlogs.com/reports/{report_code}?fight={fid}&type=casts&hostility=1&start={max(f_start, vts - 2000)}&end={min(f_end, vts + 5000)}",
                    "replay_url": build_replay_url(report_code, fid, rel_ms),
                }
            )

        # Heart Phase windows for this fight
        for hw in heart_windows_by_fight.get(fid, []):
            hs = int(hw["start_time"])
            he = int(hw["end_time"])
            win_num = int(hw.get("window_num", 1))
            h_map = {int(k): int(v) for k, v in (hw.get("heart_by_player") or {}).items()}
            b_map = {int(k): int(v) for k, v in (hw.get("boss_by_player") or {}).items()}
            t_map = {int(k): int(v) for k, v in (hw.get("total_by_player") or {}).items()}
            fc_map = {
                int(k): {
                    "ts": int(v["ts"]),
                    "ability_id": int(v.get("ability_id", 0)),
                    "switch_type": str(v.get("switch_type") or "direct"),
                }
                for k, v in (hw.get("first_cast_by_player") or {}).items()
                if int(k) in actors and actors[int(k)].get("type") == "Player"
            }
            first_raid_ts = min((v["ts"] for v in fc_map.values()), default=None)
            first_switch_pid = (
                min(fc_map.keys(), key=lambda p: (fc_map[p]["ts"], actors[p]["name"]))
                if fc_map
                else None
            )
            first_switch_player = actors[first_switch_pid]["name"] if first_switch_pid is not None else None
            first_switch_spell = (
                abilities.get(fc_map[first_switch_pid]["ability_id"], "")
                if first_switch_pid is not None
                else None
            )
            first_switch_rel_time = (
                format_rel_time(max(0, first_raid_ts - f_start)) if first_raid_ts is not None else None
            )

            debris_counts: Counter[int] = Counter(
                dpid for dpid, dts in debris_hits_in_fight if hs - 500 <= dts <= he + 500
            )
            pids = sorted(
                (set(h_map) | set(b_map) | set(t_map) | set(debris_counts) | set(fc_map))
                & {pid for pid, a in actors.items() if a.get("type") == "Player"}
            )
            p_rows: list[dict[str, Any]] = []
            for pid in pids:
                hd = h_map.get(pid, 0)
                bd = b_map.get(pid, 0)
                eff = hd + bd
                tot = max(eff, t_map.get(pid, eff))
                other = max(0, tot - eff)
                share = round((hd / eff) * 100.0, 1) if eff > 0 else 0.0
                was_dead = any(dts < hs for dts in deaths_by_player.get(pid, []))
                fc_info = fc_map.get(pid)
                if fc_info is not None and first_raid_ts is not None:
                    sw_delay: int | None = max(0, fc_info["ts"] - first_raid_ts)
                    sw_spell: str | None = abilities.get(fc_info["ability_id"], "") or str(fc_info["ability_id"])
                    sw_type: str | None = fc_info.get("switch_type", "direct")
                else:
                    sw_delay = None
                    sw_spell = None
                    sw_type = None
                p_rows.append(
                    {
                        "player": actors[pid]["name"],
                        "class": actors[pid].get("subType", ""),
                        "player_id": pid,
                        "heart_dmg": hd,
                        "heart_raw_dmg": round(hd / 2),
                        "boss_dmg": bd,
                        "total_boss_dmg": eff,
                        "other_dmg": other,
                        "heart_share_pct": share,
                        "debris_hits": debris_counts.get(pid, 0),
                        "switch_delay_ms": sw_delay,
                        "first_heart_spell": sw_spell,
                        "first_heart_switch_type": sw_type,
                        "was_dead_at_heart": was_dead,
                    }
                )
            p_rows.sort(key=lambda r: (-r["total_boss_dmg"], r["player"]))
            start_rel = max(0, hs - f_start)
            heart_phases.append(
                {
                    "id": f"{report_code}-{fid}-hw-{win_num}",
                    "pull_num": pull_idx,
                    "fight_id": fid,
                    "is_kill": is_kill,
                    "window_num": win_num,
                    "start_rel_time": format_rel_time(start_rel),
                    "start_rel_ms": start_rel,
                    "duration_ms": max(0, he - hs),
                    "deaths_before": count_deaths_before(hs),
                    "first_switch_player": first_switch_player,
                    "first_switch_spell": first_switch_spell,
                    "first_switch_rel_time": first_switch_rel_time,
                    "total_heart_dmg": sum(r["heart_dmg"] for r in p_rows),
                    "total_boss_dmg": sum(r["boss_dmg"] for r in p_rows),
                    "total_effective_dmg": sum(r["total_boss_dmg"] for r in p_rows),
                    "total_other_dmg": sum(r["other_dmg"] for r in p_rows),
                    "debris_hits_total": sum(r["debris_hits"] for r in p_rows),
                    "players": p_rows,
                    "events_url": build_damage_window_url(report_code, fid, hs, he),
                    "replay_url": build_replay_url(report_code, fid, start_rel),
                }
            )

        # Phase 2 Doomscale Warden summary (when P2 reached or warden data present)
        transitions = fight.get("phaseTransitions") or []
        p2_trans = next((pt for pt in transitions if int(pt.get("id", 0)) == 2), None)
        p3_trans = next((pt for pt in transitions if int(pt.get("id", 0)) == 3), None)
        w_map = warden_dmg_by_fight.get(fid, {})
        if p2_trans is not None or w_map or warden_death_ts:
            p2_ts = int(p2_trans["startTime"]) if p2_trans else f_start
            p2_rel = max(0, p2_ts - f_start)
            warden_death_ts.sort()
            sync_delta = (warden_death_ts[1] - warden_death_ts[0]) if len(warden_death_ts) >= 2 else None
            w_players = [
                {
                    "player": actors[pid]["name"],
                    "class": actors[pid].get("subType", ""),
                    "player_id": pid,
                    "damage": dmg,
                }
                for pid, dmg in w_map.items()
                if pid in actors and actors[pid].get("type") == "Player" and dmg > 0
            ]
            w_players.sort(key=lambda r: (-r["damage"], r["player"]))
            warden_summaries.append(
                {
                    "pull_num": pull_idx,
                    "fight_id": fid,
                    "is_kill": is_kill,
                    "p2_start_rel_time": format_rel_time(p2_rel),
                    "deaths_at_p2_start": count_deaths_before(p2_ts),
                    "warden_kills": len(warden_death_ts),
                    "kill_sync_delta_ms": sync_delta,
                    "total_warden_dmg": sum(r["damage"] for r in w_players),
                    "players": w_players,
                    "events_url": build_damage_window_url(report_code, fid, p2_ts, f_end),
                    "replay_url": build_replay_url(report_code, fid, p2_rel),
                }
            )

        # Phase 3 Boss Execute summary (auto-active once logs reach P3)
        p3_map = p3_boss_dmg_by_fight.get(fid, {})
        if p3_trans is not None or p3_map:
            p3_ts = int(p3_trans["startTime"]) if p3_trans else f_start
            p3_rel = max(0, p3_ts - f_start)
            p3_players = [
                {
                    "player": actors[pid]["name"],
                    "class": actors[pid].get("subType", ""),
                    "player_id": pid,
                    "damage": dmg,
                }
                for pid, dmg in p3_map.items()
                if pid in actors and actors[pid].get("type") == "Player" and dmg > 0
            ]
            p3_players.sort(key=lambda r: (-r["damage"], r["player"]))
            p3_summaries.append(
                {
                    "pull_num": pull_idx,
                    "fight_id": fid,
                    "is_kill": is_kill,
                    "p3_start_rel_time": format_rel_time(p3_rel),
                    "deaths_at_p3_start": count_deaths_before(p3_ts),
                    "total_boss_dmg": sum(r["damage"] for r in p3_players),
                    "players": p3_players,
                    "events_url": build_damage_window_url(report_code, fid, p3_ts, f_end),
                    "replay_url": build_replay_url(report_code, fid, p3_rel),
                }
            )

        # ---- 2. Classify all Noxious Shell (1307612) removals ----
        splash_entries: list[dict[str, Any]] = []
        for rem in shell_removes:
            tid = rem.get("targetID")
            if tid not in actors or actors[tid].get("type") != "Player":
                continue
            rts = int(rem["timestamp"])
            is_coils = any(abs(rts - cc) <= 5 for cc in coils_casts) or any(
                -50 <= cd - rts <= 50 for cd in coils_dmg_by_p[tid]
            )
            has_constrictor = any(0 <= ct - rts <= 50 for ct in constrictor_by_p[tid])
            cw_near = [e for e in cw_hits_by_p[tid] if -50 <= int(e["timestamp"]) - rts <= 50]
            splash_near = [e for e in splash_by_p[tid] if -50 <= int(e["timestamp"]) - rts <= 50]
            other_dmg_near = [ab for dts, ab in other_boss_dmg_by_p[tid] if -50 <= dts - rts <= 50]
            death_near = [dt for dt in deaths_by_player[tid] if -50 <= dt - rts <= 150]
            putrid_near = [pt for pt in putrid_by_p[tid] if -50 <= pt - rts <= 50]
            rancid_near = [rt for rt in rancid_by_p[tid] if -50 <= rt - rts <= 50]

            if is_coils or has_constrictor:
                removal_summary["spectral_coils"] += 1
            elif cw_near:
                removal_summary["caustic_waves"] += 1
                first_cw = min(cw_near, key=lambda e: int(e["timestamp"]))
                cts = int(first_cw["timestamp"])
                cw_broke_shell_keys.add((tid, cts))
                rel_ms = cts - f_start
                ovk = int(first_cw.get("overkill", 0) or 0)
                lethal = ovk > 0 or any(abs(dt - cts) <= 50 for dt in deaths_by_player[tid])
                egg_fails.append(
                    {
                        "id": f"{report_code}-{fid}-{tid}-{cts}-cw",
                        "kind": "caustic_waves",
                        "player": actors[tid]["name"],
                        "class": actors[tid].get("subType", ""),
                        "target_id": tid,
                        "pull_num": pull_idx,
                        "fight_id": fid,
                        "is_kill": is_kill,
                        "rel_time": format_rel_time(rel_ms),
                        "rel_ms": rel_ms,
                        "timestamp": cts,
                        "deaths_before": count_deaths_before(cts),
                        "damage": int(first_cw.get("amount", 0) or 0),
                        "overkill": ovk,
                        "lethal": lethal,
                        "gap_ms": cts - rts,
                        "has_putrid": bool(putrid_near),
                        "has_rancid": bool(rancid_near),
                        "collision_partners": [],
                        "collision_gap_ms": None,
                        "is_regular": True,
                        "all_regulars_alive_at_pickup": None,
                        "dead_regulars_at_pickup": [],
                        "events_url": build_events_url(report_code, fid, tid, cts, f_start, f_end),
                        "replay_url": build_replay_url(report_code, fid, rel_ms),
                    }
                )
            elif other_dmg_near:
                # Another direct boss/add hit triggered the shell break -> NOT an egg collision!
                removal_summary["other"] += 1
            elif splash_near:
                first_sp = min(splash_near, key=lambda e: int(e["timestamp"]))
                sts = int(first_sp["timestamp"])
                rel_ms = sts - f_start
                ovk = int(first_sp.get("overkill", 0) or 0)
                lethal = ovk > 0 or any(abs(dt - sts) <= 50 for dt in deaths_by_player[tid])
                splash_entries.append(
                    {
                        "id": f"{report_code}-{fid}-{tid}-{sts}-ns",
                        "kind": "noxious_splash",
                        "player": actors[tid]["name"],
                        "class": actors[tid].get("subType", ""),
                        "target_id": tid,
                        "pull_num": pull_idx,
                        "fight_id": fid,
                        "is_kill": is_kill,
                        "rel_time": format_rel_time(rel_ms),
                        "rel_ms": rel_ms,
                        "timestamp": sts,
                        "deaths_before": count_deaths_before(sts),
                        "damage": int(first_sp.get("amount", 0) or 0),
                        "overkill": ovk,
                        "lethal": lethal,
                        "gap_ms": sts - rts,
                        "has_putrid": bool(putrid_near),
                        "has_rancid": bool(rancid_near),
                        "collision_partners": [],
                        "collision_gap_ms": None,
                        "is_regular": True,
                        "all_regulars_alive_at_pickup": None,
                        "dead_regulars_at_pickup": [],
                        "events_url": build_events_url(report_code, fid, tid, sts, f_start, f_end),
                        "replay_url": build_replay_url(report_code, fid, rel_ms),
                    }
                )
            elif death_near:
                removal_summary["player_death"] += 1
            else:
                removal_summary["other"] += 1

        # Cluster Noxious Splash events within <= 250ms across >= 2 distinct players -> 2-carrier Egg Collision!
        splash_entries.sort(key=lambda x: x["timestamp"])
        used_sp: set[int] = set()
        for i, item_a in enumerate(splash_entries):
            if i in used_sp:
                continue
            cluster = [item_a]
            used_sp.add(i)
            for j in range(i + 1, len(splash_entries)):
                if j in used_sp:
                    continue
                if abs(splash_entries[j]["timestamp"] - cluster[-1]["timestamp"]) <= 250:
                    cluster.append(splash_entries[j])
                    used_sp.add(j)
                else:
                    break
            distinct_players = {c["target_id"] for c in cluster}
            if len(distinct_players) >= 2:
                for entry in cluster:
                    others = [c for c in cluster if c["target_id"] != entry["target_id"]]
                    entry["kind"] = "egg_collision"
                    entry["id"] = entry["id"].replace("-ns", "-ec")
                    entry["collision_partners"] = sorted({o["player"] for o in others})
                    entry["collision_gap_ms"] = min(abs(entry["timestamp"] - o["timestamp"]) for o in others)
                    removal_summary["egg_collision"] += 1
                    egg_fails.append(entry)
            else:
                for entry in cluster:
                    removal_summary["noxious_splash"] += 1
                    egg_fails.append(entry)

        # ---- 3. Record ALL direct (non-tick) Caustic Waves hits ----
        for tid, hits in cw_hits_by_p.items():
            for idx_hit, cw in enumerate(hits):
                cts = int(cw["timestamp"])
                rel_ms = cts - f_start
                ovk = int(cw.get("overkill", 0) or 0)
                lethal = ovk > 0 or any(abs(dt - cts) <= 50 for dt in deaths_by_player[tid])
                wave_fails.append(
                    {
                        "id": f"{report_code}-{fid}-{tid}-{cts}-wf-{idx_hit}",
                        "player": actors[tid]["name"],
                        "class": actors[tid].get("subType", ""),
                        "target_id": tid,
                        "pull_num": pull_idx,
                        "fight_id": fid,
                        "is_kill": is_kill,
                        "rel_time": format_rel_time(rel_ms),
                        "rel_ms": rel_ms,
                        "timestamp": cts,
                        "deaths_before": count_deaths_before(cts),
                        "damage": int(cw.get("amount", 0) or 0),
                        "overkill": ovk,
                        "lethal": lethal,
                        "had_noxious_shell": (tid, cts) in cw_broke_shell_keys,
                        "events_url": build_events_url(report_code, fid, tid, cts, f_start, f_end),
                        "replay_url": build_replay_url(report_code, fid, rel_ms),
                    }
                )

        # ---- 4. Record per-pull consumable usage ----
        for pid in sorted(fight_players):
            consumable_usage.append(
                {
                    "pull_num": pull_idx,
                    "fight_id": fid,
                    "player": actors[pid]["name"],
                    "class": actors[pid].get("subType", ""),
                    "target_id": pid,
                    "used_health_pot": pot_counts[pid] > 0,
                    "health_pot_count": pot_counts[pid],
                    "used_healthstone": hs_counts[pid] > 0,
                    "healthstone_count": hs_counts[pid],
                    "def_cd_casts": def_cd_casts[pid],
                }
            )

        phase_transitions_out = sorted(
            [
                {"id": int(pt.get("id", 0)), "start_time": int(pt.get("startTime", f_start))}
                for pt in (fight.get("phaseTransitions") or [])
                if pt.get("id") is not None
            ],
            key=lambda x: (x["start_time"], x["id"]),
        )
        pulls_out.append(
            {
                "pull_num": pull_idx,
                "fight_id": fid,
                "is_kill": is_kill,
                "boss_percentage": round(float(fight.get("bossPercentage", fight.get("fightPercentage", 0.0)) or 0.0), 1),
                "duration_ms": max(0, f_end - f_start),
                "start_time": f_start,
                "end_time": f_end,
                "deaths_total": len(player_deaths),
                "phase_transitions": phase_transitions_out,
                "report_url": f"https://www.warcraftlogs.com/reports/{report_code}?fight={fid}",
            }
        )

    start_epoch = int(meta.get("startTime", 0) or 0)
    date_iso = (
        datetime.fromtimestamp(start_epoch / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d")
        if start_epoch > 0
        else datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
    )

    players_out = [
        {
            "id": pid,
            "name": actors[pid]["name"],
            "class": actors[pid].get("subType", ""),
            "is_tank": pid in tank_id_set,
            "pulls_present": count,
        }
        for pid, count in sorted(player_pulls_present.items(), key=lambda kv: actors[kv[0]]["name"])
    ]

    kills_count = sum(1 for p in pulls_out if p["is_kill"])
    wipes_count = len(pulls_out) - kills_count

    last_pull_end_epoch = (
        start_epoch + max(int(p["end_time"]) for p in pulls_out)
        if start_epoch > 0 and pulls_out
        else start_epoch
    )

    egg_regular_carriers, egg_carrier_events = _build_egg_carrier_analysis(
        sorted_fights, actors, events_by_fight, egg_fails, report_code
    )
    healers_out, healer_emergency_events, healer_tank_soak_events = _build_healer_analysis(
        sorted_fights, actors, abilities, events_by_fight, tank_id_set, extra_tables, report_code
    )
    soak_groups_out, group_soaks_out = _build_group_soak_analysis(
        sorted_fights, actors, events_by_fight, tank_ids, report_code
    )

    return {
        "code": report_code,
        "title": meta.get("title", report_code),
        "label": label.strip() if isinstance(label, str) and label.strip() else None,
        "date_iso": date_iso,
        "start_time_epoch_ms": start_epoch,
        "last_pull_end_epoch_ms": last_pull_end_epoch,
        "encounter_id": encounter_id,
        "boss_name": sorted_fights[0]["name"] if sorted_fights else "Ula'tek",
        "difficulty": difficulty,
        "analyzed_at": datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pulls_total": len(pulls_out),
        "wipes_count": wipes_count,
        "kills_count": kills_count,
        "tanks": [
            {"id": tid, "name": actors[tid]["name"], "class": actors[tid].get("subType", "")}
            for tid in tank_ids
        ],
        "healers": healers_out,
        "players": players_out,
        "egg_regular_carriers": egg_regular_carriers,
        "soak_groups": soak_groups_out,
        "removal_summary": {
            "spectral_coils": removal_summary["spectral_coils"],
            "caustic_waves": removal_summary["caustic_waves"],
            "egg_collision": removal_summary["egg_collision"],
            "noxious_splash": removal_summary["noxious_splash"],
            "player_death": removal_summary["player_death"],
            "other": removal_summary["other"],
        },
        "pulls": pulls_out,
        "egg_fails": sorted(egg_fails, key=lambda x: (x["pull_num"], x["timestamp"])),
        "egg_carrier_events": egg_carrier_events,
        "wave_fails": sorted(wave_fails, key=lambda x: (x["pull_num"], x["timestamp"])),
        "tank_fails": sorted(tank_fails, key=lambda x: (x["pull_num"], x["timestamp"])),
        "defensive_events": sorted(defensive_events, key=lambda x: (x["pull_num"], x["timestamp"])),
        "healer_emergency_events": healer_emergency_events,
        "healer_tank_soak_events": healer_tank_soak_events,
        "group_soaks": group_soaks_out,
        "consumable_usage": consumable_usage,
        "heart_phases": sorted(heart_phases, key=lambda x: (x["pull_num"], x["window_num"])),
        "phase_events": sorted(phase_events, key=lambda x: (x["pull_num"], x["timestamp"])),
        "warden_summaries": sorted(warden_summaries, key=lambda x: x["pull_num"]),
        "p3_summaries": sorted(p3_summaries, key=lambda x: x["pull_num"]),
    }


def _build_group_soak_analysis(
    sorted_fights: list[dict[str, Any]],
    actors: dict[int, dict[str, Any]],
    events_by_fight: dict[int, list[dict[str, Any]]],
    tank_ids: list[int],
    report_code: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Track alternating 2-group Soul Constrictor soaks in Intermission: The Shattering (P2 groups) & Phase 1."""
    tank_id_set = set(tank_ids)
    sorted_tanks = sorted(tank_ids, key=lambda tid: actors[tid]["name"])
    tk_a = sorted_tanks[0] if len(sorted_tanks) >= 1 else None
    tk_b = sorted_tanks[1] if len(sorted_tanks) >= 2 else None

    shat_label_a = f"Gruppe {actors[tk_a]['name']}" if tk_a is not None else "Gruppe 1"
    shat_class_a = actors[tk_a].get("subType", "") if tk_a is not None else ""
    shat_label_b = f"Gruppe {actors[tk_b]['name']}" if tk_b is not None else "Gruppe 2"
    shat_class_b = actors[tk_b].get("subType", "") if tk_b is not None else ""

    # Pass 1: per-fight soak clusters, deaths, boss-tank activity, and P2 Warden sides
    fight_records: list[dict[str, Any]] = []
    p2_side_votes: dict[int, Counter[str]] = defaultdict(Counter)
    p1_parity_votes: dict[int, Counter[str]] = defaultdict(Counter)

    for pull_idx, fight in enumerate(sorted_fights, start=1):
        fid = int(fight["id"])
        f_start = int(fight["startTime"])
        f_end = int(fight["endTime"])
        is_kill = bool(fight.get("kill", False))
        fevs = sorted(events_by_fight.get(fid, []), key=lambda e: int(e["timestamp"]))

        pts = fight.get("phaseTransitions") or []
        p2_start = next((int(pt["startTime"]) for pt in pts if int(pt.get("id", 0)) == 2), None)
        shat_start = next((int(pt["startTime"]) for pt in pts if int(pt.get("id", 0)) == 3), None)
        p3_start = next((int(pt["startTime"]) for pt in pts if int(pt.get("id", 0)) == 4), None)

        fight_players: set[int] = set()
        for pid in fight.get("friendlyPlayers") or []:
            if pid in actors and actors[pid].get("type") == "Player":
                fight_players.add(int(pid))

        player_deaths: list[tuple[int, int]] = []
        deaths_by_player: dict[int, list[int]] = defaultdict(list)
        seen_dk: set[tuple[int, int]] = set()
        boss_melee_ts: dict[int, list[int]] = defaultdict(list)
        stone_venom_apply_ts: dict[int, list[int]] = defaultdict(list)
        warden_dmg_by_inst: dict[int, Counter[int]] = defaultdict(Counter)
        sc_applies: list[tuple[int, int]] = []

        for ev in fevs:
            t = ev.get("type")
            ts = int(ev["timestamp"])
            src = ev.get("sourceID")
            tid = ev.get("targetID")
            aid = ev.get("abilityGameID")

            if src in actors and actors[src].get("type") == "Player":
                fight_players.add(int(src))
            if tid in actors and actors[tid].get("type") == "Player":
                fight_players.add(int(tid))

            if t == "death" and tid in actors and actors[tid].get("type") == "Player":
                if (tid, ts) not in seen_dk:
                    seen_dk.add((tid, ts))
                    player_deaths.append((ts, int(tid)))
                    deaths_by_player[int(tid)].append(ts)

            if tid in tank_id_set:
                src_name = actors.get(src, {}).get("name", "") if src is not None else ""
                if t == "damage" and aid == SPELL_MELEE and src_name == "Ula'tek":
                    boss_melee_ts[int(tid)].append(ts)
                elif aid == SPELL_STONE_VENOM_DEBUFF and t in ("applydebuff", "applydebuffstack"):
                    stone_venom_apply_ts[int(tid)].append(ts)

            if src in actors and actors[src].get("type") == "Player" and tid in actors and actors[tid].get("name") == "Doomscale Warden":
                inst = int(ev.get("targetInstance") or 1)
                if t == "damage":
                    warden_dmg_by_inst[inst][int(src)] += max(1, int(ev.get("amount", 0) or 0))
                elif t == "interrupt":
                    warden_dmg_by_inst[inst][int(src)] += 1000

            if aid == SPELL_SOUL_CONSTRICTOR and t in ("applydebuff", "applydebuffstack"):
                if tid in actors and actors[tid].get("type") == "Player":
                    sc_applies.append((ts, int(tid)))

        # Map Warden instances in this fight to Group A (tk_a) vs Group B (tk_b)
        fight_p2_group: dict[int, str] = {}
        if warden_dmg_by_inst:
            all_w_pids = {p for m in warden_dmg_by_inst.values() for p in m.keys()}
            inst_players: dict[int, set[int]] = defaultdict(set)
            for pid in all_w_pids:
                best_inst = max(warden_dmg_by_inst.keys(), key=lambda i: warden_dmg_by_inst[i].get(pid, 0))
                if warden_dmg_by_inst[best_inst].get(pid, 0) > 0:
                    inst_players[best_inst].add(pid)
            inst_to_key: dict[int, str] = {}
            for inst, pids in inst_players.items():
                if tk_a is not None and tk_a in pids:
                    inst_to_key[inst] = "A"
                elif tk_b is not None and tk_b in pids:
                    inst_to_key[inst] = "B"
            for inst, pids in inst_players.items():
                if inst not in inst_to_key:
                    used = set(inst_to_key.values())
                    inst_to_key[inst] = "B" if "A" in used else "A"
                gkey = inst_to_key[inst]
                for pid in pids:
                    fight_p2_group[pid] = gkey
                    p2_side_votes[pid][gkey] += 1

        # Cluster Soul Constrictor applies within <= 1200ms
        sc_applies.sort(key=lambda x: x[0])
        raw_clusters: list[dict[str, Any]] = []
        for ts, pid in sc_applies:
            if not raw_clusters or ts - int(raw_clusters[-1]["end"]) > 1200:
                raw_clusters.append({"start": ts, "end": ts, "pids": {pid}})
            else:
                raw_clusters[-1]["end"] = ts
                raw_clusters[-1]["pids"].add(pid)

        p1_clusters: list[dict[str, Any]] = []
        shat_clusters: list[dict[str, Any]] = []
        for c in raw_clusters:
            if len(c["pids"]) < 2:
                continue
            cts = int(c["start"])
            if shat_start is not None and cts >= shat_start and (p3_start is None or cts < p3_start):
                shat_clusters.append(c)
            elif p2_start is None or cts < p2_start:
                p1_clusters.append(c)

        for idx_c, c in enumerate(p1_clusters):
            gkey = "A" if (idx_c % 2 == 0) else "B"
            for pid in c["pids"]:
                p1_parity_votes[pid][gkey] += 1

        fight_records.append(
            {
                "pull_num": pull_idx,
                "fight_id": fid,
                "f_start": f_start,
                "f_end": f_end,
                "is_kill": is_kill,
                "fight_players": fight_players,
                "player_deaths": player_deaths,
                "deaths_by_player": deaths_by_player,
                "boss_melee_ts": boss_melee_ts,
                "stone_venom_apply_ts": stone_venom_apply_ts,
                "fight_p2_group": fight_p2_group,
                "p1_clusters": p1_clusters,
                "shat_clusters": shat_clusters,
            }
        )

    # Report-level P2 Warden groups (2 groups: Gruppe Barrumir vs Gruppe Betøng)
    p2_group_by_pid: dict[int, str] = {}
    if tk_a is not None:
        p2_group_by_pid[tk_a] = "A"
    if tk_b is not None:
        p2_group_by_pid[tk_b] = "B"
    for pid, votes in p2_side_votes.items():
        if pid in p2_group_by_pid:
            continue
        p2_group_by_pid[pid] = "A" if votes.get("A", 0) >= votes.get("B", 0) else "B"

    # Report-level Phase 1 groups (2 alternating groups: majority even vs odd P1 soak parity)
    p1_group_by_pid: dict[int, str] = {}
    for pid, votes in p1_parity_votes.items():
        p1_group_by_pid[pid] = "A" if votes.get("A", 0) >= votes.get("B", 0) else "B"

    # Report-level Intermission: The Shattering 3-group auto-clustering via 3! = 6 permutation alignment
    shat_keys = ("G1", "G2", "G3")
    shat_labels = {"G1": "Gruppe 1", "G2": "Gruppe 2", "G3": "Gruppe 3"}
    perms_3: tuple[tuple[str, str, str], ...] = (
        ("G1", "G2", "G3"),
        ("G1", "G3", "G2"),
        ("G2", "G1", "G3"),
        ("G2", "G3", "G1"),
        ("G3", "G1", "G2"),
        ("G3", "G2", "G1"),
    )
    all_shat_rounds: list[list[dict[str, Any]]] = []
    total_shat_soaks = 0
    for rec in fight_records:
        scl = rec["shat_clusters"]
        total_shat_soaks += len(scl)
        for i in range(0, len(scl), 3):
            all_shat_rounds.append(scl[i : i + 3])

    complete_shat_rounds = sum(1 for ch in all_shat_rounds if len(ch) == 3)
    shat_confidence = "none" if total_shat_soaks == 0 else ("high" if complete_shat_rounds >= 2 else "provisional")

    shat_votes: dict[int, dict[str, int]] = {}
    ordered_rounds = sorted(range(len(all_shat_rounds)), key=lambda i: (0 if len(all_shat_rounds[i]) == 3 else 1, i))
    seeded = False
    for r_i in ordered_rounds:
        chunk = all_shat_rounds[r_i]
        if not seeded:
            best_perm = perms_3[0]
            seeded = True
        else:
            best_perm = perms_3[0]
            best_score = -1
            for perm in perms_3:
                score = 0
                for idx_c, c in enumerate(chunk):
                    gk = perm[idx_c]
                    for p in c["pids"]:
                        pv = shat_votes.get(p)
                        if pv is not None:
                            score += pv[gk]
                if score > best_score:
                    best_score = score
                    best_perm = perm
        for idx_c, c in enumerate(chunk):
            gk = best_perm[idx_c]
            for p in c["pids"]:
                if p not in shat_votes:
                    shat_votes[p] = {"G1": 0, "G2": 0, "G3": 0}
                shat_votes[p][gk] += 1

    shat_group_by_pid: dict[int, str] = {}
    for pid, vm in shat_votes.items():
        best_k = max(shat_keys, key=lambda k: vm[k])
        shat_group_by_pid[pid] = best_k

    def _pref(pid: int, double_soak: bool = False) -> dict[str, Any]:
        out: dict[str, Any] = {
            "player": actors[pid]["name"],
            "class": actors[pid].get("subType", ""),
            "player_id": pid,
        }
        if double_soak:
            out["double_soak"] = True
        return out

    # Pass 2: Evaluate P1 (2-group alternation) and Shattering (3-group modulo-3 rotation)
    group_soaks: list[dict[str, Any]] = []
    for rec in fight_records:
        fid = rec["fight_id"]
        f_start = rec["f_start"]
        f_end = rec["f_end"]
        pull_idx = rec["pull_num"]
        is_kill = rec["is_kill"]
        fight_players: set[int] = rec["fight_players"]
        player_deaths: list[tuple[int, int]] = rec["player_deaths"]
        deaths_by_player: dict[int, list[int]] = rec["deaths_by_player"]
        boss_melee_ts: dict[int, list[int]] = rec["boss_melee_ts"]
        stone_venom_apply_ts: dict[int, list[int]] = rec["stone_venom_apply_ts"]

        def _count_deaths_before(ts_now: int) -> int:
            return sum(1 for dts, _ in player_deaths if dts < ts_now)

        def _is_dead_at(pid: int, ts_now: int) -> bool:
            return any(dts <= ts_now for dts in deaths_by_player.get(pid, []))

        def _active_boss_tank_at(ts_now: int) -> int | None:
            # Primary: closest Ula'tek Melee around soak (-12s..+5s, handles Brewmaster dodges & boss casts)
            for back_ms, fwd_ms in ((12_000, 5_000), (25_000, 10_000)):
                best_tk = None
                best_dist = 10**9
                best_ts = -1
                for tk in tank_ids:
                    for bts in boss_melee_ts.get(tk, []):
                        if ts_now - back_ms <= bts <= ts_now + fwd_ms:
                            dist = abs(bts - ts_now)
                            if dist < best_dist or (dist == best_dist and bts > best_ts):
                                best_dist = dist
                                best_ts = bts
                                best_tk = tk
                if best_tk is not None:
                    return best_tk
            # Rare fallback: Stone Venom debuff application only (never DoT ticks on off-tank!)
            best_tk = None
            best_ts = -1
            for tk in tank_ids:
                for sts in stone_venom_apply_ts.get(tk, []):
                    if ts_now - 10_000 <= sts <= ts_now and sts > best_ts:
                        best_ts = sts
                        best_tk = tk
            return best_tk

        # ---- Phase 1: 2-Group Alternation (with active Boss-Tank exemption) ----
        p1_clusters = rec["p1_clusters"]
        if p1_clusters:
            c0_pids = p1_clusters[0]["pids"]
            c0_a = sum(1 for p in c0_pids if p1_group_by_pid.get(p) == "A")
            c0_b = sum(1 for p in c0_pids if p1_group_by_pid.get(p) == "B")
            start_key = "A" if c0_a >= c0_b else "B"

            prev_pids: set[int] = set()
            prev_ts = -999_999

            for s_idx, c in enumerate(p1_clusters, start=1):
                cts = int(c["start"])
                cpids: set[int] = set(c["pids"])
                exp_key = start_key if (s_idx % 2 == 1) else ("B" if start_key == "A" else "A")
                oth_key = "B" if exp_key == "A" else "A"
                exp_label = "Soak-Gruppe 1" if exp_key == "A" else "Soak-Gruppe 2"

                expected_pids = {p for p in fight_players if p1_group_by_pid.get(p) == exp_key}
                boss_tank_exempt_ref = None
                active_bt = _active_boss_tank_at(cts)
                if active_bt is not None and active_bt not in cpids and active_bt in expected_pids:
                    expected_pids.discard(active_bt)
                    boss_tank_exempt_ref = _pref(active_bt)

                soakers_pids = sorted(
                    [p for p in cpids if p1_group_by_pid.get(p) != oth_key],
                    key=lambda p: actors[p]["name"],
                )
                wrong_pids = sorted(
                    [p for p in cpids if p1_group_by_pid.get(p) == oth_key],
                    key=lambda p: actors[p]["name"],
                )
                missing_pids = sorted(expected_pids - cpids, key=lambda p: actors[p]["name"])
                missed_alive_pids = [p for p in missing_pids if not _is_dead_at(p, cts)]
                dead_expected_pids = [p for p in missing_pids if _is_dead_at(p, cts)]

                is_prev_recent = 0 < cts - prev_ts <= 35_000
                wrong_refs = [
                    {
                        "player": actors[p]["name"],
                        "class": actors[p].get("subType", ""),
                        "player_id": p,
                        "double_soak": bool(is_prev_recent and p in prev_pids),
                    }
                    for p in wrong_pids
                ]

                rel_ms = cts - f_start
                group_soaks.append(
                    {
                        "id": f"{report_code}-{fid}-p1-{s_idx}-{cts}-gsk",
                        "phase": "p1",
                        "pull_num": pull_idx,
                        "fight_id": fid,
                        "is_kill": is_kill,
                        "soak_num": s_idx,
                        "round_num": (s_idx - 1) // 2 + 1,
                        "rel_time": format_rel_time(rel_ms),
                        "rel_ms": rel_ms,
                        "timestamp": cts,
                        "deaths_before": _count_deaths_before(cts),
                        "expected_group": exp_label,
                        "expected_group_class": "",
                        "total_soakers": len(cpids),
                        "correct_count": len(soakers_pids),
                        "alternation_ok": len(wrong_refs) == 0 and len(missed_alive_pids) == 0,
                        "soakers": [_pref(p) for p in soakers_pids],
                        "missed_alive": [_pref(p) for p in missed_alive_pids],
                        "wrong_group": wrong_refs,
                        "dead_expected": [_pref(p) for p in dead_expected_pids],
                        "boss_tank_exempt": boss_tank_exempt_ref,
                        "events_url": f"https://www.warcraftlogs.com/reports/{report_code}?fight={fid}&type=auras&ability={SPELL_SOUL_CONSTRICTOR}&view=events&start={max(f_start, cts - 2000)}&end={min(f_end, cts + 4000)}",
                        "replay_url": build_replay_url(report_code, fid, rel_ms),
                    }
                )
                prev_pids = cpids
                prev_ts = cts

        # ---- Intermission: The Shattering — 3-Group Rotation (Stage 1 Invariants + Stage 2 3! Alignment) ----
        shat_clusters = rec["shat_clusters"]
        if shat_clusters:
            # Align this pull's first round against canonical (G1, G2, G3) via best-of-6 permutation
            first_round = shat_clusters[:3]
            pull_ord = perms_3[0]
            best_ord_score = -1
            for perm in perms_3:
                sc = sum(
                    1
                    for idx_c, c in enumerate(first_round)
                    for p in c["pids"]
                    if shat_group_by_pid.get(p) == perm[idx_c]
                )
                if sc > best_ord_score:
                    best_ord_score = sc
                    pull_ord = perm

            # Precompute 100%-certain 0-soak alive players for each complete 3-soak round
            round_zero_missed: dict[int, list[int]] = {}
            for r_start in range(0, len(shat_clusters), 3):
                chunk = shat_clusters[r_start : r_start + 3]
                if len(chunk) == 3:
                    r_num = r_start // 3 + 1
                    r_soakers: set[int] = set()
                    for c in chunk:
                        r_soakers.update(c["pids"])
                    r_end_ts = int(chunk[-1]["start"])
                    round_zero_missed[r_num] = sorted(
                        [p for p in fight_players if p not in r_soakers and not _is_dead_at(p, r_end_ts)],
                        key=lambda p: actors[p]["name"],
                    )

            last_soak_idx_by_pid: dict[int, int] = {}
            for s_idx, c in enumerate(shat_clusters, start=1):
                cts = int(c["start"])
                cpids = set(c["pids"])
                round_num = (s_idx - 1) // 3 + 1
                exp_key = pull_ord[(s_idx - 1) % 3]
                exp_label = shat_labels[exp_key]

                absent_all = sorted(fight_players - cpids, key=lambda p: actors[p]["name"])
                absent_alive_pids = [p for p in absent_all if not _is_dead_at(p, cts)]
                absent_dead_pids = [p for p in absent_all if _is_dead_at(p, cts)]

                double_pids = {
                    p for p in cpids if p in last_soak_idx_by_pid and (s_idx - last_soak_idx_by_pid[p]) < 3
                }

                if shat_confidence == "high":
                    expected_pids = {p for p in fight_players if shat_group_by_pid.get(p) == exp_key}
                    wrong_pids = sorted(
                        [
                            p
                            for p in cpids
                            if (shat_group_by_pid.get(p) not in (None, exp_key)) or (p in double_pids)
                        ],
                        key=lambda p: actors[p]["name"],
                    )
                    wrong_set = set(wrong_pids)
                    soakers_pids = sorted([p for p in cpids if p not in wrong_set], key=lambda p: actors[p]["name"])
                    missing_pids = sorted(expected_pids - cpids, key=lambda p: actors[p]["name"])
                    missed_alive_pids = [p for p in missing_pids if not _is_dead_at(p, cts)]
                    dead_expected_pids = [p for p in missing_pids if _is_dead_at(p, cts)]
                    if s_idx % 3 == 0 and round_num in round_zero_missed:
                        extra_unassigned = [
                            p
                            for p in round_zero_missed[round_num]
                            if p not in shat_group_by_pid and p not in missed_alive_pids
                        ]
                        if extra_unassigned:
                            missed_alive_pids = sorted(
                                missed_alive_pids + extra_unassigned, key=lambda p: actors[p]["name"]
                            )
                else:
                    # Stage 1 Provisional (< 2 complete rounds): ONLY 100%-certain invariants!
                    wrong_pids = sorted(double_pids, key=lambda p: actors[p]["name"])
                    soakers_pids = sorted([p for p in cpids if p not in double_pids], key=lambda p: actors[p]["name"])
                    missed_alive_pids = (
                        list(round_zero_missed.get(round_num, [])) if (s_idx % 3 == 0) else []
                    )
                    dead_expected_pids = []

                wrong_refs = [
                    {
                        "player": actors[p]["name"],
                        "class": actors[p].get("subType", ""),
                        "player_id": p,
                        "double_soak": bool(p in double_pids),
                    }
                    for p in wrong_pids
                ]

                rel_ms = cts - f_start
                group_soaks.append(
                    {
                        "id": f"{report_code}-{fid}-shattering-{s_idx}-{cts}-gsk",
                        "phase": "shattering",
                        "pull_num": pull_idx,
                        "fight_id": fid,
                        "is_kill": is_kill,
                        "soak_num": s_idx,
                        "round_num": round_num,
                        "confidence": shat_confidence,
                        "rel_time": format_rel_time(rel_ms),
                        "rel_ms": rel_ms,
                        "timestamp": cts,
                        "deaths_before": _count_deaths_before(cts),
                        "expected_group": exp_label,
                        "expected_group_class": "",
                        "total_soakers": len(cpids),
                        "correct_count": len(soakers_pids),
                        "alternation_ok": len(wrong_refs) == 0 and len(missed_alive_pids) == 0,
                        "soakers": [_pref(p) for p in soakers_pids],
                        "missed_alive": [_pref(p) for p in missed_alive_pids],
                        "wrong_group": wrong_refs,
                        "dead_expected": [_pref(p) for p in dead_expected_pids],
                        "absent_alive": [_pref(p) for p in absent_alive_pids],
                        "absent_dead": [_pref(p) for p in absent_dead_pids],
                        "boss_tank_exempt": None,
                        "events_url": f"https://www.warcraftlogs.com/reports/{report_code}?fight={fid}&type=auras&ability={SPELL_SOUL_CONSTRICTOR}&view=events&start={max(f_start, cts - 2000)}&end={min(f_end, cts + 4000)}",
                        "replay_url": build_replay_url(report_code, fid, rel_ms),
                    }
                )
                for p in cpids:
                    last_soak_idx_by_pid[p] = s_idx

    def _group_roster(gmap: dict[int, str], key: str) -> list[dict[str, Any]]:
        return [
            {"player": actors[p]["name"], "class": actors[p].get("subType", ""), "player_id": p}
            for p, k in sorted(gmap.items(), key=lambda kv: actors[kv[0]]["name"])
            if k == key and p in actors
        ]

    soak_groups_out = {
        "p2": {
            "group_a_label": shat_label_a,
            "group_a_class": shat_class_a,
            "group_a_players": _group_roster(p2_group_by_pid, "A"),
            "group_b_label": shat_label_b,
            "group_b_class": shat_class_b,
            "group_b_players": _group_roster(p2_group_by_pid, "B"),
        },
        "shattering": {
            "confidence": shat_confidence,
            "rounds_observed": complete_shat_rounds,
            "groups": [
                {
                    "key": gk,
                    "label": shat_labels[gk],
                    "players": _group_roster(shat_group_by_pid, gk),
                }
                for gk in shat_keys
            ],
        },
        "p1": {
            "group_a_label": "Soak-Gruppe 1",
            "group_a_class": "",
            "group_a_players": _group_roster(p1_group_by_pid, "A"),
            "group_b_label": "Soak-Gruppe 2",
            "group_b_class": "",
            "group_b_players": _group_roster(p1_group_by_pid, "B"),
        },
    }

    group_soaks.sort(key=lambda x: (x["pull_num"], x["timestamp"]))
    return soak_groups_out, group_soaks


def _build_healer_analysis(
    sorted_fights: list[dict[str, Any]],
    actors: dict[int, dict[str, Any]],
    abilities: dict[int, str],
    events_by_fight: dict[int, list[dict[str, Any]]],
    tank_id_set: set[int],
    extra_tables: dict[str, Any] | None,
    report_code: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Compute separate Emergency-Heal (<35% single-target) & Boss-Tank Soak reactions per healer."""
    et = extra_tables or {}
    raw_hbf = et.get("healers_by_fight") or {}
    healers_by_fight: dict[int, dict[int, str]] = {}
    for fid_k, hmap in raw_hbf.items():
        if not isinstance(hmap, dict):
            continue
        healers_by_fight[int(fid_k)] = {int(pid_k): str(spec or "") for pid_k, spec in hmap.items()}

    if not healers_by_fight:
        return [], [], []

    raw_low_hp = et.get("low_hp_damage_by_fight") or {}
    low_hp_by_fight: dict[int, list[dict[str, Any]]] = {
        int(k): list(v or []) for k, v in raw_low_hp.items()
    }
    raw_hcasts = et.get("healer_casts_by_fight") or {}
    hcasts_by_fight: dict[int, list[dict[str, Any]]] = {
        int(k): list(v or []) for k, v in raw_hcasts.items()
    }

    # Pre-scan known spells cast by each healer across the entire report (for talented/optional instant CDs)
    known_healer_spells: dict[int, set[str]] = defaultdict(set)
    for fid, cevs in hcasts_by_fight.items():
        for ev in cevs:
            if ev.get("type") != "cast":
                continue
            src = ev.get("sourceID")
            if src is None:
                continue
            aid = ev.get("abilityGameID")
            ab_low = (abilities.get(aid, "") or "").strip().lower()
            if ab_low:
                known_healer_spells[int(src)].add(ab_low)

    healer_pull_counts: Counter[int] = Counter()
    healer_spec_counts: dict[int, Counter[str]] = defaultdict(Counter)
    for fid, hmap in healers_by_fight.items():
        for hid, spec in hmap.items():
            if hid in actors and actors[hid].get("type") == "Player":
                healer_pull_counts[hid] += 1
                if spec:
                    healer_spec_counts[hid][spec] += 1

    healers_out = [
        {
            "id": hid,
            "name": actors[hid]["name"],
            "class": actors[hid].get("subType", ""),
            "spec": healer_spec_counts[hid].most_common(1)[0][0] if healer_spec_counts[hid] else "",
            "pulls": count,
        }
        for hid, count in sorted(healer_pull_counts.items(), key=lambda kv: actors[kv[0]]["name"])
    ]

    emergency_events: list[dict[str, Any]] = []
    tank_soak_events: list[dict[str, Any]] = []

    for pull_idx, fight in enumerate(sorted_fights, start=1):
        fid = int(fight["id"])
        f_start = int(fight["startTime"])
        f_end = int(fight["endTime"])
        is_kill = bool(fight.get("kill", False))
        fight_healers = {
            hid: spec
            for hid, spec in healers_by_fight.get(fid, {}).items()
            if hid in actors and actors[hid].get("type") == "Player"
        }
        if not fight_healers:
            continue

        fevs = sorted(events_by_fight.get(fid, []), key=lambda e: int(e["timestamp"]))

        # Deduplicated deaths for this fight
        player_deaths: list[tuple[int, int]] = []
        deaths_by_player: dict[int, list[int]] = defaultdict(list)
        seen_dk: set[tuple[int, int]] = set()
        for ev in fevs:
            if ev.get("type") == "death":
                tid = ev.get("targetID")
                if tid in actors and actors[tid].get("type") == "Player":
                    ts = int(ev["timestamp"])
                    if (tid, ts) not in seen_dk:
                        seen_dk.add((tid, ts))
                        player_deaths.append((ts, tid))
                        deaths_by_player[tid].append(ts)

        def count_deaths_before(ts_now: int) -> int:
            return sum(1 for dts, _ in player_deaths if dts < ts_now)

        # Index healer casts & begincasts for this fight
        raw_casts = hcasts_by_fight.get(fid)
        if raw_casts is None:
            raw_casts = [
                ev for ev in fevs if ev.get("type") in ("cast", "begincast") and ev.get("sourceID") in fight_healers
            ]
        sorted_casts = sorted(raw_casts, key=lambda e: int(e["timestamp"]))

        recent_begincast: dict[tuple[int, int], int] = {}
        healer_all_cast_ts: dict[int, list[int]] = defaultdict(list)
        healer_cd_casts: dict[int, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
        healer_targeted_heals: dict[int, list[dict[str, Any]]] = defaultdict(list)

        for ev in sorted_casts:
            src = ev.get("sourceID")
            if src is None or int(src) not in fight_healers:
                continue
            hid = int(src)
            ts = int(ev["timestamp"])
            aid = int(ev.get("abilityGameID") or 0)
            et = ev.get("type")
            if et == "begincast":
                recent_begincast[(hid, aid)] = ts
                healer_all_cast_ts[hid].append(ts)
                continue
            if et != "cast":
                continue

            healer_all_cast_ts[hid].append(ts)
            ab_name = (abilities.get(aid, "") or "").strip()
            ab_low = ab_name.lower()
            if ab_low:
                healer_cd_casts[hid][ab_low].append(ts)

            tid = ev.get("targetID")
            if tid in actors and actors[tid].get("type") == "Player" and is_healer_direct_heal(ab_name):
                bc_ts = recent_begincast.get((hid, aid))
                if bc_ts is not None and 150 <= ts - bc_ts <= 3500:
                    is_hardcast = True
                    start_ts = bc_ts
                else:
                    is_hardcast = False
                    start_ts = ts
                healer_targeted_heals[hid].append(
                    {
                        "start_ts": start_ts,
                        "cast_ts": ts,
                        "target_id": int(tid),
                        "spell": ab_name,
                        "is_hardcast": is_hardcast,
                        "is_external": is_healer_external_spell(ab_name),
                    }
                )

        def is_healer_dead_at(hid: int, ts_now: int) -> bool:
            dlist = [dts for dts in deaths_by_player.get(hid, []) if dts <= ts_now]
            if not dlist:
                return False
            last_death = max(dlist)
            # If healer cast anything after their last death (e.g. Battle Rez), they are alive again
            return not any(last_death < cts <= ts_now for cts in healer_all_cast_ts.get(hid, []))

        def compute_ready_instants(hid: int, ts_now: int) -> list[str]:
            cls = actors[hid].get("subType", "")
            spec = fight_healers.get(hid, "")
            specs = get_healer_instant_specs(cls, spec)
            ready: list[str] = []
            for entry in specs:
                sname = str(entry["name"])
                slow = sname.lower()
                if not entry.get("baseline") and slow not in known_healer_spells.get(hid, set()):
                    continue
                cd_ms = int(entry["cd_ms"])
                charges = int(entry.get("charges", 1))
                recharges: list[int] = []
                for cts in healer_cd_casts[hid].get(slow, []):
                    if cts >= ts_now:
                        break
                    recharges = [r for r in recharges if r > cts]
                    base = recharges[-1] if recharges else cts
                    recharges.append(base + cd_ms)
                    if len(recharges) > charges:
                        recharges = recharges[-charges:]
                active_recharges = [r for r in recharges if r > ts_now]
                if len(active_recharges) < charges:
                    ready.append(sname)
            return ready

        # ---- Part A: Emergency Heals (isolated single-target <35% non-tank drops, <= 3 players low in +-2s) ----
        raw_low = low_hp_by_fight.get(fid)
        if raw_low is None:
            raw_low = [ev for ev in fevs if ev.get("type") == "damage"]
        low_hits: list[tuple[int, int, float, str]] = []
        for ev in sorted(raw_low, key=lambda e: int(e["timestamp"])):
            if ev.get("type") != "damage":
                continue
            tid = ev.get("targetID")
            if tid not in actors or actors[tid].get("type") != "Player":
                continue
            hp = ev.get("hitPoints")
            mhp = ev.get("maxHitPoints")
            if hp is None or not mhp or mhp <= 0:
                continue
            hp_pct = round((hp / mhp) * 100.0, 1)
            if 0.0 < hp_pct < 35.0:
                aid = ev.get("abilityGameID")
                ab_name = (abilities.get(aid, str(aid)) if aid else "Unbekannt") or "Unbekannt"
                low_hits.append((int(ev["timestamp"]), int(tid), hp_pct, ab_name))

        last_emerg_ts_by_victim: dict[int, int] = {}
        for ts, tid, hp_pct, ab_name in low_hits:
            if tid in tank_id_set:
                continue
            # Raid-wide drop check: count unique players <35% within +-2000ms
            concurrent_low = {p for hts, p, _, _ in low_hits if ts - 2000 <= hts <= ts + 2000}
            if len(concurrent_low) > 3:
                continue
            if ts - last_emerg_ts_by_victim.get(tid, -999999) < 4000:
                continue
            last_emerg_ts_by_victim[tid] = ts

            next_deaths = [dts - ts for dts in deaths_by_player.get(tid, []) if dts >= ts]
            time_to_death_ms = min(next_deaths) if next_deaths else None
            target_died = time_to_death_ms is not None and time_to_death_ms <= 4500
            reactions: list[dict[str, Any]] = []

            for hid in sorted(fight_healers.keys(), key=lambda x: actors[x]["name"]):
                if hid == tid or is_healer_dead_at(hid, ts):
                    continue
                ready_inst = compute_ready_instants(hid, ts)
                matched_heal = next(
                    (
                        h
                        for h in healer_targeted_heals.get(hid, [])
                        if h["target_id"] == tid
                        and h["cast_ts"] >= ts
                        and ts - 500 <= h["start_ts"] <= ts + 4000
                    ),
                    None,
                )
                if matched_heal is not None:
                    rx_ms = max(0, int(matched_heal["start_ts"]) - ts)
                    status = "cast_used" if matched_heal["is_hardcast"] else "instant_used"
                    reactions.append(
                        {
                            "healer": actors[hid]["name"],
                            "healer_class": actors[hid].get("subType", ""),
                            "healer_spec": fight_healers[hid],
                            "healer_id": hid,
                            "status": status,
                            "reaction_ms": rx_ms,
                            "spell": matched_heal["spell"],
                            "is_external": bool(matched_heal["is_external"]),
                            "instant_was_ready": bool(ready_inst),
                            "ready_instants": ready_inst,
                            "covered_fast_by_other": False,
                        }
                    )
                else:
                    reactions.append(
                        {
                            "healer": actors[hid]["name"],
                            "healer_class": actors[hid].get("subType", ""),
                            "healer_spec": fight_healers[hid],
                            "healer_id": hid,
                            "status": "no_heal",
                            "reaction_ms": None,
                            "spell": None,
                            "is_external": False,
                            "instant_was_ready": bool(ready_inst),
                            "ready_instants": ready_inst,
                            "covered_fast_by_other": False,
                        }
                    )

            if not reactions:
                continue

            reacted = [r for r in reactions if r["reaction_ms"] is not None]
            fastest = min(reacted, key=lambda r: int(r["reaction_ms"])) if reacted else None
            fastest_ms = int(fastest["reaction_ms"]) if fastest else None
            fastest_healer = fastest["healer"] if fastest else None
            fastest_healer_class = fastest["healer_class"] if fastest else None

            if not target_died and fastest_ms is not None and fastest_ms <= 1200:
                for r in reactions:
                    if r["status"] == "no_heal":
                        r["covered_fast_by_other"] = True

            rel_ms = ts - f_start
            emergency_events.append(
                {
                    "id": f"{report_code}-{fid}-{tid}-{ts}-hem",
                    "pull_num": pull_idx,
                    "fight_id": fid,
                    "is_kill": is_kill,
                    "rel_time": format_rel_time(rel_ms),
                    "rel_ms": rel_ms,
                    "timestamp": ts,
                    "deaths_before": count_deaths_before(ts),
                    "victim": actors[tid]["name"],
                    "victim_class": actors[tid].get("subType", ""),
                    "victim_id": tid,
                    "trigger_ability": ab_name,
                    "hp_pct": hp_pct,
                    "concurrent_low_count": len(concurrent_low),
                    "target_died": target_died,
                    "time_to_death_ms": time_to_death_ms,
                    "fastest_reaction_ms": fastest_ms,
                    "fastest_healer": fastest_healer,
                    "fastest_healer_class": fastest_healer_class,
                    "reactions": reactions,
                    "events_url": build_events_url(report_code, fid, tid, ts, f_start, f_end),
                    "replay_url": build_replay_url(report_code, fid, rel_ms),
                }
            )

        # ---- Part B: Boss-Tank Soak Heal (Mother's Wrath / Stone Venom windows) ----
        soak_windows: list[dict[str, Any]] = []
        active_win_by_tank: dict[int, dict[str, Any]] = {}

        def _flush_soak(tk_id: int) -> None:
            w = active_win_by_tank.pop(tk_id, None)
            if w is not None:
                soak_windows.append(w)

        for ev in fevs:
            tid = ev.get("targetID")
            if tid not in tank_id_set:
                continue
            t = ev.get("type")
            aid = ev.get("abilityGameID")
            ts = int(ev["timestamp"])
            is_soak_ev = (aid == SPELL_STONE_VENOM_DEBUFF and t in ("applydebuff", "applydebuffstack")) or (
                aid == SPELL_MOTHERS_WRATH_DMG and t == "damage"
            )
            if is_soak_ev:
                cur = active_win_by_tank.get(tid)
                if cur is not None and ts - int(cur["last_stack_ts"]) > 3000:
                    _flush_soak(tid)
                    cur = None
                if cur is None:
                    st = int(ev.get("stack", 1)) if aid == SPELL_STONE_VENOM_DEBUFF else 1
                    active_win_by_tank[tid] = {
                        "tank_id": int(tid),
                        "start_ts": ts,
                        "last_stack_ts": ts,
                        "stacks": max(1, st),
                    }
                else:
                    cur["last_stack_ts"] = ts
                    if aid == SPELL_STONE_VENOM_DEBUFF:
                        if "stack" in ev:
                            cur["stacks"] = max(int(cur["stacks"]), int(ev["stack"]))
                        elif t == "applydebuffstack":
                            cur["stacks"] = int(cur["stacks"]) + 1

        for tk_id in list(active_win_by_tank.keys()):
            _flush_soak(tk_id)

        # Collect all tank HP samples from fevs + low_hp_by_fight to find min_hp_pct in each soak window
        tank_hp_samples: dict[int, list[tuple[int, float]]] = defaultdict(list)
        for src_list in (fevs, raw_low):
            for ev in src_list:
                if ev.get("type") != "damage":
                    continue
                tid = ev.get("targetID")
                if tid not in tank_id_set:
                    continue
                hp = ev.get("hitPoints")
                mhp = ev.get("maxHitPoints")
                if hp is not None and mhp and mhp > 0:
                    tank_hp_samples[int(tid)].append((int(ev["timestamp"]), round((hp / mhp) * 100.0, 1)))

        soak_windows.sort(key=lambda w: int(w["start_ts"]))
        for w in soak_windows:
            tk_id = int(w["tank_id"])
            w_start = int(w["start_ts"])
            w_end = int(w["last_stack_ts"]) + 5000
            hp_vals = [pct for hts, pct in tank_hp_samples.get(tk_id, []) if w_start <= hts <= w_end]
            min_hp_pct = min(hp_vals) if hp_vals else None
            tank_died = any(w_start <= dts <= w_end for dts in deaths_by_player.get(tk_id, []))

            soak_rx: list[dict[str, Any]] = []
            for hid in sorted(fight_healers.keys(), key=lambda x: actors[x]["name"]):
                if is_healer_dead_at(hid, w_start):
                    continue
                matched = [
                    h
                    for h in healer_targeted_heals.get(hid, [])
                    if h["target_id"] == tk_id
                    and w_start - 1000 <= h["cast_ts"] <= w_end
                    and h["start_ts"] <= w_end
                ]
                healed = len(matched) > 0
                rx_ms = max(0, int(matched[0]["start_ts"]) - w_start) if healed else None
                used_ext = any(m["is_external"] for m in matched)
                uniq_spells = list(dict.fromkeys(m["spell"] for m in matched))[:4]
                soak_rx.append(
                    {
                        "healer": actors[hid]["name"],
                        "healer_class": actors[hid].get("subType", ""),
                        "healer_spec": fight_healers[hid],
                        "healer_id": hid,
                        "healed": healed,
                        "reaction_ms": rx_ms,
                        "heal_count": len(matched),
                        "used_external": used_ext,
                        "spells": uniq_spells,
                    }
                )

            if not soak_rx:
                continue

            healed_list = [r for r in soak_rx if r["healed"] and r["reaction_ms"] is not None]
            fastest_tk = min(healed_list, key=lambda r: int(r["reaction_ms"])) if healed_list else None
            rel_ms = w_start - f_start
            tank_soak_events.append(
                {
                    "id": f"{report_code}-{fid}-{tk_id}-{w_start}-hts",
                    "pull_num": pull_idx,
                    "fight_id": fid,
                    "is_kill": is_kill,
                    "rel_time": format_rel_time(rel_ms),
                    "rel_ms": rel_ms,
                    "timestamp": w_start,
                    "deaths_before": count_deaths_before(w_start),
                    "tank": actors[tk_id]["name"],
                    "tank_class": actors[tk_id].get("subType", ""),
                    "tank_id": tk_id,
                    "stacks": int(w["stacks"]),
                    "min_hp_pct": min_hp_pct,
                    "tank_died": tank_died,
                    "any_healed": len(healed_list) > 0,
                    "healers_reacted_count": len(healed_list),
                    "fastest_reaction_ms": int(fastest_tk["reaction_ms"]) if fastest_tk else None,
                    "fastest_healer": fastest_tk["healer"] if fastest_tk else None,
                    "reactions": soak_rx,
                    "events_url": build_events_url(report_code, fid, tk_id, w_start, f_start, f_end),
                    "replay_url": build_replay_url(report_code, fid, rel_ms),
                }
            )

    emergency_events.sort(key=lambda x: (x["pull_num"], x["timestamp"]))
    tank_soak_events.sort(key=lambda x: (x["pull_num"], x["timestamp"]))
    return healers_out, emergency_events, tank_soak_events


def merge_report_into_store(store: dict[str, Any] | None, new_report: dict[str, Any]) -> dict[str, Any]:
    """Idempotently insert or update a report in reports.json, preserving label if omitted."""
    existing_reports = list(store.get("reports", [])) if store else []
    code = new_report["code"]
    merged = dict(new_report)

    remaining: list[dict[str, Any]] = []
    for rep in existing_reports:
        if rep.get("code") == code:
            if not merged.get("label") and rep.get("label"):
                merged["label"] = rep["label"]
        else:
            remaining.append(rep)

    remaining.append(merged)
    remaining.sort(key=lambda r: int(r.get("start_time_epoch_ms", 0) or 0), reverse=True)

    return {
        "schema_version": 1,
        "updated_at": datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "reports": remaining,
    }
