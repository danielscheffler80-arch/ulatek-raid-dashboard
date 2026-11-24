/** WarcraftLogs v2 GraphQL client & live status fetcher for Cloudflare Pages Functions. */

import {
  analyzeReportEventsTS,
  evaluateLiveStatus,
  type ExtraTables,
  type WclActor,
  type WclEvent,
  type WclFight,
} from './analyzer'
import {
  MYTHIC_DIFFICULTY,
  NPC_DOOMSCALE_WARDEN_GAME_ID,
  NPC_ULATEK_GAME_ID,
  NPC_VENOMOUS_HEART_GAME_ID,
  P2_AVOIDABLE_IDS,
  P3_AVOIDABLE_SPELL_NAMES,
  P3_KICK_SPELL_NAMES,
  RAID_SPIKE_ABILITY_IDS,
  SPELL_BLIGHT_VEIN_DMG,
  SPELL_CAUSTIC_WAVES,
  SPELL_FALLING_DEBRIS,
  SPELL_GRASPING_FANGS_DEBUFF,
  SPELL_MALICE_CAST,
  SPELL_MALICE_DMG,
  SPELL_MEPHITIC_THRASH,
  SPELL_MOTHERS_WRATH_CAST,
  SPELL_MOTHERS_WRATH_DMG,
  SPELL_NECROTIC_VAPORS,
  SPELL_NOXIOUS_SHELL_DEBUFF,
  SPELL_NOXIOUS_SHELL_DMG,
  SPELL_NOXIOUS_SPLASH,
  SPELL_PUTRID_MEMBRANE_DEBUFF,
  SPELL_PUTRID_MEMBRANE_DMG,
  SPELL_RAGE_OF_THE_SHACKLED_BUFF,
  SPELL_RAGE_OF_THE_SHACKLED_DMG,
  SPELL_RANCID_YOLK,
  SPELL_RATTLER_SLAM,
  SPELL_SOUL_CONSTRICTOR,
  SPELL_SPECTRAL_COILS_CAST,
  SPELL_SPECTRAL_COILS_DMG,
  SPELL_STONE_VENOM_DEBUFF,
  SPELL_STONE_VENOM_DMG,
  SPELL_VENOMOUS_HEART_BUFF,
  ULATEK_ENCOUNTER_ID,
  isDefensiveBuff,
  isHealthPotion,
  isHealthstone,
  isInterruptSpell,
} from './spells'

export interface WclEnv {
  WCL_CLIENT_ID?: string
  WCL_CLIENT_SECRET?: string
}

export interface LiveStatusResponse {
  code: string
  title: string
  date_iso: string
  start_time_epoch_ms: number
  last_pull_end_epoch_ms: number
  pulls_total: number
  last_fight_id: number
  last_pull_num: number
  last_pull_boss_pct: number | null
  last_pull_is_kill: boolean
  is_today: boolean
  minutes_since_last_pull: number
  is_live: boolean
  cache_version: string
  checked_at: string
}

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token'
const GRAPHQL_URL = 'https://www.warcraftlogs.com/api/v2/client'

const CORE_MECHANIC_IDS: number[] = [
  SPELL_NOXIOUS_SHELL_DEBUFF,
  SPELL_NOXIOUS_SHELL_DMG,
  SPELL_CAUSTIC_WAVES,
  SPELL_NOXIOUS_SPLASH,
  SPELL_SPECTRAL_COILS_CAST,
  SPELL_SPECTRAL_COILS_DMG,
  SPELL_SOUL_CONSTRICTOR,
  SPELL_PUTRID_MEMBRANE_DEBUFF,
  SPELL_PUTRID_MEMBRANE_DMG,
  SPELL_RANCID_YOLK,
  SPELL_STONE_VENOM_DEBUFF,
  SPELL_STONE_VENOM_DMG,
  SPELL_MOTHERS_WRATH_CAST,
  SPELL_MOTHERS_WRATH_DMG,
  SPELL_MEPHITIC_THRASH,
  SPELL_RATTLER_SLAM,
  SPELL_NECROTIC_VAPORS,
  SPELL_VENOMOUS_HEART_BUFF,
  SPELL_RAGE_OF_THE_SHACKLED_BUFF,
  SPELL_RAGE_OF_THE_SHACKLED_DMG,
  SPELL_FALLING_DEBRIS,
  SPELL_GRASPING_FANGS_DEBUFF,
  SPELL_BLIGHT_VEIN_DMG,
  SPELL_MALICE_CAST,
  SPELL_MALICE_DMG,
  ...Array.from(P2_AVOIDABLE_IDS).sort((a, b) => a - b),
]

