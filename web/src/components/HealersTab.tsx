import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  HeartPulse,
  Minus,
  Plus,
  RotateCcw,
  Shield,
  Zap,
} from 'lucide-react'
import type { ReportData } from '../types'
import {
  aggregateHealerEmergency,
  aggregateHealerTankSoaks,
  WOW_CLASS_COLORS,
} from '../lib/stats'
import type {
  HealerEmergencyItem,
  HealerEmergencyRow,
  HealerTankSoakItem,
  HealerTankSoakRow,
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

function formatReactionSec(ms: number | null): string {
  if (ms === null) return '—'
  return `${(ms / 1000).toFixed(2).replace('.', ',')} s`
}

function reactionToneClass(ms: number | null): string {
  if (ms === null) return 'text-[#8b96a9]'
  if (ms <= 1000) return 'text-[#34f5c5]'
  if (ms <= 1800) return 'text-[#fbbf24]'
  return 'text-[#f87171]'
}

export function HealersTab({
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
  const [viewMode, setViewMode] = useState<'emergency' | 'tank_soak'>('emergency')
  const [emFilter, setEmFilter] = useState<'missed_rdy' | 'died' | 'all'>('missed_rdy')
  const [tkFilter, setTkFilter] = useState<'unhealed' | 'healed' | 'all'>('unhealed')
  const [expandedEm, setExpandedEm] = useState<Record<string, boolean>>({})
  const [expandedTk, setExpandedTk] = useState<Record<string, boolean>>({})
  // Anpassbare Überlebens-Toleranzzeit (Default: 0,5 s Instant-Tod-Grenze – 1,7 s Hardcast-Fenster)
  const [minInstantAliveSec, setMinInstantAliveSec] = useState<number>(0.5)
  const [minCastAliveSec, setMinCastAliveSec] = useState<number>(1.7)

  const roundTenths = (v: number) => Math.round(v * 10) / 10
  const handleMinAliveChange = (next: number) => {
    const clamped = roundTenths(Math.max(0, Math.min(5, next)))
    setMinInstantAliveSec(clamped)
    if (clamped > minCastAliveSec) setMinCastAliveSec(clamped)
  }
  const handleMaxAliveChange = (next: number) => {
    const clamped = roundTenths(Math.max(0.1, Math.min(5, next)))
    setMinCastAliveSec(clamped)
    if (clamped < minInstantAliveSec) setMinInstantAliveSec(clamped)
  }

  const emergency = useMemo(
    () =>
      aggregateHealerEmergency(
        reports,
        maxDeaths,
        pullRange,
        minInstantAliveSec,
        minCastAliveSec,
      ),
    [reports, maxDeaths, pullRange, minInstantAliveSec, minCastAliveSec],
  )
  const tankSoaks = useMemo(
    () => aggregateHealerTankSoaks(reports, maxDeaths, pullRange),
    [reports, maxDeaths, pullRange],
  )

  const q = searchQuery.trim().toLowerCase()

  const filteredEmHealers = useMemo(() => {
    if (!q) return emergency.healers
    return emergency.healers.filter(
      (h) =>
        h.healer.toLowerCase().includes(q) ||
        h.className.toLowerCase().includes(q) ||
        h.spec.toLowerCase().includes(q) ||
        h.items.some(
          (it) =>
            it.event.victim.toLowerCase().includes(q) ||
            it.event.trigger_ability.toLowerCase().includes(q) ||
            `try ${it.event.pull_num}`.includes(q) ||
            String(it.event.pull_num) === q,
        ),
    )
  }, [emergency.healers, q])

  const filteredTkHealers = useMemo(() => {
    if (!q) return tankSoaks.healers
    return tankSoaks.healers.filter(
      (h) =>
        h.healer.toLowerCase().includes(q) ||
        h.className.toLowerCase().includes(q) ||
        h.spec.toLowerCase().includes(q) ||
        h.items.some(
          (it) =>
            it.event.tank.toLowerCase().includes(q) ||
            `try ${it.event.pull_num}`.includes(q) ||
            String(it.event.pull_num) === q,
        ),
    )
  }, [tankSoaks.healers, q])

  return (
    <div className="space-y-4">
      {/* Strictly separated Sub-View Switch: Emergency Heals vs. Boss-Tank Soak */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[rgba(10,14,22,0.85)] p-1">
          <button
            type="button"
            onClick={() => setViewMode('emergency')}
            className={`inline-flex items-center gap-2 rounded-[7px] px-3.5 py-1.5 text-[12px] font-medium transition-[background-color,color] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 ${
              viewMode === 'emergency'
                ? 'bg-[rgba(52,245,197,0.16)] text-[#34f5c5] font-semibold'
                : 'text-[#c5cdd9] hover:text-white'
            }`}
          >
            <HeartPulse className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>Emergency Heals (&lt; 35 %)</span>
            <span className="font-mono text-[11px] tabular-nums opacity-80">
              {emergency.totalEvents}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('tank_soak')}
            className={`inline-flex items-center gap-2 rounded-[7px] px-3.5 py-1.5 text-[12px] font-medium transition-[background-color,color] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 ${
              viewMode === 'tank_soak'
                ? 'bg-[rgba(56,189,248,0.18)] text-[#38bdf8] font-semibold'
                : 'text-[#c5cdd9] hover:text-white'
            }`}
          >
            <Shield className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>Bosstank-Soak-Heal</span>
            <span className="font-mono text-[11px] tabular-nums opacity-80">
              {tankSoaks.totalSoaks}
            </span>
          </button>
        </div>

        {viewMode === 'emergency' ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Frei anpassbare Überlebens-Toleranzzeit (Min = Instant-Tod-Grenze, Max = Hardcast-Fenster) */}
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[rgba(52,245,197,0.28)] bg-[rgba(10,16,24,0.9)] px-3 py-1.5 text-[12px]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#34f5c5]">
                Überlebens-Toleranz:
              </span>

              {/* Min Sek. (darunter = Instant-Tod ausgeblendet) */}
              <div className="inline-flex items-center gap-1" title="Stirbt das Ziel schneller als Min, gilt es als Instant-Tod und wird ausgeblendet">
                <span className="text-[11px] text-[#8b96a9]">Instant ≥</span>
                <button
                  type="button"
                  onClick={() => handleMinAliveChange(minInstantAliveSec - 0.1)}
                  aria-label="Mindest-Überlebenszeit verringern"
                  className="obsidian-btn p-1 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={5}
                  value={minInstantAliveSec}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (!Number.isNaN(v)) handleMinAliveChange(v)
                  }}
                  aria-label="Mindest-Überlebenszeit (Instant-Tod-Grenze) in Sekunden"
                  className="w-12 rounded-[6px] border border-[rgba(255,255,255,0.14)] bg-[#050911] px-1.5 py-0.5 text-center font-mono text-[12px] font-semibold tabular-nums text-white focus-visible:outline-none focus-visible:border-[#34f5c5]"
                />
                <button
                  type="button"
                  onClick={() => handleMinAliveChange(minInstantAliveSec + 0.1)}
                  aria-label="Mindest-Überlebenszeit erhöhen"
                  className="obsidian-btn p-1 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <span className="font-mono text-[11px] text-[#8b96a9]">s</span>
              </div>

              <span className="text-[#8b96a9]">–</span>

              {/* Max Sek. (Hardcast-Fenster) */}
              <div className="inline-flex items-center gap-1" title="Stirbt das Ziel vor diesem Wert ohne Instant rdy, gilt es als zu kurz für einen Hardcast">
                <span className="text-[11px] text-[#8b96a9]">Cast ≥</span>
                <button
                  type="button"
                  onClick={() => handleMaxAliveChange(minCastAliveSec - 0.1)}
                  aria-label="Hardcast-Überlebenszeit verringern"
                  className="obsidian-btn p-1 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <input
                  type="number"
                  step={0.1}
                  min={0.1}
                  max={5}
                  value={minCastAliveSec}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (!Number.isNaN(v)) handleMaxAliveChange(v)
                  }}
                  aria-label="Mindest-Überlebenszeit für Hardcast in Sekunden"
                  className="w-12 rounded-[6px] border border-[rgba(255,255,255,0.14)] bg-[#050911] px-1.5 py-0.5 text-center font-mono text-[12px] font-semibold tabular-nums text-white focus-visible:outline-none focus-visible:border-[#34f5c5]"
                />
                <button
                  type="button"
                  onClick={() => handleMaxAliveChange(minCastAliveSec + 0.1)}
                  aria-label="Hardcast-Überlebenszeit erhöhen"
                  className="obsidian-btn p-1 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <span className="font-mono text-[11px] text-[#8b96a9]">s</span>
              </div>

              {(minInstantAliveSec !== 0.5 || minCastAliveSec !== 1.7) && (
                <button
                  type="button"
                  onClick={() => {
                    setMinInstantAliveSec(0.5)
                    setMinCastAliveSec(1.7)
                  }}
                  title="Auf Standard 0,5 – 1,7 s zurücksetzen"
                  className="obsidian-btn inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-[#c5cdd9] hover:text-white active:scale-[0.96]"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-[#8b96a9]">
            Reine Reaktionszeit bis Cast-Start (<span className="font-mono text-[#c5cdd9]">begincast</span> / <span className="font-mono text-[#c5cdd9]">cast</span>) — keine HPS-Wertung.
          </div>
        )}
      </div>

      {viewMode === 'emergency' ? (
        <>
          <div className="kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Einzelziel-Drops < 35 %"
              value={emergency.totalEvents}
              subtext={`${emergency.targetDiedCount}× Ziel gestorben · ${emergency.filteredInstantDeathCount} Instant-Tode (< ${minInstantAliveSec.toFixed(1).replace('.', ',')} s) ausgeblendet`}
              icon={<HeartPulse className="h-4 w-4" strokeWidth={1.75} />}
              tone={emergency.targetDiedCount > 0 ? 'destructive' : 'default'}
            />
            <KpiCard
              label="Ø Zeit bis 1. Heal"
              value={formatReactionSec(emergency.avgFastestMs)}
              subtext={`Median: ${formatReactionSec(emergency.medianFastestMs)} (je Drop der erste Heiler)`}
              icon={<Clock className="h-4 w-4" strokeWidth={1.75} />}
              tone={
                emergency.avgFastestMs !== null && emergency.avgFastestMs <= 1200
                  ? 'success'
                  : 'warning'
              }
            />
            <KpiCard
              label="Instant genutzt (wenn rdy)"
              value={`${emergency.instantUsedWhenReadyRatePct}%`}
              subtext={`${emergency.instantUsedWhenReadyCount} / ${emergency.instantReadyOpps} Situationen mit Instant-CD`}
              icon={<Zap className="h-4 w-4" strokeWidth={1.75} />}
              tone={emergency.instantUsedWhenReadyRatePct >= 35 ? 'success' : 'warning'}
            />
            <KpiCard
              label="Kein Heal trotz Instant rdy"
              value={emergency.missedInstantReadyUnassistedTotal}
              subtext="Ohne schnelle Fremdrettung (≤ 1,2 s durch anderen Heiler)"
              icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.75} />}
              tone={emergency.missedInstantReadyUnassistedTotal > 0 ? 'destructive' : 'success'}
            />
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
              <div>
                <h2 className="text-[14px] font-semibold text-white">
                  Emergency Heals — Einzelziel-Switch bei &lt; 35 % HP (ohne Raid-Drop)
                </h2>
                <p className="text-[12px] text-[#8b96a9]">
                  Isolierte Non-Tank-Drops unter 35 % HP (≤ 3 Spieler im ±2 s-Fenster, inkl. unnötiger Treffer wie Waves/Egg-DoT/Slams).
                  Wertet pro lebendem Heiler: Reaktionszeit bis Cast-Start, ob ein Spec-Instant-Heal rdy war und ob überhaupt ein Heal angesetzt wurde.
                </p>
              </div>
              <SubFilterPills
                value={emFilter}
                onChange={setEmFilter}
                options={[
                  {
                    value: 'missed_rdy',
                    label: 'Kein Heal trotz Instant rdy',
                    count: emergency.missedInstantReadyUnassistedTotal,
                  },
                  {
                    value: 'died',
                    label: 'Ziel gestorben',
                    count: emergency.targetDiedCount,
                  },
                  { value: 'all', label: 'Alle Drops', count: emergency.totalEvents },
                ]}
              />
            </div>

            {filteredEmHealers.length === 0 ? (
              <EmptyState
                title="Keine Einzelziel-Emergency-Daten im aktuellen Filter"
                description="Im gewählten Try-Bereich / Todes-Filter wurden keine isolierten Non-Tank-Drops < 35 % HP (mit Heiler-Daten) gefunden."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                      <th className="py-2.5 pl-4 pr-2">Heiler</th>
                      <th className="py-2.5 px-2 text-right">Drops</th>
                      <th className="py-2.5 px-2 text-right">Ø Reaktion (Med.)</th>
                      <th className="py-2.5 px-2 text-right">Instant angesetzt</th>
                      <th className="py-2.5 px-2 text-right">Hardcast angesetzt</th>
                      <th className="py-2.5 pl-2 pr-4 text-right">Kein Heal (trotz rdy!)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmHealers.map((row) => {
                      const isOpen = !!expandedEm[row.healer]
                      const visibleItems = row.items.filter((it) => {
                        if (emFilter === 'missed_rdy') {
                          return (
                            it.reaction.status === 'no_heal' &&
                            !it.reaction.covered_fast_by_other &&
                            it.reaction.instant_was_ready
                          )
                        }
                        if (emFilter === 'died') return it.event.target_died
                        return true
                      })
                      return (
                        <EmergencyHealerRowView
                          key={row.healer}
                          row={row}
                          visibleItems={visibleItems}
                          isOpen={isOpen}
                          isMultiReport={isMultiReport}
                          onToggle={() =>
                            setExpandedEm((prev) => ({ ...prev, [row.healer]: !prev[row.healer] }))
                          }
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          <div className="kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Bosstank-Soaks gesamt"
              value={tankSoaks.totalSoaks}
              subtext={`Mother's Wrath / Stone Venom Fenster (≤ ${maxDeaths} Tode)`}
              icon={<Shield className="h-4 w-4" strokeWidth={1.75} />}
              tone="default"
            />
            <KpiCard
              label="Aktiv angeheilt"
              value={`${tankSoaks.soaksWithHealRatePct}%`}
              subtext={`${tankSoaks.soaksWithHealCount} / ${tankSoaks.totalSoaks} Soaks mit mind. 1 gezieltem Heal`}
              icon={<Activity className="h-4 w-4" strokeWidth={1.75} />}
              tone={tankSoaks.soaksWithHealRatePct >= 80 ? 'success' : 'warning'}
            />
            <KpiCard
              label="Ø Zeit bis 1. Tank-Heal"
              value={formatReactionSec(tankSoaks.avgFastestMs)}
              subtext="Ab erstem Mother's Wrath / Stone Venom Hit"
              icon={<Clock className="h-4 w-4" strokeWidth={1.75} />}
              tone={
                tankSoaks.avgFastestMs !== null && tankSoaks.avgFastestMs <= 1200
                  ? 'success'
                  : 'warning'
              }
            />
            <KpiCard
              label="Tank < 30 % / Tank-Tode"
              value={`${tankSoaks.tankLowCount} / ${tankSoaks.tankDiedCount}`}
              subtext="Soaks mit kritischem Tank-Drop bzw. Tank-Tod"
              icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.75} />}
              tone={tankSoaks.tankDiedCount > 0 ? 'destructive' : 'warning'}
            />
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
              <div>
                <h2 className="text-[14px] font-semibold text-white">
                  Bosstank-Soak-Heal — Wer heilt den Bosstank bei Mother&apos;s Wrath / Stone Venom?
                </h2>
                <p className="text-[12px] text-[#8b96a9]">
                  Prüft getrennt für jedes Tank-Soak-Fenster (−1 s vor erstem Stack bis +5 s nach letztem Stack),
                  welche lebenden Heiler den Bosstank aktiv angeheilt oder mit einem External versorgt haben.
                </p>
              </div>
              <SubFilterPills
                value={tkFilter}
                onChange={setTkFilter}
                options={[
                  { value: 'unhealed', label: 'Ungeheilt gelassen' },
                  { value: 'healed', label: 'Aktiv geheilt' },
                  { value: 'all', label: 'Alle Soaks', count: tankSoaks.totalSoaks },
                ]}
              />
            </div>

            {filteredTkHealers.length === 0 ? (
              <EmptyState
                title="Keine Bosstank-Soak-Daten im aktuellen Filter"
                description="Im gewählten Try-Bereich / Todes-Filter wurden keine Mother's Wrath / Stone Venom Tank-Soaks gefunden."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                      <th className="py-2.5 pl-4 pr-2">Heiler</th>
                      <th className="py-2.5 px-2 text-right">Soaks</th>
                      <th className="py-2.5 px-2 text-right">Angeheilt</th>
                      <th className="py-2.5 px-2 text-right">Ø Reaktion (Med.)</th>
                      <th className="py-2.5 px-2 text-right">Ø Heals / Soak</th>
                      <th className="py-2.5 px-2 text-right">Externals</th>
                      <th className="py-2.5 pl-2 pr-4 text-right">Nicht angeheilt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTkHealers.map((row) => {
                      const isOpen = !!expandedTk[row.healer]
                      const visibleItems = row.items.filter((it) => {
                        if (tkFilter === 'unhealed') return !it.reaction.healed
                        if (tkFilter === 'healed') return it.reaction.healed
                        return true
                      })
                      return (
                        <TankSoakHealerRowView
                          key={row.healer}
                          row={row}
                          visibleItems={visibleItems}
                          isOpen={isOpen}
                          isMultiReport={isMultiReport}
                          onToggle={() =>
                            setExpandedTk((prev) => ({ ...prev, [row.healer]: !prev[row.healer] }))
                          }
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function EmergencyHealerRowView({
  row,
  visibleItems,
  isOpen,
  isMultiReport,
  onToggle,
}: {
  row: HealerEmergencyRow
  visibleItems: HealerEmergencyItem[]
  isOpen: boolean
  isMultiReport: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="border-b border-[rgba(255,255,255,0.05)] hover:bg-[rgba(52,245,197,0.055)] transition-colors">
        <td className="py-2.5 pl-4 pr-2 whitespace-nowrap">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2 text-left text-[13px] font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 rounded"
            style={{ color: WOW_CLASS_COLORS[row.className] ?? '#ffffff' }}
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-[#8b96a9]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-[#8b96a9]" />
            )}
            <ClassDot className={row.className} />
            <span>{row.healer}</span>
            {row.spec && (
              <span className="rounded bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[10px] font-normal text-[#a1a1aa]">
                {row.spec}
              </span>
            )}
          </button>
        </td>
        <td className="py-2.5 px-2 text-right font-mono text-[13px] tabular-nums text-[#c5cdd9]">
          {row.opportunities}
        </td>
        <td className="py-2.5 px-2 text-right font-mono text-[13px] tabular-nums">
          <span className={`font-semibold ${reactionToneClass(row.avgReactionMs)}`}>
            {formatReactionSec(row.avgReactionMs)}
          </span>
          {row.medianReactionMs !== null && (
            <span className="ml-1.5 text-[11px] text-[#8b96a9]">
              ({formatReactionSec(row.medianReactionMs)})
            </span>
          )}
        </td>
        <td className="py-2.5 px-2 text-right font-mono text-[13px] tabular-nums">
          <span className={row.instantUsedCount > 0 ? 'font-semibold text-[#34f5c5]' : 'text-[#8b96a9]'}>
            {row.instantUsedCount}×
          </span>
        </td>
        <td className="py-2.5 px-2 text-right font-mono text-[13px] tabular-nums">
          <span className={row.castUsedCount > 0 ? 'font-semibold text-[#38bdf8]' : 'text-[#8b96a9]'}>
            {row.castUsedCount}×
          </span>
          {row.castUsedDespiteInstantReadyCount > 0 && (
            <div className="text-[10px] text-[#fbbf24]">
              davon {row.castUsedDespiteInstantReadyCount}× Instant rdy
            </div>
          )}
        </td>
        <td className="py-2.5 pl-2 pr-4 text-right font-mono text-[13px] tabular-nums">
          <div className="flex flex-col items-end">
            <span
              className={
                row.missedInstantReadyUnassistedCount > 0
                  ? 'font-semibold text-[#f87171]'
                  : 'text-[#8b96a9]'
              }
            >
              {row.missedInstantReadyUnassistedCount > 0
                ? `${row.missedInstantReadyUnassistedCount}× (Instant rdy!)`
                : '0× rdy verpasst'}
            </span>
            <span className="text-[10px] text-[#8b96a9]">
              {row.coveredFastCount > 0 ? `${row.coveredFastCount}× schnell durch anderen` : ''}
              {row.coveredFastCount > 0 && row.missedWhileTargetDiedCount > 0 ? ' · ' : ''}
              {row.missedWhileTargetDiedCount > 0 ? (
                <span className="text-[#f87171]">{row.missedWhileTargetDiedCount}× Ziel starb</span>
              ) : null}
            </span>
          </div>
        </td>
      </tr>

      {isOpen && (
        <tr className="bg-[rgba(5,9,17,0.72)] border-b border-[rgba(255,255,255,0.06)]">
          <td colSpan={6} className="px-4 py-3">
            {visibleItems.length === 0 ? (
              <div className="text-[12px] text-[#8b96a9]">
                Keine Einträge im gewählten Detail-Filter für {row.healer}.
              </div>
            ) : (
              <div className="space-y-1.5">
                {visibleItems.slice(0, 60).map(({ event: ev, reaction: rx, tooShortForCast }) => (
                  <div
                    key={`${ev.reportCode}-${ev.id}-${rx.healer_id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[rgba(255,255,255,0.07)] bg-[rgba(16,20,27,0.68)] px-3 py-2 text-[12px]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {isMultiReport && <Pill variant="neutral">{ev.reportLabel}</Pill>}
                      <span className="font-mono font-semibold text-white">Try {ev.pull_num}</span>
                      <span className="font-mono text-[#34f5c5] tabular-nums">{ev.rel_time}</span>
                      <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: WOW_CLASS_COLORS[ev.victim_class] ?? '#ffffff' }}>
                        <ClassDot className={ev.victim_class} />
                        {ev.victim}
                      </span>
                      <Pill variant="warning">
                        {ev.hp_pct.toFixed(1)}% · {ev.trigger_ability}
                      </Pill>
                      {ev.target_died && (
                        <Pill variant="destructive">
                          {ev.time_to_death_ms !== undefined && ev.time_to_death_ms !== null
                            ? `Ziel starb nach ${formatReactionSec(ev.time_to_death_ms)}`
                            : 'Ziel gestorben'}
                        </Pill>
                      )}

                      {rx.status === 'instant_used' && (
                        <Pill variant="success">
                          Instant {formatReactionSec(rx.reaction_ms)} · {rx.spell}
                        </Pill>
                      )}
                      {rx.status === 'cast_used' && (
                        <>
                          <Pill variant="info">
                            Cast {formatReactionSec(rx.reaction_ms)} · {rx.spell}
                          </Pill>
                          {rx.instant_was_ready && (
                            <Pill variant="warning">
                              Instant rdy: {rx.ready_instants.join(' · ')}
                            </Pill>
                          )}
                        </>
                      )}
                      {rx.status === 'no_heal' && (
                        rx.covered_fast_by_other ? (
                          <Pill variant="neutral">
                            Schnell versorgt ({ev.fastest_healer} {formatReactionSec(ev.fastest_reaction_ms)})
                          </Pill>
                        ) : tooShortForCast ? (
                          <Pill variant="neutral">
                            Zu kurz für Cast (Instants auf CD)
                          </Pill>
                        ) : rx.instant_was_ready ? (
                          <Pill variant="destructive">
                            Kein Heal! Instant rdy: {rx.ready_instants.join(' · ')}
                          </Pill>
                        ) : (
                          <Pill variant="neutral">Kein Heal (Instants auf CD)</Pill>
                        )
                      )}
                    </div>
                    <WclActionLinks eventsUrl={ev.events_url} replayUrl={ev.replay_url} />
                  </div>
                ))}
                {visibleItems.length > 60 && (
                  <div className="text-[11px] text-[#8b96a9] pt-1">
                    … und {visibleItems.length - 60} weitere Events (Try-Bereich eingrenzen für volle Ansicht).
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function TankSoakHealerRowView({
  row,
  visibleItems,
  isOpen,
  isMultiReport,
  onToggle,
}: {
  row: HealerTankSoakRow
  visibleItems: HealerTankSoakItem[]
  isOpen: boolean
  isMultiReport: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="border-b border-[rgba(255,255,255,0.05)] hover:bg-[rgba(56,189,248,0.055)] transition-colors">
        <td className="py-2.5 pl-4 pr-2 whitespace-nowrap">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2 text-left text-[13px] font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 rounded"
            style={{ color: WOW_CLASS_COLORS[row.className] ?? '#ffffff' }}
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-[#8b96a9]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-[#8b96a9]" />
            )}
            <ClassDot className={row.className} />
            <span>{row.healer}</span>
            {row.spec && (
              <span className="rounded bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[10px] font-normal text-[#a1a1aa]">
                {row.spec}
              </span>
            )}
          </button>
        </td>
        <td className="py-2.5 px-2 text-right font-mono text-[13px] tabular-nums text-[#c5cdd9]">
          {row.opportunities}
        </td>
        <td className="py-2.5 px-2 text-right font-mono text-[13px] tabular-nums">
          <span
            className={
              row.healedRatePct >= 65
                ? 'font-semibold text-[#34f5c5]'
                : row.healedRatePct >= 35
                  ? 'font-semibold text-[#fbbf24]'
                  : 'font-semibold text-[#f87171]'
            }
          >
            {row.healedSoaks}× ({row.healedRatePct}%)
          </span>
        </td>
        <td className="py-2.5 px-2 text-right font-mono text-[13px] tabular-nums">
          <span className={`font-semibold ${reactionToneClass(row.avgReactionMs)}`}>
            {formatReactionSec(row.avgReactionMs)}
          </span>
          {row.medianReactionMs !== null && (
            <span className="ml-1.5 text-[11px] text-[#8b96a9]">
              ({formatReactionSec(row.medianReactionMs)})
            </span>
          )}
        </td>
        <td className="py-2.5 px-2 text-right font-mono text-[13px] tabular-nums text-[#c5cdd9]">
          {row.avgHealsPerSoak.toFixed(1).replace('.', ',')}
        </td>
        <td className="py-2.5 px-2 text-right font-mono text-[13px] tabular-nums">
          <span className={row.externalCount > 0 ? 'font-semibold text-[#38bdf8]' : 'text-[#8b96a9]'}>
            {row.externalCount}×
          </span>
        </td>
        <td className="py-2.5 pl-2 pr-4 text-right font-mono text-[13px] tabular-nums">
          <span className={row.unhealedSoaks > 0 ? 'font-semibold text-[#fbbf24]' : 'text-[#34f5c5]'}>
            {row.unhealedSoaks}×
          </span>
        </td>
      </tr>

      {isOpen && (
        <tr className="bg-[rgba(5,9,17,0.72)] border-b border-[rgba(255,255,255,0.06)]">
          <td colSpan={7} className="px-4 py-3">
            {visibleItems.length === 0 ? (
              <div className="text-[12px] text-[#8b96a9]">
                Keine Tank-Soaks im gewählten Detail-Filter für {row.healer}.
              </div>
            ) : (
              <div className="space-y-1.5">
                {visibleItems.slice(0, 60).map(({ event: ev, reaction: rx }) => (
                  <div
                    key={`${ev.reportCode}-${ev.id}-${rx.healer_id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[rgba(255,255,255,0.07)] bg-[rgba(16,20,27,0.68)] px-3 py-2 text-[12px]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {isMultiReport && <Pill variant="neutral">{ev.reportLabel}</Pill>}
                      <span className="font-mono font-semibold text-white">Try {ev.pull_num}</span>
                      <span className="font-mono text-[#38bdf8] tabular-nums">{ev.rel_time}</span>
                      <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: WOW_CLASS_COLORS[ev.tank_class] ?? '#ffffff' }}>
                        <ClassDot className={ev.tank_class} />
                        {ev.tank}
                      </span>
                      <Pill variant="neutral">{ev.stacks} Stacks</Pill>
                      {ev.min_hp_pct !== null && (
                        <Pill variant={ev.min_hp_pct < 30 ? 'destructive' : 'warning'}>
                          Min {ev.min_hp_pct.toFixed(1)}% HP
                        </Pill>
                      )}
                      {ev.tank_died && <Pill variant="destructive">Tank gestorben</Pill>}
                      {rx.healed ? (
                        <Pill variant={rx.used_external ? 'info' : 'success'}>
                          {formatReactionSec(rx.reaction_ms)} · {rx.heal_count}× Heal ({rx.spells.join(', ')})
                        </Pill>
                      ) : (
                        <Pill variant={ev.tank_died || (ev.min_hp_pct !== null && ev.min_hp_pct < 30) ? 'destructive' : 'warning'}>
                          Bosstank nicht angeheilt
                        </Pill>
                      )}
                    </div>
                    <WclActionLinks eventsUrl={ev.events_url} replayUrl={ev.replay_url} />
                  </div>
                ))}
                {visibleItems.length > 60 && (
                  <div className="text-[11px] text-[#8b96a9] pt-1">
                    … und {visibleItems.length - 60} weitere Soaks (Try-Bereich eingrenzen für volle Ansicht).
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
