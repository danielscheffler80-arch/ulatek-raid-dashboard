import { Flame, LayoutGrid, Skull, Swords, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { OberTabKey } from '../types'

export interface SubTabDef {
  id: string
  label: string
}

export interface OberTabDef {
  key: OberTabKey
  label: string
  icon: LucideIcon
  iconColor: string
  subTabs: SubTabDef[]
}

export const PHASE_NAV_CONFIG: OberTabDef[] = [
  {
    key: 'general',
    label: 'Allgemein',
    icon: LayoutGrid,
    iconColor: '#38bdf8',
    subTabs: [
      { id: 'pulls', label: 'Try-Übersicht' },
      { id: 'defensives', label: 'Def CD / Pot / HS' },
      { id: 'healers', label: 'Heiler' },
    ],
  },
  {
    key: 'p1',
    label: 'Phase 1',
    icon: Flame,
    iconColor: '#34f5c5',
    subTabs: [
      { id: 'egg', label: 'Egg Fails' },
      { id: 'wave', label: 'Wave Fails' },
      { id: 'tank', label: 'Tank Fails' },
      { id: 'p1_soaks', label: 'P1 Soaks' },
      { id: 'heart', label: 'Herzphase' },
      { id: 'defensives', label: 'Def CDs' },
      { id: 'healers', label: 'Heiler' },
    ],
  },
  {
    key: 'p2',
    label: 'Phase 2',
    icon: Swords,
    iconColor: '#fbbf24',
    subTabs: [
      { id: 'p2_overlaps', label: 'Blight Vein' },
      { id: 'p2_kicks', label: 'Malice Kicks' },
      { id: 'p2_warden', label: 'Warden DPS' },
      { id: 'p2_avoidables', label: 'P2 Avoidables' },
      { id: 'defensives', label: 'Def CDs' },
      { id: 'healers', label: 'Heiler' },
    ],
  },
  {
    key: 'intermission',
    label: 'Intermission',
    icon: Users,
    iconColor: '#a78bfa',
    subTabs: [
      { id: 'intermission_soaks', label: 'Shattering Soaks' },
      { id: 'defensives', label: 'Def CDs' },
      { id: 'healers', label: 'Heiler' },
    ],
  },
  {
    key: 'p3',
    label: 'Phase 3',
    icon: Skull,
    iconColor: '#f87171',
    subTabs: [
      { id: 'p3_burn', label: 'P3 Burn' },
      { id: 'p3_kicks', label: 'P3 Kicks' },
      { id: 'p3_avoidables', label: 'P3 Avoidables' },
      { id: 'defensives', label: 'Def CDs' },
      { id: 'healers', label: 'Heiler' },
    ],
  },
]

export function PhaseNavBar({
  activeOber,
  activeSub,
  onSelectOber,
  onSelectSub,
}: {
  activeOber: OberTabKey
  activeSub: string
  onSelectOber: (ober: OberTabKey) => void
  onSelectSub: (ober: OberTabKey, subId: string) => void
}) {
  return (
    <div className="w-full border-b border-[rgba(255,255,255,0.08)] bg-[rgba(7,11,18,0.86)] px-3 py-2 backdrop-blur-md">
      <div className="flex justify-center overflow-x-auto">
        <nav
          aria-label="Phasen-Navigation"
          className="inline-flex max-w-full items-center gap-1 rounded-[14px] border border-[rgba(255,255,255,0.1)] bg-[rgba(9,14,22,0.92)] p-[4px] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        >
          {PHASE_NAV_CONFIG.map((ober) => {
            const Icon = ober.icon
            const isOpen = activeOber === ober.key

            if (!isOpen) {
              return (
                <button
                  key={ober.key}
                  type="button"
                  onClick={() => onSelectOber(ober.key)}
                  aria-expanded={false}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium text-[#b5bfce] transition-[background-color,color,transform] duration-150 hover:bg-[rgba(255,255,255,0.05)] hover:text-white active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
                >
                  <Icon
                    className="h-3.5 w-3.5 shrink-0"
                    strokeWidth={1.75}
                    style={{ color: ober.iconColor }}
                    aria-hidden="true"
                  />
                  <span className="whitespace-nowrap">{ober.label}</span>
                </button>
              )
            }

            return (
              <div
                key={ober.key}
                className="relative inline-flex shrink-0 items-center rounded-[10px] border border-[rgba(52,245,197,0.36)] bg-[linear-gradient(135deg,rgba(52,245,197,0.12),rgba(13,22,34,0.96))] p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                {/* Obertab Header inside Expanded Capsule */}
                <button
                  type="button"
                  onClick={() => onSelectOber(ober.key)}
                  aria-expanded={true}
                  className="inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12.5px] font-semibold text-white transition-[color,transform] duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60"
                >
                  <Icon
                    className="h-3.5 w-3.5 shrink-0"
                    strokeWidth={2}
                    style={{ color: ober.iconColor }}
                    aria-hidden="true"
                  />
                  <span className="whitespace-nowrap">{ober.label}</span>
                </button>

                {/* Thin vertical divider */}
                <span
                  className="mx-1 h-4 w-px shrink-0 bg-[rgba(52,245,197,0.32)]"
                  aria-hidden="true"
                />

                {/* Inline Subtabs */}
                <div className="inline-flex items-center gap-0.5 pr-0.5" role="tablist">
                  {ober.subTabs.map((sub) => {
                    const isSubActive = activeSub === sub.id
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        role="tab"
                        aria-selected={isSubActive}
                        onClick={() => onSelectSub(ober.key, sub.id)}
                        className={`whitespace-nowrap rounded-[7px] px-2.5 py-1 text-[12px] transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34f5c5]/60 ${
                          isSubActive
                            ? 'border border-[rgba(52,245,197,0.45)] bg-[rgba(52,245,197,0.16)] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                            : 'border border-transparent font-medium text-[#9aa5b6] hover:bg-[rgba(255,255,255,0.05)] hover:text-white'
                        }`}
                      >
                        {sub.label}
                      </button>
                    )
                  })}
                </div>

                {/* Glowing Mint-to-Cyan Bottom Accent Bar */}
                <span
                  className="pointer-events-none absolute -bottom-[1px] left-2.5 right-2.5 h-[2.5px] rounded-full bg-gradient-to-r from-[#34f5c5] via-[#22d3ee] to-[#38bdf8] shadow-[0_0_10px_rgba(52,245,197,0.7)]"
                  aria-hidden="true"
                />
              </div>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
