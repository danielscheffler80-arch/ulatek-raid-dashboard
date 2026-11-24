/** Pure Ula'tek Mythic combat-log analysis engine for Cloudflare Pages Functions. */

import {
  CLASS_BASELINE_DEFS,
  CLASS_DEFAULT_INTERRUPT,
  DEMONIC_HEALTHSTONE_CD_MS,
  DEMONIC_HEALTHSTONE_ID,
  HEALTH_POTION_CD_MS,
  MYTHIC_DIFFICULTY,
  P2_AVOIDABLE_IDS,
  P3_AVOIDABLE_SPELL_NAMES,
  P3_KICK_SPELL_NAMES,
  RAID_SPIKE_ABILITY_IDS,
  SPELL_CAUSTIC_WAVES,
  SPELL_FALLING_DEBRIS,
  SPELL_GRASPING_FANGS_DEBUFF,
  SPELL_MALICE_CAST,
  SPELL_MALICE_DMG,
  SPELL_MELEE,
  SPELL_MOTHERS_WRATH_DMG,
  SPELL_NOXIOUS_SHELL_DEBUFF,
  SPELL_NOXIOUS_SPLASH,
  SPELL_PUTRID_MEMBRANE_DEBUFF,
  SPELL_RANCID_YOLK,
  SPELL_SOUL_CONSTRICTOR,
  SPELL_SPECTRAL_COILS_CAST,
  SPELL_STONE_VENOM_DEBUFF,
  SPELL_STONE_VENOM_DMG,
  TANK_DEFAULT_INTERRUPT,
  ULATEK_ENCOUNTER_ID,
  defensiveMitigates,
  getDefensiveCooldownMs,
  getInterruptCooldownMs,
  inferDamageSchool,
  isDefensiveBuff,
  isHealthPotion,
  isHealthstone,
  isInterruptSpell,
  isTrackablePersonalDef,
} from './spells'

export interface WclActor {
  id: number
  gameID?: number
  name: string
  type: string
  subType?: string
}

export interface WclFight {
  id: number
  name: string
  startTime: number
  endTime: number
  fightPercentage?: number
  bossPercentage?: number
  kill?: boolean
  friendlyPlayers?: number[]
  phaseTransitions?: { id: number; startTime: number }[]
}

export interface WclEvent {
  timestamp: number
  type: string
  fight?: number
  sourceID?: number
  sourceInstance?: number
  targetID?: number
  targetInstance?: number
  abilityGameID?: number
  extraAbilityGameID?: number
  killerID?: number
  killingAbilityGameID?: number
  amount?: number
  overkill?: number
  tick?: boolean
  stack?: number
  hitPoints?: number
  maxHitPoints?: number
}

export interface ExtraTables {
  ability_schools?: Record<number, number>
  heart_windows?: {
    fight_id: number
    window_num: number
    start_time: number
    end_time: number
    heart_by_player: Record<number, number>
    boss_by_player: Record<number, number>
    total_by_player: Record<number, number>
  }[]
  warden_dmg_by_fight?: Record<number, Record<number, number>>
  p3_boss_dmg_by_fight?: Record<number, Record<number, number>>
}

const LIVE_INACTIVE_MINUTES = 45

export function evaluateLiveStatus(
  startTimeEpochMs: number,
  lastPullEndEpochMs: number,
  nowMs = Date.now(),
) {
  const refMs = lastPullEndEpochMs > 0 ? lastPullEndEpochMs : startTimeEpochMs
  const minutesSinceLastPull = refMs > 0 ? Math.max(0, Math.round(((nowMs - refMs) / 60_000) * 10) / 10) : 9999
  // Same calendar day (UTC or within 18h window around today's date in CET/CEST) AND <= 45 min since last pull
  const nowDateUtc = new Date(nowMs).toISOString().slice(0, 10)
  const reportDateUtc = refMs > 0 ? new Date(refMs).toISOString().slice(0, 10) : ''
  const nowBerlin = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(nowMs))
  const refBerlin = refMs > 0 ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(refMs)) : ''
  const isToday = Boolean(refMs > 0 && (reportDateUtc === nowDateUtc || refBerlin === nowBerlin))
  const isLive = isToday && minutesSinceLastPull <= LIVE_INACTIVE_MINUTES
  return {
    is_today: isToday,
    minutes_since_last_pull: minutesSinceLastPull,
    is_live: isLive,
  }
}

function formatRelTime(ms: number): string {
  const clamped = Math.max(0, ms)
  const totalSec = clamped / 1000
  const m = Math.floor(totalSec / 60)
  const s = totalSec - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`
}

function buildEventsUrl(
  code: string,
  fid: number,
  tid: number,
  ts: number,
  fStart: number,
  fEnd: number,
  windowMs = 3000,
): string {
  const s = Math.max(fStart, ts - windowMs)
  const e = Math.min(fEnd, ts + windowMs)
  return `https://www.warcraftlogs.com/reports/${code}?fight=${fid}&type=damage-taken&view=events&source=${tid}&start=${s}&end=${e}`
}

function buildReplayUrl(code: string, fid: number, relMs: number, leadMs = 3000): string {
  return `https://www.warcraftlogs.com/reports/${code}?fight=${fid}&view=replay&position=${Math.max(0, Math.floor(relMs - leadMs))}`
}

function buildDamageWindowUrl(code: string, fid: number, s: number, e: number): string {
  return `https://www.warcraftlogs.com/reports/${code}?fight=${fid}&type=damage-done&start=${Math.floor(s)}&end=${Math.floor(e)}`
}

function detectTanks(actors: Record<number, WclActor>, eventsByFight: Record<number, WclEvent[]>): number[] {
  const scores = new Map<number, number>()
  for (const fevs of Object.values(eventsByFight)) {
    for (const ev of fevs) {
      const tid = ev.targetID
      if (tid === undefined || actors[tid]?.type !== 'Player') continue
      const aid = ev.abilityGameID
      if (aid === SPELL_STONE_VENOM_DEBUFF || aid === SPELL_STONE_VENOM_DMG) {
        scores.set(tid, (scores.get(tid) ?? 0) + 10)
      } else if (ev.type === 'damage' && aid === SPELL_MELEE) {
        const srcName = ev.sourceID !== undefined ? actors[ev.sourceID]?.name ?? '' : ''
        if (srcName === "Ula'tek" || srcName === 'Gore Rattle') {
          scores.set(tid, (scores.get(tid) ?? 0) + 1)
        }
      }
    }
  }
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id]) => id)
}

