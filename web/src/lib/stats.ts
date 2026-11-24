import type {
  BossPhaseKey,
  DefensiveEvent,
  EggCarrierEvent,
  EggFail,
  GroupSoakEvent,
  GroupSoakPlayerRef,
  HealerEmergencyEvent,
  HealerEmergencyReaction,
  HealerTankSoakEvent,
  HealerTankSoakReaction,
  HeartPhaseWindow,
  P3PullSummary,
  PhaseEvent,
  PullData,
  ReportData,
  ShatteringConfidence,
  ShatteringGroupEntry,
  ShatteringSoakGroups,
  SoakGroupDefinition,
  TankFail,
  WardenPullSummary,
  WaveFail,
} from '../types'

export const BOSS_PHASE_LABELS: Record<BossPhaseKey, string> = {
  p1: 'Phase 1',
  p2: 'Phase 2',
  intermission: 'Intermission: The Shattering',
  p3: 'Phase 3',
}

export function getEventBossPhase(pull: PullData | undefined, timestamp: number): BossPhaseKey {
  const pts = pull?.phase_transitions
  if (!pts || pts.length === 0) return 'p1'
  let phaseId = 1
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].start_time <= timestamp) {
      phaseId = pts[i].id
    } else {
      break
    }
  }
  if (phaseId === 2) return 'p2'
  if (phaseId === 3) return 'intermission'
  if (phaseId >= 4) return 'p3'
  return 'p1'
}

