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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="w-full max-w-lg rounded-[12px] border border-[#27272a] bg-[#09090b] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#27272a] pb-3.5">
          <div>
            <h2 id="import-modal-title" className="text-[16px] font-semibold text-[#fafafa]">
              Neuen WarcraftLogs-Report hinzufügen
            </h2>
            <p className="mt-0.5 text-[12px] text-[#a1a1aa]">
              Wähle den Browser-Import über GitHub Actions oder das lokale Python-Skript.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dialog schließen"
            className="rounded-[6px] p-1.5 text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Option 1: GitHub Action */}
          <div className="rounded-[8px] border border-[#27272a] bg-[#121215] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[13px] font-semibold text-[#fafafa]">
                  Weg 1: Direkt im Browser (GitHub Actions)
                </div>
                <p className="mt-0.5 text-[12px] text-[#a1a1aa]">
                  Klicke auf „Run workflow“, füge den WCL-Link ein und warte ca. 30 Sek. auf das Live-Update.
                </p>
              </div>
              <a
                href={GITHUB_ACTION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] bg-[#fafafa] px-3 py-1.5 text-[12px] font-semibold text-[#09090b] hover:bg-zinc-200 active:scale-[0.96] transition-[background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                <span>Öffnen</span>
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Option 2: CLI Generator */}
          <div className="rounded-[8px] border border-[#27272a] bg-[#121215] p-3.5 space-y-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#fafafa]">
              <Terminal className="h-4 w-4 text-[#a1a1aa]" strokeWidth={1.75} aria-hidden="true" />
              <span>Weg 2: Lokales Python-Skript (CLI)</span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-medium text-[#a1a1aa]">WarcraftLogs-URL oder Code</span>
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.warcraftlogs.com/reports/…"
                  spellCheck={false}
                  autoComplete="off"
                  className="mt-1 w-full rounded-[6px] border border-[#27272a] bg-[#09090b] px-2.5 py-1.5 text-[12px] text-[#fafafa] placeholder:text-[#71717a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-[#a1a1aa]">Label (optional)</span>
                <input
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  placeholder="z. B. Mittwoch Raid…"
                  autoComplete="off"
                  className="mt-1 w-full rounded-[6px] border border-[#27272a] bg-[#09090b] px-2.5 py-1.5 text-[12px] text-[#fafafa] placeholder:text-[#71717a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-[6px] border border-[#27272a] bg-[#09090b] px-3 py-2">
              <code className="overflow-x-auto font-mono-num text-[11px] text-[#34d399] whitespace-nowrap">
                {cliCommand}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Befehl kopieren"
                className="inline-flex shrink-0 items-center gap-1 rounded-[5px] border border-[#27272a] bg-[#18181b] px-2 py-1 text-[11px] font-medium text-[#fafafa] hover:bg-zinc-800 active:scale-[0.96] transition-[background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-[#34d399]" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Kopiert' : 'Kopieren'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
