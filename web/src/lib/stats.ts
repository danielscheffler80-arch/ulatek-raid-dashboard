import type {
  DefensiveEvent,
  EggFail,
  ReportData,
  TankFail,
  WaveFail,
} from '../types'

export type WithReport<T> = T & {
  reportCode: string
  reportLabel: string
  reportDate: string
}

export function getReportDisplayName(report: ReportData): string {
  return report.label || report.title || report.code
}

export function filterByMaxDeaths<T extends { deaths_before: number }>(
  items: T[],
  maxDeaths: number | null,
): T[] {
  if (maxDeaths === null) return items
  return items.filter((item) => item.deaths_before <= maxDeaths)
}

export interface PhaseBucket {
  label: string
  count: number
  pct: number
}

export function computePhaseBuckets(items: { rel_ms: number }[]): PhaseBucket[] {
  const counts = [0, 0, 0]
  for (const item of items) {
    if (item.rel_ms < 75_000) counts[0]++
    else if (item.rel_ms < 140_000) counts[1]++
    else counts[2]++
  }
  const total = items.length
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  return [
    { label: 'Runde 1 (< 01:15)', count: counts[0], pct: pct(counts[0]) },
    { label: 'Runde 2 (01:15–02:20)', count: counts[1], pct: pct(counts[1]) },
    { label: 'Runde 3+ (≥ 02:20)', count: counts[2], pct: pct(counts[2]) },
  ]
}

export interface EggPlayerRow {
  player: string
  className: string
  count: number
  causticCount: number
  splashCount: number
  lethalCount: number
  items: WithReport<EggFail>[]
}

export function aggregateEggFails(
  reports: ReportData[],
  maxDeaths: number | null,
  subFilter: 'all' | 'caustic_waves' | 'noxious_splash' = 'all',
) {
  const raw: WithReport<EggFail>[] = []
  for (const rep of reports) {
    const label = getReportDisplayName(rep)
    for (const item of rep.egg_fails) {
      if (subFilter !== 'all' && item.kind !== subFilter) continue
      raw.push({ ...item, reportCode: rep.code, reportLabel: label, reportDate: rep.date_iso })
    }
  }
  const filtered = filterByMaxDeaths(raw, maxDeaths)
  const byPlayer = new Map<string, EggPlayerRow>()

  for (const item of filtered) {
    let row = byPlayer.get(item.player)
    if (!row) {
      row = {
        player: item.player,
        className: item.class,
        count: 0,
        causticCount: 0,
        splashCount: 0,
        lethalCount: 0,
        items: [],
      }
      byPlayer.set(item.player, row)
    }
    row.count++
    if (item.kind === 'caustic_waves') row.causticCount++
    if (item.kind === 'noxious_splash') row.splashCount++
    if (item.lethal) row.lethalCount++
    row.items.push(item)
  }

  const players = Array.from(byPlayer.values()).sort(
    (a, b) => b.count - a.count || a.player.localeCompare(b.player),
  )
  for (const p of players) {
    p.items.sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.pull_num - b.pull_num || a.timestamp - b.timestamp)
  }

  return {
    total: filtered.length,
    causticTotal: filtered.filter((x) => x.kind === 'caustic_waves').length,
    splashTotal: filtered.filter((x) => x.kind === 'noxious_splash').length,
    lethalTotal: filtered.filter((x) => x.lethal).length,
    affectedPlayers: players.length,
    phases: computePhaseBuckets(filtered),
    items: filtered,
    players,
  }
}

export interface WavePlayerRow {
  player: string
  className: string
  count: number
  withShellCount: number
  lethalCount: number
  totalDamage: number
  avgDamage: number
  items: WithReport<WaveFail>[]
}

