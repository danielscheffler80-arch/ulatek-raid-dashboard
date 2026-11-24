import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Link2, Menu, Radio, RefreshCw } from 'lucide-react'
import type { ReportData, ReportsStore, TabKey } from './types'
import { getReportDisplayName } from './lib/stats'
import type { PullRange } from './lib/stats'
import {
  LIVE_POLL_INTERVAL_MS,
  buildLiveShareUrl,
  fetchLiveAnalyze,
  fetchLiveStatus,
  formatMinutesAgo,
  readLiveCodeFromUrl,
  syncLiveCodeInUrl,
  type LiveStatus,
} from './lib/liveClient'
import { Sidebar } from './components/Sidebar'
import { ImportModal } from './components/ImportModal'
import { EggFailsTab } from './components/EggFailsTab'
import { WaveFailsTab } from './components/WaveFailsTab'
import { TankFailsTab } from './components/TankFailsTab'
import { DefensivesTab } from './components/DefensivesTab'
import { HealersTab } from './components/HealersTab'
import { HeartPhaseTab } from './components/HeartPhaseTab'
import { PhasesTab } from './components/PhasesTab'
import { PullsTab } from './components/PullsTab'
import { Pill } from './components/ui'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'egg', label: 'Egg Fails' },
  { key: 'wave', label: 'Wave Fails' },
  { key: 'tank', label: 'Tank Fails' },
  { key: 'defensives', label: 'Def CD / Pot / HS' },
  { key: 'healers', label: 'Heiler' },
  { key: 'heart', label: 'Herzphase' },
  { key: 'phases', label: 'P2 / P3 & Kicks' },
  { key: 'pulls', label: 'Try-Übersicht' },
]

type LiveViewMode = 'latest' | 'all' | 'custom'