let cachedToken: { token: string; expiresAt: number } | null = null

export function validateReportCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  const match = trimmed.match(/reports\/([A-Za-z0-9]{10,24})/)
  const candidate = match ? match[1] : trimmed
  if (!/^[A-Za-z0-9]{10,24}$/.test(candidate)) return null
  return candidate
}

export function buildCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...buildCorsHeaders(),
      ...extraHeaders,
    },
  })
}

async function getAccessToken(env: WclEnv, forceRefresh = false): Promise<string> {
  const now = Date.now()
  if (!forceRefresh && cachedToken && now < cachedToken.expiresAt - 60_000) {
    return cachedToken.token
  }
  const clientId = env.WCL_CLIENT_ID?.trim()
  const clientSecret = env.WCL_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    throw new Error('WCL API-Zugangsdaten sind serverseitig nicht konfiguriert.')
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'UlatekRaidForensics/2.0',
    },
    body: body.toString(),
  })
  if (!resp.ok) {
    throw new Error(`WCL OAuth Fehler (HTTP ${resp.status})`)
  }
  const payload = (await resp.json()) as { access_token?: string; expires_in?: number }
  if (!payload.access_token) {
    throw new Error('WCL OAuth Antwort enthielt kein Access-Token.')
  }
  cachedToken = {
    token: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600) * 1000,
  }
  return cachedToken.token
}

async function gql<T = Record<string, unknown>>(env: WclEnv, query: string): Promise<T> {
  let token = await getAccessToken(env, false)
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'UlatekRaidForensics/2.0',
      },
      body: JSON.stringify({ query }),
    })
    if (resp.status === 401 && attempt === 0) {
      token = await getAccessToken(env, true)
      continue
    }
    if (!resp.ok) {
      throw new Error(`WCL GraphQL HTTP ${resp.status}`)
    }
    const result = (await resp.json()) as { data?: T; errors?: unknown[] }
    if (result.errors && result.errors.length > 0) {
      throw new Error(`WCL GraphQL Fehler: ${JSON.stringify(result.errors)}`)
    }
    if (!result.data) {
      throw new Error('Leere WCL GraphQL Antwort.')
    }
    return result.data
  }
  throw new Error('WCL Authentifizierung fehlgeschlagen.')
}

async function fetchEventsPaginated(
  env: WclEnv,
  code: string,
  startTime: number,
  endTime: number,
  fightIds: number[],
  dataType = 'All',
  filterExpression?: string,
  includeResources = false,
): Promise<WclEvent[]> {
  const events: WclEvent[] = []
  let nextTs: number | null = startTime
  const extraArgs = [`fightIDs: ${JSON.stringify(fightIds)}`, `dataType: ${dataType}`]
  if (includeResources) extraArgs.push('includeResources: true')
  if (filterExpression) extraArgs.push(`filterExpression: ${JSON.stringify(filterExpression)}`)

  let safetyPages = 0
  while (nextTs !== null && safetyPages < 40) {
    safetyPages++
    const args = [`startTime: ${nextTs}`, `endTime: ${endTime}`, 'limit: 10000', ...extraArgs]
    const q = `
      query {
        reportData {
          report(code: "${code}") {
            events(${args.join(', ')}) {
              data
              nextPageTimestamp
            }
          }
        }
      }
    `
    const data = await gql<{
      reportData?: { report?: { events?: { data?: WclEvent[]; nextPageTimestamp?: number | null } } }
    }>(env, q)
    const block = data.reportData?.report?.events
    if (!block) break
    if (Array.isArray(block.data)) {
      events.push(...block.data)
    }
    nextTs = block.nextPageTimestamp ?? null
  }
  return events
}

