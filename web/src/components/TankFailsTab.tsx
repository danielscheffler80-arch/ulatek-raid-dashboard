import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, HeartPulse, Shield, ShieldAlert, Skull } from 'lucide-react'
import type { ReportData } from '../types'
import { aggregateTankFails } from '../lib/stats'
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

export function TankFailsTab({
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
  const [subFilter, setSubFilter] = useState<'all' | 'tentacle_aggro' | 'stone_venom_no_def'>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const allStats = useMemo(
    () => aggregateTankFails(reports, maxDeaths, 'all', pullRange),
    [reports, maxDeaths, pullRange],
  )
  const stats = useMemo(
    () => aggregateTankFails(reports, maxDeaths, subFilter, pullRange),
    [reports, maxDeaths, subFilter, pullRange],
  )

  const q = searchQuery.trim().toLowerCase()
  const filteredTanks = useMemo(() => {
    if (!q) return stats.players
    return stats.players.filter(
      (p) =>
        p.tank.toLowerCase().includes(q) ||
        p.items.some(
          (it) =>
            (it.victim && it.victim.toLowerCase().includes(q)) ||
            `try ${it.pull_num}`.includes(q) ||
            String(it.pull_num) === q,
        ),
    )
  }, [stats.players, q])

  const toggle = (tank: string) =>
    setExpanded((prev) => ({ ...prev, [tank]: !prev[tank] }))

  return (
    <div className="space-y-4">
      <div className="kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Tank Fails gesamt"
          value={stats.total}
          subtext={`Try ${pullRange.from}–${pullRange.to} · max. ${maxDeaths} Tode`}
          icon={<ShieldAlert className="h-4 w-4" strokeWidth={1.75} />}
          tone={stats.total > 0 ? 'destructive' : 'success'}
        />
        <KpiCard
          label="Tentakel-Aggro-Kills"
          value={allStats.tentacleCount}
          subtext="Nicht-Tank durch Gore Rattle Melee getötet"
          icon={<Skull className="h-4 w-4" strokeWidth={1.75} />}
          tone={allStats.tentacleCount > 0 ? 'destructive' : 'success'}
        />
        <KpiCard
          label="Stone Venom < 30% ohne Def"
          value={allStats.stoneVenomCount}
          subtext="Kein eigener Def-CD & kein External aktiv"
          icon={<HeartPulse className="h-4 w-4" strokeWidth={1.75} />}
          tone={allStats.stoneVenomCount > 0 ? 'warning' : 'success'}
        />
        <KpiCard
          label="Tank dadurch gestorben"
          value={allStats.stoneVenomLethalCount}
          subtext={`Von ${allStats.stoneVenomCount} Stone-Venom-Drops < 30%`}
          icon={<Skull className="h-4 w-4" strokeWidth={1.75} />}
          tone={allStats.stoneVenomLethalCount > 0 ? 'destructive' : 'success'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
            <div>
              <h2 className="text-[14px] font-semibold text-white">Tank-Auswertung — Aggro & Stone Venom</h2>
              <p className="text-[12px] text-[#8b96a9]">
                Klicke auf einen Tank für alle Vorfälle inkl. ob der Tank danach gestorben ist, HP-% und Direktlinks.
              </p>
            </div>
            <SubFilterPills
              value={subFilter}
              onChange={setSubFilter}
              options={[
                { value: 'all', label: 'Alle', count: allStats.total },
                { value: 'tentacle_aggro', label: 'Tentakel', count: allStats.tentacleCount },
                { value: 'stone_venom_no_def', label: 'Stone Venom', count: allStats.stoneVenomCount },
              ]}
            />
          </div>

          {filteredTanks.length === 0 ? (
            <EmptyState
              title="Keine Tank Fails im aktuellen Filter"
              description={`In Try ${pullRange.from}–${pullRange.to} (max. ${maxDeaths} Tode) wurden keine Tentakel-Aggro-Tode oder ungeschützten Stone-Venom-Drops unter 30 % HP gefunden.`}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                    <th className="py-2.5 pl-4 pr-2">Tank</th>
                    <th className="py-2.5 px-2 text-right">Gesamt</th>
                    <th className="py-2.5 px-2 text-right">Tentakel</th>
                    <th className="py-2.5 px-2 text-right">Stone Venom</th>
                    <th className="py-2.5 px-2 text-right">Gestorben</th>
                    <th className="py-2.5 pl-2 pr-4 text-right">Tiefste HP</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTanks.map((row) => {
                    const isOpen = !!expanded[row.tank]
                    return (
                      <TankRowView
                        key={row.tank}
                        row={row}
                        isOpen={isOpen}
                        isMultiReport={isMultiReport}
                        onToggle={() => toggle(row.tank)}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-3 self-start">
          <div className="flex items-center gap-2 text-[14px] font-semibold text-white">
            <Shield className="h-4 w-4 text-[#34f5c5]" strokeWidth={1.8} aria-hidden="true" />
            <span>Geprüfte Def-CDs & Externals</span>
          </div>
          <div className="space-y-2.5 text-[11.5px] text-[#c5cdd9] leading-relaxed">
            <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] p-3">
              <div className="font-semibold text-[#00FF98] mb-1">Brewmaster Monk</div>
              Fortifying Brew, Celestial Infusion, Invoke Niuzao, Dampen Harm, Diffuse Magic, Zen Meditation, Exploding Keg.
            </div>
            <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] p-3">
              <div className="font-semibold text-[#f87171] mb-1">Blood Death Knight</div>
              Vampiric Blood, Dancing Rune Weapon, Anti-Magic Shell, Icebound Fortitude, Lichborne, Rune Tap, Tombstone, Purgatory.
            </div>
            <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] p-3">
              <div className="font-semibold text-[#38bdf8] mb-1">Aktive Raid-Externals</div>
              Ironbark, Time Dilation, Guardian Spirit, Pain Suppression, Life Cocoon, Blessing of Sacrifice/Protection, Spirit Link, AMZ, Rewind, Zephyr, Rallying Cry, Darkness, Rescue, Blistering Scales.
            </div>
            <p className="text-[11px] text-[#8b96a9]">
              <strong>Mephitic Thrash</strong>, <strong>Rattler Slam</strong> und passive Auren (z. B. Devotion Aura) werden korrekt ausgeklammert.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

function TankRowView({
  row,
  isOpen,
  isMultiReport,
  onToggle,
}: {
  row: ReturnType<typeof aggregateTankFails>['players'][number]
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
            <span>{row.tank}</span>
            <span className="text-[11px] text-[#8b96a9]">{row.className}</span>
          </button>
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[13px] font-semibold text-white">
          {row.count}×
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[13px]">
          {row.tentacleCount > 0 ? (
            <span className="text-[#f87171] font-semibold">{row.tentacleCount}×</span>
          ) : (
            <span className="text-[#8b96a9]">0</span>
          )}
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[13px]">
          {row.stoneVenomCount > 0 ? (
            <span className="text-[#fbbf24] font-semibold">{row.stoneVenomCount}×</span>
          ) : (
            <span className="text-[#8b96a9]">0</span>
          )}
        </td>
        <td className="py-2.5 px-2 text-right font-mono-num text-[13px]">
          {row.stoneVenomLethalCount > 0 ? (
            <span className="text-[#f87171] font-semibold">{row.stoneVenomLethalCount}×</span>
          ) : (
            <span className="text-[#34f5c5]">0</span>
          )}
        </td>
        <td className="py-2.5 pl-2 pr-4 text-right font-mono-num text-[12px] text-[#c5cdd9]">
          {row.lowestHpPct !== null ? `${row.lowestHpPct.toFixed(1)}%` : '—'}
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
                    {item.kind === 'tentacle_aggro' ? (
                      <>
                        <Pill variant="destructive">Tentakel-Kill: {item.victim}</Pill>
                        {item.other_tank && (
                          <span className="text-[11px] text-[#8b96a9]">
                            (Boss-Tank: {item.other_tank})
                          </span>
                        )}
                        {item.tank_was_dead && <Pill variant="warning">Tank war bereits tot</Pill>}
                      </>
                    ) : (
                      <>
                        <Pill variant="warning">
                          Stone Venom · Min {item.min_hp_pct?.toFixed(1)}% HP
                        </Pill>
                        {item.lethal ? (
                          <Pill variant="destructive">
                            <Skull className="h-3 w-3" aria-hidden="true" />
                            Gestorben{item.death_rel_time ? ` (${item.death_rel_time}` : ''}{item.death_ability ? ` · ${item.death_ability})` : item.death_rel_time ? ')' : ''}
                          </Pill>
                        ) : (
                          <Pill variant="success">Überlebt</Pill>
                        )}
                        {item.stacks !== null && (
                          <span className="font-mono-num text-[11px] text-[#8b96a9]">
                            {item.stacks} Stacks · kein Def-CD/External
                          </span>
                        )}
                        {item.ready_defs && item.ready_defs.length > 0 ? (
                          <Pill variant="destructive">
                            Rdy: {item.ready_defs.join(', ')}
                          </Pill>
                        ) : item.ready_defs ? (
                          <Pill variant="info">Eigene CDs auf CD (External nötig)</Pill>
                        ) : null}
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
