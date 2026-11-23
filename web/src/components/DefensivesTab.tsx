import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FlaskConical, Gem, Shield, Skull } from 'lucide-react'
import type { ReportData } from '../types'
import { aggregateDefensives } from '../lib/stats'
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
}: {
  reports: ReportData[]
  isMultiReport: boolean
  searchQuery: string
  maxDeaths: number
}) {
  const [eventFilter, setEventFilter] = useState<'all' | 'unprotected_only'>('unprotected_only')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const stats = useMemo(
    () => aggregateDefensives(reports, maxDeaths),
    [reports, maxDeaths],
  )

  const q = searchQuery.trim().toLowerCase()
  const filteredPlayers = useMemo(() => {
    if (!q) return stats.players
    return stats.players.filter(
      (p) => p.player.toLowerCase().includes(q) || p.className.toLowerCase().includes(q),
    )
  }, [stats.players, q])

  const toggle = (name: string) =>
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))

  return (
    <div className="space-y-4">
      <div className="kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Def-CD bei Damage-Spitzen"
          value={`${stats.spikeDefRatePct}%`}
          subtext={`${stats.totalSpikesWithDef} / ${stats.totalSpikes} Drops < 35% HP geschützt`}
          icon={<Shield className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.spikeDefRatePct >= 50 ? 'success' : 'warning'}
        />
        <KpiCard
          label="Healing-Potion-Quote"
          value={`${stats.overallPotRatePct}%`}
          subtext="Silvermoon Health Potion pro Pull"
          icon={<FlaskConical className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.overallPotRatePct >= 40 ? 'success' : 'warning'}
        />
        <KpiCard
          label="Healthstone-Quote"
          value={`${stats.overallHsRatePct}%`}
          subtext="Healthstone / Demonic HS pro Pull"
          icon={<Gem className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.overallHsRatePct >= 40 ? 'success' : 'warning'}
        />
        <KpiCard
          label="Tode ohne Pot & HS"
          value={stats.totalDeathsNoPotNoHs}
          subtext={`Von ${stats.totalDeaths} Toden (≤ ${maxDeaths} Tode)`}
          icon={<Skull className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.totalDeathsNoPotNoHs > 0 ? 'destructive' : 'success'}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold text-white">
              Def-CD, Healing Potion & Healthstone pro Spieler
            </h2>
            <p className="text-[12px] text-[#8b96a9]">
              Prüft große Spitzen (Mephitic Thrash, Spectral Coils, Putrid Membrane, Caustic Waves bei &lt; 35 % HP) sowie Tode mit ungenutztem Pot/HS/Def-CD.
            </p>
          </div>
          <SubFilterPills
            value={eventFilter}
            onChange={setEventFilter}
            options={[
              { value: 'unprotected_only', label: 'Nur ohne Def / Pot / HS' },
              { value: 'all', label: 'Alle Low-HP & Tode' },
            ]}
          />
        </div>

        {filteredPlayers.length === 0 ? (
          <EmptyState
            title="Keine Spielerdaten vorhanden"
            description="Für diesen Filter liegen keine Defensiv- oder Verbrauchsdaten vor."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                  <th className="py-2.5 pl-4 pr-2">Spieler</th>
                  <th className="py-2.5 px-2 text-right">Pulls</th>
                  <th className="py-2.5 px-2 text-right">Heal Pot</th>
                  <th className="py-2.5 px-2 text-right">Healthstone</th>
                  <th className="py-2.5 px-2 text-right">Def bei &lt; 35%</th>
                  <th className="py-2.5 px-2 text-right">Tode ohne Def</th>
                  <th className="py-2.5 pl-2 pr-4 text-right">Tode ohne Pot/HS</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((row) => {
                  const isOpen = !!expanded[row.player]
                  const visibleItems =
                    eventFilter === 'unprotected_only'
                      ? row.items.filter(
                          (it) =>
                            (it.kind === 'low_hp_spike' && !it.had_def_cd) ||
                            (it.kind === 'death' && (!it.had_def_cd || (!it.pot_used_in_pull && !it.hs_used_in_pull))),
                        )
                      : row.items

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
  row: ReturnType<typeof aggregateDefensives>['players'][number]
  visibleItems: ReturnType<typeof aggregateDefensives>['players'][number]['items']
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
            className="flex items-center gap-2 text-left text-[13px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 rounded"
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-[#34f5c5]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-[#8b96a9]" />
            )}
            <ClassDot className={row.className} />
            <span>{row.player}</span>
          </button>
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12px] text-[#c5cdd9]">
          {row.pullsPresent}
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12px]">
          <span className={row.potRatePct >= 40 ? 'text-[#34f5c5]' : row.potRatePct > 0 ? 'text-[#fbbf24]' : 'text-[#f87171]'}>
            {row.potPulls}/{row.pullsPresent} ({row.potRatePct}%)
          </span>
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12px]">
          <span className={row.hsRatePct >= 40 ? 'text-[#34f5c5]' : row.hsRatePct > 0 ? 'text-[#fbbf24]' : 'text-[#f87171]'}>
            {row.hsPulls}/{row.pullsPresent} ({row.hsRatePct}%)
          </span>
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12px]">
          <span className={row.defSpikeRatePct >= 50 ? 'text-[#34f5c5]' : 'text-[#fbbf24]'}>
            {row.lowSpikesWithDef}/{row.lowSpikes} ({row.defSpikeRatePct}%)
          </span>
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12px]">
          {row.deathsNoDef > 0 ? (
            <span className="text-[#fbbf24] font-semibold">{row.deathsNoDef}</span>
          ) : (
            <span className="text-[#8b96a9]">0</span>
          )}
        </td>
        <td className="py-2.5 pl-2 pr-4 text-right font-mono-num text-[13px]">
          {row.deathsNoPotNoHs > 0 ? (
            <span className="text-[#f87171] font-semibold">{row.deathsNoPotNoHs}</span>
          ) : (
            <span className="text-[#34f5c5]">0</span>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-[rgba(255,255,255,0.09)] bg-[rgba(5,9,17,0.7)]">
          <td colSpan={7} className="px-4 py-3">
            {visibleItems.length === 0 ? (
              <div className="text-[12px] text-[#8b96a9]">
                Keine kritischen Momente im gewählten Filter für {row.player}.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
                {visibleItems.map((item) => (
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
                        <Pill variant="destructive">Tod: {item.trigger_ability}</Pill>
                      ) : (
                        <Pill variant="warning">
                          {item.hp_pct.toFixed(1)}% HP ({item.trigger_ability})
                        </Pill>
                      )}
                      {item.had_def_cd ? (
                        <Pill variant="success">Def: {item.active_defs.join(', ')}</Pill>
                      ) : (
                        <Pill variant="destructive">Kein Def-CD</Pill>
                      )}
                      {item.pot_used_in_pull ? (
                        <Pill variant="success">Pot ✓</Pill>
                      ) : (
                        <Pill>Kein Pot</Pill>
                      )}
                      {item.hs_used_in_pull ? (
                        <Pill variant="success">HS ✓</Pill>
                      ) : (
                        <Pill>Kein HS</Pill>
                      )}
                      {item.deaths_before > 0 && (
                        <Pill>nach {item.deaths_before} {item.deaths_before === 1 ? 'Tod' : 'Toden'}</Pill>
                      )}
                    </div>
                    <WclActionLinks eventsUrl={item.events_url} replayUrl={item.replay_url} />
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
