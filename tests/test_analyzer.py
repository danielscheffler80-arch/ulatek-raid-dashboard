import pytest
from scripts.analyzer import (
    analyze_report_events,
    extract_report_code,
    merge_report_into_store,
)


def test_extract_report_code_from_urls_and_raw():
    assert extract_report_code("qy9FnMvjwQ2R13c7") == "qy9FnMvjwQ2R13c7"
    assert (
        extract_report_code(
            "https://www.warcraftlogs.com/reports/qy9FnMvjwQ2R13c7?boss=3492&difficulty=5&wipes=1&cutoff=3"
        )
        == "qy9FnMvjwQ2R13c7"
    )
    assert (
        extract_report_code("https://www.warcraftlogs.com/reports/qy9FnMvjwQ2R13c7#fight=41")
        == "qy9FnMvjwQ2R13c7"
    )
    with pytest.raises(ValueError):
        extract_report_code("not-a-valid-url-or-code!!")


def _base_actors():
    return {
        1: {"id": 1, "name": "Betøng", "type": "Player", "subType": "Monk"},
        2: {"id": 2, "name": "Barrumir", "type": "Player", "subType": "DeathKnight"},
        3: {"id": 3, "name": "Narande", "type": "Player", "subType": "Warlock"},
        4: {"id": 4, "name": "Näxxs", "type": "Player", "subType": "Hunter"},
        5: {"id": 5, "name": "Valysa", "type": "Player", "subType": "Priest"},
        152: {"id": 152, "name": "Ula'tek", "type": "NPC", "subType": "Boss"},
        176: {"id": 176, "name": "Gore Rattle", "type": "NPC", "subType": "Boss"},
        182: {"id": 182, "name": "Spectral Coil", "type": "NPC", "subType": "NPC"},
        99: {"id": 99, "name": "Wild Imp", "type": "Pet", "subType": "Pet"},
    }


def _base_abilities():
    return {
        1: "Melee",
        6262: "Healthstone",
        452930: "Demonic Healthstone",
        1234768: "Silvermoon Health Potion",
        33206: "Pain Suppression",
        115203: "Fortifying Brew",
        1241059: "Celestial Infusion",
        132578: "Invoke Niuzao, the Black Ox",
        465: "Devotion Aura",
        104773: "Unending Resolve",
        1292403: "Caustic Waves",
        1296301: "Mephitic Thrash",
        1298417: "Stone Venom",
        1298418: "Stone Venom",
        1299010: "Spectral Coils",
        1299206: "Rattler Slam",
        1287265: "Spectral Coils",
        1300685: "Soul Constrictor",
        1301268: "Putrid Membrane",
        1307612: "Noxious Shell",
        1307635: "Noxious Splash",
        1308275: "Putrid Membrane",
        1312150: "Rancid Yolk",
    }