export default function App() {
  const [store, setStore] = useState<ReportsStore | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedCode, setSelectedCode] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<TabKey>('egg')

  // Live-Log State
  const [liveReport, setLiveReport] = useState<ReportData | null>(null)
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null)
  const [liveViewMode, setLiveViewMode] = useState<LiveViewMode>('all')
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveSyncing, setLiveSyncing] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [copiedLiveLink, setCopiedLiveLink] = useState(false)
  const lastCacheVersionRef = useRef<string>('')

  // Standardmäßig nach 4 Toden filtern (je Tab individuell anpassbar über den Stepper in der Sidebar)
  const [maxDeathsByTab, setMaxDeathsByTab] = useState<Record<TabKey, number>>({
    egg: 4,
    wave: 4,
    tank: 4,
    defensives: 4,
    healers: 4,
    heart: 4,
    phases: 4,
    pulls: 4,
  })
  const [pullRange, setPullRange] = useState<PullRange>({ from: 1, to: 40 })
  const [searchQuery, setSearchQuery] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const connectLiveReport = useCallback(async (code: string, forceNocache = false): Promise<boolean> => {
    setLiveLoading(true)
    setLiveError(null)
    try {
      const status = await fetchLiveStatus(code, forceNocache)
      setLiveStatus(status)
      if (status.pulls_total === 0) {
        setLiveError(`Im Report ${code} wurden noch keine Ula'tek-Mythic-Trys gefunden.`)
        setLiveLoading(false)
        return false
      }
      const analyzed = await fetchLiveAnalyze(code, status.cache_version, forceNocache)
      setLiveReport(analyzed.report)
      setLiveStatus(analyzed.live_status)
      lastCacheVersionRef.current = analyzed.live_status.cache_version
      setSelectedCode(analyzed.report.code)
      syncLiveCodeInUrl(analyzed.report.code)

      // Bei laufendem Live-Log (heute & <= 45 Min.) standardmäßig nur aktuellen Try anzeigen
      const maxP = Math.max(1, analyzed.report.pulls_total)
      if (analyzed.live_status.is_live) {
        setLiveViewMode('latest')
        setPullRange({ from: maxP, to: maxP })
      } else {
        setLiveViewMode('all')
        setPullRange({ from: 1, to: maxP })
      }
      setLiveLoading(false)
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setLiveError(msg)
      setLiveLoading(false)
      return false
    }
  }, [])

  // Initial load: static archive + optional ?live=<CODE> auto-connect
  useEffect(() => {
    const initialLiveCode = readLiveCodeFromUrl()
    fetch('./data/reports.json', { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<ReportsStore>
      })
      .then((data) => {
        setStore(data)
        if (!initialLiveCode && data.reports.length === 1) {
          setSelectedCode(data.reports[0].code)
        }
      })
      .catch((err) => {
        setError(`reports.json konnte nicht geladen werden (${err instanceof Error ? err.message : String(err)}).`)
      })

    if (initialLiveCode) {
      void connectLiveReport(initialLiveCode, false)
    }
  }, [connectLiveReport])

  // 30-Sekunden Auto-Polling solange Live-Log aktiv ist (Datum = heute & <= 45 Min. seit letztem Try)
  useEffect(() => {
    if (!liveReport || !liveStatus?.is_live) return
    const code = liveReport.code
    let cancelled = false

    const pollOnce = async () => {
      try {
        setLiveSyncing(true)
        const nextStatus = await fetchLiveStatus(code, false)
        if (cancelled) return
        setLiveStatus(nextStatus)

        if (
          nextStatus.pulls_total > 0 &&
          nextStatus.cache_version !== lastCacheVersionRef.current
        ) {
          const analyzed = await fetchLiveAnalyze(code, nextStatus.cache_version, false)
          if (cancelled) return
          setLiveReport(analyzed.report)
          setLiveStatus(analyzed.live_status)
          lastCacheVersionRef.current = analyzed.live_status.cache_version
        }
      } catch {
        // Stiller Fehler beim Hintergrund-Polling; nächster Tick versucht es erneut
      } finally {
        if (!cancelled) setLiveSyncing(false)
      }
    }

    const timer = window.setInterval(pollOnce, LIVE_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [liveReport?.code, liveStatus?.is_live])

  const handleManualLiveRefresh = useCallback(async () => {
    if (!liveReport) return
    setLiveSyncing(true)
    setLiveError(null)
    try {
      const nextStatus = await fetchLiveStatus(liveReport.code, true)
      setLiveStatus(nextStatus)
      if (nextStatus.pulls_total > 0) {
        const analyzed = await fetchLiveAnalyze(liveReport.code, nextStatus.cache_version, true)
        setLiveReport(analyzed.report)
        setLiveStatus(analyzed.live_status)
        lastCacheVersionRef.current = analyzed.live_status.cache_version
      }
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : String(err))
    } finally {
      setLiveSyncing(false)
    }
  }, [liveReport])

  const handleDisconnectLive = useCallback(() => {
    const fallbackCode = store?.reports.length === 1 ? store.reports[0].code : 'all'
    setLiveReport(null)
    setLiveStatus(null)
    setLiveError(null)
    setLiveViewMode('all')
    lastCacheVersionRef.current = ''
    syncLiveCodeInUrl(null)
    setSelectedCode(fallbackCode)
  }, [store])

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

  const isViewingLive = Boolean(liveReport && selectedCode === liveReport.code)

  const activeReports = useMemo(() => {
    if (isViewingLive && liveReport) return [liveReport]
    if (selectedCode === 'all') return reports
    const found = reports.find((r) => r.code === selectedCode)
    return found ? [found] : reports
  }, [isViewingLive, liveReport, reports, selectedCode])

  const maxPullAvailable = useMemo(() => {
    let maxP = 1
    for (const r of activeReports) {
      if (r.pulls_total > maxP) maxP = r.pulls_total
    }
    return maxP
  }, [activeReports])

  // Pull-Bereich synchron halten: Im Live-'latest'-Modus automatisch immer den neuesten Try (#N) zeigen
  useEffect(() => {
    if (isViewingLive) {
      if (liveViewMode === 'latest') {
        setPullRange({ from: maxPullAvailable, to: maxPullAvailable })
      } else if (liveViewMode === 'all') {
        setPullRange({ from: 1, to: maxPullAvailable })
      }
      return
    }
    setPullRange({ from: 1, to: maxPullAvailable })
  }, [selectedCode, maxPullAvailable, isViewingLive, liveViewMode])

  const handlePullRangeChange = (next: PullRange) => {
    setPullRange(next)
    if (isViewingLive) {
      if (next.from === maxPullAvailable && next.to === maxPullAvailable) {
        setLiveViewMode('latest')
      } else if (next.from === 1 && next.to === maxPullAvailable) {
        setLiveViewMode('all')
      } else {
        setLiveViewMode('custom')
      }
    }
  }

  const handleSelectReport = (code: string) => {
    setSelectedCode(code)
    if (liveReport && code === liveReport.code && liveStatus?.is_live) {
      setLiveViewMode('latest')
    } else {
      setLiveViewMode('all')
    }
  }

  const handleCopyLiveLink = async () => {
    if (!liveReport) return
    try {
      await navigator.clipboard.writeText(buildLiveShareUrl(liveReport.code))
      setCopiedLiveLink(true)
      setTimeout(() => setCopiedLiveLink(false), 1800)
    } catch {
      // Clipboard fallback ignored
    }
  }

  const isMultiReport = !isViewingLive && selectedCode === 'all' && reports.length > 1
  const totalPulls = activeReports.reduce((s, r) => s + r.pulls_total, 0)
  const breadcrumbLabel = isViewingLive && liveReport
    ? getReportDisplayName(liveReport)
    : selectedCode === 'all'
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
        liveReport={liveReport}
        liveStatus={liveStatus}
        selectedCode={selectedCode}
        onSelectReport={handleSelectReport}
        onDisconnectLive={handleDisconnectLive}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchInputRef={searchInputRef}
        pullRange={pullRange}
        maxPullAvailable={maxPullAvailable}
        onPullRangeChange={handlePullRangeChange}
        maxDeaths={currentMaxDeaths}
        onMaxDeathsChange={setCurrentMaxDeaths}
        onOpenImport={() => setImportOpen(true)}
        updatedAt={isViewingLive && liveReport ? liveReport.analyzed_at : store?.updated_at ?? ''}
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
              <span className="truncate font-semibold text-white max-w-[160px] sm:max-w-[240px]">
                {breadcrumbLabel}
              </span>
            </div>
            <Pill variant="success">{totalPulls} Trys</Pill>
            {(pullRange.from > 1 || pullRange.to < maxPullAvailable) && (
              <Pill variant="info">
                {pullRange.from === pullRange.to
                  ? `Try #${pullRange.from}`
                  : `Try ${pullRange.from}–${pullRange.to}`}
              </Pill>
            )}
          </div>

          {/* Right: Obsidian Segmented Tabs */}
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
        </header>

        {/* Live-Log Status- & Try-Umschalt-Leiste */}
        {isViewingLive && liveReport && liveStatus && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[rgba(52,245,197,0.18)] bg-[rgba(10,16,24,0.88)] px-4 py-2 text-[12px]">
            <div className="flex flex-wrap items-center gap-2">
              {liveStatus.is_live ? (
                <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-[rgba(52,245,197,0.38)] bg-[rgba(52,245,197,0.14)] px-2.5 py-1 text-[11px] font-semibold text-[#34f5c5]">
                  <span className="h-2 w-2 rounded-full bg-[#34f5c5] shadow-[0_0_8px_#34f5c5] animate-pulse" />
                  LIVE · Auto-Sync alle 30 s
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.12)] px-2.5 py-1 text-[11px] font-semibold text-[#fbbf24]">
                  <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                  Log beendet (&gt; 45 Min. · kein Live-Polling)
                </span>
              )}
              <span className="text-[#c5cdd9]">
                Letzter Try:{' '}
                <span className="font-mono-num font-semibold text-white">
                  #{liveReport.pulls_total}
                </span>
                {liveStatus.last_pull_boss_pct !== null && (
                  <span className="font-mono-num text-[#8b96a9]">
                    {' '}({liveStatus.last_pull_is_kill ? 'KILL' : `${liveStatus.last_pull_boss_pct.toFixed(1)}%`})
                  </span>
                )}
                {' · '}
                <span className="text-[#8b96a9]">
                  {formatMinutesAgo(liveStatus.minutes_since_last_pull)}
                </span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* 1-Klick-Toggle: Aktueller Try vs. Alle Trys */}
              <div
                className="inline-flex items-center rounded-[8px] border border-[rgba(255,255,255,0.11)] bg-[rgba(5,9,17,0.9)] p-[3px]"
                role="group"
                aria-label="Live-Ansicht umschalten"
              >
                <button
                  type="button"
                  onClick={() => setLiveViewMode('latest')}
                  className={`rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-[background-color,color] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 ${
                    liveViewMode === 'latest'
                      ? 'bg-[rgba(52,245,197,0.18)] text-[#34f5c5] font-semibold'
                      : 'text-[#c5cdd9] hover:text-white'
                  }`}
                >
                  Aktueller Try (#{maxPullAvailable})
                </button>
                <button
                  type="button"
                  onClick={() => setLiveViewMode('all')}
                  className={`rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-[background-color,color] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 ${
                    liveViewMode === 'all'
                      ? 'bg-[rgba(52,245,197,0.18)] text-[#34f5c5] font-semibold'
                      : 'text-[#c5cdd9] hover:text-white'
                  }`}
                >
                  Alle Trys (1–{maxPullAvailable})
                </button>
              </div>

              <button
                type="button"
                onClick={handleManualLiveRefresh}
                disabled={liveSyncing}
                title="Jetzt auf neue Trys prüfen"
                className="obsidian-btn inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium active:scale-[0.96] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
              >
                <RefreshCw className={`h-3.5 w-3.5 text-[#34f5c5] ${liveSyncing ? 'animate-spin' : ''}`} />
                <span>{liveSyncing ? 'Prüfe…' : 'Aktualisieren'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLiveLink}
                title="Live-Link für Discord kopieren"
                className="obsidian-btn inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
              >
                {copiedLiveLink ? (
                  <Check className="h-3.5 w-3.5 text-[#34f5c5]" />
                ) : (
                  <Link2 className="h-3.5 w-3.5 text-[#38bdf8]" />
                )}
                <span>{copiedLiveLink ? 'Link kopiert' : 'Live-Link'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Main Workstage */}
        <main className="flex-1 p-4 sm:p-6">
          {error && !isViewingLive ? (
            <div className="rounded-[12px] border border-[rgba(239,68,68,0.34)] bg-[rgba(239,68,68,0.12)] p-4 text-[13px] text-[#f87171]">
              {error}
            </div>
          ) : liveLoading && !isViewingLive ? (
            <div className="flex items-center justify-center py-20 text-[13px] text-[#34f5c5]">
              Verbinde mit WarcraftLogs Live-Log…
            </div>
          ) : !store && !isViewingLive ? (
            <div className="flex items-center justify-center py-20 text-[13px] text-[#8b96a9]">
              Lade Raid-Daten…
            </div>
          ) : (
            <>
              {liveError && (
                <div className="mb-4 rounded-[12px] border border-[rgba(239,68,68,0.34)] bg-[rgba(239,68,68,0.12)] p-3 text-[12px] text-[#f87171]">
                  Live-Sync Hinweis: {liveError}
                </div>
              )}
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
              {activeTab === 'healers' && (
                <HealersTab
                  reports={activeReports}
                  isMultiReport={isMultiReport}
                  searchQuery={searchQuery}
                  maxDeaths={currentMaxDeaths}
                  pullRange={pullRange}
                />
              )}
              {activeTab === 'heart' && (
                <HeartPhaseTab
                  reports={activeReports}
                  isMultiReport={isMultiReport}
                  searchQuery={searchQuery}
                  maxDeaths={currentMaxDeaths}
                  pullRange={pullRange}
                />
              )}
              {activeTab === 'phases' && (
                <PhasesTab
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

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        activeLiveCode={liveReport?.code ?? null}
        liveLoading={liveLoading}
        liveError={liveError}
        onConnectLive={(code) => connectLiveReport(code, false)}
      />
    </div>
  )
}
