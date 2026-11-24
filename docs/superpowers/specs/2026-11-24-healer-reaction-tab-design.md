# Design-Spezifikation: Heiler-Reaktionstab (Emergency Heals & Bosstank-Soak) + Defensives-Bugfix

**Datum:** 2026-11-24  
**Scope:** Ula'tek Mythic Raid Forensics Dashboard (Python Analyzer + Cloudflare Worker TS Analyzer + React Frontend)  
**Gewählter Ansatz:** Ansatz A — Spec-basierte Reaktionszeit + Instant-CD-Tracking (Live & Archiv, 1:1 Parität)

---

## 1. Ziel & Nutzen

1. **Neuer Tab `Heiler`** mit **zwei strikt getrennten Ansichten** (Segmented Switch):
   - **Emergency Heals (Einzelziel-Rettung `< 35 %`, kein Raid-weiter Drop):** Zeigt für jeden lebenden Heiler, wie schnell er auf einzelne stark gedroppte Spieler (insb. nach unnötigem/isoliertem Schaden wie Caustic Waves, Egg-DoT, Noxious Splash, Rattler Slam, Falling Debris etc.) switcht — reine **Reaktionszeit bis zum Heal-Ansatz** (nicht Heal-Menge), inkl. Prüfung ob ein **Instant-Heal ready** war, ob stattdessen ein Hardcast angesetzt wurde oder gar kein Heal kam.
   - **Bosstank-Soak-Heal (`Mother's Wrath` / `Stone Venom`):** Zeigt getrennt pro Heiler, ob und wie schnell der Bosstank während/direkt nach dem Tank-Soak aktiv angeheilt oder mit einem External unterstützt wurde — oder unangeheilt blieb.
2. **Defensives-Tab Bugfix:**
   - Deduplizierung von `death`-Events (beseitigt die `490` doppelten Einträge aus `Deaths` + `nonHpCoreEvents`).
   - Ausschluss vermeidbarer Tode (`Caustic Waves`, `Falling Debris`, `Rattler Slam`, `Noxious Splash`, P2/P3-Avoidables) aus dem Defensives-Tab, da diese bereits in Wave/Egg/P2-P3-Tabs erfasst werden.