export function pullReachedBossPhase(pull: PullData | undefined, phase: BossPhaseKey): boolean {
  if (phase === 'p1') return true
  const pts = pull?.phase_transitions
  if (!pts || pts.length === 0) return false
  const targetId = phase === 'p2' ? 2 : phase === 'intermission' ? 3 : 4
  return pts.some((pt) => pt.id === targetId)
}

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
      if (item.tank_was_dead) continue
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
  criticalEvents: number
  usedAnyCount: number
  usedDefCount: number
  usedPotAtDropCount: number
  usedHsAtDropCount: number
  usedAnyRatePct: number
  missedWhileReadyCount: number
  missedSpikeWhileReadyCount: number
  missedDeathWhileReadyCount: number
  missedPotReadyCount: number
  missedHsReadyCount: number
  allOnCdCount: number
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
  phaseFilter?: BossPhaseKey | null,
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
        criticalEvents: 0,
        usedAnyCount: 0,
        usedDefCount: 0,
        usedPotAtDropCount: 0,
        usedHsAtDropCount: 0,
        usedAnyRatePct: 0,
        missedWhileReadyCount: 0,
        missedSpikeWhileReadyCount: 0,
        missedDeathWhileReadyCount: 0,
        missedPotReadyCount: 0,
        missedHsReadyCount: 0,
        allOnCdCount: 0,
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

  const AVOIDABLE_DEF_NAMES = new Set([
    'caustic waves',
    'falling debris',
    'rattler slam',
    'noxious splash',
    'rancid yolk',
    'acidic burst',
    'acidic expulsion',
    'petrifying sting',
    'virulent spit',
    "serpent's bite",
    'volatile purge',
  ])

  const allEvents: WithReport<DefensiveEvent>[] = []
  const seenDefIds = new Set<string>()
  for (const rep of reports) {
    const label = getReportDisplayName(rep)
    const pullByFightId = new Map<number, PullData>()
    for (const p of rep.pulls) pullByFightId.set(p.fight_id, p)
    for (const u of filterByPullRange(rep.consumable_usage, pullRange)) {
      if (phaseFilter && !pullReachedBossPhase(pullByFightId.get(u.fight_id), phaseFilter)) {
        continue
      }
      const row = ensure(u.player, u.class)
      row.pullsPresent++
      if (u.used_health_pot) row.potPulls++
      if (u.used_healthstone) row.hsPulls++
      row.defCdCasts += u.def_cd_casts
    }
    for (const ev of filterByPullRange(filterByMaxDeaths(rep.defensive_events, maxDeaths), pullRange)) {
      if (phaseFilter && getEventBossPhase(pullByFightId.get(ev.fight_id), ev.timestamp) !== phaseFilter) {
        continue
      }
      const dedupKey = `${rep.code}:${ev.id}`
      if (seenDefIds.has(dedupKey)) continue
      seenDefIds.add(dedupKey)
      if (AVOIDABLE_DEF_NAMES.has((ev.trigger_ability ?? '').trim().toLowerCase())) {
        continue
      }
      const enriched: WithReport<DefensiveEvent> = {
        ...ev,
        reportCode: rep.code,
        reportLabel: label,
        reportDate: rep.date_iso,
      }
      allEvents.push(enriched)
      const row = ensure(ev.player, ev.class)
      row.items.push(enriched)

      const usedPotHere = Boolean(ev.used_pot_here)
      const usedHsHere = Boolean(ev.used_hs_here)
      const usedAnyHere = ev.used_any_here ?? (ev.had_def_cd || usedPotHere || usedHsHere)
      const hasReadyDef = (ev.ready_defs?.length ?? 0) > 0
      const potRdy = ev.pot_ready ?? (!ev.pot_used_in_pull && !usedPotHere)
      const hsRdy = ev.hs_ready ?? (!ev.hs_used_in_pull && !usedHsHere)
      const hasAnyReady = ev.any_ready ?? (hasReadyDef || potRdy || hsRdy)

      row.criticalEvents++
      if (usedAnyHere) {
        row.usedAnyCount++
        if (ev.had_def_cd) row.usedDefCount++
        if (usedPotHere) row.usedPotAtDropCount++
        if (usedHsHere) row.usedHsAtDropCount++
      } else if (hasAnyReady) {
        row.missedWhileReadyCount++
        if (ev.kind === 'low_hp_spike') row.missedSpikeWhileReadyCount++
        else row.missedDeathWhileReadyCount++
        if (potRdy) row.missedPotReadyCount++
        if (hsRdy) row.missedHsReadyCount++
      } else {
        row.allOnCdCount++
      }

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
        if (!usedAnyHere && hasAnyReady) row.deathsAnyReady++
      }
    }
  }

  const players = Array.from(byPlayer.values())
    .map((p) => ({
      ...p,
      potRatePct: p.pullsPresent > 0 ? Math.round((p.potPulls / p.pullsPresent) * 100) : 0,
      hsRatePct: p.pullsPresent > 0 ? Math.round((p.hsPulls / p.pullsPresent) * 100) : 0,
      defSpikeRatePct: p.lowSpikes > 0 ? Math.round((p.lowSpikesWithDef / p.lowSpikes) * 100) : 100,
      usedAnyRatePct: p.criticalEvents > 0 ? Math.round((p.usedAnyCount / p.criticalEvents) * 100) : 100,
    }))
    .sort(
      (a, b) =>
        b.missedWhileReadyCount - a.missedWhileReadyCount ||
        b.missedDeathWhileReadyCount - a.missedDeathWhileReadyCount ||
        b.criticalEvents - a.criticalEvents ||
        a.player.localeCompare(b.player),
    )

  for (const p of players) {
    p.items.sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.pull_num - b.pull_num || a.timestamp - b.timestamp)
  }

  const totalCritical = players.reduce((s, p) => s + p.criticalEvents, 0)
  const totalUsedAny = players.reduce((s, p) => s + p.usedAnyCount, 0)
  const totalUsedDef = players.reduce((s, p) => s + p.usedDefCount, 0)
  const totalPotUsedAtDrop = players.reduce((s, p) => s + p.usedPotAtDropCount, 0)
  const totalHsUsedAtDrop = players.reduce((s, p) => s + p.usedHsAtDropCount, 0)
  const totalMissedWhileReady = players.reduce((s, p) => s + p.missedWhileReadyCount, 0)
  const totalMissedSpikeWhileReady = players.reduce((s, p) => s + p.missedSpikeWhileReadyCount, 0)
  const totalMissedDeathWhileReady = players.reduce((s, p) => s + p.missedDeathWhileReadyCount, 0)
  const totalMissedPotReady = players.reduce((s, p) => s + p.missedPotReadyCount, 0)
  const totalMissedHsReady = players.reduce((s, p) => s + p.missedHsReadyCount, 0)

  const totalSpikes = allEvents.filter((e) => e.kind === 'low_hp_spike').length
  const totalSpikesWithDef = allEvents.filter((e) => e.kind === 'low_hp_spike' && e.had_def_cd).length
  const totalDeaths = allEvents.filter((e) => e.kind === 'death').length
  const totalDeathsNoPotNoHs = allEvents.filter((e) => e.kind === 'death' && !e.pot_used_in_pull && !e.hs_used_in_pull).length
  const totalDeathsAnyReady = totalMissedDeathWhileReady
  const totalPullPlayerSlots = players.reduce((s, p) => s + p.pullsPresent, 0)
  const totalPotPulls = players.reduce((s, p) => s + p.potPulls, 0)
  const totalHsPulls = players.reduce((s, p) => s + p.hsPulls, 0)

  return {
    totalCritical,
    totalUsedAny,
    usedAnyRatePct: totalCritical > 0 ? Math.round((totalUsedAny / totalCritical) * 100) : 0,
    totalUsedDef,
    totalPotUsedAtDrop,
    totalHsUsedAtDrop,
    totalMissedWhileReady,
    totalMissedSpikeWhileReady,
    totalMissedDeathWhileReady,
    totalMissedPotReady,
    totalMissedHsReady,
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

export interface KickSidePlayerRow {
  player: string
  className: string
  kicks: number
  missedReady: number
  pulls: number[]
}

export interface KickSideGroup {
  side: string
  tankClass: string
  totalKicks: number
  missedCasts: number
  players: KickSidePlayerRow[]
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

  const sideTotalKicks = new Map<string, number>()
  const sideMissedCasts = new Map<string, number>()
  const sidePlayerMap = new Map<
    string,
    Map<string, { player: string; className: string; kicks: number; missedReady: number; pullSet: Set<number> }>
  >()

  const ensureSidePlayer = (side: string, player: string, className: string) => {
    let pmap = sidePlayerMap.get(side)
    if (!pmap) {
      pmap = new Map()
      sidePlayerMap.set(side, pmap)
    }
    let row = pmap.get(player)
    if (!row) {
      row = { player, className, kicks: 0, missedReady: 0, pullSet: new Set<number>() }
      pmap.set(player, row)
    } else if (!row.className && className) {
      row.className = className
    }
    return row
  }

  for (const k of allKicks) {
    const side = k.side || 'Unbekannt'
    sideSet.add(side)
    if (k.side_tank_class) kickSideTankClass[side] = k.side_tank_class
    sideTotalKicks.set(side, (sideTotalKicks.get(side) ?? 0) + 1)

    const row = ensureKickPlayer(k.player, k.class)
    row.totalKicks++
    row.kicksBySide[side] = (row.kicksBySide[side] ?? 0) + 1
    row.pullSet.add(k.pull_num)

    const sp = ensureSidePlayer(side, k.player, k.class)
    sp.kicks++
    sp.pullSet.add(k.pull_num)
  }

  for (const m of allMissed) {
    const side = m.side || 'Unbekannt'
    sideSet.add(side)
    if (m.side_tank_class) kickSideTankClass[side] = m.side_tank_class
    sideMissedCasts.set(side, (sideMissedCasts.get(side) ?? 0) + 1)
    for (const rk of m.ready_kickers ?? []) {
      const row = ensureKickPlayer(rk.player, rk.class)
      row.missedReadyCount++
      row.missedBySide[side] = (row.missedBySide[side] ?? 0) + 1
      row.pullSet.add(m.pull_num)

      const sp = ensureSidePlayer(side, rk.player, rk.class)
      sp.missedReady++
      sp.pullSet.add(m.pull_num)
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
        a.player.localeCompare(b.player),
    )

  const kickGroups: KickSideGroup[] = kickSides.map((side) => {
    const pmap = sidePlayerMap.get(side)
    const players: KickSidePlayerRow[] = pmap
      ? Array.from(pmap.values())
          .map(({ pullSet, ...rest }) => ({
            ...rest,
            pulls: Array.from(pullSet).sort((a, b) => a - b),
          }))
          .sort(
            (a, b) =>
              b.missedReady - a.missedReady ||
              b.kicks - a.kicks ||
              a.player.localeCompare(b.player),
          )
      : []
    return {
      side,
      tankClass: kickSideTankClass[side] ?? '',
      totalKicks: sideTotalKicks.get(side) ?? 0,
      missedCasts: sideMissedCasts.get(side) ?? 0,
      players,
    }
  })

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
    kickGroups,
    p2Avoidables,
    p3Avoidables,
    avoidablePlayers: groupPhaseEventsByPlayer([...p2Avoidables, ...p3Avoidables]),
    wardenPulls,
    wardenPlayers: rankDamage(wardenPulls),
    p3Pulls,
    p3Players: rankDamage(p3Pulls),
  }
}

export interface HealerEmergencyItem {
  event: WithReport<HealerEmergencyEvent>
  reaction: HealerEmergencyReaction
  tooShortForCast: boolean
}

export interface HealerEmergencyRow {
  healer: string
  className: string
  spec: string
  opportunities: number
  reactedCount: number
  instantUsedCount: number
  castUsedCount: number
  castUsedDespiteInstantReadyCount: number
  noHealCount: number
  coveredFastCount: number
  tooShortForCastCount: number
  missedInstantReadyUnassistedCount: number
  missedWhileTargetDiedCount: number
  avgReactionMs: number | null
  medianReactionMs: number | null
  items: HealerEmergencyItem[]
}

export interface HealerTankSoakItem {
  event: WithReport<HealerTankSoakEvent>
  reaction: HealerTankSoakReaction
}

export interface HealerTankSoakRow {
  healer: string
  className: string
  spec: string
  opportunities: number
  healedSoaks: number
  unhealedSoaks: number
  healedRatePct: number
  totalHeals: number
  avgHealsPerSoak: number
  externalCount: number
  avgReactionMs: number | null
  medianReactionMs: number | null
  items: HealerTankSoakItem[]
}

function calcMedian(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

export function aggregateHealerEmergency(
  reports: ReportData[],
  maxDeaths: number | null,
  pullRange?: PullRange | null,
  minInstantAliveSec = 0.5,
  minCastAliveSec = 1.7,
  phaseFilter?: BossPhaseKey | null,
) {
  const safeMinAliveMs = Math.max(0, Math.round(minInstantAliveSec * 1000))
  const safeMinCastMs = Math.max(safeMinAliveMs, Math.round(minCastAliveSec * 1000))

  const raw: WithReport<HealerEmergencyEvent>[] = []
  for (const rep of reports) {
    const label = getReportDisplayName(rep)
    const pullByFightId = new Map<number, PullData>()
    for (const p of rep.pulls) pullByFightId.set(p.fight_id, p)
    for (const ev of rep.healer_emergency_events ?? []) {
      if (phaseFilter && getEventBossPhase(pullByFightId.get(ev.fight_id), ev.timestamp) !== phaseFilter) {
        continue
      }
      raw.push({ ...ev, reportCode: rep.code, reportLabel: label, reportDate: rep.date_iso })
    }
  }
  const ranged = filterByPullRange(filterByMaxDeaths(raw, maxDeaths), pullRange)

  let filteredInstantDeathCount = 0
  const events: WithReport<HealerEmergencyEvent>[] = []
  for (const ev of ranged) {
    const ttd = ev.time_to_death_ms
    if (ttd !== undefined && ttd !== null && ttd < safeMinAliveMs) {
      filteredInstantDeathCount++
      continue
    }
    events.push(ev)
  }
  events.sort(
    (a, b) => b.reportDate.localeCompare(a.reportDate) || a.pull_num - b.pull_num || a.timestamp - b.timestamp,
  )

  const byHealer = new Map<
    string,
    {
      healer: string
      className: string
      spec: string
      opportunities: number
      reactedCount: number
      instantUsedCount: number
      castUsedCount: number
      castUsedDespiteInstantReadyCount: number
      noHealCount: number
      coveredFastCount: number
      tooShortForCastCount: number
      missedInstantReadyUnassistedCount: number
      missedWhileTargetDiedCount: number
      reactionSamples: number[]
      items: HealerEmergencyItem[]
    }
  >()

  const fastestSamples: number[] = []
  let targetDiedCount = 0
  let instantReadyOpps = 0
  let instantUsedWhenReadyCount = 0
  let missedInstantReadyUnassistedTotal = 0

  for (const ev of events) {
    if (ev.target_died) targetDiedCount++
    if (ev.fastest_reaction_ms !== null) fastestSamples.push(ev.fastest_reaction_ms)
    const ttd = ev.time_to_death_ms
    const diedBeforeCastWindow = ttd !== undefined && ttd !== null && ttd < safeMinCastMs

    for (const rx of ev.reactions) {
      let row = byHealer.get(rx.healer)
      if (!row) {
        row = {
          healer: rx.healer,
          className: rx.healer_class,
          spec: rx.healer_spec,
          opportunities: 0,
          reactedCount: 0,
          instantUsedCount: 0,
          castUsedCount: 0,
          castUsedDespiteInstantReadyCount: 0,
          noHealCount: 0,
          coveredFastCount: 0,
          tooShortForCastCount: 0,
          missedInstantReadyUnassistedCount: 0,
          missedWhileTargetDiedCount: 0,
          reactionSamples: [],
          items: [],
        }
        byHealer.set(rx.healer, row)
      }
      if (!row.spec && rx.healer_spec) row.spec = rx.healer_spec
      row.opportunities++
      if (rx.instant_was_ready) {
        instantReadyOpps++
        if (rx.status === 'instant_used') instantUsedWhenReadyCount++
      }
      let tooShortForCast = false
      if (rx.status === 'instant_used') {
        row.reactedCount++
        row.instantUsedCount++
        if (rx.reaction_ms !== null) row.reactionSamples.push(rx.reaction_ms)
      } else if (rx.status === 'cast_used') {
        row.reactedCount++
        row.castUsedCount++
        if (rx.instant_was_ready) row.castUsedDespiteInstantReadyCount++
        if (rx.reaction_ms !== null) row.reactionSamples.push(rx.reaction_ms)
      } else {
        row.noHealCount++
        if (rx.covered_fast_by_other) {
          row.coveredFastCount++
        } else if (!rx.instant_was_ready && diedBeforeCastWindow) {
          tooShortForCast = true
          row.tooShortForCastCount++
        } else {
          if (rx.instant_was_ready) {
            row.missedInstantReadyUnassistedCount++
            missedInstantReadyUnassistedTotal++
          }
          if (ev.target_died) row.missedWhileTargetDiedCount++
        }
      }
      row.items.push({ event: ev, reaction: rx, tooShortForCast })
    }
  }

  const healers: HealerEmergencyRow[] = Array.from(byHealer.values())
    .map((h) => ({
      healer: h.healer,
      className: h.className,
      spec: h.spec,
      opportunities: h.opportunities,
      reactedCount: h.reactedCount,
      instantUsedCount: h.instantUsedCount,
      castUsedCount: h.castUsedCount,
      castUsedDespiteInstantReadyCount: h.castUsedDespiteInstantReadyCount,
      noHealCount: h.noHealCount,
      coveredFastCount: h.coveredFastCount,
      tooShortForCastCount: h.tooShortForCastCount,
      missedInstantReadyUnassistedCount: h.missedInstantReadyUnassistedCount,
      missedWhileTargetDiedCount: h.missedWhileTargetDiedCount,
      avgReactionMs:
        h.reactionSamples.length > 0
          ? Math.round(h.reactionSamples.reduce((a, b) => a + b, 0) / h.reactionSamples.length)
          : null,
      medianReactionMs: calcMedian(h.reactionSamples),
      items: h.items,
    }))
    .sort((a, b) => {
      if (a.avgReactionMs === null && b.avgReactionMs === null) return a.healer.localeCompare(b.healer)
      if (a.avgReactionMs === null) return 1
      if (b.avgReactionMs === null) return -1
      return a.avgReactionMs - b.avgReactionMs || b.reactedCount - a.reactedCount
    })

  const avgFastestMs =
    fastestSamples.length > 0
      ? Math.round(fastestSamples.reduce((a, b) => a + b, 0) / fastestSamples.length)
      : null

  return {
    totalEvents: events.length,
    filteredInstantDeathCount,
    targetDiedCount,
    avgFastestMs,
    medianFastestMs: calcMedian(fastestSamples),
    instantReadyOpps,
    instantUsedWhenReadyCount,
    instantUsedWhenReadyRatePct:
      instantReadyOpps > 0 ? Math.round((instantUsedWhenReadyCount / instantReadyOpps) * 100) : 0,
    missedInstantReadyUnassistedTotal,
    events,
    healers,
  }
}

export function aggregateHealerTankSoaks(
  reports: ReportData[],
  maxDeaths: number | null,
  pullRange?: PullRange | null,
  phaseFilter?: BossPhaseKey | null,
) {
  const raw: WithReport<HealerTankSoakEvent>[] = []
  for (const rep of reports) {
    const label = getReportDisplayName(rep)
    const pullByFightId = new Map<number, PullData>()
    for (const p of rep.pulls) pullByFightId.set(p.fight_id, p)
    for (const ev of rep.healer_tank_soak_events ?? []) {
      if (phaseFilter && getEventBossPhase(pullByFightId.get(ev.fight_id), ev.timestamp) !== phaseFilter) {
        continue
      }
      raw.push({ ...ev, reportCode: rep.code, reportLabel: label, reportDate: rep.date_iso })
    }
  }
  const events = filterByPullRange(filterByMaxDeaths(raw, maxDeaths), pullRange).sort(
    (a, b) => b.reportDate.localeCompare(a.reportDate) || a.pull_num - b.pull_num || a.timestamp - b.timestamp,
  )

  const byHealer = new Map<
    string,
    {
      healer: string
      className: string
      spec: string
      opportunities: number
      healedSoaks: number
      unhealedSoaks: number
      totalHeals: number
      externalCount: number
      reactionSamples: number[]
      items: HealerTankSoakItem[]
    }
  >()

  const fastestSamples: number[] = []
  let soaksWithHealCount = 0
  let tankLowCount = 0
  let tankDiedCount = 0

  for (const ev of events) {
    if (ev.any_healed) soaksWithHealCount++
    if (ev.min_hp_pct !== null && ev.min_hp_pct < 30) tankLowCount++
    if (ev.tank_died) tankDiedCount++
    if (ev.fastest_reaction_ms !== null) fastestSamples.push(ev.fastest_reaction_ms)

    for (const rx of ev.reactions) {
      let row = byHealer.get(rx.healer)
      if (!row) {
        row = {
          healer: rx.healer,
          className: rx.healer_class,
          spec: rx.healer_spec,
          opportunities: 0,
          healedSoaks: 0,
          unhealedSoaks: 0,
          totalHeals: 0,
          externalCount: 0,
          reactionSamples: [],
          items: [],
        }
        byHealer.set(rx.healer, row)
      }
      if (!row.spec && rx.healer_spec) row.spec = rx.healer_spec
      row.opportunities++
      if (rx.healed) {
        row.healedSoaks++
        row.totalHeals += rx.heal_count
        if (rx.used_external) row.externalCount++
        if (rx.reaction_ms !== null) row.reactionSamples.push(rx.reaction_ms)
      } else {
        row.unhealedSoaks++
      }
      row.items.push({ event: ev, reaction: rx })
    }
  }

  const healers: HealerTankSoakRow[] = Array.from(byHealer.values())
    .map((h) => ({
      healer: h.healer,
      className: h.className,
      spec: h.spec,
      opportunities: h.opportunities,
      healedSoaks: h.healedSoaks,
      unhealedSoaks: h.unhealedSoaks,
      healedRatePct: h.opportunities > 0 ? Math.round((h.healedSoaks / h.opportunities) * 100) : 0,
      totalHeals: h.totalHeals,
      avgHealsPerSoak: h.healedSoaks > 0 ? Math.round((h.totalHeals / h.healedSoaks) * 10) / 10 : 0,
      externalCount: h.externalCount,
      avgReactionMs:
        h.reactionSamples.length > 0
          ? Math.round(h.reactionSamples.reduce((a, b) => a + b, 0) / h.reactionSamples.length)
          : null,
      medianReactionMs: calcMedian(h.reactionSamples),
      items: h.items,
    }))
    .sort((a, b) => b.healedRatePct - a.healedRatePct || (a.avgReactionMs ?? 99999) - (b.avgReactionMs ?? 99999))

  const avgFastestMs =
    fastestSamples.length > 0
      ? Math.round(fastestSamples.reduce((a, b) => a + b, 0) / fastestSamples.length)
      : null

  return {
    totalSoaks: events.length,
    soaksWithHealCount,
    soaksWithHealRatePct: events.length > 0 ? Math.round((soaksWithHealCount / events.length) * 100) : 0,
    avgFastestMs,
    tankLowCount,
    tankDiedCount,
    events,
    healers,
  }
}

export type GroupSoakPhaseFilter = 'shattering' | 'p1' | 'all'

export interface GroupSoakPlayerIncident {
  soak: WithReport<GroupSoakEvent>
  kind: 'missed_alive' | 'wrong_group' | 'dead_expected'
  doubleSoak: boolean
}

export interface GroupSoakPlayerRow {
  player: string
  className: string
  groupLabel: string
  groupClass: string
  expectedCount: number
  correctCount: number
  missedAliveCount: number
  wrongGroupCount: number
  doubleSoakCount: number
  deadCount: number
  bossTankExemptCount: number
  soakRatePct: number
  incidents: GroupSoakPlayerIncident[]
}

export interface GroupSoakTableGroup {
  label: string
  tankClass: string
  players: GroupSoakPlayerRow[]
  totalCorrect: number
  totalMissedAlive: number
  totalWrongGroup: number
  totalDoubleSoak: number
}

function isShattering3Groups(
  g: ShatteringSoakGroups | SoakGroupDefinition | undefined | null,
): g is ShatteringSoakGroups {
  return Boolean(g && 'groups' in g && Array.isArray((g as ShatteringSoakGroups).groups))
}

export function getLatestP2Groups(reports: ReportData[]): SoakGroupDefinition | null {
  const sortedReps = [...reports].sort((a, b) => b.start_time_epoch_ms - a.start_time_epoch_ms)
  for (const rep of sortedReps) {
    const p2 = rep.soak_groups?.p2
    if (p2 && (p2.group_a_players.length > 0 || p2.group_b_players.length > 0)) {
      return p2
    }
    const legacy = rep.soak_groups?.shattering
    if (legacy && !isShattering3Groups(legacy) && (legacy.group_a_players.length > 0 || legacy.group_b_players.length > 0)) {
      return legacy
    }
  }
  return null
}

function normalizeWoWNameKeys(raw: string): string[] {
  const base = raw
    .trim()
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const keys = [base]
  if (base.includes('ß')) {
    keys.push(base.replace(/ß/g, 'b'))
    keys.push(base.replace(/ß/g, 'ss'))
  }
  return keys
}

export function parseMrtSoakGroups(
  rawText: string,
  roster: GroupSoakPlayerRef[],
): {
  groups: ShatteringGroupEntry[]
  unknownNames: string[]
  matchedCount: number
} {
  const lookup = new Map<string, GroupSoakPlayerRef>()
  for (const p of roster) {
    for (const key of normalizeWoWNameKeys(p.player)) {
      if (!lookup.has(key)) lookup.set(key, p)
    }
  }

  const keys: ('G1' | 'G2' | 'G3')[] = ['G1', 'G2', 'G3']
  const labels: Record<'G1' | 'G2' | 'G3', string> = {
    G1: 'Gruppe 1',
    G2: 'Gruppe 2',
    G3: 'Gruppe 3',
  }
  const buckets: Record<'G1' | 'G2' | 'G3', GroupSoakPlayerRef[]> = { G1: [], G2: [], G3: [] }
  const seenInGroup: Record<'G1' | 'G2' | 'G3', Set<string>> = {
    G1: new Set(),
    G2: new Set(),
    G3: new Set(),
  }
  const unknownNames: string[] = []
  const seenUnknown = new Set<string>()

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  let autoIdx = 0
  for (const origLine of lines) {
    // Strip WoW color codes (|cAARRGGBB ... |r) and MRT icons ({rt1}, {spell:123})
    let line = origLine
      .replace(/\|c[0-9a-fA-F]{8}/g, '')
      .replace(/\|r/g, '')
      .replace(/\{[^}]*\}/g, ' ')
      .trim()
    if (!line) continue

    let targetKey: 'G1' | 'G2' | 'G3' | null = null
    const prefixMatch = line.match(/^(?:(?:soak[-\s]*)?(?:gruppe|grp|group|g|soak)\s*)?([123])\s*[:)\-.]\s*(.*)$/i)
    if (prefixMatch) {
      targetKey = keys[Number(prefixMatch[1]) - 1]
      line = prefixMatch[2].trim()
    } else if (autoIdx < 3) {
      targetKey = keys[autoIdx]
      autoIdx++
    } else {
      targetKey = 'G3'
    }

    const tokens = line
      .split(/[\s,;:/|\-–—•]+/)
      .map((t) => t.replace(/^[^\p{L}\p{N}ßøæœł]+|[^\p{L}\p{N}ßøæœł]+$/gu, '').trim())
      .filter((t) => t.length >= 2)

    for (const tok of tokens) {
      const normKeys = normalizeWoWNameKeys(tok)
      let matched: GroupSoakPlayerRef | undefined
      for (const nk of normKeys) {
        matched = lookup.get(nk)
        if (matched) break
      }
      if (matched) {
        if (!seenInGroup[targetKey].has(matched.player)) {
          seenInGroup[targetKey].add(matched.player)
          buckets[targetKey].push(matched)
        }
      } else if (!seenUnknown.has(tok.toLowerCase())) {
        seenUnknown.add(tok.toLowerCase())
        unknownNames.push(tok)
      }
    }
  }

  const groups: ShatteringGroupEntry[] = keys.map((k) => ({
    key: k,
    label: labels[k],
    players: buckets[k],
  }))
  const matchedCount = groups.reduce((s, g) => s + g.players.length, 0)
  return { groups, unknownNames, matchedCount }
}