export async function fetchLiveStatus(
  env: WclEnv,
  code: string,
  encounterId = ULATEK_ENCOUNTER_ID,
  difficulty = MYTHIC_DIFFICULTY,
): Promise<LiveStatusResponse> {
  const q = `
    query {
      reportData {
        report(code: "${code}") {
          title
          startTime
          endTime
          fights(encounterID: ${encounterId}, difficulty: ${difficulty}) {
            id
            startTime
            endTime
            fightPercentage
            bossPercentage
            kill
          }
        }
      }
    }
  `
  const data = await gql<{
    reportData?: {
      report?: {
        title?: string
        startTime?: number
        endTime?: number
        fights?: WclFight[]
      } | null
    }
  }>(env, q)

  const report = data.reportData?.report
  if (!report) {
    throw new Error(`Report ${code} nicht gefunden oder privat.`)
  }

  const startEpoch = Number(report.startTime || 0)
  const fights = [...(report.fights ?? [])].sort((a, b) => Number(a.startTime) - Number(b.startTime))
  const lastFight = fights.length > 0 ? fights[fights.length - 1] : null
  const lastPullEndEpoch =
    startEpoch > 0 && lastFight
      ? startEpoch + Number(lastFight.endTime)
      : Number(report.endTime || startEpoch)

  const liveEval = evaluateLiveStatus(startEpoch, lastPullEndEpoch)
  const dateIso =
    startEpoch > 0 ? new Date(startEpoch).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)

  const lastFightId = lastFight ? Number(lastFight.id) : 0
  const lastEndRel = lastFight ? Number(lastFight.endTime) : 0
  const lastBossPct =
    lastFight != null
      ? Math.round(Number(lastFight.bossPercentage ?? lastFight.fightPercentage ?? 0) * 10) / 10
      : null

  return {
    code,
    title: report.title || code,
    date_iso: dateIso,
    start_time_epoch_ms: startEpoch,
    last_pull_end_epoch_ms: lastPullEndEpoch,
    pulls_total: fights.length,
    last_fight_id: lastFightId,
    last_pull_num: fights.length,
    last_pull_boss_pct: lastBossPct,
    last_pull_is_kill: Boolean(lastFight?.kill),
    is_today: liveEval.is_today,
    minutes_since_last_pull: liveEval.minutes_since_last_pull,
    is_live: liveEval.is_live,
    cache_version: `${fights.length}-${lastFightId}-${lastEndRel}`,
    checked_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  }
}

