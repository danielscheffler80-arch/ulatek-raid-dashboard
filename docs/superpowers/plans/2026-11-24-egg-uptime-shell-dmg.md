# Egg-Träger Uptime, Unnötiger Shell-Schaden & Verpasste Pickups — Implementation Plan

> **For agentic workers:** Implementing natively task-by-task with strict TDD and 1:1 parity between Python (`scripts/`) and Cloudflare Pages Functions (`web/functions/`).

**Goal:** Track per-carrier `Noxious Shell (1307612)` uptime, real `Noxious Shell (1307617)` DoT damage, customizable live tolerance window (`minSec`–`maxSec`, default `5–12 s`), missed breaks ("Ei nicht losgeworden"), late+hit fails, and missed pickups separated by alive vs. dead status.

**Architecture:** Extract `SPELL_NOXIOUS_SHELL_DMG (1307617)` alongside existing core mechanics in both Python and Cloudflare Pages Functions; emit compact per-round `egg_carrier_events` with 1-second pre-break damage buckets (`pre_dmg_sec`) so the frontend can recalculate exact unnecessary time & damage instantaneously for any user-selected `[minSec, maxSec]` window.

**Tech Stack:** Python 3.14 (`pytest`), TypeScript / Cloudflare Pages Functions (`vitest`), React 19 + Tailwind CSS v4 (Obsidian Mint).

## Global Constraints
- 100 % 1:1 parity between `scripts/analyzer.py` and `web/functions/_shared/analyzer.ts`.
- All UI labels & responses in German.
- Preserve Obsidian Mint dark UI (`#050911`, `#34f5c5`, `#fbbf24`, `#f87171`, `tabular-nums`, WoW class colors).
- Default live tolerance window: `5–12 s` (`minSec = 5`, `maxSec = 12`), freely adjustable by the user.
- "Zu spät" only flagged when the egg was hit (`caustic_waves`/`egg_collision`) with `< minSec` or when the player failed to break it (`missed_break`).
- Dead players before a round are marked `missed_dead` (excused), never counted as alive missed-pickup fails.

## Review Focus
- Early wipes before the first `Spectral Coils (1299010)` cast must never generate false `missed_alive` or `unnecessary` penalties (`status: "wiped_before_break"`).
- Players who die before a round must be labeled `missed_dead`, not `missed_alive`.
- `pre_dmg_sec` buckets must sum exact real `1307617` damage ticks so changing `maxSec` from `12` to `8` or `15` updates exact damage without reload.
- `maxDeaths` and `pullRange` filters must apply cleanly to `egg_carrier_events` and uptime denominators.
- Backup carriers (non-regulars) appear in uptime/damage stats when they pick up an egg, but are never penalized with `missed_alive` on rounds they don't carry.

---

### Task 1: Python WCL Client + Analyzer (`egg_carrier_events` & `egg_regular_carriers`)
- **Files:** `scripts/wcl_client.py`, `scripts/analyzer.py`, `tests/test_analyzer.py`
- Add `SPELL_NOXIOUS_SHELL_DMG` to `CORE_MECHANIC_IDS` in `scripts/wcl_client.py`.
- Implement `_build_egg_carrier_analysis` in `scripts/analyzer.py` producing `egg_regular_carriers: list[str]` and `egg_carrier_events: list[dict]`.
- Add TDD unit test `test_egg_carrier_uptime_shell_dmg_and_missed_alive_vs_dead` in `tests/test_analyzer.py`.
- Re-import `qy9FnMvjwQ2R13c7` into `web/public/data/reports.json`.

### Task 2: Cloudflare Pages Functions 1:1 Parity
- **Files:** `web/functions/_shared/spells.ts`, `web/functions/_shared/wcl.ts`, `web/functions/_shared/analyzer.ts`, `web/src/lib/live.test.ts`
- Include `SPELL_NOXIOUS_SHELL_DMG (1307617)` in `nonHpCoreEvents` (non-HP damage query in `wcl.ts`).
- Port exact `egg_regular_carriers` & `egg_carrier_events` calculation to `web/functions/_shared/analyzer.ts`.
- Add parity unit test in `web/src/lib/live.test.ts`.

### Task 3: Frontend Aggregation, Types & Interactive `5–12 s` Tolerance UI
- **Files:** `web/src/types.ts`, `web/src/lib/stats.ts`, `web/src/lib/stats.test.ts`, `web/src/components/EggFailsTab.tsx`
- Add `EggCarrierEvent` types and `aggregateEggCarriers(reports, maxDeaths, pullRange, minSec, maxSec)` in `web/src/lib/stats.ts` with Vitest tests.
- Add view switcher inside `EggFailsTab.tsx` (`Egg Fails & Kollisionen` | `Träger-Uptime & Shell-Dmg`) with freely adjustable `Min (s)` / `Max (s)` tolerance controls (default `5–12 s`), KPI cards (Gesamt Shell-Dmg, Unnötiger Dmg, Ø Tragedauer, Nicht genommen / Verpasst), per-player table with WoW class colors, and expandable per-round breakdown.

### Task 4: Full Verification, Cloudflare Pages Deploy & Git Push
- Run `python -m pytest tests -v`, `cd web; npm test; npm run build`.
- Deploy to `https://ulatek-mythic.pages.dev` and verify 1:1 parity on `/api/analyze` vs `reports.json` including `egg_carrier_events` & `egg_regular_carriers`.
- Commit & push to `origin main`.
