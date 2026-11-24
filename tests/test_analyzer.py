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


def test_heart_phase_damage_aggregation_and_debris():
    actors = _base_actors()
    actors[194] = {"id": 194, "name": "Venomous Heart", "type": "NPC", "subType": "Boss"}
    abilities = _base_abilities()
    abilities.update(
        {
            1299526: "Venomous Heart",
            1286860: "Rage of the Shackled",
            1286885: "Falling Debris",
        }
    )
    meta = {"title": "Heart Test", "startTime": 1795450000000}
    fights = [
        {
            "id": 41,
            "name": "Ula'tek",
            "startTime": 100000,
            "endTime": 340000,
            "fightPercentage": 69.2,
            "bossPercentage": 69.2,
            "kill": False,
        }
    ]
    events = [
        {"timestamp": 245000, "type": "applybuff", "sourceID": 194, "targetID": 194, "abilityGameID": 1299526, "fight": 41},
        {"timestamp": 252000, "type": "damage", "sourceID": 152, "targetID": 4, "abilityGameID": 1286885, "amount": 340000, "fight": 41},
        {"timestamp": 265000, "type": "removebuff", "sourceID": 194, "targetID": 194, "abilityGameID": 1299526, "fight": 41},
    ]
    extra_tables = {
        "heart_windows": [
            {
                "fight_id": 41,
                "window_num": 1,
                "start_time": 245000,
                "end_time": 265000,
                "heart_by_player": {3: 20_000_000, 4: 12_000_000},
                "boss_by_player": {3: 4_000_000, 4: 8_000_000},
                "total_by_player": {3: 24_500_000, 4: 20_000_000},
            }
        ],
        "warden_dmg_by_fight": {},
        "p3_boss_dmg_by_fight": {},
    }

    rep = analyze_report_events(
        meta, fights, actors, abilities, {41: events}, "qy9FnMvjwQ2R13c7", extra_tables=extra_tables
    )
    assert len(rep["heart_phases"]) == 1
    hw = rep["heart_phases"][0]
    assert hw["total_heart_dmg"] == 32_000_000
    assert hw["total_boss_dmg"] == 12_000_000
    assert hw["total_effective_dmg"] == 44_000_000
    assert hw["total_other_dmg"] == 500_000
    assert hw["debris_hits_total"] == 1
    assert hw["players"][0]["player"] == "Narande"
    assert hw["players"][0]["total_boss_dmg"] == 24_000_000
    assert hw["players"][0]["heart_raw_dmg"] == 10_000_000
    assert hw["players"][0]["other_dmg"] == 500_000
    assert hw["players"][0]["heart_share_pct"] == 83.3
    assert hw["players"][1]["player"] == "Näxxs"
    assert hw["players"][1]["debris_hits"] == 1

    debris_evs = [e for e in rep["phase_events"] if e["kind"] == "falling_debris"]
    assert len(debris_evs) == 1
    assert debris_evs[0]["player"] == "Näxxs"