async function fetchPhaseDamageTables(
  env: WclEnv,
  code: string,
  fights: WclFight[],
  actors: Record<number, WclActor>,
  abilities: Record<number, string>,
  eventsByFight: Record<number, WclEvent[]>,
): Promise<ExtraTables> {
  const actorEntries = Object.entries(actors).map(([id, a]) => [Number(id), a] as const)
  const bossActorId =
    actorEntries.find(([, a]) => a.gameID === NPC_ULATEK_GAME_ID)?.[0] ??
    actorEntries.find(([, a]) => a.name === "Ula'tek" && a.subType === 'Boss')?.[0] ??
    null
  const heartActorId =
    actorEntries.find(([, a]) => a.gameID === NPC_VENOMOUS_HEART_GAME_ID)?.[0] ??
    actorEntries.find(([, a]) => a.name === 'Venomous Heart')?.[0] ??
    null
  const wardenActorId =
    actorEntries.find(([, a]) => a.gameID === NPC_DOOMSCALE_WARDEN_GAME_ID)?.[0] ??
    actorEntries.find(([, a]) => a.name === 'Doomscale Warden')?.[0] ??
    null

  const heartSpecs: [number, number, number, number][] = []
  const p2Specs: [number, number, number][] = []
  const p3Specs: [number, number, number][] = []

  const sortedFights = [...fights].sort((a, b) => Number(a.startTime) - Number(b.startTime))
  for (const fight of sortedFights) {
    const fid = Number(fight.id)
    const fEnd = Number(fight.endTime)
    const fevs = [...(eventsByFight[fid] ?? [])].sort((a, b) => Number(a.timestamp) - Number(b.timestamp))

    let winStart: number | null = null
    let winNum = 0
    for (const ev of fevs) {
      if (ev.abilityGameID === SPELL_VENOMOUS_HEART_BUFF) {
        if (ev.type === 'applybuff' && winStart === null) {
          winStart = Number(ev.timestamp)
        } else if (ev.type === 'removebuff' && winStart !== null) {
          winNum++
          heartSpecs.push([fid, winNum, winStart, Number(ev.timestamp)])
          winStart = null
        }
      }
    }
    if (winStart !== null) {
      winNum++
      heartSpecs.push([fid, winNum, winStart, Math.min(fEnd, winStart + 21_000)])
      winStart = null
    }

    if (winNum === 0) {
      for (const ev of fevs) {
        if (ev.abilityGameID === SPELL_RAGE_OF_THE_SHACKLED_BUFF) {
          if (ev.type === 'applybuff' && winStart === null) {
            winStart = Number(ev.timestamp)
          } else if (ev.type === 'removebuff' && winStart !== null) {
            winNum++
            heartSpecs.push([fid, winNum, winStart, Number(ev.timestamp)])
            winStart = null
          }
        }
      }
      if (winStart !== null) {
        winNum++
        heartSpecs.push([fid, winNum, winStart, Math.min(fEnd, winStart + 21_000)])
      }
    }

    const transitions = fight.phaseTransitions ?? []
    const p2 = transitions.find((pt) => Number(pt.id) === 2)
    const p3 = transitions.find((pt) => Number(pt.id) === 3)
    if (p2 && wardenActorId !== null) {
      p2Specs.push([fid, Number(p2.startTime), fEnd])
    }
    if (p3 && bossActorId !== null) {
      p3Specs.push([fid, Number(p3.startTime), fEnd])
    }
  }

  const aliases: string[] = []
  heartSpecs.forEach(([fid, , hs, he], idx) => {
    aliases.push(
      `ht_${idx}: table(fightIDs: [${fid}], startTime: ${hs}, endTime: ${he}, dataType: DamageDone, hostilityType: Friendlies)`,
    )
    if (heartActorId !== null) {
      aliases.push(
        `hh_${idx}: table(fightIDs: [${fid}], startTime: ${hs}, endTime: ${he}, dataType: DamageDone, hostilityType: Friendlies, targetID: ${heartActorId})`,
      )
      aliases.push(
        `hc_${idx}: events(fightIDs: [${fid}], startTime: ${Math.max(0, hs - 1000)}, endTime: ${he}, dataType: Casts, hostilityType: Friendlies, limit: 2000) { data }`,
      )
      aliases.push(
        `hd_${idx}: events(fightIDs: [${fid}], startTime: ${hs}, endTime: ${he}, dataType: DamageDone, hostilityType: Friendlies, targetID: ${heartActorId}, limit: 2000) { data }`,
      )
    }
    if (bossActorId !== null) {
      aliases.push(
        `hb_${idx}: table(fightIDs: [${fid}], startTime: ${hs}, endTime: ${he}, dataType: DamageDone, hostilityType: Friendlies, targetID: ${bossActorId})`,
      )
    }
  })
  p2Specs.forEach(([fid, ps, pe], idx) => {
    aliases.push(
      `w_${idx}: table(fightIDs: [${fid}], startTime: ${ps}, endTime: ${pe}, dataType: DamageDone, hostilityType: Friendlies, targetID: ${wardenActorId})`,
    )
  })
  p3Specs.forEach(([fid, ps, pe], idx) => {
    aliases.push(
      `p3_${idx}: table(fightIDs: [${fid}], startTime: ${ps}, endTime: ${pe}, dataType: DamageDone, hostilityType: Friendlies, targetID: ${bossActorId})`,
    )
  })

  const mergedTables: Record<string, { data?: unknown }> = {}
  const chunkPromises: Promise<Record<string, { data?: unknown }>>[] = []
  for (let i = 0; i < aliases.length; i += 24) {
    const chunkStr = aliases.slice(i, i + 24).join('\n')
    const q = `query { reportData { report(code: "${code}") { ${chunkStr} } } }`
    chunkPromises.push(
      gql<{ reportData?: { report?: Record<string, { data?: unknown }> } }>(env, q).then(
        (r) => r.reportData?.report ?? {},
      ),
    )
  }
  const chunkResults = await Promise.all(chunkPromises)
  for (const res of chunkResults) {
    Object.assign(mergedTables, res)
  }

  const entriesToMap = (tableObj?: { data?: unknown }) => {
    const out: Record<number, number> = {}
    const entries = ((tableObj?.data as { entries?: { id?: number; total?: number }[] } | undefined)?.entries ?? [])
    for (const e of entries) {
      const pid = e.id
      const tot = Number(e.total ?? 0)
      if (pid != null && tot > 0) {
        out[Number(pid)] = Math.round(tot)
      }
    }
    return out
  }

  const nonDmgBuffNames = new Set([
    'ebon might',
    'prescience',
    'fatebound coin (tails)',
    'fatebound coin (heads)',
    'trueshot',
    'empowering venom',
    'bloodlust',
    'heroism',
    'time warp',
    'power infusion',
    'windfury totem',
    'skyfury',
  ])

  const extractFirstHeartCasts = (
    evBlock: { data?: unknown } | undefined,
    dmgBlock: { data?: unknown } | undefined,
    hs: number,
  ): Record<number, { ts: number; ability_id: number; switch_type: 'direct' | 'aoe' }> => {
    if (heartActorId === null || !evBlock) return {}
    const dmgById = new Map<string, number[]>()
    const dmgByName = new Map<string, number[]>()
    const rawDmgList = Array.isArray(dmgBlock?.data) ? (dmgBlock!.data as WclEvent[]) : []
    for (const dev of rawDmgList) {
      if (dev.type !== 'damage' || dev.tick) continue
      const dsrc = dev.sourceID
      if (dsrc == null || actors[Number(dsrc)]?.type !== 'Player') continue
      const dpid = Number(dsrc)
      const daid = Number(dev.abilityGameID ?? 0)
      if (daid <= 1) continue
      const dts = Number(dev.timestamp ?? 0)
      const idKey = `${dpid}:${daid}`
      const idArr = dmgById.get(idKey)
      if (idArr) idArr.push(dts)
      else dmgById.set(idKey, [dts])
      const dabLow = (abilities[daid] ?? '').trim().toLowerCase()
      if (dabLow) {
        const nameKey = `${dpid}:${dabLow}`
        const nameArr = dmgByName.get(nameKey)
        if (nameArr) nameArr.push(dts)
        else dmgByName.set(nameKey, [dts])
      }
    }

    const rawList = Array.isArray(evBlock.data) ? (evBlock.data as WclEvent[]) : []
    const sortedEvs = [...rawList].sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0))
    const recentBegincast = new Map<string, number>()
    const firstByPlayer: Record<number, { ts: number; ability_id: number; switch_type: 'direct' | 'aoe' }> = {}
    for (const ev of sortedEvs) {
      const src = ev.sourceID
      if (src == null || actors[Number(src)]?.type !== 'Player') continue
      const pid = Number(src)
      const aid = Number(ev.abilityGameID ?? 0)
      if (aid <= 1) continue
      const ts = Number(ev.timestamp ?? 0)
      if (ev.type === 'begincast') {
        recentBegincast.set(`${pid}:${aid}`, ts)
        continue
      }
      if (ev.type !== 'cast' && ev.type !== 'empowerstart') continue

      const isDirect = ev.targetID === heartActorId
      let isAoeHit = false
      if (!isDirect && ts >= hs) {
        const abLow = (abilities[aid] ?? '').trim().toLowerCase()
        if (!nonDmgBuffNames.has(abLow)) {
          const hitTimes = dmgById.get(`${pid}:${aid}`) ?? (abLow ? dmgByName.get(`${pid}:${abLow}`) : undefined)
          if (hitTimes && hitTimes.some((hts) => hts - ts >= -50 && hts - ts <= 3500)) {
            isAoeHit = true
          }
        }
      }

      if (isDirect || isAoeHit) {
        const bcTs = recentBegincast.get(`${pid}:${aid}`)
        const startTs =
          bcTs !== undefined && ts - bcTs >= 0 && ts - bcTs <= 4000 && bcTs >= hs - 200
            ? Math.max(hs, bcTs)
            : Math.max(hs, ts)
        const swType: 'direct' | 'aoe' = isDirect ? 'direct' : 'aoe'
        const prev = firstByPlayer[pid]
        if (!prev || startTs < prev.ts) {
          firstByPlayer[pid] = { ts: startTs, ability_id: aid, switch_type: swType }
        }
      }
    }
    return firstByPlayer
  }

  const heartWindowsOut = heartSpecs.map(([fid, wn, hs, he], idx) => ({
    fight_id: fid,
    window_num: wn,
    start_time: hs,
    end_time: he,
    total_by_player: entriesToMap(mergedTables[`ht_${idx}`]),
    heart_by_player: entriesToMap(mergedTables[`hh_${idx}`]),
    boss_by_player: entriesToMap(mergedTables[`hb_${idx}`]),
    first_cast_by_player: extractFirstHeartCasts(mergedTables[`hc_${idx}`], mergedTables[`hd_${idx}`], hs),
  }))

  const wardenDmgByFight: Record<number, Record<number, number>> = {}
  p2Specs.forEach(([fid], idx) => {
    wardenDmgByFight[fid] = entriesToMap(mergedTables[`w_${idx}`])
  })

  const p3BossDmgByFight: Record<number, Record<number, number>> = {}
  p3Specs.forEach(([fid], idx) => {
    p3BossDmgByFight[fid] = entriesToMap(mergedTables[`p3_${idx}`])
  })

  return {
    heart_windows: heartWindowsOut,
    warden_dmg_by_fight: wardenDmgByFight,
    p3_boss_dmg_by_fight: p3BossDmgByFight,
  }
}

