# Design-Spezifikation: Gruppen-Soak-Tracker (`Intermission: The Shattering` & `Phase 1`)

**Datum:** 2026-11-24  
**Scope:** Ula'tek Mythic Raid Forensics Dashboard (Python Analyzer + Cloudflare Worker TS Analyzer + React Frontend `PhasesTab.tsx`)  
**Gewählter Ansatz:** Ansatz A — `Soul Constrictor (1300685)` Gruppen-Soak-Tracking für `Intermission: The Shattering` (`Phase-ID 3`) und `Phase 1` (`Phase-ID 1`) mit 0 zusätzlichen WCL-Subrequests.

---

## 1. Ziel & Nutzen

Prüft automatisch für jeden abwechselnden Gruppen-Soak (`Spectral Coils` → `Soul Constrictor 1300685`), ob die beiden Raid-Gruppen vollständig zusammen im richtigen Soak stehen und sich strikt abwechseln:
1. **`Intermission: The Shattering` (`WCL Phase-ID 3`):** 6 abwechselnde Soaks (`#1, #3, #5` vs. `#2, #4, #6`) mit denselben beiden Gruppen wie in Phase 2 (**`Gruppe Betøng`** vs. **`Gruppe Barrumir`**).
2. **`Phase 1` (`WCL Phase-ID 1`):** Abwechselnde `Spectral Coils`-Soak-Paare (`#1/#3` vs. `#2/#4`), sodass die Funktion sofort an allen 107 P1-Soaks in `qy9FnMvjwQ2R13c7` nutzbar ist und automatisch auf `The Shattering` umschaltet, sobald ein Log Phase 3 erreicht.

**Bewertete Ereignisse pro Spieler & Soak:**
- **`Korrekt gesoakt`**: Spieler gehörte zur aktiven Soak-Gruppe und erhielt `Soul Constrictor`.
- **`Soak verpasst (lebte!)`**: Spieler gehörte zur aktiven Soak-Gruppe, **lebte** zum Soak-Zeitpunkt (und war in P1 nicht der aktive Boss-Tank), fehlte aber im Soak. Tote Spieler werden **nicht** als Fail gewertet.
- **`Falscher Soak!`**: Spieler gehörte zur **anderen** Gruppe, stand aber trotzdem im Soak (zusätzlicher Marker **`Doppel-Soak!`** falls er noch `Soul Constrictor` aus dem vorherigen Soak hatte).

---

## 2. Erwogene Ansätze & Entscheidung

| Ansatz | Beschreibung | Trade-off | Status |
|---|---|---|---|
| **Ansatz A** | Tracking für `Intermission: The Shattering` (P2-Gruppen) **und** `Phase 1` (Mehrheits-Soak-Gruppen) mit Phase-Filter im UI | Sofort testbar an P1-Logs + automatischer Intermission-Check, 0 extra API-Calls | **Gewählt** |
| **Ansatz B** | Nur `Intermission: The Shattering` (`Phase-ID 3`) | Im aktuellen Archiv-Log (Best-Pull 68,3 % P2) noch leer | Verworfen |

---

## 3. Technische Umsetzung (1:1 Parität Python & Cloudflare Worker)

### 3.1 WCL-Datenbasis (0 neue Subrequests!)
- `SPELL_SOUL_CONSTRICTOR = 1300685` (`applydebuff` / `removedebuff`) ist bereits in `CORE_MECHANIC_IDS` enthalten.
- `fights[].phaseTransitions` enthält bereits `id = 2` (Stage Two), `id = 3` (`Intermission: The Shattering`), `id = 4` (`Stage Three`).
- P2-Warden-Seiten (`Betøng Seite` vs. `Barrumir Seite`) werden bereits pro P2-Fight aus `Doomscale Warden`-Schaden/-Interrupts ermittelt.