def test_egg_fail_precedence_dedup_and_deaths_before():
    actors = _base_actors()
    abilities = _base_abilities()
    meta = {"title": "Test Raid", "startTime": 1795450000000}
    fights = [
        {
            "id": 10,
            "name": "Ula'tek",
            "startTime": 100000,
            "endTime": 260000,
            "fightPercentage": 45.2,
            "bossPercentage": 45.2,
            "kill": False,
        }
    ]
    events = [
        # Pet death must NOT increment deaths_before
        {"timestamp": 110000, "type": "death", "targetID": 99, "fight": 10},
        # Player death at 115000 (1 death before subsequent hits)
        {"timestamp": 115000, "type": "death", "targetID": 5, "killerID": 152, "killingAbilityGameID": 1292403, "fight": 10},
        # Case 1: Clean Spectral Coils clear + CW 20ms later -> NOT an egg fail (coils cleared it!)
        {"timestamp": 120000, "type": "applydebuff", "targetID": 4, "abilityGameID": 1307612, "fight": 10},
        {"timestamp": 140000, "type": "removedebuff", "targetID": 4, "abilityGameID": 1307612, "fight": 10},
        {"timestamp": 140000, "type": "cast", "sourceID": 182, "targetID": -1, "abilityGameID": 1299010, "fight": 10},
        {"timestamp": 140015, "type": "applydebuff", "targetID": 4, "abilityGameID": 1300685, "fight": 10},
        {"timestamp": 140020, "type": "damage", "sourceID": 152, "targetID": 4, "abilityGameID": 1292403, "amount": 250000, "fight": 10},
        # Case 2: Real Caustic Waves egg break + overlapping 2nd wave 10ms later -> 1 egg fail (earliest hit)
        {"timestamp": 190000, "type": "applydebuff", "targetID": 3, "abilityGameID": 1307612, "fight": 10},
        {"timestamp": 219020, "type": "removedebuff", "targetID": 3, "abilityGameID": 1307612, "fight": 10},
        {"timestamp": 219021, "type": "applydebuff", "targetID": 3, "abilityGameID": 1312150, "fight": 10},
        {"timestamp": 219021, "type": "applydebuff", "targetID": 3, "abilityGameID": 1301268, "fight": 10},
        {"timestamp": 219021, "type": "damage", "sourceID": 152, "targetID": 3, "abilityGameID": 1292403, "amount": 470000, "fight": 10},
        {"timestamp": 219031, "type": "damage", "sourceID": 152, "targetID": 3, "abilityGameID": 1292403, "amount": 410000, "fight": 10},
        # DoT tick must NOT be counted as wave fail or egg fail
        {"timestamp": 220021, "type": "damage", "sourceID": 152, "targetID": 3, "abilityGameID": 1292403, "amount": 45000, "tick": True, "fight": 10},
        # Case 3: Noxious Splash bump
        {"timestamp": 225000, "type": "applydebuff", "targetID": 4, "abilityGameID": 1307612, "fight": 10},
        {"timestamp": 230000, "type": "removedebuff", "targetID": 4, "abilityGameID": 1307612, "fight": 10},
        {"timestamp": 230002, "type": "damage", "sourceID": 152, "targetID": 4, "abilityGameID": 1307635, "amount": 320000, "fight": 10},
    ]

    rep = analyze_report_events(meta, fights, actors, abilities, {10: events}, "qy9FnMvjwQ2R13c7")

    cw_eggs = [e for e in rep["egg_fails"] if e["kind"] == "caustic_waves"]
    splash_eggs = [e for e in rep["egg_fails"] if e["kind"] == "noxious_splash"]

    assert len(cw_eggs) == 1
    assert cw_eggs[0]["player"] == "Narande"
    assert cw_eggs[0]["deaths_before"] == 1
    assert cw_eggs[0]["gap_ms"] == 1
    assert cw_eggs[0]["has_putrid"] is True
    assert cw_eggs[0]["has_rancid"] is True
    assert "fight=10" in cw_eggs[0]["events_url"]
    assert "view=replay" in cw_eggs[0]["replay_url"]

    assert len(splash_eggs) == 1
    assert splash_eggs[0]["player"] == "Näxxs"

    # Wave fails: all 3 direct non-tick hits (Näxxs at 140020 + Narande at 219021 + Narande at 219031), NO ticks
    assert len(rep["wave_fails"]) == 3
    narande_waves = [w for w in rep["wave_fails"] if w["player"] == "Narande"]
    assert narande_waves[0]["had_noxious_shell"] is True