def test_p2_blight_vein_overlap_malice_kicks_and_warden_sync():
    actors = _base_actors()
    actors[198] = {"id": 198, "name": "Doomscale Warden", "type": "NPC", "subType": "NPC"}
    abilities = _base_abilities()
    abilities.update(
        {
            1311611: "Grasping Fangs",
            1317955: "Blight Vein",
            1290779: "Malice",
            1290991: "Malice",
            1301800: "Acidic Burst",
            1766: "Kick",
        }
    )
    meta = {"title": "P2 Test", "startTime": 1795450000000}
    fights = [
        {
            "id": 41,
            "name": "Ula'tek",
            "startTime": 100000,
            "endTime": 340000,
            "fightPercentage": 69.2,
            "bossPercentage": 69.2,
            "kill": False,
            "phaseTransitions": [{"id": 1, "startTime": 100000}, {"id": 2, "startTime": 270000}],
        }
    ]
    events = [
        # Malice kicked by Näxxs
        {"timestamp": 280000, "type": "begincast", "sourceID": 198, "targetID": -1, "abilityGameID": 1290779, "fight": 41},
        {"timestamp": 281000, "type": "interrupt", "sourceID": 4, "targetID": 198, "abilityGameID": 1766, "extraAbilityGameID": 1290779, "fight": 41},
        # Second Malice cast goes through un-interrupted
        {"timestamp": 290000, "type": "cast", "sourceID": 198, "targetID": -1, "abilityGameID": 1290779, "fight": 41},
        {"timestamp": 290500, "type": "damage", "sourceID": 198, "targetID": 3, "abilityGameID": 1290991, "amount": 400000, "fight": 41},
        # Grasping Fangs breaks: Narande at 300000 (ok), Näxxs at 301200 (OVERLAP 1200ms!), Valysa at 305000 (ok 3800ms)
        {"timestamp": 300000, "type": "removedebuff", "sourceID": 152, "targetID": 3, "abilityGameID": 1311611, "fight": 41},
        {"timestamp": 301200, "type": "removedebuff", "sourceID": 152, "targetID": 4, "abilityGameID": 1311611, "fight": 41},
        {"timestamp": 305000, "type": "removedebuff", "sourceID": 152, "targetID": 5, "abilityGameID": 1311611, "fight": 41},
        # Avoidable Acidic Burst hit
        {"timestamp": 308000, "type": "damage", "sourceID": 198, "targetID": 5, "abilityGameID": 1301800, "amount": 410000, "fight": 41},
        # Two Warden deaths 4200ms apart
        {"timestamp": 320000, "type": "death", "targetID": 198, "targetInstance": 1, "fight": 41},
        {"timestamp": 324200, "type": "death", "targetID": 198, "targetInstance": 2, "fight": 41},
    ]
    extra_tables = {
        "heart_windows": [],
        "warden_dmg_by_fight": {41: {3: 15_000_000, 4: 9_000_000}},
        "p3_boss_dmg_by_fight": {},
    }

    rep = analyze_report_events(
        meta, fights, actors, abilities, {41: events}, "qy9FnMvjwQ2R13c7", extra_tables=extra_tables
    )
    overlaps = [e for e in rep["phase_events"] if e["kind"] == "blight_vein_overlap"]
    assert len(overlaps) == 1
    assert overlaps[0]["player"] == "Näxxs"
    assert overlaps[0]["detail"] == "Narande"
    assert overlaps[0]["gap_ms"] == 1200

    kicks = [e for e in rep["phase_events"] if e["kind"] == "malice_kick"]
    assert len(kicks) == 1
    assert kicks[0]["player"] == "Näxxs"

    missed = [e for e in rep["phase_events"] if e["kind"] == "malice_missed"]
    assert len(missed) == 1

    avoidable = [e for e in rep["phase_events"] if e["kind"] == "p2_avoidable"]
    assert len(avoidable) == 1
    assert avoidable[0]["player"] == "Valysa"

    assert len(rep["warden_summaries"]) == 1
    ws = rep["warden_summaries"][0]
    assert ws["warden_kills"] == 2
    assert ws["kill_sync_delta_ms"] == 4200
    assert ws["total_warden_dmg"] == 24_000_000
    assert ws["players"][0]["player"] == "Narande"


def test_defensive_readiness_tracking_cooldowns_and_consumables():
    actors = _base_actors()
    abilities = _base_abilities()
    abilities[108416] = "Dark Pact"
    meta = {"title": "Readiness Test", "startTime": 1795450000000}
    fights = [
        {"id": 20, "name": "Ula'tek", "startTime": 100000, "endTime": 260000, "fightPercentage": 50.0, "bossPercentage": 50.0, "kill": False}
    ]
    events = [
        # Narande (Warlock) uses Unending Resolve (180s CD) at 110s, Dark Pact (60s CD) at 115s, Pot at 120s, HS at 122s
        {"timestamp": 110000, "type": "applybuff", "sourceID": 3, "targetID": 3, "abilityGameID": 104773, "fight": 20},
        {"timestamp": 118000, "type": "removebuff", "sourceID": 3, "targetID": 3, "abilityGameID": 104773, "fight": 20},
        {"timestamp": 115000, "type": "applybuff", "sourceID": 3, "targetID": 3, "abilityGameID": 108416, "fight": 20},
        {"timestamp": 125000, "type": "removebuff", "sourceID": 3, "targetID": 3, "abilityGameID": 108416, "fight": 20},
        {"timestamp": 120000, "type": "cast", "sourceID": 3, "targetID": 3, "abilityGameID": 1234768, "fight": 20},
        {"timestamp": 122000, "type": "cast", "sourceID": 3, "targetID": 3, "abilityGameID": 6262, "fight": 20},
        # At 140s: Narande drops low -> ALL defensives & consumables are on CD!
        {"timestamp": 140000, "type": "damage", "sourceID": 176, "targetID": 3, "abilityGameID": 1296301, "amount": 400000, "hitPoints": 200000, "maxHitPoints": 1000000, "fight": 20},
        # At 185s: Dark Pact (60s CD since 115s -> ready at 175s!) is READY again, Unending Resolve still on CD -> dies with Dark Pact ready!
        {"timestamp": 185000, "type": "death", "targetID": 3, "killerID": 176, "killingAbilityGameID": 1296301, "fight": 20},
        # Näxxs (Hunter) used NOTHING -> dies at 150s with Aspect of the Turtle, Exhilaration, Pot, and HS ALL ready!
        {"timestamp": 150000, "type": "death", "targetID": 4, "killerID": 176, "killingAbilityGameID": 1296301, "fight": 20},
    ]

    rep = analyze_report_events(meta, fights, actors, abilities, {20: events}, "qy9FnMvjwQ2R13c7")
    narande_spike = next(e for e in rep["defensive_events"] if e["player"] == "Narande" and e["kind"] == "low_hp_spike")
    assert narande_spike["ready_defs"] == []
    assert narande_spike["pot_ready"] is False
    assert narande_spike["hs_ready"] is False
    assert narande_spike["any_ready"] is False

    narande_death = next(e for e in rep["defensive_events"] if e["player"] == "Narande" and e["kind"] == "death")
    assert "Dark Pact" in narande_death["ready_defs"]
    assert "Unending Resolve" not in narande_death["ready_defs"]
    assert narande_death["pot_ready"] is False
    assert narande_death["any_ready"] is True

    naxxs_death = next(e for e in rep["defensive_events"] if e["player"] == "Näxxs" and e["kind"] == "death")
    assert "Aspect of the Turtle" in naxxs_death["ready_defs"]
    assert naxxs_death["pot_ready"] is True
    assert naxxs_death["hs_ready"] is True
    assert naxxs_death["any_ready"] is True