### 3.2 Gruppen-Zuordnung & Soak-Cluster-Erkennung (`_build_group_soak_analysis` / `buildGroupSoakAnalysis`)
1. **Cluster-Bildung pro Fight:** Alle `applydebuff`-Events von `SPELL_SOUL_CONSTRICTOR (1300685)` auf Spielern werden zeitlich mit Abstand `≤ 1200 ms` zu einzelnen Soaks gebündelt (`soak_num = 1, 2, 3, ...` getrennt pro Phase).
2. **Phasen-Zuordnung je Soak:**
   - Hat der Fight ein `phaseTransition` mit `id == 3` (`shattering_start`) und `ts >= shattering_start` (und vor `id == 4` falls vorhanden) → `phase = "shattering"`.
   - Liegt `ts` vor `p2_start` (oder kein P2 erreicht) → `phase = "p1"`.
3. **Gruppen-Ermittlung:**
   - **Für `shattering` (`Gruppe <Tank A>` vs. `Gruppe <Tank B>`):**
     - Primär aus den P2-Warden-Seiten des Reports/Fights (`Betøng Seite` / `Barrumir Seite`).
     - Spieler ohne Warden-Damage (z. B. reine Heiler) werden über ihre häufigste Soak-Parität in `The Shattering` (bzw. Healer-Aktivität) automatisch der passenden Tank-Gruppe zugeordnet.
   - **Für `p1` (`Soak-Gruppe 1` vs. `Soak-Gruppe 2`):**
     - Automatische Mehrheits-Zuordnung über gerade vs. ungerade P1-Soaks (`Soak #1/#3` vs. `Soak #2/#4`) über alle Trys des Reports; benannt nach dem jeweiligen Tank bzw. `Soak-Gruppe 1` / `Soak-Gruppe 2`.
     - Der aktive Boss-Tank (letzter Boss-Melee / `Stone Venom` innerhalb `≤ 8 s` vor dem Soak) wird in P1 von „Soak verpasst“ ausgenommen.
4. **Strikte Abwechslungs-Prüfung pro Fight & Phase:**
   - Soak `#1` bestimmt anhand der Mehrheit der drin stehenden Spieler, welche der beiden Gruppen anfängt (`start_group` = `A` oder `B`).
   - Danach gilt strikt abwechselnd: `#1, #3, #5 → start_group`, `#2, #4, #6 → other_group`.
   - Pro Soak werden ausgegeben:
     - `expected_group`, `expected_group_class`, `soakers` (korrekt), `missed_alive` (fehlte trotz lebendig), `wrong_group` (stand im falschen Soak, inkl. `had_debuff` für Doppel-Soak!), `dead_expected` (fehlte weil tot — kein Fail), `alternation_ok` (boolean).

---

## 4. UI-Integration (`PhasesTab.tsx` — Sub-Tab `Gruppen-Soaks`)

- Neuer Sub-Tab **`Gruppen-Soaks`** in `P2 / P3 & Kicks` (neben `Blight Vein`, `Kicks`, `Avoidables`, `Warden DPS`, `Phase 3`).
- **Phase-Umschalter:** `Intermission: The Shattering` | `Phase 1` | `Alle` (wählt automatisch `The Shattering`, sobald Shattering-Soaks im Report existieren, sonst `Phase 1`).
- **Oben:** Kompaktes 2-Spalten-Gruppen-Banner (**Gruppe Betøng** vs. **Gruppe Barrumir** in WoW-Klassenfarben) + 4 KPI-Cards (Soaks gesamt, Saubere Soaks %, Verpasst trotz lebendig, Falscher Soak / Doppel-Soak).
- **Mitte:** Spieler-Auswertungstabelle nach Gruppe/Fails sortiert (Spieler, Gruppe, Korrekt, Verpasst trotz lebendig, Falscher Soak, Quote %).
- **Unten:** Aufklappbare Soak-Chronologie pro Try (`Soak #1 – #6`) mit erwarteter Gruppe, fehlenden lebenden Spielern (Rot), falschen Soakern (Amber/Rot) und WCL-Events-/Replay-Links.
