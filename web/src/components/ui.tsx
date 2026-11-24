import React from 'react'
import { ChevronDown, ChevronUp, ExternalLink, Hash, Play, Skull } from 'lucide-react'
import { WOW_CLASS_COLORS } from '../lib/stats'
import type { PullRange } from '../lib/stats'

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={`obsidian-card ${className}`}>{children}</div>
}

export function KpiCard({
  label,
  value,
  subtext,
  icon,
  tone = 'default',
}: {
  label: string
  value: string | number
  subtext: string
  icon: React.ReactNode
  tone?: 'default' | 'success' | 'warning' | 'destructive'
}) {
  const valueTone =
    tone === 'destructive'
      ? 'text-[#f87171]'
      : tone === 'warning'
        ? 'text-[#fbbf24]'
        : tone === 'success'
          ? 'text-[#34f5c5]'
          : 'text-white'

  return (
    <Card className="p-[18px] flex flex-col justify-between gap-2">
      <div className="flex items-center justify-between gap-2 text-[12.5px] text-[#c5cdd9]">
        <span className="truncate font-medium">{label}</span>
        <span className="text-[#8b96a9] shrink-0" aria-hidden="true">
          {icon}
        </span>
      </div>
      <div
        className={`font-mono-num text-[27px] font-bold leading-tight tracking-[-0.02em] ${valueTone}`}
      >
        {value}
      </div>
      <div className="text-[12px] text-[#8b96a9] truncate">{subtext}</div>
    </Card>
  )
}

