import type {
  DefensiveEvent,
  EggCarrierEvent,
  EggFail,
  HeartPhaseWindow,
  P3PullSummary,
  PhaseEvent,
  ReportData,
  TankFail,
  WardenPullSummary,
  WaveFail,
} from '../types'

export type WithReport<T> = T & {
  reportCode: string
  reportLabel: string
  reportDate: string
}

export interface PullRange {
  from: number
  to: number
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

export function filterByPullRange<T extends { pull_num: number }>(
  items: T[],
  pullRange?: PullRange | null,
): T[] {
  if (!pullRange) return items
  const lo = Math.min(pullRange.from, pullRange.to)
  const hi = Math.max(pullRange.from, pullRange.to)
  return items.filter((item) => item.pull_num >= lo && item.pull_num <= hi)
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
  isRegular: boolean
  takenWhileAllRegularsAliveCount: number
  takenAsDeadBackupCount: number
  count: number
  waveCount: number
  collisionCount: number
  lethalCount: number
  avgDamage: number
  items: WithReport<EggFail>[]
}

export interface EggCollisionParticipant {
  player: string
  className: string
  isRegular: boolean
  allRegularsAliveAtPickup: boolean | null
  deadRegularsAtPickup: string[]
  damage: number
  lethal: boolean
  events_url: string
}

export interface EggCollisionIncident {
  id: string
  reportCode: string
  reportDate: string
  reportLabel: string
  pull_num: number
  fight_id: number
  rel_time: string
  rel_ms: number
  timestamp: number
  deaths_before: number
  gap_ms: number
  lethal: boolean
  participants: EggCollisionParticipant[]
  events_url: string
  replay_url: string
}

export function aggregateEggFails(
  reports: ReportData[],
  maxDeaths: number | null,
  pullRange?: PullRange | null,
  subFilter: 'all' | 'caustic_waves' | 'egg_collision' = 'all',
) {
  const rawFails: WithReport<EggFail>[] = []
  const rawSplashes: WithReport<EggFail>[] = []
  const playerClassMap: Record<string, string> = {}
  const regularSet = new Set<string>()
  const regularOrdered: string[] = []

  for (const rep of reports) {
    for (const pl of rep.players ?? []) {
      if (pl.name && pl.class) playerClassMap[pl.name] = pl.class
    }
    for (const rc of rep.egg_regular_carriers ?? []) {
      if (!regularSet.has(rc)) {
        regularSet.add(rc)
        regularOrdered.push(rc)
      }
    }
    const label = getReportDisplayName(rep)
    for (const item of rep.egg_fails) {
      if (item.player && item.class) playerClassMap[item.player] = item.class
      const enriched: WithReport<EggFail> = {
        ...item,
        reportCode: rep.code,
        reportLabel: label,
        reportDate: rep.date_iso,
      }
      if (item.kind === 'caustic_waves' || item.kind === 'egg_collision') {
        rawFails.push(enriched)
      } else if (item.kind === 'noxious_splash') {
        rawSplashes.push(enriched)
      }
    }
  }

  const hasRegularList = regularOrdered.length > 0
  const regularCarriers = regularOrdered.map((name) => ({
    name,
    className: playerClassMap[name] ?? '',
  }))

  const allFilteredFails = filterByPullRange(filterByMaxDeaths(rawFails, maxDeaths), pullRange)
  const filtered =
    subFilter === 'all' ? allFilteredFails : allFilteredFails.filter((x) => x.kind === subFilter)
  const filteredSplashes = filterByPullRange(filterByMaxDeaths(rawSplashes, maxDeaths), pullRange)
  const byPlayer = new Map<string, EggPlayerRow & { totalDamage: number }>()

  for (const item of filtered) {
    const isReg = hasRegularList ? (item.is_regular ?? regularSet.has(item.player)) : true
    let row = byPlayer.get(item.player)
    if (!row) {
      row = {
        player: item.player,
        className: item.class,
        isRegular: isReg,
        takenWhileAllRegularsAliveCount: 0,
        takenAsDeadBackupCount: 0,
        count: 0,
        waveCount: 0,
        collisionCount: 0,
        lethalCount: 0,
        avgDamage: 0,
        totalDamage: 0,
        items: [],
      }
      byPlayer.set(item.player, row)
    }
    row.count++
    if (!isReg) {
      if (item.all_regulars_alive_at_pickup === true) row.takenWhileAllRegularsAliveCount++
      else if (item.all_regulars_alive_at_pickup === false) row.takenAsDeadBackupCount++
    }
    if (item.kind === 'caustic_waves') row.waveCount++
    if (item.kind === 'egg_collision') row.collisionCount++
    if (item.lethal) row.lethalCount++
    row.totalDamage += item.damage
    row.items.push(item)
  }

  const players: EggPlayerRow[] = Array.from(byPlayer.values())
    .map(({ totalDamage, ...rest }) => ({
      ...rest,
      avgDamage: rest.count > 0 ? Math.round(totalDamage / rest.count) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.player.localeCompare(b.player))

  for (const p of players) {
    p.items.sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.pull_num - b.pull_num || a.timestamp - b.timestamp)
  }

  const waveItems = allFilteredFails.filter((x) => x.kind === 'caustic_waves')
  const collisionItems = allFilteredFails.filter((x) => x.kind === 'egg_collision')

  // Group paired egg_collision events (same report + fight within <= 300 ms) into deduplicated incidents
  const collisionsByFight = new Map<string, WithReport<EggFail>[]>()
  for (const item of collisionItems) {
    const key = `${item.reportCode}:${item.fight_id}`
    const list = collisionsByFight.get(key)
    if (list) list.push(item)
    else collisionsByFight.set(key, [item])
  }

  const collisionIncidents: EggCollisionIncident[] = []
  for (const fightItems of collisionsByFight.values()) {
    const sorted = [...fightItems].sort((a, b) => a.timestamp - b.timestamp || a.player.localeCompare(b.player))
    const clusters: WithReport<EggFail>[][] = []
    for (const ev of sorted) {
      const lastCluster = clusters[clusters.length - 1]
      if (lastCluster && ev.timestamp - lastCluster[lastCluster.length - 1].timestamp <= 300) {
        lastCluster.push(ev)
      } else {
        clusters.push([ev])
      }
    }

    for (const cluster of clusters) {
      const first = cluster[0]
      const participantMap = new Map<string, EggCollisionParticipant>()
      for (const ev of cluster) {
        const existing = participantMap.get(ev.player)
        const evIsReg = hasRegularList ? (ev.is_regular ?? regularSet.has(ev.player)) : true
        if (!existing) {
          participantMap.set(ev.player, {
            player: ev.player,
            className: ev.class || playerClassMap[ev.player] || '',
            isRegular: evIsReg,
            allRegularsAliveAtPickup: evIsReg ? null : (ev.all_regulars_alive_at_pickup ?? null),
            deadRegularsAtPickup: evIsReg ? [] : (ev.dead_regulars_at_pickup ?? []),
            damage: ev.damage,
            lethal: ev.lethal,
            events_url: ev.events_url,
          })
        } else {
          existing.damage = Math.max(existing.damage, ev.damage)
          existing.lethal = existing.lethal || ev.lethal
        }
      }
      // Include any collision_partners referenced by events in this cluster if filtered out at exact death boundary
      for (const ev of cluster) {
        for (const partnerName of ev.collision_partners ?? []) {
          if (!participantMap.has(partnerName)) {
            const pIsReg = hasRegularList ? regularSet.has(partnerName) : true
            participantMap.set(partnerName, {
              player: partnerName,
              className: playerClassMap[partnerName] || '',
              isRegular: pIsReg,
              allRegularsAliveAtPickup: null,
              deadRegularsAtPickup: [],
              damage: 0,
              lethal: false,
              events_url: ev.events_url,
            })
          }
        }
      }

      const participants = Array.from(participantMap.values()).sort((a, b) =>
        a.player.localeCompare(b.player),
      )
      const measuredSpan =
        cluster.length >= 2
          ? Math.max(...cluster.map((e) => e.timestamp)) - Math.min(...cluster.map((e) => e.timestamp))
          : first.collision_gap_ms ?? 0
      const gapMs =
        first.collision_gap_ms != null ? Math.max(first.collision_gap_ms, measuredSpan) : measuredSpan

      collisionIncidents.push({
        id: `${first.reportCode}-${first.fight_id}-${first.timestamp}-colpair`,
        reportCode: first.reportCode,
        reportDate: first.reportDate,
        reportLabel: first.reportLabel,
        pull_num: first.pull_num,
        fight_id: first.fight_id,
        rel_time: first.rel_time,
        rel_ms: first.rel_ms,
        timestamp: first.timestamp,
        deaths_before: Math.min(...cluster.map((e) => e.deaths_before)),
        gap_ms: gapMs,
        lethal: cluster.some((e) => e.lethal),
        participants,
        events_url: first.events_url,
        replay_url: first.replay_url,
      })
    }
  }

  collisionIncidents.sort(
    (a, b) =>
      b.reportDate.localeCompare(a.reportDate) ||
      a.pull_num - b.pull_num ||
      a.timestamp - b.timestamp,
  )

  const waveTotal = waveItems.length
  const collisionTotal = collisionItems.length

  return {
    total: filtered.length,
    allTotal: allFilteredFails.length,
    waveTotal,
    collisionTotal,
    collisionIncidents,
    cleanSplashCount: filteredSplashes.length,
    lethalTotal: filtered.filter((x) => x.lethal).length,
    affectedPlayers: players.length,
    phases: computePhaseBuckets(filtered),
    wavePhases: computePhaseBuckets(waveItems),
    collisionPhases: computePhaseBuckets(collisionIncidents),
    regularCarriers,
    playerClassMap,
    items: filtered,
    players,
  }
}

export interface EvaluatedEggCarrierEvent extends WithReport<EggCarrierEvent> {
  earlyMs: number
  unnecessaryMs: number
  earlyDmg: number
  unnecessaryDmg: number
  isTooEarly: boolean
  isLateFail: boolean
}

export interface EggCarrierPlayerRow {
  player: string
  className: string
  isRegular: boolean
  pickups: number
  totalHoldMs: number
  uptimePct: number
  avgHoldSec: number
  maxHoldSec: number
  unnecessaryMs: number
  avgUnnecessarySec: number
  totalShellDmg: number
  unnecessaryDmg: number
  unnecessaryDmgPct: number
  tooEarlyCount: number
  missedBreakCount: number
  lateHitCount: number
  missedAliveCount: number
  missedDeadCount: number
  takenWhileAllRegularsAliveCount: number
  takenAsDeadBackupCount: number
  items: EvaluatedEggCarrierEvent[]
}

export function aggregateEggCarriers(
  reports: ReportData[],
  maxDeaths: number | null,
  pullRange?: PullRange | null,
  minSec = 5,
  maxSec = 12,
) {
  const safeMinSec = Math.max(0, Math.floor(minSec))
  const safeMaxSec = Math.max(safeMinSec, Math.floor(maxSec))
  const minMs = safeMinSec * 1000
  const maxMs = safeMaxSec * 1000

  const rawEvents: WithReport<EggCarrierEvent>[] = []
  const regularSet = new Set<string>()
  let totalCombatMsInRange = 0

  for (const rep of reports) {
    const label = getReportDisplayName(rep)
    for (const rc of rep.egg_regular_carriers ?? []) regularSet.add(rc)
    const pullsInRange = filterByPullRange(rep.pulls ?? [], pullRange)
    for (const p of pullsInRange) {
      totalCombatMsInRange += Math.max(0, p.duration_ms ?? 0)
    }
    for (const ev of rep.egg_carrier_events ?? []) {
      rawEvents.push({
        ...ev,
        reportCode: rep.code,
        reportLabel: label,
        reportDate: rep.date_iso,
      })
    }
  }

  const filtered = filterByPullRange(filterByMaxDeaths(rawEvents, maxDeaths), pullRange)

  const byPlayer = new Map<
    string,
    {
      player: string
      className: string
      isRegular: boolean
      pickups: number
      totalHoldMs: number
      maxHoldMs: number
      unnecessaryMs: number
      totalShellDmg: number
      unnecessaryDmg: number
      tooEarlyCount: number
      missedBreakCount: number
      lateHitCount: number
      missedAliveCount: number
      missedDeadCount: number
      takenWhileAllRegularsAliveCount: number
      takenAsDeadBackupCount: number
      items: EvaluatedEggCarrierEvent[]
    }
  >()

  const evaluatedAll: EvaluatedEggCarrierEvent[] = []

  for (const ev of filtered) {
    const isPickup = ev.status !== 'missed_alive' && ev.status !== 'missed_dead'
    const hasBreakRef = isPickup && ev.status !== 'wiped_before_break' && ev.held_before_break_ms > 0

    const earlyMs = hasBreakRef ? Math.max(0, ev.held_before_break_ms - maxMs) : 0
    const postMs = isPickup ? Math.max(0, ev.post_break_ms) : 0
    const unnecessaryMs = earlyMs + postMs

    let earlyDmg = 0
    if (hasBreakRef && Array.isArray(ev.pre_dmg_sec)) {
      for (let s = safeMaxSec; s < ev.pre_dmg_sec.length; s++) {
        earlyDmg += ev.pre_dmg_sec[s] ?? 0
      }
    }
    const postDmg = isPickup ? Math.max(0, ev.post_break_dmg ?? 0) : 0
    const unnecessaryDmg = earlyDmg + postDmg

    const isTooEarly = earlyMs > 0
    const isLateHit =
      ev.status === 'hit_fail' && ev.held_before_break_ms > 0 && ev.held_before_break_ms < minMs
    const isLateFail = ev.status === 'missed_break' || isLateHit

    const evaluated: EvaluatedEggCarrierEvent = {
      ...ev,
      earlyMs,
      unnecessaryMs,
      earlyDmg,
      unnecessaryDmg,
      isTooEarly,
      isLateFail,
    }
    evaluatedAll.push(evaluated)

    let row = byPlayer.get(ev.player)
    if (!row) {
      row = {
        player: ev.player,
        className: ev.class,
        isRegular: ev.is_regular || regularSet.has(ev.player),
        pickups: 0,
        totalHoldMs: 0,
        maxHoldMs: 0,
        unnecessaryMs: 0,
        totalShellDmg: 0,
        unnecessaryDmg: 0,
        tooEarlyCount: 0,
        missedBreakCount: 0,
        lateHitCount: 0,
        missedAliveCount: 0,
        missedDeadCount: 0,
        takenWhileAllRegularsAliveCount: 0,
        takenAsDeadBackupCount: 0,
        items: [],
      }
      byPlayer.set(ev.player, row)
    }

    if (ev.is_regular || regularSet.has(ev.player)) row.isRegular = true
    if (isPickup) {
      row.pickups++
      row.totalHoldMs += ev.duration_ms
      if (ev.duration_ms > row.maxHoldMs) row.maxHoldMs = ev.duration_ms
      row.unnecessaryMs += unnecessaryMs
      row.totalShellDmg += ev.total_shell_dmg
      row.unnecessaryDmg += unnecessaryDmg
      if (isTooEarly) row.tooEarlyCount++
      if (ev.status === 'missed_break') row.missedBreakCount++
      if (isLateHit) row.lateHitCount++
      if (!row.isRegular) {
        if (ev.all_regulars_alive_at_pickup === true) row.takenWhileAllRegularsAliveCount++
        else if (ev.all_regulars_alive_at_pickup === false) row.takenAsDeadBackupCount++
      }
    } else if (ev.status === 'missed_alive') {
      row.missedAliveCount++
    } else if (ev.status === 'missed_dead') {
      row.missedDeadCount++
    }
    row.items.push(evaluated)
  }

  const players: EggCarrierPlayerRow[] = Array.from(byPlayer.values())
    .map((r) => {
      r.items.sort(
        (a, b) =>
          b.reportDate.localeCompare(a.reportDate) ||
          a.pull_num - b.pull_num ||
          a.round_num - b.round_num ||
          a.timestamp - b.timestamp,
      )
      const avgHoldSec = r.pickups > 0 ? Math.round((r.totalHoldMs / r.pickups / 1000) * 10) / 10 : 0
      const maxHoldSec = Math.round((r.maxHoldMs / 1000) * 10) / 10
      const avgUnnecessarySec =
        r.pickups > 0 ? Math.round((r.unnecessaryMs / r.pickups / 1000) * 10) / 10 : 0
      const uptimePct =
        totalCombatMsInRange > 0
          ? Math.round((r.totalHoldMs / totalCombatMsInRange) * 1000) / 10
          : 0
      const unnecessaryDmgPct =
        r.totalShellDmg > 0 ? Math.round((r.unnecessaryDmg / r.totalShellDmg) * 1000) / 10 : 0

      return {
        player: r.player,
        className: r.className,
        isRegular: r.isRegular,
        pickups: r.pickups,
        totalHoldMs: r.totalHoldMs,
        uptimePct,
        avgHoldSec,
        maxHoldSec,
        unnecessaryMs: r.unnecessaryMs,
        avgUnnecessarySec,
        totalShellDmg: r.totalShellDmg,
        unnecessaryDmg: r.unnecessaryDmg,
        unnecessaryDmgPct,
        tooEarlyCount: r.tooEarlyCount,
        missedBreakCount: r.missedBreakCount,
        lateHitCount: r.lateHitCount,
        missedAliveCount: r.missedAliveCount,
        missedDeadCount: r.missedDeadCount,
        takenWhileAllRegularsAliveCount: r.takenWhileAllRegularsAliveCount,
        takenAsDeadBackupCount: r.takenAsDeadBackupCount,
        items: r.items,
      }
    })
    .sort(
      (a, b) =>
        Number(b.isRegular) - Number(a.isRegular) ||
        b.unnecessaryDmg - a.unnecessaryDmg ||
        b.totalShellDmg - a.totalShellDmg ||
        a.player.localeCompare(b.player),
    )

  const totalPickups = players.reduce((s, p) => s + p.pickups, 0)
  const totalHoldMs = players.reduce((s, p) => s + p.totalHoldMs, 0)
  const totalUnnecessaryMs = players.reduce((s, p) => s + p.unnecessaryMs, 0)
  const totalShellDmg = players.reduce((s, p) => s + p.totalShellDmg, 0)
  const totalUnnecessaryDmg = players.reduce((s, p) => s + p.unnecessaryDmg, 0)

  return {
    minSec: safeMinSec,
    maxSec: safeMaxSec,
    hasData: rawEvents.length > 0,
    regularCount: players.filter((p) => p.isRegular).length,
    totalPickups,
    avgHoldSec: totalPickups > 0 ? Math.round((totalHoldMs / totalPickups / 1000) * 10) / 10 : 0,
    totalUnnecessarySec: Math.round(totalUnnecessaryMs / 1000),
    totalShellDmg,
    totalUnnecessaryDmg,
    unnecessaryDmgPct:
      totalShellDmg > 0 ? Math.round((totalUnnecessaryDmg / totalShellDmg) * 1000) / 10 : 0,
    missedBreakTotal: players.reduce((s, p) => s + p.missedBreakCount, 0),
    lateHitTotal: players.reduce((s, p) => s + p.lateHitCount, 0),
    missedAliveTotal: players.reduce((s, p) => s + p.missedAliveCount, 0),
    missedDeadTotal: players.reduce((s, p) => s + p.missedDeadCount, 0),
    players,
    events: evaluatedAll,
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

export function aggregateWaveFails(
  reports: ReportData[],
  maxDeaths: number | null,
  pullRange?: PullRange | null,
) {
  const raw: WithReport<WaveFail>[] = []
  for (const rep of reports) {
    const label = getReportDisplayName(rep)
    for (const item of rep.wave_fails) {
      raw.push({ ...item, reportCode: rep.code, reportLabel: label, reportDate: rep.date_iso })
    }
  }
  const filtered = filterByPullRange(filterByMaxDeaths(raw, maxDeaths), pullRange)
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
  stoneVenomLethalCount: number
  lowestHpPct: number | null
  items: WithReport<TankFail>[]
}

export function aggregateTankFails(
  reports: ReportData[],
  maxDeaths: number | null,
  subFilter: 'all' | 'tentacle_aggro' | 'stone_venom_no_def' = 'all',
  pullRange?: PullRange | null,
) {
  const raw: WithReport<TankFail>[] = []
  for (const rep of reports) {
    const label = getReportDisplayName(rep)
    for (const item of rep.tank_fails) {
      if (subFilter !== 'all' && item.kind !== subFilter) continue
      raw.push({ ...item, reportCode: rep.code, reportLabel: label, reportDate: rep.date_iso })
    }
  }
  const filtered = filterByPullRange(filterByMaxDeaths(raw, maxDeaths), pullRange)
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
        stoneVenomLethalCount: 0,
        lowestHpPct: null,
        items: [],
      }
      byTank.set(item.tank, row)
    }
    row.count++
    if (item.kind === 'tentacle_aggro') row.tentacleCount++
    if (item.kind === 'stone_venom_no_def') {
      row.stoneVenomCount++
      if (item.lethal) row.stoneVenomLethalCount++
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
    stoneVenomLethalCount: filtered.filter((x) => x.kind === 'stone_venom_no_def' && x.lethal).length,
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
  lowSpikesNoDefReady: number
  defSpikeRatePct: number
  deaths: number
  deathsNoDef: number
  deathsNoDefReady: number
  deathsNoPotNoHs: number
  deathsAnyReady: number
  items: WithReport<DefensiveEvent>[]
}

export function aggregateDefensives(
  reports: ReportData[],
  maxDeaths: number | null,
  pullRange?: PullRange | null,
) {
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
        lowSpikesNoDefReady: 0,
        defSpikeRatePct: 0,
        deaths: 0,
        deathsNoDef: 0,
        deathsNoDefReady: 0,
        deathsNoPotNoHs: 0,
        deathsAnyReady: 0,
        items: [],
      }
      byPlayer.set(player, row)
    }
    return row
  }

