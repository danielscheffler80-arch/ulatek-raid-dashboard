import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Flame, Heart, Info, Mountain, Target } from 'lucide-react'
import type { ReportData } from '../types'
import { aggregateHeartPhases, formatDamage } from '../lib/stats'
import type { PullRange } from '../lib/stats'
import {
  Card,
  ClassDot,
  EmptyState,
  KpiCard,
  Pill,
  SubFilterPills,
  WclActionLinks,
} from './ui'

export function HeartPhaseTab({
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
  const [viewMode, setViewMode] = useState<'players' | 'windows'>('players')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const stats = useMemo(
    () => aggregateHeartPhases(reports, maxDeaths, pullRange),
    [reports, maxDeaths, pullRange],
  )

  const q = searchQuery.trim().toLowerCase()
  const filteredPlayers = useMemo(() => {
    if (!q) return stats.players
    return stats.players.filter(
      (p) =>
        p.player.toLowerCase().includes(q) ||
        p.className.toLowerCase().includes(q) ||
        p.entries.some((e) => `try ${e.pull_num}`.includes(q) || String(e.pull_num) === q),
    )
  }, [stats.players, q])

  const filteredWindows = useMemo(() => {
    if (!q) return stats.windows
    return stats.windows.filter(
      (w) =>
        `try ${w.pull_num}`.includes(q) ||
        String(w.pull_num) === q ||
        w.players.some((p) => p.player.toLowerCase().includes(q)),
    )
  }, [stats.windows, q])

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="space-y-4">
      <div className="kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Herzphasen-Fenster"
          value={stats.windowCount}
          subtext={`Try ${pullRange.from}–${pullRange.to} · max. ${maxDeaths} Tode`}
          icon={<Heart className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.windowCount > 0 ? 'success' : 'default'}
        />
        <KpiCard
          label="Ø Boss-DMG / Fenster"
          value={formatDamage(stats.avgEffectiveDmgPerWindow)}
          subtext={`Gesamt ${formatDamage(stats.totalEffectiveDmg)} (Herz 2× + Boss 1×)`}
          icon={<Flame className="h-4 w-4" strokeWidth={1.75} />}
          tone="success"
        />
        <KpiCard
          label="Herz-Anteil (2× Amp)"
          value={`${stats.overallHeartSharePct.toFixed(1)}%`}
          subtext={`Herz ${formatDamage(stats.totalHeartDmg)} · Boss ${formatDamage(stats.totalBossDmg)}`}
          icon={<Target className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.overallHeartSharePct >= 75 ? 'success' : 'warning'}
        />
        <KpiCard
          label="Falling Debris Treffer"
          value={stats.totalDebrisHits}
          subtext={`Nebenziele-DMG im Fenster: ${formatDamage(stats.totalOtherDmg)}`}
          icon={<Mountain className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.totalDebrisHits > 0 ? 'warning' : 'success'}
        />
      </div>

      {/* Info Banner explaining the 2x Heart Multiplier */}
      <div className="flex items-start gap-2.5 rounded-[12px] border border-[rgba(52,245,197,0.24)] bg-[rgba(52,245,197,0.06)] px-3.5 py-2.5 text-[12px] text-[#c5cdd9]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#34f5c5]" strokeWidth={1.8} aria-hidden="true" />
        <div>
          <strong className="text-white">Herzphasen-Rechnung (20 s Rage of the Shackled):</strong>{' '}
          WarcraftLogs loggt den <strong className="text-[#34f5c5]">+100 %-Multiplikator (2×)</strong> auf{' '}
          <span className="font-mono-num text-white">Venomous Heart</span> bereits im Schaden.{' '}
          <strong className="text-white">Gesamt auf Boss = Herz-DMG (inkl. 2×) + Boss-DMG (1×)</strong>.
          Der zugrunde liegende Rohschaden aufs Herz (<span className="font-mono-num">÷ 2</span>) wird zur besseren Einordnung zusätzlich angezeigt.
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold text-white">
              Herzphasen-Schaden — Gesamt auf den Boss (Herz + Ula&apos;tek)
            </h2>
            <p className="text-[12px] text-[#8b96a9]">
              Sortiert nach effektivem Gesamtschaden auf den Boss. Klicke auf einen Spieler für jedes einzelne 20s-Herzfenster inkl. WCL-Direktlink.
            </p>
          </div>
          <SubFilterPills
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'players', label: 'Spieler-Ranking', count: filteredPlayers.length },
              { value: 'windows', label: 'Nach Try / Fenster', count: filteredWindows.length },
            ]}
          />
        </div>

        {stats.windowCount === 0 ? (
          <EmptyState
            title="Keine Herzphasen im aktuellen Filter"
            description={`In Try ${pullRange.from}–${pullRange.to} (max. ${maxDeaths} Tode beim Start der Herzphase) wurde kein Venomous-Heart-Fenster erreicht. Erhöhe ggf. Max. Tode oder erweitere den Try-Bereich.`}
          />
        ) : viewMode === 'players' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                  <th className="py-2.5 pl-4 pr-2">Spieler</th>
                  <th className="py-2.5 px-2 text-right">Fenster</th>
                  <th className="py-2.5 px-2 text-right">Herz (2×)</th>
                  <th className="py-2.5 px-2 text-right">Roh Herz (÷2)</th>
                  <th className="py-2.5 px-2 text-right">Boss (1×)</th>
                  <th className="py-2.5 px-2 text-right">Gesamt Boss</th>
                  <th className="py-2.5 px-2 text-right">Ø / Fenster</th>
                  <th className="py-2.5 px-2 text-right">Herz-Anteil</th>
                  <th className="py-2.5 pl-2 pr-4 text-right">Debris / Adds</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((row) => {
                  const isOpen = !!expanded[`p-${row.player}`]
                  return (
                    <HeartPlayerRowView
                      key={row.player}
                      row={row}
                      isOpen={isOpen}
                      isMultiReport={isMultiReport}
                      onToggle={() => toggle(`p-${row.player}`)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(255,255,255,0.06)]">
            {filteredWindows.map((hw) => {
              const isOpen = !!expanded[`w-${hw.id}`]
              const share =
                hw.total_effective_dmg > 0
                  ? ((hw.total_heart_dmg / hw.total_effective_dmg) * 100).toFixed(1)
                  : '0.0'
              return (
                <div key={hw.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggle(`w-${hw.id}`)}
                      aria-expanded={isOpen}
                      className="flex flex-wrap items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 rounded"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-[#34f5c5]" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-[#8b96a9]" />
                      )}
                      {isMultiReport && <Pill>{hw.reportDate}</Pill>}
                      <span className="font-mono-num text-[13px] font-semibold text-white">
                        Try {hw.pull_num} · Herz #{hw.window_num}
                      </span>
                      <span className="font-mono-num text-[12px] text-[#34f5c5]">
                        {hw.start_rel_time} ({(hw.duration_ms / 1000).toFixed(1)}s)
                      </span>
                      <Pill variant="success">Gesamt: {formatDamage(hw.total_effective_dmg)}</Pill>
                      <Pill variant="info">Herz {share}%</Pill>
                      {hw.debris_hits_total > 0 && (
                        <Pill variant="warning">{hw.debris_hits_total}× Debris</Pill>
                      )}
                      {hw.deaths_before > 0 && (
                        <Pill>nach {hw.deaths_before} {hw.deaths_before === 1 ? 'Tod' : 'Toden'}</Pill>
                      )}
                    </button>
                    <WclActionLinks eventsUrl={hw.events_url} replayUrl={hw.replay_url} />
                  </div>
                  {isOpen && (
                    <div className="mt-3 overflow-x-auto rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(5,9,17,0.72)]">
                      <table className="w-full text-left border-collapse text-[12px]">
                        <thead>
                          <tr className="border-b border-[rgba(255,255,255,0.07)] text-[10.5px] uppercase tracking-wider text-[#8b96a9]">
                            <th className="py-2 pl-3 pr-2">Spieler</th>
                            <th className="py-2 px-2 text-right">Herz (2×)</th>
                            <th className="py-2 px-2 text-right">Boss (1×)</th>
                            <th className="py-2 px-2 text-right">Gesamt Boss</th>
                            <th className="py-2 px-2 text-right">Herz-Anteil</th>
                            <th className="py-2 pl-2 pr-3 text-right">Nebenziele</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hw.players.map((p) => (
                            <tr
                              key={p.player}
                              className="border-b border-[rgba(255,255,255,0.04)] last:border-0"
                            >
                              <td className="py-1.5 pl-3 pr-2">
                                <span className="inline-flex items-center gap-1.5 text-white">
                                  <ClassDot className={p.class} />
                                  {p.player}
                                </span>
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono-num text-[#34f5c5]">
                                {formatDamage(p.heart_dmg)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono-num text-[#c5cdd9]">
                                {formatDamage(p.boss_dmg)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono-num font-semibold text-white">
                                {formatDamage(p.total_boss_dmg)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono-num text-[#c5cdd9]">
                                {p.heart_share_pct.toFixed(1)}%
                              </td>
                              <td className="py-1.5 pl-2 pr-3 text-right font-mono-num text-[#8b96a9]">
                                {p.other_dmg > 0 ? formatDamage(p.other_dmg) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

function HeartPlayerRowView({
  row,
  isOpen,
  isMultiReport,
  onToggle,
}: {
  row: ReturnType<typeof aggregateHeartPhases>['players'][number]
  isOpen: boolean
  isMultiReport: boolean
  onToggle: () => void
}) {
  const shareColor =
    row.heartSharePct >= 75
      ? 'text-[#34f5c5]'
      : row.heartSharePct >= 55
        ? 'text-[#fbbf24]'
        : 'text-[#f87171]'

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
          {row.windowsPresent}×
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12.5px] text-[#34f5c5]">
          {formatDamage(row.heartDmg)}
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12px] text-[#8b96a9]">
          {formatDamage(row.heartRawDmg)}
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12.5px] text-[#c5cdd9]">
          {formatDamage(row.bossDmg)}
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[13px] font-bold text-white">
          {formatDamage(row.totalBossDmg)}
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[12.5px] text-[#38bdf8]">
          {formatDamage(row.avgBossDmg)}
        </td>
        <td className={`py-2.5 px-2 text-right font-mono-num text-[12.5px] font-semibold ${shareColor}`}>
          {row.heartSharePct.toFixed(1)}%
        </td>
        <td className="py-2.5 pl-2 pr-4 text-right font-mono-num text-[12px]">
          <div className="inline-flex items-center justify-end gap-1.5">
            {row.debrisHits > 0 && <Pill variant="warning">{row.debrisHits}× Debris</Pill>}
            <span className={row.otherDmg > 1_000_000 ? 'text-[#fbbf24]' : 'text-[#8b96a9]'}>
              {row.otherDmg > 0 ? formatDamage(row.otherDmg) : '—'}
            </span>
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-[rgba(255,255,255,0.09)] bg-[rgba(5,9,17,0.7)]">
          <td colSpan={9} className="px-4 py-3">
            <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
              {row.entries.map((entry) => (
                <div
                  key={`${entry.reportCode}-${entry.fight_id}-${entry.window_num}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[rgba(16,20,27,0.8)] px-3 py-2 text-[12px]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {isMultiReport && <Pill>{entry.reportDate}</Pill>}
                    <span className="font-mono-num font-semibold text-white">
                      Try {entry.pull_num} · Herz #{entry.window_num}
                    </span>
                    <span className="font-mono-num text-[#34f5c5]">{entry.start_rel_time}</span>
                    <Pill variant="success">Gesamt: {formatDamage(entry.total_boss_dmg)}</Pill>
                    <span className="font-mono-num text-[11.5px] text-[#c5cdd9]">
                      Herz {formatDamage(entry.heart_dmg)} ({entry.heart_share_pct.toFixed(1)}%) · Boss {formatDamage(entry.boss_dmg)}
                    </span>
                    {entry.other_dmg > 0 && (
                      <Pill>Adds: {formatDamage(entry.other_dmg)}</Pill>
                    )}
                    {entry.debris_hits > 0 && (
                      <Pill variant="warning">{entry.debris_hits}× Falling Debris</Pill>
                    )}
                    {entry.deaths_before > 0 && (
                      <Pill>nach {entry.deaths_before} {entry.deaths_before === 1 ? 'Tod' : 'Toden'}</Pill>
                    )}
                  </div>
                  <WclActionLinks eventsUrl={entry.events_url} replayUrl={entry.replay_url} />
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
