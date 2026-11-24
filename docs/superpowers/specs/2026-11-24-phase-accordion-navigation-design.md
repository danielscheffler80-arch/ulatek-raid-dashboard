# Design: Phasen-basierte Inline-Accordion-Navigation (`Allgemein`, `P1`, `P2`, `Intermission`, `P3`)

**Datum:** 2026-11-24  
**Status:** Zur Freigabe (Ansatz A gewählt)

## 1. Ziel & Nutzerabsicht
Die flache 8-Tab-Leiste im Top-Header wird durch eine **Inline-Accordion-Tabbar** nach Screenshot-Vorlage ersetzt:
- **Inaktive Obertabs** zeigen nur Icon + Titel (`Allgemein`, `Phase 1`, `Phase 2`, `Intermission`, `Phase 3`).
- **Aktiver Obertab** klappt inline in eine hervorgehobene Obsidian-Mint-Kapsel mit leuchtendem Mint/Cyan-Unterstreichungsbalken auf und zeigt daneben ausschließlich seine zugehörigen **Untertabs**.
- **Phasenübergreifende Checks (`Def CD / Pot / HS`, `Heiler`)** sind sowohl komplett unter **`Allgemein`** als auch **phasen-gefiltert** direkt in jeder einzelnen Phase verfügbar.

## 2. Gewählter Ansatz
- **Ansatz A (gewählt):** Vollbreite Inline-Accordion-Navigationsleiste direkt unter einer schmalen Breadcrumb-Zeile (`Ula'tek Mythic / Report · Trys`). Kein Überlappen mit langen Report-Titeln, selbst bei 7 Untertabs in `Phase 1`.
- *Verworfen:* Ansatz B (alles in einer Header-Zeile neben dem Breadcrumb — zu eng auf Laptop-Displays bei ausgeklappter Phase 1).

## 3. Obertab- & Untertab-Struktur

| Obertab | Untertabs | Filter / Scope |
|---|---|---|
| **Allgemein** | `Try-Übersicht` · `Def CD / Pot / HS` · `Heiler` | Gesamter Kampf (alle Phasen) |
| **Phase 1** | `Egg Fails` · `Wave Fails` · `Tank Fails` · `P1 Soaks` · `Herzphase` · `Def CDs` · `Heiler` | Nur Phase 1 (WCL `id = 1`) |
| **Phase 2** | `Blight Vein` · `Malice Kicks` · `Warden DPS` · `P2 Avoidables` · `Def CDs` · `Heiler` | Nur Phase 2 (WCL `id = 2`, alle Tabellen nach Gruppen gesplittet) |
| **Intermission** | `Shattering Soaks` · `Def CDs` · `Heiler` | Nur Intermission: The Shattering (WCL `id = 3`) |
| **Phase 3** | `P3 Burn` · `P3 Kicks` · `P3 Avoidables` · `Def CDs` · `Heiler` | Nur Phase 3 (WCL `id = 4`) |

- Startansicht beim Öffnen: **`Phase 1 → Egg Fails`**.
- Beim Wechsel zwischen Obertabs merkt sich jeder Obertab seinen zuletzt gewählten Untertab.

## 4. Datenmodell & Phasen-Filterung (0 zusätzliche WCL-Subrequests)
- **Python (`scripts/analyzer.py`) & TS-Worker (`web/functions/_shared/analyzer.ts`):** Speichern `phase_transitions: [{ id, start_time }]` direkt auf jedem Pull in `pulls` (kommt bereits im `fights`-Query von WCL mit, 0 extra API-Calls, 0 CPU-Overhead).
- **Frontend (`web/src/lib/stats.ts`):**
  - `getEventBossPhase(pull, timestamp)` ordnet jedes Event exakt `p1 | p2 | intermission | p3` zu (`id 1/2/3/4`).
  - `aggregateDefensives`, `aggregateHealerEmergency` und `aggregateHealerTankSoaks` erhalten einen optionalen `phaseFilter?: BossPhaseKey | null`. Bei gesetztem `phaseFilter` werden Events auf diese Phase gefiltert und `consumable_usage`-Trys nur für Trys gezählt, die diese Phase tatsächlich erreicht haben.
  - `PhasesTab.tsx` wird über einen expliziten `view`-Prop gesteuert (keine doppelten internen Subtabs mehr; P2 Kicks/Avoidables sauber von P3 Kicks/Avoidables getrennt).

## 5. Verifikation & Rollout
- Unit-Tests (TDD) in `tests/test_analyzer.py`, `web/src/lib/live.test.ts` und `web/src/lib/stats.test.ts` für `phase_transitions` + phasen-gefilterte `Defensives` & `Healers`.
- Neu-Import von `qy9FnMvjwQ2R13c7`, Production-Build (`tsc -b && vite build`), Cloudflare-Pages-Deploy, Live-Verifikation & Git-Push.
