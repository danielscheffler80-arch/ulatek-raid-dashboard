import React from 'react'
import {
  Activity,
  Calendar,
  ExternalLink,
  Layers,
  Search,
  X,
} from 'lucide-react'
import type { ReportData } from '../types'
import { getReportDisplayName } from '../lib/stats'

export const GITHUB_ACTION_URL =
  'https://github.com/danielscheffler80-arch/ulatek-raid-dashboard/actions/workflows/add-log.yml'

interface SidebarProps {
  reports: ReportData[]
  selectedCode: string // 'all' or report code
  onSelectReport: (code: string) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  searchInputRef: React.RefObject<HTMLInputElement | null>
  updatedAt: string
  mobileOpen: boolean
  onCloseMobile: () => void
}

export function Sidebar({
  reports,
  selectedCode,
  onSelectReport,
  searchQuery,
  onSearchChange,
  searchInputRef,
  updatedAt,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const totalPulls = reports.reduce((s, r) => s + r.pulls_total, 0)

  const content = (
    <aside className="flex h-full w-[252px] flex-col border-r border-[#27272a] bg-[#09090b] shrink-0">
      {/* Brand Header */}
      <div className="p-3">
        <div className="flex items-center justify-between gap-2 rounded-[8px] border border-[#27272a] bg-[#18181b] px-3 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[#27272a] bg-[#09090b] text-[#34d399] shrink-0">
              <Activity className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-[#fafafa] leading-tight">
                Ula&apos;tek Forensik
              </div>
              <div className="truncate text-[11px] text-[#a1a1aa]">
                Mythic Raid Analyzer
              </div>
            </div>
          </div>
          {mobileOpen && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Sidebar schließen"
              className="rounded-[6px] p-1 text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa] lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Command Search */}
      <div className="px-3 pb-3">
        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[#71717a]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Spieler oder Try suchen…"
            aria-label="Spieler oder Try suchen"
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-[6px] border border-[#27272a] bg-[#121215] py-1.5 pl-8 pr-11 text-[12px] text-[#fafafa] placeholder:text-[#71717a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          />
          <kbd className="pointer-events-none absolute right-2 rounded border border-[#27272a] bg-[#18181b] px-1.5 py-0.5 font-mono-num text-[10px] text-[#71717a]">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-5" aria-label="Raidabende Navigation">
        <div>
          <div className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-[0.6px] text-[#71717a]">
            Übersicht
          </div>
          <button
            type="button"
            onClick={() => {
              onSelectReport('all')
              onCloseMobile()
            }}
            className={`flex w-full items-center justify-between gap-2 rounded-[6px] px-2.5 py-2 text-left text-[13px] transition-[background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
              selectedCode === 'all'
                ? 'bg-[#27272a] text-[#fafafa] font-semibold'
                : 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#fafafa]'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Layers className="h-4 w-4 shrink-0" strokeWidth={selectedCode === 'all' ? 2 : 1.5} aria-hidden="true" />
              <span className="truncate">Alle Raidabende</span>
            </span>
            <span className="font-mono-num text-[11px] text-[#a1a1aa] shrink-0">
              {totalPulls}
            </span>
          </button>
        </div>

        <div>
          <div className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-[0.6px] text-[#71717a]">
            Raidabende ({reports.length})
          </div>
          <div className="space-y-1">
            {reports.map((rep) => {
              const active = selectedCode === rep.code
              const name = getReportDisplayName(rep)
              return (
                <button
                  key={rep.code}
                  type="button"
                  onClick={() => {
                    onSelectReport(rep.code)
                    onCloseMobile()
                  }}
                  title={rep.title}
                  className={`flex w-full flex-col gap-0.5 rounded-[6px] px-2.5 py-2 text-left transition-[background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                    active
                      ? 'bg-[#27272a] text-[#fafafa]'
                      : 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#fafafa]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Calendar
                        className="h-3.5 w-3.5 shrink-0 text-[#71717a]"
                        strokeWidth={active ? 2 : 1.5}
                        aria-hidden="true"
                      />
                      <span className={`truncate text-[12px] ${active ? 'font-semibold text-[#fafafa]' : 'font-medium'}`}>
                        {rep.date_iso}
                      </span>
                    </span>
                    <span className="font-mono-num text-[11px] text-[#71717a] shrink-0">
                      {rep.pulls_total} Trys
                    </span>
                  </div>
                  <div className="truncate pl-5 text-[11px] text-[#71717a]">
                    {name}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Sidebar Footer */}
      <div className="border-t border-[#27272a] p-3 space-y-2">
        <a
          href={GITHUB_ACTION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-between rounded-[6px] border border-[#27272a] bg-[#121215] px-2.5 py-2 text-[12px] font-medium text-[#fafafa] hover:bg-[#18181b] active:scale-[0.96] transition-[background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          <span>GitHub Action Import</span>
          <ExternalLink className="h-3.5 w-3.5 text-[#a1a1aa]" strokeWidth={1.75} aria-hidden="true" />
        </a>
        <div className="flex items-center justify-between px-1 text-[11px] text-[#71717a]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#10b981]" aria-hidden="true" />
            WCL v2 API Sync
          </span>
          <span className="font-mono-num">
            {updatedAt ? updatedAt.slice(0, 10) : '—'}
          </span>
        </div>
      </div>
    </aside>
  )

  return (
    <>
      <div className="hidden lg:block h-screen sticky top-0">{content}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  )
}
