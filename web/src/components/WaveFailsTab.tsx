import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Clock, Egg, Skull, Users, Waves } from 'lucide-react'
import type { ReportData } from '../types'
import { aggregateWaveFails, formatDamage } from '../lib/stats'
import {
  Card,
  ClassDot,
  EmptyState,
  KpiCard,
  MaxDeathsFilter,
  Pill,
  WclActionLinks,
} from './ui'

export function WaveFailsTab({
  reports,
  isMultiReport,
  searchQuery,
  maxDeaths,
  onMaxDeathsChange,
}: {
  reports: ReportData[]
  isMultiReport: boolean
  searchQuery: string
  maxDeaths: number | null
  onMaxDeathsChange: (v: number | null) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const stats = useMemo(
    () => aggregateWaveFails(reports, maxDeaths),
    [reports, maxDeaths],
  )

  const q = searchQuery.trim().toLowerCase()
  const filteredPlayers = useMemo(() => {
    if (!q) return stats.players
    return stats.players.filter(
      (p) =>
        p.player.toLowerCase().includes(q) ||
        p.className.toLowerCase().includes(q) ||
        p.items.some((it) => `try ${it.pull_num}`.includes(q) || String(it.pull_num) === q),
    )
  }, [stats.players, q])

  const peakPhase = useMemo(
    () => [...stats.phases].sort((a, b) => b.count - a.count)[0],
    [stats.phases],
  )

  const toggle = (name: string) =>
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#27272a] bg-[#09090b] px-4 py-3">
        <MaxDeathsFilter value={maxDeaths} onChange={onMaxDeathsChange} />
        <div className="text-[12px] text-[#71717a]">
          Alle direkten Treffer von <span className="text-[#a1a1aa] font-medium">Caustic Waves (1292403)</span> ohne 1s-DoT-Ticks
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Wave-Treffer gesamt"
          value={stats.total}
          subtext={maxDeaths === null ? 'Alle direkten Treffer' : `Bis max. ${maxDeaths} Tode`}
          icon={<Waves className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.total > 0 ? 'warning' : 'success'}
        />
        <KpiCard
          label="Davon mit Noxious Shell"
          value={stats.withShellTotal}
          subtext="Direktes Ei-Platzen durch Welle"
          icon={<Egg className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.withShellTotal > 0 ? 'destructive' : 'success'}
        />
        <KpiCard
          label="Tödliche Wave-Treffer"
          value={stats.lethalTotal}
          subtext={`${stats.affectedPlayers} betroffene Spieler`}
          icon={<Skull className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.lethalTotal > 0 ? 'destructive' : 'success'}
        />
        <KpiCard
          label="Stärkste Phase"
          value={stats.total > 0 ? `${peakPhase.pct}%` : '—'}
          subtext={stats.total > 0 ? `${peakPhase.label} (${peakPhase.count}×)` : 'Keine Treffer'}
          icon={<Clock className="h-4 w-4" strokeWidth={1.75} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#27272a] px-4 py-3">
            <div>
              <h2 className="text-[14px] font-semibold text-[#fafafa]">Spieler-Rangliste — Wave Fails</h2>
              <p className="text-[12px] text-[#71717a]">
                Jeder einzelne direkte Wellentreffer im gesamten Raid, aufklappbar mit Direktlinks.
              </p>
            </div>
            <Pill>
              <Users className="h-3 w-3" aria-hidden="true" />
              {filteredPlayers.length} Spieler
            </Pill>
          </div>

          {filteredPlayers.length === 0 ? (
            <EmptyState
              title="Keine Wave-Treffer gefunden"
              description="Im aktuellen Filter wurde kein Spieler direkt von Caustic Waves getroffen."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#27272a] text-[11px] font-medium uppercase tracking-wider text-[#a1a1aa]">
                    <th className="py-2.5 pl-4 pr-2">Spieler</th>
                    <th className="py-2.5 px-2 text-right">Treffer</th>
                    <th className="py-2.5 px-2 text-right">Mit Ei</th>
                    <th className="py-2.5 px-2 text-right">Ø Schaden</th>
                    <th className="py-2.5 pl-2 pr-4 text-right">Tödlich</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayers.map((row) => {
                    const isOpen = !!expanded[row.player]
                    return (
                      <WavePlayerRowView
                        key={row.player}
                        row={row}
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

        <Card className="p-4 space-y-4 self-start">
          <div>
            <h3 className="text-[14px] font-semibold text-[#fafafa]">Wave-Treffer nach Phase</h3>
            <p className="text-[12px] text-[#71717a]">Verteilung aller direkten Caustic-Waves-Treffer</p>
          </div>
          <div className="space-y-3">
            {stats.phases.map((ph) => (
              <div key={ph.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-[#a1a1aa]">{ph.label}</span>
                  <span className="font-mono-num text-[#fafafa] font-medium">
                    {ph.count}× ({ph.pct}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#18181b]">
                  <div
                    className="h-full rounded-full bg-[#34d399] transition-[width] duration-300"
                    style={{ width: `${ph.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function WavePlayerRowView({
  row,
  isOpen,
  isMultiReport,
  onToggle,
}: {
  row: ReturnType<typeof aggregateWaveFails>['players'][number]
  isOpen: boolean
  isMultiReport: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="border-b border-[#18181b] hover:bg-[#18181b]/70 transition-colors">
        <td className="py-2.5 pl-4 pr-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            className="flex items-center gap-2 text-left text-[13px] font-medium text-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded"
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-[#a1a1aa]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-[#71717a]" />
            )}
            <ClassDot className={row.className} />
            <span>{row.player}</span>
            <span className="text-[11px] text-[#71717a]">{row.className}</span>
          </button>
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[13px] font-semibold text-[#fafafa]">
          {row.count}×
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[13px]">
          {row.withShellCount > 0 ? (
            <span className="text-[#fbbf24] font-semibold">{row.withShellCount}×</span>
          ) : (
            <span className="text-[#71717a]">0</span>
          )}
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12px] text-[#a1a1aa]">
          {formatDamage(row.avgDamage)}
        </td>
        <td className="py-2.5 pl-2 pr-4 text-right font-mono-num text-[13px]">
          {row.lethalCount > 0 ? (
            <span className="text-[#f87171] font-semibold">{row.lethalCount}×</span>
          ) : (
            <span className="text-[#71717a]">0</span>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-[#27272a] bg-[#121215]">
          <td colSpan={5} className="px-4 py-3">
            <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
              {row.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-[#27272a] bg-[#09090b] px-3 py-2 text-[12px]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {isMultiReport && <Pill>{item.reportDate}</Pill>}
                    <span className="font-mono-num font-semibold text-[#fafafa]">
                      Try {item.pull_num}
                    </span>
                    <span className="font-mono-num text-[#a1a1aa]">{item.rel_time}</span>
                    <span className="font-mono-num text-[#71717a]">
                      {formatDamage(item.damage)} Dmg
                    </span>
                    {item.had_noxious_shell && <Pill variant="warning">Mit Noxious Shell</Pill>}
                    {item.deaths_before > 0 && (
                      <Pill>nach {item.deaths_before} {item.deaths_before === 1 ? 'Tod' : 'Toden'}</Pill>
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
