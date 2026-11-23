import { useMemo } from 'react'
import { ExternalLink, Trophy } from 'lucide-react'
import type { ReportData } from '../types'
import { filterByMaxDeaths, formatDuration, getReportDisplayName } from '../lib/stats'
import { Card, EmptyState, Pill } from './ui'

export function PullsTab({
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
      // Only Caustic Waves on Noxious Shell count as Egg Fails (Bumps/Splash are valid plays)
      const eggs = filterByMaxDeaths(
        rep.egg_fails.filter((e) => e.kind === 'caustic_waves'),
        maxDeaths,
      )
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
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
        <div>
          <h2 className="text-[14px] font-semibold text-white">Chronologische Try-Übersicht</h2>
          <p className="text-[12px] text-[#8b96a9]">
            Alle gespeicherten Ula&apos;tek-Pulls mit Boss-%, Dauer und Fehlern (gefiltert bis max. {maxDeaths} Tode).
          </p>
        </div>
        <Pill variant="info">{rows.length} Pulls</Pill>
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
              <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,14,22,0.75)] text-[11px] font-medium uppercase tracking-wider text-[#c5cdd9]">
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
                <tr key={r.key} className="border-b border-[rgba(255,255,255,0.05)] hover:bg-[rgba(52,245,197,0.055)] transition-colors">
                  {isMultiReport && (
                    <td className="py-2.5 pl-4 pr-2 font-mono-num text-[12px] text-[#c5cdd9]">
                      {r.reportDate}
                    </td>
                  )}
                  <td className={`py-2.5 ${isMultiReport ? 'px-2' : 'pl-4 pr-2'}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num text-[13px] font-semibold text-white">
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
                  <td className="py-2.5 px-2 text-right font-mono-num text-[12px] text-white">
                    {r.isKill ? '0.0%' : `${r.bossPct.toFixed(1)}%`}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono-num text-[12px] text-[#c5cdd9]">
                    {formatDuration(r.durationMs)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono-num text-[12px]">
                    <span className={r.eggFails > 0 ? 'text-[#fbbf24] font-semibold' : 'text-[#8b96a9]'}>
                      {r.eggFails}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono-num text-[12px]">
                    <span className={r.waveFails > 0 ? 'text-white' : 'text-[#8b96a9]'}>
                      {r.waveFails}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono-num text-[12px]">
                    <span className={r.tankFails > 0 ? 'text-[#f87171] font-semibold' : 'text-[#8b96a9]'}>
                      {r.tankFails}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono-num text-[12px]">
                    <span className={r.unprotectedDeaths > 0 ? 'text-[#f87171]' : 'text-[#8b96a9]'}>
                      {r.unprotectedDeaths}
                    </span>
                  </td>
                  <td className="py-2.5 pl-2 pr-4 text-right">
                    <a
                      href={r.reportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="obsidian-btn inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
                    >
                      <ExternalLink className="h-3 w-3 text-[#38bdf8]" strokeWidth={1.75} aria-hidden="true" />
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
  )
}
