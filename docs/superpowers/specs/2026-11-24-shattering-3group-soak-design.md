# Design: 3-Gruppen-Soak-Tracker für `Intermission: The Shattering` (Hybrid: Auto-Erkennung + optionaler MRT-Note-Import)

**Datum:** 2026-11-24  
**Status:** Zur Freigabe (Ansatz B gewählt)

## 1. Ziel & Nutzerabsicht
In **`Intermission: The Shattering`** (WCL `phaseTransitions id = 3`) rotieren **3 Soak-Gruppen** (`Gruppe 1 → Gruppe 2 → Gruppe 3 → Gruppe 1 → Gruppe 2 → Gruppe 3`, insgesamt bis zu 6 `Soul Constrictor (1300685)`-Soaks). Die bisherige 2-Gruppen-P2-Logik passt dort nicht. Das neue System muss:
1. **Ohne Pflicht-Konfiguration** funktionieren und selbst bei **1–2 Live-Trys** keine falschen Anschuldigungen erzeugen.
2. Ab `≥ 2` vollen 3er-Runden (also schon ab 1 vollen 6-Soak-Intermission oder 2 Trys) die 3 Gruppen vollautomatisch erkennen — unabhängig davon, welche Gruppe einen Try startet.
3. Optional einen **MRT-Note-Import (3 Gruppen)** direkt im UI bieten, der im Browser (`localStorage`) gespeichert wird und alle Soaks sofort ohne neuen WCL-Abruf neu auswertet.

*(Phase 1 bleibt unverändert beim bewährten 2-Gruppen-Wechsel inkl. aktivem Boss-Tank-Ausschluss.)*

## 2. Gewählter Ansatz
- **Ansatz B (gewählt):** 2-Stufen-Automatik (100 %-sichere Runden-Invarianten + `3!`-Permutations-Clustering mit Konfidenz-Schutz) **plus** optionalem, eingeklapptem MRT-Note-Import direkt im `Shattering Soaks`-Tab.
- *Verworfen:* Rein manuelle Konfiguration (zu viel Pflegeaufwand im Live-Raid) und rein probabilistisches Clustering ohne Konfidenz-Schutz (erzeugt bei 1 Try zu viele False Positives).

## 3. Algorithmus-Design (1:1 Python & Cloudflare TS Worker + Client-Override)

### Stufe 1: 100 % sichere Runden-Invarianten (sofort ab Try #1, 0 % Raten)
Jede Intermission zerfällt in 3er-Runden (`Runde 1 = Soak #1–#3`, `Runde 2 = Soak #4–#6`):
- **Doppel-Soak (immer 100 % Fail):** Jeder Spieler, der innerhalb von `< 3` Soaks erneut soakt (z. B. `#1` & `#2`, `#2` & `#3`, `#3` & `#4`), wird sofort als `wrong_group` mit `double_soak: true` markiert — unabhängig von jeder Gruppenzuordnung.
- **0-Soak in voller 3er-Runde (immer 100 % Fail):** Ist eine 3er-Runde vollständig (`3` Soaks), wird jeder Spieler, der bei allen 3 Soaks der Runde **lebte** und **0×** drin stand, als `round_missed_alive` (100 % verpasst) markiert.
- Solange `< 2` vollständige 3er-Runden beobachtet wurden (`confidence = "provisional"`), werden **keine spekulativen Gruppen-Tausch-Fails** gewertet — nur diese 100 %-sicheren Fails.

