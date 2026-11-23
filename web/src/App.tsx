import { useEffect, useMemo, useRef, useState } from 'react'
import { Menu, Plus } from 'lucide-react'
import type { ReportsStore, TabKey } from './types'
import { getReportDisplayName } from './lib/stats'
import { Sidebar } from './components/Sidebar'
import { ImportModal } from './components/ImportModal'
import { EggFailsTab } from './components/EggFailsTab'
import { WaveFailsTab } from './components/WaveFailsTab'
import { TankFailsTab } from './components/TankFailsTab'
import { DefensivesTab } from './components/DefensivesTab'
import { PullsTab } from './components/PullsTab'
import { Pill } from './components/ui'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'egg', label: 'Egg Fails' },
  { key: 'wave', label: 'Wave Fails' },
  { key: 'tank', label: 'Tank Fails' },
  { key: 'defensives', label: 'Def CD / Pot / HS' },
  { key: 'pulls', label: 'Try-Übersicht' },
]

export default function App() {
  const [store, setStore] = useState<ReportsStore | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedCode, setSelectedCode] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<TabKey>('egg')
  const [maxDeathsByTab, setMaxDeathsByTab] = useState<Record<TabKey, number | null>>({
    egg: null,
    wave: null,
    tank: null,
    defensives: null,
    pulls: null,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    fetch('./data/reports.json', { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<ReportsStore>
      })
      .then((data) => {
        setStore(data)
        if (data.reports.length === 1) {
          setSelectedCode(data.reports[0].code)
        }
      })
      .catch((err) => {
        setError(`reports.json konnte nicht geladen werden (${err instanceof Error ? err.message : String(err)}).`)
      })
  }, [])

  // Keyboard shortcut Cmd/Ctrl + K for player/try search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      } else if (e.key === 'Escape' && importOpen) {
        setImportOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [importOpen])

  const reports = store?.reports ?? []

  const activeReports = useMemo(() => {
    if (selectedCode === 'all') return reports
    const found = reports.find((r) => r.code === selectedCode)
    return found ? [found] : reports
  }, [reports, selectedCode])

  const isMultiReport = selectedCode === 'all' && reports.length > 1
  const totalPulls = activeReports.reduce((s, r) => s + r.pulls_total, 0)
  const breadcrumbLabel =
    selectedCode === 'all'
      ? `Alle Raidabende (${reports.length})`
      : activeReports[0]
        ? getReportDisplayName(activeReports[0])
        : '—'

  const currentMaxDeaths = maxDeathsByTab[activeTab]
  const setCurrentMaxDeaths = (val: number | null) =>
    setMaxDeathsByTab((prev) => ({ ...prev, [activeTab]: val }))

  return (
    <div className="flex min-h-screen bg-[#09090b] text-[#fafafa]">
      <Sidebar
        reports={reports}
        selectedCode={selectedCode}
        onSelectReport={setSelectedCode}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchInputRef={searchInputRef}
        updatedAt={store?.updated_at ?? ''}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header Bar (56px) */}
        <header className="sticky top-0 z-30 flex min-h-[56px] flex-wrap items-center justify-between gap-3 border-b border-[#27272a] bg-[#09090b]/95 px-4 py-2 backdrop-blur-sm">
          {/* Left: Breadcrumb + Pull Badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Navigation öffnen"
              className="rounded-[6px] border border-[#27272a] bg-[#18181b] p-1.5 text-[#fafafa] lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5 text-[13px] min-w-0">
              <span className="text-[#71717a] shrink-0">Ula&apos;tek Mythic</span>
              <span className="text-[#71717a]" aria-hidden="true">/</span>
              <span className="truncate font-semibold text-[#fafafa] max-w-[200px] sm:max-w-[280px]">
                {breadcrumbLabel}
              </span>
            </div>
            <Pill variant="success">{totalPulls} Trys</Pill>
          </div>

          {/* Center: Segmented Tabs */}
          <nav
            className="flex items-center overflow-x-auto rounded-[8px] border border-[#27272a] bg-[#18181b] p-[3px]"
            aria-label="Analyse-Tabs"
          >
            {TABS.map((t) => {
              const active = activeTab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={`whitespace-nowrap rounded-[5px] px-3 py-1 text-[12px] transition-[background-color,color,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                    active
                      ? 'bg-[#09090b] text-[#fafafa] font-semibold'
                      : 'text-[#a1a1aa] hover:text-[#fafafa]'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </nav>

          {/* Right: Primary CTA */}
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#fafafa] px-3 py-1.5 text-[12px] font-semibold text-[#09090b] hover:bg-zinc-200 active:scale-[0.96] transition-[background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
            <span>Neuen Log hinzufügen</span>
          </button>
        </header>

        {/* Main Workstage */}
        <main className="flex-1 p-4 sm:p-6">
          {error ? (
            <div className="rounded-[10px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.12)] p-4 text-[13px] text-[#f87171]">
              {error}
            </div>
          ) : !store ? (
            <div className="flex items-center justify-center py-20 text-[13px] text-[#71717a]">
              Lade Raid-Daten…
            </div>
          ) : (
            <>
              {activeTab === 'egg' && (
                <EggFailsTab
                  reports={activeReports}
                  isMultiReport={isMultiReport}
                  searchQuery={searchQuery}
                  maxDeaths={currentMaxDeaths}
                  onMaxDeathsChange={setCurrentMaxDeaths}
                />
              )}
              {activeTab === 'wave' && (
                <WaveFailsTab
                  reports={activeReports}
                  isMultiReport={isMultiReport}
                  searchQuery={searchQuery}
                  maxDeaths={currentMaxDeaths}
                  onMaxDeathsChange={setCurrentMaxDeaths}
                />
              )}
              {activeTab === 'tank' && (
                <TankFailsTab
                  reports={activeReports}
                  isMultiReport={isMultiReport}
                  searchQuery={searchQuery}
                  maxDeaths={currentMaxDeaths}
                  onMaxDeathsChange={setCurrentMaxDeaths}
                />
              )}
              {activeTab === 'defensives' && (
                <DefensivesTab
                  reports={activeReports}
                  isMultiReport={isMultiReport}
                  searchQuery={searchQuery}
                  maxDeaths={currentMaxDeaths}
                  onMaxDeathsChange={setCurrentMaxDeaths}
                />
              )}
              {activeTab === 'pulls' && (
                <PullsTab
                  reports={activeReports}
                  isMultiReport={isMultiReport}
                  searchQuery={searchQuery}
                  maxDeaths={currentMaxDeaths}
                  onMaxDeathsChange={setCurrentMaxDeaths}
                />
              )}
            </>
          )}
        </main>
      </div>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}
