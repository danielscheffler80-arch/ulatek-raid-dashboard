# Phase Accordion Navigation Implementation Plan

> **For agentic workers:** Execute task-by-task with strict TDD (RED -> Verify RED -> GREEN -> Verify GREEN) and fresh verification before completion.

**Goal:** Replace the flat 8-tab bar with an inline-expanding phase accordion navigation (`Allgemein`, `Phase 1`, `Phase 2`, `Intermission`, `Phase 3`) and phase-filtered `Def CDs` & `Heiler` views per phase.

**Architecture:** Store `phase_transitions` (`[{ id, start_time }]`) on each `PullData` in Python & Cloudflare TS Worker (0 extra WCL subrequests), filter `DefensivesTab` and `HealersTab` by `BossPhaseKey` via `getEventBossPhase(pull, timestamp)` in `stats.ts`, decompose `PhasesTab.tsx` to render targeted phase views (`view` prop), and render the full-width inline-expanding `PhaseNavBar` right below the slim Breadcrumb bar (Ansatz A).

**Tech Stack:** Python 3.14 (`pytest`), TypeScript / React 19 / Vite 6 / Tailwind CSS / `lucide-react`, Vitest, Cloudflare Pages Functions.

**Spec:** `docs/superpowers/specs/2026-11-24-phase-accordion-navigation-design.md`

## Global Constraints
- 1:1 parity between `scripts/analyzer.py` and `web/functions/_shared/analyzer.ts`; 0 additional WCL subrequests and < 10 ms Cloudflare Worker CPU budget.
- Concentric border radii (`outerRadius = innerRadius + padding`), `active:scale-[0.96]`, explicit `transition-property` (never `transition: all`), stroke weight matched to text weight (`1.5px` regular, `2px` semibold), Obsidian Mint dark theme.
- All UI copy in German.

## Review Focus
1. Pull without `phase_transitions` (older JSON): defaults cleanly to `'p1'` (with fallback to `warden_summaries`/`p3_summaries` timestamps if present) without crashing.
2. `phaseFilter` in `aggregateDefensives`: `consumable_usage` pull counts only count pulls that actually reached the selected phase (e.g., P2 only counts P2 pulls, not all 40 pulls).
3. `phaseFilter` in `aggregateHealerEmergency` & `aggregateHealerTankSoaks`: returns 0 events cleanly for phases never reached (e.g. Intermission / P3 in archive log) without NaN rates.
4. P2 Kicks (`malice_kick`/`malice_missed`) vs P3 Kicks (`vicious_echoes_kick`/`vicious_echoes_missed`) and P2 Avoidables vs P3 Avoidables cleanly separated between `Phase 2` and `Phase 3`.
5. Each Obertab remembers its last active Untertab when switching Obertabs; `maxDeaths` persists cleanly per active view.

---

### Task 1: Persist `phase_transitions` on `PullData` in Python & TS Worker (TDD)
- **Files:** `scripts/analyzer.py`, `tests/test_analyzer.py`, `web/functions/_shared/analyzer.ts`, `web/src/lib/live.test.ts`
- **Steps:**
  - [ ] Add failing assertion in `tests/test_analyzer.py` & `web/src/lib/live.test.ts` verifying `pulls[0]["phase_transitions"]` contains `{ id, start_time }` entries sorted by `start_time`.
  - [ ] Verify RED (`pytest` & `vitest`).
  - [ ] Add `phase_transitions` to `pulls_out` in `scripts/analyzer.py` and `web/functions/_shared/analyzer.ts`.
  - [ ] Verify GREEN (`pytest` & `vitest`).

### Task 2: `getEventBossPhase` + `phaseFilter` in `types.ts`, `stats.ts` (TDD), `DefensivesTab.tsx`, `HealersTab.tsx`
- **Files:** `web/src/types.ts`, `web/src/lib/stats.ts`, `web/src/lib/stats.test.ts`, `web/src/components/DefensivesTab.tsx`, `web/src/components/HealersTab.tsx`
- **Steps:**
  - [ ] Add `BossPhaseKey`, `OberTabKey`, `PhaseViewKey`, and `PullData.phase_transitions` to `web/src/types.ts`.
  - [ ] Write failing tests in `web/src/lib/stats.test.ts` for `getEventBossPhase` and `phaseFilter` on `aggregateDefensives`, `aggregateHealerEmergency`, and `aggregateHealerTankSoaks` (including `consumable_usage` pull filtering for P2/P3).
  - [ ] Verify RED (`vitest`).
  - [ ] Implement `getEventBossPhase` and `phaseFilter` support in `web/src/lib/stats.ts`.
  - [ ] Verify GREEN (`vitest`).
  - [ ] Wire optional `phaseFilter?: BossPhaseKey | null` prop and crisp phase badge into `DefensivesTab.tsx` and `HealersTab.tsx`.

### Task 3: `PhaseNavBar.tsx` (Inline-Accordion) & Wire `App.tsx` + `PhasesTab.tsx`
- **Files:** Create `web/src/components/PhaseNavBar.tsx`; Modify `web/src/components/PhasesTab.tsx`, `web/src/App.tsx`
- **Steps:**
  - [ ] Create `PhaseNavBar.tsx` with concentric radii (`rounded-[14px]` outer `p-1.5`, `rounded-[10px]` active Obertab capsule with bottom mint/cyan gradient glow, `rounded-[7px]` active Untertab pill), icons, `active:scale-[0.96]`, explicit transitions, and per-Obertab Untertab lists (`Allgemein`, `Phase 1`, `Phase 2`, `Intermission`, `Phase 3`).
  - [ ] Update `PhasesTab.tsx` to accept `view: PhaseViewKey` (`p1_soaks | p2_overlaps | p2_kicks | p2_warden | p2_avoidables | intermission_soaks | p3_burn | p3_kicks | p3_avoidables`), rendering clean phase-targeted KPIs & content (no internal sub-tab switcher, P2 vs P3 cleanly separated).
  - [ ] Update `App.tsx` to use the slim Breadcrumb header + full-width `PhaseNavBar` row directly below (**Ansatz A**), preserving last-selected Untertab per Obertab and routing all 21 Obertab+Untertab combinations cleanly.
  - [ ] Run `npm test && npm run build` to verify 0 TS/Vite errors.

### Task 4: Re-Import, Full Verification, Cloudflare Deploy & Push
- **Steps:**
  - [ ] Re-import `qy9FnMvjwQ2R13c7` (`python scripts/add_log.py qy9FnMvjwQ2R13c7`) so `reports.json` has `phase_transitions`.
  - [ ] Run `python -m pytest tests -v`, `npm test`, and `npm run build`.
  - [ ] Deploy `dist/` to Cloudflare Pages (`ulatek-mythic`) and verify live `reports.json` & parity.
  - [ ] Commit all changes and push to `origin main`.