**Nicht-Ziele:**
- Keine HPS-/Overheal-/Throughput-Auswertung (es zählt ausschließlich Reaktionszeit, Cast-Ansatz & Instant-Heal-Verfügbarkeit).
- Keine exakte Talent-CDR-Simulation (z. B. *Apotheosis*/*Serendipity*) — Instant-CDs werden konservativ nach Standard-Basis-Cooldown & Charges berechnet, sodass niemand zu Unrecht als „Instant rdy verpasst“ markiert wird.

---

## 2. Erwogene Ansätze & Entscheidung

| Ansatz | Beschreibung | Trade-off | Status |
|---|---|---|---|
| **Ansatz A** | Spec-basierte Reaktionszeit (`begincast`-Start) + konservatives Instant-Heal-CD/Charges-Tracking + getrennter Bosstank-Soak-Tracker + Live-WCL-Parität | Minimale konservative Unschärfe bei CDR-Talenten; beantwortet alle Fragen vollständig | **Gewählt** |
| **Ansatz B** | Nur Cast-Reaktion (Instant / Hardcast / kein Heal) ohne Instant-CD-Tracking | Keine CDR-Unschärfe, beantwortet aber nicht *„hatten sie einen Instant Heal rdy?“* | Verworfen |

---

## 3. Technische Architektur & Datenfluss (1:1 Parität Python & Cloudflare Worker)

### 3.1 WCL-Datenabfrage (`scripts/wcl_client.py` & `web/functions/_shared/wcl.ts`)
1. **Heiler- & Tank-Rollen pro Try (`playerDetails`):**
   - `playerDetails(fightIDs: [...], includeCombatantInfo: false)` liefert alle Heiler + Specs + `count` über den gesamten Report.
   - Falls mindestens ein Heiler `count < len(fights)` hat (z. B. `Danthree` nur in 9 von 40 Trys als Resto, sonst Ele), werden per gebatchter GraphQL-Aliases (`18` pro Request = 2–3 Subrequests) die Heiler **pro Fight** ermittelt (`healers_by_fight[fid] = { player_id: spec_name }`).
2. **Alle `< 35 %`-Damage-Events (2 WCL-Pages für 40 Trys):**
   - `dataType: DamageTaken`, `includeResources: true`, `filterExpression: 'type = "damage" and resources.hitPoints > 0 and resources.hitPoints * 100 < resources.maxHitPoints * 35'`.
3. **Heiler-Casts & `begincast` (~5 WCL-Pages für 40 Trys):**
   - `dataType: Casts`, `filterExpression: '(type = "cast" or type = "begincast") and source.name in (...)'` für alle erkannten Heiler.
   - Bleibt komfortabel innerhalb des Cloudflare-50-Subrequest-Budgets.

### 3.2 Defensives-Bugfix (`scripts/analyzer.py`, `web/functions/_shared/analyzer.ts`, `spells_config.py` / `spells.ts`)
- **Deduplizierung:** In `wcl_client.py` / `wcl.ts` schließt `nonHpExpr` explizit `type != "death"` bei allgemeinen Mechanic-IDs aus (nur `Doomscale Warden` death bleibt dort), und im Analyzer wird zusätzlich per `(tid, ts)` auf `death`-Events dedupliziert.
- **Ausschluss vermeidbarer Tode:** Neue Konstante `AVOIDABLE_DEATH_ABILITY_IDS` (`Caustic Waves`, `Falling Debris`, `Rattler Slam`, `Noxious Splash`, `Rancid Yolk`, `P2_AVOIDABLE_IDS`) + Name-Match (`P3_AVOIDABLE_SPELL_NAMES`) filtert vermeidbare Tode aus `defensive_events` (sowie defensiver Guard im Frontend `stats.ts`).

### 3.3 Heiler-Analyzer — Teil 1: Emergency Heals (Einzelziel `< 35 %`)
- **Event-Erkennung (pro Fight):**
  - Jeder Non-Tank-Spieler, der durch ein Damage-Event auf `0 < hp_pct < 35.0` droppt (4,0 s Debounce pro Ziel, um wiederholte Ticks desselben Drops zu bündeln).
  - **Kein Raid-weiter Drop:** Im Zeitfenster `[drop_ts - 2000 ms, drop_ts + 2000 ms]` dürfen **maximal 3 eindeutige Spieler** unter `35 %` HP gedroppt sein (sonst Raid-Burst → ignoriert).
  - Auswertung des Ausgangs: `target_died` (starb das Ziel innerhalb `0–4,5 s` nach Drop?) + `trigger_ability` + `hp_pct`.
- **Reaktionsmessung pro lebendem Heiler im Fight (`0` bis `+4.000 ms` nach `drop_ts`):**
  - Heiler, die zum Zeitpunkt `drop_ts` tot sind oder das Ziel selbst sind, werden nicht negativ gewertet (Heiler-Selbstrettung zählt ggf. normal oder wird separat markiert; tote Heiler ausgeschlossen).
  - Erster gezielter Heal-Cast (`targetID == victim_id` aus spec-spezifischem Direct-Heal- & External-Katalog; bei Hardcasts zählt der zugehörige `begincast`-Start innerhalb `0–3,5 s` vor `cast`, geklemmt auf `max(drop_ts, begincast_ts)`).
  - **Reaktionszeit:** `reaction_ms = heal_start_ts - drop_ts`.
  - **Instant-Heal-Verfügbarkeit (konservativ nach Basis-CD & Charges je Spec):**
    - *Holy Priest:* `Holy Word: Serenity` (60s, 2 Charges), `Power Word: Life` (15s), `Guardian Spirit` (180s), `Power Word: Shield` (8s)
    - *Discipline Priest:* `Power Word: Shield` (8s), `Power Word: Life` (15s), `Penance` (9s), `Pain Suppression` (180s, 2 Charges)
    - *Restoration Shaman:* `Riptide` (6s, 2 Charges), `Nature's Swiftness` (60s), `Ancestral Swiftness` (45s), `Unleash Life` (15s)
    - *Restoration Druid:* `Swiftmend` (15s), `Nature's Swiftness` (60s), `Ironbark` (90s)
    - *Preservation Evoker:* `Reversion` (9s, 2 Charges), `Verdant Embrace` (24s), `Time Dilation` (60s), `Echo` (instant, immer wenn Cast-Kandidat — getrennt von CD-Instants als Instant-Heal gewertet)
    - *Holy Paladin:* `Holy Shock` (8s), `Lay on Hands` (420s), `Blessing of Sacrifice` (120s), `Blessing of Protection` (300s)
    - *Mistweaver Monk:* `Life Cocoon` (120s), `Renewing Mist` (9s, 2 Charges), `Thunder Focus Tea` (30s)
  - **Status pro Heiler & Event:**
    - `instant_used`: Instant-Heal/External angesetzt (`reaction_ms`, `spell`).
    - `cast_used`: Hardcast angesetzt (`reaction_ms`, `spell`, plus Flag `instant_was_ready` & Liste `ready_instants`).
    - `no_heal`: Kein gezielter Heal innerhalb `4,0 s` (plus Flag `instant_was_ready`, `ready_instants`, und Flag `covered_fast_by_other`: wahr, falls ein anderer Heiler bereits innerhalb `≤ 1,2 s` reagiert hat und das Ziel überlebte).

### 3.4 Heiler-Analyzer — Teil 2: Bosstank-Soak-Heal (`Mother's Wrath` / `Stone Venom`)
- **Fenster-Erkennung (pro Fight):**
  - Identisch zur bewährten Tank-Fails-Logik: Sobald ein Tank `Stone Venom` (`applydebuff`/`applydebuffstack`) oder `Mother's Wrath` (`damage`) erhält, wird ein Soak-Fenster eröffnet (`window_start` bis `last_stack_ts + 5000 ms`, zusammengefasst bei Abständen `≤ 3000 ms`).
  - Erfasst `tank`, `tank_class`, `stacks`, `min_hp_pct`, `tank_died`.
- **Reaktionsmessung pro lebendem Heiler (`[window_start - 1000 ms, window_end]`):**
  - Erster gezielter Heal / External auf den Bosstank (`reaction_ms` ab `window_start`, bei Pre-Cast vor erstem Hit `0 ms`), `heal_count`, `used_external`, `spells`, oder `healed: false` (nicht angeheilt).

---

## 4. UI-Design (`HealersTab.tsx` — Obsidian Mint / `shadcn/ui`)

- **Neuer Tab** `Heiler` in der Top-Navigation & Sidebar (inkl. eigenem `maxDeathsByTab`-Filter wie bei allen anderen Tabs).
- **Segmented Sub-View-Umschalter** ganz oben im Tab (strikt getrennt):
  1. **`Emergency Heals (< 35 %)`**
     - 4 KPI-Cards: Isolierte `< 35 %`-Drops (davon gestorben), Ø Schnellste Raid-Reaktion, Instant-Heal-Nutzung (wenn rdy), Verpasst trotz Instant rdy (ohne schnelle Fremdrettung).
     - Heiler-Übersichtstabelle (in WoW-Klassenfarben, `tabular-nums`): Heiler + Spec, Relevante Drops, Ø Reaktionszeit, Instant genutzt, Hardcast angesetzt (davon Instant rdy), Kein Heal (davon Instant rdy / Ziel starb).
     - Aufklappbare Event-Liste je Heiler (Filter: `Kein Heal trotz rdy`, `Alle Reaktionen`, `Ziel gestorben`) mit Opfer (Klassenfarbe), Auslöser-Spell, HP%, Reaktionszeit, angesetzter Spell oder bereite Instants, plus `Events`- & `Replay`-WCL-Links.
  2. **`Bosstank-Soak-Heal`**
     - 4 KPI-Cards: Tank-Soaks gesamt, Tank-Soaks mit aktivem Heiler-Heal, Ø Reaktionszeit auf Bosstank, Tank-Drops `< 30 %` / Tode.
     - Heiler-Übersichtstabelle: Heiler + Spec, Tank-Soaks (aktiv dabei), Soaks geheilt (%), Ø Reaktionszeit, Ø Heals/Soak, Externals, Ungeheilt gelassen.
     - Aufklappbare Soak-Historie (Try, Zeit, Bosstank, Stacks, Min-HP%, welche Heiler wann & womit geheilt haben + WCL-Links).

---

## 5. Datenmodell-Erweiterung & Backwards-Kompatibilität

- `ReportData` bekommt zwei optionale Arrays (`healer_emergency_events?: HealerEmergencyEvent[]`, `healer_tank_soak_events?: HealerTankSoakEvent[]`) + `healers?: { id: number; name: string; class: string; spec: string; pulls: number }[]`.
- Ältere Reports ohne diese Felder rendern sauber einen leeren Hinweis-Zustand ohne Absturz.
- Alle Änderungen werden mit Unit-Tests in `tests/test_analyzer.py` (Python) und `web/src/lib/stats.test.ts` (Vitest) per TDD abgesichert und nach dem Cloudflare-Pages-Deploy 1:1 gegen die Live-API verifiziert.