def test_defensive_school_matching_and_removed_non_defs():
    actors = _base_actors()
    actors[6] = {"id": 6, "name": "Schurke", "type": "Player", "subType": "Rogue"}
    abilities = _base_abilities()
    abilities.update(
        {
            49039: "Lichborne",
            325153: "Exploding Keg",
            5277: "Evasion",
            31224: "Cloak of Shadows",
            48707: "Anti-Magic Shell",
            81256: "Dancing Rune Weapon",
        }
    )
    meta = {"title": "School Test", "startTime": 1795450000000}
    fights = [
        {"id": 30, "name": "Ula'tek", "startTime": 100000, "endTime": 260000, "fightPercentage": 50.0, "bossPercentage": 50.0, "kill": False}
    ]
    events = [
        # Tank setup: Betøng (Monk, 1) & Barrumir (DK, 2)
        {"timestamp": 105000, "type": "damage", "sourceID": 152, "targetID": 1, "abilityGameID": 1, "amount": 100000, "fight": 30},
        {"timestamp": 106000, "type": "damage", "sourceID": 176, "targetID": 2, "abilityGameID": 1, "amount": 100000, "fight": 30},
        # DK has Lichborne (no DR in Midnight!) + Dancing Rune Weapon (Physical Parry only!) active during Stone Venom (Nature/Magic) < 30% -> MUST STILL BE A FAIL!
        {"timestamp": 110000, "type": "applybuff", "sourceID": 2, "targetID": 2, "abilityGameID": 49039, "fight": 30},
        {"timestamp": 110000, "type": "applybuff", "sourceID": 2, "targetID": 2, "abilityGameID": 81256, "fight": 30},
        {"timestamp": 111000, "type": "applydebuff", "sourceID": 152, "targetID": 2, "abilityGameID": 1298417, "fight": 30},
        {"timestamp": 112000, "type": "damage", "sourceID": 152, "targetID": 2, "abilityGameID": 1298418, "amount": 120000, "hitPoints": 200000, "maxHitPoints": 1000000, "fight": 30},
        {"timestamp": 115000, "type": "removedebuff", "sourceID": 152, "targetID": 2, "abilityGameID": 1298417, "fight": 30},
        # Rogue has Evasion (Physical only!) active when hit by Caustic Waves (Nature/Magic) < 35% -> NOT protected! And Evasion must NOT appear in ready_defs, only Cloak of Shadows!
        {"timestamp": 120000, "type": "applybuff", "sourceID": 6, "targetID": 6, "abilityGameID": 5277, "fight": 30},
        {"timestamp": 121000, "type": "damage", "sourceID": 152, "targetID": 6, "abilityGameID": 1292403, "amount": 400000, "hitPoints": 200000, "maxHitPoints": 1000000, "fight": 30},
        {"timestamp": 125000, "type": "removebuff", "sourceID": 6, "targetID": 6, "abilityGameID": 5277, "fight": 30},
        # Rogue dies to Physical Melee (1) -> Evasion (if ready) or no Cloak of Shadows (Magic only!) in ready_defs!
        {"timestamp": 130000, "type": "death", "targetID": 6, "killerID": 176, "killingAbilityGameID": 1, "fight": 30},
        # Monk has Exploding Keg -> must NOT protect against Stone Venom or appear in ready_defs
        {"timestamp": 140000, "type": "applybuff", "sourceID": 1, "targetID": 1, "abilityGameID": 325153, "fight": 30},
        {"timestamp": 141000, "type": "applydebuff", "sourceID": 152, "targetID": 1, "abilityGameID": 1298417, "fight": 30},
        {"timestamp": 142000, "type": "damage", "sourceID": 152, "targetID": 1, "abilityGameID": 1298418, "amount": 120000, "hitPoints": 200000, "maxHitPoints": 1000000, "fight": 30},
        {"timestamp": 145000, "type": "removedebuff", "sourceID": 152, "targetID": 1, "abilityGameID": 1298417, "fight": 30},
    ]

    rep = analyze_report_events(meta, fights, actors, abilities, {30: events}, "qy9FnMvjwQ2R13c7")
    sv_fails = [t for t in rep["tank_fails"] if t["kind"] == "stone_venom_no_def"]
    assert {t["tank"] for t in sv_fails} == {"Barrumir", "Betøng"}
    dk_sv = next(t for t in sv_fails if t["tank"] == "Barrumir")
    assert "Lichborne" not in dk_sv["ready_defs"]
    assert "Dancing Rune Weapon" not in dk_sv["ready_defs"]
    assert "Anti-Magic Shell" in dk_sv["ready_defs"]

    monk_sv = next(t for t in sv_fails if t["tank"] == "Betøng")
    assert "Exploding Keg" not in monk_sv["ready_defs"]

    rogue_spike = next(e for e in rep["defensive_events"] if e["player"] == "Schurke" and e["kind"] == "low_hp_spike")
    assert rogue_spike["had_def_cd"] is False
    assert "Cloak of Shadows" in rogue_spike["ready_defs"]
    assert "Evasion" not in rogue_spike["ready_defs"]

    rogue_death = next(e for e in rep["defensive_events"] if e["player"] == "Schurke" and e["kind"] == "death")
    assert "Cloak of Shadows" not in rogue_death["ready_defs"]