def test_tank_fails_tentacle_aggro_and_stone_venom_under_30():
    actors = _base_actors()
    abilities = _base_abilities()
    meta = {"title": "Tank Test", "startTime": 1795450000000}
    fights = [
        {
            "id": 41,
            "name": "Ula'tek",
            "startTime": 100000,
            "endTime": 260000,
            "fightPercentage": 30.0,
            "bossPercentage": 30.0,
            "kill": False,
        }
    ]
    events = [
        # Identify tanks: Betøng (1) & Barrumir (2) take Stone Venom / boss melees
        {"timestamp": 110000, "type": "damage", "sourceID": 152, "targetID": 1, "abilityGameID": 1, "amount": 200000, "hitPoints": 1400000, "maxHitPoints": 1600000, "fight": 41},
        {"timestamp": 112000, "type": "damage", "sourceID": 176, "targetID": 2, "abilityGameID": 1, "amount": 180000, "hitPoints": 1500000, "maxHitPoints": 1700000, "fight": 41},
        # Mephitic Thrash & Rattler Slam kills MUST NOT count as tank fails!
        {"timestamp": 120000, "type": "death", "targetID": 3, "killerID": 176, "killingAbilityGameID": 1296301, "fight": 41},
        {"timestamp": 125000, "type": "death", "targetID": 5, "killerID": 176, "killingAbilityGameID": 1299206, "fight": 41},
        # Tank Betøng is tanking Ula'tek at 130000; Gore Rattle Melee kills non-tank Näxxs at 132000 -> Barrumir failed!
        {"timestamp": 130000, "type": "damage", "sourceID": 152, "targetID": 1, "abilityGameID": 1, "amount": 200000, "fight": 41},
        {"timestamp": 132000, "type": "death", "targetID": 4, "killerID": 176, "killingAbilityGameID": 1, "fight": 41},
        # Stone Venom window 1 on Betøng WITH Celestial Infusion active -> drops to 20% -> NOT a fail!
        {"timestamp": 150000, "type": "applybuff", "sourceID": 1, "targetID": 1, "abilityGameID": 1241059, "fight": 41},
        {"timestamp": 151000, "type": "applydebuff", "sourceID": 152, "targetID": 1, "abilityGameID": 1298417, "fight": 41},
        {"timestamp": 152000, "type": "damage", "sourceID": 152, "targetID": 1, "abilityGameID": 1298418, "amount": 100000, "hitPoints": 320000, "maxHitPoints": 1600000, "fight": 41},
        {"timestamp": 155000, "type": "removedebuff", "sourceID": 152, "targetID": 1, "abilityGameID": 1298417, "fight": 41},
        {"timestamp": 156000, "type": "removebuff", "sourceID": 1, "targetID": 1, "abilityGameID": 1241059, "fight": 41},
        # Stone Venom window 2 on Barrumir with ONLY passive Devotion Aura -> drops to 24% then 18% and DIES 1.5s later -> 1 lethal fail!
        {"timestamp": 169000, "type": "applybuff", "sourceID": 5, "targetID": 2, "abilityGameID": 465, "fight": 41},
        {"timestamp": 170000, "type": "applydebuff", "sourceID": 152, "targetID": 2, "abilityGameID": 1298417, "fight": 41},
        {"timestamp": 171000, "type": "applydebuffstack", "sourceID": 152, "targetID": 2, "abilityGameID": 1298417, "stack": 4, "fight": 41},
        {"timestamp": 172000, "type": "damage", "sourceID": 152, "targetID": 2, "abilityGameID": 1298418, "amount": 90000, "hitPoints": 408000, "maxHitPoints": 1700000, "fight": 41},
        {"timestamp": 173000, "type": "damage", "sourceID": 152, "targetID": 2, "abilityGameID": 1298418, "amount": 95000, "hitPoints": 306000, "maxHitPoints": 1700000, "fight": 41},
        {"timestamp": 174500, "type": "death", "targetID": 2, "killerID": 152, "killingAbilityGameID": 1298418, "fight": 41},
        {"timestamp": 174500, "type": "removedebuff", "sourceID": 152, "targetID": 2, "abilityGameID": 1298417, "fight": 41},
    ]

    rep = analyze_report_events(meta, fights, actors, abilities, {41: events}, "qy9FnMvjwQ2R13c7")
    tentacle_fails = [t for t in rep["tank_fails"] if t["kind"] == "tentacle_aggro"]
    sv_fails = [t for t in rep["tank_fails"] if t["kind"] == "stone_venom_no_def"]

    assert len(tentacle_fails) == 1
    assert tentacle_fails[0]["tank"] == "Barrumir"
    assert tentacle_fails[0]["victim"] == "Näxxs"
    assert tentacle_fails[0]["other_tank"] == "Betøng"

    assert len(sv_fails) == 1
    assert sv_fails[0]["tank"] == "Barrumir"
    assert sv_fails[0]["min_hp_pct"] == 18.0
    assert sv_fails[0]["stacks"] == 4
    assert sv_fails[0]["lethal"] is True
    assert sv_fails[0]["death_rel_time"] == "01:14.500"
    assert sv_fails[0]["death_ability"] == "Stone Venom"