export function Pill({
  children,
  variant = 'neutral',
}: {
  children: React.ReactNode
  variant?: 'neutral' | 'success' | 'warning' | 'destructive' | 'info'
}) {
  const styles =
    variant === 'success'
      ? 'text-[#34f5c5] bg-[rgba(52,245,197,0.12)] border-[rgba(52,245,197,0.34)]'
      : variant === 'info'
        ? 'text-[#38bdf8] bg-[rgba(56,189,248,0.12)] border-[rgba(56,189,248,0.34)]'
        : variant === 'warning'
          ? 'text-[#fbbf24] bg-[rgba(251,191,36,0.12)] border-[rgba(251,191,36,0.34)]'
          : variant === 'destructive'
            ? 'text-[#f87171] bg-[rgba(239,68,68,0.13)] border-[rgba(239,68,68,0.34)]'
            : 'text-[#c5cdd9] bg-[rgba(16,20,27,0.85)] border-[rgba(255,255,255,0.11)]'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[7px] border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${styles}`}
    >
      {children}
    </span>
  )
}

export function ClassDot({ className }: { className: string }) {
  const color = WOW_CLASS_COLORS[className] ?? '#c5cdd9'
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-white/20"
      style={{ backgroundColor: color }}
      title={className || 'Unbekannt'}
      aria-hidden="true"
    />
  )
}

export function WclActionLinks({
  eventsUrl,
  replayUrl,
}: {
  eventsUrl: string
  replayUrl: string
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <a
        href={eventsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="obsidian-btn inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
      >
        <ExternalLink className="h-3 w-3 text-[#38bdf8]" strokeWidth={1.75} aria-hidden="true" />
        Events
      </a>
      <a
        href={replayUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="obsidian-btn inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
      >
        <Play className="h-3 w-3 fill-current text-[#34f5c5]" strokeWidth={1.75} aria-hidden="true" />
        Replay
      </a>
    </div>
  )
}

/**
 * Kompakter Max-Tode-Stepper (Standard: 4 Tode):
 * Zeigt direkt die eingestellte Zahl und unmittelbar daneben Up/Down (mehr / weniger).
 */
export function MaxDeathsStepper({
  value,
  onChange,
}: {
  value: number
  onChange: (next: number) => void
}) {
  const clamp = (n: number) => Math.max(0, Math.min(25, n))

  return (
    <div
      className="inline-flex items-center gap-2 rounded-[10px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,14,22,0.88)] pl-2.5 pr-1.5 py-1 focus-within:border-[rgba(52,245,197,0.5)] focus-within:ring-2 focus-within:ring-[rgba(52,245,197,0.22)] transition-[border-color,box-shadow]"
      title="Filtert alle Listen bis maximal so viele Tode im Try"
    >
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#c5cdd9] select-none whitespace-nowrap">
        <Skull className="h-3.5 w-3.5 text-[#34f5c5]" strokeWidth={1.8} aria-hidden="true" />
        <span>Max. Tode</span>
      </span>

      <div className="inline-flex items-center rounded-[7px] border border-[rgba(255,255,255,0.12)] bg-[#050911] pl-1.5 pr-0.5 py-0.5">
        <input
          type="number"
          min={0}
          max={25}
          value={value}
          aria-label="Maximale Tode im Try"
          onChange={(e) => {
            const parsed = Number.parseInt(e.target.value, 10)
            if (!Number.isNaN(parsed)) {
              onChange(clamp(parsed))
            }
          }}
          className="w-8 bg-transparent text-center font-mono-num text-[13px] font-semibold text-white focus:outline-none"
        />
        <div className="flex flex-col border-l border-[rgba(255,255,255,0.09)] pl-0.5">
          <button
            type="button"
            onClick={() => onChange(clamp(value + 1))}
            aria-label="Maximale Tode erhöhen"
            className="flex h-[13px] w-[18px] items-center justify-center rounded-t-[4px] text-[#c5cdd9] hover:bg-[rgba(52,245,197,0.18)] hover:text-[#34f5c5] active:scale-[0.92] transition-[background-color,color,transform] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#34f5c5]"
          >
            <ChevronUp className="h-3 w-3" strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={() => onChange(clamp(value - 1))}
            aria-label="Maximale Tode verringern"
            className="flex h-[13px] w-[18px] items-center justify-center rounded-b-[4px] text-[#c5cdd9] hover:bg-[rgba(52,245,197,0.18)] hover:text-[#34f5c5] active:scale-[0.92] transition-[background-color,color,transform] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#34f5c5]"
          >
            <ChevronDown className="h-3 w-3" strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function TryRangeFilter({
  range,
  maxPull,
  onChange,
}: {
  range: PullRange
  maxPull: number
  onChange: (next: PullRange) => void
}) {
  const safeMax = Math.max(1, maxPull)
  const clamp = (n: number) => Math.max(1, Math.min(safeMax, n))

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-[10px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,14,22,0.88)] px-2.5 py-1 focus-within:border-[rgba(56,189,248,0.5)] focus-within:ring-2 focus-within:ring-[rgba(56,189,248,0.2)] transition-[border-color,box-shadow]"
      title="Filtert alle Listen von Try X bis Try Y"
    >
      <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#c5cdd9] select-none whitespace-nowrap">
        <Hash className="h-3.5 w-3.5 text-[#38bdf8]" strokeWidth={1.8} aria-hidden="true" />
        <span>Try</span>
      </span>

      <div className="inline-flex items-center rounded-[7px] border border-[rgba(255,255,255,0.12)] bg-[#050911] pl-1 pr-0.5 py-0.5">
        <input
          type="number"
          min={1}
          max={safeMax}
          value={range.from}
          aria-label="Ab Try Nummer"
          onChange={(e) => {
            const p = Number.parseInt(e.target.value, 10)
            if (!Number.isNaN(p)) {
              const nextFrom = clamp(p)
              onChange({ from: nextFrom, to: Math.max(nextFrom, range.to) })
            }
          }}
          className="w-7 bg-transparent text-center font-mono-num text-[12.5px] font-semibold text-white focus:outline-none"
        />
        <div className="flex flex-col border-l border-[rgba(255,255,255,0.09)] pl-0.5">
          <button
            type="button"
            onClick={() => {
              const nf = clamp(range.from + 1)
              onChange({ from: nf, to: Math.max(nf, range.to) })
            }}
            aria-label="Start-Try erhöhen"
            className="flex h-[12px] w-[16px] items-center justify-center rounded-t-[3px] text-[#c5cdd9] hover:bg-[rgba(56,189,248,0.18)] hover:text-[#38bdf8] transition-colors"
          >
            <ChevronUp className="h-2.5 w-2.5" strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={() => onChange({ from: clamp(range.from - 1), to: range.to })}
            aria-label="Start-Try verringern"
            className="flex h-[12px] w-[16px] items-center justify-center rounded-b-[3px] text-[#c5cdd9] hover:bg-[rgba(56,189,248,0.18)] hover:text-[#38bdf8] transition-colors"
          >
            <ChevronDown className="h-2.5 w-2.5" strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <span className="text-[11px] text-[#8b96a9] select-none">–</span>

      <div className="inline-flex items-center rounded-[7px] border border-[rgba(255,255,255,0.12)] bg-[#050911] pl-1 pr-0.5 py-0.5">
        <input
          type="number"
          min={1}
          max={safeMax}
          value={range.to}
          aria-label="Bis Try Nummer"
          onChange={(e) => {
            const p = Number.parseInt(e.target.value, 10)
            if (!Number.isNaN(p)) {
              const nextTo = clamp(p)
              onChange({ from: Math.min(range.from, nextTo), to: nextTo })
            }
          }}
          className="w-7 bg-transparent text-center font-mono-num text-[12.5px] font-semibold text-white focus:outline-none"
        />
        <div className="flex flex-col border-l border-[rgba(255,255,255,0.09)] pl-0.5">
          <button
            type="button"
            onClick={() => onChange({ from: range.from, to: clamp(range.to + 1) })}
            aria-label="End-Try erhöhen"
            className="flex h-[12px] w-[16px] items-center justify-center rounded-t-[3px] text-[#c5cdd9] hover:bg-[rgba(56,189,248,0.18)] hover:text-[#38bdf8] transition-colors"
          >
            <ChevronUp className="h-2.5 w-2.5" strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={() => {
              const nt = clamp(range.to - 1)
              onChange({ from: Math.min(range.from, nt), to: nt })
            }}
            aria-label="End-Try verringern"
            className="flex h-[12px] w-[16px] items-center justify-center rounded-b-[3px] text-[#c5cdd9] hover:bg-[rgba(56,189,248,0.18)] hover:text-[#38bdf8] transition-colors"
          >
            <ChevronDown className="h-2.5 w-2.5" strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function SubFilterPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[]
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div className="obsidian-tabs inline-flex items-center">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`obsidian-tab inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 ${
              active ? 'active' : ''
            }`}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span className="font-mono-num text-[11px] text-[#8b96a9]">{opt.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <p className="text-[14px] font-semibold text-white">{title}</p>
      <p className="mt-1 text-[13px] text-[#8b96a9] max-w-md">{description}</p>
    </div>
  )
}
