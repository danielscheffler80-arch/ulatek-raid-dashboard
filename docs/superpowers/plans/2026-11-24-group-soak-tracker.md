# Gruppen-Soak-Tracker (`Intermission: The Shattering` & `Phase 1`) Implementation Plan

> **For agentic workers:** Execute task-by-task with strict TDD (RED -> Verify RED -> GREEN -> Verify GREEN) and exact 1:1 Python/TypeScript parity.

**Goal:** Track alternating 2-group `Spectral Coils` / `Soul Constrictor (1300685)` soaks in both `Intermission: The Shattering` (using P2 Warden groups: e.g. `Gruppe Betøng` vs. `Gruppe Barrumir`) and `Phase 1`, flagging missed soaks (alive only!) and wrong-group / double soaks.

**Architecture:** Pure post-pass `_build_group_soak_analysis` in `scripts/analyzer.py` and identical `buildGroupSoakAnalysis` in `web/functions/_shared/analyzer.ts` consuming already-fetched `SPELL_SOUL_CONSTRICTOR (1300685)`, `phaseTransitions` (`id=2` P2, `id=3` Shattering, `id=4` P3), `Doomscale Warden` damage/interrupt sides, and player deaths — zero extra WCL API subrequests! Surface via `aggregateGroupSoaks` in `web/src/lib/stats.ts` and a new `Gruppen-Soaks` sub-tab in `web/src/components/PhasesTab.tsx`.

**Tech Stack:** Python 3.14 (`pytest`), TypeScript / Cloudflare Pages Functions, React 19 + Tailwind CSS + Vitest.

**Spec:** `docs/superpowers/specs/2026-11-24-group-soak-tracker-design.md`

## Global Constraints
- 0 extra WCL subrequests (reuses existing `Soul Constrictor`, `Doomscale Warden`, `Deaths`, and `phaseTransitions`).
- Exact 1:1 parity between Python and Cloudflare Worker verified against live API.
- Backwards compatible for older reports lacking `group_soaks` / `soak_groups`.

## Review Focus
1. **Dead players at soak timestamp:** A player who died before the soak (`dts <= ts`) MUST be placed in `dead_expected`, NEVER in `missed_alive`.
2. **Active Boss-Tank in Phase 1:** In P1, one tank is actively holding Ula'tek (`last_boss_tank_ts` within `<= 8000 ms`) while the off-tank soaks -> active boss tank must NOT be flagged `missed_alive` in P1.
3. **Strict alternation in Shattering (`#1, #3, #5` vs `#2, #4, #6`):** Soak #1 picks starting group by majority; Soak #2 MUST expect the other group even if the wrong group walked in twice!
4. **Pure healers without Warden damage in P2:** Assigned to their tank group via majority Shattering soak parity so healers are never silently dropped from Shattering soak checks.
5. **Double-soak detection (`had_debuff`):** If a player still has `Soul Constrictor` active (`applydebuff` without prior `removedebuff`, or previous soak `<= 25s` ago) when soaking a wrong soak, flag `double_soak: true`.

---

### Task 1: Python `_build_group_soak_analysis` (TDD)

**Files:**
- Modify: `scripts/analyzer.py`
- Test: `tests/test_analyzer.py`

**Interfaces:**
- Produces on report dict:
  - `soak_groups: { shattering: { group_a_label, group_a_class, group_a_players, group_b_label, group_b_class, group_b_players }, p1: { ... } }`
  - `group_soaks: list[GroupSoakEvent]` (each `{ id, phase: "shattering"|"p1", pull_num, fight_id, is_kill, soak_num, rel_time, rel_ms, timestamp, deaths_before, expected_group, expected_group_class, total_soakers, correct_count, alternation_ok, soakers, missed_alive, wrong_group, dead_expected, events_url, replay_url }`)

- [ ] **Step 1:** Add failing test `test_group_soaks_shattering_p2_groups_and_p1_alternation` in `tests/test_analyzer.py` covering:
  - Shattering (`phaseTransitions id=2` + `id=3`): P2 Warden sides assign `Gruppe Betøng` & `Gruppe Barrumir` (plus a pure healer without Warden dmg assigned by majority soak parity), Soak #1 (`Gruppe Betøng`) -> Soak #2 (`Gruppe Barrumir` with 1 alive miss, 1 dead expected NOT blamed, and 1 wrong-group double-soaker flagged `double_soak: True`).
  - P1 soaks (`#1` and `#2`): active Boss-Tank not blamed for missing P1 soak.
- [ ] **Step 2:** Run pytest and verify RED.
- [ ] **Step 3:** Implement `_build_group_soak_analysis` in `scripts/analyzer.py` and wire into `analyze_report_events`.
- [ ] **Step 4:** Run `python -m pytest tests -v` and verify ALL pass.

---

### Task 2: Mirror 1:1 in Cloudflare Worker TypeScript (`web/functions/_shared/analyzer.ts`)

**Files:**
- Modify: `web/functions/_shared/analyzer.ts`
- Test: `web/src/lib/live.test.ts`

- [ ] **Step 1:** Add failing test in `web/src/lib/live.test.ts` verifying TS `analyzeReportEventsTS` produces identical `soak_groups` and `group_soaks` for Shattering + P1.
- [ ] **Step 2:** Run `npm test` and verify RED.
- [ ] **Step 3:** Implement `buildGroupSoakAnalysis` in `web/functions/_shared/analyzer.ts` with 1:1 logic to Python.
- [ ] **Step 4:** Run `npm test` and verify PASS.

---

### Task 3: Frontend Types, `aggregateGroupSoaks` (`stats.ts`), and `Gruppen-Soaks` Sub-Tab (`PhasesTab.tsx`)

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/lib/stats.ts`
- Modify: `web/src/lib/stats.test.ts`
- Modify: `web/src/components/PhasesTab.tsx`

- [ ] **Step 1:** Add types `GroupSoakPlayerRef`, `GroupSoakEvent`, `SoakGroupDefinition`, `ReportSoakGroups` to `web/src/types.ts` and failing test in `web/src/lib/stats.test.ts` for `aggregateGroupSoaks`.
- [ ] **Step 2:** Run `npm test` and verify RED.
- [ ] **Step 3:** Implement `aggregateGroupSoaks` in `web/src/lib/stats.ts` and add the `Gruppen-Soaks` sub-tab to `web/src/components/PhasesTab.tsx` (phase switch `Intermission: The Shattering` | `Phase 1` | `Alle`, 2-column group banner, KPI row, player table, expandable soak timeline with WCL links).
- [ ] **Step 4:** Run `npm test` and `npm run build` and verify PASS.

---

### Task 4: Re-Import Log, Full Tests, Cloudflare Deploy, Live 1:1 Parity & Push

- [ ] Re-import `qy9FnMvjwQ2R13c7`, run `pytest`, `vitest`, `npm run build`, deploy to Cloudflare Pages (`https://ulatek-mythic.pages.dev`), verify 1:1 live parity (`DIFFS: {}`), commit & push to `origin main`.
