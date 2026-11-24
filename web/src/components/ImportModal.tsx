import { useState } from 'react'
import { Check, Copy, Loader2, Radio, Terminal, X } from 'lucide-react'
import { buildLiveShareUrl, extractReportCode } from '../lib/liveClient'

interface ImportModalProps {
  open: boolean
  onClose: () => void
  activeLiveCode: string | null
  liveLoading: boolean
  liveError: string | null
  onConnectLive: (code: string) => Promise<boolean>
}

export function ImportModal({
  open,
  onClose,
  activeLiveCode,
  liveLoading,
  liveError,
  onConnectLive,
}: ImportModalProps) {
  const [urlInput, setUrlInput] = useState(activeLiveCode ?? '')
  const [labelInput, setLabelInput] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [copiedCli, setCopiedCli] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  if (!open) return null

  const extractedCode = extractReportCode(urlInput)
  const cleanUrl = urlInput.trim() || 'https://www.warcraftlogs.com/reports/DEIN_REPORT_CODE'
  const labelPart = labelInput.trim() ? ` --label "${labelInput.trim()}"` : ''
  const cliCommand = `python scripts/add_log.py "${cleanUrl}"${labelPart} --push`
  const shareCode = extractedCode ?? activeLiveCode
  const shareUrl = shareCode ? buildLiveShareUrl(shareCode) : ''

  const handleSubmitLive = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    const code = extractReportCode(urlInput)
    if (!code) {
      setLocalError('Bitte eine gültige WarcraftLogs-Report-URL oder den 16-stelligen Report-Code eingeben.')
      return
    }
    const ok = await onConnectLive(code)
    if (ok) {
      onClose()
    }
  }

  const handleCopyCli = async () => {
    try {
      await navigator.clipboard.writeText(cliCommand)
      setCopiedCli(true)
      setTimeout(() => setCopiedCli(false), 1800)
    } catch {
      // Clipboard API fallback ignored
    }
  }

  const handleCopyShare = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 1800)
    } catch {
      // Clipboard API fallback ignored
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,6,12,0.8)] backdrop-blur-[6px] p-4 overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="obsidian-modal w-full max-w-lg p-5">
        <div className="flex items-start justify-between gap-4 border-b border-[rgba(255,255,255,0.09)] pb-3.5">
          <div>
            <h2 id="import-modal-title" className="text-[16px] font-semibold text-white">
              Live-Log verbinden &amp; analysieren
            </h2>
            <p className="mt-0.5 text-[12px] text-[#c5cdd9]">
              WarcraftLogs-URL oder Code einfügen — erkennt laufende Raid-Logs automatisch (30 s Sync).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dialog schließen"
            className="obsidian-btn p-1.5 text-[#c5cdd9] hover:text-white active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Primär: Live-Log sofort verbinden */}
          <form
            onSubmit={handleSubmitLive}
            className="rounded-[12px] border border-[rgba(52,245,197,0.3)] bg-[rgba(16,20,27,0.82)] p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
              <Radio className="h-4 w-4 text-[#34f5c5]" strokeWidth={2} aria-hidden="true" />
              <span>Sofort-Analyse &amp; Live-Tracking (Cloudflare Edge)</span>
            </div>
            <p className="text-[12px] text-[#c5cdd9] leading-relaxed">
              Lädt alle Ula&apos;tek-Mythic-Trys direkt über die WCL-API. Ist der Report von{' '}
              <span className="text-white font-medium">heute</span> und der letzte Try{' '}
              <span className="text-[#34f5c5] font-medium">≤ 45 Min. her</span>, wird alle{' '}
              <span className="text-white font-medium">30 Sek.</span> automatisch nach neuen Trys gesucht
              und standardmäßig der <span className="text-white font-medium">aktuelle Try</span> angezeigt.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value)
                  setLocalError(null)
                }}
                placeholder="https://www.warcraftlogs.com/reports/…"
                aria-label="WarcraftLogs URL oder Report-Code"
                spellCheck={false}
                autoComplete="off"
                autoFocus
                className="flex-1 rounded-[8px] border border-[rgba(255,255,255,0.14)] bg-[rgba(5,9,17,0.92)] px-3 py-2 text-[12px] text-white placeholder:text-[#8b96a9] focus-visible:outline-none focus-visible:border-[rgba(52,245,197,0.55)] focus-visible:ring-2 focus-visible:ring-[rgba(52,245,197,0.22)]"
              />
              <button
                type="submit"
                disabled={liveLoading}
                className="obsidian-btn-primary inline-flex shrink-0 items-center justify-center gap-1.5 px-4 py-2 text-[12px] active:scale-[0.96] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]"
              >
                {liveLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Lade Log…</span>
                  </>
                ) : (
                  <>
                    <Radio className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                    <span>Verbinden</span>
                  </>
                )}
              </button>
            </div>

            {(localError || liveError) && (
              <div className="rounded-[8px] border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.12)] px-3 py-2 text-[12px] text-[#f87171]">
                {localError || liveError}
              </div>
            )}

            {shareUrl && (
              <div className="flex items-center justify-between gap-2 rounded-[8px] border border-[rgba(255,255,255,0.09)] bg-[#050911] px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.6px] text-[#8b96a9]">
                    Direktlink für den Raid (Discord)
                  </div>
                  <div className="truncate font-mono-num text-[11px] text-[#34f5c5]">
                    {shareUrl}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyShare}
                  className="obsidian-btn inline-flex shrink-0 items-center gap-1 px-2.5 py-1 text-[11px] font-medium active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
                >
                  {copiedLink ? <Check className="h-3.5 w-3.5 text-[#34f5c5]" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedLink ? 'Kopiert' : 'Link kopieren'}</span>
                </button>
              </div>
            )}
          </form>

          {/* Sekundär: Dauerhafte Archivierung über lokales CLI */}
          <details className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(16,20,27,0.6)] p-3.5">
            <summary className="flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-[#c5cdd9] select-none hover:text-white">
              <Terminal className="h-3.5 w-3.5 text-[#38bdf8]" strokeWidth={1.75} aria-hidden="true" />
              <span>Optional: Raidabend dauerhaft im Archiv speichern (CLI)</span>
            </summary>

            <div className="mt-3 space-y-2.5">
              <label className="block">
                <span className="text-[11px] font-medium text-[#c5cdd9]">Label für den Raidabend (optional)</span>
                <input
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  placeholder="z. B. Mittwoch Raid…"
                  autoComplete="off"
                  className="mt-1 w-full rounded-[8px] border border-[rgba(255,255,255,0.11)] bg-[rgba(5,9,17,0.9)] px-2.5 py-1.5 text-[12px] text-white placeholder:text-[#8b96a9] focus-visible:outline-none focus-visible:border-[rgba(52,245,197,0.5)]"
                />
              </label>

              <div className="flex items-center justify-between gap-2 rounded-[8px] border border-[rgba(255,255,255,0.09)] bg-[#050911] px-3 py-2">
                <code className="overflow-x-auto font-mono-num text-[11px] text-[#34f5c5] whitespace-nowrap">
                  {cliCommand}
                </code>
                <button
                  type="button"
                  onClick={handleCopyCli}
                  aria-label="CLI-Befehl kopieren"
                  className="obsidian-btn inline-flex shrink-0 items-center gap-1 px-2.5 py-1 text-[11px] font-medium active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
                >
                  {copiedCli ? <Check className="h-3.5 w-3.5 text-[#34f5c5]" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedCli ? 'Kopiert' : 'Kopieren'}</span>
                </button>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