export async function fetchAndAnalyzeReport(
  env: WclEnv,
  code: string,
  encounterId = ULATEK_ENCOUNTER_ID,
  difficulty = MYTHIC_DIFFICULTY,
) {
  const metaQ = `
    query {
      reportData {
        report(code: "${code}") {
          title
          startTime
          endTime
          masterData {
            actors {
              id
              gameID
              name
              type
              subType
            }
            abilities {
              gameID
              name
              type
            }
          }
          fights(encounterID: ${encounterId}, difficulty: ${difficulty}) {
            id
            name
            startTime
            endTime
            fightPercentage
            bossPercentage
            kill
            friendlyPlayers
            phaseTransitions {
              id
              startTime
            }
          }
        }
      }
    }
  `

  const metaRes = await gql<{
    reportData?: {
      report?: {
        title?: string
        startTime?: number
        endTime?: number
        masterData?: {
          actors?: WclActor[]
          abilities?: { gameID: number; name?: string; type?: number | null }[]
        }
        fights?: WclFight[]
      } | null
    }
  }>(env, metaQ)

  const report = metaRes.reportData?.report
  if (!report) {
    throw new Error(`Report ${code} nicht gefunden oder privat.`)
  }

  const fights = report.fights ?? []
  if (fights.length === 0) {
    throw new Error(
      `Keine Ula'tek-Mythic-Pulls (Encounter ${encounterId}) im Report ${code} gefunden.`,
    )
  }

  const actors: Record<number, WclActor> = {}
  for (const a of report.masterData?.actors ?? []) {
    actors[Number(a.id)] = { ...a, id: Number(a.id) }
  }

  const abilities: Record<number, string> = {}
  const abilitySchools: Record<number, number> = {}
  for (const ab of report.masterData?.abilities ?? []) {
    const gid = Number(ab.gameID)
    abilities[gid] = ab.name ?? ''
    if (ab.type != null) abilitySchools[gid] = Number(ab.type)
  }

  const fightIds = fights.map((f) => Number(f.id))
  const minStart = Math.min(...fights.map((f) => Number(f.startTime)))
  const maxEnd = Math.max(...fights.map((f) => Number(f.endTime)))

  const defIds: number[] = []
  const consumableIds: number[] = []
  const p3DynamicIds: number[] = []
  const interruptIds: number[] = []

  for (const [gidStr, name] of Object.entries(abilities)) {
    const gid = Number(gidStr)
    if (isDefensiveBuff(name)) defIds.push(gid)
    if (isHealthPotion(gid, name) || isHealthstone(gid, name)) consumableIds.push(gid)
    const lower = name.toLowerCase()
    if (
      P3_KICK_SPELL_NAMES.some((s) => lower.includes(s)) ||
      P3_AVOIDABLE_SPELL_NAMES.some((s) => lower.includes(s))
    ) {
      p3DynamicIds.push(gid)
    }
    if (isInterruptSpell(name)) interruptIds.push(gid)
  }

  defIds.sort((a, b) => a - b)
  consumableIds.sort((a, b) => a - b)
  p3DynamicIds.sort((a, b) => a - b)
  interruptIds.sort((a, b) => a - b)

  const allCoreIds = Array.from(new Set([...CORE_MECHANIC_IDS, ...p3DynamicIds])).sort((a, b) => a - b)

  // Split HP-bearing damage events (includeResources: true) from non-HP mechanic events (includeResources: false)
  // so WCL returns full 10k-event pages without hitting Cloudflare's subrequest budget on 40+ pull logs.
  const hpDamageIdSet = new Set<number>([
    ...Array.from(RAID_SPIKE_ABILITY_IDS),
    SPELL_STONE_VENOM_DMG,
    SPELL_MOTHERS_WRATH_DMG,
  ])
  const hpDamageIds = Array.from(hpDamageIdSet).sort((a, b) => a - b)
  const nonHpDamageIds = allCoreIds.filter((id) => !hpDamageIdSet.has(id))

  const hpExpr = [
    `(type = "damage" and ability.id in (${hpDamageIds.join(', ')}))`,
    '(type = "damage" and ability.id = 1 and (source.name = "Ula\'tek" or source.name = "Gore Rattle"))',
  ].join(' or ')

  const nonHpParts = [
    `(type != "damage" and ability.id in (${allCoreIds.join(', ')}))`,
    'type = "interrupt"',
    '(type = "death" and target.name = "Doomscale Warden")',
  ]
  if (nonHpDamageIds.length > 0) {
    nonHpParts.push(`(type = "damage" and ability.id in (${nonHpDamageIds.join(', ')}))`)
  }
  if (consumableIds.length > 0) {
    nonHpParts.push(`(type = "cast" and ability.id in (${consumableIds.join(', ')}))`)
  }
  if (interruptIds.length > 0) {
    nonHpParts.push(`(type = "cast" and ability.id in (${interruptIds.join(', ')}))`)
  }
  const nonHpExpr = nonHpParts.join(' or ')

  const p2Fights = fights.filter((f) => (f.phaseTransitions ?? []).some((pt) => Number(pt.id) === 2))
  const p2FightIds = p2Fights.map((f) => Number(f.id))

  // Batch defensive chunks (up to 70 IDs per filterExpression to stay compact & fast)
  const defChunkPromises: Promise<WclEvent[]>[] = []
  for (let i = 0; i < defIds.length; i += 70) {
    const chunk = defIds.slice(i, i + 70).join(', ')
    const defExpr = `(type = "applybuff" or type = "removebuff" or type = "refreshbuff" or type = "applybuffstack") and ability.id in (${chunk})`
    defChunkPromises.push(
      fetchEventsPaginated(env, code, minStart, maxEnd, fightIds, 'All', defExpr, false),
    )
  }

  // Run independent event fetches concurrently
  const [deaths, hpCoreEvents, nonHpCoreEvents, wardenDmgEvents, ...defChunks] = await Promise.all([
    fetchEventsPaginated(env, code, minStart, maxEnd, fightIds, 'Deaths', undefined, false),
    fetchEventsPaginated(env, code, minStart, maxEnd, fightIds, 'DamageTaken', hpExpr, true),
    fetchEventsPaginated(env, code, minStart, maxEnd, fightIds, 'All', nonHpExpr, false),
    p2FightIds.length > 0
      ? fetchEventsPaginated(
          env,
          code,
          Math.min(...p2Fights.map((f) => Number(f.startTime))),
          Math.max(...p2Fights.map((f) => Number(f.endTime))),
          p2FightIds,
          'DamageDone',
          `type = "damage" and target.id = ${NPC_DOOMSCALE_WARDEN_GAME_ID}`,
          false,
        )
      : Promise.resolve<WclEvent[]>([]),
    ...defChunkPromises,
  ])

  const eventsByFight: Record<number, WclEvent[]> = {}
  const addEvent = (ev: WclEvent) => {
    const fid = ev.fight
    if (fid == null) return
    const key = Number(fid)
    if (!eventsByFight[key]) eventsByFight[key] = []
    eventsByFight[key].push(ev)
  }

  for (const ev of deaths) addEvent(ev)
  for (const ev of hpCoreEvents) addEvent(ev)
  for (const ev of nonHpCoreEvents) addEvent(ev)
  for (const ev of wardenDmgEvents) addEvent(ev)
  for (const chunk of defChunks) {
    for (const ev of chunk) addEvent(ev)
  }

  const extraTables = await fetchPhaseDamageTables(env, code, fights, actors, abilities, eventsByFight)
  extraTables.ability_schools = abilitySchools

  const meta = {
    title: report.title || code,
    startTime: Number(report.startTime || 0),
    endTime: Number(report.endTime || 0),
  }

  const analyzed = analyzeReportEventsTS(
    meta,
    fights,
    actors,
    abilities,
    eventsByFight,
    code,
    extraTables,
    encounterId,
    difficulty,
  )

  const liveEval = evaluateLiveStatus(
    Number(analyzed.start_time_epoch_ms ?? 0),
    Number(analyzed.last_pull_end_epoch_ms ?? 0),
  )

  return {
    report: analyzed,
    live_status: {
      code,
      title: analyzed.title,
      date_iso: analyzed.date_iso,
      start_time_epoch_ms: analyzed.start_time_epoch_ms,
      last_pull_end_epoch_ms: analyzed.last_pull_end_epoch_ms,
      pulls_total: analyzed.pulls_total,
      last_fight_id:
        analyzed.pulls.length > 0 ? Number(analyzed.pulls[analyzed.pulls.length - 1].fight_id) : 0,
      last_pull_num: analyzed.pulls_total,
      last_pull_boss_pct:
        analyzed.pulls.length > 0
          ? Number(analyzed.pulls[analyzed.pulls.length - 1].boss_percentage)
          : null,
      last_pull_is_kill:
        analyzed.pulls.length > 0 ? Boolean(analyzed.pulls[analyzed.pulls.length - 1].is_kill) : false,
      is_today: liveEval.is_today,
      minutes_since_last_pull: liveEval.minutes_since_last_pull,
      is_live: liveEval.is_live,
      cache_version:
        analyzed.pulls.length > 0
          ? `${analyzed.pulls_total}-${analyzed.pulls[analyzed.pulls.length - 1].fight_id}-${analyzed.pulls[analyzed.pulls.length - 1].end_time}`
          : '0-0-0',
      checked_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    },
  }
}
