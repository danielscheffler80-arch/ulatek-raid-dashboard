"""Zero-dependency WarcraftLogs v2 GraphQL API client."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from collections import defaultdict
from typing import Any

from scripts.spells_config import (
    SPELL_CAUSTIC_WAVES,
    SPELL_MEPHITIC_THRASH,
    SPELL_NECROTIC_VAPORS,
    SPELL_NOXIOUS_SHELL_DEBUFF,
    SPELL_NOXIOUS_SPLASH,
    SPELL_PUTRID_MEMBRANE_DEBUFF,
    SPELL_PUTRID_MEMBRANE_DMG,
    SPELL_RANCID_YOLK,
    SPELL_RATTLER_SLAM,
    SPELL_SOUL_CONSTRICTOR,
    SPELL_SPECTRAL_COILS_CAST,
    SPELL_SPECTRAL_COILS_DMG,
    SPELL_STONE_VENOM_DEBUFF,
    SPELL_STONE_VENOM_DMG,
    is_defensive_buff,
    is_health_potion,
    is_healthstone,
)

CORE_MECHANIC_IDS = (
    SPELL_NOXIOUS_SHELL_DEBUFF,
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
    SPELL_MEPHITIC_THRASH,
    SPELL_RATTLER_SLAM,
    SPELL_NECROTIC_VAPORS,
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
                  name
                  type
                  subType
                }}
                abilities {{
                  gameID
                  name
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
        fight_ids = [int(f["id"]) for f in fights]
        min_start = min(int(f["startTime"]) for f in fights)
        max_end = max(int(f["endTime"]) for f in fights)

        # Dynamically collect exact ability IDs present in this report for defensives & consumables
        def_ids = sorted(gid for gid, name in abilities.items() if is_defensive_buff(name))
        consumable_ids = sorted(
            gid
            for gid, name in abilities.items()
            if is_health_potion(gid, name) or is_healthstone(gid, name)
        )

        # 1. Deaths (fast, exact killer info)
        deaths = self._fetch_events_paginated(
            code, min_start, max_end, fight_ids, data_type="Deaths", include_resources=False
        )

        # 2. Core Ula'tek mechanics + Boss/Gore Rattle Melees + Consumable casts (with HP resources!)
        core_id_list = ", ".join(str(i) for i in CORE_MECHANIC_IDS)
        parts = [
            f"ability.id in ({core_id_list})",
            '(type = "damage" and ability.id = 1 and (source.name = "Ula\'tek" or source.name = "Gore Rattle"))',
        ]
        if consumable_ids:
            cons_list = ", ".join(str(i) for i in consumable_ids)
            parts.append(f'(type = "cast" and ability.id in ({cons_list}))')
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
        for ev in deaths + core_events + def_events:
            fid = ev.get("fight")
            if fid is not None:
                events_by_fight[int(fid)].append(ev)

        meta = {
            "title": report.get("title", code),
            "startTime": report.get("startTime", 0),
            "endTime": report.get("endTime", 0),
        }
        return meta, fights, actors, abilities, events_by_fight
