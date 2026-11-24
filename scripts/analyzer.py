"""Pure combat-log analysis engine for Ula'tek Mythic WarcraftLogs reports."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

from scripts.spells_config import (
    MYTHIC_DIFFICULTY,
    RAID_SPIKE_ABILITY_IDS,
    SPELL_CAUSTIC_WAVES,
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
    is_defensive_buff,
    is_health_potion,
    is_healthstone,
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
) -> dict[str, Any]:
    """Run complete Ula'tek Mythic analysis across all fights in a report."""
    sorted_fights = sorted(fights, key=lambda f: f["startTime"])
    tank_ids = _detect_tanks(actors, events_by_fight)
    tank_id_set = set(tank_ids)

    pulls_out: list[dict[str, Any]] = []
    egg_fails: list[dict[str, Any]] = []
    wave_fails: list[dict[str, Any]] = []
    tank_fails: list[dict[str, Any]] = []
    defensive_events: list[dict[str, Any]] = []
    consumable_usage: list[dict[str, Any]] = []
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

        # Also track active defensive buff intervals per player via single pass
        active_defs_at_event: list[set[str]] = []
        active_tank_defs: dict[int, set[str]] = defaultdict(set)
        active_all_defs: dict[int, set[str]] = defaultdict(set)

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
                    elif t == "cast" and is_healthstone(aid, ab_name):
                        hs_counts[actor_id] += 1

            # Defensive buff state machine
            if tid in actors and actors[tid].get("type") == "Player":
                if t in ("applybuff", "refreshbuff", "applybuffstack"):
                    if is_defensive_buff(ab_name, for_tank_stone_venom=False):
                        if ab_name not in active_all_defs[tid]:
                            def_cd_casts[tid] += 1
                        active_all_defs[tid].add(ab_name)
                    if is_defensive_buff(ab_name, for_tank_stone_venom=True):
                        active_tank_defs[tid].add(ab_name)
                elif t == "removebuff":
                    active_all_defs[tid].discard(ab_name)
                    active_tank_defs[tid].discard(ab_name)

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
                            "pot_used_in_pull": pot_counts[tid] > 0,
                            "hs_used_in_pull": hs_counts[tid] > 0,
                            "events_url": build_events_url(report_code, fid, tid, ts, f_start, f_end),
                            "replay_url": build_replay_url(report_code, fid, rel_ms),
                        }
                    )

        # Flush any still-open Stone Venom window at fight end
        for tk in list(sv_window_fail.keys()):
            _finalize_sv_fail(tk, f_end)

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
