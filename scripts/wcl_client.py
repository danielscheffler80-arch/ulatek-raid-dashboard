"""Zero-dependency WarcraftLogs v2 GraphQL API client."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from collections import defaultdict
from typing import Any

from scripts.spells_config import (
    NPC_DOOMSCALE_WARDEN_GAME_ID,
    NPC_ULATEK_GAME_ID,
    NPC_VENOMOUS_HEART_GAME_ID,
    P2_AVOIDABLE_IDS,
    P3_AVOIDABLE_SPELL_NAMES,
    P3_KICK_SPELL_NAMES,
    SPELL_BLIGHT_VEIN_DMG,
    SPELL_CAUSTIC_WAVES,
    SPELL_FALLING_DEBRIS,
    SPELL_GRASPING_FANGS_DEBUFF,
    SPELL_MALICE_CAST,
    SPELL_MALICE_DMG,
    SPELL_MEPHITIC_THRASH,
    SPELL_MOTHERS_WRATH_CAST,
    SPELL_MOTHERS_WRATH_DMG,
    SPELL_NECROTIC_VAPORS,
    SPELL_NOXIOUS_SHELL_DEBUFF,
    SPELL_NOXIOUS_SHELL_DMG,
    SPELL_NOXIOUS_SPLASH,
    SPELL_PUTRID_MEMBRANE_DEBUFF,
    SPELL_PUTRID_MEMBRANE_DMG,
    SPELL_RAGE_OF_THE_SHACKLED_BUFF,
    SPELL_RAGE_OF_THE_SHACKLED_DMG,
    SPELL_RANCID_YOLK,
    SPELL_RATTLER_SLAM,
    SPELL_SOUL_CONSTRICTOR,
    SPELL_SPECTRAL_COILS_CAST,
    SPELL_SPECTRAL_COILS_DMG,
    SPELL_STONE_VENOM_DEBUFF,
    SPELL_STONE_VENOM_DMG,
    SPELL_VENOMOUS_HEART_BUFF,
    is_defensive_buff,
    is_health_potion,
    is_healthstone,
    is_interrupt_spell,
)

CORE_MECHANIC_IDS = (
    SPELL_NOXIOUS_SHELL_DEBUFF,
    SPELL_NOXIOUS_SHELL_DMG,
    SPELL_CAUSTIC_WAVES,
    SPELL_NOXIOUS_SPLASH,
    SPELL_SPECTRAL_COILS_CAST,
    SPELL_SPECTRAL_COILS_DMG,
    SPELL_SOUL_CONSTRICTOR,
    SPELL_PUTRID_MEMBRANE_DEBUFF,
    SPELL_PUTRID_MEMBRANE_DMG,
    SPELL_RANCID_YOLK,
    SPELL_STONE_VENOM_DEBUFF,
    SPELL_STONE_VENOM_DMG,
    SPELL_MOTHERS_WRATH_CAST,
    SPELL_MOTHERS_WRATH_DMG,
    SPELL_MEPHITIC_THRASH,
    SPELL_RATTLER_SLAM,
    SPELL_NECROTIC_VAPORS,
    SPELL_VENOMOUS_HEART_BUFF,
    SPELL_RAGE_OF_THE_SHACKLED_BUFF,
    SPELL_RAGE_OF_THE_SHACKLED_DMG,
    SPELL_FALLING_DEBRIS,
    SPELL_GRASPING_FANGS_DEBUFF,
    SPELL_BLIGHT_VEIN_DMG,
    SPELL_MALICE_CAST,
    SPELL_MALICE_DMG,
    *sorted(P2_AVOIDABLE_IDS),
)


class WCLClient:
    """Thin OAuth2 + GraphQL client for WarcraftLogs v2 public API."""

    TOKEN_URL = "https://www.warcraftlogs.com/oauth/token"
    GRAPHQL_URL = "https://www.warcraftlogs.com/api/v2/client"

    def __init__(self, client_id: str, client_secret: str) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self._token: str | None = None

    def _get_token(self) -> str:
        if self._token:
            return self._token
        body = urllib.parse.urlencode(
            {
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            self.TOKEN_URL,
            data=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "UlatekRaidAnalyzer/1.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        self._token = payload["access_token"]
        return self._token

    def gql(self, query: str) -> dict[str, Any]:
        token = self._get_token()
        body = json.dumps({"query": query}).encode("utf-8")
        req = urllib.request.Request(
            self.GRAPHQL_URL,
            data=body,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "User-Agent": "UlatekRaidAnalyzer/1.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=90) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        if "errors" in result:
            raise RuntimeError(f"WarcraftLogs GraphQL error: {result['errors']}")
        return result["data"]

    def _fetch_events_paginated(
        self,
        code: str,
        start_time: int,
        end_time: int,
        fight_ids: list[int],
        data_type: str = "All",
        filter_expression: str | None = None,
        include_resources: bool = False,
    ) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        next_ts: int | None = start_time
        extra_args = [f"fightIDs: {json.dumps(fight_ids)}", f"dataType: {data_type}"]
        if include_resources:
            extra_args.append("includeResources: true")
        if filter_expression:
            extra_args.append(f"filterExpression: {json.dumps(filter_expression)}")

        while next_ts is not None:
            args = [f"startTime: {next_ts}", f"endTime: {end_time}", "limit: 10000"] + extra_args
            q = f"""
            query {{
              reportData {{
                report(code: "{code}") {{
                  events({", ".join(args)}) {{
                    data
                    nextPageTimestamp
                  }}
                }}
              }}
            }}
            """
            data = self.gql(q)
            block = data["reportData"]["report"]["events"]
            events.extend(block["data"])
            next_ts = block["nextPageTimestamp"]
        return events

    def fetch_report_bundle(
        self,
        code: str,
        encounter_id: int,
        difficulty: int,
    ) -> tuple[
        dict[str, Any],
        list[dict[str, Any]],
        dict[int, dict[str, Any]],
        dict[int, str],
        dict[int, list[dict[str, Any]]],
        dict[str, Any],
    ]:
        meta_q = f"""
        query {{
          reportData {{
            report(code: "{code}") {{
              title
              startTime
              endTime
              masterData {{
                actors {{
                  id
                  gameID
                  name
                  type
                  subType
                }}
                abilities {{
                  gameID
                  name
                  type
                }}
              }}
              fights(encounterID: {encounter_id}, difficulty: {difficulty}) {{
                id
                name
                startTime
                endTime
                fightPercentage
                bossPercentage
                kill
                friendlyPlayers
                phaseTransitions {{
                  id
                  startTime
                }}
              }}
            }}
          }}
        }}
        """
        report = self.gql(meta_q)["reportData"]["report"]
        if not report:
            raise RuntimeError(f"Report {code} nicht gefunden oder privat.")

        fights = report["fights"]
        if not fights:
            raise RuntimeError(
                f"Keine Pulls für Encounter {encounter_id} (Difficulty {difficulty}) im Report {code} gefunden."
            )

        actors = {int(a["id"]): a for a in report["masterData"]["actors"]}
        abilities = {int(a["gameID"]): a["name"] or "" for a in report["masterData"]["abilities"]}
        ability_schools = {
            int(a["gameID"]): int(a["type"])
            for a in report["masterData"]["abilities"]
            if a.get("type") is not None
        }
        fight_ids = [int(f["id"]) for f in fights]
        min_start = min(int(f["startTime"]) for f in fights)
        max_end = max(int(f["endTime"]) for f in fights)

        # Dynamically collect exact ability IDs present in this report for defensives, consumables & P3 spells
        def_ids = sorted(gid for gid, name in abilities.items() if is_defensive_buff(name))
        consumable_ids = sorted(
            gid
            for gid, name in abilities.items()
            if is_health_potion(gid, name) or is_healthstone(gid, name)
        )
        p3_dynamic_ids = sorted(
            gid
            for gid, name in abilities.items()
            if any(s in (name or "").lower() for s in (P3_KICK_SPELL_NAMES + P3_AVOIDABLE_SPELL_NAMES))
        )
        interrupt_ids = sorted(gid for gid, name in abilities.items() if is_interrupt_spell(name))

        # 1. Deaths (fast, exact killer info)
        deaths = self._fetch_events_paginated(
            code, min_start, max_end, fight_ids, data_type="Deaths", include_resources=False
        )

        # 2. Core Ula'tek mechanics + Boss/Gore Rattle Melees + Consumables + Interrupts + Warden Deaths
        all_core_ids = sorted(set(CORE_MECHANIC_IDS) | set(p3_dynamic_ids))
        core_id_list = ", ".join(str(i) for i in all_core_ids)
        parts = [
            f"ability.id in ({core_id_list})",
            '(type = "damage" and ability.id = 1 and (source.name = "Ula\'tek" or source.name = "Gore Rattle"))',
            'type = "interrupt"',
            '(type = "death" and target.name = "Doomscale Warden")',
        ]
        if consumable_ids:
            cons_list = ", ".join(str(i) for i in consumable_ids)
            parts.append(f'(type = "cast" and ability.id in ({cons_list}))')
        if interrupt_ids:
            int_list = ", ".join(str(i) for i in interrupt_ids)
            parts.append(f'(type = "cast" and ability.id in ({int_list}))')
        core_expr = " or ".join(parts)

        core_events = self._fetch_events_paginated(
            code,
            min_start,
            max_end,
            fight_ids,
            data_type="All",
            filter_expression=core_expr,
            include_resources=True,
        )

        # 2b. Lightweight Doomscale Warden damage events (only P2 fights, no HP resources) for exact Side 1 vs Side 2 player mapping
        p2_fight_ids = [
            int(f["id"])
            for f in fights
            if any(int(pt.get("id", 0)) == 2 for pt in (f.get("phaseTransitions") or []))
        ]
        warden_dmg_events: list[dict[str, Any]] = []
        if p2_fight_ids:
            p2_fights_objs = [f for f in fights if int(f["id"]) in set(p2_fight_ids)]
            p2_min = min(int(f["startTime"]) for f in p2_fights_objs)
            p2_max = max(int(f["endTime"]) for f in p2_fights_objs)
            warden_dmg_events = self._fetch_events_paginated(
                code,
                p2_min,
                p2_max,
                p2_fight_ids,
                data_type="DamageDone",
                filter_expression=f'type = "damage" and target.id = {NPC_DOOMSCALE_WARDEN_GAME_ID}',
                include_resources=False,
            )

        # 3. Defensive & External buffs (no HP resources needed -> super fast)
        def_events: list[dict[str, Any]] = []
        if def_ids:
            # Chunk ability IDs to avoid overly long filter expressions
            chunk_size = 45
            for i in range(0, len(def_ids), chunk_size):
                chunk = ", ".join(str(x) for x in def_ids[i : i + chunk_size])
                def_expr = (
                    f'(type = "applybuff" or type = "removebuff" or type = "refreshbuff" or type = "applybuffstack") '
                    f"and ability.id in ({chunk})"
                )
                def_events.extend(
                    self._fetch_events_paginated(
                        code,
                        min_start,
                        max_end,
                        fight_ids,
                        data_type="All",
                        filter_expression=def_expr,
                        include_resources=False,
                    )
                )

        events_by_fight: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for ev in deaths + core_events + warden_dmg_events + def_events:
            fid = ev.get("fight")
            if fid is not None:
                events_by_fight[int(fid)].append(ev)

        # 4. Batched DamageDone tables for Heart Phase windows, P2 Warden DPS, and P3 Boss DPS
        extra_tables = self._fetch_phase_damage_tables(code, fights, actors, events_by_fight)
        extra_tables["ability_schools"] = ability_schools

        meta = {
            "title": report.get("title", code),
            "startTime": report.get("startTime", 0),
            "endTime": report.get("endTime", 0),
        }
        return meta, fights, actors, abilities, events_by_fight, extra_tables

    def _fetch_phase_damage_tables(
        self,
        code: str,
        fights: list[dict[str, Any]],
        actors: dict[int, dict[str, Any]],
        events_by_fight: dict[int, list[dict[str, Any]]],
    ) -> dict[str, Any]:
        boss_actor_id = next(
            (aid for aid, a in actors.items() if a.get("gameID") == NPC_ULATEK_GAME_ID),
            next((aid for aid, a in actors.items() if a.get("name") == "Ula'tek" and a.get("subType") == "Boss"), None),
        )
        heart_actor_id = next(
            (aid for aid, a in actors.items() if a.get("gameID") == NPC_VENOMOUS_HEART_GAME_ID),
            next((aid for aid, a in actors.items() if a.get("name") == "Venomous Heart"), None),
        )
        warden_actor_id = next(
            (aid for aid, a in actors.items() if a.get("gameID") == NPC_DOOMSCALE_WARDEN_GAME_ID),
            next((aid for aid, a in actors.items() if a.get("name") == "Doomscale Warden"), None),
        )

        # Detect exact Heart windows per fight from Venomous Heart (1299526) / Rage of the Shackled (1286860)
        heart_specs: list[tuple[int, int, int, int]] = []  # (fid, win_num, start_ts, end_ts)
        p2_specs: list[tuple[int, int, int]] = []  # (fid, p2_start, f_end)
        p3_specs: list[tuple[int, int, int]] = []  # (fid, p3_start, f_end)

        for fight in sorted(fights, key=lambda f: int(f["startTime"])):
            fid = int(fight["id"])
            f_end = int(fight["endTime"])
            fevs = sorted(events_by_fight.get(fid, []), key=lambda e: int(e["timestamp"]))

            # Extract heart intervals
            win_start: int | None = None
            win_num = 0
            for ev in fevs:
                aid = ev.get("abilityGameID")
                t = ev.get("type")
                if aid == SPELL_VENOMOUS_HEART_BUFF:
                    if t == "applybuff" and win_start is None:
                        win_start = int(ev["timestamp"])
                    elif t == "removebuff" and win_start is not None:
                        win_num += 1
                        heart_specs.append((fid, win_num, win_start, int(ev["timestamp"])))
                        win_start = None
            if win_start is not None:
                win_num += 1
                heart_specs.append((fid, win_num, win_start, min(f_end, win_start + 21000)))

            # Fallback to Rage of the Shackled buff if Venomous Heart buff was absent
            if win_num == 0:
                for ev in fevs:
                    if ev.get("abilityGameID") == SPELL_RAGE_OF_THE_SHACKLED_BUFF:
                        if ev.get("type") == "applybuff" and win_start is None:
                            win_start = int(ev["timestamp"])
                        elif ev.get("type") == "removebuff" and win_start is not None:
                            win_num += 1
                            heart_specs.append((fid, win_num, win_start, int(ev["timestamp"])))
                            win_start = None
                if win_start is not None:
                    win_num += 1
                    heart_specs.append((fid, win_num, win_start, min(f_end, win_start + 21000)))

            transitions = fight.get("phaseTransitions") or []
            p2 = next((pt for pt in transitions if int(pt.get("id", 0)) == 2), None)
            p3 = next((pt for pt in transitions if int(pt.get("id", 0)) == 3), None)
            if p2 is not None and warden_actor_id is not None:
                p2_specs.append((fid, int(p2["startTime"]), f_end))
            if p3 is not None and boss_actor_id is not None:
                p3_specs.append((fid, int(p3["startTime"]), f_end))

        def _entries_to_map(table_obj: dict[str, Any] | None) -> dict[int, int]:
            out: dict[int, int] = {}
            entries = ((table_obj or {}).get("data") or {}).get("entries") or []
            for e in entries:
                pid = e.get("id")
                tot = int(e.get("total", 0) or 0)
                if pid is not None and tot > 0:
                    out[int(pid)] = tot
            return out

        aliases: list[str] = []
        for idx, (fid, _wn, hs, he) in enumerate(heart_specs):
            aliases.append(
                f"ht_{idx}: table(fightIDs: [{fid}], startTime: {hs}, endTime: {he}, dataType: DamageDone, hostilityType: Friendlies)"
            )
            if heart_actor_id is not None:
                aliases.append(
                    f"hh_{idx}: table(fightIDs: [{fid}], startTime: {hs}, endTime: {he}, dataType: DamageDone, hostilityType: Friendlies, targetID: {heart_actor_id})"
                )
                aliases.append(
                    f"hc_{idx}: events(fightIDs: [{fid}], startTime: {max(0, hs - 1000)}, endTime: {he}, dataType: Casts, hostilityType: Friendlies, limit: 2000) {{ data }}"
                )
            if boss_actor_id is not None:
                aliases.append(
                    f"hb_{idx}: table(fightIDs: [{fid}], startTime: {hs}, endTime: {he}, dataType: DamageDone, hostilityType: Friendlies, targetID: {boss_actor_id})"
                )
        for idx, (fid, ps, pe) in enumerate(p2_specs):
            aliases.append(
                f"w_{idx}: table(fightIDs: [{fid}], startTime: {ps}, endTime: {pe}, dataType: DamageDone, hostilityType: Friendlies, targetID: {warden_actor_id})"
            )
        for idx, (fid, ps, pe) in enumerate(p3_specs):
            aliases.append(
                f"p3_{idx}: table(fightIDs: [{fid}], startTime: {ps}, endTime: {pe}, dataType: DamageDone, hostilityType: Friendlies, targetID: {boss_actor_id})"
            )

        merged_tables: dict[str, Any] = {}
        # Batch GraphQL aliases in chunks of 18 to stay comfortably within WCL point limits
        for i in range(0, len(aliases), 18):
            chunk_str = "\n".join(aliases[i : i + 18])
            q = f'query {{ reportData {{ report(code: "{code}") {{ {chunk_str} }} }} }}'
            res = self.gql(q)["reportData"]["report"] or {}
            merged_tables.update(res)

        def _extract_first_heart_casts(ev_block: dict[str, Any] | None, hs: int) -> dict[int, dict[str, int]]:
            if heart_actor_id is None or not ev_block:
                return {}
            data = ev_block.get("data") or []
            sorted_evs = sorted(data, key=lambda e: int(e.get("timestamp", 0)))
            # Track recent begincast timestamps per (player_id, ability_id) so casters get credit for cast start time!
            recent_begincast: dict[tuple[int, int], int] = {}
            first_by_player: dict[int, dict[str, int]] = {}
            for ev in sorted_evs:
                src = ev.get("sourceID")
                if src is None or int(src) not in actors or actors[int(src)].get("type") != "Player":
                    continue
                pid = int(src)
                aid = int(ev.get("abilityGameID") or 0)
                if aid <= 1:
                    continue
                ts = int(ev.get("timestamp", 0))
                et = ev.get("type")
                if et == "begincast":
                    recent_begincast[(pid, aid)] = ts
                elif et in ("cast", "empowerstart") and ev.get("targetID") == heart_actor_id:
                    if pid not in first_by_player:
                        bc_ts = recent_begincast.get((pid, aid))
                        if bc_ts is not None and 0 <= ts - bc_ts <= 4000 and bc_ts >= hs - 1500:
                            start_ts = bc_ts
                        else:
                            start_ts = ts
                        first_by_player[pid] = {"ts": start_ts, "ability_id": aid}
            return first_by_player

        heart_windows_out: list[dict[str, Any]] = []
        for idx, (fid, wn, hs, he) in enumerate(heart_specs):
            heart_windows_out.append(
                {
                    "fight_id": fid,
                    "window_num": wn,
                    "start_time": hs,
                    "end_time": he,
                    "total_by_player": _entries_to_map(merged_tables.get(f"ht_{idx}")),
                    "heart_by_player": _entries_to_map(merged_tables.get(f"hh_{idx}")),
                    "boss_by_player": _entries_to_map(merged_tables.get(f"hb_{idx}")),
                    "first_cast_by_player": _extract_first_heart_casts(merged_tables.get(f"hc_{idx}"), hs),
                }
            )

        warden_dmg_by_fight = {
            fid: _entries_to_map(merged_tables.get(f"w_{idx}"))
            for idx, (fid, _, _) in enumerate(p2_specs)
        }
        p3_boss_dmg_by_fight = {
            fid: _entries_to_map(merged_tables.get(f"p3_{idx}"))
            for idx, (fid, _, _) in enumerate(p3_specs)
        }

        return {
            "heart_windows": heart_windows_out,
            "warden_dmg_by_fight": warden_dmg_by_fight,
            "p3_boss_dmg_by_fight": p3_boss_dmg_by_fight,
        }