  const allEvents: WithReport<DefensiveEvent>[] = []
  for (const rep of reports) {
    const label = getReportDisplayName(rep)
    for (const u of filterByPullRange(rep.consumable_usage, pullRange)) {
      const row = ensure(u.player, u.class)
      row.pullsPresent++
      if (u.used_health_pot) row.potPulls++
      if (u.used_healthstone) row.hsPulls++
      row.defCdCasts += u.def_cd_casts
    }
    for (const ev of filterByPullRange(filterByMaxDeaths(rep.defensive_events, maxDeaths), pullRange)) {
      const enriched: WithReport<DefensiveEvent> = {
        ...ev,
        reportCode: rep.code,
        reportLabel: label,
        reportDate: rep.date_iso,
      }
      allEvents.push(enriched)
      const row = ensure(ev.player, ev.class)
      row.items.push(enriched)
      const hasReadyDef = (ev.ready_defs?.length ?? 0) > 0
      const hasAnyReady = ev.any_ready ?? (hasReadyDef || !ev.pot_used_in_pull || !ev.hs_used_in_pull)
      if (ev.kind === 'low_hp_spike') {
        row.lowSpikes++
        if (ev.had_def_cd) row.lowSpikesWithDef++
        else {
          row.lowSpikesNoDef++
          if (hasReadyDef) row.lowSpikesNoDefReady++
        }
      } else if (ev.kind === 'death') {
        row.deaths++
        if (!ev.had_def_cd) {
          row.deathsNoDef++
          if (hasReadyDef) row.deathsNoDefReady++
        }
        if (!ev.pot_used_in_pull && !ev.hs_used_in_pull) row.deathsNoPotNoHs++
        if (!ev.had_def_cd && hasAnyReady) row.deathsAnyReady++
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
        b.deathsAnyReady - a.deathsAnyReady ||
        b.deathsNoPotNoHs - a.deathsNoPotNoHs ||
        b.lowSpikesNoDefReady - a.lowSpikesNoDefReady ||
        a.player.localeCompare(b.player),
    )

  for (const p of players) {
    p.items.sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.pull_num - b.pull_num || a.timestamp - b.timestamp)
  }

  const totalSpikes = allEvents.filter((e) => e.kind === 'low_hp_spike').length
  const totalSpikesWithDef = allEvents.filter((e) => e.kind === 'low_hp_spike' && e.had_def_cd).length
  const totalDeaths = allEvents.filter((e) => e.kind === 'death').length
  const totalDeathsNoPotNoHs = allEvents.filter((e) => e.kind === 'death' && !e.pot_used_in_pull && !e.hs_used_in_pull).length
  const totalDeathsAnyReady = allEvents.filter(
    (e) =>
      e.kind === 'death' &&
      !e.had_def_cd &&
      (e.any_ready ?? ((e.ready_defs?.length ?? 0) > 0 || !e.pot_used_in_pull || !e.hs_used_in_pull)),
  ).length
  const totalPullPlayerSlots = players.reduce((s, p) => s + p.pullsPresent, 0)
  const totalPotPulls = players.reduce((s, p) => s + p.potPulls, 0)
  const totalHsPulls = players.reduce((s, p) => s + p.hsPulls, 0)

  return {
    totalSpikes,
    totalSpikesWithDef,
    spikeDefRatePct: totalSpikes > 0 ? Math.round((totalSpikesWithDef / totalSpikes) * 100) : 0,
    totalDeaths,
    totalDeathsNoPotNoHs,
    totalDeathsAnyReady,
    overallPotRatePct: totalPullPlayerSlots > 0 ? Math.round((totalPotPulls / totalPullPlayerSlots) * 100) : 0,
    overallHsRatePct: totalPullPlayerSlots > 0 ? Math.round((totalHsPulls / totalPullPlayerSlots) * 100) : 0,
    players,
  }
}

export interface HeartPlayerEntry {
  reportCode: string
  reportLabel: string
  reportDate: string
  pull_num: number
  fight_id: number
  window_num: number
  start_rel_time: string
  duration_ms: number
  deaths_before: number
  heart_dmg: number
  heart_raw_dmg: number
  boss_dmg: number
  total_boss_dmg: number
  other_dmg: number
  heart_share_pct: number
  debris_hits: number
  switch_delay_ms: number | null
  first_heart_spell: string | null
  first_heart_switch_type: 'direct' | 'aoe' | null
  was_dead_at_heart: boolean
  first_switch_player: string | null
  events_url: string
  replay_url: string
}

export interface HeartPlayerRow {
  player: string
  className: string
  windowsPresent: number
  heartDmg: number
  heartRawDmg: number
  bossDmg: number
  totalBossDmg: number
  avgBossDmg: number
  otherDmg: number
  heartSharePct: number
  debrisHits: number
  avgSwitchDelayMs: number | null
  maxSwitchDelayMs: number | null
  firstSwitchCount: number
  noDirectCastCount: number
  entries: HeartPlayerEntry[]
}

export function aggregateHeartPhases(
  reports: ReportData[],
  maxDeaths: number | null,
  pullRange?: PullRange | null,
) {
  const rawWindows: WithReport<HeartPhaseWindow>[] = []
  for (const rep of reports) {
    const label = getReportDisplayName(rep)
    for (const hw of rep.heart_phases ?? []) {
      rawWindows.push({
        ...hw,
        reportCode: rep.code,
        reportLabel: label,
        reportDate: rep.date_iso,
      })
    }
  }

  const windows = filterByPullRange(filterByMaxDeaths(rawWindows, maxDeaths), pullRange).sort(
    (a, b) => b.reportDate.localeCompare(a.reportDate) || a.pull_num - b.pull_num || a.window_num - b.window_num,
  )

  const byPlayer = new Map<
    string,
    HeartPlayerRow & { delaySumMs: number; delaySamples: number }
  >()
  let allDelaySumMs = 0
  let allDelaySamples = 0
  let totalNoDirectCast = 0

  for (const hw of windows) {
    const hasSwitchData = Boolean(hw.first_switch_player)
    for (const p of hw.players) {
      let row = byPlayer.get(p.player)
      if (!row) {
        row = {
          player: p.player,
          className: p.class,
          windowsPresent: 0,
          heartDmg: 0,
          heartRawDmg: 0,
          bossDmg: 0,
          totalBossDmg: 0,
          avgBossDmg: 0,
          otherDmg: 0,
          heartSharePct: 0,
          debrisHits: 0,
          avgSwitchDelayMs: null,
          maxSwitchDelayMs: null,
          firstSwitchCount: 0,
          noDirectCastCount: 0,
          delaySumMs: 0,
          delaySamples: 0,
          entries: [],
        }
        byPlayer.set(p.player, row)
      }
      row.windowsPresent++
      row.heartDmg += p.heart_dmg
      row.heartRawDmg += p.heart_raw_dmg
      row.bossDmg += p.boss_dmg
      row.totalBossDmg += p.total_boss_dmg
      row.otherDmg += p.other_dmg
      row.debrisHits += p.debris_hits

      const swDelay = p.switch_delay_ms ?? null
      const wasDead = Boolean(p.was_dead_at_heart)
      if (swDelay !== null) {
        row.delaySumMs += swDelay
        row.delaySamples++
        if (row.maxSwitchDelayMs === null || swDelay > row.maxSwitchDelayMs) {
          row.maxSwitchDelayMs = swDelay
        }
        if (swDelay === 0) row.firstSwitchCount++
        allDelaySumMs += swDelay
        allDelaySamples++
      } else if (hasSwitchData && !wasDead) {
        row.noDirectCastCount++
        totalNoDirectCast++
      }

      row.entries.push({
        reportCode: hw.reportCode,
        reportLabel: hw.reportLabel,
        reportDate: hw.reportDate,
        pull_num: hw.pull_num,
        fight_id: hw.fight_id,
        window_num: hw.window_num,
        start_rel_time: hw.start_rel_time,
        duration_ms: hw.duration_ms,
        deaths_before: hw.deaths_before,
        heart_dmg: p.heart_dmg,
        heart_raw_dmg: p.heart_raw_dmg,
        boss_dmg: p.boss_dmg,
        total_boss_dmg: p.total_boss_dmg,
        other_dmg: p.other_dmg,
        heart_share_pct: p.heart_share_pct,
        debris_hits: p.debris_hits,
        switch_delay_ms: swDelay,
        first_heart_spell: p.first_heart_spell ?? null,
        first_heart_switch_type: p.first_heart_switch_type ?? null,
        was_dead_at_heart: wasDead,
        first_switch_player: hw.first_switch_player ?? null,
        events_url: hw.events_url,
        replay_url: hw.replay_url,
      })
    }
  }

  const players: HeartPlayerRow[] = Array.from(byPlayer.values())
    .map(({ delaySumMs, delaySamples, ...p }) => ({
      ...p,
      avgBossDmg: p.windowsPresent > 0 ? Math.round(p.totalBossDmg / p.windowsPresent) : 0,
      heartSharePct: p.totalBossDmg > 0 ? Math.round((p.heartDmg / p.totalBossDmg) * 1000) / 10 : 0,
      avgSwitchDelayMs: delaySamples > 0 ? Math.round(delaySumMs / delaySamples) : null,
    }))
    .sort((a, b) => b.totalBossDmg - a.totalBossDmg || a.player.localeCompare(b.player))

  const totalHeartDmg = windows.reduce((s, w) => s + w.total_heart_dmg, 0)
  const totalBossDmg = windows.reduce((s, w) => s + w.total_boss_dmg, 0)
  const totalEffectiveDmg = windows.reduce((s, w) => s + w.total_effective_dmg, 0)
  const totalOtherDmg = windows.reduce((s, w) => s + w.total_other_dmg, 0)
  const totalDebrisHits = windows.reduce((s, w) => s + w.debris_hits_total, 0)

  return {
    windowCount: windows.length,
    totalHeartDmg,
    totalBossDmg,
    totalEffectiveDmg,
    avgEffectiveDmgPerWindow: windows.length > 0 ? Math.round(totalEffectiveDmg / windows.length) : 0,
    overallHeartSharePct: totalEffectiveDmg > 0 ? Math.round((totalHeartDmg / totalEffectiveDmg) * 1000) / 10 : 0,
    overallAvgSwitchDelayMs: allDelaySamples > 0 ? Math.round(allDelaySumMs / allDelaySamples) : null,
    totalNoDirectCast,
    totalOtherDmg,
    totalDebrisHits,
    windows,
    players,
  }
}

export interface PhasePlayerCountRow {
  player: string
  className: string
  count: number
  totalDamage: number
  lethalCount: number
  items: WithReport<PhaseEvent>[]
}

export interface PhaseDamageRankRow {
  player: string
  className: string
  pullsPresent: number
  totalDamage: number
  avgDamage: number
}

export interface KickPlayerRow {
  player: string
  className: string
  totalKicks: number
  kicksBySide: Record<string, number>
  missedReadyCount: number
  missedBySide: Record<string, number>
  unusedReadyCount: number
  unusedReadyBySide: Record<string, number>
  pulls: number[]
}

function groupPhaseEventsByPlayer(items: WithReport<PhaseEvent>[]): PhasePlayerCountRow[] {
  const map = new Map<string, PhasePlayerCountRow>()
  for (const item of items) {
    let row = map.get(item.player)
    if (!row) {
      row = {
        player: item.player,
        className: item.class,
        count: 0,
        totalDamage: 0,
        lethalCount: 0,
        items: [],
      }
      map.set(item.player, row)
    }
    row.count++
    row.totalDamage += item.damage
    if (item.lethal) row.lethalCount++
    row.items.push(item)
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || b.totalDamage - a.totalDamage || a.player.localeCompare(b.player))
}

export function aggregatePhaseAnalysis(
  reports: ReportData[],
  maxDeaths: number | null,
  pullRange?: PullRange | null,
) {
  const rawEvents: WithReport<PhaseEvent>[] = []
  const rawWarden: WithReport<WardenPullSummary>[] = []
  const rawP3: WithReport<P3PullSummary>[] = []

  for (const rep of reports) {
    const label = getReportDisplayName(rep)
    for (const ev of rep.phase_events ?? []) {
      rawEvents.push({ ...ev, reportCode: rep.code, reportLabel: label, reportDate: rep.date_iso })
    }
    for (const ws of rep.warden_summaries ?? []) {
      rawWarden.push({ ...ws, reportCode: rep.code, reportLabel: label, reportDate: rep.date_iso })
    }
    for (const p3 of rep.p3_summaries ?? []) {
      rawP3.push({ ...p3, reportCode: rep.code, reportLabel: label, reportDate: rep.date_iso })
    }
  }

  const events = filterByPullRange(filterByMaxDeaths(rawEvents, maxDeaths), pullRange)
  const wardenPulls = filterByPullRange(
    rawWarden.filter((w) => maxDeaths === null || w.deaths_at_p2_start <= maxDeaths),
    pullRange,
  ).sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.pull_num - b.pull_num)

