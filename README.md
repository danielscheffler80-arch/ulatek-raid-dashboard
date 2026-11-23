# Ula'tek Mythic — Raid Forensik Dashboard

Kostenlos über **GitHub Pages** gehostetes Analyse-Dashboard für **Ula'tek Mythic** (`Encounter 3492`, `Difficulty 5`) mit persistenter Speicherung aller Raidabende (`web/public/data/reports.json`) und automatischem Import neuer WarcraftLogs-Reports.

## Enthaltene Analyse-Tabs
Jeder Tab zeigt standardmäßig die **gesamte Statistik** und bietet oben einen flexiblen Filter **„Bis max. Tode“** (`Alle`, `0`, `1`, `2`, `3`, `5` oder freie Zahl):

1. **Egg Fails:** `Caustic Waves` auf aktive `Noxious Shell (1307612)` + `Noxious Splash (1307635)`-Bumps inkl. Millisekunden-Verifikation (`Rancid Yolk` & `Putrid Membrane`).
2. **Wave Fails:** Alle direkten Treffer von `Caustic Waves (1292403)` im gesamten Raid (ohne 1s-DoT-Ticks).
3. **Tank Fails:**
   - **Tentakel-Aggro-Fails:** Tode von Nicht-Tanks durch `Gore Rattle` `Melee` inkl. Zuweisung des freien Tanks (ohne `Mephitic Thrash` / `Rattler Slam`).
   - **`Stone Venom (1298417)` `< 30 % HP` ohne Def-CD / External:** Per WCL-HP-Telemetrie erkannt.
4. **Def CD / Pot / HS:** Nutzung von `Silvermoon Health Potion`, `Healthstone` und persönlichen Def-CDs bei großen Damage-Spitzen (`Mephitic Thrash`, `Spectral Coils`, `Putrid Membrane`, `Caustic Waves` bei Drop `< 35 % HP`) sowie Toden mit ungenutztem Pot/HS/Def-CD.
5. **Try-Übersicht:** Chronologische Übersicht aller Pulls (`Try 1..N`) inkl. Boss-%, Dauer und Fehler-Zählern.

---

## Neuen Raidabend / Log hinzufügen

### Weg 1: Direkt im Browser über GitHub Actions (empfohlen für Offiziere)
1. Im GitHub-Repo auf **Actions** → **„Neuen WarcraftLogs-Report analysieren“** klicken.
2. Auf **Run workflow** klicken, die neue WarcraftLogs-URL (oder den 16-stelligen Report-Code) einfügen und optional ein Label (z. B. `Mittwoch Raid`) angeben.
3. Das WCL-Secret liegt sicher in GitHub Secrets – nach ca. 30 Sekunden ist das Live-Dashboard automatisch aktualisiert.

### Weg 2: Lokal über das Python-Skript (`scripts/add_log.py`)
Erstelle einmalig eine lokale `.env`-Datei im Projekt-Root (wird durch `.gitignore` niemals committet):

```env
WCL_CLIENT_ID=deine_client_id
WCL_CLIENT_SECRET=dein_client_secret
```

Neuen Log analysieren und direkt live pushen:

```bash
python scripts/add_log.py "https://www.warcraftlogs.com/reports/DEIN_REPORT_CODE" --label "Sonntag Raid" --push
```

Ohne `--push` wird nur lokal `web/public/data/reports.json` aktualisiert.

## Lokale Entwicklung & Tests
```bash
# Python-Tests
python -m pytest tests -v

# Frontend lokal starten & testen
cd web
npm install
npm test
npm run dev
```
