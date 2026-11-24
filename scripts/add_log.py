#!/usr/bin/env python3
"""CLI to analyze a WarcraftLogs Ula'tek Mythic report and update web/public/data/reports.json."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

# Allow running directly as `python scripts/add_log.py` from repo root
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.analyzer import (  # noqa: E402
    analyze_report_events,
    extract_report_code,
    merge_report_into_store,
)
from scripts.spells_config import MYTHIC_DIFFICULTY, ULATEK_ENCOUNTER_ID  # noqa: E402
from scripts.wcl_client import WCLClient  # noqa: E402

DEFAULT_OUTPUT_PATH = REPO_ROOT / "web" / "public" / "data" / "reports.json"


def load_dotenv_file(path: Path) -> dict[str, str]:
    """Parse simple KEY=VALUE lines from an optional local .env file."""
    result: dict[str, str] = {}
    if not path.exists():
        return result
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            result[key] = value
    return result


def resolve_credentials() -> tuple[str, str]:
    dotenv = load_dotenv_file(REPO_ROOT / ".env")
    cid = os.environ.get("WCL_CLIENT_ID") or dotenv.get("WCL_CLIENT_ID")
    csec = os.environ.get("WCL_CLIENT_SECRET") or dotenv.get("WCL_CLIENT_SECRET")
    if not cid or not csec:
        raise RuntimeError(
            "WCL_CLIENT_ID und WCL_CLIENT_SECRET fehlen. Bitte als Umgebungsvariablen "
            "oder in einer lokalen .env-Datei (nicht im Git!) hinterlegen."
        )
    return cid, csec


def run_import(
    url_or_code: str,
    output_path: Path = DEFAULT_OUTPUT_PATH,
    client: Any | None = None,
    label: str | None = None,
    encounter_id: int = ULATEK_ENCOUNTER_ID,
    difficulty: int = MYTHIC_DIFFICULTY,
) -> dict[str, Any]:
    code = extract_report_code(url_or_code)
    if client is None:
        cid, csec = resolve_credentials()
        client = WCLClient(cid, csec)

    bundle = client.fetch_report_bundle(
        code=code, encounter_id=encounter_id, difficulty=difficulty
    )
    meta, fights, actors, abilities, events_by_fight = bundle[:5]
    extra_tables = bundle[5] if len(bundle) > 5 else None
    report = analyze_report_events(
        meta=meta,
        fights=fights,
        actors=actors,
        abilities=abilities,
        events_by_fight=events_by_fight,
        report_code=code,
        label=label,
        encounter_id=encounter_id,
        difficulty=difficulty,
        extra_tables=extra_tables,
    )

    existing_store = None
    if output_path.exists():
        existing_store = json.loads(output_path.read_text(encoding="utf-8"))

    updated_store = merge_report_into_store(existing_store, report)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(updated_store, separators=(",", ":"), ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return report


def git_push_report(output_path: Path, report_code: str, label: str | None) -> None:
    rel = output_path.resolve().relative_to(REPO_ROOT.resolve())
    msg = f"data: import WCL report {report_code}" + (f" ({label})" if label else "")
    subprocess.run(["git", "add", str(rel)], cwd=REPO_ROOT, check=True)
    diff = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=REPO_ROOT)
    if diff.returncode == 0:
        print("Keine Datenänderungen zum Committen.")
        return
    subprocess.run(["git", "commit", "-m", msg], cwd=REPO_ROOT, check=True)
    subprocess.run(["git", "push"], cwd=REPO_ROOT, check=True)
    print(f"Erfolgreich gepusht: {msg}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Analysiert einen WarcraftLogs-Report für Ula'tek Mythic und speichert ihn im Dashboard."
    )
    parser.add_argument("report", help="WarcraftLogs-URL oder 16-stelliger Report-Code")
    parser.add_argument("--label", default=None, help="Optionaler Anzeigename für den Raidabend")
    parser.add_argument("--boss", type=int, default=ULATEK_ENCOUNTER_ID, help="Encounter-ID (Standard: 3492 = Ula'tek)")
    parser.add_argument("--difficulty", type=int, default=MYTHIC_DIFFICULTY, help="Difficulty (Standard: 5 = Mythic)")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH, help="Pfad zur reports.json")
    parser.add_argument("--push", action="store_true", help="Nach Analyse automatisch git add/commit/push ausführen")
    args = parser.parse_args(argv)

    report = run_import(
        url_or_code=args.report,
        output_path=args.output,
        label=args.label,
        encounter_id=args.boss,
        difficulty=args.difficulty,
    )

    cw_eggs = sum(1 for e in report["egg_fails"] if e["kind"] == "caustic_waves")
    ns_eggs = sum(1 for e in report["egg_fails"] if e["kind"] == "noxious_splash")
    ta_fails = sum(1 for t in report["tank_fails"] if t["kind"] == "tentacle_aggro")
    sv_fails = sum(1 for t in report["tank_fails"] if t["kind"] == "stone_venom_no_def")

    print(f"\nReport importiert: {report['title']} ({report['code']})")
    print(f"  Datum:          {report['date_iso']}")
    print(f"  Pulls:          {report['pulls_total']} ({report['wipes_count']} Wipes, {report['kills_count']} Kills)")
    print(f"  Tanks erkannt:  {', '.join(t['name'] for t in report['tanks']) or 'keine'}")
    print(f"  Egg Fails:      {len(report['egg_fails'])} ({cw_eggs} Caustic Waves, {ns_eggs} Noxious Splash)")
    print(f"  Wave Fails:     {len(report['wave_fails'])} direkte Treffer")
    print(f"  Tank Fails:     {len(report['tank_fails'])} ({ta_fails} Tentakel-Aggro, {sv_fails} Stone Venom <30% ohne Def)")
    print(f"  Def-Events:     {len(report['defensive_events'])} (Low-HP-Spikes & Tode)")
    print(f"  Herzphasen:     {len(report.get('heart_phases', []))} Fenster")
    print(f"  P2/P3-Events:   {len(report.get('phase_events', []))} (Overlaps, Kicks, Avoidables), {len(report.get('warden_summaries', []))} P2-Trys, {len(report.get('p3_summaries', []))} P3-Trys")
    print(f"  Gespeichert in: {args.output}")

    if args.push:
        git_push_report(args.output, report["code"], args.label)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
