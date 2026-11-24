import { Fragment, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Egg,
  Flame,
  Minus,
  Plus,
  RotateCcw,
  Skull,
  Timer,
  Users,
} from 'lucide-react'
import type { ReportData } from '../types'
import {
  aggregateEggCarriers,
  aggregateEggFails,
  formatDamage,
  WOW_CLASS_COLORS,
} from '../lib/stats'
import type {
  EggCarrierPlayerRow,
  EggCollisionIncident,
  PullRange,
} from '../lib/stats'
import {
  Card,
  ClassDot,
  EmptyState,
  KpiCard,
  Pill,
  SubFilterPills,
  WclActionLinks,
} from './ui'

function formatDurationShort(ms: number): string {
  const sec = Math.max(0, ms) / 1000
  if (sec < 60) return `${sec.toFixed(1)} s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec - m * 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}

export function EggFailsTab({
  reports,
  isMultiReport,
  searchQuery,
  maxDeaths,
  pullRange,
}: {
  reports: ReportData[]
  isMultiReport: boolean
  searchQuery: string
  maxDeaths: number
  pullRange: PullRange
}) {
  const [viewMode, setViewMode] = useState<'fails' | 'uptime'>('fails')
  const [subFilter, setSubFilter] = useState<'all' | 'caustic_waves' | 'egg_collision'>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [expandedCarrier, setExpandedCarrier] = useState<Record<string, boolean>>({})

  // Frei anpassbares Live-Toleranz-Fenster (Standard: 5–12 Sek. vor Spectral-Coils-Break)
  const [minTolSec, setMinTolSec] = useState<number>(5)
  const [maxTolSec, setMaxTolSec] = useState<number>(12)
  const [onlyRegulars, setOnlyRegulars] = useState<boolean>(true)

  const handleMinTolChange = (next: number) => {
    const clamped = Math.max(0, Math.min(30, Math.round(next)))
    setMinTolSec(clamped)
    if (clamped > maxTolSec) setMaxTolSec(clamped)
  }

  const handleMaxTolChange = (next: number) => {
    const clamped = Math.max(1, Math.min(45, Math.round(next)))
    setMaxTolSec(clamped)
    if (clamped < minTolSec) setMinTolSec(clamped)
  }

  const stats = useMemo(
    () => aggregateEggFails(reports, maxDeaths, pullRange, subFilter),
    [reports, maxDeaths, pullRange, subFilter],
  )

  const carrierStats = useMemo(
    () => aggregateEggCarriers(reports, maxDeaths, pullRange, minTolSec, maxTolSec),
    [reports, maxDeaths, pullRange, minTolSec, maxTolSec],
  )

  const q = searchQuery.trim().toLowerCase()
  const filteredPlayers = useMemo(() => {
    if (!q) return stats.players
    return stats.players.filter(
      (p) =>
        p.player.toLowerCase().includes(q) ||
        p.className.toLowerCase().includes(q) ||
        p.items.some(
          (it) =>
            `try ${it.pull_num}`.includes(q) ||
            String(it.pull_num) === q ||
            (it.collision_partners ?? []).some((cp) => cp.toLowerCase().includes(q)),
        ),
    )
  }, [stats.players, q])

  const filteredCollisions = useMemo(() => {
    if (!q) return stats.collisionIncidents
    return stats.collisionIncidents.filter(
      (inc) =>
        `try ${inc.pull_num}`.includes(q) ||
        String(inc.pull_num) === q ||
        inc.participants.some(
          (p) =>
            p.player.toLowerCase().includes(q) || p.className.toLowerCase().includes(q),
        ),
    )
  }, [stats.collisionIncidents, q])

  const filteredCarriers = useMemo(() => {
    const base = onlyRegulars && carrierStats.regularCount > 0
      ? carrierStats.players.filter((p) => p.isRegular)
      : carrierStats.players
    if (!q) return base
    return base.filter(
      (p) =>
        p.player.toLowerCase().includes(q) ||
        p.className.toLowerCase().includes(q) ||
        p.items.some((it) => `try ${it.pull_num}`.includes(q) || String(it.pull_num) === q),
    )
  }, [carrierStats.players, carrierStats.regularCount, onlyRegulars, q])

  const toggle = (name: string) =>
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))

  const toggleCarrier = (name: string) =>
    setExpandedCarrier((prev) => ({ ...prev, [name]: !prev[name] }))

  const collisionListCard = subFilter !== 'caustic_waves' && (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
        <div>
          <h2 className="text-[14px] font-semibold text-white">
            Egg-Kollisionen — Wer ist mit wem zusammengelaufen?
          </h2>
          <p className="text-[12px] text-[#8b96a9]">
            Direkte Paar-Übersicht aller 2-Träger-Kollisionen (beide verlieren Noxious Shell ≤ 250 ms mit Noxious Splash).
          </p>
        </div>
        <Pill variant={filteredCollisions.length > 0 ? 'destructive' : 'success'}>
          {filteredCollisions.length} {filteredCollisions.length === 1 ? 'Kollision' : 'Kollisionen'}
        </Pill>
      </div>

      {filteredCollisions.length === 0 ? (
        <EmptyState
          title="Keine Egg-Kollisionen im aktuellen Filter"
          description={`Bis maximal ${maxDeaths} Tode sind keine 2 Egg-Träger ineinander gelaufen.`}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                <th className="py-2.5 pl-4 pr-2">Try &amp; Zeit</th>
                <th className="py-2.5 px-2">Beteiligte Spieler</th>
                <th className="py-2.5 px-2 text-right">Abstand</th>
                <th className="py-2.5 px-2">Status</th>
                <th className="py-2.5 pl-2 pr-4 text-right">WCL</th>
              </tr>
            </thead>
            <tbody>
              {filteredCollisions.map((inc) => (
                <CollisionIncidentRow
                  key={inc.id}
                  incident={inc}
                  isMultiReport={isMultiReport}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )

  const playerTableCard = (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
        <div>
          <h2 className="text-[14px] font-semibold text-white">Spieler-Auswertung — Egg Fails &amp; Kollisionen</h2>
          <p className="text-[12px] text-[#8b96a9]">
            Caustic-Waves-Treffer mit Ei + 2-Träger-Kollisionen (beide verlieren Noxious Shell ≤ 250 ms mit Noxious Splash).
          </p>
        </div>
        <SubFilterPills
          value={subFilter}
          onChange={setSubFilter}
          options={[
            { value: 'all', label: 'Alle', count: stats.allTotal },
            { value: 'caustic_waves', label: 'Welle', count: stats.waveTotal },
            { value: 'egg_collision', label: 'Kollision (2 Träger)', count: stats.collisionIncidents.length },
          ]}
        />
      </div>

      {filteredPlayers.length === 0 ? (
        <EmptyState
          title="Keine Egg Fails im aktuellen Filter"
          description={`Bis maximal ${maxDeaths} Tode wurde kein Ei-Fehler (Welle oder 2-Träger-Kollision) gefunden.`}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                <th className="py-2.5 pl-4 pr-2">Spieler</th>
                <th className="py-2.5 px-2 text-right">Gesamt</th>
                <th className="py-2.5 px-2 text-right">Welle</th>
                <th className="py-2.5 px-2 text-right">Kollision</th>
                <th className="py-2.5 px-2 text-right">Ø Schaden</th>
                <th className="py-2.5 pl-2 pr-4 text-right">Tödlich</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map((row) => {
                const isOpen = !!expanded[row.player]
                return (
                  <EggPlayerRowView
                    key={row.player}
                    row={row}
                    playerClassMap={stats.playerClassMap}
                    isOpen={isOpen}
                    isMultiReport={isMultiReport}
                    onToggle={() => toggle(row.player)}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )

  return (
    <div className="space-y-4">
      {/* Standard-Ei-Träger Übersicht (immer oben sichtbar) */}
      {stats.regularCarriers.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-[rgba(52,245,197,0.22)] bg-[rgba(10,16,24,0.85)] px-3.5 py-2.5 text-[12px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-[#34f5c5]">
              <Users className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              Standard-Ei-Träger ({stats.regularCarriers.length}):
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {stats.regularCarriers.map((rc) => (
                <span
                  key={rc.name}
                  className="inline-flex items-center gap-1.5 rounded-[6px] border border-[rgba(255,255,255,0.09)] bg-[rgba(5,9,17,0.85)] px-2 py-0.5 text-[12px] font-semibold"
                >
                  <ClassDot className={rc.className} />
                  <span style={{ color: WOW_CLASS_COLORS[rc.className] ?? '#ffffff' }}>
                    {rc.name}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <span className="text-[11px] text-[#8b96a9]">
            Andere Spieler werden markiert, falls alle Standard-Träger noch lebten.
          </span>
        </div>
      )}

      {/* Top View Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div
          className="inline-flex items-center rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[rgba(10,14,22,0.85)] p-1"
          role="tablist"
          aria-label="Egg-Analyse Ansicht"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'fails'}
            onClick={() => setViewMode('fails')}
            className={`inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12px] font-medium transition-[background-color,color] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 ${
              viewMode === 'fails'
                ? 'bg-[rgba(52,245,197,0.16)] text-[#34f5c5] font-semibold'
                : 'text-[#c5cdd9] hover:text-white'
            }`}
          >
            <Egg className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            <span>Egg Fails &amp; Kollisionen</span>
            <span className="font-mono-num text-[11px] opacity-80">({stats.allTotal})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'uptime'}
            onClick={() => setViewMode('uptime')}
            className={`inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12px] font-medium transition-[background-color,color] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 ${
              viewMode === 'uptime'
                ? 'bg-[rgba(52,245,197,0.16)] text-[#34f5c5] font-semibold'
                : 'text-[#c5cdd9] hover:text-white'
            }`}
          >
            <Timer className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            <span>Träger-Uptime &amp; Shell-Schaden</span>
            {carrierStats.hasData && (
              <span className="font-mono-num text-[11px] opacity-80">
                ({formatDamage(carrierStats.totalUnnecessaryDmg)} unnötig)
              </span>
            )}
          </button>
        </div>

        {viewMode === 'uptime' && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Frei anpassbares Toleranz-Fenster (Min–Max Sek.) */}
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[rgba(52,245,197,0.28)] bg-[rgba(10,16,24,0.9)] px-3 py-1.5 text-[12px]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#34f5c5]">
                Ideal-Fenster:
              </span>

              {/* Min Sek. (zu spät <) */}
              <div className="inline-flex items-center gap-1">
                <span className="text-[11px] text-[#8b96a9]">Min</span>
                <button
                  type="button"
                  onClick={() => handleMinTolChange(minTolSec - 1)}
                  aria-label="Minimum Sekunden verringern"
                  className="obsidian-btn p-1 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={minTolSec}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (!Number.isNaN(v)) handleMinTolChange(v)
                  }}
                  aria-label="Mindest-Sekunden vor Break"
                  className="w-11 rounded-[6px] border border-[rgba(255,255,255,0.14)] bg-[#050911] px-1.5 py-0.5 text-center font-mono-num text-[12px] font-semibold text-white focus-visible:outline-none focus-visible:border-[#34f5c5]"
                />
                <button
                  type="button"
                  onClick={() => handleMinTolChange(minTolSec + 1)}
                  aria-label="Minimum Sekunden erhöhen"
                  className="obsidian-btn p-1 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <span className="font-mono-num text-[11px] text-[#8b96a9]">s</span>
              </div>

              <span className="text-[#8b96a9]">–</span>

              {/* Max Sek. (zu früh >) */}
              <div className="inline-flex items-center gap-1">
                <span className="text-[11px] text-[#8b96a9]">Max</span>
                <button
                  type="button"
                  onClick={() => handleMaxTolChange(maxTolSec - 1)}
                  aria-label="Maximum Sekunden verringern"
                  className="obsidian-btn p-1 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={45}
                  value={maxTolSec}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (!Number.isNaN(v)) handleMaxTolChange(v)
                  }}
                  aria-label="Maximal-Sekunden vor Break"
                  className="w-11 rounded-[6px] border border-[rgba(255,255,255,0.14)] bg-[#050911] px-1.5 py-0.5 text-center font-mono-num text-[12px] font-semibold text-white focus-visible:outline-none focus-visible:border-[#34f5c5]"
                />
                <button
                  type="button"
                  onClick={() => handleMaxTolChange(maxTolSec + 1)}
                  aria-label="Maximum Sekunden erhöhen"
                  className="obsidian-btn p-1 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <span className="font-mono-num text-[11px] text-[#8b96a9]">s</span>
              </div>

              {(minTolSec !== 5 || maxTolSec !== 12) && (
                <button
                  type="button"
                  onClick={() => {
                    setMinTolSec(5)
                    setMaxTolSec(12)
                  }}
                  title="Zurück auf Standard 5–12 s"
                  className="obsidian-btn inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-[#c5cdd9] hover:text-white active:scale-[0.95]"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>5–12 s</span>
                </button>
              )}
            </div>

            {carrierStats.regularCount > 0 && (
              <SubFilterPills
                value={onlyRegulars ? 'regulars' : 'all'}
                onChange={(v) => setOnlyRegulars(v === 'regulars')}
                options={[
                  { value: 'regulars', label: 'Stamm-Träger', count: carrierStats.regularCount },
                  { value: 'all', label: 'Alle Träger', count: carrierStats.players.length },
                ]}
              />
            )}
          </div>
        )}
      </div>

      {viewMode === 'fails' ? (
        <>
          {/* KPI Row */}
          <div className="kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Egg Fails gesamt"
              value={stats.allTotal}
              subtext={`${stats.waveTotal} Welle + ${stats.collisionIncidents.length} Kollisionen (≤ ${maxDeaths} Tode)`}
              icon={<Egg className="h-4 w-4" strokeWidth={1.75} />}
              tone={stats.allTotal > 0 ? 'warning' : 'success'}
            />
            <KpiCard
              label="Wellen-Treffer (mit Ei)"
              value={stats.waveTotal}
              subtext="Noxious Shell durch Caustic Waves geplatzt"
              icon={<Flame className="h-4 w-4" strokeWidth={1.75} />}
              tone={stats.waveTotal > 0 ? 'warning' : 'success'}
            />
            <KpiCard
              label="Egg-Kollisionen (Paare)"
              value={stats.collisionIncidents.length}
              subtext={`${stats.collisionTotal} beteiligte Spieler (Shell ≤ 250 ms verloren)`}
              icon={<Users className="h-4 w-4" strokeWidth={1.75} />}
              tone={stats.collisionIncidents.length > 0 ? 'destructive' : 'success'}
            />
            <KpiCard
              label="Tödliche Egg Fails"
              value={stats.lethalTotal}
              subtext="Direkt beim Ei-Bruch gestorben"
              icon={<Skull className="h-4 w-4" strokeWidth={1.75} />}
              tone={stats.lethalTotal > 0 ? 'destructive' : 'success'}
            />
          </div>

          {/* Main Bento Grid */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2 space-y-4">
              {subFilter === 'egg_collision' ? (
                <>
                  {collisionListCard}
                  {playerTableCard}
                </>
              ) : (
                <>
                  {playerTableCard}
                  {collisionListCard}
                </>
              )}
            </div>

            {/* Right Side Panel: Separated Phase Distributions & Clean Splashes */}
            <Card className="p-4 space-y-4 self-start">
              <div>
                <h3 className="text-[14px] font-semibold text-white">Zeitfenster-Verteilung</h3>
                <p className="text-[12px] text-[#8b96a9]">
                  Getrennt nach Wellen-Treffern (mit Ei) und 2-Träger-Kollisionen (Paare).
                </p>
              </div>

              {/* Block 1: Wellen-Treffer (mit Ei) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.6px]">
                  <span className="inline-flex items-center gap-1.5 text-[#fbbf24]">
                    <Flame className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />
                    Wellen-Treffer (mit Ei)
                  </span>
                  <span className="font-mono-num text-white">{stats.waveTotal}×</span>
                </div>
                <div className="space-y-2">
                  {stats.wavePhases.map((ph) => (
                    <div key={`wave-${ph.label}`} className="space-y-1">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-[#c5cdd9]">{ph.label}</span>
                        <span className="font-mono-num text-white font-medium">
                          {ph.count}× ({ph.pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] transition-[width] duration-300"
                          style={{ width: `${ph.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Block 2: Egg-Kollisionen (Paare) */}
              <div className="border-t border-[rgba(255,255,255,0.08)] pt-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.6px]">
                  <span className="inline-flex items-center gap-1.5 text-[#f87171]">
                    <Users className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />
                    Egg-Kollisionen (Paare)
                  </span>
                  <span className="font-mono-num text-white">{stats.collisionIncidents.length}×</span>
                </div>
                <div className="space-y-2">
                  {stats.collisionPhases.map((ph) => (
                    <div key={`col-${ph.label}`} className="space-y-1">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-[#c5cdd9]">{ph.label}</span>
                        <span className="font-mono-num text-white font-medium">
                          {ph.count}× ({ph.pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#f87171] to-[#ef4444] transition-[width] duration-300"
                          style={{ width: `${ph.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Positive Clean Single Splash Note */}
              <div className="rounded-[10px] border border-[rgba(52,245,197,0.28)] bg-[rgba(52,245,197,0.08)] p-3 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#34f5c5]">
                    <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                    Saubere Einzel-Bumps
                  </span>
                  <span className="font-mono-num font-bold text-white">{stats.cleanSplashCount}×</span>
                </div>
                <p className="mt-1 text-[11.5px] text-[#c5cdd9] leading-relaxed">
                  Einzelne Noxious-Splash-Bumps (ohne zweiten Träger) gelten als korrekt gespielt. Laufen dagegen 2 Egg-Träger innerhalb ≤ 250 ms ineinander, zählt es oben als Egg-Kollision.
                </p>
              </div>

              <div className="border-t border-[rgba(255,255,255,0.08)] pt-3 text-[12px] text-[#8b96a9] space-y-1.5">
                <div className="flex items-center gap-1.5 text-[#c5cdd9] font-medium">
                  <Flame className="h-3.5 w-3.5 text-[#fbbf24]" strokeWidth={1.75} aria-hidden="true" />
                  <span>Erkennungslogik</span>
                </div>
                <p className="leading-relaxed">
                  <strong className="text-[#c5cdd9]">Welle:</strong> <code className="font-mono-num text-white">removedebuff Noxious Shell</code> 0–50 ms vor <code className="font-mono-num text-white">Caustic Waves</code>.{' '}
                  <strong className="text-[#c5cdd9]">Kollision:</strong> ≥ 2 Spieler verlieren <code className="font-mono-num text-white">Noxious Shell</code> innerhalb ≤ 250 ms mit <code className="font-mono-num text-white">Noxious Splash</code> (ohne <code className="font-mono-num text-white">Spectral Coils</code>).
                </p>
              </div>
            </Card>
          </div>
        </>
      ) : (
        /* Träger-Uptime & Noxious Shell DoT-Schaden Ansicht */
        <div className="space-y-4">
          <div className="kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Noxious Shell Schaden"
              value={formatDamage(carrierStats.totalShellDmg)}
              subtext={`${carrierStats.totalPickups} Egg-Pickups (≤ ${maxDeaths} Tode)`}
              icon={<Flame className="h-4 w-4" strokeWidth={1.75} />}
              tone="warning"
            />
            <KpiCard
              label={`Unnötiger Dmg (> ${maxTolSec} s)`}
              value={formatDamage(carrierStats.totalUnnecessaryDmg)}
              subtext={`${carrierStats.unnecessaryDmgPct}% vom Shell-Schaden (+ verpasste Breaks)`}
              icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.75} />}
              tone={carrierStats.totalUnnecessaryDmg > 0 ? 'destructive' : 'success'}
            />
            <KpiCard
              label="Ø Tragedauer / Unnötig"
              value={`${carrierStats.avgHoldSec.toFixed(1)} s`}
              subtext={`${formatDurationShort(carrierStats.totalUnnecessarySec * 1000)} unnötig über ${maxTolSec} s`}
              icon={<Clock className="h-4 w-4" strokeWidth={1.75} />}
              tone={carrierStats.avgHoldSec > maxTolSec ? 'warning' : 'success'}
            />
            <KpiCard
              label="Nicht genommen / Verpasst"
              value={`${carrierStats.missedAliveTotal} / ${carrierStats.missedBreakTotal + carrierStats.lateHitTotal}`}
              subtext={`${carrierStats.missedAliveTotal}× lebend nicht gen. · ${carrierStats.missedBreakTotal}× nicht losgew. · ${carrierStats.missedDeadTotal}× tot (entsch.)`}
              icon={<Skull className="h-4 w-4" strokeWidth={1.75} />}
              tone={
                carrierStats.missedAliveTotal > 0 || carrierStats.missedBreakTotal > 0
                  ? 'destructive'
                  : 'success'
              }
            />
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
              <div>
                <h2 className="text-[14px] font-semibold text-white">
                  Egg-Träger Disziplin, Uptime &amp; unnötiger Noxious-Shell-Schaden
                </h2>
                <p className="text-[12px] text-[#8b96a9]">
                  Ideal-Fenster <span className="font-mono-num text-white">{minTolSec}–{maxTolSec} s</span> vor Spectral-Coils-Break ·
                  Tragen <span className="font-mono-num text-[#fbbf24]">&gt; {maxTolSec} s</span> zählt als unnötige Zeit &amp; echter{' '}
                  <code className="font-mono-num text-white">Noxious Shell (1307617)</code>-Schaden ·{' '}
                  <span className="font-mono-num text-[#f87171]">&lt; {minTolSec} s</span> nur als „zu spät“ gewertet, wenn getroffen oder Break verpasst.
                </p>
              </div>
              <Pill variant="info">
                {filteredCarriers.length} {filteredCarriers.length === 1 ? 'Spieler' : 'Spieler'}
              </Pill>
            </div>

            {!carrierStats.hasData ? (
              <EmptyState
                title="Noch keine Egg-Uptime-Daten in diesem Report"
                description="Importiere den Report neu oder öffne ihn über den Live-Sync, um Noxious Shell (1307617) DoT-Daten zu laden."
              />
            ) : filteredCarriers.length === 0 ? (
              <EmptyState
                title="Keine Egg-Träger im aktuellen Filter"
                description="Passe Suchfeld, Try-Bereich oder Max. Tode an."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                      <th className="py-2.5 pl-4 pr-2">Spieler</th>
                      <th className="py-2.5 px-2 text-right">Pickups</th>
                      <th className="py-2.5 px-2 text-right">Uptime</th>
                      <th className="py-2.5 px-2 text-right">Ø / Max Dauer</th>
                      <th className="py-2.5 px-2 text-right">Unnötig (&gt;{maxTolSec}s)</th>
                      <th className="py-2.5 px-2 text-right">Unnötiger Dmg</th>
                      <th className="py-2.5 px-2 text-right">Gesamt-Dmg</th>
                      <th className="py-2.5 px-2 text-right">Verpasst / Spät</th>
                      <th className="py-2.5 pl-2 pr-4 text-right">Nicht genommen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCarriers.map((row) => (
                      <EggCarrierPlayerRowView
                        key={row.player}
                        row={row}
                        maxTolSec={maxTolSec}
                        isOpen={!!expandedCarrier[row.player]}
                        isMultiReport={isMultiReport}
                        onToggle={() => toggleCarrier(row.player)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

function EggCarrierPlayerRowView({
  row,
  maxTolSec,
  isOpen,
  isMultiReport,
  onToggle,
}: {
  row: EggCarrierPlayerRow
  maxTolSec: number
  isOpen: boolean
  isMultiReport: boolean
  onToggle: () => void
}) {
  const lateAndMissedBreak = row.missedBreakCount + row.lateHitCount
  return (
    <>
      <tr className="border-b border-[rgba(255,255,255,0.05)] hover:bg-[rgba(52,245,197,0.055)] transition-colors">
        <td className="py-2.5 pl-4 pr-2 whitespace-nowrap">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            className="flex items-center gap-2 text-left text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 rounded"
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-[#34f5c5]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-[#8b96a9]" />
            )}
            <ClassDot className={row.className} />
            <span style={{ color: WOW_CLASS_COLORS[row.className] ?? '#ffffff' }}>{row.player}</span>
            {row.isRegular ? (
              <span className="rounded-[5px] border border-[rgba(52,245,197,0.3)] bg-[rgba(52,245,197,0.1)] px-1.5 py-0.5 text-[10px] font-medium text-[#34f5c5]">
                Stamm
              </span>
            ) : (
              <>
                <span className="rounded-[5px] border border-[rgba(255,255,255,0.12)] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-[#8b96a9]">
                  Backup
                </span>
                {row.takenWhileAllRegularsAliveCount > 0 && (
                  <span className="rounded-[5px] border border-[rgba(239,68,68,0.38)] bg-[rgba(239,68,68,0.14)] px-1.5 py-0.5 text-[10px] font-semibold text-[#f87171]">
                    {row.takenWhileAllRegularsAliveCount}× alle Stamm lebten!
                  </span>
                )}
                {row.takenAsDeadBackupCount > 0 && (
                  <span className="rounded-[5px] border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.12)] px-1.5 py-0.5 text-[10px] font-medium text-[#38bdf8]">
                    {row.takenAsDeadBackupCount}× Ersatz (Stamm tot)
                  </span>
                )}
              </>
            )}
          </button>
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12.5px] font-semibold text-white">
          {row.pickups}×
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12.5px] whitespace-nowrap">
          <div className="text-white font-medium">{row.uptimePct.toFixed(1)}%</div>
          <div className="text-[10.5px] text-[#8b96a9]">{formatDurationShort(row.totalHoldMs)}</div>
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12.5px] whitespace-nowrap">
          <div
            className={
              row.avgHoldSec > maxTolSec + 6
                ? 'text-[#f87171] font-semibold'
                : row.avgHoldSec > maxTolSec
                  ? 'text-[#fbbf24] font-semibold'
                  : 'text-[#34f5c5] font-semibold'
            }
          >
            Ø {row.avgHoldSec.toFixed(1)} s
          </div>
          <div className="text-[10.5px] text-[#8b96a9]">Max {row.maxHoldSec.toFixed(1)} s</div>
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12.5px] whitespace-nowrap">
          {row.unnecessaryMs > 0 ? (
            <>
              <div className="text-[#fbbf24] font-semibold">{formatDurationShort(row.unnecessaryMs)}</div>
              <div className="text-[10.5px] text-[#8b96a9]">Ø +{row.avgUnnecessarySec.toFixed(1)} s</div>
            </>
          ) : (
            <span className="text-[#34f5c5]">0 s</span>
          )}
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12.5px] whitespace-nowrap">
          {row.unnecessaryDmg > 0 ? (
            <>
              <div className="text-[#f87171] font-semibold">{formatDamage(row.unnecessaryDmg)}</div>
              <div className="text-[10.5px] text-[#fca5a5]">{row.unnecessaryDmgPct.toFixed(1)}%</div>
            </>
          ) : (
            <span className="text-[#34f5c5]">0</span>
          )}
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12.5px] text-[#c5cdd9] whitespace-nowrap">
          {formatDamage(row.totalShellDmg)}
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12px] whitespace-nowrap">
          {lateAndMissedBreak > 0 ? (
            <div className="inline-flex flex-col items-end gap-0.5">
              {row.missedBreakCount > 0 && (
                <Pill variant="destructive">{row.missedBreakCount}× nicht losgew.</Pill>
              )}
              {row.lateHitCount > 0 && (
                <Pill variant="warning">{row.lateHitCount}× spät + Hit</Pill>
              )}
            </div>
          ) : (
            <span className="text-[#8b96a9]">0</span>
          )}
        </td>
        <td className="py-2.5 pl-2 pr-4 text-right font-mono-num text-[12px] whitespace-nowrap">
          {row.missedAliveCount > 0 || row.missedDeadCount > 0 ? (
            <div className="inline-flex flex-col items-end gap-0.5">
              {row.missedAliveCount > 0 && (
                <Pill variant="destructive">{row.missedAliveCount}× lebend</Pill>
              )}
              {row.missedDeadCount > 0 && (
                <span className="text-[11px] text-[#8b96a9]">{row.missedDeadCount}× tot (entsch.)</span>
              )}
            </div>
          ) : (
            <span className="text-[#34f5c5]">0</span>
          )}
        </td>
      </tr>

      {isOpen && (
        <tr className="border-b border-[rgba(255,255,255,0.09)] bg-[rgba(5,9,17,0.7)]">
          <td colSpan={9} className="px-4 py-3">
            <div className="space-y-1.5">
              {row.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[rgba(16,20,27,0.8)] px-3 py-2 text-[12px]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {isMultiReport && <Pill>{item.reportDate}</Pill>}
                    <span className="font-mono-num font-semibold text-white">
                      Try {item.pull_num}
                    </span>
                    <Pill>Runde {item.round_num}</Pill>
                    {item.status === 'missed_alive' ? (
                      <>
                        <span className="font-mono-num text-[#8b96a9]">Break {item.break_rel_time}</span>
                        <Pill variant="destructive">Nicht genommen (lebend)</Pill>
                      </>
                    ) : item.status === 'missed_dead' ? (
                      <>
                        <span className="font-mono-num text-[#8b96a9]">Break {item.break_rel_time}</span>
                        <Pill>Tot vor Runde (entschuldigt)</Pill>
                      </>
                    ) : (
                      <>
                        <span className="font-mono-num text-[#34f5c5]">
                          {item.pickup_rel_time} → {item.end_rel_time}
                        </span>
                        <span className="font-mono-num font-semibold text-white">
                          ({(item.duration_ms / 1000).toFixed(1)} s)
                        </span>
                        {item.status === 'missed_break' ? (
                          <Pill variant="destructive">
                            Ei nicht losgeworden (+{(item.post_break_ms / 1000).toFixed(1)} s)
                          </Pill>
                        ) : item.isLateFail ? (
                          <Pill variant="destructive">Zu spät + getroffen</Pill>
                        ) : item.status === 'hit_fail' ? (
                          <Pill variant="warning">Getroffen ({item.break_reason === 'egg_collision' ? 'Kollision' : 'Welle'})</Pill>
                        ) : item.status === 'wiped_before_break' ? (
                          <Pill>Wipe vor Break</Pill>
                        ) : item.isTooEarly ? (
                          <Pill variant="warning">
                            +{(item.earlyMs / 1000).toFixed(1)} s über {maxTolSec} s
                          </Pill>
                        ) : (
                          <Pill variant="success">Sauber im Fenster</Pill>
                        )}
                        <span className="font-mono-num text-[#c5cdd9]">
                          {formatDamage(item.total_shell_dmg)} Shell-Dmg
                        </span>
                        {item.unnecessaryDmg > 0 && (
                          <span className="font-mono-num font-semibold text-[#f87171]">
                            ({formatDamage(item.unnecessaryDmg)} unnötig)
                          </span>
                        )}
                        {!item.is_regular && item.all_regulars_alive_at_pickup === true && (
                          <Pill variant="destructive">Alle Stamm-Träger lebten!</Pill>
                        )}
                        {!item.is_regular && item.all_regulars_alive_at_pickup === false && (
                          <Pill variant="info">
                            Ersatz ({(item.dead_regulars_at_pickup ?? []).join(', ') || 'Stamm'} tot)
                          </Pill>
                        )}
                      </>
                    )}
                    {item.deaths_before > 0 && (
                      <Pill>nach {item.deaths_before} {item.deaths_before === 1 ? 'Tod' : 'Toden'}</Pill>
                    )}
                  </div>
                  <WclActionLinks eventsUrl={item.events_url} replayUrl={item.replay_url} />
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function CollisionIncidentRow({
  incident,
  isMultiReport,
}: {
  incident: EggCollisionIncident
  isMultiReport: boolean
}) {
  return (
    <tr className="border-b border-[rgba(255,255,255,0.05)] hover:bg-[rgba(239,68,68,0.05)] transition-colors">
      <td className="py-2.5 pl-4 pr-2 whitespace-nowrap">
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          {isMultiReport && <Pill>{incident.reportDate}</Pill>}
          <span className="font-mono-num font-semibold text-white">Try {incident.pull_num}</span>
          <span className="font-mono-num text-[#34f5c5]">{incident.rel_time}</span>
        </div>
        {incident.deaths_before > 0 && (
          <div className="mt-0.5 text-[10.5px] text-[#8b96a9]">
            nach {incident.deaths_before} {incident.deaths_before === 1 ? 'Tod' : 'Toden'}
          </div>
        )}
      </td>
      <td className="py-2.5 px-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold">
          {incident.participants.map((p, idx) => (
            <Fragment key={`${incident.id}-${p.player}`}>
              {idx > 0 && (
                <ArrowLeftRight
                  className="h-3.5 w-3.5 text-[#f87171] shrink-0"
                  strokeWidth={2}
                  aria-label="kollidiert mit"
                />
              )}
              <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-[rgba(255,255,255,0.09)] bg-[rgba(10,14,22,0.82)] px-2 py-0.5">
                <ClassDot className={p.className} />
                <span style={{ color: WOW_CLASS_COLORS[p.className] ?? '#ffffff' }}>
                  {p.player}
                </span>
                {p.lethal && (
                  <Skull className="h-3 w-3 text-[#f87171]" aria-label="gestorben" />
                )}
                {!p.isRegular && p.allRegularsAliveAtPickup === true && (
                  <span className="rounded bg-[rgba(239,68,68,0.18)] px-1 py-0.2 text-[9.5px] font-semibold text-[#f87171]">
                    alle Stamm lebten!
                  </span>
                )}
                {!p.isRegular && p.allRegularsAliveAtPickup === false && (
                  <span className="rounded bg-[rgba(56,189,248,0.16)] px-1 py-0.2 text-[9.5px] font-medium text-[#38bdf8]">
                    Ersatz ({p.deadRegularsAtPickup.join(', ') || 'Stamm'} tot)
                  </span>
                )}
              </span>
            </Fragment>
          ))}
        </div>
      </td>
      <td className="py-2.5 px-2 text-right font-mono-num text-[12px] text-[#c5cdd9] whitespace-nowrap">
        {incident.gap_ms} ms
      </td>
      <td className="py-2.5 px-2 whitespace-nowrap">
        {incident.lethal ? (
          <Pill variant="destructive">Tödlich</Pill>
        ) : (
          <Pill variant="warning">Überlebt</Pill>
        )}
      </td>
      <td className="py-2.5 pl-2 pr-4 text-right whitespace-nowrap">
        <div className="inline-flex justify-end">
          <WclActionLinks eventsUrl={incident.events_url} replayUrl={incident.replay_url} />
        </div>
      </td>
    </tr>
  )
}

function EggPlayerRowView({
  row,
  playerClassMap,
  isOpen,
  isMultiReport,
  onToggle,
}: {
  row: ReturnType<typeof aggregateEggFails>['players'][number]
  playerClassMap: Record<string, string>
  isOpen: boolean
  isMultiReport: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="border-b border-[rgba(255,255,255,0.05)] hover:bg-[rgba(52,245,197,0.055)] transition-colors">
        <td className="py-2.5 pl-4 pr-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            className="flex items-center gap-2 text-left text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 rounded"
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-[#34f5c5]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-[#8b96a9]" />
            )}
            <ClassDot className={row.className} />
            <span style={{ color: WOW_CLASS_COLORS[row.className] ?? '#ffffff' }}>{row.player}</span>
            {!row.isRegular && (
              row.takenWhileAllRegularsAliveCount > 0 ? (
                <span className="rounded-[5px] border border-[rgba(239,68,68,0.38)] bg-[rgba(239,68,68,0.14)] px-1.5 py-0.5 text-[10px] font-semibold text-[#f87171]">
                  Kein Stamm · {row.takenWhileAllRegularsAliveCount}× alle lebten!
                </span>
              ) : row.takenAsDeadBackupCount > 0 ? (
                <span className="rounded-[5px] border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.12)] px-1.5 py-0.5 text-[10px] font-medium text-[#38bdf8]">
                  Ersatz (Stamm tot)
                </span>
              ) : (
                <span className="rounded-[5px] border border-[rgba(255,255,255,0.12)] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-[#8b96a9]">
                  Kein Stamm
                </span>
              )
            )}
          </button>
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[13px] font-semibold text-white">
          {row.count}×
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12.5px]">
          {row.waveCount > 0 ? (
            <span className="text-[#fbbf24] font-semibold">{row.waveCount}×</span>
          ) : (
            <span className="text-[#8b96a9]">0</span>
          )}
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12.5px]">
          {row.collisionCount > 0 ? (
            <span className="text-[#f87171] font-semibold">{row.collisionCount}×</span>
          ) : (
            <span className="text-[#8b96a9]">0</span>
          )}
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12px] text-[#c5cdd9]">
          {formatDamage(row.avgDamage)}
        </td>
        <td className="py-2.5 pl-2 pr-4 text-right font-mono-num text-[13px]">
          {row.lethalCount > 0 ? (
            <span className="text-[#f87171] font-semibold">{row.lethalCount}×</span>
          ) : (
            <span className="text-[#8b96a9]">0</span>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-[rgba(255,255,255,0.09)] bg-[rgba(5,9,17,0.7)]">
          <td colSpan={6} className="px-4 py-3">
            <div className="space-y-1.5">
              {row.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[rgba(16,20,27,0.8)] px-3 py-2 text-[12px]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {isMultiReport && <Pill>{item.reportDate}</Pill>}
                    <span className="font-mono-num font-semibold text-white">
                      Try {item.pull_num}
                    </span>
                    <span className="font-mono-num text-[#34f5c5]">{item.rel_time}</span>
                    {item.kind === 'egg_collision' ? (
                      <span className="inline-flex flex-wrap items-center gap-1 rounded-[6px] border border-[rgba(239,68,68,0.34)] bg-[rgba(239,68,68,0.12)] px-2 py-0.5 text-[11px] font-medium text-[#f87171]">
                        <span>Kollision mit</span>
                        {(item.collision_partners ?? []).map((cp, idx) => (
                          <Fragment key={`${item.id}-${cp}`}>
                            {idx > 0 && <span className="text-[#8b96a9]">,</span>}
                            <span
                              className="font-semibold"
                              style={{ color: WOW_CLASS_COLORS[playerClassMap[cp] ?? ''] ?? '#ffffff' }}
                            >
                              {cp}
                            </span>
                          </Fragment>
                        ))}
                        {item.collision_gap_ms != null && (
                          <span className="font-mono-num text-[#fca5a5]">({item.collision_gap_ms} ms)</span>
                        )}
                      </span>
                    ) : (
                      <Pill variant="warning">Caustic Waves</Pill>
                    )}
                    <span className="font-mono-num text-[#c5cdd9]">
                      {formatDamage(item.damage)} Dmg
                    </span>
                    {item.deaths_before > 0 && (
                      <Pill>nach {item.deaths_before} {item.deaths_before === 1 ? 'Tod' : 'Toden'}</Pill>
                    )}
                    {item.is_regular === false && item.all_regulars_alive_at_pickup === true && (
                      <Pill variant="destructive">Alle Stamm-Träger lebten!</Pill>
                    )}
                    {item.is_regular === false && item.all_regulars_alive_at_pickup === false && (
                      <Pill variant="info">
                        Ersatz ({(item.dead_regulars_at_pickup ?? []).join(', ') || 'Stamm'} tot)
                      </Pill>
                    )}
                    {item.lethal && <Pill variant="destructive">Tödlich</Pill>}
                  </div>
                  <WclActionLinks eventsUrl={item.events_url} replayUrl={item.replay_url} />
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
