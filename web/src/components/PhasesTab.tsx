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
import type { PhaseViewKey, ReportData, SoakGroupDefinition } from '../types'
import {
  aggregateGroupSoaks,
  aggregatePhaseAnalysis,
  formatDamage,
  getLatestP2Groups,
  WOW_CLASS_COLORS,
} from '../lib/stats'
import type { PullRange } from '../lib/stats'
import {
  Card,
  ClassDot,
  EmptyState,
  KpiCard,
  Pill,
  WclActionLinks,
} from './ui'

const VIEW_META: Record<PhaseViewKey, { title: string; subtitle: string }> = {
  p1_soaks: {
    title: 'Phase 1 — Alternierende Gruppen-Soaks',
    subtitle:
      'Soul Constrictor / Spectral Coils in Phase 1 im 2er-Gruppen-Wechsel. Der aktive Boss-Tank wird automatisch ausgenommen.',
  },
  intermission_soaks: {
    title: 'Intermission: The Shattering — Gruppen-Soaks',
    subtitle:
      'Die 6 alternierenden Spectral-Coils-Soaks (#1/#3/#5 vs. #2/#4/#6) mit exakt den beiden P2-Warden-Gruppen. Tote Spieler zählen nie als Fail.',
  },
  p2_overlaps: {
    title: 'Phase 2 — Blight Vein Overlaps',
    subtitle:
      'Grasping Fangs, die ≤ 2,5 s nach einem anderen Spieler gebrochen wurden — aufgeteilt in beide P2-Gruppen.',
  },
  p2_kicks: {
    title: 'Phase 2 — Malice Kicks & verpasste Casts',
    subtitle:
      'Ausgeführte Malice-Kicks und bereite Kicks bei durchgegangenen Casts — getrennt nach Barrumir- und Betøng-Seite.',
  },
  p2_warden: {
    title: 'Phase 2 — Doomscale Warden Fokus-DPS & Kill-Sync',
    subtitle:
      'Warden-Schaden pro Seite/Gruppe im direkten Vergleich sowie Kill-Sync-Abstand beider Wardens pro P2-Try.',
  },
  p2_avoidables: {
    title: 'Phase 2 — Vermeidbare Treffer',
    subtitle:
      'Acidic Burst, Acidic Expulsion, Petrifying Sting & Virulent Spit — aufgeteilt nach P2-Gruppen.',
  },
  p3_burn: {
    title: 'Phase 3 — Boss-Burn & Execute-Schaden',
    subtitle: "Schaden auf Ula'tek in Phase 3 (Stage Three: Ula'tek's Ascension) pro Spieler und P3-Try.",
  },
  p3_kicks: {
    title: 'Phase 3 — Vicious Echoes Kicks & Misses',
    subtitle: 'Ausgeführte Kicks auf Vicious Echoes sowie bereite Kicks bei durchgegangenen Raid-Stuns.',
  },
  p3_avoidables: {
    title: 'Phase 3 — Vermeidbare Treffer',
    subtitle: "Treffer durch Serpent's Bite und Volatile Purge in Phase 3.",
  },
}