function reEvaluateShatteringWithCustomGroups(
  soaks: WithReport<GroupSoakEvent>[],
  customGroups: ShatteringGroupEntry[],
): WithReport<GroupSoakEvent>[] {
  const perms3: ('G1' | 'G2' | 'G3')[][] = [
    ['G1', 'G2', 'G3'],
    ['G1', 'G3', 'G2'],
    ['G2', 'G1', 'G3'],
    ['G2', 'G3', 'G1'],
    ['G3', 'G1', 'G2'],
    ['G3', 'G2', 'G1'],
  ]
  const labelByKey = new Map<'G1' | 'G2' | 'G3', string>()
  const grpByPlayer = new Map<string, 'G1' | 'G2' | 'G3'>()
  for (const g of customGroups) {
    labelByKey.set(g.key, g.label)
    for (const p of g.players) grpByPlayer.set(p.player, g.key)
  }

  const byFight = new Map<string, WithReport<GroupSoakEvent>[]>()
  for (const s of soaks) {
    const k = `${s.reportCode}:${s.fight_id}`
    const arr = byFight.get(k) ?? []
    arr.push(s)
    byFight.set(k, arr)
  }

  const out: WithReport<GroupSoakEvent>[] = []
  for (const list of byFight.values()) {
    const ordered = [...list].sort((a, b) => a.soak_num - b.soak_num || a.timestamp - b.timestamp)
    const firstRound = ordered.slice(0, 3)

    // Determine best-of-6 cyclic rotation for this fight against the user's MRT groups
    let bestPerm = perms3[0]
    let bestScore = -1
    for (const perm of perms3) {
      let sc = 0
      for (let ci = 0; ci < firstRound.length; ci++) {
        const gk = perm[ci]
        const participants = [...firstRound[ci].soakers, ...firstRound[ci].wrong_group]
        for (const p of participants) {
          if (grpByPlayer.get(p.player) === gk) sc++
        }
      }
      if (sc > bestScore) {
        bestScore = sc
        bestPerm = perm
      }
    }

    const lastSoakIdx = new Map<string, number>()
    for (let i = 0; i < ordered.length; i++) {
      const s = ordered[i]
      const sIdx = i + 1
      const expKey = bestPerm[(sIdx - 1) % 3]
      const expLabel = labelByKey.get(expKey) ?? s.expected_group

      // Reconstruct exact participants + alive/dead raid pool at timestamp cts
      const participantMap = new Map<string, GroupSoakPlayerRef>()
      for (const p of [...s.soakers, ...s.wrong_group]) {
        participantMap.set(p.player, { player: p.player, class: p.class, player_id: p.player_id })
      }
      const aliveAbsent = new Map<string, GroupSoakPlayerRef>()
      const deadAbsent = new Map<string, GroupSoakPlayerRef>()
      if (s.absent_alive || s.absent_dead) {
        for (const p of s.absent_alive ?? []) aliveAbsent.set(p.player, p)
        for (const p of s.absent_dead ?? []) deadAbsent.set(p.player, p)
      } else {
        for (const p of s.missed_alive) aliveAbsent.set(p.player, p)
        for (const p of s.dead_expected) deadAbsent.set(p.player, p)
      }

      const soakers: GroupSoakPlayerRef[] = []
      const wrongGroup: GroupSoakPlayerRef[] = []
      for (const p of Array.from(participantMap.values()).sort((a, b) => a.player.localeCompare(b.player))) {
        const pg = grpByPlayer.get(p.player)
        const prevIdx = lastSoakIdx.get(p.player)
        const isDouble = prevIdx !== undefined && sIdx - prevIdx < 3
        if ((pg !== undefined && pg !== expKey) || isDouble) {
          wrongGroup.push({ ...p, double_soak: isDouble })
        } else {
          soakers.push(p)
        }
      }

      const missedAlive: GroupSoakPlayerRef[] = []
      const deadExpected: GroupSoakPlayerRef[] = []
      for (const p of Array.from(aliveAbsent.values()).sort((a, b) => a.player.localeCompare(b.player))) {
        if (grpByPlayer.get(p.player) === expKey) missedAlive.push(p)
      }
      for (const p of Array.from(deadAbsent.values()).sort((a, b) => a.player.localeCompare(b.player))) {
        if (grpByPlayer.get(p.player) === expKey) deadExpected.push(p)
      }

      for (const name of participantMap.keys()) lastSoakIdx.set(name, sIdx)

      out.push({
        ...s,
        confidence: 'mrt',
        expected_group: expLabel,
        correct_count: soakers.length,
        total_soakers: participantMap.size,
        alternation_ok: wrongGroup.length === 0 && missedAlive.length === 0,
        soakers,
        missed_alive: missedAlive,
        wrong_group: wrongGroup,
        dead_expected: deadExpected,
      })
    }
  }

  return out.sort(
    (a, b) => b.reportDate.localeCompare(a.reportDate) || a.pull_num - b.pull_num || a.timestamp - b.timestamp,
  )
}