def test_stone_venom_only_checks_boss_cast_plus_5s_window():
    actors = _base_actors()
    abilities = _base_abilities()
    abilities[1298369] = "Mother's Wrath"
    abilities[1287032] = "Poisonous Bite"
    meta = {"title": "SV Window Test", "startTime": 1795450000000}
    fights = [
        {"id": 33, "name": "Ula'tek", "startTime": 100000, "endTime": 320000, "fightPercentage": 50.0, "bossPercentage": 50.0, "kill": False}
    ]
    events = [
        # Tank setup
        {"timestamp": 105000, "type": "damage", "sourceID": 152, "targetID": 1, "abilityGameID": 1, "amount": 100000, "fight": 33},
        {"timestamp": 106000, "type": "damage", "sourceID": 176, "targetID": 2, "abilityGameID": 1, "amount": 100000, "fight": 33},
        # Case A (Monk): Cast 110s-113s WITH Fortifying Brew active -> protected!
        # Later at 125s (debuff still ticking, >5s after cast) Fortifying Brew is gone and Monk drops to 15% -> MUST NOT be a fail!
        {"timestamp": 109500, "type": "applybuff", "sourceID": 1, "targetID": 1, "abilityGameID": 115203, "fight": 33},
        {"timestamp": 110000, "type": "applydebuff", "sourceID": 152, "targetID": 1, "abilityGameID": 1298417, "fight": 33},
        {"timestamp": 112000, "type": "damage", "sourceID": 152, "targetID": 1, "abilityGameID": 1298369, "amount": 200000, "hitPoints": 200000, "maxHitPoints": 1000000, "fight": 33},
        {"timestamp": 113000, "type": "applydebuffstack", "sourceID": 152, "targetID": 1, "abilityGameID": 1298417, "stack": 9, "fight": 33},
        {"timestamp": 120000, "type": "removebuff", "sourceID": 1, "targetID": 1, "abilityGameID": 115203, "fight": 33},
        {"timestamp": 125000, "type": "damage", "sourceID": 152, "targetID": 1, "abilityGameID": 1298418, "amount": 100000, "hitPoints": 150000, "maxHitPoints": 1000000, "fight": 33},
        {"timestamp": 135000, "type": "removedebuff", "sourceID": 152, "targetID": 1, "abilityGameID": 1298417, "fight": 33},
        # Case B (DK): Cast 150s-153s WITHOUT Def-CD -> drops to 20% at 152s, survives window (ends 158s), dies MUCH later at 190s (while debuff still on!) -> Fail, but lethal MUST be False!
        {"timestamp": 150000, "type": "applydebuff", "sourceID": 152, "targetID": 2, "abilityGameID": 1298417, "fight": 33},
        {"timestamp": 152000, "type": "damage", "sourceID": 152, "targetID": 2, "abilityGameID": 1298369, "amount": 200000, "hitPoints": 200000, "maxHitPoints": 1000000, "fight": 33},
        {"timestamp": 153000, "type": "applydebuffstack", "sourceID": 152, "targetID": 2, "abilityGameID": 1298417, "stack": 9, "fight": 33},
        {"timestamp": 190000, "type": "death", "targetID": 2, "killerID": 152, "killingAbilityGameID": 1287032, "fight": 33},
        {"timestamp": 190000, "type": "removedebuff", "sourceID": 152, "targetID": 2, "abilityGameID": 1298417, "fight": 33},
        # Case C (Monk): Cast 200s-203s WITHOUT Def-CD -> drops to 18% at 202s and dies at 206.5s (+3.5s after cast end, <= 5s!) -> Fail AND lethal MUST be True!
        {"timestamp": 200000, "type": "applydebuff", "sourceID": 152, "targetID": 1, "abilityGameID": 1298417, "fight": 33},
        {"timestamp": 202000, "type": "damage", "sourceID": 152, "targetID": 1, "abilityGameID": 1298369, "amount": 220000, "hitPoints": 180000, "maxHitPoints": 1000000, "fight": 33},
        {"timestamp": 203000, "type": "applydebuffstack", "sourceID": 152, "targetID": 1, "abilityGameID": 1298417, "stack": 9, "fight": 33},
        {"timestamp": 206500, "type": "death", "targetID": 1, "killerID": 152, "killingAbilityGameID": 1298418, "fight": 33},
    ]

    rep = analyze_report_events(meta, fights, actors, abilities, {33: events}, "qy9FnMvjwQ2R13c7")
    sv_fails = [t for t in rep["tank_fails"] if t["kind"] == "stone_venom_no_def"]
    # Case A must NOT produce a fail -> only Case B (Barrumir) & Case C (Betøng)
    assert len(sv_fails) == 2

    dk_fail = next(t for t in sv_fails if t["tank"] == "Barrumir")
    assert dk_fail["lethal"] is False
    assert dk_fail["death_rel_time"] is None

    monk_fail = next(t for t in sv_fails if t["tank"] == "Betøng")
    assert monk_fail["lethal"] is True
    assert monk_fail["death_rel_time"] == "01:46.500"


