import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, FlaskConical, Shield, ShieldCheck } from 'lucide-react'
import type { ReportData } from '../types'
import { aggregateDefensives, WOW_CLASS_COLORS } from '../lib/stats'
import type { DefensivePlayerRow, PullRange } from '../lib/stats'
import {
  Card,
  ClassDot,
  EmptyState,
  KpiCard,
  Pill,
  SubFilterPills,
  WclActionLinks,
} from './ui'

export function DefensivesTab({
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
  const [eventFilter, setEventFilter] = useState<'missed_ready' | 'used' | 'all'>('missed_ready')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const stats = useMemo(
    () => aggregateDefensives(reports, maxDeaths, pullRange),
    [reports, maxDeaths, pullRange],
  )

  const q = searchQuery.trim().toLowerCase()
  const filteredPlayers = useMemo(() => {
    // Nur Spieler anzeigen, die im Filter wirklich unter 35 % HP gedroppt oder gestorben sind!
    const active = stats.players.filter((p) => p.criticalEvents > 0)
    if (!q) return active
    return active.filter(
      (p) =>
        p.player.toLowerCase().includes(q) ||
        p.className.toLowerCase().includes(q) ||
        p.items.some((it) => `try ${it.pull_num}`.includes(q) || String(it.pull_num) === q),
    )
  }, [stats.players, q])

  const toggle = (name: string) =>
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))

  return (
    <div className="space-y-4">
      <div className="kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Drops < 35 % & Tode"
          value={stats.totalCritical}
          subtext={`${stats.totalSpikes} unvermeidbare Drops < 35 % · ${stats.totalDeaths} Tode (≤ ${maxDeaths} Tode)`}
          icon={<Shield className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.totalCritical > 0 ? 'warning' : 'success'}
        />
        <KpiCard
          label="Def / Pot / Gesu genutzt"
          value={`${stats.usedAnyRatePct}%`}
          subtext={`${stats.totalUsedAny} / ${stats.totalCritical} (${stats.totalUsedDef} Def · ${stats.totalPotUsedAtDrop} Pot · ${stats.totalHsUsedAtDrop} Gesu)`}
          icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.usedAnyRatePct >= 60 ? 'success' : 'warning'}
        />
        <KpiCard
          label="Nicht genutzt trotz rdy!"
          value={stats.totalMissedWhileReady}
          subtext={`${stats.totalMissedSpikeWhileReady}× bei < 35 % Drop · ${stats.totalMissedDeathWhileReady}× beim Tod`}
          icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.totalMissedWhileReady > 0 ? 'destructive' : 'success'}
        />
        <KpiCard
          label="Pot & Gesu bei < 35 %"
          value={`${stats.totalPotUsedAtDrop} / ${stats.totalHsUsedAtDrop}`}
          subtext={`Genutzt · rdy verpasst: ${stats.totalMissedPotReady}× Pot · ${stats.totalMissedHsReady}× Gesu`}
          icon={<FlaskConical className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.totalPotUsedAtDrop + stats.totalHsUsedAtDrop > 0 ? 'success' : 'warning'}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold text-white">
              Def-CD, Healing Potion &amp; Gesu — nur bei Drops &lt; 35 % HP &amp; Toden
            </h2>
            <p className="text-[12px] text-[#8b96a9]">
              Wertet ausschließlich <strong className="text-white">unvermeidbare</strong> Drops &lt; 35 % HP (Mephitic Thrash, Spectral Coils, Putrid Membrane, Necrotic Vapors, Rage of the Shackled, Blight Vein) &amp; Tode aus:
              hat der Spieler einen wirksamen <strong className="text-[#34f5c5]">Def-CD, Healing Potion oder Gesu</strong> genutzt — oder <strong className="text-[#f87171]">nichts genutzt, obwohl eins davon rdy war</strong>? (Normale Trys ohne &lt; 35 %-Drop werden nicht gezählt.)
            </p>
          </div>
          <SubFilterPills
            value={eventFilter}
            onChange={setEventFilter}
            options={[
              { value: 'missed_ready', label: 'Nicht genutzt trotz rdy!', count: stats.totalMissedWhileReady },
              { value: 'used', label: 'Genutzt (Def / Pot / Gesu)', count: stats.totalUsedAny },
              { value: 'all', label: 'Alle < 35 % & Tode', count: stats.totalCritical },
            ]}
          />
        </div>

        {filteredPlayers.length === 0 ? (
          <EmptyState
            title="Keine Drops < 35 % oder Tode im aktuellen Filter"
            description="Im gewählten Try-Bereich und Todes-Filter ist kein Spieler unter 35 % HP (unvermeidbarer Schaden) gedroppt."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                  <th className="py-2.5 pl-4 pr-2">Spieler</th>
                  <th className="py-2.5 px-2 text-right">&lt; 35 % / Tode</th>
                  <th className="py-2.5 px-2 text-right">Genutzt (Def / Pot / Gesu)</th>
                  <th className="py-2.5 px-2 text-right">Nicht genutzt (rdy!)</th>
                  <th className="py-2.5 px-2 text-right">Heal Pot (&lt; 35 %)</th>
                  <th className="py-2.5 pl-2 pr-4 text-right">Gesu (&lt; 35 %)</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((row) => {
                  const isOpen = !!expanded[row.player]
                  const visibleItems = row.items.filter((it) => {
                    const usedPot = Boolean(it.used_pot_here)
                    const usedHs = Boolean(it.used_hs_here)
                    const usedAny = it.used_any_here ?? (it.had_def_cd || usedPot || usedHs)
                    const hasReadyDef = (it.ready_defs?.length ?? 0) > 0
                    const potRdy = it.pot_ready ?? (!it.pot_used_in_pull && !usedPot)
                    const hsRdy = it.hs_ready ?? (!it.hs_used_in_pull && !usedHs)
                    const anyRdy = it.any_ready ?? (hasReadyDef || potRdy || hsRdy)
                    if (eventFilter === 'missed_ready') return !usedAny && anyRdy
                    if (eventFilter === 'used') return usedAny
                    return true
                  })

                  return (
                    <DefensivePlayerRowView
                      key={row.player}
                      row={row}
                      visibleItems={visibleItems}
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
    </div>
  )
}

function DefensivePlayerRowView({
  row,
  visibleItems,
  isOpen,
  isMultiReport,
  onToggle,
}: {
  row: DefensivePlayerRow
  visibleItems: DefensivePlayerRow['items']
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
          </button>
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12.5px] whitespace-nowrap">
          <div className="font-semibold text-white">{row.criticalEvents}×</div>
          <div className="text-[10.5px] text-[#8b96a9]">
            {row.lowSpikes} Drops · {row.deaths} Tode
          </div>
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12.5px] whitespace-nowrap">
          <div
            className={`font-semibold ${
              row.usedAnyRatePct >= 65
                ? 'text-[#34f5c5]'
                : row.usedAnyRatePct >= 35
                  ? 'text-[#fbbf24]'
                  : 'text-[#f87171]'
            }`}
          >
            {row.usedAnyCount}× ({row.usedAnyRatePct}%)
          </div>
          <div className="text-[10.5px] text-[#8b96a9]">
            {row.usedDefCount} Def · {row.usedPotAtDropCount} Pot · {row.usedHsAtDropCount} Gesu
          </div>
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12.5px] whitespace-nowrap">
          {row.missedWhileReadyCount > 0 ? (
            <>
              <div className="font-semibold text-[#f87171]">{row.missedWhileReadyCount}×</div>
              <div className="text-[10.5px] text-[#fca5a5]">
                {row.missedSpikeWhileReadyCount} Drops · {row.missedDeathWhileReadyCount} Tode
              </div>
            </>
          ) : (
            <span className="text-[#34f5c5] font-semibold">0</span>
          )}
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12px] whitespace-nowrap">
          <div className={row.usedPotAtDropCount > 0 ? 'text-[#34f5c5] font-semibold' : 'text-[#8b96a9]'}>
            {row.usedPotAtDropCount}× genutzt
          </div>
          {row.missedPotReadyCount > 0 && (
            <div className="text-[10.5px] text-[#fbbf24]">{row.missedPotReadyCount}× rdy verpasst</div>
          )}
        </td>
        <td className="py-2.5 pl-2 pr-4 text-right font-mono-num text-[12px] whitespace-nowrap">
          <div className={row.usedHsAtDropCount > 0 ? 'text-[#34f5c5] font-semibold' : 'text-[#8b96a9]'}>
            {row.usedHsAtDropCount}× genutzt
          </div>
          {row.missedHsReadyCount > 0 && (
            <div className="text-[10.5px] text-[#fbbf24]">{row.missedHsReadyCount}× rdy verpasst</div>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-[rgba(255,255,255,0.09)] bg-[rgba(5,9,17,0.7)]">
          <td colSpan={6} className="px-4 py-3">
            {visibleItems.length === 0 ? (
              <div className="text-[12px] text-[#8b96a9]">
                Keine Einträge im gewählten Detail-Filter.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
                {visibleItems.map((item) => {
                  const usedPot = Boolean(item.used_pot_here)
                  const usedHs = Boolean(item.used_hs_here)
                  const usedAny = item.used_any_here ?? (item.had_def_cd || usedPot || usedHs)
                  const readyDefs = item.ready_defs ?? []
                  const potRdy = item.pot_ready ?? (!item.pot_used_in_pull && !usedPot)
                  const hsRdy = item.hs_ready ?? (!item.hs_used_in_pull && !usedHs)
                  const readyParts: string[] = [
                    ...readyDefs,
                    ...(potRdy ? ['Heal Pot'] : []),
                    ...(hsRdy ? ['Gesu'] : []),
                  ]

                  return (
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
                        {item.kind === 'death' ? (
                          <Pill variant="destructive">Tod · {item.trigger_ability}</Pill>
                        ) : (
                          <Pill variant="warning">
                            {item.trigger_ability} · {item.hp_pct.toFixed(1)}% HP
                          </Pill>
                        )}
                        {usedAny ? (
                          <>
                            {item.had_def_cd && (
                              <Pill variant="success">Def: {item.active_defs.join(', ')}</Pill>
                            )}
                            {usedPot && <Pill variant="success">Heal Pot genutzt</Pill>}
                            {usedHs && <Pill variant="success">Gesu genutzt</Pill>}
                          </>
                        ) : readyParts.length > 0 ? (
                          <Pill variant="destructive">
                            Nichts genutzt! Rdy: {readyParts.join(' · ')}
                          </Pill>
                        ) : (
                          <Pill>Alles auf CD</Pill>
                        )}
                        {item.deaths_before > 0 && (
                          <Pill>nach {item.deaths_before} {item.deaths_before === 1 ? 'Tod' : 'Toden'}</Pill>
                        )}
                      </div>
                      <WclActionLinks eventsUrl={item.events_url} replayUrl={item.replay_url} />
                    </div>
                  )
                })}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
