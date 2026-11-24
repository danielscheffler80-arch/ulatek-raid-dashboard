"""Pure combat-log analysis engine for Ula'tek Mythic WarcraftLogs reports."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

from scripts.spells_config import (
    CLASS_BASELINE_DEFS,
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
    SPELL_NOXIOUS_SHELL_DEBUFF,
    SPELL_NOXIOUS_SPLASH,
    SPELL_PUTRID_MEMBRANE_DEBUFF,
    SPELL_RANCID_YOLK,
    SPELL_SOUL_CONSTRICTOR,
    SPELL_SPECTRAL_COILS_CAST,
    SPELL_STONE_VENOM_DEBUFF,
    SPELL_STONE_VENOM_DMG,
    ULATEK_ENCOUNTER_ID,
    get_defensive_cooldown_ms,
    is_defensive_buff,
    is_health_potion,
    is_healthstone,
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
    extra = extra_tables or {}
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

        for ev in fevs:
            for key in ("sourceID", "targetID"):
                aid_actor = ev.get(key)
                if aid_actor in actors and actors[aid_actor].get("type") == "Player":
                    fight_players.add(aid_actor)
            if ev.get("type") == "death":
                tid = ev.get("targetID")
                if tid in actors and actors[tid].get("type") == "Player":
                    ts = int(ev["timestamp"])
                    player_deaths.append((ts, tid, ev))
                    deaths_by_player[tid].append(ts)

        for pid in fight_players:
            player_pulls_present[pid] += 1

        def count_deaths_before(ts: int) -> int:
            return sum(1 for dts, _, _ in player_deaths if dts < ts)

        # ---- 1. Index events for Egg Fails & Wave Fails ----
        coils_casts: list[int] = []
        cw_hits_by_p: dict[int, list[dict[str, Any]]] = defaultdict(list)
        splash_by_p: dict[int, list[dict[str, Any]]] = defaultdict(list)
        constrictor_by_p: dict[int, list[int]] = defaultdict(list)
        putrid_by_p: dict[int, list[int]] = defaultdict(list)
        rancid_by_p: dict[int, list[int]] = defaultdict(list)
        shell_removes: list[dict[str, Any]] = []

        # Track consumables & active defensive buffs across the fight
        pot_counts: Counter[int] = Counter()
        hs_counts: Counter[int] = Counter()
        def_cd_casts: Counter[int] = Counter()

        # Cooldown readiness state per player inside this fight
        last_def_used_ts: dict[int, dict[str, int]] = defaultdict(dict)
        last_pot_ts: dict[int, int] = {}
        last_hs_ts: dict[int, tuple[int, bool]] = {}

        # Also track active defensive buff intervals per player via single pass
        active_tank_defs: dict[int, set[str]] = defaultdict(set)
        active_all_defs: dict[int, set[str]] = defaultdict(set)

        # Heart Phase & P2/P3 tracking per fight
        debris_hits_in_fight: list[tuple[int, int]] = []  # (player_id, ts)
        fang_breaks: list[tuple[int, int]] = []  # (ts, player_id)
        malice_missed_casts: list[int] = []
        malice_dmg_events: list[tuple[int, int]] = []  # (ts, amount)
        vicious_missed_casts: list[int] = []
        warden_death_ts: list[int] = []

        def compute_readiness(pid: int, ts_now: int) -> tuple[list[str], bool, bool, bool]:
            active_low = {n.lower() for n in active_all_defs[pid]}
            ready: list[str] = []
            for low_name, disp_name in player_known_defs.get(pid, {}).items():
                if low_name in active_low:
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

        # Track Stone Venom state per tank
        sv_active: dict[int, bool] = defaultdict(bool)
        sv_stacks: dict[int, int] = defaultdict(int)
        sv_window_fail: dict[int, dict[str, Any] | None] = defaultdict(lambda: None)

        # Track last Ula'tek tanking event timestamp per tank (Melee or Stone Venom)
        last_boss_tank_ts: dict[int, int] = {}

        # Track low-HP spike cooldown per player (dedupe within 4000ms per spike)
        last_spike_event_ts: dict[int, int] = {}

        # Track which CW event timestamps broke a Noxious Shell (filled after shell pass)
        cw_broke_shell_keys: set[tuple[int, int]] = set()

        def _finalize_sv_fail(tk_id: int, end_ts: int) -> None:
            pending = sv_window_fail[tk_id]
            if pending is None:
                return
            last_low = int(pending.pop("_last_low_ts", pending["timestamp"]))
            window_end = max(end_ts, last_low) + 5000
            matched_death = None
            for dts, dtid, dev in player_deaths:
                if dtid == tk_id and pending["timestamp"] <= dts <= window_end:
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
            elif aid == SPELL_CAUSTIC_WAVES and t == "damage" and not ev.get("tick"):
                if tid in actors and actors[tid].get("type") == "Player":
                    cw_hits_by_p[tid].append(ev)
            elif aid == SPELL_NOXIOUS_SPLASH and t == "damage":
                if tid in actors and actors[tid].get("type") == "Player":
                    splash_by_p[tid].append(ev)
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

            if t == "interrupt" and src_id in actors and actors[src_id].get("type") == "Player":
                ex_aid = ev.get("extraAbilityGameID")
                ex_name = (abilities.get(ex_aid, "") or "").strip()
                ex_low = ex_name.lower()
                if ex_aid == SPELL_MALICE_CAST or "malice" in ex_low:
                    rel_ms = ts - f_start
                    phase_events.append(
                        {
                            "id": f"{report_code}-{fid}-{src_id}-{ts}-mkick",
                            "kind": "malice_kick",
                            "phase": "p2",
                            "player": actors[src_id]["name"],
                            "class": actors[src_id].get("subType", ""),
                            "target_id": src_id,
                            "ability": ex_name or "Malice",
                            "detail": ab_name or "Interrupt",
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
                    phase_events.append(
                        {
                            "id": f"{report_code}-{fid}-{src_id}-{ts}-vkick",
                            "kind": "vicious_echoes_kick",
                            "phase": "p3",
                            "player": actors[src_id]["name"],
                            "class": actors[src_id].get("subType", ""),
                            "target_id": src_id,
                            "ability": ex_name or "Vicious Echoes",
                            "detail": ab_name or "Interrupt",
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
                if aid == SPELL_MALICE_CAST:
                    if not malice_missed_casts or (ts - malice_missed_casts[-1]) >= 2500:
                        malice_missed_casts.append(ts)
                elif any(s in ab_low for s in P3_KICK_SPELL_NAMES):
                    if not vicious_missed_casts or (ts - vicious_missed_casts[-1]) >= 2500:
                        vicious_missed_casts.append(ts)

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

            # Stone Venom < 30% HP without def-CD / external
            if tid in tank_id_set and aid == SPELL_STONE_VENOM_DEBUFF:
                if t == "applydebuff":
                    sv_active[tid] = True
                    sv_stacks[tid] = int(ev.get("stack", 1))
                    sv_window_fail[tid] = None
                elif t in ("applydebuffstack", "refreshdebuff"):
                    sv_active[tid] = True
                    if "stack" in ev:
                        sv_stacks[tid] = int(ev["stack"])
                    else:
                        sv_stacks[tid] = max(1, sv_stacks[tid] + (1 if t == "applydebuffstack" else 0))
                elif t == "removedebuff":
                    _finalize_sv_fail(tid, ts)
                    sv_active[tid] = False
                    sv_stacks[tid] = 0

            if tid in tank_id_set and sv_active[tid] and t == "damage":
                hp = ev.get("hitPoints")
                mhp = ev.get("maxHitPoints")
                if hp is not None and mhp and mhp > 0:
                    hp_pct = round((hp / mhp) * 100.0, 1)
                    if hp_pct < 30.0 and not active_tank_defs[tid]:
                        rel_ms = ts - f_start
                        cur_fail = sv_window_fail[tid]
                        if cur_fail is None:
                            other_tanks = [actors[ot]["name"] for ot in tank_ids if ot != tid]
                            r_defs, r_pot, r_hs, r_any = compute_readiness(tid, ts)
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
                                "_last_low_ts": ts,
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
                            cur_fail["_last_low_ts"] = ts
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
                            "tank_was_dead": tank_was_dead,
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
                            defs_now = sorted(active_all_defs[tid])
                            r_defs, r_pot, r_hs, r_any = compute_readiness(tid, ts)
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
                                    "ready_defs": r_defs,
                                    "pot_ready": r_pot,
                                    "hs_ready": r_hs,
                                    "any_ready": r_any,
                                    "pot_used_in_pull": pot_counts[tid] > 0,
                                    "hs_used_in_pull": hs_counts[tid] > 0,
                                    "events_url": build_events_url(report_code, fid, tid, ts, f_start, f_end),
                                    "replay_url": build_replay_url(report_code, fid, rel_ms),
                                }
                            )
                elif t == "death":
                    rel_ms = ts - f_start
                    kaid = ev.get("killingAbilityGameID")
                    kab_name = abilities.get(kaid, str(kaid)) if kaid else "Unbekannt"
                    defs_now = sorted(active_all_defs[tid])
                    r_defs, r_pot, r_hs, r_any = compute_readiness(tid, ts)
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
                            "ready_defs": r_defs,
                            "pot_ready": r_pot,
                            "hs_ready": r_hs,
                            "any_ready": r_any,
                            "pot_used_in_pull": pot_counts[tid] > 0,
                            "hs_used_in_pull": hs_counts[tid] > 0,
                            "events_url": build_events_url(report_code, fid, tid, ts, f_start, f_end),
                            "replay_url": build_replay_url(report_code, fid, rel_ms),
                        }
                    )

        # Flush any still-open Stone Venom window at fight end
        for tk in list(sv_window_fail.keys()):
            _finalize_sv_fail(tk, f_end)

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
        for mts in malice_missed_casts:
            rel_ms = mts - f_start
            total_malice_dmg = sum(amt for dts, amt in malice_dmg_events if mts <= dts <= mts + 5000)
            phase_events.append(
                {
                    "id": f"{report_code}-{fid}-{mts}-mmiss",
                    "kind": "malice_missed",
                    "phase": "p2",
                    "player": "Raid (nicht gekickt)",
                    "class": "",
                    "target_id": 0,
                    "ability": "Malice",
                    "detail": "Cast durchgekommen",
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
        for vts in vicious_missed_casts:
            rel_ms = vts - f_start
            phase_events.append(
                {
                    "id": f"{report_code}-{fid}-{vts}-vmiss",
                    "kind": "vicious_echoes_missed",
                    "phase": "p3",
                    "player": "Raid (nicht gekickt)",
                    "class": "",
                    "target_id": 0,
                    "ability": "Vicious Echoes",
                    "detail": "Raid-Stun durchgekommen",
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
            debris_counts: Counter[int] = Counter(
                dpid for dpid, dts in debris_hits_in_fight if hs - 500 <= dts <= he + 500
            )
            pids = sorted((set(h_map) | set(b_map) | set(t_map) | set(debris_counts)) & {pid for pid, a in actors.items() if a.get("type") == "Player"})
            p_rows: list[dict[str, Any]] = []
            for pid in pids:
                hd = h_map.get(pid, 0)
                bd = b_map.get(pid, 0)
                eff = hd + bd
                tot = max(eff, t_map.get(pid, eff))
                other = max(0, tot - eff)
                share = round((hd / eff) * 100.0, 1) if eff > 0 else 0.0
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
        for rem in shell_removes:
            tid = rem.get("targetID")
            if tid not in actors or actors[tid].get("type") != "Player":
                continue
            rts = int(rem["timestamp"])
            is_coils = any(abs(rts - cc) <= 5 for cc in coils_casts)
            has_constrictor = any(0 <= ct - rts <= 50 for ct in constrictor_by_p[tid])
            cw_near = [e for e in cw_hits_by_p[tid] if -50 <= int(e["timestamp"]) - rts <= 50]
            splash_near = [e for e in splash_by_p[tid] if -50 <= int(e["timestamp"]) - rts <= 50]
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
                        "events_url": build_events_url(report_code, fid, tid, cts, f_start, f_end),
                        "replay_url": build_replay_url(report_code, fid, rel_ms),
                    }
                )
            elif splash_near:
                removal_summary["noxious_splash"] += 1
                first_sp = min(splash_near, key=lambda e: int(e["timestamp"]))
                sts = int(first_sp["timestamp"])
                rel_ms = sts - f_start
                ovk = int(first_sp.get("overkill", 0) or 0)
                lethal = ovk > 0 or any(abs(dt - sts) <= 50 for dt in deaths_by_player[tid])
                egg_fails.append(
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
                        "events_url": build_events_url(report_code, fid, tid, sts, f_start, f_end),
                        "replay_url": build_replay_url(report_code, fid, rel_ms),
                    }
                )
            elif death_near:
                removal_summary["player_death"] += 1
            else:
                removal_summary["other"] += 1

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

    return {
        "code": report_code,
        "title": meta.get("title", report_code),
        "label": label.strip() if isinstance(label, str) and label.strip() else None,
        "date_iso": date_iso,
        "start_time_epoch_ms": start_epoch,
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
        "players": players_out,
        "removal_summary": {
            "spectral_coils": removal_summary["spectral_coils"],
            "caustic_waves": removal_summary["caustic_waves"],
            "noxious_splash": removal_summary["noxious_splash"],
            "player_death": removal_summary["player_death"],
            "other": removal_summary["other"],
        },
        "pulls": pulls_out,
        "egg_fails": sorted(egg_fails, key=lambda x: (x["pull_num"], x["timestamp"])),
        "wave_fails": sorted(wave_fails, key=lambda x: (x["pull_num"], x["timestamp"])),
        "tank_fails": sorted(tank_fails, key=lambda x: (x["pull_num"], x["timestamp"])),
        "defensive_events": sorted(defensive_events, key=lambda x: (x["pull_num"], x["timestamp"])),
        "consumable_usage": consumable_usage,
        "heart_phases": sorted(heart_phases, key=lambda x: (x["pull_num"], x["window_num"])),
        "phase_events": sorted(phase_events, key=lambda x: (x["pull_num"], x["timestamp"])),
        "warden_summaries": sorted(warden_summaries, key=lambda x: x["pull_num"]),
        "p3_summaries": sorted(p3_summaries, key=lambda x: x["pull_num"]),
    }


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
