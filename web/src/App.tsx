import { useEffect, useMemo, useRef, useState } from 'react'
import { Menu, Plus } from 'lucide-react'
import type { ReportsStore, TabKey } from './types'
import { getReportDisplayName } from './lib/stats'
import type { PullRange } from './lib/stats'
import { Sidebar } from './components/Sidebar'
import { ImportModal } from './components/ImportModal'
import { EggFailsTab } from './components/EggFailsTab'
import { WaveFailsTab } from './components/WaveFailsTab'
import { TankFailsTab } from './components/TankFailsTab'
import { DefensivesTab } from './components/DefensivesTab'
import { PullsTab } from './components/PullsTab'
import { MaxDeathsStepper, Pill, TryRangeFilter } from './components/ui'

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
  // Standardmäßig nach 4 Toden filtern (je Tab individuell anpassbar über den kompakten Stepper oben)
  const [maxDeathsByTab, setMaxDeathsByTab] = useState<Record<TabKey, number>>({
    egg: 4,
    wave: 4,
    tank: 4,
    defensives: 4,
    pulls: 4,
  })
  const [pullRange, setPullRange] = useState<PullRange>({ from: 1, to: 40 })
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

  const maxPullAvailable = useMemo(() => {
    let maxP = 1
    for (const r of activeReports) {
      if (r.pulls_total > maxP) maxP = r.pulls_total
    }
    return maxP
  }, [activeReports])

  // Reset pull range cleanly whenever the active report selection changes
  useEffect(() => {
    setPullRange({ from: 1, to: maxPullAvailable })
  }, [selectedCode, maxPullAvailable])

  const isMultiReport = selectedCode === 'all' && reports.length > 1
  const totalPulls = activeReports.reduce((s, r) => s + r.pulls_total, 0)
  const breadcrumbLabel =
    selectedCode === 'all'
      ? `Alle Raidabende (${reports.length})`
      : activeReports[0]
        ? getReportDisplayName(activeReports[0])
        : '—'

  const currentMaxDeaths = maxDeathsByTab[activeTab]
  const setCurrentMaxDeaths = (val: number) =>
    setMaxDeathsByTab((prev) => ({ ...prev, [activeTab]: val }))

  return (
    <div className="relative flex min-h-screen bg-[#050911] text-white">
      {/* Reborn App Ambient Glow */}
      <div className="obsidian-ambient" aria-hidden="true" />

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

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Obsidian Mint Top Header Bar */}
        <header className="obsidian-topbar flex min-h-[58px] flex-wrap items-center justify-between gap-2.5 px-4 py-2">
          {/* Left: Breadcrumb + Pull Badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Navigation öffnen"
              className="obsidian-btn p-1.5 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5 text-[13px] min-w-0">
              <span className="text-[#8b96a9] shrink-0">Ula&apos;tek Mythic</span>
              <span className="text-[#8b96a9]" aria-hidden="true">/</span>
              <span className="truncate font-semibold text-white max-w-[160px] sm:max-w-[220px]">
                {breadcrumbLabel}
              </span>
            </div>
            <Pill variant="success">{totalPulls} Trys</Pill>
          </div>

          {/* Center: Obsidian Segmented Tabs */}
          <nav
            className="obsidian-tabs flex items-center overflow-x-auto"
            aria-label="Analyse-Tabs"
          >
            {TABS.map((t) => {
              const active = activeTab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={`obsidian-tab whitespace-nowrap px-3 py-1 text-[12px] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 ${
                    active ? 'active' : ''
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </nav>

          {/* Right: Try Range (ab/bis Try) + Compact Max-Deaths Stepper (Default: 4) + Mint CTA */}
          <div className="flex flex-wrap items-center gap-2">
            <TryRangeFilter
              range={pullRange}
              maxPull={maxPullAvailable}
              onChange={setPullRange}
            />
            <MaxDeathsStepper
              value={currentMaxDeaths}
              onChange={setCurrentMaxDeaths}
            />
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="obsidian-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
              <span className="hidden xl:inline">Neuen Log hinzufügen</span>
              <span className="xl:hidden">Log</span>
            </button>
          </div>
        </header>

        {/* Main Workstage */}
        <main className="flex-1 p-4 sm:p-6">
          {error ? (
            <div className="rounded-[12px] border border-[rgba(239,68,68,0.34)] bg-[rgba(239,68,68,0.12)] p-4 text-[13px] text-[#f87171]">
              {error}
            </div>
          ) : !store ? (
            <div className="flex items-center justify-center py-20 text-[13px] text-[#8b96a9]">
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
                  pullRange={pullRange}
                />
              )}
              {activeTab === 'wave' && (
                <WaveFailsTab
                  reports={activeReports}
                  isMultiReport={isMultiReport}
                  searchQuery={searchQuery}
                  maxDeaths={currentMaxDeaths}
                  pullRange={pullRange}
                />
              )}
              {activeTab === 'tank' && (
                <TankFailsTab
                  reports={activeReports}
                  isMultiReport={isMultiReport}
                  searchQuery={searchQuery}
                  maxDeaths={currentMaxDeaths}
                  pullRange={pullRange}
                />
              )}
              {activeTab === 'defensives' && (
                <DefensivesTab
                  reports={activeReports}
                  isMultiReport={isMultiReport}
                  searchQuery={searchQuery}
                  maxDeaths={currentMaxDeaths}
                  pullRange={pullRange}
                />
              )}
              {activeTab === 'pulls' && (
                <PullsTab
                  reports={activeReports}
                  isMultiReport={isMultiReport}
                  searchQuery={searchQuery}
                  maxDeaths={currentMaxDeaths}
                  pullRange={pullRange}
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
