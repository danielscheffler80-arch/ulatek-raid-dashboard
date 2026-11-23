import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Clock, Egg, Flame, Skull, Users } from 'lucide-react'
import type { ReportData } from '../types'
import { aggregateEggFails, formatDamage } from '../lib/stats'
import {
  Card,
  ClassDot,
  EmptyState,
  KpiCard,
  Pill,
  WclActionLinks,
} from './ui'

export function EggFailsTab({
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const stats = useMemo(
    () => aggregateEggFails(reports, maxDeaths),
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

  const peakPhase = useMemo(() => {
    return [...stats.phases].sort((a, b) => b.count - a.count)[0]
  }, [stats.phases])

  const toggle = (name: string) =>
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Egg Fails (Caustic Waves)"
          value={stats.total}
          subtext={`Noxious Shell durch Welle geplatzt (≤ ${maxDeaths} Tode)`}
          icon={<Egg className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.total > 0 ? 'warning' : 'success'}
        />
        <KpiCard
          label="Betroffene Spieler"
          value={stats.affectedPlayers}
          subtext={`Filter aktiv: max. ${maxDeaths} ${maxDeaths === 1 ? 'Tod' : 'Tode'}`}
          icon={<Users className="h-4 w-4" strokeWidth={1.75} />}
        />
        <KpiCard
          label="Tödliche Egg Fails"
          value={stats.lethalTotal}
          subtext="Direkt beim Ei-Bruch gestorben"
          icon={<Skull className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.lethalTotal > 0 ? 'destructive' : 'success'}
        />
        <KpiCard
          label="Haupt-Fehlerfenster"
          value={stats.total > 0 ? `${peakPhase.pct}%` : '—'}
          subtext={stats.total > 0 ? `${peakPhase.label} (${peakPhase.count}×)` : 'Keine Vorfälle'}
          icon={<Clock className="h-4 w-4" strokeWidth={1.75} />}
        />
      </div>

      {/* Main Bento Grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
            <div>
              <h2 className="text-[14px] font-semibold text-white">Spieler-Auswertung — Egg Fails</h2>
              <p className="text-[12px] text-[#8b96a9]">
                Nur echte Treffer von Caustic Waves auf aktive Noxious Shell. Klicke auf einen Spieler für alle Trys & Links.
              </p>
            </div>
            <Pill variant="info">{filteredPlayers.length} Spieler</Pill>
          </div>

          {filteredPlayers.length === 0 ? (
            <EmptyState
              title="Keine Egg Fails im aktuellen Filter"
              description={`Bis maximal ${maxDeaths} Tode wurde kein Spieler mit aktiver Noxious Shell von Caustic Waves getroffen.`}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                    <th className="py-2.5 pl-4 pr-2">Spieler</th>
                    <th className="py-2.5 px-2 text-right">Egg Fails</th>
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

        {/* Right Side Panel: Phase Distribution & Clean Splashes */}
        <Card className="p-4 space-y-4 self-start">
          <div>
            <h3 className="text-[14px] font-semibold text-white">Zeitfenster-Verteilung</h3>
            <p className="text-[12px] text-[#8b96a9]">
              Wann im Kampf werden Eierträger von Caustic Waves getroffen?
            </p>
          </div>

          <div className="space-y-3">
            {stats.phases.map((ph) => (
              <div key={ph.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-[#c5cdd9]">{ph.label}</span>
                  <span className="font-mono-num text-white font-medium">
                    {ph.count}× ({ph.pct}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#34f5c5] to-[#38bdf8] transition-[width] duration-300"
                    style={{ width: `${ph.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Positive Clean Splash Note */}
          <div className="rounded-[10px] border border-[rgba(52,245,197,0.28)] bg-[rgba(52,245,197,0.08)] p-3 text-[12px]">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#34f5c5]">
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                Saubere Bumps (Splash)
              </span>
              <span className="font-mono-num font-bold text-white">{stats.cleanSplashCount}×</span>
            </div>
            <p className="mt-1 text-[11.5px] text-[#c5cdd9] leading-relaxed">
              Noxious-Splash-Bumps sind korrekt gespielt und werden nicht als Egg Fail gezählt.
            </p>
          </div>

          <div className="border-t border-[rgba(255,255,255,0.08)] pt-3 text-[12px] text-[#8b96a9] space-y-1.5">
            <div className="flex items-center gap-1.5 text-[#c5cdd9] font-medium">
              <Flame className="h-3.5 w-3.5 text-[#fbbf24]" strokeWidth={1.75} aria-hidden="true" />
              <span>Erkennungslogik</span>
            </div>
            <p className="leading-relaxed">
              Zählt ausschließlich <code className="font-mono-num text-white">removedebuff Noxious Shell</code> 0–50 ms vor <code className="font-mono-num text-white">Caustic Waves</code>. Saubere <code className="font-mono-num text-white">Spectral Coils</code>-Clears & Bumps sind ausgenommen.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

function EggPlayerRowView({
  row,
  isOpen,
  isMultiReport,
  onToggle,
}: {
  row: ReturnType<typeof aggregateEggFails>['players'][number]
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
            <span className="text-[11px] text-[#8b96a9]">{row.className}</span>
          </button>
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[13px] font-semibold text-[#fbbf24]">
          {row.count}×
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
          <td colSpan={4} className="px-4 py-3">
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
                    <span className="font-mono-num text-[#c5cdd9]">
                      {formatDamage(item.damage)} Dmg
                    </span>
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
