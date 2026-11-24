import { Fragment, useMemo, useState } from 'react'
import { ArrowLeftRight, CheckCircle2, ChevronDown, ChevronRight, Egg, Flame, Skull, Users } from 'lucide-react'
import type { ReportData } from '../types'
import { aggregateEggFails, formatDamage, WOW_CLASS_COLORS } from '../lib/stats'
import type { EggCollisionIncident, PullRange } from '../lib/stats'
import {
  Card,
  ClassDot,
  EmptyState,
  KpiCard,
  Pill,
  SubFilterPills,
  WclActionLinks,
} from './ui'

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
  const [subFilter, setSubFilter] = useState<'all' | 'caustic_waves' | 'egg_collision'>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const stats = useMemo(
    () => aggregateEggFails(reports, maxDeaths, pullRange, subFilter),
    [reports, maxDeaths, pullRange, subFilter],
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

  const toggle = (name: string) =>
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))

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
    </div>
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