def test_defensive_and_consumable_tracking():
    actors = _base_actors()
    abilities = _base_abilities()
    meta = {"title": "Def Test", "startTime": 1795450000000}
    fights = [
        {"id": 12, "name": "Ula'tek", "startTime": 100000, "endTime": 200000, "fightPercentage": 50.0, "bossPercentage": 50.0, "kill": False}
    ]
    events = [
        # Narande uses Silvermoon Health Potion + Unending Resolve during Mephitic Thrash low drop -> protected!
        {"timestamp": 120000, "type": "cast", "sourceID": 3, "targetID": 3, "abilityGameID": 1234768, "fight": 12},
        {"timestamp": 129000, "type": "applybuff", "sourceID": 3, "targetID": 3, "abilityGameID": 104773, "fight": 12},
        {"timestamp": 130000, "type": "damage", "sourceID": 176, "targetID": 3, "abilityGameID": 1296301, "amount": 400000, "hitPoints": 200000, "maxHitPoints": 1000000, "fight": 12},
        {"timestamp": 136000, "type": "removebuff", "sourceID": 3, "targetID": 3, "abilityGameID": 104773, "fight": 12},
        # Näxxs drops to 22% on Spectral Coils without def-CD, then dies without using Pot or HS
        {"timestamp": 140000, "type": "damage", "sourceID": 182, "targetID": 4, "abilityGameID": 1287265, "amount": 350000, "hitPoints": 220000, "maxHitPoints": 1000000, "fight": 12},
        {"timestamp": 145000, "type": "death", "targetID": 4, "killerID": 182, "killingAbilityGameID": 1287265, "fight": 12},
    ]

    rep = analyze_report_events(meta, fights, actors, abilities, {12: events}, "qy9FnMvjwQ2R13c7")
    usage_by_p = {u["player"]: u for u in rep["consumable_usage"]}
    assert usage_by_p["Narande"]["used_health_pot"] is True
    assert usage_by_p["Näxxs"]["used_health_pot"] is False
    assert usage_by_p["Näxxs"]["used_healthstone"] is False

    narande_spikes = [e for e in rep["defensive_events"] if e["player"] == "Narande" and e["kind"] == "low_hp_spike"]
    assert len(narande_spikes) == 1
    assert narande_spikes[0]["had_def_cd"] is True
    assert "Unending Resolve" in narande_spikes[0]["active_defs"]

    naxxs_deaths = [e for e in rep["defensive_events"] if e["player"] == "Näxxs" and e["kind"] == "death"]
    assert len(naxxs_deaths) == 1
    assert naxxs_deaths[0]["had_def_cd"] is False
    assert naxxs_deaths[0]["pot_used_in_pull"] is False
    assert naxxs_deaths[0]["hs_used_in_pull"] is False


def test_merge_report_into_store_idempotent_and_preserves_label():
    r1 = {"code": "AAA1111111111111", "title": "Old", "label": "Mittwoch Raid", "start_time_epoch_ms": 1000}
    store = merge_report_into_store(None, r1)
    assert len(store["reports"]) == 1
    assert store["reports"][0]["label"] == "Mittwoch Raid"

    # Re-import without label preserves existing label
    r1_updated = {"code": "AAA1111111111111", "title": "Old Updated", "label": None, "start_time_epoch_ms": 1000}
    store = merge_report_into_store(store, r1_updated)
    assert len(store["reports"]) == 1
    assert store["reports"][0]["title"] == "Old Updated"
    assert store["reports"][0]["label"] == "Mittwoch Raid"

    # Add newer report -> sorted newest first
    r2 = {"code": "BBB2222222222222", "title": "Newer", "label": "Sonntag Raid", "start_time_epoch_ms": 2000}
    store = merge_report_into_store(store, r2)
    assert [r["code"] for r in store["reports"]] == ["BBB2222222222222", "AAA1111111111111"]
