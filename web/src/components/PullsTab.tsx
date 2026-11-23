import { useMemo } from 'react'
import { ExternalLink, Trophy } from 'lucide-react'
import type { ReportData } from '../types'
import { filterByMaxDeaths, formatDuration, getReportDisplayName } from '../lib/stats'
import { Card, EmptyState, MaxDeathsFilter, Pill } from './ui'

export function PullsTab({
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
  const rows = useMemo(() => {
    const out: Array<{
      key: string
      reportDate: string
      reportLabel: string
      pullNum: number
      isKill: boolean
      bossPct: number
      durationMs: number
      deathsTotal: number
      eggFails: number
      waveFails: number
      tankFails: number
      unprotectedDeaths: number
      reportUrl: string
    }> = []

    for (const rep of reports) {
      const label = getReportDisplayName(rep)
      const eggs = filterByMaxDeaths(rep.egg_fails, maxDeaths)
      const waves = filterByMaxDeaths(rep.wave_fails, maxDeaths)
      const tanks = filterByMaxDeaths(rep.tank_fails, maxDeaths)
      const defs = filterByMaxDeaths(rep.defensive_events, maxDeaths)

      for (const p of rep.pulls) {
        out.push({
          key: `${rep.code}-${p.fight_id}`,
          reportDate: rep.date_iso,
          reportLabel: label,
          pullNum: p.pull_num,
          isKill: p.is_kill,
          bossPct: p.boss_percentage,
          durationMs: p.duration_ms,
          deathsTotal: p.deaths_total,
          eggFails: eggs.filter((e) => e.fight_id === p.fight_id).length,
          waveFails: waves.filter((w) => w.fight_id === p.fight_id).length,
          tankFails: tanks.filter((t) => t.fight_id === p.fight_id).length,
          unprotectedDeaths: defs.filter(
            (d) => d.fight_id === p.fight_id && d.kind === 'death' && !d.pot_used_in_pull && !d.hs_used_in_pull,
          ).length,
          reportUrl: p.report_url,
        })
      }
    }

    const q = searchQuery.trim().toLowerCase()
    if (!q) return out
    return out.filter(
      (r) =>
        `try ${r.pullNum}`.includes(q) ||
        String(r.pullNum) === q ||
        r.reportDate.includes(q) ||
        r.reportLabel.toLowerCase().includes(q),
    )
  }, [reports, maxDeaths, searchQuery])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#27272a] bg-[#09090b] px-4 py-3">
        <MaxDeathsFilter value={maxDeaths} onChange={onMaxDeathsChange} />
        <Pill>{rows.length} Pulls</Pill>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-[#27272a] px-4 py-3">
          <h2 className="text-[14px] font-semibold text-[#fafafa]">Chronologische Try-Übersicht</h2>
          <p className="text-[12px] text-[#71717a]">
            Alle gespeicherten Ula&apos;tek-Pulls mit Boss-%, Dauer und Fehlern pro Kategorie.
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="Keine Pulls gefunden"
            description="Pass den Suchfilter an oder importiere einen neuen WarcraftLogs-Report."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#27272a] text-[11px] font-medium uppercase tracking-wider text-[#a1a1aa]">
                  {isMultiReport && <th className="py-2.5 pl-4 pr-2">Datum</th>}
                  <th className={`py-2.5 ${isMultiReport ? 'px-2' : 'pl-4 pr-2'}`}>Try</th>
                  <th className="py-2.5 px-2 text-right">Boss %</th>
                  <th className="py-2.5 px-2 text-right">Dauer</th>
                  <th className="py-2.5 px-2 text-right">Egg Fails</th>
                  <th className="py-2.5 px-2 text-right">Wave Fails</th>
                  <th className="py-2.5 px-2 text-right">Tank Fails</th>
                  <th className="py-2.5 px-2 text-right">Tode o. Pot/HS</th>
                  <th className="py-2.5 pl-2 pr-4 text-right">WCL</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-[#18181b] hover:bg-[#18181b]/70 transition-colors">
                    {isMultiReport && (
                      <td className="py-2.5 pl-4 pr-2 font-mono-num text-[12px] text-[#a1a1aa]">
                        {r.reportDate}
                      </td>
                    )}
                    <td className={`py-2.5 ${isMultiReport ? 'px-2' : 'pl-4 pr-2'}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num text-[13px] font-semibold text-[#fafafa]">
                          Try {r.pullNum}
                        </span>
                        {r.isKill && (
                          <Pill variant="success">
                            <Trophy className="h-3 w-3" aria-hidden="true" />
                            Kill
                          </Pill>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-num text-[12px] text-[#fafafa]">
                      {r.isKill ? '0.0%' : `${r.bossPct.toFixed(1)}%`}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-num text-[12px] text-[#a1a1aa]">
                      {formatDuration(r.durationMs)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-num text-[12px]">
                      <span className={r.eggFails > 0 ? 'text-[#fbbf24] font-semibold' : 'text-[#71717a]'}>
                        {r.eggFails}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-num text-[12px]">
                      <span className={r.waveFails > 0 ? 'text-[#fafafa]' : 'text-[#71717a]'}>
                        {r.waveFails}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-num text-[12px]">
                      <span className={r.tankFails > 0 ? 'text-[#f87171] font-semibold' : 'text-[#71717a]'}>
                        {r.tankFails}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-num text-[12px]">
                      <span className={r.unprotectedDeaths > 0 ? 'text-[#f87171]' : 'text-[#71717a]'}>
                        {r.unprotectedDeaths}
                      </span>
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-right">
                      <a
                        href={r.reportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-[6px] border border-[#27272a] bg-[#121215] px-2 py-1 text-[11px] font-medium text-[#fafafa] hover:bg-[#18181b] active:scale-[0.96] transition-[background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                      >
                        <ExternalLink className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                        Log
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
