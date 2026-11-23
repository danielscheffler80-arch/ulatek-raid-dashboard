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
  selectedCode: string
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
    <aside className="obsidian-sidebar flex h-full w-[256px] flex-col shrink-0">
      {/* Brand Header */}
      <div className="p-3">
        <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[rgba(52,245,197,0.22)] bg-[rgba(16,20,27,0.78)] px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[rgba(52,245,197,0.4)] bg-[rgba(52,245,197,0.12)] text-[#34f5c5] shadow-[0_0_16px_rgba(52,245,197,0.22)] shrink-0">
              <Activity className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-white leading-tight">
                Ula&apos;tek Forensik
              </div>
              <div className="truncate text-[11px] text-[#8b96a9]">
                Obsidian Mint · Mythic
              </div>
            </div>
          </div>
          {mobileOpen && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Sidebar schließen"
              className="rounded-[6px] p-1 text-[#c5cdd9] hover:bg-white/10 hover:text-white lg:hidden"
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
            className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[#8b96a9]"
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
            className="w-full rounded-[8px] border border-[rgba(255,255,255,0.11)] bg-[rgba(10,14,22,0.86)] py-1.5 pl-8 pr-11 text-[12px] text-white placeholder:text-[#8b96a9] focus-visible:outline-none focus-visible:border-[rgba(52,245,197,0.48)] focus-visible:ring-2 focus-visible:ring-[rgba(52,245,197,0.24)]"
          />
          <kbd className="pointer-events-none absolute right-2 rounded border border-[rgba(255,255,255,0.1)] bg-[#10141b] px-1.5 py-0.5 font-mono-num text-[10px] text-[#8b96a9]">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-5" aria-label="Raidabende Navigation">
        <div>
          <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.6px] text-[#8b96a9]">
            Übersicht
          </div>
          <button
            type="button"
            onClick={() => {
              onSelectReport('all')
              onCloseMobile()
            }}
            className={`flex w-full items-center justify-between gap-2 rounded-[8px] border px-2.5 py-2 text-left text-[13px] transition-[background-color,color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 ${
              selectedCode === 'all'
                ? 'bg-[rgba(52,245,197,0.13)] border-[rgba(52,245,197,0.42)] text-white font-semibold shadow-[0_0_16px_-6px_rgba(52,245,197,0.3)]'
                : 'border-transparent text-[#c5cdd9] hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Layers
                className={`h-4 w-4 shrink-0 ${selectedCode === 'all' ? 'text-[#34f5c5]' : 'text-[#8b96a9]'}`}
                strokeWidth={selectedCode === 'all' ? 2 : 1.5}
                aria-hidden="true"
              />
              <span className="truncate">Alle Raidabende</span>
            </span>
            <span className="font-mono-num text-[11px] text-[#8b96a9] shrink-0">
              {totalPulls}
            </span>
          </button>
        </div>

        <div>
          <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.6px] text-[#8b96a9]">
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
                  className={`flex w-full flex-col gap-0.5 rounded-[8px] border px-2.5 py-2 text-left transition-[background-color,color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 ${
                    active
                      ? 'bg-[rgba(52,245,197,0.13)] border-[rgba(52,245,197,0.42)] text-white shadow-[0_0_16px_-6px_rgba(52,245,197,0.3)]'
                      : 'border-transparent text-[#c5cdd9] hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Calendar
                        className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-[#34f5c5]' : 'text-[#8b96a9]'}`}
                        strokeWidth={active ? 2 : 1.5}
                        aria-hidden="true"
                      />
                      <span className={`truncate text-[12px] ${active ? 'font-semibold text-white' : 'font-medium'}`}>
                        {rep.date_iso}
                      </span>
                    </span>
                    <span className="font-mono-num text-[11px] text-[#8b96a9] shrink-0">
                      {rep.pulls_total} Trys
                    </span>
                  </div>
                  <div className="truncate pl-5 text-[11px] text-[#8b96a9]">
                    {name}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Sidebar Footer */}
      <div className="border-t border-[rgba(255,255,255,0.08)] p-3 space-y-2">
        <a
          href={GITHUB_ACTION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="obsidian-btn flex w-full items-center justify-between px-2.5 py-2 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
        >
          <span>GitHub Action Import</span>
          <ExternalLink className="h-3.5 w-3.5 text-[#34f5c5]" strokeWidth={1.75} aria-hidden="true" />
        </a>
        <div className="flex items-center justify-between px-1 text-[11px] text-[#8b96a9]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#34f5c5] shadow-[0_0_8px_#34f5c5]" aria-hidden="true" />
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
      <div className="hidden lg:block h-screen sticky top-0 z-20">{content}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[rgba(3,6,12,0.8)] backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  )
}