### Stufe 2: Automatisches 3-Gruppen-Clustering (`≥ 2` vollständige Runden, `confidence = "high"`)
- **Best-of-6 Permutations-Matching (`3! = 6`):** Jede 3er-Runde `(c0, c1, c2)` wird über alle 6 Permutationen optimal auf `(Gruppe 1, Gruppe 2, Gruppe 3)` gematcht (maximaler Überlapp mit den bisherigen Stimmen) — ein anderer Gruppen-Start in Try 2 verschiebt die Zuordnung nicht.
- **Spieler-Zuordnung:** Jeder Spieler erhält die Gruppe mit den meisten Stimmen (`argmax(G1, G2, G3)`).
- **Zyklische Modulo-3-Auswertung pro Try:** Für jeden Try wird die Start-Reihenfolge `[ord0, ord1, ord2]` per Best-of-6-Match auf Runde 1 bestimmt; jeder Soak `s_idx` erwartet strikt `ord[(s_idx - 1) % 3]`:
  - `soakers`: Spieler der erwarteten Gruppe im Soak.
  - `wrong_group`: Spieler aus einer der anderen 2 Gruppen (inkl. `double_soak: true` bei Abstand `< 3` Soaks).
  - `missed_alive`: lebende Spieler der erwarteten Gruppe, die fehlten.
  - `dead_expected`: bereits tote Spieler der erwarteten Gruppe (**nie** ein Fail).

### Client-Side MRT-Note-Override (0 ms, 0 WCL-Subrequests)
- Jedes `shattering` `GroupSoakEvent` speichert zusätzlich `absent_alive` und `absent_dead` (kompakt — nur für Shattering-Soaks), sodass der Browser bei aktiver MRT-Note **alle Shattering-Soaks sofort deterministisch** anhand der 3 festen Gruppen neu auswerten kann (`reEvaluateShatteringWithCustomGroups` in `stats.ts`).
- **Toleranter MRT-Parser (`parseMrtSoakGroups`):**
  - Unterstützt 3 Zeilen (`Gruppe 1: ...`, `G1: ...`, `1) ...` oder reine Namenszeilen), strippt automatisch WoW-Farbcodes (`|cXXXXXXXX...|r`) und MRT-Icons (`{spell:...}`, `{rt1}`), und matcht Namen case- & akzent-tolerant (`Betong` → `Betøng`, `Naxxs` → `Näxxs`, `Leylu` → `Leÿlu`, `Bigpriest` → `ßigpriest`) gegen den Report-Roster.
  - Speicherung in `localStorage` (`ulatek_shattering_mrt_groups_v1`) inkl. Live-Vorschau, Warnung bei unbekannten Namen, „Erkannte Gruppen übernehmen“ & „Zurücksetzen (Auto)“.

## 4. UI-Darstellung (`Intermission → Shattering Soaks`)
- **Konfidenz-/Modus-Badge** im Header (`Auto (Hoch · N Runden)`, `Auto (Vorläufig · 1 Runde)` oder `MRT-Note aktiv`).
- **Eingeklappter „MRT-Note / 3 Gruppen (optional)“-Button** im Header — im Alltag unsichtbar/aufgeräumt, mit 1 Klick aufklappbar.
- **3 Gruppen-Tabellen nebeneinander** (`grid-cols-1 gap-4 xl:grid-cols-3`): **`Gruppe 1` | `Gruppe 2` | `Gruppe 3`** mit eigenen Summen (`verpasst`, `falsch`), WoW-Klassenfarben, aufklappbaren Einzelfällen und **Soak-Chronologie pro Try** (`Runde 1: #1–#3`, `Runde 2: #4–#6`).

## 5. Verifikation
- TDD-Unit-Tests in `tests/test_analyzer.py`, `web/src/lib/live.test.ts` und `web/src/lib/stats.test.ts` für:
  1. 1 partial/single round (`provisional`): erkennt 100 %-sicheren Doppel-Soak + 0-Soak-Verpasst ohne falsche Gruppen-Blames.
  2. ≥ 2 Runden inkl. vertauschter Start-Reihenfolge in Try 2 (`high`): `3!`-Matching erkennt exakt alle 3 Gruppen, `missed_alive`, `wrong_group`, `double_soak`, `dead_expected`.
  3. MRT-Note-Parser (WoW-Farbcodes, `{rt1}`, Umlaute/Sonderzeichen `Betong`/`Naxxs`/`Bigpriest`) + sofortige Client-Re-Evaluation.
- Neu-Import, Build, Cloudflare-Pages-Deploy, 1:1 Live-Parität (`DIFFS: {}`) & Git-Push.
