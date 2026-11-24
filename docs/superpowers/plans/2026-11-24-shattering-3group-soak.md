# Shattering 3-Group Soak Tracker Implementation Plan

> **For agentic workers:** Execute task-by-task with strict TDD (RED -> Verify RED -> GREEN -> Verify GREEN) and fresh verification before completion.

**Goal:** Replace the 2-group Shattering soak logic with a 2-stage 3-group auto-detection engine (100% round invariants on Try #1 + 3! permutation clustering at >= 2 rounds) plus an optional localStorage MRT-Note override with instant client-side re-evaluation and 3 side-by-side group tables.

**Architecture:** Separate `soak_groups.p2` (2 P2 Warden groups for P2 tabs) from `soak_groups.shattering` (3 groups with `confidence` & `rounds_observed`). Store `absent_alive` and `absent_dead` on each `shattering` `GroupSoakEvent` so client-side MRT-Note overrides re-evaluate every Shattering soak in 0 ms without re-fetching WCL. Keep 1:1 parity between Python (`scripts/analyzer.py`) and Cloudflare TS Worker (`web/functions/_shared/analyzer.ts`).

**Tech Stack:** Python 3.14 (`pytest`), TypeScript / React 19 / Vite 6 / Tailwind CSS, Vitest, Cloudflare Pages Functions.

**Spec:** `docs/superpowers/specs/2026-11-24-shattering-3group-soak-design.md`

## Global Constraints
- 0 additional WCL subrequests and < 10 ms Cloudflare Worker CPU budget.
- 1:1 parity between Python and TS Worker verified live (`DIFFS: {}`).
- Phase 1 2-group soaks (including P1 Boss-Tank exemption) and P2 2-group splits (Overlaps, Kicks, Warden DPS, P2 Avoidables) remain intact.

## Review Focus
1. 1 partial/single round (`rounds_observed < 2`): `confidence === 'provisional'`, double-soaks (`< 3` soaks gap) and alive 0-soak players across a full 3-soak round ARE flagged, while speculative group swaps are NOT blamed.
2. >= 2 complete rounds with shifted start order in Pull 2 (e.g. Pull 1: G1->G2->G3, Pull 2: G2->G3->G1): `3! = 6` permutation alignment matches groups without drift; `confidence === 'high'`.
3. Dead players in `expected_group` ALWAYS land in `dead_expected`, NEVER in `missed_alive` (both auto and MRT-Note override).
4. MRT-Note parser strips WoW color codes (`|cff...|r`), `{spell:...}`/`{rt1}`, handles `Gruppe 1:` / `G1:` / `1)` / plain 3 lines, and matches accent/case-insensitively (`Betong`->`Betøng`, `Naxxs`->`Näxxs`, `Leylu`->`Leÿlu`, `Bigpriest`->`ßigpriest`).
5. `getLatestP2Groups` reads `soak_groups.p2` (fallback to legacy `soak_groups.shattering`) so P2 tabs keep their exact `Gruppe Barrumir` | `Gruppe Betøng` split.

---

### Task 1: 3-Group Shattering Engine in Python (`scripts/analyzer.py` + TDD in `tests/test_analyzer.py`)
- Update `_build_group_soak_analysis`:
  - Emit `soak_groups["p2"]` with the 2 P2 Warden groups (`Gruppe Barrumir` / `Gruppe Betøng`), unchanged.
  - Emit `soak_groups["shattering"] = { "confidence": "high" | "provisional" | "none", "rounds_observed": int, "groups": [{"key": "G1", "label": "Gruppe 1", "players": [...]}, ...] }`.
  - Implement 3! = 6 permutation alignment across all 3-soak rounds (`#1-#3`, `#4-#6`) across all pulls.
  - Evaluate each Shattering soak:
    - Always compute `round_num = (s_idx - 1) // 3 + 1`, `absent_alive`, `absent_dead`, and `< 3` soak-gap `double_soak` detection.
    - When `rounds_observed < 2` (`provisional`): only flag 100%-certain `double_soak` players in `wrong_group` and (on soak 3 of a complete 3-soak round) alive players who soaked 0 times in that 3-soak round in `missed_alive` (with `confidence: "provisional"`).
    - When `rounds_observed >= 2` (`high`): strictly match each pull's rotation `[ord0, ord1, ord2]` via best-of-6 permutation and flag all `missed_alive`, `wrong_group` (with `double_soak` if soaked `< 3` soaks earlier), and `dead_expected`.
- Update existing test + add provisional (1 round) & shifted-order (2 rounds) tests in `tests/test_analyzer.py`. Verify RED -> GREEN.

### Task 2: 1:1 TypeScript Worker Mirror (`web/functions/_shared/analyzer.ts` + TDD in `web/src/lib/live.test.ts`)
- Port the exact `soak_groups.p2` + 3-group `soak_groups.shattering` + `absent_alive`/`absent_dead` + 3! permutation clustering into `buildGroupSoakAnalysis`.
- Update & add matching Vitest tests in `web/src/lib/live.test.ts`. Verify RED -> GREEN.

### Task 3: Types, MRT-Note Parser, Client Re-Evaluation (`stats.ts` + TDD) & 3-Table UI (`PhasesTab.tsx`)
- Update `web/src/types.ts` (`ShatteringGroupEntry`, `ShatteringSoakGroups`, `ReportSoakGroups.p2`, `GroupSoakEvent` optional fields `round_num`, `confidence`, `absent_alive`, `absent_dead`).
- Implement `parseMrtSoakGroups(rawText, roster)` and `reEvaluateShatteringWithCustomGroups(soaks, customGroups)` + integrate optional `customShatteringGroups` into `aggregateGroupSoaks` in `web/src/lib/stats.ts` (TDD in `web/src/lib/stats.test.ts`).
- Update `getLatestP2Groups` to read `soak_groups.p2` first (with backwards-compatible fallback).
- Update `PhasesTab.tsx` (`view === 'intermission_soaks'`):
  - Confidence/Mode badge (`Auto (Hoch · N Runden)` | `Auto (Vorläufig · 1 Runde)` | `MRT-Note aktiv`).
  - Collapsible optional MRT-Note override panel (textarea, live parsed preview, unknown-name warnings, `Erkannte Gruppen laden`, `Übernehmen`, `Zurücksetzen (Auto)`), persisted in `localStorage`.
  - 3 side-by-side Group Tables (`xl:grid-cols-3`): `Gruppe 1 | Gruppe 2 | Gruppe 3`!

### Task 4: Re-Import, Full Tests, Build, Cloudflare Deploy, Live 1:1 Parity & Push
- Re-import `qy9FnMvjwQ2R13c7`, run `pytest` + `vitest` + `npm run build`, deploy to Cloudflare Pages, extend & run `verify_parity.py` (`DIFFS: {}`), commit & push to `origin main`.