  const p3Pulls = filterByPullRange(
    rawP3.filter((p) => maxDeaths === null || p.deaths_at_p3_start <= maxDeaths),
    pullRange,
  ).sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.pull_num - b.pull_num)

  const blightOverlaps = events.filter((e) => e.kind === 'blight_vein_overlap')
  const maliceKicks = events.filter((e) => e.kind === 'malice_kick')
  const maliceMissed = events.filter((e) => e.kind === 'malice_missed')
  const viciousKicks = events.filter((e) => e.kind === 'vicious_echoes_kick')
  const viciousMissed = events.filter((e) => e.kind === 'vicious_echoes_missed')
  const p2Avoidables = events.filter((e) => e.kind === 'p2_avoidable')
  const p3Avoidables = events.filter((e) => e.kind === 'p3_avoidable')

  const rankDamage = (pulls: { players: { player: string; class: string; damage: number }[] }[]): PhaseDamageRankRow[] => {
    const byP = new Map<string, PhaseDamageRankRow>()
    for (const pull of pulls) {
      for (const p of pull.players) {
        let row = byP.get(p.player)
        if (!row) {
          row = { player: p.player, className: p.class, pullsPresent: 0, totalDamage: 0, avgDamage: 0 }
          byP.set(p.player, row)
        }
        row.pullsPresent++
        row.totalDamage += p.damage
      }
    }
    return Array.from(byP.values())
      .map((r) => ({ ...r, avgDamage: r.pullsPresent > 0 ? Math.round(r.totalDamage / r.pullsPresent) : 0 }))
      .sort((a, b) => b.totalDamage - a.totalDamage || a.player.localeCompare(b.player))
  }

  const allKicks = [...maliceKicks, ...viciousKicks]
  const allMissed = [...maliceMissed, ...viciousMissed]
  const unfilteredMissedInRange = filterByPullRange(rawEvents, pullRange).filter(
    (e) => e.kind === 'malice_missed' || e.kind === 'vicious_echoes_missed',
  ).length
  const sideSet = new Set<string>()
  const kickSideTankClass: Record<string, string> = {}
  const kickPlayerMap = new Map<string, KickPlayerRow & { pullSet: Set<number> }>()

  const ensureKickPlayer = (player: string, className: string) => {
    let row = kickPlayerMap.get(player)
    if (!row) {
      row = {
        player,
        className,
        totalKicks: 0,
        kicksBySide: {},
        missedReadyCount: 0,
        missedBySide: {},
        unusedReadyCount: 0,
        unusedReadyBySide: {},
        pulls: [],
        pullSet: new Set<number>(),
      }
      kickPlayerMap.set(player, row)
    } else if (!row.className && className) {
      row.className = className
    }
    return row
  }

  for (const k of allKicks) {
    const side = k.side || 'Unbekannt'
    sideSet.add(side)
    if (k.side_tank_class) kickSideTankClass[side] = k.side_tank_class
    const row = ensureKickPlayer(k.player, k.class)
    row.totalKicks++
    row.kicksBySide[side] = (row.kicksBySide[side] ?? 0) + 1
    row.pullSet.add(k.pull_num)
    for (const rk of k.ready_kickers ?? []) {
      const other = ensureKickPlayer(rk.player, rk.class)
      other.unusedReadyCount++
      other.unusedReadyBySide[side] = (other.unusedReadyBySide[side] ?? 0) + 1
      other.pullSet.add(k.pull_num)
    }
  }

  for (const m of allMissed) {
    const side = m.side || 'Unbekannt'
    sideSet.add(side)
    if (m.side_tank_class) kickSideTankClass[side] = m.side_tank_class
    for (const rk of m.ready_kickers ?? []) {
      const row = ensureKickPlayer(rk.player, rk.class)
      row.missedReadyCount++
      row.missedBySide[side] = (row.missedBySide[side] ?? 0) + 1
      row.pullSet.add(m.pull_num)
    }
  }

  const kickSides = Array.from(sideSet).sort((a, b) => a.localeCompare(b))
  const kickPlayers: KickPlayerRow[] = Array.from(kickPlayerMap.values())
    .map(({ pullSet, ...rest }) => ({
      ...rest,
      pulls: Array.from(pullSet).sort((a, b) => a - b),
    }))
    .sort(
      (a, b) =>
        b.missedReadyCount - a.missedReadyCount ||
        b.totalKicks - a.totalKicks ||
        b.unusedReadyCount - a.unusedReadyCount ||
        a.player.localeCompare(b.player),
    )

  return {
    blightOverlaps,
    blightOverlapPlayers: groupPhaseEventsByPlayer(blightOverlaps),
    maliceKicks,
    maliceKickPlayers: groupPhaseEventsByPlayer(maliceKicks),
    maliceMissed,
    viciousKicks,
    viciousKickPlayers: groupPhaseEventsByPlayer(viciousKicks),
    viciousMissed,
    unfilteredMissedInRange,
    kickSides,
    kickSideTankClass,
    kickPlayers,
    p2Avoidables,
    p3Avoidables,
    avoidablePlayers: groupPhaseEventsByPlayer([...p2Avoidables, ...p3Avoidables]),
    wardenPulls,
    wardenPlayers: rankDamage(wardenPulls),
    p3Pulls,
    p3Players: rankDamage(p3Pulls),
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