export function aggregateWaveFails(reports: ReportData[], maxDeaths: number | null) {
  const raw: WithReport<WaveFail>[] = []
  for (const rep of reports) {
    const label = getReportDisplayName(rep)
    for (const item of rep.wave_fails) {
      raw.push({ ...item, reportCode: rep.code, reportLabel: label, reportDate: rep.date_iso })
    }
  }
  const filtered = filterByMaxDeaths(raw, maxDeaths)
  const byPlayer = new Map<string, WavePlayerRow>()

  for (const item of filtered) {
    let row = byPlayer.get(item.player)
    if (!row) {
      row = {
        player: item.player,
        className: item.class,
        count: 0,
        withShellCount: 0,
        lethalCount: 0,
        totalDamage: 0,
        avgDamage: 0,
        items: [],
      }
      byPlayer.set(item.player, row)
    }
    row.count++
    if (item.had_noxious_shell) row.withShellCount++
    if (item.lethal) row.lethalCount++
    row.totalDamage += item.damage
    row.items.push(item)
  }

  const players = Array.from(byPlayer.values())
    .map((p) => ({
      ...p,
      avgDamage: p.count > 0 ? Math.round(p.totalDamage / p.count) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.player.localeCompare(b.player))

  for (const p of players) {
    p.items.sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.pull_num - b.pull_num || a.timestamp - b.timestamp)
  }

  return {
    total: filtered.length,
    withShellTotal: filtered.filter((x) => x.had_noxious_shell).length,
    lethalTotal: filtered.filter((x) => x.lethal).length,
    affectedPlayers: players.length,
    phases: computePhaseBuckets(filtered),
    items: filtered,
    players,
  }
}

export interface TankPlayerRow {
  tank: string
  className: string
  count: number
  tentacleCount: number
  stoneVenomCount: number
  lowestHpPct: number | null
  items: WithReport<TankFail>[]
}

export function aggregateTankFails(
  reports: ReportData[],
  maxDeaths: number | null,
  subFilter: 'all' | 'tentacle_aggro' | 'stone_venom_no_def' = 'all',
) {
  const raw: WithReport<TankFail>[] = []
  for (const rep of reports) {
    const label = getReportDisplayName(rep)
    for (const item of rep.tank_fails) {
      if (subFilter !== 'all' && item.kind !== subFilter) continue
      raw.push({ ...item, reportCode: rep.code, reportLabel: label, reportDate: rep.date_iso })
    }
  }
  const filtered = filterByMaxDeaths(raw, maxDeaths)
  const byTank = new Map<string, TankPlayerRow>()

  for (const item of filtered) {
    let row = byTank.get(item.tank)
    if (!row) {
      row = {
        tank: item.tank,
        className: item.tank_class,
        count: 0,
        tentacleCount: 0,
        stoneVenomCount: 0,
        lowestHpPct: null,
        items: [],
      }
      byTank.set(item.tank, row)
    }
    row.count++
    if (item.kind === 'tentacle_aggro') row.tentacleCount++
    if (item.kind === 'stone_venom_no_def') {
      row.stoneVenomCount++
      if (item.min_hp_pct !== null && (row.lowestHpPct === null || item.min_hp_pct < row.lowestHpPct)) {
        row.lowestHpPct = item.min_hp_pct
      }
    }
    row.items.push(item)
  }

  const players = Array.from(byTank.values()).sort(
    (a, b) => b.count - a.count || a.tank.localeCompare(b.tank),
  )
  for (const p of players) {
    p.items.sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.pull_num - b.pull_num || a.timestamp - b.timestamp)
  }

  return {
    total: filtered.length,
    tentacleCount: filtered.filter((x) => x.kind === 'tentacle_aggro').length,
    stoneVenomCount: filtered.filter((x) => x.kind === 'stone_venom_no_def').length,
    items: filtered,
    players,
  }
}

export interface DefensivePlayerRow {
  player: string
  className: string
  pullsPresent: number
  potPulls: number
  hsPulls: number
  potRatePct: number
  hsRatePct: number
  defCdCasts: number
  lowSpikes: number
  lowSpikesWithDef: number
  lowSpikesNoDef: number
  defSpikeRatePct: number
  deaths: number
  deathsNoDef: number
  deathsNoPotNoHs: number
  items: WithReport<DefensiveEvent>[]
}