def test_p2_malice_side_attribution_and_ready_kickers():
    actors = _base_actors()
    actors[6] = {"id": 6, "name": "Schurke", "type": "Player", "subType": "Rogue"}
    actors[198] = {"id": 198, "name": "Doomscale Warden", "type": "NPC", "subType": "NPC"}
    abilities = _base_abilities()
    abilities.update(
        {
            1290779: "Malice",
            1290991: "Malice",
            1766: "Kick",
            116705: "Spear Hand Strike",
            47528: "Mind Freeze",
        }
    )
    meta = {"title": "Kick Side Test", "startTime": 1795450000000}
    fights = [
        {
            "id": 41,
            "name": "Ula'tek",
            "startTime": 100000,
            "endTime": 340000,
            "fightPercentage": 69.2,
            "bossPercentage": 69.2,
            "kill": False,
            "phaseTransitions": [{"id": 1, "startTime": 100000}, {"id": 2, "startTime": 270000}],
        }
    ]
    events = [
        # Tank identification
        {"timestamp": 105000, "type": "damage", "sourceID": 152, "targetID": 1, "abilityGameID": 1, "amount": 100000, "fight": 41},
        {"timestamp": 106000, "type": "damage", "sourceID": 176, "targetID": 2, "abilityGameID": 1, "amount": 100000, "fight": 41},
        # Side assignment via damage to Doomscale Warden (198) targetInstance 1 vs 2:
        # Side 1 (Betøng): Betøng (1), Narande (3), Näxxs (4)
        {"timestamp": 275000, "type": "damage", "sourceID": 1, "targetID": 198, "targetInstance": 1, "abilityGameID": 1, "amount": 500000, "fight": 41},
        {"timestamp": 275100, "type": "damage", "sourceID": 3, "targetID": 198, "targetInstance": 1, "abilityGameID": 1, "amount": 900000, "fight": 41},
        {"timestamp": 275200, "type": "damage", "sourceID": 4, "targetID": 198, "targetInstance": 1, "abilityGameID": 1, "amount": 800000, "fight": 41},
        # Side 2 (Barrumir): Barrumir (2), Valysa (5, Priest healer w/o kick), Schurke (6, Rogue)
        {"timestamp": 275000, "type": "damage", "sourceID": 2, "targetID": 198, "targetInstance": 2, "abilityGameID": 1, "amount": 500000, "fight": 41},
        {"timestamp": 275100, "type": "damage", "sourceID": 5, "targetID": 198, "targetInstance": 2, "abilityGameID": 1, "amount": 100000, "fight": 41},
        {"timestamp": 275200, "type": "damage", "sourceID": 6, "targetID": 198, "targetInstance": 2, "abilityGameID": 1, "amount": 900000, "fight": 41},
        # Betøng kicks Malice on inst=1 at 279s
        {"timestamp": 279000, "type": "interrupt", "sourceID": 1, "targetID": 198, "targetInstance": 1, "abilityGameID": 116705, "extraAbilityGameID": 1290779, "fight": 41},
        # Schurke kicks Malice on inst=2 at 280s (15s CD -> on CD until 295s!)
        {"timestamp": 280000, "type": "interrupt", "sourceID": 6, "targetID": 198, "targetInstance": 2, "abilityGameID": 1766, "extraAbilityGameID": 1290779, "fight": 41},
        # At 290s: inst=2 casts Malice UN-INTERRUPTED!
        {"timestamp": 290000, "type": "cast", "sourceID": 198, "sourceInstance": 2, "targetID": -1, "abilityGameID": 1290779, "fight": 41},
        # At 290.5s: inst=1 ALSO casts Malice UN-INTERRUPTED (must NOT be deduped with inst=2!)
        {"timestamp": 290500, "type": "cast", "sourceID": 198, "sourceInstance": 1, "targetID": -1, "abilityGameID": 1290779, "fight": 41},
    ]

    rep = analyze_report_events(meta, fights, actors, abilities, {41: events}, "qy9FnMvjwQ2R13c7")
    kicks = [e for e in rep["phase_events"] if e["kind"] == "malice_kick"]
    assert len(kicks) == 2
    betong_kick = next(k for k in kicks if k["player"] == "Betøng")
    assert betong_kick["side"] == "Betøng Seite"
    assert betong_kick["side_tank_class"] == "Monk"
    # Other alive players on Betøng Seite who also had kick ready when Betøng kicked
    assert {x["player"] for x in betong_kick["ready_kickers"]} == {"Narande", "Näxxs"}

    schurke_kick = next(k for k in kicks if k["player"] == "Schurke")
    assert schurke_kick["side"] == "Barrumir Seite"
    assert schurke_kick["side_tank_class"] == "DeathKnight"

    missed = [e for e in rep["phase_events"] if e["kind"] == "malice_missed"]
    assert len(missed) == 2

    miss_barrumir = next(m for m in missed if m["side"] == "Barrumir Seite")
    rdy_names_b = [x["player"] for x in miss_barrumir["ready_kickers"]]
    cd_names_b = [x["player"] for x in miss_barrumir["on_cd_kickers"]]
    assert "Barrumir" in rdy_names_b
    assert "Schurke" not in rdy_names_b
    assert "Schurke" in cd_names_b
    assert "Betøng" not in rdy_names_b
    assert "Narande" not in rdy_names_b

    miss_betong = next(m for m in missed if m["side"] == "Betøng Seite")
    rdy_names_m = [x["player"] for x in miss_betong["ready_kickers"]]
    cd_names_m = [x["player"] for x in miss_betong["on_cd_kickers"]]
    assert "Narande" in rdy_names_m
    assert "Näxxs" in rdy_names_m
    assert "Betøng" in cd_names_m
    assert "Barrumir" not in rdy_names_m


