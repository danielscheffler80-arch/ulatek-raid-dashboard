import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flame,
  ShieldAlert,
  Swords,
  Users,
  Zap,
} from 'lucide-react'
import type { ReportData } from '../types'
import {
  aggregateGroupSoaks,
  aggregatePhaseAnalysis,
  formatDamage,
  WOW_CLASS_COLORS,
} from '../lib/stats'
import type { GroupSoakPhaseFilter, PullRange } from '../lib/stats'
import {
  Card,
  ClassDot,
  EmptyState,
  KpiCard,
  Pill,
  SubFilterPills,
  WclActionLinks,
} from './ui'

type PhaseSubTab = 'soaks' | 'overlaps' | 'kicks' | 'warden' | 'avoidables' | 'p3'

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
  const [subTab, setSubTab] = useState<PhaseSubTab>('soaks')
  const [soakPhaseSelection, setSoakPhaseSelection] = useState<GroupSoakPhaseFilter | 'auto'>('auto')
  const [onlyErrorSoaks, setOnlyErrorSoaks] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const stats = useMemo(
    () => aggregatePhaseAnalysis(reports, maxDeaths, pullRange),
    [reports, maxDeaths, pullRange],
  )

  const soakCounts = useMemo(
    () => aggregateGroupSoaks(reports, maxDeaths, pullRange, 'all'),
    [reports, maxDeaths, pullRange],
  )

  const activeSoakPhase: GroupSoakPhaseFilter =
    soakPhaseSelection === 'auto'
      ? soakCounts.shatteringCount > 0
        ? 'shattering'
        : 'p1'
      : soakPhaseSelection

  const soakStats = useMemo(
    () =>
      activeSoakPhase === 'all'
        ? soakCounts
        : aggregateGroupSoaks(reports, maxDeaths, pullRange, activeSoakPhase),
    [reports, maxDeaths, pullRange, activeSoakPhase, soakCounts],
  )

  const q = searchQuery.trim().toLowerCase()
  const matchName = (name: string) => !q || name.toLowerCase().includes(q)
  const toggle = (k: string) => setExpanded((prev) => ({ ...prev, [k]: !prev[k] }))

  const totalAvoidables = stats.p2Avoidables.length + stats.p3Avoidables.length
  const totalMissedKicks = stats.maliceMissed.length + stats.viciousMissed.length
  const totalKicks = stats.maliceKicks.length + stats.viciousKicks.length
  const totalSoakErrors = soakStats.missedAliveTotal + soakStats.wrongGroupTotal
  const visibleSoaks = useMemo(() => {
    return soakStats.soaks.filter((s) => {
      if (onlyErrorSoaks && s.alternation_ok) return false
      if (!q) return true
      return (
        s.expected_group.toLowerCase().includes(q) ||
        s.soakers.some((p) => p.player.toLowerCase().includes(q)) ||
        s.missed_alive.some((p) => p.player.toLowerCase().includes(q)) ||
        s.wrong_group.some((p) => p.player.toLowerCase().includes(q)) ||
        s.dead_expected.some((p) => p.player.toLowerCase().includes(q))
      )
    })
  }, [soakStats.soaks, onlyErrorSoaks, q])

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
              Gruppen-Soaks, Phase 2, Phase 3 &amp; Kick-Forensik
            </h2>
            <p className="text-[12px] text-[#8b96a9]">
              Alternierende Gruppen-Soaks (Intermission: The Shattering &amp; Phase 1), Blight-Vein-Overlaps, Malice-/Vicious-Kicks, Warden DPS &amp; P3-Burn.
            </p>
          </div>
          <SubFilterPills
            value={subTab}
            onChange={setSubTab}
            options={[
              { value: 'soaks', label: 'Gruppen-Soaks', count: soakCounts.totalSoaks },
              { value: 'overlaps', label: 'Blight Vein Overlaps', count: stats.blightOverlaps.length },
              { value: 'kicks', label: 'Kicks & Misses', count: totalKicks + totalMissedKicks },
              { value: 'warden', label: 'Warden DPS & Sync', count: stats.wardenPulls.length },
              { value: 'avoidables', label: 'Avoidables', count: totalAvoidables },
              { value: 'p3', label: 'Phase 3 Burn', count: stats.p3Pulls.length },
            ]}
          />
        </div>

        {/* 0. GRUPPEN-SOAKS (INTERMISSION: THE SHATTERING & PHASE 1) */}
        {subTab === 'soaks' && (
          <div className="p-4 space-y-5">
            {/* Phase Switcher & Error Filter */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[13px] font-semibold text-white">
                  Alternierende Gruppen-Soaks (Soul Constrictor / Spectral Coils)
                </h3>
                <p className="text-[12px] text-[#8b96a9]">
                  {activeSoakPhase === 'shattering'
                    ? 'Intermission: The Shattering — exakt die beiden P2-Warden-Gruppen im strengen Wechsel (#1/#3/#5 vs. #2/#4/#6). Tote Spieler zählen nie als Fail.'
                    : activeSoakPhase === 'p1'
                      ? 'Phase 1 — alternierende 2er-Soak-Gruppen vor Phase 2 (aktiver Boss-Tank wird automatisch aus Verpasst ausgeschlossen).'
                      : 'Alle erkannten Gruppen-Soaks aus Intermission: The Shattering und Phase 1 kombiniert.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SubFilterPills
                  value={activeSoakPhase}
                  onChange={(v) => setSoakPhaseSelection(v)}
                  options={[
                    { value: 'shattering', label: 'Intermission: The Shattering', count: soakCounts.shatteringCount },
                    { value: 'p1', label: 'Phase 1', count: soakCounts.p1Count },
                    { value: 'all', label: 'Alle', count: soakCounts.totalSoaks },
                  ]}
                />
                <button
                  type="button"
                  onClick={() => setOnlyErrorSoaks((v) => !v)}
                  className={`rounded-[8px] border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors active:scale-[0.97] ${
                    onlyErrorSoaks
                      ? 'border-[rgba(239,68,68,0.45)] bg-[rgba(239,68,68,0.14)] text-[#f87171]'
                      : 'border-[rgba(255,255,255,0.1)] bg-[rgba(10,14,22,0.7)] text-[#c5cdd9] hover:border-[rgba(255,255,255,0.2)] hover:text-white'
                  }`}
                >
                  Nur mit Fehlern ({soakStats.totalSoaks - soakStats.cleanSoaks})
                </button>
              </div>
            </div>

            {/* 2-Column Group Roster Banner */}
            {soakStats.groups && (soakStats.groups.group_a_players.length > 0 || soakStats.groups.group_b_players.length > 0) && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {[
                  {
                    label: soakStats.groups.group_a_label,
                    cls: soakStats.groups.group_a_class,
                    members: soakStats.groups.group_a_players,
                  },
                  {
                    label: soakStats.groups.group_b_label,
                    cls: soakStats.groups.group_b_class,
                    members: soakStats.groups.group_b_players,
                  },
                ].map((grp) => (
                  <div
                    key={grp.label}
                    className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.55)] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold">
                        <Users className="h-3.5 w-3.5 text-[#34f5c5]" strokeWidth={1.75} />
                        <GroupNameLabel label={grp.label} tankClass={grp.cls} />
                      </div>
                      <Pill variant="neutral">{grp.members.length} Spieler</Pill>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {grp.members.map((m) => (
                        <span
                          key={m.player}
                          className="inline-flex items-center gap-1.5 rounded-[6px] border border-[rgba(255,255,255,0.08)] bg-[rgba(16,20,27,0.85)] px-2 py-0.5 text-[11.5px] font-medium"
                        >
                          <ClassDot className={m.class} />
                          <span style={{ color: WOW_CLASS_COLORS[m.class] ?? '#e5e7eb' }}>{m.player}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State or Full Analysis */}
            {soakStats.totalSoaks === 0 ? (
              <div className="rounded-[10px] border border-[rgba(56,189,248,0.28)] bg-[rgba(56,189,248,0.07)] px-4 py-3.5 text-[12.5px] text-[#c5cdd9] space-y-1">
                <div className="font-semibold text-white">
                  {activeSoakPhase === 'shattering'
                    ? 'Noch keine „Intermission: The Shattering“-Soaks im gewählten Filter'
                    : 'Keine Gruppen-Soaks im gewählten Filter gefunden'}
                </div>
                <p className="text-[12px] text-[#8b96a9]">
                  {activeSoakPhase === 'shattering'
                    ? 'Kein Try im ausgewählten Zeitraum hat Phase 3 (Intermission: The Shattering) erreicht. Die beiden P2-Warden-Gruppen oben sind bereits hinterlegt und werden automatisch ausgewertet, sobald ein Live- oder Archiv-Log The Shattering erreicht. Über den Schalter „Phase 1“ kannst du bereits die Phase-1-Soaks prüfen.'
                    : 'Erhöhe ggf. den Filter „Max. Tode“ oder wähle einen größeren Try-Bereich.'}
                </p>
              </div>
            ) : (
              <>
                {/* 4 Compact Summary Metrics */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.55)] p-3">
                    <div className="text-[11px] uppercase tracking-wider text-[#8b96a9]">Soaks ausgewertet</div>
                    <div className="mt-1 font-mono-num text-[22px] font-bold text-white">{soakStats.totalSoaks}</div>
                    <div className="text-[11px] text-[#8b96a9]">
                      {totalSoakErrors === 0 ? 'Alle Wechsel fehlerfrei' : `${totalSoakErrors} Abweichungen gesamt`}
                    </div>
                  </div>
                  <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.55)] p-3">
                    <div className="text-[11px] uppercase tracking-wider text-[#8b96a9]">Saubere Soaks</div>
                    <div
                      className={`mt-1 font-mono-num text-[22px] font-bold ${
                        soakStats.cleanRatePct === 100
                          ? 'text-[#34f5c5]'
                          : soakStats.cleanRatePct >= 80
                            ? 'text-[#fbbf24]'
                            : 'text-[#f87171]'
                      }`}
                    >
                      {soakStats.cleanRatePct}%
                    </div>
                    <div className="text-[11px] text-[#8b96a9] font-mono-num">
                      {soakStats.cleanSoaks} / {soakStats.totalSoaks} ohne Fehler
                    </div>
                  </div>
                  <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.55)] p-3">
                    <div className="text-[11px] uppercase tracking-wider text-[#8b96a9]">Verpasst (lebte!)</div>
                    <div
                      className={`mt-1 font-mono-num text-[22px] font-bold ${
                        soakStats.missedAliveTotal > 0 ? 'text-[#f87171]' : 'text-[#34f5c5]'
                      }`}
                    >
                      {soakStats.missedAliveTotal}
                    </div>
                    <div className="text-[11px] text-[#8b96a9]">Tote nicht mitgezählt</div>
                  </div>
                  <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.55)] p-3">
                    <div className="text-[11px] uppercase tracking-wider text-[#8b96a9]">Falscher Soak</div>
                    <div
                      className={`mt-1 font-mono-num text-[22px] font-bold ${
                        soakStats.wrongGroupTotal > 0 ? 'text-[#fbbf24]' : 'text-[#34f5c5]'
                      }`}
                    >
                      {soakStats.wrongGroupTotal}
                    </div>
                    <div className="text-[11px] text-[#8b96a9] font-mono-num">
                      davon {soakStats.doubleSoakTotal}× Doppel-Soak
                    </div>
                  </div>
                </div>

                {/* Per-Player Summary Table */}
                <div>
                  <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#34f5c5]">
                    Spieler-Auswertung ({soakStats.players.filter((p) => matchName(p.player)).length})
                  </h4>
                  <div className="overflow-x-auto rounded-[10px] border border-[rgba(255,255,255,0.08)]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
                          <th className="py-2.5 pl-4 pr-2">Spieler</th>
                          <th className="py-2.5 px-2">Gruppe</th>
                          <th className="py-2.5 px-2 text-right">Korrekt</th>
                          <th className="py-2.5 px-2 text-right text-[#f87171]">Verpasst (lebte!)</th>
                          <th className="py-2.5 px-2 text-right text-[#fbbf24]">Falscher Soak</th>
                          <th className="py-2.5 px-2 text-right">Doppel-Soak</th>
                          <th className="py-2.5 pl-2 pr-4 text-right">Quote</th>
                        </tr>
                      </thead>
                      <tbody>
                        {soakStats.players
                          .filter((r) => matchName(r.player))
                          .map((row) => {
                            const hasDetails = row.incidents.length > 0
                            const isOpen = !!expanded[`gsk-${activeSoakPhase}-${row.player}`]
                            return (
                              <FragmentRow
                                key={row.player}
                                isOpen={isOpen && hasDetails}
                                colSpan={7}
                                summary={
                                  <tr className="border-b border-[rgba(255,255,255,0.05)] last:border-0 hover:bg-[rgba(52,245,197,0.055)] transition-colors">
                                    <td className="py-2 pl-4 pr-2">
                                      {hasDetails ? (
                                        <button
                                          type="button"
                                          onClick={() => toggle(`gsk-${activeSoakPhase}-${row.player}`)}
                                          aria-expanded={isOpen}
                                          className="flex items-center gap-2 text-left text-[13px] font-semibold rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
                                        >
                                          {isOpen ? (
                                            <ChevronDown className="h-3.5 w-3.5 text-[#34f5c5]" />
                                          ) : (
                                            <ChevronRight className="h-3.5 w-3.5 text-[#8b96a9]" />
                                          )}
                                          <ClassDot className={row.className} />
                                          <span style={{ color: WOW_CLASS_COLORS[row.className] ?? '#ffffff' }}>
                                            {row.player}
                                          </span>
                                        </button>
                                      ) : (
                                        <span className="inline-flex items-center gap-2 pl-[22px] text-[13px] font-semibold">
                                          <ClassDot className={row.className} />
                                          <span style={{ color: WOW_CLASS_COLORS[row.className] ?? '#ffffff' }}>
                                            {row.player}
                                          </span>
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2 px-2 text-[12px]">
                                      <GroupNameLabel label={row.groupLabel} tankClass={row.groupClass} />
                                    </td>
                                    <td className="py-2 px-2 text-right font-mono-num text-[13px] text-[#34f5c5]">
                                      {row.correctCount}
                                    </td>
                                    <td className="py-2 px-2 text-right font-mono-num text-[13px]">
                                      {row.missedAliveCount > 0 ? (
                                        <span className="font-semibold text-[#f87171]">{row.missedAliveCount}×</span>
                                      ) : (
                                        <span className="text-[#8b96a9]">0</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-2 text-right font-mono-num text-[13px]">
                                      {row.wrongGroupCount > 0 ? (
                                        <span className="font-semibold text-[#fbbf24]">{row.wrongGroupCount}×</span>
                                      ) : (
                                        <span className="text-[#8b96a9]">0</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-2 text-right font-mono-num text-[12.5px]">
                                      {row.doubleSoakCount > 0 ? (
                                        <span className="font-semibold text-[#f87171]">{row.doubleSoakCount}×</span>
                                      ) : (
                                        <span className="text-[#8b96a9]">0</span>
                                      )}
                                    </td>
                                    <td className="py-2 pl-2 pr-4 text-right font-mono-num text-[12.5px]">
                                      <span
                                        className={
                                          row.soakRatePct === 100
                                            ? 'font-semibold text-[#34f5c5]'
                                            : row.soakRatePct >= 80
                                              ? 'font-semibold text-[#fbbf24]'
                                              : 'font-semibold text-[#f87171]'
                                        }
                                      >
                                        {row.soakRatePct}%
                                      </span>
                                    </td>
                                  </tr>
                                }
                                detail={
                                  <div className="space-y-1.5">
                                    {row.incidents.map((inc) => (
                                      <div
                                        key={`${inc.soak.id}-${inc.kind}`}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[rgba(16,20,27,0.85)] px-3 py-2 text-[12px]"
                                      >
                                        <div className="flex flex-wrap items-center gap-2">
                                          {isMultiReport && <Pill>{inc.soak.reportDate}</Pill>}
                                          <span className="font-mono-num font-semibold text-white">
                                            Try {inc.soak.pull_num} · Soak #{inc.soak.soak_num}
                                          </span>
                                          <span className="font-mono-num text-[#34f5c5]">{inc.soak.rel_time}</span>
                                          <Pill variant="info">
                                            {inc.soak.phase === 'shattering' ? 'The Shattering' : 'Phase 1'}
                                          </Pill>
                                          {inc.kind === 'missed_alive' && (
                                            <Pill variant="destructive">
                                              Verpasst (lebte!) — dran: {inc.soak.expected_group}
                                            </Pill>
                                          )}
                                          {inc.kind === 'wrong_group' && (
                                            <Pill variant={inc.doubleSoak ? 'destructive' : 'warning'}>
                                              {inc.doubleSoak
                                                ? `Falscher Soak (Doppel-Soak!) — dran: ${inc.soak.expected_group}`
                                                : `Falscher Soak — dran: ${inc.soak.expected_group}`}
                                            </Pill>
                                          )}
                                          {inc.kind === 'dead_expected' && (
                                            <Pill variant="neutral">Bereits tot (kein Fail)</Pill>
                                          )}
                                        </div>
                                        <WclActionLinks
                                          eventsUrl={inc.soak.events_url}
                                          replayUrl={inc.soak.replay_url}
                                        />
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
                </div>

                {/* Chronological Soak Timeline per Pull */}
                <div>
                  <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#c5cdd9]">
                    Soak-Chronologie ({visibleSoaks.length} von {soakStats.totalSoaks})
                  </h4>
                  {visibleSoaks.length === 0 ? (
                    <div className="rounded-[10px] border border-[rgba(52,245,197,0.25)] bg-[rgba(52,245,197,0.06)] px-3.5 py-2.5 text-[12px] text-[#34f5c5]">
                      Keine Soaks mit Fehlern im gewählten Filter — alle Wechsel sauber!
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {visibleSoaks.map((s) => (
                        <div
                          key={s.id}
                          className={`rounded-[10px] border px-3.5 py-2.5 text-[12px] space-y-2 ${
                            s.alternation_ok
                              ? 'border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.55)]'
                              : 'border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)]'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {isMultiReport && <Pill>{s.reportDate}</Pill>}
                              <span className="font-mono-num font-semibold text-white">Try {s.pull_num}</span>
                              <Pill variant="neutral">Soak #{s.soak_num}</Pill>
                              <span className="font-mono-num text-[#34f5c5]">{s.rel_time}</span>
                              <Pill variant="info">
                                {s.phase === 'shattering' ? 'The Shattering' : 'Phase 1'}
                              </Pill>
                              <span className="text-[#c5cdd9]">
                                Dran: <GroupNameLabel label={s.expected_group} tankClass={s.expected_group_class} />
                              </span>
                              <span className="font-mono-num text-[11.5px] text-[#8b96a9]">
                                ({s.total_soakers} drin · {s.correct_count} korrekt)
                              </span>
                              {s.alternation_ok ? (
                                <Pill variant="success">
                                  <CheckCircle2 className="mr-1 inline h-3 w-3" />
                                  Sauber
                                </Pill>
                              ) : (
                                <Pill variant="destructive">Abweichung</Pill>
                              )}
                              {s.deaths_before > 0 && (
                                <Pill>nach {s.deaths_before} {s.deaths_before === 1 ? 'Tod' : 'Toden'}</Pill>
                              )}
                            </div>
                            <WclActionLinks eventsUrl={s.events_url} replayUrl={s.replay_url} />
                          </div>

                          {s.missed_alive.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#f87171]">
                                Verpasst (lebte!):
                              </span>
                              {s.missed_alive.map((p) => (
                                <span
                                  key={`ma-${p.player}`}
                                  className="inline-flex items-center gap-1 rounded-[6px] border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.12)] px-2 py-0.5 text-[11.5px] font-medium"
                                >
                                  <ClassDot className={p.class} />
                                  <span style={{ color: WOW_CLASS_COLORS[p.class] ?? '#ffffff' }}>{p.player}</span>
                                </span>
                              ))}
                            </div>
                          )}

                          {s.wrong_group.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#fbbf24]">
                                Falscher Soak:
                              </span>
                              {s.wrong_group.map((p) => (
                                <span
                                  key={`wg-${p.player}`}
                                  className={`inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-0.5 text-[11.5px] font-medium ${
                                    p.double_soak
                                      ? 'border-[rgba(239,68,68,0.45)] bg-[rgba(239,68,68,0.16)]'
                                      : 'border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.12)]'
                                  }`}
                                >
                                  <ClassDot className={p.class} />
                                  <span style={{ color: WOW_CLASS_COLORS[p.class] ?? '#ffffff' }}>{p.player}</span>
                                  {p.double_soak && (
                                    <span className="text-[10px] font-bold uppercase text-[#f87171]">Doppel-Soak!</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}

                          {s.dead_expected.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#8b96a9]">
                              <span>Bereits tot (kein Fail):</span>
                              {s.dead_expected.map((p) => (
                                <span key={`de-${p.player}`} className="inline-flex items-center gap-1">
                                  <ClassDot className={p.class} />
                                  <span>{p.player}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

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

        {/* 2. KICKS & MISSED CASTS (NACH GRUPPEN/SEITEN AUFGETEILT — NUR KICKS & RDY BEI DURCHGEGANGENEM CAST) */}
        {subTab === 'kicks' && (
          <div className="p-4 space-y-5">
            {/* Grouped Kick Statistics by Side (Barrumir Seite vs. Betøng Seite) */}
            <div>
              <h3 className="mb-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-[#34f5c5]">
                Kicks nach Gruppe / Seite ({totalKicks} Kicks · {totalMissedKicks} durch)
              </h3>
              {stats.kickGroups.length === 0 ? (
                <div className="text-[12px] text-[#8b96a9]">
                  Keine Malice-/Vicious-Echoes-Kicks im gewählten Filter.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {stats.kickGroups.map((grp) => {
                    const visiblePlayers = grp.players.filter((p) => matchName(p.player))
                    return (
                      <div
                        key={grp.side}
                        className="overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.55)]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.8)] px-3.5 py-2.5">
                          <div className="text-[13px] font-semibold">
                            <SideLabel side={grp.side} tankClass={grp.tankClass} />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Pill variant="success">{grp.totalKicks}× gekickt</Pill>
                            <Pill variant={grp.missedCasts > 0 ? 'destructive' : 'neutral'}>
                              {grp.missedCasts}× durch
                            </Pill>
                          </div>
                        </div>

                        {visiblePlayers.length === 0 ? (
                          <div className="px-3.5 py-3 text-[12px] text-[#8b96a9]">
                            Keine Kicks oder verpassten Casts mit bereitem Kick auf dieser Seite.
                          </div>
                        ) : (
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-[rgba(255,255,255,0.06)] text-[10.5px] font-medium uppercase tracking-wider text-[#8b96a9]">
                                <th className="py-2 pl-3.5 pr-2">Spieler</th>
                                <th className="py-2 px-2 text-right">Gekickt</th>
                                {grp.missedCasts > 0 && (
                                  <th className="py-2 px-2 text-right text-[#f87171]">
                                    Rdy (Cast durch)
                                  </th>
                                )}
                                <th className="py-2 pl-2 pr-3.5 text-right">Trys</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visiblePlayers.map((row) => (
                                <tr
                                  key={`${grp.side}-${row.player}`}
                                  className="border-b border-[rgba(255,255,255,0.05)] last:border-0 hover:bg-[rgba(52,245,197,0.055)] transition-colors"
                                >
                                  <td className="py-2 pl-3.5 pr-2">
                                    <span className="inline-flex items-center gap-2 text-[13px] font-semibold">
                                      <ClassDot className={row.className} />
                                      <span style={{ color: WOW_CLASS_COLORS[row.className] ?? '#ffffff' }}>
                                        {row.player}
                                      </span>
                                    </span>
                                  </td>
                                  <td className="py-2 px-2 text-right font-mono-num text-[13px]">
                                    {row.kicks > 0 ? (
                                      <span className="font-semibold text-[#34f5c5]">{row.kicks}×</span>
                                    ) : (
                                      <span className="text-[#8b96a9]">0</span>
                                    )}
                                  </td>
                                  {grp.missedCasts > 0 && (
                                    <td className="py-2 px-2 text-right font-mono-num text-[13px]">
                                      {row.missedReady > 0 ? (
                                        <span className="font-semibold text-[#f87171]">
                                          {row.missedReady}×
                                        </span>
                                      ) : (
                                        <span className="text-[#34f5c5]">0</span>
                                      )}
                                    </td>
                                  )}
                                  <td className="py-2 pl-2 pr-3.5 text-right font-mono-num text-[11.5px] text-[#8b96a9]">
                                    {row.pulls.map((p) => `Try ${p}`).join(', ')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Missed Casts with per-side Ready Kickers */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[12.5px] font-semibold uppercase tracking-wider text-[#f87171]">
                  Durchgekommene Casts &amp; wer seinen Kick rdy hatte ({totalMissedKicks})
                </h3>
              </div>
              {totalMissedKicks === 0 ? (
                <div className="rounded-[10px] border border-[rgba(52,245,197,0.25)] bg-[rgba(52,245,197,0.06)] px-3.5 py-2.5 text-[12px] text-[#34f5c5]">
                  Kein Malice- oder Vicious-Echoes-Cast bei ≤ {maxDeaths} Toden durchgekommen.
                  {stats.unfilteredMissedInRange > 0 && (
                    <span className="ml-1.5 text-[#c5cdd9]">
                      (Hinweis: Im gewählten Try-Bereich gibt es <strong className="text-white">{stats.unfilteredMissedInRange}</strong> durchgekommene Casts bei &gt; {maxDeaths} Toden — erhöhe „Max. Tode“ in der Sidebar, um sie anzuzeigen.)
                    </span>
                  )}
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
                            {item.side && (
                              <Pill>
                                <SideLabel
                                  side={item.side}
                                  tankClass={item.side_tank_class || stats.kickSideTankClass[item.side]}
                                />
                              </Pill>
                            )}
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
                                <span
                                  className="font-semibold"
                                  style={{ color: WOW_CLASS_COLORS[k.class] ?? '#ffffff' }}
                                >
                                  {k.player}
                                </span>
                                <span className="text-[#fca5a5]">({k.spell})</span>
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
                                <span style={{ color: WOW_CLASS_COLORS[k.class] ?? '#c5cdd9' }}>
                                  {k.player}
                                </span>
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

            {/* Chronological successful kicks (clean — no unused-ready noise) */}
            {totalKicks > 0 && (
              <div className="space-y-2">
                <div className="text-[11.5px] font-semibold uppercase tracking-wider text-[#8b96a9]">
                  Einzelne Kicks ({totalKicks})
                </div>
                {[...stats.maliceKicks, ...stats.viciousKicks].map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[rgba(16,20,27,0.8)] px-3 py-2 text-[12px]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {isMultiReport && <Pill>{item.reportDate}</Pill>}
                      <span className="font-mono-num font-semibold text-white">Try {item.pull_num}</span>
                      <span className="font-mono-num text-[#34f5c5]">{item.rel_time}</span>
                      {item.side && (
                        <Pill>
                          <SideLabel
                            side={item.side}
                            tankClass={item.side_tank_class || stats.kickSideTankClass[item.side]}
                          />
                        </Pill>
                      )}
                      <Pill variant="success">
                        <ClassDot className={item.class} />
                        <span
                          className="font-semibold"
                          style={{ color: WOW_CLASS_COLORS[item.class] ?? '#34f5c5' }}
                        >
                          {item.player}
                        </span>
                        <span>gekickt ({item.detail})</span>
                      </Pill>
                    </div>
                    <WclActionLinks eventsUrl={item.events_url} replayUrl={item.replay_url} />
                  </div>
                ))}
              </div>
            )}

            <p className="text-[11px] text-[#8b96a9]">
              Seiten-Zuordnung pro Try erfolgt automatisch anhand des Schadens auf den jeweiligen <strong className="text-[#c5cdd9]">Doomscale Warden</strong> (benannt nach dem Tank der Seite). Es werden ausschließlich ausgeführte Kicks sowie bereite Kicks bei tatsächlich durchgegangenen Casts gelistet.
            </p>
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

function GroupNameLabel({ label, tankClass }: { label: string; tankClass?: string }) {
  if (label.startsWith('Gruppe ')) {
    const tankName = label.slice('Gruppe '.length)
    const color = tankClass ? WOW_CLASS_COLORS[tankClass] : undefined
    return (
      <span>
        <span className="text-[#c5cdd9]">Gruppe</span>{' '}
        <span style={color ? { color } : undefined} className="font-semibold">
          {tankName}
        </span>
      </span>
    )
  }
  return <span className="font-semibold text-white">{label}</span>
}

function SideLabel({ side, tankClass }: { side: string; tankClass?: string }) {
  if (side.endsWith(' Seite')) {
    const tankName = side.slice(0, -' Seite'.length)
    const color = tankClass ? WOW_CLASS_COLORS[tankClass] : undefined
    return (
      <span>
        <span style={color ? { color } : undefined} className="font-semibold">
          {tankName}
        </span>{' '}
        <span className="text-[#c5cdd9]">Seite</span>
      </span>
    )
  }
  return <span>{side}</span>
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