export function aggregateDefensives(reports: ReportData[], maxDeaths: number | null) {
  const byPlayer = new Map<string, DefensivePlayerRow>()

  const ensure = (player: string, className: string) => {
    let row = byPlayer.get(player)
    if (!row) {
      row = {
        player,
        className,
        pullsPresent: 0,
        potPulls: 0,
        hsPulls: 0,
        potRatePct: 0,
        hsRatePct: 0,
        defCdCasts: 0,
        lowSpikes: 0,
        lowSpikesWithDef: 0,
        lowSpikesNoDef: 0,
        defSpikeRatePct: 0,
        deaths: 0,
        deathsNoDef: 0,
        deathsNoPotNoHs: 0,
        items: [],
      }
      byPlayer.set(player, row)
    }
    return row
  }

  const allEvents: WithReport<DefensiveEvent>[] = []
  for (const rep of reports) {
    const label = getReportDisplayName(rep)
    for (const u of rep.consumable_usage) {
      const row = ensure(u.player, u.class)
      row.pullsPresent++
      if (u.used_health_pot) row.potPulls++
      if (u.used_healthstone) row.hsPulls++
      row.defCdCasts += u.def_cd_casts
    }
    for (const ev of filterByMaxDeaths(rep.defensive_events, maxDeaths)) {
      const enriched: WithReport<DefensiveEvent> = {
        ...ev,
        reportCode: rep.code,
        reportLabel: label,
        reportDate: rep.date_iso,
      }
      allEvents.push(enriched)
      const row = ensure(ev.player, ev.class)
      row.items.push(enriched)
      if (ev.kind === 'low_hp_spike') {
        row.lowSpikes++
        if (ev.had_def_cd) row.lowSpikesWithDef++
        else row.lowSpikesNoDef++
      } else if (ev.kind === 'death') {
        row.deaths++
        if (!ev.had_def_cd) row.deathsNoDef++
        if (!ev.pot_used_in_pull && !ev.hs_used_in_pull) row.deathsNoPotNoHs++
      }
    }
  }

  const players = Array.from(byPlayer.values())
    .map((p) => ({
      ...p,
      potRatePct: p.pullsPresent > 0 ? Math.round((p.potPulls / p.pullsPresent) * 100) : 0,
      hsRatePct: p.pullsPresent > 0 ? Math.round((p.hsPulls / p.pullsPresent) * 100) : 0,
      defSpikeRatePct: p.lowSpikes > 0 ? Math.round((p.lowSpikesWithDef / p.lowSpikes) * 100) : 100,
    }))
    .sort(
      (a, b) =>
        b.deathsNoPotNoHs - a.deathsNoPotNoHs ||
        b.lowSpikesNoDef - a.lowSpikesNoDef ||
        a.player.localeCompare(b.player),
    )

  for (const p of players) {
    p.items.sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.pull_num - b.pull_num || a.timestamp - b.timestamp)
  }

  const totalSpikes = allEvents.filter((e) => e.kind === 'low_hp_spike').length
  const totalSpikesWithDef = allEvents.filter((e) => e.kind === 'low_hp_spike' && e.had_def_cd).length
  const totalDeaths = allEvents.filter((e) => e.kind === 'death').length
  const totalDeathsNoPotNoHs = allEvents.filter((e) => e.kind === 'death' && !e.pot_used_in_pull && !e.hs_used_in_pull).length
  const totalPullPlayerSlots = players.reduce((s, p) => s + p.pullsPresent, 0)
  const totalPotPulls = players.reduce((s, p) => s + p.potPulls, 0)
  const totalHsPulls = players.reduce((s, p) => s + p.hsPulls, 0)

  return {
    totalSpikes,
    totalSpikesWithDef,
    spikeDefRatePct: totalSpikes > 0 ? Math.round((totalSpikesWithDef / totalSpikes) * 100) : 0,
    totalDeaths,
    totalDeathsNoPotNoHs,
    overallPotRatePct: totalPullPlayerSlots > 0 ? Math.round((totalPotPulls / totalPullPlayerSlots) * 100) : 0,
    overallHsRatePct: totalPullPlayerSlots > 0 ? Math.round((totalHsPulls / totalPullPlayerSlots) * 100) : 0,
    players,
  }
}

export function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatDamage(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}k`
  return String(amount)
}

export const WOW_CLASS_COLORS: Record<string, string> = {
  DeathKnight: '#C41E3A',
  DemonHunter: '#A330C9',
  Druid: '#FF7C0A',
  Evoker: '#33937F',
  Hunter: '#AAD372',
  Mage: '#3FC7EB',
  Monk: '#00FF98',
  Paladin: '#F48CBA',
  Priest: '#FFFFFF',
  Rogue: '#FFF468',
  Shaman: '#0070DD',
  Warlock: '#8788EE',
  Warrior: '#C69B6D',
}