def test_egg_collision_two_carriers_vs_single_bump():
    actors = _base_actors()
    abilities = _base_abilities()
    meta = {"title": "Collision Test", "startTime": 1795450000000}
    fights = [
        {"id": 15, "name": "Ula'tek", "startTime": 100000, "endTime": 260000, "fightPercentage": 50.0, "bossPercentage": 50.0, "kill": False}
    ]
    events = [
        # Pair collision: Narande (3) & Näxxs (4) lose Noxious Shell 20ms apart + both take Noxious Splash
        {"timestamp": 120000, "type": "applydebuff", "targetID": 3, "abilityGameID": 1307612, "fight": 15},
        {"timestamp": 120000, "type": "applydebuff", "targetID": 4, "abilityGameID": 1307612, "fight": 15},
        {"timestamp": 130000, "type": "removedebuff", "targetID": 3, "abilityGameID": 1307612, "fight": 15},
        {"timestamp": 130001, "type": "damage", "sourceID": 152, "targetID": 3, "abilityGameID": 1307635, "amount": 350000, "fight": 15},
        {"timestamp": 130020, "type": "removedebuff", "targetID": 4, "abilityGameID": 1307612, "fight": 15},
        {"timestamp": 130021, "type": "damage", "sourceID": 152, "targetID": 4, "abilityGameID": 1307635, "amount": 360000, "fight": 15},
        # Single clean bump: Valysa (5) alone 20s later -> MUST stay 'noxious_splash'
        {"timestamp": 140000, "type": "applydebuff", "targetID": 5, "abilityGameID": 1307612, "fight": 15},
        {"timestamp": 150000, "type": "removedebuff", "targetID": 5, "abilityGameID": 1307612, "fight": 15},
        {"timestamp": 150002, "type": "damage", "sourceID": 152, "targetID": 5, "abilityGameID": 1307635, "amount": 310000, "fight": 15},
    ]

    rep = analyze_report_events(meta, fights, actors, abilities, {15: events}, "qy9FnMvjwQ2R13c7")
    collisions = [e for e in rep["egg_fails"] if e["kind"] == "egg_collision"]
    singles = [e for e in rep["egg_fails"] if e["kind"] == "noxious_splash"]

    assert len(collisions) == 2
    nar = next(e for e in collisions if e["player"] == "Narande")
    nax = next(e for e in collisions if e["player"] == "Näxxs")
    assert nar["collision_partners"] == ["Näxxs"]
    assert nax["collision_partners"] == ["Narande"]
    assert nar["collision_gap_ms"] == 20
    assert len(singles) == 1
    assert singles[0]["player"] == "Valysa"
    assert rep["removal_summary"]["egg_collision"] == 2
    assert rep["removal_summary"]["noxious_splash"] == 1


