import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Flame,
  ShieldAlert,
  Swords,
  Zap,
} from 'lucide-react'
import type { ReportData } from '../types'
import { aggregatePhaseAnalysis, formatDamage } from '../lib/stats'
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

type PhaseSubTab = 'overlaps' | 'kicks' | 'warden' | 'avoidables' | 'p3'

export function PhasesTab({
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
  const [subTab, setSubTab] = useState<PhaseSubTab>('overlaps')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const stats = useMemo(
    () => aggregatePhaseAnalysis(reports, maxDeaths, pullRange),
    [reports, maxDeaths, pullRange],
  )

  const q = searchQuery.trim().toLowerCase()
  const matchName = (name: string) => !q || name.toLowerCase().includes(q)
  const toggle = (k: string) => setExpanded((prev) => ({ ...prev, [k]: !prev[k] }))

  const totalAvoidables = stats.p2Avoidables.length + stats.p3Avoidables.length
  const totalMissedKicks = stats.maliceMissed.length + stats.viciousMissed.length
  const totalKicks = stats.maliceKicks.length + stats.viciousKicks.length

  return (
    <div className="space-y-4">
      <div className="kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Blight Vein Overlaps (P2)"
          value={stats.blightOverlaps.length}
          subtext="Grasping Fangs ≤ 2,5 s nacheinander gebrochen"
          icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.blightOverlaps.length > 0 ? 'destructive' : 'success'}
        />
        <KpiCard
          label="Kicks vs. Durchgekommen"
          value={`${totalKicks} / ${totalMissedKicks}`}
          subtext={`Malice: ${stats.maliceKicks.length} gekickt, ${stats.maliceMissed.length} durch`}
          icon={<Zap className="h-4 w-4" strokeWidth={1.75} />}
          tone={totalMissedKicks > 0 ? 'destructive' : 'success'}
        />
        <KpiCard
          label="P2 / P3 Avoidable Hits"
          value={totalAvoidables}
          subtext="Acidic Burst/Expulsion, Petrifying Sting, Spit, P3"
          icon={<ShieldAlert className="h-4 w-4" strokeWidth={1.75} />}
          tone={totalAvoidables > 0 ? 'warning' : 'success'}
        />
        <KpiCard
          label="P2 Warden / P3 Trys"
          value={`${stats.wardenPulls.length} / ${stats.p3Pulls.length}`}
          subtext={`Try ${pullRange.from}–${pullRange.to} · max. ${maxDeaths} Tode`}
          icon={<Swords className="h-4 w-4" strokeWidth={1.75} />}
          tone="default"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold text-white">
              Phase 2, Phase 3 &amp; Kick-Forensik
            </h2>
            <p className="text-[12px] text-[#8b96a9]">
              Grasping-Fangs/Blight-Vein-Overlaps, Malice- &amp; Vicious-Echoes-Kicks, Doomscale Warden DPS/Sync sowie P3-Burn.
            </p>
          </div>
          <SubFilterPills
            value={subTab}
            onChange={setSubTab}
            options={[
              { value: 'overlaps', label: 'Blight Vein Overlaps', count: stats.blightOverlaps.length },
              { value: 'kicks', label: 'Kicks & Misses', count: totalKicks + totalMissedKicks },
              { value: 'warden', label: 'Warden DPS & Sync', count: stats.wardenPulls.length },
              { value: 'avoidables', label: 'Avoidables', count: totalAvoidables },
              { value: 'p3', label: 'Phase 3 Burn', count: stats.p3Pulls.length },
            ]}
          />
        </div>

        {/* 1. BLIGHT VEIN OVERLAPS */}
        {subTab === 'overlaps' && (
          stats.blightOverlapPlayers.filter((r) => matchName(r.player)).length === 0 ? (
            <EmptyState
              title="Keine Blight-Vein-Overlaps im aktuellen Filter"
              description="Entweder wurden alle Grasping Fangs sauber zeitversetzt (> 2,5 s) gebrochen oder kein Try im Filter erreichte P2."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                    <th className="py-2.5 pl-4 pr-2">Spieler (zu früh gebrochen)</th>
                    <th className="py-2.5 px-2 text-right">Overlaps</th>
                    <th className="py-2.5 pl-2 pr-4 text-right">Kürzester Abstand</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.blightOverlapPlayers
                    .filter((r) => matchName(r.player))
                    .map((row) => {
                      const isOpen = !!expanded[`bvo-${row.player}`]
                      const minGap = Math.min(...row.items.map((i) => i.gap_ms ?? 9999))
                      return (
                        <FragmentRow
                          key={row.player}
                          isOpen={isOpen}
                          colSpan={3}
                          summary={
                            <tr className="border-b border-[rgba(255,255,255,0.05)] hover:bg-[rgba(52,245,197,0.055)] transition-colors">
                              <td className="py-2.5 pl-4 pr-2">
                                <button
                                  type="button"
                                  onClick={() => toggle(`bvo-${row.player}`)}
                                  aria-expanded={isOpen}
                                  className="flex items-center gap-2 text-left text-[13px] font-medium text-white rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
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
                              <td className="py-2.5 px-2 text-right font-mono-num text-[13px] font-semibold text-[#f87171]">
                                {row.count}×
                              </td>
                              <td className="py-2.5 pl-2 pr-4 text-right font-mono-num text-[12px] text-[#fbbf24]">
                                {(minGap / 1000).toFixed(2)}s
                              </td>
                            </tr>
                          }
                          detail={
                            <div className="space-y-1.5">
                              {row.items.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[rgba(16,20,27,0.8)] px-3 py-2 text-[12px]"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    {isMultiReport && <Pill>{item.reportDate}</Pill>}
                                    <span className="font-mono-num font-semibold text-white">Try {item.pull_num}</span>
                                    <span className="font-mono-num text-[#34f5c5]">{item.rel_time}</span>
                                    <Pill variant="destructive">
                                      +{((item.gap_ms ?? 0) / 1000).toFixed(2)}s nach {item.detail}
                                    </Pill>
                                    {item.deaths_before > 0 && (
                                      <Pill>nach {item.deaths_before} {item.deaths_before === 1 ? 'Tod' : 'Toden'}</Pill>
                                    )}
                                  </div>
                                  <WclActionLinks eventsUrl={item.events_url} replayUrl={item.replay_url} />
                                </div>
                              ))}
                            </div>
                          }
                        />
                      )
                    })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* 2. KICKS & MISSED CASTS (MIT SEITEN-ZUORDNUNG & KICK-READY-CHECK) */}
        {subTab === 'kicks' && (
          <div className="p-4 space-y-5">
            {/* Missed Casts with per-side Ready Kickers */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[12.5px] font-semibold uppercase tracking-wider text-[#f87171]">
                  Durchgekommene Casts &amp; wer seinen Kick rdy hatte ({totalMissedKicks})
                </h3>
              </div>
              {totalMissedKicks === 0 ? (
                <div className="rounded-[10px] border border-[rgba(52,245,197,0.25)] bg-[rgba(52,245,197,0.06)] px-3.5 py-2.5 text-[12px] text-[#34f5c5]">
                  Kein Malice- oder Vicious-Echoes-Cast im aktuellen Filter durchgekommen.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {[...stats.maliceMissed, ...stats.viciousMissed].map((item) => {
                    const rdy = item.ready_kickers ?? []
                    const onCd = item.on_cd_kickers ?? []
                    return (
                      <div
                        key={item.id}
                        className="rounded-[10px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.07)] px-3.5 py-3 text-[12px] space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {isMultiReport && <Pill>{item.reportDate}</Pill>}
                            <span className="font-mono-num font-semibold text-white">Try {item.pull_num}</span>
                            <span className="font-mono-num text-[#f87171]">{item.rel_time}</span>
                            {item.side && <Pill variant="info">{item.side}</Pill>}
                            <Pill variant="destructive">{item.ability} nicht gekickt</Pill>
                            {item.damage > 0 && (
                              <span className="font-mono-num text-[#c5cdd9]">
                                {formatDamage(item.damage)} Raid-Schaden
                              </span>
                            )}
                            {item.deaths_before > 0 && (
                              <Pill>nach {item.deaths_before} {item.deaths_before === 1 ? 'Tod' : 'Toden'}</Pill>
                            )}
                          </div>
                          <WclActionLinks eventsUrl={item.events_url} replayUrl={item.replay_url} />
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#f87171] mr-1">
                            Kick rdy (nicht genutzt):
                          </span>
                          {rdy.length === 0 ? (
                            <span className="text-[11.5px] text-[#8b96a9]">
                              Kein lebender Spieler mit bereitem Kick auf dieser Seite erkannt
                            </span>
                          ) : (
                            rdy.map((k) => (
                              <Pill key={`${item.id}-rdy-${k.player}`} variant="destructive">
                                <ClassDot className={k.class} />
                                <span>{k.player}</span>
                                <span className="opacity-75">({k.spell})</span>
                              </Pill>
                            ))
                          )}
                        </div>

                        {onCd.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-medium uppercase tracking-wide text-[#8b96a9] mr-1">
                              Auf dieser Seite auf CD:
                            </span>
                            {onCd.map((k) => (
                              <Pill key={`${item.id}-cd-${k.player}`}>
                                <ClassDot className={k.class} />
                                <span>{k.player}</span>
                                <span className="opacity-70">({k.spell})</span>
                              </Pill>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Kicks & Missed-while-ready per Player and Side */}
            <div>
              <h3 className="mb-2 text-[12.5px] font-semibold uppercase tracking-wider text-[#34f5c5]">
                Kicks &amp; verpasste Kicks pro Spieler und Seite ({totalKicks} Kicks)
              </h3>
              {stats.kickPlayers.filter((r) => matchName(r.player)).length === 0 ? (
                <div className="text-[12px] text-[#8b96a9]">
                  Keine Malice-/Vicious-Echoes-Kicks im gewählten Filter.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-[10px] border border-[rgba(255,255,255,0.08)]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                        <th className="py-2.5 pl-3 pr-2">Spieler</th>
                        <th className="py-2.5 px-2 text-right">Kicks gesamt</th>
                        {stats.kickSides.map((side) => (
                          <th key={side} className="py-2.5 px-2 text-right text-[#38bdf8]">
                            {side}
                          </th>
                        ))}
                        <th className="py-2.5 px-2 text-right text-[#f87171]">Kick rdy verpasst</th>
                        <th className="py-2.5 pl-2 pr-3 text-right">Trys</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.kickPlayers
                        .filter((r) => matchName(r.player))
                        .map((row) => (
                          <tr
                            key={row.player}
                            className="border-b border-[rgba(255,255,255,0.05)] last:border-0 hover:bg-[rgba(52,245,197,0.055)] transition-colors"
                          >
                            <td className="py-2 pl-3 pr-2">
                              <span className="inline-flex items-center gap-2 text-[13px] font-medium text-white">
                                <ClassDot className={row.className} />
                                {row.player}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right font-mono-num text-[13px] font-semibold text-[#34f5c5]">
                              {row.totalKicks > 0 ? `${row.totalKicks}×` : <span className="text-[#8b96a9]">0</span>}
                            </td>
                            {stats.kickSides.map((side) => {
                              const kSide = row.kicksBySide[side] ?? 0
                              const mSide = row.missedBySide[side] ?? 0
                              return (
                                <td key={side} className="py-2 px-2 text-right font-mono-num text-[12px]">
                                  {kSide > 0 || mSide > 0 ? (
                                    <span className="inline-flex items-center justify-end gap-1">
                                      <span className={kSide > 0 ? 'text-[#34f5c5] font-semibold' : 'text-[#8b96a9]'}>
                                        {kSide}×
                                      </span>
                                      {mSide > 0 && (
                                        <span className="text-[#f87171] text-[11px]" title="Kick rdy nicht genutzt auf dieser Seite">
                                          ({mSide} rdy)
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="text-[#8b96a9]">—</span>
                                  )}
                                </td>
                              )
                            })}
                            <td className="py-2 px-2 text-right font-mono-num text-[13px]">
                              {row.missedReadyCount > 0 ? (
                                <span className="text-[#f87171] font-semibold">{row.missedReadyCount}×</span>
                              ) : (
                                <span className="text-[#34f5c5]">0</span>
                              )}
                            </td>
                            <td className="py-2 pl-2 pr-3 text-right font-mono-num text-[11.5px] text-[#8b96a9]">
                              {row.pulls.map((p) => `Try ${p}`).join(', ')}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-[11px] text-[#8b96a9]">
                Seiten-Zuordnung pro Try erfolgt automatisch anhand des Schadens auf den jeweiligen <strong className="text-[#c5cdd9]">Doomscale Warden</strong> (benannt nach dem Tank der Seite). Es werden nur lebende Spieler mit Interrupt-Fähigkeit gezählt.
              </p>
            </div>
          </div>
        )}

        {/* 3. WARDEN DPS & KILL-SYNC (P2) */}
        {subTab === 'warden' && (
          stats.wardenPulls.length === 0 ? (
            <EmptyState
              title="Keine Phase-2-Trys im aktuellen Filter"
              description={`In Try ${pullRange.from}–${pullRange.to} (max. ${maxDeaths} Tode zu P2-Beginn) wurde Phase 2 nicht erreicht.`}
            />
          ) : (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {stats.wardenPulls.map((wp) => (
                  <div
                    key={`${wp.reportCode}-${wp.fight_id}`}
                    className="rounded-[10px] border border-[rgba(255,255,255,0.09)] bg-[rgba(10,14,22,0.82)] p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-num text-[13px] font-semibold text-white">
                        Try {wp.pull_num} · P2 ab {wp.p2_start_rel_time}
                      </span>
                      {wp.kill_sync_delta_ms !== null ? (
                        <Pill variant={wp.kill_sync_delta_ms <= 5000 ? 'success' : 'warning'}>
                          Sync: {(wp.kill_sync_delta_ms / 1000).toFixed(1)}s
                        </Pill>
                      ) : (
                        <Pill>{wp.warden_kills}/2 Wardens tot</Pill>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[12px] text-[#8b96a9]">
                      <span>Warden-DMG: <strong className="font-mono-num text-white">{formatDamage(wp.total_warden_dmg)}</strong></span>
                      <WclActionLinks eventsUrl={wp.events_url} replayUrl={wp.replay_url} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto rounded-[10px] border border-[rgba(255,255,255,0.08)]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                      <th className="py-2.5 pl-4 pr-2">Spieler (Doomscale Warden Fokus-DMG)</th>
                      <th className="py-2.5 px-2 text-right">P2-Trys</th>
                      <th className="py-2.5 px-2 text-right">Gesamt-DMG</th>
                      <th className="py-2.5 pl-2 pr-4 text-right">Ø / P2-Try</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.wardenPlayers
                      .filter((r) => matchName(r.player))
                      .map((row) => (
                        <tr
                          key={row.player}
                          className="border-b border-[rgba(255,255,255,0.05)] last:border-0 hover:bg-[rgba(52,245,197,0.055)] transition-colors"
                        >
                          <td className="py-2 pl-4 pr-2">
                            <span className="inline-flex items-center gap-2 text-[13px] font-medium text-white">
                              <ClassDot className={row.className} />
                              {row.player}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono-num text-[12px] text-[#c5cdd9]">
                            {row.pullsPresent}×
                          </td>
                          <td className="py-2 px-2 text-right font-mono-num text-[13px] font-semibold text-white">
                            {formatDamage(row.totalDamage)}
                          </td>
                          <td className="py-2 pl-2 pr-4 text-right font-mono-num text-[12.5px] text-[#34f5c5]">
                            {formatDamage(row.avgDamage)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {/* 4. AVOIDABLE P2/P3 HITS */}
        {subTab === 'avoidables' && (
          stats.avoidablePlayers.filter((r) => matchName(r.player)).length === 0 ? (
            <EmptyState
              title="Keine vermeidbaren P2-/P3-Treffer im Filter"
              description="Keine Treffer durch Acidic Burst, Acidic Expulsion, Petrifying Sting, Virulent Spit oder P3-Mechaniken."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                    <th className="py-2.5 pl-4 pr-2">Spieler</th>
                    <th className="py-2.5 px-2 text-right">Treffer</th>
                    <th className="py-2.5 px-2 text-right">Tödlich</th>
                    <th className="py-2.5 pl-2 pr-4 text-right">Schaden gesamt</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.avoidablePlayers
                    .filter((r) => matchName(r.player))
                    .map((row) => {
                      const isOpen = !!expanded[`av-${row.player}`]
                      return (
                        <FragmentRow
                          key={row.player}
                          isOpen={isOpen}
                          colSpan={4}
                          summary={
                            <tr className="border-b border-[rgba(255,255,255,0.05)] hover:bg-[rgba(52,245,197,0.055)] transition-colors">
                              <td className="py-2.5 pl-4 pr-2">
                                <button
                                  type="button"
                                  onClick={() => toggle(`av-${row.player}`)}
                                  aria-expanded={isOpen}
                                  className="flex items-center gap-2 text-left text-[13px] font-medium text-white rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
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
                              <td className="py-2.5 px-2 text-right font-mono-num text-[13px] font-semibold text-[#fbbf24]">
                                {row.count}×
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono-num text-[12px]">
                                {row.lethalCount > 0 ? (
                                  <span className="text-[#f87171] font-semibold">{row.lethalCount}×</span>
                                ) : (
                                  <span className="text-[#8b96a9]">0</span>
                                )}
                              </td>
                              <td className="py-2.5 pl-2 pr-4 text-right font-mono-num text-[12px] text-[#c5cdd9]">
                                {formatDamage(row.totalDamage)}
                              </td>
                            </tr>
                          }
                          detail={
                            <div className="space-y-1.5">
                              {row.items.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[rgba(16,20,27,0.8)] px-3 py-2 text-[12px]"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    {isMultiReport && <Pill>{item.reportDate}</Pill>}
                                    <span className="font-mono-num font-semibold text-white">Try {item.pull_num}</span>
                                    <span className="font-mono-num text-[#34f5c5]">{item.rel_time}</span>
                                    <Pill variant={item.lethal ? 'destructive' : 'warning'}>
                                      {item.ability} · {formatDamage(item.damage)}
                                    </Pill>
                                    {item.deaths_before > 0 && (
                                      <Pill>nach {item.deaths_before} {item.deaths_before === 1 ? 'Tod' : 'Toden'}</Pill>
                                    )}
                                  </div>
                                  <WclActionLinks eventsUrl={item.events_url} replayUrl={item.replay_url} />
                                </div>
                              ))}
                            </div>
                          }
                        />
                      )
                    })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* 5. PHASE 3 BURN (AUTO-ACTIVATES ON FIRST P3 LOG) */}
        {subTab === 'p3' && (
          stats.p3Pulls.length === 0 ? (
            <EmptyState
              title="Noch kein Phase-3-Try im importierten Log"
              description="Sobald ihr einen neuen Log mit Phase 3 importiert, erscheinen hier automatisch der P3-Boss-Execute-Schaden pro Spieler, Vicious-Echoes-Kicks sowie Serpent's-Bite- & Volatile-Purge-Treffer."
            />
          ) : (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-[12.5px] text-[#34f5c5]">
                <Flame className="h-4 w-4" aria-hidden="true" />
                <span>{stats.p3Pulls.length} Trys mit Phase-3-Boss-Burn ausgewertet</span>
              </div>
              <div className="overflow-x-auto rounded-[10px] border border-[rgba(255,255,255,0.08)]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                      <th className="py-2.5 pl-4 pr-2">Spieler (P3 Boss-Schaden)</th>
                      <th className="py-2.5 px-2 text-right">P3-Trys</th>
                      <th className="py-2.5 px-2 text-right">Gesamt-DMG</th>
                      <th className="py-2.5 pl-2 pr-4 text-right">Ø / P3-Try</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.p3Players
                      .filter((r) => matchName(r.player))
                      .map((row) => (
                        <tr
                          key={row.player}
                          className="border-b border-[rgba(255,255,255,0.05)] last:border-0"
                        >
                          <td className="py-2 pl-4 pr-2">
                            <span className="inline-flex items-center gap-2 text-[13px] font-medium text-white">
                              <ClassDot className={row.className} />
                              {row.player}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono-num text-[12px] text-[#c5cdd9]">
                            {row.pullsPresent}×
                          </td>
                          <td className="py-2 px-2 text-right font-mono-num text-[13px] font-semibold text-white">
                            {formatDamage(row.totalDamage)}
                          </td>
                          <td className="py-2 pl-2 pr-4 text-right font-mono-num text-[12.5px] text-[#34f5c5]">
                            {formatDamage(row.avgDamage)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </Card>
    </div>
  )
}

function FragmentRow({
  summary,
  detail,
  isOpen,
  colSpan,
}: {
  summary: React.ReactNode
  detail: React.ReactNode
  isOpen: boolean
  colSpan: number
}) {
  return (
    <>
      {summary}
      {isOpen && (
        <tr className="border-b border-[rgba(255,255,255,0.09)] bg-[rgba(5,9,17,0.7)]">
          <td colSpan={colSpan} className="px-4 py-3">
            {detail}
          </td>
        </tr>
      )}
    </>
  )
}
