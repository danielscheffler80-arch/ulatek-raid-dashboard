import json
from pathlib import Path

from scripts.add_log import load_dotenv_file, run_import


class FakeWCLClient:
    def fetch_report_bundle(self, code: str, encounter_id: int, difficulty: int):
        return (
            {"title": "Fake Raid Night", "startTime": 1795450000000},
            [
                {
                    "id": 7,
                    "name": "Ula'tek",
                    "startTime": 100000,
                    "endTime": 180000,
                    "fightPercentage": 55.0,
                    "bossPercentage": 55.0,
                    "kill": False,
                    "friendlyPlayers": [1, 2],
                }
            ],
            {
                1: {"id": 1, "name": "Betøng", "type": "Player", "subType": "Monk"},
                2: {"id": 2, "name": "Narande", "type": "Player", "subType": "Warlock"},
                152: {"id": 152, "name": "Ula'tek", "type": "NPC", "subType": "Boss"},
            },
            {
                1292403: "Caustic Waves",
                1307612: "Noxious Shell",
                1301268: "Putrid Membrane",
                1312150: "Rancid Yolk",
            },
            {
                7: [
                    {"timestamp": 120000, "type": "applydebuff", "targetID": 2, "abilityGameID": 1307612, "fight": 7},
                    {"timestamp": 140000, "type": "removedebuff", "targetID": 2, "abilityGameID": 1307612, "fight": 7},
                    {"timestamp": 140001, "type": "damage", "sourceID": 152, "targetID": 2, "abilityGameID": 1292403, "amount": 400000, "fight": 7},
                ]
            },
        )


def test_load_dotenv_file(tmp_path: Path):
    env_file = tmp_path / ".env"
    env_file.write_text("# comment\nWCL_CLIENT_ID=abc123\nWCL_CLIENT_SECRET='sec_456'\n", encoding="utf-8")
    loaded = load_dotenv_file(env_file)
    assert loaded == {"WCL_CLIENT_ID": "abc123", "WCL_CLIENT_SECRET": "sec_456"}


def test_run_import_creates_and_updates_reports_json(tmp_path: Path):
    out_file = tmp_path / "reports.json"
    report = run_import(
        url_or_code="https://www.warcraftlogs.com/reports/qy9FnMvjwQ2R13c7?boss=3492",
        output_path=out_file,
        client=FakeWCLClient(),
        label="Testabend",
    )
    assert report["code"] == "qy9FnMvjwQ2R13c7"
    assert report["label"] == "Testabend"
    assert len(report["egg_fails"]) == 1
    assert len(report["players"]) == 2  # Includes Betøng via friendlyPlayers!

    saved = json.loads(out_file.read_text(encoding="utf-8"))
    assert saved["schema_version"] == 1
    assert len(saved["reports"]) == 1
    assert saved["reports"][0]["label"] == "Testabend"