def test_egg_carrier_uptime_shell_dmg_and_missed_alive_vs_dead():
    meta = {"title": "Egg Uptime Test", "startTime": 1795450000000}
    actors = {
        1: {"id": 1, "name": "Alice", "type": "Player", "subType": "Mage"},
        2: {"id": 2, "name": "Bob", "type": "Player", "subType": "Warlock"},
        3: {"id": 3, "name": "Carol", "type": "Player", "subType": "Priest"},
        10: {"id": 10, "name": "Spectral Coil", "type": "NPC", "subType": "NPC"},
    }
    abilities = {
        1307612: "Noxious Shell",
        1307617: "Noxious Shell",
        1299010: "Spectral Coils",
    }
    fights = [
        {"id": 1, "name": "Ula'tek", "startTime": 0, "endTime": 60000, "bossPercentage": 70.0, "kill": False, "friendlyPlayers": [1, 2, 3]},
        {"id": 2, "name": "Ula'tek", "startTime": 100000, "endTime": 170000, "bossPercentage": 60.0, "kill": False, "friendlyPlayers": [1, 2, 3]},
        {"id": 3, "name": "Ula'tek", "startTime": 200000, "endTime": 260000, "bossPercentage": 50.0, "kill": False, "friendlyPlayers": [1, 2, 3]},
        {"id": 4, "name": "Ula'tek", "startTime": 300000, "endTime": 360000, "bossPercentage": 45.0, "kill": False, "friendlyPlayers": [1, 2, 3]},
    ]
    events_by_fight = {
        1: [
            # Pull 1: Spectral Coils break at 40s. Alice picks up at 20s (20s hold), Bob at 30s (10s hold)
            {"timestamp": 20000, "type": "applydebuff", "targetID": 1, "abilityGameID": 1307612, "fight": 1},
            {"timestamp": 25000, "type": "damage", "targetID": 1, "abilityGameID": 1307617, "amount": 60000, "fight": 1},
            {"timestamp": 30000, "type": "applydebuff", "targetID": 2, "abilityGameID": 1307612, "fight": 1},
            {"timestamp": 35000, "type": "damage", "targetID": 1, "abilityGameID": 1307617, "amount": 90000, "fight": 1},
            {"timestamp": 35000, "type": "damage", "targetID": 2, "abilityGameID": 1307617, "amount": 50000, "fight": 1},
            {"timestamp": 40000, "type": "cast", "sourceID": 10, "abilityGameID": 1299010, "fight": 1},
            {"timestamp": 40000, "type": "removedebuff", "targetID": 1, "abilityGameID": 1307612, "fight": 1},
            {"timestamp": 40000, "type": "removedebuff", "targetID": 2, "abilityGameID": 1307612, "fight": 1},
        ],
        2: [
            # Pull 2: Spectral Coils at 140s. Alice misses break & holds to 155s. Bob alive but doesn't pick up!
            {"timestamp": 125000, "type": "applydebuff", "targetID": 1, "abilityGameID": 1307612, "fight": 2},
            {"timestamp": 130000, "type": "damage", "targetID": 1, "abilityGameID": 1307617, "amount": 70000, "fight": 2},
            {"timestamp": 140000, "type": "cast", "sourceID": 10, "abilityGameID": 1299010, "fight": 2},
            {"timestamp": 150000, "type": "damage", "targetID": 1, "abilityGameID": 1307617, "amount": 200000, "fight": 2},
            {"timestamp": 155000, "type": "removedebuff", "targetID": 1, "abilityGameID": 1307612, "fight": 2},
        ],
        3: [
            # Pull 3: Spectral Coils at 240s. Alice picks up at 232s. Bob dies at 210s -> missed_dead (excused)!
            {"timestamp": 210000, "type": "death", "targetID": 2, "killerID": 10, "killingAbilityGameID": 1, "fight": 3},
            {"timestamp": 232000, "type": "applydebuff", "targetID": 1, "abilityGameID": 1307612, "fight": 3},
            {"timestamp": 240000, "type": "cast", "sourceID": 10, "abilityGameID": 1299010, "fight": 3},
            {"timestamp": 240000, "type": "removedebuff", "targetID": 1, "abilityGameID": 1307612, "fight": 3},
        ],
        4: [
            # Pull 4: Both Alice & Bob pick up so Bob reaches 2/4 (50%) -> regular carrier
            {"timestamp": 330000, "type": "applydebuff", "targetID": 1, "abilityGameID": 1307612, "fight": 4},
            {"timestamp": 331000, "type": "applydebuff", "targetID": 2, "abilityGameID": 1307612, "fight": 4},
            {"timestamp": 340000, "type": "cast", "sourceID": 10, "abilityGameID": 1299010, "fight": 4},
            {"timestamp": 340000, "type": "removedebuff", "targetID": 1, "abilityGameID": 1307612, "fight": 4},
            {"timestamp": 340000, "type": "removedebuff", "targetID": 2, "abilityGameID": 1307612, "fight": 4},
        ],
    }

    rep = analyze_report_events(meta, fights, actors, abilities, events_by_fight, "TESTEGGUPTIME123")
    assert sorted(rep["egg_regular_carriers"]) == ["Alice", "Bob"]
    assert "Carol" not in rep["egg_regular_carriers"]

    evs = rep["egg_carrier_events"]
    a_p1 = next(e for e in evs if e["player"] == "Alice" and e["pull_num"] == 1)
    assert a_p1["status"] == "ok"
    assert a_p1["duration_ms"] == 20000
    assert a_p1["held_before_break_ms"] == 20000
    assert a_p1["total_shell_dmg"] == 150000
    assert a_p1["pre_dmg_sec"][15] == 60000
    assert a_p1["pre_dmg_sec"][5] == 90000

    a_p2 = next(e for e in evs if e["player"] == "Alice" and e["pull_num"] == 2)
    assert a_p2["status"] == "missed_break"
    assert a_p2["post_break_dmg"] == 200000
    assert a_p2["post_break_ms"] == 13500

    b_p2 = next(e for e in evs if e["player"] == "Bob" and e["pull_num"] == 2)
    assert b_p2["status"] == "missed_alive"
    assert b_p2["player_was_dead"] is False

    b_p3 = next(e for e in evs if e["player"] == "Bob" and e["pull_num"] == 3)
    assert b_p3["status"] == "missed_dead"
    assert b_p3["player_was_dead"] is True

    # Carol is not a regular carrier -> never flagged with missed_alive
    assert not any(e["player"] == "Carol" for e in evs)