export function analyzeReportEventsTS(
  meta: { title: string; startTime: number },
  fights: WclFight[],
  actors: Record<number, WclActor>,
  abilities: Record<number, string>,
  eventsByFight: Record<number, WclEvent[]>,
  reportCode: string,
  extraTables: ExtraTables = {},
  encounterId = ULATEK_ENCOUNTER_ID,
  difficulty = MYTHIC_DIFFICULTY,
) {
  const sortedFights = [...fights].sort((a, b) => a.startTime - b.startTime)
  const tankIds = detectTanks(actors, eventsByFight)
  const tankIdSet = new Set(tankIds)
  const abilitySchools = extraTables.ability_schools ?? {}

  // Build known personal defensive kits per player
  const playerKnownDefs = new Map<number, Map<string, string>>()
  for (const actor of Object.values(actors)) {
    if (actor.type !== 'Player') continue
    const kit = new Map<string, string>()
    for (const base of CLASS_BASELINE_DEFS[actor.subType ?? ''] ?? []) {
      kit.set(base.toLowerCase(), base)
    }
    playerKnownDefs.set(actor.id, kit)
  }
  for (const fevs of Object.values(eventsByFight)) {
    for (const ev of fevs) {
      if (ev.type !== 'applybuff' && ev.type !== 'cast') continue
      const abName = (ev.abilityGameID !== undefined ? abilities[ev.abilityGameID] ?? '' : '').trim()
      if (!isTrackablePersonalDef(abName)) continue
      const pid =
        ev.sourceID !== undefined && playerKnownDefs.has(ev.sourceID)
          ? ev.sourceID
          : ev.targetID !== undefined && playerKnownDefs.has(ev.targetID)
            ? ev.targetID
            : undefined
      if (pid !== undefined && (ev.sourceID === ev.targetID || ev.sourceID === pid || ev.sourceID === undefined)) {
        const kit = playerKnownDefs.get(pid)!
        if (!kit.has(abName.toLowerCase())) kit.set(abName.toLowerCase(), abName)
      }
    }
  }

  // Build known interrupt spells per player
  const playerInterrupts = new Map<number, [string, number]>()
  for (const actor of Object.values(actors)) {
    if (actor.type !== 'Player') continue
    const cls = actor.subType ?? ''
    if (cls in CLASS_DEFAULT_INTERRUPT) {
      const [sp, cd] = CLASS_DEFAULT_INTERRUPT[cls]
      playerInterrupts.set(actor.id, [sp, cd * 1000])
    } else if (tankIdSet.has(actor.id) && cls in TANK_DEFAULT_INTERRUPT) {
      const [sp, cd] = TANK_DEFAULT_INTERRUPT[cls]
      playerInterrupts.set(actor.id, [sp, cd * 1000])
    }
  }
  for (const fevs of Object.values(eventsByFight)) {
    for (const ev of fevs) {
      if (ev.type !== 'interrupt' && ev.type !== 'cast') continue
      const src = ev.sourceID
      if (src === undefined || actors[src]?.type !== 'Player') continue
      const abName = (ev.abilityGameID !== undefined ? abilities[ev.abilityGameID] ?? '' : '').trim()
      if (isInterruptSpell(abName)) {
        playerInterrupts.set(src, [abName, getInterruptCooldownMs(abName)])
      }
    }
  }

  const heartByFight = new Map<number, NonNullable<ExtraTables['heart_windows']>>()
  for (const hw of extraTables.heart_windows ?? []) {
    const list = heartByFight.get(hw.fight_id) ?? []
    list.push(hw)
    heartByFight.set(hw.fight_id, list)
  }

  const pullsOut: Record<string, unknown>[] = []
  const eggFails: Record<string, unknown>[] = []
  const waveFails: Record<string, unknown>[] = []
  const tankFails: Record<string, unknown>[] = []
  const defensiveEvents: Record<string, unknown>[] = []
  const consumableUsage: Record<string, unknown>[] = []
  const heartPhases: Record<string, unknown>[] = []
  const phaseEvents: Record<string, unknown>[] = []
  const wardenSummaries: Record<string, unknown>[] = []
  const p3Summaries: Record<string, unknown>[] = []
  const removalSummary = {
    spectral_coils: 0,
    caustic_waves: 0,
    egg_collision: 0,
    noxious_splash: 0,
    player_death: 0,
    other: 0,
  }
  const playerPullsPresent = new Map<number, number>()

  sortedFights.forEach((fight, idx) => {
    const pullNum = idx + 1
    const fid = fight.id
    const fStart = fight.startTime
    const fEnd = fight.endTime
    const isKill = Boolean(fight.kill)
    const fevs = [...(eventsByFight[fid] ?? [])].sort((a, b) => a.timestamp - b.timestamp)

    const fightPlayers = new Set<number>()
    for (const pid of fight.friendlyPlayers ?? []) {
      if (actors[pid]?.type === 'Player') fightPlayers.add(pid)
    }

    const playerDeaths: { ts: number; tid: number; ev: WclEvent }[] = []
    const deathsByPlayer = new Map<number, number[]>()
    for (const ev of fevs) {
      for (const idVal of [ev.sourceID, ev.targetID]) {
        if (idVal !== undefined && actors[idVal]?.type === 'Player') fightPlayers.add(idVal)
      }
      if (ev.type === 'death' && ev.targetID !== undefined && actors[ev.targetID]?.type === 'Player') {
        playerDeaths.push({ ts: ev.timestamp, tid: ev.targetID, ev })
        const list = deathsByPlayer.get(ev.targetID) ?? []
        list.push(ev.timestamp)
        deathsByPlayer.set(ev.targetID, list)
      }
    }

    for (const pid of fightPlayers) {
      playerPullsPresent.set(pid, (playerPullsPresent.get(pid) ?? 0) + 1)
    }

    const countDeathsBefore = (ts: number) => playerDeaths.reduce((c, d) => c + (d.ts < ts ? 1 : 0), 0)

    // Pre-scan Warden sides via damage/interrupt targetInstance
    const wardenDmgByInst = new Map<number, Map<number, number>>()
    for (const ev of fevs) {
      const src = ev.sourceID
      const tgt = ev.targetID
      if (src === undefined || actors[src]?.type !== 'Player') continue
      if (tgt !== undefined && actors[tgt]?.name === 'Doomscale Warden') {
        const inst = ev.targetInstance ?? 1
        const m = wardenDmgByInst.get(inst) ?? new Map<number, number>()
        if (ev.type === 'damage') m.set(src, (m.get(src) ?? 0) + Math.max(1, ev.amount ?? 0))
        else if (ev.type === 'interrupt') m.set(src, (m.get(src) ?? 0) + 1000)
        wardenDmgByInst.set(inst, m)
      }
    }

    const sidePlayers = new Map<number, Set<number>>()
    const allWardenPlayers = new Set<number>()
    for (const m of wardenDmgByInst.values()) for (const p of m.keys()) allWardenPlayers.add(p)
    for (const pid of allWardenPlayers) {
      let bestInst = 1
      let bestAmt = 0
      for (const [inst, m] of wardenDmgByInst.entries()) {
        const amt = m.get(pid) ?? 0
        if (amt > bestAmt) {
          bestAmt = amt
          bestInst = inst
        }
      }
      if (bestAmt > 0) {
        const s = sidePlayers.get(bestInst) ?? new Set<number>()
        s.add(pid)
        sidePlayers.set(bestInst, s)
      }
    }

    const instToSide = new Map<number, string>()
    const instToSideTankClass = new Map<number, string>()
    for (const inst of Array.from(wardenDmgByInst.keys()).sort((a, b) => a - b)) {
      const s = sidePlayers.get(inst) ?? new Set<number>()
      const sideTank = tankIds.find((tk) => s.has(tk))
      if (sideTank !== undefined) {
        instToSide.set(inst, `${actors[sideTank].name} Seite`)
        instToSideTankClass.set(inst, actors[sideTank].subType ?? '')
      } else {
        instToSide.set(inst, `Warden #${inst}`)
        instToSideTankClass.set(inst, '')
      }
    }

    const coilsCasts: number[] = []
    const cwHitsByP = new Map<number, WclEvent[]>()
    const splashByP = new Map<number, WclEvent[]>()
    const constrictorByP = new Map<number, number[]>()
    const putridByP = new Map<number, number[]>()
    const rancidByP = new Map<number, number[]>()
    const shellRemoves: WclEvent[] = []

    const potCounts = new Map<number, number>()
    const hsCounts = new Map<number, number>()
    const defCdCasts = new Map<number, number>()
    const lastDefUsedTs = new Map<number, Map<string, number>>()
    const lastPotTs = new Map<number, number>()
    const lastHsTs = new Map<number, { ts: number; isDemonic: boolean }>()
    const activeAllDefs = new Map<number, Set<string>>()
    const activeTankDefs = new Map<number, Set<string>>()

    const debrisHitsInFight: { pid: number; ts: number }[] = []
    const fangBreaks: { ts: number; pid: number }[] = []
    const maliceMissedCasts: {
      ts: number
      inst: number
      side: string
      tankClass: string
      rdy: { player: string; class: string; spell: string }[]
      cd: { player: string; class: string; spell: string }[]
    }[] = []
    const lastMaliceMissByInst = new Map<number, number>()
    const maliceDmgEvents: { ts: number; amt: number }[] = []
    const viciousMissedCasts: {
      ts: number
      rdy: { player: string; class: string; spell: string }[]
      cd: { player: string; class: string; spell: string }[]
    }[] = []
    let lastViciousMissTs = -999_999
    const wardenDeathTs: number[] = []
    const lastKickTs = new Map<number, number>()
    const lastActivityTs = new Map<number, number>()

    const svBurstStart = new Map<number, number>()
    const svBurstEnd = new Map<number, number>()
    const svStacks = new Map<number, number>()
    const svWindowFail = new Map<number, Record<string, unknown> | null>()
    const lastBossTankTs = new Map<number, number>()
    const lastSpikeTs = new Map<number, number>()
    const cwBrokeShellKeys = new Set<string>()

    const computeReadiness = (pid: number, tsNow: number, dmgSchool: 'physical' | 'magic' | 'all' = 'all') => {
      const actLow = new Set(Array.from(activeAllDefs.get(pid) ?? []).map((n) => n.toLowerCase()))
      const usedMap = lastDefUsedTs.get(pid)
      const ready: string[] = []
      for (const [low, disp] of (playerKnownDefs.get(pid) ?? new Map()).entries()) {
        if (actLow.has(low)) continue
        if (!defensiveMitigates(disp, dmgSchool)) continue
        const usedAt = usedMap?.get(low)
        if (usedAt === undefined || tsNow - usedAt >= getDefensiveCooldownMs(low)) {
          ready.push(disp)
        }
      }
      ready.sort()
      const potAt = lastPotTs.get(pid)
      const potRdy = potAt === undefined || tsNow - potAt >= HEALTH_POTION_CD_MS
      const hsInfo = lastHsTs.get(pid)
      const hsRdy = hsInfo === undefined ? true : hsInfo.isDemonic && tsNow - hsInfo.ts >= DEMONIC_HEALTHSTONE_CD_MS
      return { ready, potRdy, hsRdy, anyRdy: ready.length > 0 || potRdy || hsRdy }
    }

    const computeKickReadiness = (candidates: Set<number>, tsNow: number) => {
      const rdy: { player: string; class: string; spell: string }[] = []
      const cd: { player: string; class: string; spell: string }[] = []
      const sortedPids = Array.from(candidates).sort((a, b) => (actors[a]?.name ?? '').localeCompare(actors[b]?.name ?? ''))
      for (const pid of sortedPids) {
        const kit = playerInterrupts.get(pid)
        if (!kit) continue
        const prevDeaths = (deathsByPlayer.get(pid) ?? []).filter((dt) => dt < tsNow)
        if (prevDeaths.length > 0) {
          const lastDt = Math.max(...prevDeaths)
          if ((lastActivityTs.get(pid) ?? -1) <= lastDt) continue
        }
        const [spell, cdMs] = kit
        const entry = { player: actors[pid].name, class: actors[pid].subType ?? '', spell }
        const usedAt = lastKickTs.get(pid)
        if (usedAt === undefined || tsNow - usedAt >= cdMs) rdy.push(entry)
        else cd.push(entry)
      }
      return { rdy, cd }
    }

    const finalizeSvFail = (tkId: number) => {
      const pending = svWindowFail.get(tkId)
      const bStart = svBurstStart.get(tkId)
      const bEnd = svBurstEnd.get(tkId)
      svBurstStart.delete(tkId)
      svBurstEnd.delete(tkId)
      if (!pending) return
      const winStart = bStart ?? (pending.timestamp as number)
      const winEnd = (bEnd ?? (pending.timestamp as number)) + 5000
      const matched = playerDeaths.find((d) => d.tid === tkId && d.ts >= winStart && d.ts <= winEnd)
      if (matched) {
        const kaid = matched.ev.killingAbilityGameID
        pending.lethal = true
        pending.death_rel_time = formatRelTime(matched.ts - fStart)
        pending.death_ability = kaid !== undefined ? abilities[kaid] ?? String(kaid) : 'Unbekannt'
      } else {
        pending.lethal = false
        pending.death_rel_time = null
        pending.death_ability = null
      }
      tankFails.push(pending)
      svWindowFail.set(tkId, null)
    }

    for (const ev of fevs) {
      const t = ev.type
      const aid = ev.abilityGameID
      const abName = aid !== undefined ? abilities[aid] ?? '' : ''
      const abLow = abName.trim().toLowerCase()
      const src = ev.sourceID
      const tid = ev.targetID
      const ts = ev.timestamp

      if (src !== undefined && actors[src]?.type === 'Player' && (t === 'damage' || t === 'cast' || t === 'interrupt' || t === 'heal')) {
        lastActivityTs.set(src, ts)
      }

      if (aid === SPELL_SPECTRAL_COILS_CAST && t === 'cast') coilsCasts.push(ts)
      else if (aid === SPELL_CAUSTIC_WAVES && t === 'damage' && !ev.tick && tid !== undefined && actors[tid]?.type === 'Player') {
        const list = cwHitsByP.get(tid) ?? []
        list.push(ev)
        cwHitsByP.set(tid, list)
      } else if (aid === SPELL_NOXIOUS_SPLASH && t === 'damage' && tid !== undefined && actors[tid]?.type === 'Player') {
        const list = splashByP.get(tid) ?? []
        list.push(ev)
        splashByP.set(tid, list)
      } else if (aid === SPELL_SOUL_CONSTRICTOR && t === 'applydebuff' && tid !== undefined) {
        const list = constrictorByP.get(tid) ?? []
        list.push(ts)
        constrictorByP.set(tid, list)
      } else if (aid === SPELL_PUTRID_MEMBRANE_DEBUFF && (t === 'applydebuff' || t === 'applydebuffstack') && tid !== undefined) {
        const list = putridByP.get(tid) ?? []
        list.push(ts)
        putridByP.set(tid, list)
      } else if (aid === SPELL_RANCID_YOLK && t === 'applydebuff' && tid !== undefined) {
        const list = rancidByP.get(tid) ?? []
        list.push(ts)
        rancidByP.set(tid, list)
      } else if (aid === SPELL_NOXIOUS_SHELL_DEBUFF && t === 'removedebuff') {
        shellRemoves.push(ev)
      }

      // Consumables
      if (t === 'cast') {
        const actorId = src !== undefined && actors[src]?.type === 'Player' ? src : tid
        if (actorId !== undefined && actors[actorId]?.type === 'Player') {
          if (isHealthPotion(aid, abName)) {
            potCounts.set(actorId, (potCounts.get(actorId) ?? 0) + 1)
            lastPotTs.set(actorId, ts)
          } else if (isHealthstone(aid, abName)) {
            hsCounts.set(actorId, (hsCounts.get(actorId) ?? 0) + 1)
            lastHsTs.set(actorId, {
              ts,
              isDemonic: aid === DEMONIC_HEALTHSTONE_ID || abLow.includes('demonic'),
            })
          }
        }
        if (src !== undefined && actors[src]?.type === 'Player' && isTrackablePersonalDef(abName)) {
          const m = lastDefUsedTs.get(src) ?? new Map<string, number>()
          m.set(abLow, ts)
          lastDefUsedTs.set(src, m)
        }
      }

      // Defensive buffs
      if (tid !== undefined && actors[tid]?.type === 'Player') {
        if (t === 'applybuff' || t === 'refreshbuff' || t === 'applybuffstack') {
          if (isDefensiveBuff(abName, false)) {
            const set = activeAllDefs.get(tid) ?? new Set<string>()
            if (!set.has(abName)) {
              defCdCasts.set(tid, (defCdCasts.get(tid) ?? 0) + 1)
              if (isTrackablePersonalDef(abName)) {
                const m = lastDefUsedTs.get(tid) ?? new Map<string, number>()
                m.set(abLow, ts)
                lastDefUsedTs.set(tid, m)
              }
            }
            set.add(abName)
            activeAllDefs.set(tid, set)
          }
          if (isDefensiveBuff(abName, true)) {
            const tset = activeTankDefs.get(tid) ?? new Set<string>()
            tset.add(abName)
            activeTankDefs.set(tid, tset)
          }
        } else if (t === 'removebuff') {
          activeAllDefs.get(tid)?.delete(abName)
          activeTankDefs.get(tid)?.delete(abName)
        }
      }

      // Heart / P2 / P3 events
      if (t === 'damage' && !ev.tick && tid !== undefined && actors[tid]?.type === 'Player') {
        if (aid === SPELL_FALLING_DEBRIS) {
          debrisHitsInFight.push({ pid: tid, ts })
          const relMs = ts - fStart
          const ovk = ev.overkill ?? 0
          phaseEvents.push({
            id: `${reportCode}-${fid}-${tid}-${ts}-debris`,
            kind: 'falling_debris',
            phase: 'heart',
            player: actors[tid].name,
            class: actors[tid].subType ?? '',
            target_id: tid,
            ability: abName || 'Falling Debris',
            detail: null,
            gap_ms: null,
            damage: ev.amount ?? 0,
            lethal: ovk > 0 || (deathsByPlayer.get(tid) ?? []).some((dt) => Math.abs(dt - ts) <= 50),
            pull_num: pullNum,
            fight_id: fid,
            is_kill: isKill,
            rel_time: formatRelTime(relMs),
            rel_ms: relMs,
            timestamp: ts,
            deaths_before: countDeathsBefore(ts),
            events_url: buildEventsUrl(reportCode, fid, tid, ts, fStart, fEnd),
            replay_url: buildReplayUrl(reportCode, fid, relMs),
          })
        } else if (aid !== undefined && P2_AVOIDABLE_IDS.has(aid)) {
          const relMs = ts - fStart
          const ovk = ev.overkill ?? 0
          phaseEvents.push({
            id: `${reportCode}-${fid}-${tid}-${ts}-p2av-${aid}`,
            kind: 'p2_avoidable',
            phase: 'p2',
            player: actors[tid].name,
            class: actors[tid].subType ?? '',
            target_id: tid,
            ability: abName || String(aid),
            detail: null,
            gap_ms: null,
            damage: ev.amount ?? 0,
            lethal: ovk > 0 || (deathsByPlayer.get(tid) ?? []).some((dt) => Math.abs(dt - ts) <= 50),
            pull_num: pullNum,
            fight_id: fid,
            is_kill: isKill,
            rel_time: formatRelTime(relMs),
            rel_ms: relMs,
            timestamp: ts,
            deaths_before: countDeathsBefore(ts),
            events_url: buildEventsUrl(reportCode, fid, tid, ts, fStart, fEnd),
            replay_url: buildReplayUrl(reportCode, fid, relMs),
          })
        } else if (P3_AVOIDABLE_SPELL_NAMES.some((s) => abLow.includes(s))) {
          const relMs = ts - fStart
          const ovk = ev.overkill ?? 0
          phaseEvents.push({
            id: `${reportCode}-${fid}-${tid}-${ts}-p3av-${aid ?? 0}`,
            kind: 'p3_avoidable',
            phase: 'p3',
            player: actors[tid].name,
            class: actors[tid].subType ?? '',
            target_id: tid,
            ability: abName || String(aid ?? ''),
            detail: null,
            gap_ms: null,
            damage: ev.amount ?? 0,
            lethal: ovk > 0 || (deathsByPlayer.get(tid) ?? []).some((dt) => Math.abs(dt - ts) <= 50),
            pull_num: pullNum,
            fight_id: fid,
            is_kill: isKill,
            rel_time: formatRelTime(relMs),
            rel_ms: relMs,
            timestamp: ts,
            deaths_before: countDeathsBefore(ts),
            events_url: buildEventsUrl(reportCode, fid, tid, ts, fStart, fEnd),
            replay_url: buildReplayUrl(reportCode, fid, relMs),
          })
        } else if (aid === SPELL_MALICE_DMG) {
          maliceDmgEvents.push({ ts, amt: ev.amount ?? 0 })
        }
      }

      if (t === 'removedebuff' && aid === SPELL_GRASPING_FANGS_DEBUFF && tid !== undefined && actors[tid]?.type === 'Player') {
        const diedNear = (deathsByPlayer.get(tid) ?? []).some((dt) => dt - ts >= -100 && dt - ts <= 150)
        if (!diedNear) fangBreaks.push({ ts, pid: tid })
      }

      if (t === 'interrupt' && src !== undefined && actors[src]?.type === 'Player') {
        lastKickTs.set(src, ts)
        const exAid = ev.extraAbilityGameID
        const exName = (exAid !== undefined ? abilities[exAid] ?? '' : '').trim()
        const exLow = exName.toLowerCase()
        if (exAid === SPELL_MALICE_CAST || exLow.includes('malice')) {
          const relMs = ts - fStart
          const tInst = ev.targetInstance ?? 1
          const sideLabel = instToSide.get(tInst) ?? `Warden #${tInst}`
          const sideTankCls = instToSideTankClass.get(tInst) ?? ''
          const others = new Set(Array.from(sidePlayers.get(tInst) ?? []).filter((p) => p !== src))
          const { rdy, cd } = computeKickReadiness(others, ts)
          phaseEvents.push({
            id: `${reportCode}-${fid}-${src}-${ts}-mkick`,
            kind: 'malice_kick',
            phase: 'p2',
            side: sideLabel,
            side_tank_class: sideTankCls,
            player: actors[src].name,
            class: actors[src].subType ?? '',
            target_id: src,
            ability: exName || 'Malice',
            detail: abName || 'Interrupt',
            ready_kickers: rdy,
            on_cd_kickers: cd,
            gap_ms: null,
            damage: 0,
            lethal: false,
            pull_num: pullNum,
            fight_id: fid,
            is_kill: isKill,
            rel_time: formatRelTime(relMs),
            rel_ms: relMs,
            timestamp: ts,
            deaths_before: countDeathsBefore(ts),
            events_url: buildEventsUrl(reportCode, fid, src, ts, fStart, fEnd),
            replay_url: buildReplayUrl(reportCode, fid, relMs),
          })
        } else if (P3_KICK_SPELL_NAMES.some((s) => exLow.includes(s))) {
          const relMs = ts - fStart
          const others = new Set(Array.from(fightPlayers).filter((p) => p !== src))
          const { rdy, cd } = computeKickReadiness(others, ts)
          phaseEvents.push({
            id: `${reportCode}-${fid}-${src}-${ts}-vkick`,
            kind: 'vicious_echoes_kick',
            phase: 'p3',
            side: 'Phase 3',
            side_tank_class: '',
            player: actors[src].name,
            class: actors[src].subType ?? '',
            target_id: src,
            ability: exName || 'Vicious Echoes',
            detail: abName || 'Interrupt',
            ready_kickers: rdy,
            on_cd_kickers: cd,
            gap_ms: null,
            damage: 0,
            lethal: false,
            pull_num: pullNum,
            fight_id: fid,
            is_kill: isKill,
            rel_time: formatRelTime(relMs),
            rel_ms: relMs,
            timestamp: ts,
            deaths_before: countDeathsBefore(ts),
            events_url: buildEventsUrl(reportCode, fid, src, ts, fStart, fEnd),
            replay_url: buildReplayUrl(reportCode, fid, relMs),
          })
        }
      }

      if (t === 'cast') {
        if (src !== undefined && actors[src]?.type === 'Player' && isInterruptSpell(abName)) {
          lastKickTs.set(src, ts)
        }
        if (aid === SPELL_MALICE_CAST) {
          const sInst = ev.sourceInstance ?? 1
          if (ts - (lastMaliceMissByInst.get(sInst) ?? -999_999) >= 2500) {
            lastMaliceMissByInst.set(sInst, ts)
            const sideLabel = instToSide.get(sInst) ?? `Warden #${sInst}`
            const sideTankCls = instToSideTankClass.get(sInst) ?? ''
            const { rdy, cd } = computeKickReadiness(sidePlayers.get(sInst) ?? new Set(), ts)
            maliceMissedCasts.push({ ts, inst: sInst, side: sideLabel, tankClass: sideTankCls, rdy, cd })
          }
        } else if (P3_KICK_SPELL_NAMES.some((s) => abLow.includes(s))) {
          if (ts - lastViciousMissTs >= 2500) {
            lastViciousMissTs = ts
            const { rdy, cd } = computeKickReadiness(fightPlayers, ts)
            viciousMissedCasts.push({ ts, rdy, cd })
          }
        }
      }

      if (t === 'death' && tid !== undefined && actors[tid]?.name === 'Doomscale Warden') {
        wardenDeathTs.push(ts)
      }

      // Boss tank tracking
      if (tid !== undefined && tankIdSet.has(tid)) {
        const srcName = src !== undefined ? actors[src]?.name ?? '' : ''
        if ((t === 'damage' && aid === SPELL_MELEE && srcName === "Ula'tek") || aid === SPELL_STONE_VENOM_DEBUFF || aid === SPELL_STONE_VENOM_DMG) {
          lastBossTankTs.set(tid, ts)
        }
      }

      // Stone Venom Boss-Cast burst window (Mother's Wrath + max 5s!)
      const isSvStack =
        tid !== undefined &&
        tankIdSet.has(tid) &&
        ((aid === SPELL_STONE_VENOM_DEBUFF && (t === 'applydebuff' || t === 'applydebuffstack')) ||
          (aid === SPELL_MOTHERS_WRATH_DMG && t === 'damage'))
      if (isSvStack && tid !== undefined) {
        const prevEnd = svBurstEnd.get(tid)
        if (prevEnd !== undefined && ts - prevEnd > 3000) finalizeSvFail(tid)
        if (!svBurstStart.has(tid)) {
          svBurstStart.set(tid, ts)
          svBurstEnd.set(tid, ts)
          svWindowFail.set(tid, null)
          if (aid === SPELL_STONE_VENOM_DEBUFF) svStacks.set(tid, ev.stack ?? 1)
        } else {
          svBurstEnd.set(tid, ts)
          if (aid === SPELL_STONE_VENOM_DEBUFF) {
            svStacks.set(tid, ev.stack ?? (t === 'applydebuffstack' ? (svStacks.get(tid) ?? 0) + 1 : svStacks.get(tid) ?? 1))
          }
        }
        const curFail = svWindowFail.get(tid)
        if (curFail && (svStacks.get(tid) ?? 1) > (curFail.stacks as number)) {
          curFail.stacks = svStacks.get(tid) ?? 1
        }
      } else if (tid !== undefined && tankIdSet.has(tid) && aid === SPELL_STONE_VENOM_DEBUFF && t === 'removedebuff') {
        svStacks.set(tid, 0)
      }

      if (tid !== undefined && tankIdSet.has(tid) && svBurstEnd.has(tid) && t === 'damage') {
        const bEnd = svBurstEnd.get(tid)!
        if (ts > bEnd + 5000) {
          finalizeSvFail(tid)
        } else if (ev.hitPoints !== undefined && ev.maxHitPoints && ev.maxHitPoints > 0) {
          const hpPct = Math.round((ev.hitPoints / ev.maxHitPoints) * 1000) / 10
          const dmgSchool = inferDamageSchool(aid, abilitySchools)
          const mitDefs = Array.from(activeTankDefs.get(tid) ?? []).filter((d) => defensiveMitigates(d, dmgSchool))
          if (hpPct < 30.0 && mitDefs.length === 0) {
            const relMs = ts - fStart
            const cur = svWindowFail.get(tid)
            if (!cur) {
              const otherTank = tankIds.find((ot) => ot !== tid)
              const { ready, potRdy, hsRdy, anyRdy } = computeReadiness(tid, ts, dmgSchool)
              svWindowFail.set(tid, {
                id: `${reportCode}-${fid}-${tid}-${ts}-sv`,
                kind: 'stone_venom_no_def',
                tank: actors[tid].name,
                tank_class: actors[tid].subType ?? '',
                tank_id: tid,
                victim: null,
                victim_class: null,
                other_tank: otherTank !== undefined ? actors[otherTank].name : null,
                tank_was_dead: false,
                min_hp_pct: hpPct,
                stacks: Math.max(1, svStacks.get(tid) ?? 1),
                lethal: false,
                death_rel_time: null,
                death_ability: null,
                ready_defs: ready,
                pot_ready: potRdy,
                hs_ready: hsRdy,
                any_ready: anyRdy,
                pull_num: pullNum,
                fight_id: fid,
                is_kill: isKill,
                rel_time: formatRelTime(relMs),
                rel_ms: relMs,
                timestamp: ts,
                deaths_before: countDeathsBefore(ts),
                events_url: buildEventsUrl(reportCode, fid, tid, ts, fStart, fEnd),
                replay_url: buildReplayUrl(reportCode, fid, relMs),
              })
            } else {
              if (hpPct < (cur.min_hp_pct as number)) cur.min_hp_pct = hpPct
              if ((svStacks.get(tid) ?? 1) > (cur.stacks as number)) cur.stacks = svStacks.get(tid) ?? 1
            }
          }
        }
      }

      // Tentacle Aggro fail: Gore Rattle Melee (1) killing non-tank
      if (t === 'death' && tid !== undefined && actors[tid]?.type === 'Player' && !tankIdSet.has(tid)) {
        const killerName = ev.killerID !== undefined ? actors[ev.killerID]?.name ?? '' : ''
        if (killerName === 'Gore Rattle' && ev.killingAbilityGameID === SPELL_MELEE) {
          let bossTankId: number | undefined
          let bestTs = -1
          for (const tk of tankIds) {
            const bts = lastBossTankTs.get(tk) ?? -1
            if (bts >= ts - 8000 && bts > bestTs) {
              bestTs = bts
              bossTankId = tk
            }
          }
          const failedTankId =
            bossTankId !== undefined && tankIds.length >= 2 ? tankIds.find((tk) => tk !== bossTankId) : tankIds[0]
          const otherTankId = bossTankId ?? tankIds[1]
          const tankWasDead =
            failedTankId !== undefined && (deathsByPlayer.get(failedTankId) ?? []).some((dt) => dt < ts)
          const relMs = ts - fStart
          tankFails.push({
            id: `${reportCode}-${fid}-${tid}-${ts}-ta`,
            kind: 'tentacle_aggro',
            tank: failedTankId !== undefined ? actors[failedTankId].name : 'Unbekannt',
            tank_class: failedTankId !== undefined ? actors[failedTankId].subType ?? '' : '',
            tank_id: failedTankId ?? 0,
            victim: actors[tid].name,
            victim_class: actors[tid].subType ?? '',
            other_tank: otherTankId !== undefined ? actors[otherTankId].name : null,
            tank_was_dead: tankWasDead,
            min_hp_pct: null,
            stacks: null,
            lethal: true,
            death_rel_time: formatRelTime(relMs),
            death_ability: 'Gore Rattle Melee',
            ready_defs: [],
            pot_ready: false,
            hs_ready: false,
            any_ready: false,
            pull_num: pullNum,
            fight_id: fid,
            is_kill: isKill,
            rel_time: formatRelTime(relMs),
            rel_ms: relMs,
            timestamp: ts,
            deaths_before: countDeathsBefore(ts),
            events_url: buildEventsUrl(reportCode, fid, tid, ts, fStart, fEnd),
            replay_url: buildReplayUrl(reportCode, fid, relMs),
          })
        }
      }

      // Defensive / Low-HP spike & death tracking
      if (tid !== undefined && actors[tid]?.type === 'Player') {
        if (t === 'damage' && aid !== undefined && RAID_SPIKE_ABILITY_IDS.has(aid) && !ev.tick) {
          if (ev.hitPoints !== undefined && ev.maxHitPoints && ev.maxHitPoints > 0) {
            const hpPct = Math.round((ev.hitPoints / ev.maxHitPoints) * 1000) / 10
            if (hpPct > 0 && hpPct < 35.0 && ts - (lastSpikeTs.get(tid) ?? -999_999) >= 4000) {
              lastSpikeTs.set(tid, ts)
              const relMs = ts - fStart
              const dmgSchool = inferDamageSchool(aid, abilitySchools)
              const defsNow = Array.from(activeAllDefs.get(tid) ?? [])
                .filter((d) => defensiveMitigates(d, dmgSchool))
                .sort()
              const { ready, potRdy, hsRdy, anyRdy } = computeReadiness(tid, ts, dmgSchool)
              defensiveEvents.push({
                id: `${reportCode}-${fid}-${tid}-${ts}-sp`,
                kind: 'low_hp_spike',
                player: actors[tid].name,
                class: actors[tid].subType ?? '',
                target_id: tid,
                pull_num: pullNum,
                fight_id: fid,
                is_kill: isKill,
                rel_time: formatRelTime(relMs),
                rel_ms: relMs,
                timestamp: ts,
                deaths_before: countDeathsBefore(ts),
                trigger_ability: abName || String(aid),
                hp_pct: hpPct,
                had_def_cd: defsNow.length > 0,
                active_defs: defsNow,
                ready_defs: ready,
                pot_ready: potRdy,
                hs_ready: hsRdy,
                any_ready: anyRdy,
                pot_used_in_pull: (potCounts.get(tid) ?? 0) > 0,
                hs_used_in_pull: (hsCounts.get(tid) ?? 0) > 0,
                events_url: buildEventsUrl(reportCode, fid, tid, ts, fStart, fEnd),
                replay_url: buildReplayUrl(reportCode, fid, relMs),
              })
            }
          }
        } else if (t === 'death') {
          const relMs = ts - fStart
          const kaid = ev.killingAbilityGameID
          const kabName = kaid !== undefined ? abilities[kaid] ?? String(kaid) : 'Unbekannt'
          const dmgSchool = inferDamageSchool(kaid, abilitySchools)
          const defsNow = Array.from(activeAllDefs.get(tid) ?? [])
            .filter((d) => defensiveMitigates(d, dmgSchool))
            .sort()
          const { ready, potRdy, hsRdy, anyRdy } = computeReadiness(tid, ts, dmgSchool)
          defensiveEvents.push({
            id: `${reportCode}-${fid}-${tid}-${ts}-dt`,
            kind: 'death',
            player: actors[tid].name,
            class: actors[tid].subType ?? '',
            target_id: tid,
            pull_num: pullNum,
            fight_id: fid,
            is_kill: isKill,
            rel_time: formatRelTime(relMs),
            rel_ms: relMs,
            timestamp: ts,
            deaths_before: countDeathsBefore(ts),
            trigger_ability: kabName,
            hp_pct: 0.0,
            had_def_cd: defsNow.length > 0,
            active_defs: defsNow,
            ready_defs: ready,
            pot_ready: potRdy,
            hs_ready: hsRdy,
            any_ready: anyRdy,
            pot_used_in_pull: (potCounts.get(tid) ?? 0) > 0,
            hs_used_in_pull: (hsCounts.get(tid) ?? 0) > 0,
            events_url: buildEventsUrl(reportCode, fid, tid, ts, fStart, fEnd),
            replay_url: buildReplayUrl(reportCode, fid, relMs),
          })
        }
      }
    }

    // Flush open Stone Venom windows
    for (const tk of Array.from(svWindowFail.keys())) finalizeSvFail(tk)

    // Blight Vein overlaps (<= 2500ms)
    fangBreaks.sort((a, b) => a.ts - b.ts)
    for (let i = 1; i < fangBreaks.length; i++) {
      const gap = fangBreaks[i].ts - fangBreaks[i - 1].ts
      if (gap >= 0 && gap <= 2500) {
        const cur = fangBreaks[i]
        const prev = fangBreaks[i - 1]
        const relMs = cur.ts - fStart
        phaseEvents.push({
          id: `${reportCode}-${fid}-${cur.pid}-${cur.ts}-bvo`,
          kind: 'blight_vein_overlap',
          phase: 'p2',
          player: actors[cur.pid].name,
          class: actors[cur.pid].subType ?? '',
          target_id: cur.pid,
          ability: 'Blight Vein Overlap',
          detail: actors[prev.pid].name,
          gap_ms: gap,
          damage: 0,
          lethal: false,
          pull_num: pullNum,
          fight_id: fid,
          is_kill: isKill,
          rel_time: formatRelTime(relMs),
          rel_ms: relMs,
          timestamp: cur.ts,
          deaths_before: countDeathsBefore(cur.ts),
          events_url: buildEventsUrl(reportCode, fid, cur.pid, cur.ts, fStart, fEnd),
          replay_url: buildReplayUrl(reportCode, fid, relMs),
        })
      }
    }

    // Missed Malice casts
    for (const mm of maliceMissedCasts) {
      const relMs = mm.ts - fStart
      const dmg = maliceDmgEvents.reduce((s, e) => s + (e.ts >= mm.ts && e.ts <= mm.ts + 5000 ? e.amt : 0), 0)
      phaseEvents.push({
        id: `${reportCode}-${fid}-${mm.ts}-${mm.inst}-mmiss`,
        kind: 'malice_missed',
        phase: 'p2',
        side: mm.side,
        side_tank_class: mm.tankClass,
        player: `${mm.side} (nicht gekickt)`,
        class: '',
        target_id: 0,
        ability: 'Malice',
        detail: 'Cast durchgekommen',
        ready_kickers: mm.rdy,
        on_cd_kickers: mm.cd,
        gap_ms: null,
        damage: dmg,
        lethal: false,
        pull_num: pullNum,
        fight_id: fid,
        is_kill: isKill,
        rel_time: formatRelTime(relMs),
        rel_ms: relMs,
        timestamp: mm.ts,
        deaths_before: countDeathsBefore(mm.ts),
        events_url: `https://www.warcraftlogs.com/reports/${reportCode}?fight=${fid}&type=damage-taken&ability=${SPELL_MALICE_DMG}&start=${Math.max(fStart, mm.ts - 2000)}&end=${Math.min(fEnd, mm.ts + 5000)}`,
        replay_url: buildReplayUrl(reportCode, fid, relMs),
      })
    }

    // Missed Vicious Echoes casts
    for (const vm of viciousMissedCasts) {
      const relMs = vm.ts - fStart
      phaseEvents.push({
        id: `${reportCode}-${fid}-${vm.ts}-vmiss`,
        kind: 'vicious_echoes_missed',
        phase: 'p3',
        side: 'Phase 3',
        side_tank_class: '',
        player: 'Raid (nicht gekickt)',
        class: '',
        target_id: 0,
        ability: 'Vicious Echoes',
        detail: 'Raid-Stun durchgekommen',
        ready_kickers: vm.rdy,
        on_cd_kickers: vm.cd,
        gap_ms: null,
        damage: 0,
        lethal: false,
        pull_num: pullNum,
        fight_id: fid,
        is_kill: isKill,
        rel_time: formatRelTime(relMs),
        rel_ms: relMs,
        timestamp: vm.ts,
        deaths_before: countDeathsBefore(vm.ts),
        events_url: `https://www.warcraftlogs.com/reports/${reportCode}?fight=${fid}&type=casts&hostility=1&start=${Math.max(fStart, vm.ts - 2000)}&end=${Math.min(fEnd, vm.ts + 5000)}`,
        replay_url: buildReplayUrl(reportCode, fid, relMs),
      })
    }

    // Heart Phase windows
    for (const hw of heartByFight.get(fid) ?? []) {
      const debrisCounts = new Map<number, number>()
      for (const dh of debrisHitsInFight) {
        if (dh.ts >= hw.start_time - 500 && dh.ts <= hw.end_time + 500) {
          debrisCounts.set(dh.pid, (debrisCounts.get(dh.pid) ?? 0) + 1)
        }
      }
      const pidSet = new Set<number>()
      for (const mapObj of [hw.heart_by_player, hw.boss_by_player, hw.total_by_player]) {
        for (const k of Object.keys(mapObj)) {
          const pid = Number(k)
          if (actors[pid]?.type === 'Player') pidSet.add(pid)
        }
      }
      for (const pid of debrisCounts.keys()) if (actors[pid]?.type === 'Player') pidSet.add(pid)
      const pRows = Array.from(pidSet)
        .map((pid) => {
          const hd = hw.heart_by_player[pid] ?? 0
          const bd = hw.boss_by_player[pid] ?? 0
          const eff = hd + bd
          const tot = Math.max(eff, hw.total_by_player[pid] ?? eff)
          const other = Math.max(0, tot - eff)
          const share = eff > 0 ? Math.round((hd / eff) * 1000) / 10 : 0
          return {
            player: actors[pid].name,
            class: actors[pid].subType ?? '',
            player_id: pid,
            heart_dmg: hd,
            heart_raw_dmg: Math.round(hd / 2),
            boss_dmg: bd,
            total_boss_dmg: eff,
            other_dmg: other,
            heart_share_pct: share,
            debris_hits: debrisCounts.get(pid) ?? 0,
          }
        })
        .sort((a, b) => b.total_boss_dmg - a.total_boss_dmg || a.player.localeCompare(b.player))
      const startRel = Math.max(0, hw.start_time - fStart)
      heartPhases.push({
        id: `${reportCode}-${fid}-hw-${hw.window_num}`,
        pull_num: pullNum,
        fight_id: fid,
        is_kill: isKill,
        window_num: hw.window_num,
        start_rel_time: formatRelTime(startRel),
        start_rel_ms: startRel,
        duration_ms: Math.max(0, hw.end_time - hw.start_time),
        deaths_before: countDeathsBefore(hw.start_time),
        total_heart_dmg: pRows.reduce((s, r) => s + r.heart_dmg, 0),
        total_boss_dmg: pRows.reduce((s, r) => s + r.boss_dmg, 0),
        total_effective_dmg: pRows.reduce((s, r) => s + r.total_boss_dmg, 0),
        total_other_dmg: pRows.reduce((s, r) => s + r.other_dmg, 0),
        debris_hits_total: pRows.reduce((s, r) => s + r.debris_hits, 0),
        players: pRows,
        events_url: buildDamageWindowUrl(reportCode, fid, hw.start_time, hw.end_time),
        replay_url: buildReplayUrl(reportCode, fid, startRel),
      })
    }

    // P2 Warden & P3 Boss summaries
    const transitions = fight.phaseTransitions ?? []
    const p2Trans = transitions.find((pt) => pt.id === 2)
    const p3Trans = transitions.find((pt) => pt.id === 3)
    const wMap = extraTables.warden_dmg_by_fight?.[fid] ?? {}
    if (p2Trans || Object.keys(wMap).length > 0 || wardenDeathTs.length > 0) {
      const p2Ts = p2Trans?.startTime ?? fStart
      const p2Rel = Math.max(0, p2Ts - fStart)
      wardenDeathTs.sort((a, b) => a - b)
      const wPlayers = Object.entries(wMap)
        .map(([k, dmg]) => ({ pid: Number(k), dmg }))
        .filter(({ pid, dmg }) => actors[pid]?.type === 'Player' && dmg > 0)
        .map(({ pid, dmg }) => ({ player: actors[pid].name, class: actors[pid].subType ?? '', player_id: pid, damage: dmg }))
        .sort((a, b) => b.damage - a.damage || a.player.localeCompare(b.player))
      wardenSummaries.push({
        pull_num: pullNum,
        fight_id: fid,
        is_kill: isKill,
        p2_start_rel_time: formatRelTime(p2Rel),
        deaths_at_p2_start: countDeathsBefore(p2Ts),
        warden_kills: wardenDeathTs.length,
        kill_sync_delta_ms: wardenDeathTs.length >= 2 ? wardenDeathTs[1] - wardenDeathTs[0] : null,
        total_warden_dmg: wPlayers.reduce((s, r) => s + r.damage, 0),
        players: wPlayers,
        events_url: buildDamageWindowUrl(reportCode, fid, p2Ts, fEnd),
        replay_url: buildReplayUrl(reportCode, fid, p2Rel),
      })
    }

    const p3Map = extraTables.p3_boss_dmg_by_fight?.[fid] ?? {}
    if (p3Trans || Object.keys(p3Map).length > 0) {
      const p3Ts = p3Trans?.startTime ?? fStart
      const p3Rel = Math.max(0, p3Ts - fStart)
      const p3Players = Object.entries(p3Map)
        .map(([k, dmg]) => ({ pid: Number(k), dmg }))
        .filter(({ pid, dmg }) => actors[pid]?.type === 'Player' && dmg > 0)
        .map(({ pid, dmg }) => ({ player: actors[pid].name, class: actors[pid].subType ?? '', player_id: pid, damage: dmg }))
        .sort((a, b) => b.damage - a.damage || a.player.localeCompare(b.player))
      p3Summaries.push({
        pull_num: pullNum,
        fight_id: fid,
        is_kill: isKill,
        p3_start_rel_time: formatRelTime(p3Rel),
        deaths_at_p3_start: countDeathsBefore(p3Ts),
        total_boss_dmg: p3Players.reduce((s, r) => s + r.damage, 0),
        players: p3Players,
        events_url: buildDamageWindowUrl(reportCode, fid, p3Ts, fEnd),
        replay_url: buildReplayUrl(reportCode, fid, p3Rel),
      })
    }

    // Noxious Shell removals -> Caustic Waves vs Egg Collision (2+ carriers <= 250ms) vs Single Bump
    const splashEntries: Record<string, unknown>[] = []
    for (const rem of shellRemoves) {
      const tid = rem.targetID
      if (tid === undefined || actors[tid]?.type !== 'Player') continue
      const rts = rem.timestamp
      const isCoils = coilsCasts.some((cc) => Math.abs(rts - cc) <= 5)
      const hasConstrictor = (constrictorByP.get(tid) ?? []).some((ct) => ct - rts >= 0 && ct - rts <= 50)
      const cwNear = (cwHitsByP.get(tid) ?? []).filter((e) => e.timestamp - rts >= -50 && e.timestamp - rts <= 50)
      const splashNear = (splashByP.get(tid) ?? []).filter((e) => e.timestamp - rts >= -50 && e.timestamp - rts <= 50)
      const deathNear = (deathsByPlayer.get(tid) ?? []).some((dt) => dt - rts >= -50 && dt - rts <= 150)
      const hasPutrid = (putridByP.get(tid) ?? []).some((pt) => pt - rts >= -50 && pt - rts <= 50)
      const hasRancid = (rancidByP.get(tid) ?? []).some((rt) => rt - rts >= -50 && rt - rts <= 50)

      if (isCoils || hasConstrictor) {
        removalSummary.spectral_coils++
      } else if (cwNear.length > 0) {
        removalSummary.caustic_waves++
        const firstCw = cwNear.reduce((a, b) => (a.timestamp <= b.timestamp ? a : b))
        const cts = firstCw.timestamp
        cwBrokeShellKeys.add(`${tid}:${cts}`)
        const relMs = cts - fStart
        const ovk = firstCw.overkill ?? 0
        eggFails.push({
          id: `${reportCode}-${fid}-${tid}-${cts}-cw`,
          kind: 'caustic_waves',
          player: actors[tid].name,
          class: actors[tid].subType ?? '',
          target_id: tid,
          pull_num: pullNum,
          fight_id: fid,
          is_kill: isKill,
          rel_time: formatRelTime(relMs),
          rel_ms: relMs,
          timestamp: cts,
          deaths_before: countDeathsBefore(cts),
          damage: firstCw.amount ?? 0,
          overkill: ovk,
          lethal: ovk > 0 || (deathsByPlayer.get(tid) ?? []).some((dt) => Math.abs(dt - cts) <= 50),
          gap_ms: cts - rts,
          has_putrid: hasPutrid,
          has_rancid: hasRancid,
          collision_partners: [],
          collision_gap_ms: null,
          events_url: buildEventsUrl(reportCode, fid, tid, cts, fStart, fEnd),
          replay_url: buildReplayUrl(reportCode, fid, relMs),
        })
      } else if (splashNear.length > 0) {
        const firstSp = splashNear.reduce((a, b) => (a.timestamp <= b.timestamp ? a : b))
        const sts = firstSp.timestamp
        const relMs = sts - fStart
        const ovk = firstSp.overkill ?? 0
        splashEntries.push({
          id: `${reportCode}-${fid}-${tid}-${sts}-ns`,
          kind: 'noxious_splash',
          player: actors[tid].name,
          class: actors[tid].subType ?? '',
          target_id: tid,
          pull_num: pullNum,
          fight_id: fid,
          is_kill: isKill,
          rel_time: formatRelTime(relMs),
          rel_ms: relMs,
          timestamp: sts,
          deaths_before: countDeathsBefore(sts),
          damage: firstSp.amount ?? 0,
          overkill: ovk,
          lethal: ovk > 0 || (deathsByPlayer.get(tid) ?? []).some((dt) => Math.abs(dt - sts) <= 50),
          gap_ms: sts - rts,
          has_putrid: hasPutrid,
          has_rancid: hasRancid,
          collision_partners: [],
          collision_gap_ms: null,
          events_url: buildEventsUrl(reportCode, fid, tid, sts, fStart, fEnd),
          replay_url: buildReplayUrl(reportCode, fid, relMs),
        })
      } else if (deathNear) {
        removalSummary.player_death++
      } else {
        removalSummary.other++
      }
    }

    splashEntries.sort((a, b) => (a.timestamp as number) - (b.timestamp as number))
    const usedSp = new Set<number>()
    for (let i = 0; i < splashEntries.length; i++) {
      if (usedSp.has(i)) continue
      const cluster = [splashEntries[i]]
      usedSp.add(i)
      for (let j = i + 1; j < splashEntries.length; j++) {
        if (usedSp.has(j)) continue
        if (Math.abs((splashEntries[j].timestamp as number) - (cluster[cluster.length - 1].timestamp as number)) <= 250) {
          cluster.push(splashEntries[j])
          usedSp.add(j)
        } else {
          break
        }
      }
      const distinct = new Set(cluster.map((c) => c.target_id as number))
      if (distinct.size >= 2) {
        for (const entry of cluster) {
          const others = cluster.filter((c) => c.target_id !== entry.target_id)
          entry.kind = 'egg_collision'
          entry.id = (entry.id as string).replace('-ns', '-ec')
          entry.collision_partners = Array.from(new Set(others.map((o) => o.player as string))).sort()
          entry.collision_gap_ms = Math.min(...others.map((o) => Math.abs((entry.timestamp as number) - (o.timestamp as number))))
          removalSummary.egg_collision++
          eggFails.push(entry)
        }
      } else {
        for (const entry of cluster) {
          removalSummary.noxious_splash++
          eggFails.push(entry)
        }
      }
    }

    // All direct Caustic Waves hits
    for (const [tid, hits] of cwHitsByP.entries()) {
      hits.forEach((cw, idxHit) => {
        const cts = cw.timestamp
        const relMs = cts - fStart
        const ovk = cw.overkill ?? 0
        waveFails.push({
          id: `${reportCode}-${fid}-${tid}-${cts}-wf-${idxHit}`,
          player: actors[tid].name,
          class: actors[tid].subType ?? '',
          target_id: tid,
          pull_num: pullNum,
          fight_id: fid,
          is_kill: isKill,
          rel_time: formatRelTime(relMs),
          rel_ms: relMs,
          timestamp: cts,
          deaths_before: countDeathsBefore(cts),
          damage: cw.amount ?? 0,
          overkill: ovk,
          lethal: ovk > 0 || (deathsByPlayer.get(tid) ?? []).some((dt) => Math.abs(dt - cts) <= 50),
          had_noxious_shell: cwBrokeShellKeys.has(`${tid}:${cts}`),
          events_url: buildEventsUrl(reportCode, fid, tid, cts, fStart, fEnd),
          replay_url: buildReplayUrl(reportCode, fid, relMs),
        })
      })
    }

    for (const pid of Array.from(fightPlayers).sort((a, b) => a - b)) {
      consumableUsage.push({
        pull_num: pullNum,
        fight_id: fid,
        player: actors[pid].name,
        class: actors[pid].subType ?? '',
        target_id: pid,
        used_health_pot: (potCounts.get(pid) ?? 0) > 0,
        health_pot_count: potCounts.get(pid) ?? 0,
        used_healthstone: (hsCounts.get(pid) ?? 0) > 0,
        healthstone_count: hsCounts.get(pid) ?? 0,
        def_cd_casts: defCdCasts.get(pid) ?? 0,
      })
    }

    pullsOut.push({
      pull_num: pullNum,
      fight_id: fid,
      is_kill: isKill,
      boss_percentage: Math.round(Number(fight.bossPercentage ?? fight.fightPercentage ?? 0) * 10) / 10,
      duration_ms: Math.max(0, fEnd - fStart),
      start_time: fStart,
      end_time: fEnd,
      deaths_total: playerDeaths.length,
      report_url: `https://www.warcraftlogs.com/reports/${reportCode}?fight=${fid}`,
    })
  })

  const startEpoch = Number(meta.startTime || 0)
  const dateIso =
    startEpoch > 0 ? new Date(startEpoch).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  const lastPullEndEpoch =
    startEpoch > 0 && pullsOut.length > 0
      ? startEpoch + Math.max(...pullsOut.map((p) => p.end_time as number))
      : startEpoch

  const killsCount = pullsOut.filter((p) => p.is_kill).length

  return {
    code: reportCode,
    title: meta.title || reportCode,
    label: null,
    date_iso: dateIso,
    start_time_epoch_ms: startEpoch,
    last_pull_end_epoch_ms: lastPullEndEpoch,
    encounter_id: encounterId,
    boss_name: sortedFights[0]?.name ?? "Ula'tek",
    difficulty,
    analyzed_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    pulls_total: pullsOut.length,
    wipes_count: pullsOut.length - killsCount,
    kills_count: killsCount,
    tanks: tankIds.map((tid) => ({ id: tid, name: actors[tid].name, class: actors[tid].subType ?? '' })),
    players: Array.from(playerPullsPresent.entries())
      .map(([pid, pulls_present]) => ({
        id: pid,
        name: actors[pid].name,
        class: actors[pid].subType ?? '',
        is_tank: tankIdSet.has(pid),
        pulls_present,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    removal_summary: removalSummary,
    pulls: pullsOut,
    egg_fails: eggFails.sort((a, b) => (a.pull_num as number) - (b.pull_num as number) || (a.timestamp as number) - (b.timestamp as number)),
    wave_fails: waveFails.sort((a, b) => (a.pull_num as number) - (b.pull_num as number) || (a.timestamp as number) - (b.timestamp as number)),
    tank_fails: tankFails.sort((a, b) => (a.pull_num as number) - (b.pull_num as number) || (a.timestamp as number) - (b.timestamp as number)),
    defensive_events: defensiveEvents.sort((a, b) => (a.pull_num as number) - (b.pull_num as number) || (a.timestamp as number) - (b.timestamp as number)),
    consumable_usage: consumableUsage,
    heart_phases: heartPhases.sort((a, b) => (a.pull_num as number) - (b.pull_num as number) || (a.window_num as number) - (b.window_num as number)),
    phase_events: phaseEvents.sort((a, b) => (a.pull_num as number) - (b.pull_num as number) || (a.timestamp as number) - (b.timestamp as number)),
    warden_summaries: wardenSummaries.sort((a, b) => (a.pull_num as number) - (b.pull_num as number)),
    p3_summaries: p3Summaries.sort((a, b) => (a.pull_num as number) - (b.pull_num as number)),
  }
}
