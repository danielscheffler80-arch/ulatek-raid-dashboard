# Heiler-Reaktionstab & Defensives-Bugfix Implementation Plan

> **For agentic workers:** Execute task-by-task with strict TDD (RED -> Verify RED -> GREEN -> Verify GREEN) and exact 1:1 Python/TypeScript parity.

**Goal:** Fix duplicate & avoidable deaths in `Defensives` and add a new `Heiler` tab tracking (1) single-target `< 35 %` emergency reaction times + conservative instant-heal readiness and (2) Boss-Tank soak (`Mother's Wrath` / `Stone Venom`) healing reactions separately.

**Architecture:** Extend `wcl_client.py` & `wcl.ts` to query per-fight healer roles (`playerDetails`), all `< 35 %` damage events (`resources.hitPoints * 100 < resources.maxHitPoints * 35`), and healer `cast`/`begincast` events. Implement identical pure analysis logic in `scripts/analyzer.py` and `web/functions/_shared/analyzer.ts` backed by a shared healer-spell catalog in `spells_config.py` & `spells.ts`, then surface both views separately in a new `HealersTab.tsx` component.

**Tech Stack:** Python 3.14 (`pytest`), TypeScript / Cloudflare Pages Functions, React 19 + Tailwind CSS + Vitest (`npm test`, `npm run build`).

**Spec:** `docs/superpowers/specs/2026-11-24-healer-reaction-tab-design.md`

## Global Constraints
- 1:1 parity between Python (`scripts/`) and TypeScript (`web/functions/_shared/`) verified against live Cloudflare Pages API (`https://ulatek-mythic.pages.dev/api/analyze`).
- Stay well within Cloudflare Pages 50-subrequest free-tier limit across 40+ pull logs.
- Keep Obsidian Mint dark theme (`#050911`, `#34f5c5`, `#38bdf8`, `#fbbf24`, `#f87171`), WoW class colors, `tabular-nums`, and backwards compatibility for older reports lacking healer arrays.

## Review Focus
1. **Duplicate `death` events in `events_by_fight`:** Both `Deaths` and `nonHpCoreEvents` can return the same player death timestamp — must deduplicate by `(tid, ts)` AND exclude avoidable killing abilities (`Caustic Waves`, `Falling Debris`, `Rattler Slam`, `Noxious Splash`, `Rancid Yolk`, `P2_AVOIDABLE_IDS`, `P3_AVOIDABLE_SPELL_NAMES`).
2. **Role-switching healers (e.g. `Danthree` healing 9/40 pulls, DPSing 31/40 pulls):** Must track healers per `fight_id` so a DPS pull is never scored as "Healer missed heal".
3. **Raid-wide burst exclusion:** If `> 3` unique players drop `< 35 %` within `±2000 ms`, the drop is a raid-wide burst and must be excluded from single-target Emergency Heals.
4. **Hardcast `begincast` start time with `targetID = -1`:** A `begincast` followed by a targeted `cast` within `0–3500 ms` must credit `max(drop_ts, begincast_ts)` as reaction time; dead healers at `drop_ts` must be excluded from that event's reaction scores.
5. **Fast save by another healer:** If another healer reacts within `<= 1200 ms` and the target survives, healers who did not cast are flagged `covered_fast_by_other: true` so they are distinguished from genuine unhealed misses.

---

### Task 1: Defensives-Bugfix + Healer Spell Catalog & Python Analyzer (TDD)

**Files:**
- Modify: `scripts/spells_config.py`
- Modify: `scripts/analyzer.py`
- Modify: `scripts/wcl_client.py`
- Test: `tests/test_analyzer.py`

**Interfaces:**
- Produces in `spells_config.py`:
  - `AVOIDABLE_DEATH_ABILITY_IDS: set[int]`
  - `is_avoidable_defensive_death(ability_id: int | None, ability_name: str) -> bool`
  - `HEALER_DIRECT_HEAL_SPELLS: set[str]`
  - `HEALER_INSTANT_SPELLS_BY_SPEC: dict[str, list[dict[str, Any]]]` (each `{ "name": str, "cd_ms": int, "charges": int, "is_external": bool }`)
  - `is_healer_direct_heal(ability_name: str) -> bool`
  - `is_healer_instant_heal(ability_name: str, spec: str) -> bool`
  - `is_healer_external_spell(ability_name: str) -> bool`
