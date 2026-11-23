import { useState } from 'react'
import { Check, Copy, ExternalLink, Terminal, X } from 'lucide-react'
import { GITHUB_ACTION_URL } from './Sidebar'

export function ImportModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [urlInput, setUrlInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [copied, setCopied] = useState(false)

  if (!open) return null

  const cleanUrl = urlInput.trim() || 'https://www.warcraftlogs.com/reports/DEIN_REPORT_CODE'
  const labelPart = labelInput.trim() ? ` --label "${labelInput.trim()}"` : ''
  const cliCommand = `python scripts/add_log.py "${cleanUrl}"${labelPart} --push`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cliCommand)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
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
              Neuen WarcraftLogs-Report hinzufügen
            </h2>
            <p className="mt-0.5 text-[12px] text-[#c5cdd9]">
              Wähle den Browser-Import über GitHub Actions oder das lokale Python-Skript.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dialog schließen"
            className="obsidian-btn p-1.5 text-[#c5cdd9] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-[10px] border border-[rgba(52,245,197,0.24)] bg-[rgba(16,20,27,0.78)] p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-white">
                  Weg 1: Direkt im Browser (GitHub Actions)
                </div>
                <p className="mt-0.5 text-[12px] text-[#c5cdd9]">
                  Auf „Run workflow“ klicken, WCL-Link einfügen — nach ~30 Sek. automatisch live.
                </p>
              </div>
              <a
                href={GITHUB_ACTION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="obsidian-btn-primary inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]"
              >
                <span>Öffnen</span>
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="rounded-[10px] border border-[rgba(255,255,255,0.09)] bg-[rgba(16,20,27,0.72)] p-3.5 space-y-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
              <Terminal className="h-4 w-4 text-[#38bdf8]" strokeWidth={1.75} aria-hidden="true" />
              <span>Weg 2: Lokales Python-Skript (CLI)</span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-medium text-[#c5cdd9]">WarcraftLogs-URL oder Code</span>
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.warcraftlogs.com/reports/…"
                  spellCheck={false}
                  autoComplete="off"
                  className="mt-1 w-full rounded-[8px] border border-[rgba(255,255,255,0.11)] bg-[rgba(5,9,17,0.9)] px-2.5 py-1.5 text-[12px] text-white placeholder:text-[#8b96a9] focus-visible:outline-none focus-visible:border-[rgba(52,245,197,0.5)]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-[#c5cdd9]">Label (optional)</span>
                <input
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  placeholder="z. B. Mittwoch Raid…"
                  autoComplete="off"
                  className="mt-1 w-full rounded-[8px] border border-[rgba(255,255,255,0.11)] bg-[rgba(5,9,17,0.9)] px-2.5 py-1.5 text-[12px] text-white placeholder:text-[#8b96a9] focus-visible:outline-none focus-visible:border-[rgba(52,245,197,0.5)]"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-[8px] border border-[rgba(255,255,255,0.09)] bg-[#050911] px-3 py-2">
              <code className="overflow-x-auto font-mono-num text-[11px] text-[#34f5c5] whitespace-nowrap">
                {cliCommand}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Befehl kopieren"
                className="obsidian-btn inline-flex shrink-0 items-center gap-1 px-2.5 py-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-[#34f5c5]" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Kopiert' : 'Kopieren'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