export function aggregateGroupSoaks(
  reports: ReportData[],
  maxDeaths: number | null,
  pullRange: PullRange | null | undefined,
  phaseFilter: GroupSoakPhaseFilter,
  customShatteringGroups?: ShatteringGroupEntry[] | null,
) {
  const allFiltered: WithReport<GroupSoakEvent>[] = []
  for (const rep of reports) {
    const label = getReportDisplayName(rep)
    const filtered = filterByPullRange(filterByMaxDeaths(rep.group_soaks ?? [], maxDeaths), pullRange)
    for (const s of filtered) {
      allFiltered.push({ ...s, reportCode: rep.code, reportLabel: label, reportDate: rep.date_iso })
    }
  }

  let shatteringCount = 0
  let p1Count = 0
  for (const s of allFiltered) {
    if (s.phase === 'shattering') shatteringCount++
    else if (s.phase === 'p1') p1Count++
  }

  const hasCustomMrt = Boolean(
    phaseFilter === 'shattering' &&
      customShatteringGroups &&
      customShatteringGroups.some((g) => g.players.length > 0),
  )

  let soaks = (phaseFilter === 'all' ? allFiltered : allFiltered.filter((s) => s.phase === phaseFilter)).sort(
    (a, b) =>
      b.reportDate.localeCompare(a.reportDate) ||
      a.pull_num - b.pull_num ||
      a.timestamp - b.timestamp,
  )

  if (hasCustomMrt && customShatteringGroups) {
    soaks = reEvaluateShatteringWithCustomGroups(soaks, customShatteringGroups)
  }

  // Resolve latest report's group roster (2-group for P1/legacy, 3-group for Shattering)
  const sortedReps = [...reports].sort((a, b) => b.start_time_epoch_ms - a.start_time_epoch_ms)
  let groups: SoakGroupDefinition | null = null
  let shatteringGroups: ShatteringSoakGroups | null = null

  if (phaseFilter === 'p1') {
    for (const rep of sortedReps) {
      const g = rep.soak_groups?.p1
      if (g && (g.group_a_players.length > 0 || g.group_b_players.length > 0)) {
        groups = g
        break
      }
    }
    if (!groups) {
      for (const rep of sortedReps) {
        if (rep.soak_groups?.p1) {
          groups = rep.soak_groups.p1
          break
        }
      }
    }
  } else {
    for (const rep of sortedReps) {
      const rawSh = rep.soak_groups?.shattering
      if (isShattering3Groups(rawSh)) {
        shatteringGroups = rawSh
        if (rawSh.rounds_observed > 0 || rawSh.groups.some((g) => g.players.length > 0)) break
      } else if (rawSh) {
        groups = rawSh
        if (rawSh.group_a_players.length > 0 || rawSh.group_b_players.length > 0) break
      }
    }
  }

  if (hasCustomMrt && customShatteringGroups) {
    shatteringGroups = {
      confidence: 'mrt',
      rounds_observed: shatteringGroups?.rounds_observed ?? 0,
      groups: customShatteringGroups,
    }
    groups = null
  }

  const confidence: ShatteringConfidence = hasCustomMrt
    ? 'mrt'
    : shatteringGroups?.confidence ?? (soaks.length > 0 ? 'high' : 'none')
  const roundsObserved = shatteringGroups?.rounds_observed ?? 0

  const playerGroupMap = new Map<string, { label: string; cls: string }>()
  if (shatteringGroups) {
    for (const g of shatteringGroups.groups) {
      for (const p of g.players) {
        playerGroupMap.set(p.player, { label: g.label, cls: '' })
      }
    }
  } else if (groups) {
    for (const p of groups.group_a_players) {
      playerGroupMap.set(p.player, { label: groups.group_a_label, cls: groups.group_a_class })
    }
    for (const p of groups.group_b_players) {
      playerGroupMap.set(p.player, { label: groups.group_b_label, cls: groups.group_b_class })
    }
  }

  const byPlayer = new Map<string, GroupSoakPlayerRow>()
  const ensure = (player: string, className: string): GroupSoakPlayerRow => {
    let row = byPlayer.get(player)
    if (!row) {
      const gInfo = playerGroupMap.get(player)
      row = {
        player,
        className,
        groupLabel: gInfo?.label ?? '—',
        groupClass: gInfo?.cls ?? '',
        expectedCount: 0,
        correctCount: 0,
        missedAliveCount: 0,
        wrongGroupCount: 0,
        doubleSoakCount: 0,
        deadCount: 0,
        bossTankExemptCount: 0,
        soakRatePct: 100,
        incidents: [],
      }
      byPlayer.set(player, row)
    } else if (!row.className && className) {
      row.className = className
    }
    return row
  }

  let cleanSoaks = 0
  let missedAliveTotal = 0
  let wrongGroupTotal = 0
  let doubleSoakTotal = 0
  let bossTankExemptTotal = 0

  for (const s of soaks) {
    if (s.alternation_ok) cleanSoaks++
    for (const p of s.soakers) {
      const r = ensure(p.player, p.class)
      r.correctCount++
      r.expectedCount++
    }
    for (const p of s.missed_alive) {
      const r = ensure(p.player, p.class)
      r.missedAliveCount++
      r.expectedCount++
      r.incidents.push({ soak: s, kind: 'missed_alive', doubleSoak: false })
      missedAliveTotal++
    }
    for (const p of s.wrong_group) {
      const r = ensure(p.player, p.class)
      r.wrongGroupCount++
      if (p.double_soak) {
        r.doubleSoakCount++
        doubleSoakTotal++
      }
      r.incidents.push({ soak: s, kind: 'wrong_group', doubleSoak: Boolean(p.double_soak) })
      wrongGroupTotal++
    }
    for (const p of s.dead_expected) {
      const r = ensure(p.player, p.class)
      r.deadCount++
      r.incidents.push({ soak: s, kind: 'dead_expected', doubleSoak: false })
    }
    if (s.boss_tank_exempt) {
      const r = ensure(s.boss_tank_exempt.player, s.boss_tank_exempt.class)
      r.bossTankExemptCount++
      bossTankExemptTotal++
    }
  }

  const players = Array.from(byPlayer.values())
    .map((r) => ({
      ...r,
      soakRatePct: r.expectedCount > 0 ? Math.round((r.correctCount / r.expectedCount) * 100) : 100,
    }))
    .sort(
      (a, b) =>
        b.missedAliveCount + b.wrongGroupCount - (a.missedAliveCount + a.wrongGroupCount) ||
        b.doubleSoakCount - a.doubleSoakCount ||
        b.missedAliveCount - a.missedAliveCount ||
        a.player.localeCompare(b.player),
    )

  const makeTableGroup = (label: string, tankClass: string, list: GroupSoakPlayerRow[]): GroupSoakTableGroup => ({
    label,
    tankClass,
    players: list,
    totalCorrect: list.reduce((acc, r) => acc + r.correctCount, 0),
    totalMissedAlive: list.reduce((acc, r) => acc + r.missedAliveCount, 0),
    totalWrongGroup: list.reduce((acc, r) => acc + r.wrongGroupCount, 0),
    totalDoubleSoak: list.reduce((acc, r) => acc + r.doubleSoakCount, 0),
  })

  const groupTables: GroupSoakTableGroup[] = []
  if (shatteringGroups) {
    const knownLabels = new Set<string>()
    for (const g of shatteringGroups.groups) {
      knownLabels.add(g.label)
      const list = players.filter((p) => p.groupLabel === g.label)
      groupTables.push(makeTableGroup(g.label, '', list))
    }
    const others = players.filter((p) => !knownLabels.has(p.groupLabel))
    if (others.length > 0) {
      groupTables.push(makeTableGroup('Nicht zugeordnet', '', others))
    }
  } else if (groups) {
    const grpA = players.filter((p) => p.groupLabel === groups!.group_a_label)
    const grpB = players.filter((p) => p.groupLabel === groups!.group_b_label)
    const others = players.filter(
      (p) => p.groupLabel !== groups!.group_a_label && p.groupLabel !== groups!.group_b_label,
    )
    groupTables.push(makeTableGroup(groups.group_a_label, groups.group_a_class, grpA))
    groupTables.push(makeTableGroup(groups.group_b_label, groups.group_b_class, grpB))
    if (others.length > 0) {
      groupTables.push(makeTableGroup('Weitere Spieler', '', others))
    }
  } else if (players.length > 0) {
    groupTables.push(makeTableGroup('Alle Spieler', '', players))
  }

  return {
    groups,
    shatteringGroups,
    confidence,
    roundsObserved,
    groupTables,
    totalSoaks: soaks.length,
    cleanSoaks,
    cleanRatePct: soaks.length > 0 ? Math.round((cleanSoaks / soaks.length) * 100) : 100,
    missedAliveTotal,
    wrongGroupTotal,
    doubleSoakTotal,
    bossTankExemptTotal,
    shatteringCount,
    p1Count,
    soaks,
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