- Produces in `analyzer.py` report output:
  - `healers: list[{id, name, class, spec, pulls}]`
  - `healer_emergency_events: list[HealerEmergencyEvent]`
  - `healer_tank_soak_events: list[HealerTankSoakEvent]`
  - Consumes `extra_tables.get("healers_by_fight")`, `extra_tables.get("low_hp_damage_by_fight")`, `extra_tables.get("healer_casts_by_fight")` (with clean fallback to `events_by_fight` for unit tests).

- [ ] **Step 1: Write failing tests in `tests/test_analyzer.py`**
  - `test_defensive_deaths_deduplicated_and_avoidable_excluded` (duplicates at same `(tid, ts)` produce 1 event; `Caustic Waves` / `Falling Debris` / `Rattler Slam` deaths excluded; unavoidable `Putrid Membrane` death kept).
  - `test_healer_emergency_reactions_instant_cast_and_raid_burst_filter` (isolated `< 35%` drop triggers reactions with `begincast` start time, instant CD/charge readiness, dead healer excluded, `covered_fast_by_other`, and raid burst with 4 simultaneous `< 35%` players excluded).
  - `test_healer_tank_soak_reactions_separate` (Boss-Tank `Stone Venom`/`Mother's Wrath` window tracks which healers healed the boss tank, reaction time, external flag, and unhealed miss).
- [ ] **Step 2: Run pytest and verify all 3 new tests FAIL.**
- [ ] **Step 3: Implement spells config, analyzer logic, and WCL client fetchers (`playerDetails` per-fight batching, `< 35%` damage query, healer casts query, and `type != "death"` fix in `nonHpExpr`).**
- [ ] **Step 4: Run `python -m pytest tests -v` and verify ALL tests pass.**

---

### Task 2: Mirror 1:1 in Cloudflare Worker TypeScript (`web/functions/_shared/`)

**Files:**
- Modify: `web/functions/_shared/spells.ts`
- Modify: `web/functions/_shared/analyzer.ts`
- Modify: `web/functions/_shared/wcl.ts`
- Test: `web/src/lib/live.test.ts`

- [ ] **Step 1: Add failing Vitest test in `web/src/lib/live.test.ts`** verifying TS `analyzeReportEventsTS` produces identical deduplicated/filtered `defensive_events`, `healer_emergency_events`, and `healer_tank_soak_events`.
- [ ] **Step 2: Run `npm test` and verify new test FAILS.**
- [ ] **Step 3: Mirror spell catalog, analyzer logic, and WCL queries identically in `spells.ts`, `analyzer.ts`, and `wcl.ts`.**
- [ ] **Step 4: Run `npm test` and verify PASS.**

---

### Task 3: Frontend Types, Aggregation (`stats.ts`), and `HealersTab.tsx` (TDD)

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/lib/stats.ts`
- Modify: `web/src/lib/stats.test.ts`
- Create: `web/src/components/HealersTab.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add failing Vitest tests in `web/src/lib/stats.test.ts`** for `aggregateHealerEmergency`, `aggregateHealerTankSoaks`, and avoidable-death guard in `aggregateDefensives`.
- [ ] **Step 2: Run `npm test` and verify FAIL.**
- [ ] **Step 3: Update `types.ts`, implement `aggregateHealerEmergency` & `aggregateHealerTankSoaks` in `stats.ts`, build `HealersTab.tsx` (with strictly separated Segmented Switch: `Emergency Heals (< 35 %)` vs. `Bosstank-Soak-Heal`), and wire `healers` tab in `App.tsx`.**
- [ ] **Step 4: Run `npm test` and `npm run build` and verify PASS.**

---

### Task 4: Re-Import Log, Full Verification, Cloudflare Deploy, Live 1:1 Parity & Push

- [ ] **Step 1:** Run `python scripts/add_log.py qy9FnMvjwQ2R13c7` and verify cleaned `defensive_events` (0 dups, 0 avoidable deaths) + populated `healer_emergency_events` and `healer_tank_soak_events`.
- [ ] **Step 2:** Run full `python -m pytest tests -v`, `cd web; npm test`, and `cd web; npm run build`.
- [ ] **Step 3:** Deploy `web/dist` to Cloudflare Pages (`npx --yes wrangler pages deploy dist --project-name ulatek-mythic --branch main --commit-dirty=true`).
- [ ] **Step 4:** Verify 1:1 live parity between `web/public/data/reports.json` and `https://ulatek-mythic.pages.dev/api/analyze?code=qy9FnMvjwQ2R13c7&nocache=1` across `defensive_events`, `healer_emergency_events`, and `healer_tank_soak_events`.
- [ ] **Step 5:** Commit & push to `origin main`.
