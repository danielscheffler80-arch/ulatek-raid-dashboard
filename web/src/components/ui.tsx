import React from 'react'
import { ExternalLink, Play, Skull } from 'lucide-react'
import { WOW_CLASS_COLORS } from '../lib/stats'

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-[10px] border border-[#27272a] bg-[#09090b] ${className}`}
    >
      {children}
    </div>
  )
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
          ? 'text-[#34d399]'
          : 'text-[#fafafa]'

  return (
    <Card className="p-[18px] flex flex-col justify-between gap-2">
      <div className="flex items-center justify-between gap-2 text-[13px] text-[#a1a1aa]">
        <span className="truncate font-medium">{label}</span>
        <span className="text-[#71717a] shrink-0" aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className={`font-mono-num text-[26px] font-bold leading-tight tracking-tight ${valueTone}`}>
        {value}
      </div>
      <div className="text-[12px] text-[#71717a] truncate">{subtext}</div>
    </Card>
  )
}

export function Pill({
  children,
  variant = 'neutral',
}: {
  children: React.ReactNode
  variant?: 'neutral' | 'success' | 'warning' | 'destructive'
}) {
  const styles =
    variant === 'success'
      ? 'text-[#34d399] bg-[rgba(16,185,129,0.12)] border-[rgba(16,185,129,0.3)]'
      : variant === 'warning'
        ? 'text-[#fbbf24] bg-[rgba(245,158,11,0.12)] border-[rgba(245,158,11,0.3)]'
        : variant === 'destructive'
          ? 'text-[#f87171] bg-[rgba(239,68,68,0.12)] border-[rgba(239,68,68,0.3)]'
          : 'text-[#a1a1aa] bg-[#18181b] border-[#27272a]'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${styles}`}
    >
      {children}
    </span>
  )
}

export function ClassDot({ className }: { className: string }) {
  const color = WOW_CLASS_COLORS[className] ?? '#a1a1aa'
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-white/15"
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
        className="inline-flex items-center gap-1 rounded-[6px] border border-[#27272a] bg-[#121215] px-2 py-1 text-[11px] font-medium text-[#fafafa] hover:bg-[#18181b] hover:border-zinc-600 active:scale-[0.96] transition-[background-color,border-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        <ExternalLink className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
        Events
      </a>
      <a
        href={replayUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-[6px] border border-[#27272a] bg-[#18181b] px-2 py-1 text-[11px] font-medium text-[#fafafa] hover:bg-zinc-800 hover:border-zinc-600 active:scale-[0.96] transition-[background-color,border-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        <Play className="h-3 w-3 fill-current" strokeWidth={1.75} aria-hidden="true" />
        Replay
      </a>
    </div>
  )
}

const PRESET_DEATH_LIMITS: Array<number | null> = [null, 0, 1, 2, 3, 5]

export function MaxDeathsFilter({
  value,
  onChange,
}: {
  value: number | null
  onChange: (next: number | null) => void
}) {
  const isCustom = value !== null && !PRESET_DEATH_LIMITS.includes(value)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#a1a1aa]">
        <Skull className="h-3.5 w-3.5 text-[#71717a]" strokeWidth={1.75} aria-hidden="true" />
        <span>Bis max. Tode:</span>
      </div>
      <div
        className="inline-flex items-center rounded-[8px] border border-[#27272a] bg-[#18181b] p-[3px]"
        role="group"
        aria-label="Filter bis maximale Anzahl Tode"
      >
        {PRESET_DEATH_LIMITS.map((preset) => {
          const active = value === preset
          return (
            <button
              key={preset === null ? 'all' : String(preset)}
              type="button"
              onClick={() => onChange(preset)}
              className={`rounded-[5px] px-2.5 py-1 text-[12px] font-mono-num transition-[background-color,color,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                active
                  ? 'bg-[#09090b] text-[#fafafa] font-semibold'
                  : 'text-[#a1a1aa] hover:text-[#fafafa]'
              }`}
            >
              {preset === null ? 'Alle' : preset}
            </button>
          )
        })}
      </div>
      <label className="inline-flex items-center gap-1.5 text-[12px] text-[#71717a]">
        <span className="sr-only">Eigene maximale Tode</span>
        <input
          type="number"
          min={0}
          max={25}
          placeholder="Zahl…"
          value={isCustom ? value : ''}
          onChange={(e) => {
            const raw = e.target.value.trim()
            if (raw === '') {
              onChange(null)
              return
            }
            const parsed = Number.parseInt(raw, 10)
            if (!Number.isNaN(parsed) && parsed >= 0) {
              onChange(parsed)
            }
          }}
          className="w-[70px] rounded-[6px] border border-[#27272a] bg-[#121215] px-2 py-1 text-[12px] font-mono-num text-[#fafafa] placeholder:text-[#71717a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        />
      </label>
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
    <div className="inline-flex items-center rounded-[8px] border border-[#27272a] bg-[#18181b] p-[3px]">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] transition-[background-color,color,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
              active
                ? 'bg-[#09090b] text-[#fafafa] font-semibold'
                : 'text-[#a1a1aa] hover:text-[#fafafa]'
            }`}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span className="font-mono-num text-[11px] text-[#71717a]">{opt.count}</span>
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
      <p className="text-[14px] font-medium text-[#fafafa]">{title}</p>
      <p className="mt-1 text-[13px] text-[#71717a] max-w-md">{description}</p>
    </div>
  )
}
