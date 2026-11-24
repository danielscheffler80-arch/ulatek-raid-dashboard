import type { ReportData } from '../types'

export const LIVE_POLL_INTERVAL_MS = 30_000
export const LIVE_INACTIVE_MINUTES = 45
export const DEFAULT_CLOUDFLARE_API_ORIGIN = 'https://ulatek-mythic.pages.dev'

export interface LiveStatus {
  code: string
  title: string
  date_iso: string
  start_time_epoch_ms: number
  last_pull_end_epoch_ms: number
  pulls_total: number
  last_fight_id: number
  last_pull_num: number
  last_pull_boss_pct: number | null
  last_pull_is_kill: boolean
  is_today: boolean
  minutes_since_last_pull: number
  is_live: boolean
  cache_version: string
  checked_at: string
}

export interface LiveAnalyzePayload {
  report: ReportData
  live_status: LiveStatus
}

/** Extracts a valid 10–24 char alphanumeric WCL report code from a full URL or raw code. */
export function extractReportCode(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const match = trimmed.match(/reports\/([A-Za-z0-9]{10,24})/)
  const candidate = match ? match[1] : trimmed
  if (!/^[A-Za-z0-9]{10,24}$/.test(candidate)) return null
  return candidate
}

/** Resolves the API origin (same-origin on Cloudflare Pages; fallback to Cloudflare Pages on static mirrors). */
export function getApiBase(): string {
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname
  if (host.endsWith('.github.io')) {
    return DEFAULT_CLOUDFLARE_API_ORIGIN
  }
  return ''
}

export async function fetchLiveStatus(code: string, nocache = false): Promise<LiveStatus> {
  const base = getApiBase()
  const qs = new URLSearchParams({ code })
  if (nocache) qs.set('nocache', '1')
  const resp = await fetch(`${base}/api/live-status?${qs.toString()}`, {
    cache: 'no-store',
  })
  const data = (await resp.json().catch(() => ({}))) as LiveStatus & { error?: string }
  if (!resp.ok) {
    throw new Error(data.error || `Live-Status Fehler (HTTP ${resp.status})`)
  }
  return data
}

export async function fetchLiveAnalyze(
  code: string,
  version?: string,
  nocache = false,
): Promise<LiveAnalyzePayload> {
  const base = getApiBase()
  const qs = new URLSearchParams({ code })
  if (version) qs.set('v', version)
  if (nocache) qs.set('nocache', '1')
  const resp = await fetch(`${base}/api/analyze?${qs.toString()}`, {
    cache: 'no-store',
  })
  const data = (await resp.json().catch(() => ({}))) as LiveAnalyzePayload & { error?: string }
  if (!resp.ok) {
    throw new Error(data.error || `Live-Analyse Fehler (HTTP ${resp.status})`)
  }
  return data
}

export function readLiveCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  return extractReportCode(params.get('live') ?? '')
}

export function syncLiveCodeInUrl(code: string | null): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (code) {
    url.searchParams.set('live', code)
  } else {
    url.searchParams.delete('live')
  }
  window.history.replaceState({}, '', url.toString())
}

export function buildLiveShareUrl(code: string): string {
  if (typeof window === 'undefined') return `${DEFAULT_CLOUDFLARE_API_ORIGIN}/?live=${code}`
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('live', code)
  return url.toString()
}

export function formatMinutesAgo(mins: number): string {
  if (!Number.isFinite(mins) || mins < 0) return '—'
  if (mins < 1) return 'gerade eben'
  if (mins < 60) return `vor ${Math.round(mins)} Min.`
  const hours = Math.floor(mins / 60)
  const rem = Math.round(mins % 60)
  if (hours < 24) return rem > 0 ? `vor ${hours} Std. ${rem} Min.` : `vor ${hours} Std.`
  const days = Math.floor(hours / 24)
  return `vor ${days} Tag${days === 1 ? '' : 'en'}`
}