export function PhasesTab({
  reports,
  isMultiReport,
  searchQuery,
  maxDeaths,
  pullRange,
  view,
}: {
  reports: ReportData[]
  isMultiReport: boolean
  searchQuery: string
  maxDeaths: number
  pullRange: PullRange
  view: PhaseViewKey
}) {
  const [onlyErrorSoaks, setOnlyErrorSoaks] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const stats = useMemo(
    () => aggregatePhaseAnalysis(reports, maxDeaths, pullRange),
    [reports, maxDeaths, pullRange],
  )

  const p2Groups = useMemo(() => getLatestP2Groups(reports), [reports])

  const activeSoakPhase = view === 'intermission_soaks' ? 'shattering' : 'p1'
  const soakStats = useMemo(
    () => aggregateGroupSoaks(reports, maxDeaths, pullRange, activeSoakPhase),
    [reports, maxDeaths, pullRange, activeSoakPhase],
  )

  const q = searchQuery.trim().toLowerCase()
  const matchName = (name: string) => !q || name.toLowerCase().includes(q)
  const toggle = (k: string) => setExpanded((prev) => ({ ...prev, [k]: !prev[k] }))

  const isSoakView = view === 'p1_soaks' || view === 'intermission_soaks'
  const isP2View =
    view === 'p2_overlaps' ||
    view === 'p2_kicks' ||
    view === 'p2_warden' ||
    view === 'p2_avoidables'
  const isP3View = view === 'p3_burn' || view === 'p3_kicks' || view === 'p3_avoidables'

  const scopedKicks = view === 'p3_kicks' ? stats.viciousKicks : stats.maliceKicks
  const scopedMissed = view === 'p3_kicks' ? stats.viciousMissed : stats.maliceMissed
  const scopedKickGroups = useMemo(() => {
    if (view === 'p3_kicks') return stats.kickGroups.filter((g) => g.side === 'Phase 3')
    return stats.kickGroups.filter((g) => g.side !== 'Phase 3')
  }, [stats.kickGroups, view])

  const scopedAvoidablePlayers = useMemo(() => {
    const targetPhase = view === 'p3_avoidables' ? 'p3' : 'p2'
    return stats.avoidablePlayers
      .map((row) => {
        const items = row.items.filter((it) => it.phase === targetPhase)
        return {
          ...row,
          items,
          count: items.length,
          lethalCount: items.filter((it) => it.lethal).length,
          totalDamage: items.reduce((s, it) => s + it.damage, 0),
        }
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count || b.totalDamage - a.totalDamage || a.player.localeCompare(b.player))
  }, [stats.avoidablePlayers, view])

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

  const meta = VIEW_META[view]

  return (
    <div className="space-y-4">
      {/* Phase-specific KPI Row */}
      {isSoakView && (
        <div className="kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label={view === 'intermission_soaks' ? 'Shattering Soaks' : 'Phase-1 Soaks'}
            value={soakStats.totalSoaks}
            subtext={
              totalSoakErrors === 0
                ? 'Alle Wechsel fehlerfrei'
                : `${totalSoakErrors} Abweichungen gesamt`
            }
            icon={<Users className="h-4 w-4" strokeWidth={1.75} />}
            tone="default"
          />
          <KpiCard
            label="Saubere Soaks"
            value={`${soakStats.cleanRatePct}%`}
            subtext={`${soakStats.cleanSoaks} / ${soakStats.totalSoaks} ohne Fehler`}
            icon={<CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />}
            tone={soakStats.cleanRatePct === 100 ? 'success' : soakStats.cleanRatePct >= 80 ? 'warning' : 'destructive'}
          />
          <KpiCard
            label="Verpasst (lebte!)"
            value={soakStats.missedAliveTotal}
            subtext={
              view === 'p1_soaks' && soakStats.bossTankExemptTotal > 0
                ? `Tote & ${soakStats.bossTankExemptTotal}× Boss-Tank ausgenommen`
                : 'Tote Spieler nie mitgezählt'
            }
            icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.75} />}
            tone={soakStats.missedAliveTotal > 0 ? 'destructive' : 'success'}
          />
          <KpiCard
            label="Falscher Soak"
            value={soakStats.wrongGroupTotal}
            subtext={`davon ${soakStats.doubleSoakTotal}× Doppel-Soak`}
            icon={<ShieldAlert className="h-4 w-4" strokeWidth={1.75} />}
            tone={soakStats.wrongGroupTotal > 0 ? 'warning' : 'success'}
          />
        </div>
      )}

      {isP2View && (
        <div className="kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Blight Vein Overlaps (P2)"
            value={stats.blightOverlaps.length}
            subtext="Grasping Fangs ≤ 2,5 s nacheinander gebrochen"
            icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.75} />}
            tone={stats.blightOverlaps.length > 0 ? 'destructive' : 'success'}
          />
          <KpiCard
            label="Malice Kicks vs. Durch"
            value={`${stats.maliceKicks.length} / ${stats.maliceMissed.length}`}
            subtext="Nur ausgeführte Kicks & verpasste Casts"
            icon={<Zap className="h-4 w-4" strokeWidth={1.75} />}
            tone={stats.maliceMissed.length > 0 ? 'destructive' : 'success'}
          />
          <KpiCard
            label="P2 Avoidable Hits"
            value={stats.p2Avoidables.length}
            subtext="Acidic Burst/Expulsion, Petrifying Sting, Spit"
            icon={<ShieldAlert className="h-4 w-4" strokeWidth={1.75} />}
            tone={stats.p2Avoidables.length > 0 ? 'warning' : 'success'}
          />
          <KpiCard
            label="Phase-2 Warden-Trys"
            value={stats.wardenPulls.length}
            subtext={`Try ${pullRange.from}–${pullRange.to} · max. ${maxDeaths} Tode`}
            icon={<Swords className="h-4 w-4" strokeWidth={1.75} />}
            tone="default"
          />
        </div>
      )}

      {isP3View && (
        <div className="kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Phase-3 Trys"
            value={stats.p3Pulls.length}
            subtext={`Try ${pullRange.from}–${pullRange.to} · max. ${maxDeaths} Tode`}
            icon={<Flame className="h-4 w-4" strokeWidth={1.75} />}
            tone="default"
          />
          <KpiCard
            label="Vicious Echoes Kicks"
            value={`${stats.viciousKicks.length} / ${stats.viciousMissed.length}`}
            subtext="Gekickt vs. durchgekommene Raid-Stuns"
            icon={<Zap className="h-4 w-4" strokeWidth={1.75} />}
            tone={stats.viciousMissed.length > 0 ? 'destructive' : 'success'}
          />
          <KpiCard
            label="P3 Avoidable Hits"
            value={stats.p3Avoidables.length}
            subtext="Serpent's Bite & Volatile Purge"
            icon={<ShieldAlert className="h-4 w-4" strokeWidth={1.75} />}
            tone={stats.p3Avoidables.length > 0 ? 'warning' : 'success'}
          />
          <KpiCard
            label="P3 Boss-Schaden gesamt"
            value={formatDamage(stats.p3Pulls.reduce((s, p) => s + p.total_boss_dmg, 0))}
            subtext="Stage Three: Ula'tek's Ascension"
            icon={<Swords className="h-4 w-4" strokeWidth={1.75} />}
            tone="default"
          />
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold text-white">{meta.title}</h2>
            <p className="text-[12px] text-[#8b96a9]">{meta.subtitle}</p>
          </div>
          {isSoakView && soakStats.totalSoaks > 0 && (
            <button
              type="button"
              onClick={() => setOnlyErrorSoaks((v) => !v)}
              className={`rounded-[8px] border px-2.5 py-1.5 text-[11.5px] font-medium transition-[background-color,border-color,color,transform] active:scale-[0.96] ${
                onlyErrorSoaks
                  ? 'border-[rgba(239,68,68,0.45)] bg-[rgba(239,68,68,0.14)] text-[#f87171]'
                  : 'border-[rgba(255,255,255,0.1)] bg-[rgba(10,14,22,0.7)] text-[#c5cdd9] hover:border-[rgba(255,255,255,0.2)] hover:text-white'
              }`}
            >
              Nur Soaks mit Fehlern ({soakStats.totalSoaks - soakStats.cleanSoaks})
            </button>
          )}
        </div>

        {/* 0. GRUPPEN-SOAKS (P1 SOAKS ODER INTERMISSION: THE SHATTERING) */}
        {isSoakView && (
          <div className="p-4 space-y-5">
            {/* 2-Column Group Roster Banner (shown when 0 soaks exist so P2 groups are immediately visible) */}
            {soakStats.totalSoaks === 0 &&
              soakStats.groups &&
              (soakStats.groups.group_a_players.length > 0 || soakStats.groups.group_b_players.length > 0) && (
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
                    : 'Keine Phase-1-Gruppen-Soaks im gewählten Filter gefunden'}
                </div>
                <p className="text-[12px] text-[#8b96a9]">
                  {activeSoakPhase === 'shattering'
                    ? 'Kein Try im ausgewählten Zeitraum hat Phase 3 (Intermission: The Shattering) erreicht. Die beiden P2-Warden-Gruppen oben sind bereits hinterlegt und werden automatisch ausgewertet, sobald ein Live- oder Archiv-Log The Shattering erreicht.'
                    : 'Erhöhe ggf. den Filter „Max. Tode“ oder wähle einen größeren Try-Bereich.'}
                </p>
              </div>
            ) : (
              <>
                {/* Per-Group Split Player Summary Tables (each group gets its own table) */}
                <div>
                  <h4 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-[#34f5c5]">
                    Spieler-Auswertung nach Gruppe ({soakStats.players.filter((p) => matchName(p.player)).length})
                  </h4>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {soakStats.groupTables.map((grp) => {
                      const visibleRows = grp.players.filter((r) => matchName(r.player))
                      return (
                        <div
                          key={grp.label}
                          className="overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.55)]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.8)] px-3.5 py-2.5">
                            <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
                              <Users className="h-3.5 w-3.5 text-[#34f5c5]" strokeWidth={1.75} />
                              <GroupNameLabel label={grp.label} tankClass={grp.tankClass} />
                              <span className="font-mono-num text-[11px] font-normal text-[#8b96a9]">
                                ({visibleRows.length})
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Pill variant={grp.totalMissedAlive > 0 ? 'destructive' : 'success'}>
                                {grp.totalMissedAlive}× verpasst
                              </Pill>
                              <Pill variant={grp.totalWrongGroup > 0 ? 'warning' : 'neutral'}>
                                {grp.totalWrongGroup}× falsch
                              </Pill>
                            </div>
                          </div>

                          {visibleRows.length === 0 ? (
                            <div className="px-3.5 py-3 text-[12px] text-[#8b96a9]">
                              Keine Spieler im aktuellen Suchfilter.
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-[rgba(255,255,255,0.06)] text-[10.5px] font-medium uppercase tracking-wider text-[#8b96a9]">
                                    <th className="py-2 pl-3.5 pr-2">Spieler</th>
                                    <th className="py-2 px-1.5 text-right">Korrekt</th>
                                    <th className="py-2 px-1.5 text-right text-[#f87171]">Verpasst</th>
                                    <th className="py-2 px-1.5 text-right text-[#fbbf24]">Falsch</th>
                                    <th className="py-2 pl-1.5 pr-3.5 text-right">Quote</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {visibleRows.map((row) => {
                                    const hasDetails = row.incidents.length > 0
                                    const isOpen = !!expanded[`gsk-${activeSoakPhase}-${grp.label}-${row.player}`]
                                    return (
                                      <FragmentRow
                                        key={`${grp.label}-${row.player}`}
                                        isOpen={isOpen && hasDetails}
                                        colSpan={5}
                                        summary={
                                          <tr className="border-b border-[rgba(255,255,255,0.05)] last:border-0 hover:bg-[rgba(52,245,197,0.055)] transition-colors">
                                            <td className="py-2 pl-3.5 pr-2">
                                              <div className="flex flex-wrap items-center gap-1.5">
                                                {hasDetails ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => toggle(`gsk-${activeSoakPhase}-${grp.label}-${row.player}`)}
                                                    aria-expanded={isOpen}
                                                    className="flex items-center gap-1.5 text-left text-[13px] font-semibold rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
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
                                                  <span className="inline-flex items-center gap-1.5 pl-[20px] text-[13px] font-semibold">
                                                    <ClassDot className={row.className} />
                                                    <span style={{ color: WOW_CLASS_COLORS[row.className] ?? '#ffffff' }}>
                                                      {row.player}
                                                    </span>
                                                  </span>
                                                )}
                                                {row.bossTankExemptCount > 0 && (
                                                  <span
                                                    title="Soaks, in denen der Tank aktiv Ula'tek tankte (ausgenommen)"
                                                    className="rounded border border-[rgba(56,189,248,0.3)] bg-[rgba(56,189,248,0.1)] px-1.5 py-0.5 font-mono-num text-[10px] text-[#38bdf8]"
                                                  >
                                                    {row.bossTankExemptCount}× Boss-Tank
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="py-2 px-1.5 text-right font-mono-num text-[12.5px] text-[#34f5c5]">
                                              {row.correctCount}
                                            </td>
                                            <td className="py-2 px-1.5 text-right font-mono-num text-[12.5px]">
                                              {row.missedAliveCount > 0 ? (
                                                <span className="font-semibold text-[#f87171]">{row.missedAliveCount}×</span>
                                              ) : (
                                                <span className="text-[#8b96a9]">0</span>
                                              )}
                                            </td>
                                            <td className="py-2 px-1.5 text-right font-mono-num text-[12.5px]">
                                              {row.wrongGroupCount > 0 ? (
                                                <span className="font-semibold text-[#fbbf24]">
                                                  {row.wrongGroupCount}×
                                                  {row.doubleSoakCount > 0 && (
                                                    <span className="ml-1 text-[10.5px] text-[#f87171]">
                                                      ({row.doubleSoakCount}× Dpl)
                                                    </span>
                                                  )}
                                                </span>
                                              ) : (
                                                <span className="text-[#8b96a9]">0</span>
                                              )}
                                            </td>
                                            <td className="py-2 pl-1.5 pr-3.5 text-right font-mono-num text-[12.5px]">
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
                          )}
                        </div>
                      )
                    })}
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

                          {(s.dead_expected.length > 0 || s.boss_tank_exempt) && (
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#8b96a9]">
                              {s.boss_tank_exempt && (
                                <span className="inline-flex items-center gap-1.5 text-[#38bdf8]">
                                  <span>Boss-Tank (ausgenommen):</span>
                                  <ClassDot className={s.boss_tank_exempt.class} />
                                  <span style={{ color: WOW_CLASS_COLORS[s.boss_tank_exempt.class] ?? '#38bdf8' }}>
                                    {s.boss_tank_exempt.player}
                                  </span>
                                </span>
                              )}
                              {s.dead_expected.length > 0 && (
                                <span className="inline-flex flex-wrap items-center gap-1.5">
                                  <span>Bereits tot (kein Fail):</span>
                                  {s.dead_expected.map((p) => (
                                    <span key={`de-${p.player}`} className="inline-flex items-center gap-1">
                                      <ClassDot className={p.class} />
                                      <span>{p.player}</span>
                                    </span>
                                  ))}
                                </span>
                              )}
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

        {/* 1. BLIGHT VEIN OVERLAPS (NACH P2-GRUPPEN GESPLITTET) */}
        {view === 'p2_overlaps' && (
          stats.blightOverlapPlayers.filter((r) => matchName(r.player)).length === 0 ? (
            <EmptyState
              title="Keine Blight-Vein-Overlaps im aktuellen Filter"
              description="Entweder wurden alle Grasping Fangs sauber zeitversetzt (> 2,5 s) gebrochen oder kein Try im Filter erreichte P2."
            />
          ) : (
            <div className="p-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {splitRowsByP2Group(
                  stats.blightOverlapPlayers.filter((r) => matchName(r.player)),
                  p2Groups,
                ).map((grp) => {
                  const grpCount = grp.rows.reduce((s, r) => s + r.count, 0)
                  return (
                    <div
                      key={grp.label}
                      className="overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.55)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.8)] px-3.5 py-2.5">
                        <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
                          <Users className="h-3.5 w-3.5 text-[#34f5c5]" strokeWidth={1.75} />
                          <GroupNameLabel label={grp.label} tankClass={grp.tankClass} />
                        </div>
                        <Pill variant={grpCount > 0 ? 'destructive' : 'success'}>
                          {grpCount}× Overlap{grpCount === 1 ? '' : 's'}
                        </Pill>
                      </div>
                      {grp.rows.length === 0 ? (
                        <div className="px-3.5 py-3 text-[12px] text-[#34f5c5]">
                          Keine Blight-Vein-Overlaps in dieser Gruppe.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-[rgba(255,255,255,0.06)] text-[10.5px] font-medium uppercase tracking-wider text-[#8b96a9]">
                                <th className="py-2 pl-3.5 pr-2">Spieler (zu früh gebrochen)</th>
                                <th className="py-2 px-2 text-right">Overlaps</th>
                                <th className="py-2 pl-2 pr-3.5 text-right">Kürzester Abstand</th>
                              </tr>
                            </thead>
                            <tbody>
                              {grp.rows.map((row) => {
                                const isOpen = !!expanded[`bvo-${grp.label}-${row.player}`]
                                const minGap = Math.min(...row.items.map((i) => i.gap_ms ?? 9999))
                                return (
                                  <FragmentRow
                                    key={row.player}
                                    isOpen={isOpen}
                                    colSpan={3}
                                    summary={
                                      <tr className="border-b border-[rgba(255,255,255,0.05)] last:border-0 hover:bg-[rgba(52,245,197,0.055)] transition-colors">
                                        <td className="py-2 pl-3.5 pr-2">
                                          <button
                                            type="button"
                                            onClick={() => toggle(`bvo-${grp.label}-${row.player}`)}
                                            aria-expanded={isOpen}
                                            className="flex items-center gap-1.5 text-left text-[13px] font-semibold rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
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
                                        </td>
                                        <td className="py-2 px-2 text-right font-mono-num text-[13px] font-semibold text-[#f87171]">
                                          {row.count}×
                                        </td>
                                        <td className="py-2 pl-2 pr-3.5 text-right font-mono-num text-[12px] text-[#fbbf24]">
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
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}

        {/* 2. KICKS & MISSED CASTS (P2 MALICE ODER P3 VICIOUS ECHOES) */}
        {(view === 'p2_kicks' || view === 'p3_kicks') && (
          <div className="p-4 space-y-5">
            {/* Grouped Kick Statistics by Side */}
            <div>
              <h3 className="mb-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-[#34f5c5]">
                {view === 'p3_kicks' ? 'Vicious Echoes Kicks (Phase 3)' : 'Malice Kicks nach Gruppe / Seite'} ({scopedKicks.length} Kicks · {scopedMissed.length} durch)
              </h3>
              {scopedKickGroups.length === 0 ? (
                <div className="text-[12px] text-[#8b96a9]">
                  {view === 'p3_kicks'
                    ? 'Noch keine Phase-3-Trys / Vicious-Echoes-Kicks im gewählten Filter.'
                    : 'Keine Malice-Kicks im gewählten Filter.'}
                </div>
              ) : (
                <div className={`grid grid-cols-1 gap-4 ${view === 'p3_kicks' ? '' : 'lg:grid-cols-2'}`}>
                  {scopedKickGroups.map((grp) => {
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
                  Durchgekommene Casts &amp; wer seinen Kick rdy hatte ({scopedMissed.length})
                </h3>
              </div>
              {scopedMissed.length === 0 ? (
                <div className="rounded-[10px] border border-[rgba(52,245,197,0.25)] bg-[rgba(52,245,197,0.06)] px-3.5 py-2.5 text-[12px] text-[#34f5c5]">
                  Kein {view === 'p3_kicks' ? 'Vicious-Echoes' : 'Malice'}-Cast bei ≤ {maxDeaths} Toden durchgekommen.
                  {view === 'p2_kicks' && stats.unfilteredMissedInRange > 0 && (
                    <span className="ml-1.5 text-[#c5cdd9]">
                      (Hinweis: Im gewählten Try-Bereich gibt es <strong className="text-white">{stats.unfilteredMissedInRange}</strong> durchgekommene Casts bei &gt; {maxDeaths} Toden — erhöhe „Max. Tode“ in der Sidebar, um sie anzuzeigen.)
                    </span>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {scopedMissed.map((item) => {
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
            {scopedKicks.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11.5px] font-semibold uppercase tracking-wider text-[#8b96a9]">
                  Einzelne Kicks ({scopedKicks.length})
                </div>
                {scopedKicks.map((item) => (
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
        {view === 'p2_warden' && (
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

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {splitRowsByP2Group(
                  stats.wardenPlayers.filter((r) => matchName(r.player)),
                  p2Groups,
                ).map((grp) => {
                  const grpTotalDmg = grp.rows.reduce((s, r) => s + r.totalDamage, 0)
                  return (
                    <div
                      key={grp.label}
                      className="overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.55)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.8)] px-3.5 py-2.5">
                        <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
                          <Users className="h-3.5 w-3.5 text-[#34f5c5]" strokeWidth={1.75} />
                          <GroupNameLabel label={grp.label} tankClass={grp.tankClass} />
                        </div>
                        <Pill variant="info">Gesamt: {formatDamage(grpTotalDmg)}</Pill>
                      </div>
                      {grp.rows.length === 0 ? (
                        <div className="px-3.5 py-3 text-[12px] text-[#8b96a9]">
                          Kein Warden-Schaden im Filter für diese Gruppe.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-[rgba(255,255,255,0.06)] text-[10.5px] font-medium uppercase tracking-wider text-[#8b96a9]">
                                <th className="py-2 pl-3.5 pr-2">Spieler</th>
                                <th className="py-2 px-1.5 text-right">Trys</th>
                                <th className="py-2 px-1.5 text-right">Gesamt</th>
                                <th className="py-2 pl-1.5 pr-3.5 text-right">Ø / Try</th>
                              </tr>
                            </thead>
                            <tbody>
                              {grp.rows.map((row) => (
                                <tr
                                  key={row.player}
                                  className="border-b border-[rgba(255,255,255,0.05)] last:border-0 hover:bg-[rgba(52,245,197,0.055)] transition-colors"
                                >
                                  <td className="py-2 pl-3.5 pr-2">
                                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
                                      <ClassDot className={row.className} />
                                      <span style={{ color: WOW_CLASS_COLORS[row.className] ?? '#ffffff' }}>
                                        {row.player}
                                      </span>
                                    </span>
                                  </td>
                                  <td className="py-2 px-1.5 text-right font-mono-num text-[12px] text-[#c5cdd9]">
                                    {row.pullsPresent}×
                                  </td>
                                  <td className="py-2 px-1.5 text-right font-mono-num text-[13px] font-semibold text-white">
                                    {formatDamage(row.totalDamage)}
                                  </td>
                                  <td className="py-2 pl-1.5 pr-3.5 text-right font-mono-num text-[12.5px] text-[#34f5c5]">
                                    {formatDamage(row.avgDamage)}
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
            </div>
          )
        )}

        {/* 4. AVOIDABLE P2/P3 HITS (P2 NACH GRUPPEN GESPLITTET, P3 GESAMT) */}
        {(view === 'p2_avoidables' || view === 'p3_avoidables') && (
          scopedAvoidablePlayers.filter((r) => matchName(r.player)).length === 0 ? (
            <EmptyState
              title={
                view === 'p3_avoidables'
                  ? 'Keine vermeidbaren Phase-3-Treffer im Filter'
                  : 'Keine vermeidbaren Phase-2-Treffer im Filter'
              }
              description={
                view === 'p3_avoidables'
                  ? "Keine Treffer durch Serpent's Bite oder Volatile Purge im aktuellen Filter (oder kein Try erreichte Phase 3)."
                  : 'Keine Treffer durch Acidic Burst, Acidic Expulsion, Petrifying Sting oder Virulent Spit.'
              }
            />
          ) : (
            <div className="p-4">
              <div className={`grid grid-cols-1 gap-4 ${view === 'p3_avoidables' ? '' : 'lg:grid-cols-2'}`}>
                {(view === 'p3_avoidables'
                  ? [{ label: 'Phase 3 (Gesamt-Raid)', tankClass: '', rows: scopedAvoidablePlayers.filter((r) => matchName(r.player)) }]
                  : splitRowsByP2Group(
                      scopedAvoidablePlayers.filter((r) => matchName(r.player)),
                      p2Groups,
                    )
                ).map((grp) => {
                  const grpHits = grp.rows.reduce((s, r) => s + r.count, 0)
                  const grpLethal = grp.rows.reduce((s, r) => s + r.lethalCount, 0)
                  return (
                    <div
                      key={grp.label}
                      className="overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.55)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.8)] px-3.5 py-2.5">
                        <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
                          <Users className="h-3.5 w-3.5 text-[#34f5c5]" strokeWidth={1.75} />
                          <GroupNameLabel label={grp.label} tankClass={grp.tankClass} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Pill variant={grpHits > 0 ? 'warning' : 'success'}>{grpHits}× Treffer</Pill>
                          {grpLethal > 0 && <Pill variant="destructive">{grpLethal}× tödlich</Pill>}
                        </div>
                      </div>
                      {grp.rows.length === 0 ? (
                        <div className="px-3.5 py-3 text-[12px] text-[#34f5c5]">
                          Keine vermeidbaren P2-/P3-Treffer in dieser Gruppe.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-[rgba(255,255,255,0.06)] text-[10.5px] font-medium uppercase tracking-wider text-[#8b96a9]">
                                <th className="py-2 pl-3.5 pr-2">Spieler</th>
                                <th className="py-2 px-1.5 text-right">Treffer</th>
                                <th className="py-2 px-1.5 text-right">Tödlich</th>
                                <th className="py-2 pl-1.5 pr-3.5 text-right">Schaden</th>
                              </tr>
                            </thead>
                            <tbody>
                              {grp.rows.map((row) => {
                                const isOpen = !!expanded[`av-${grp.label}-${row.player}`]
                                return (
                                  <FragmentRow
                                    key={row.player}
                                    isOpen={isOpen}
                                    colSpan={4}
                                    summary={
                                      <tr className="border-b border-[rgba(255,255,255,0.05)] last:border-0 hover:bg-[rgba(52,245,197,0.055)] transition-colors">
                                        <td className="py-2 pl-3.5 pr-2">
                                          <button
                                            type="button"
                                            onClick={() => toggle(`av-${grp.label}-${row.player}`)}
                                            aria-expanded={isOpen}
                                            className="flex items-center gap-1.5 text-left text-[13px] font-semibold rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
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
                                        </td>
                                        <td className="py-2 px-1.5 text-right font-mono-num text-[13px] font-semibold text-[#fbbf24]">
                                          {row.count}×
                                        </td>
                                        <td className="py-2 px-1.5 text-right font-mono-num text-[12px]">
                                          {row.lethalCount > 0 ? (
                                            <span className="text-[#f87171] font-semibold">{row.lethalCount}×</span>
                                          ) : (
                                            <span className="text-[#8b96a9]">0</span>
                                          )}
                                        </td>
                                        <td className="py-2 pl-1.5 pr-3.5 text-right font-mono-num text-[12px] text-[#c5cdd9]">
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
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}

        {/* 5. PHASE 3 BURN (AUTO-ACTIVATES ON FIRST P3 LOG) */}
        {view === 'p3_burn' && (
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

function splitRowsByP2Group<T extends { player: string }>(
  rows: T[],
  p2Groups: SoakGroupDefinition | null,
): { label: string; tankClass: string; rows: T[] }[] {
  if (!p2Groups || (p2Groups.group_a_players.length === 0 && p2Groups.group_b_players.length === 0)) {
    return [{ label: 'Alle Spieler', tankClass: '', rows }]
  }
  const setA = new Set(p2Groups.group_a_players.map((p) => p.player))
  const setB = new Set(p2Groups.group_b_players.map((p) => p.player))
  const rowsA = rows.filter((r) => setA.has(r.player))
  const rowsB = rows.filter((r) => setB.has(r.player))
  const others = rows.filter((r) => !setA.has(r.player) && !setB.has(r.player))
  const out = [
    { label: p2Groups.group_a_label, tankClass: p2Groups.group_a_class, rows: rowsA },
    { label: p2Groups.group_b_label, tankClass: p2Groups.group_b_class, rows: rowsB },
  ]
  if (others.length > 0) {
    out.push({ label: 'Weitere Spieler', tankClass: '', rows: others })
  }
  return out
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
