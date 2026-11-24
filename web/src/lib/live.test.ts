import { describe, expect, it } from 'vitest'
import { analyzeReportEventsTS, evaluateLiveStatus } from '../../functions/_shared/analyzer'
import { extractReportCode, formatMinutesAgo } from './liveClient'

describe('liveClient helpers & live status detection (45 min + today check)', () => {
  it('extracts report codes cleanly from URLs and raw codes', () => {
    expect(extractReportCode('https://www.warcraftlogs.com/reports/qy9FnMvjwQ2R13c7?fight=12')).toBe(
      'qy9FnMvjwQ2R13c7',
    )
    expect(extractReportCode('qy9FnMvjwQ2R13c7')).toBe('qy9FnMvjwQ2R13c7')
    expect(extractReportCode('not a valid code!!')).toBeNull()
    expect(extractReportCode('')).toBeNull()
  })

  it('marks report live only if today AND last pull ended <= 45 min ago', () => {
    const now = Date.UTC(2026, 10, 24, 20, 0, 0) // 2026-11-24 20:00 UTC

    // Today & 12 minutes ago -> LIVE
    const live12 = evaluateLiveStatus(now - 90 * 60_000, now - 12 * 60_000, now)
    expect(live12.is_today).toBe(true)
    expect(live12.is_live).toBe(true)
    expect(live12.minutes_since_last_pull).toBe(12)

    // Today & 45 minutes ago (exact boundary) -> LIVE
    const live45 = evaluateLiveStatus(now - 90 * 60_000, now - 45 * 60_000, now)
    expect(live45.is_live).toBe(true)

    // Today & 46 minutes ago -> NOT LIVE (stop polling)
    const stale46 = evaluateLiveStatus(now - 120 * 60_000, now - 46 * 60_000, now)
    expect(stale46.is_today).toBe(true)
    expect(stale46.is_live).toBe(false)

    // Yesterday -> NOT LIVE
    const yesterday = evaluateLiveStatus(now - 26 * 3600_000, now - 24 * 3600_000, now)
    expect(yesterday.is_today).toBe(false)
    expect(yesterday.is_live).toBe(false)
  })

  it('formats minutes ago in German cleanly', () => {
    expect(formatMinutesAgo(0.3)).toBe('gerade eben')
    expect(formatMinutesAgo(14.4)).toBe('vor 14 Min.')
    expect(formatMinutesAgo(90)).toBe('vor 1 Std. 30 Min.')
  })

  it('detects 2-carrier egg collisions vs single clean bumps in TypeScript analyzer', () => {
    const actors = {
      1: { id: 1, name: 'Alpha', type: 'Player', subType: 'Mage' },
      2: { id: 2, name: 'Beta', type: 'Player', subType: 'Warlock' },
      3: { id: 3, name: 'Gamma', type: 'Player', subType: 'Hunter' },
      99: { id: 99, name: "Ula'tek", type: 'NPC', subType: 'Boss', gameID: 257758 },
    }
    const abilities = {
      1307612: 'Noxious Shell',
      1307635: 'Noxious Splash',
    }
    const fights = [
      {
        id: 1,
        name: "Ula'tek",
        startTime: 10_000,
        endTime: 130_000,
        bossPercentage: 55.2,
        kill: false,
        friendlyPlayers: [1, 2, 3],
      },
    ]
    const eventsByFight = {
      1: [
        // 2 carriers collide within 18ms -> egg_collision
        { timestamp: 50_000, type: 'damage', targetID: 1, abilityGameID: 1307635, amount: 300_000 },
        { timestamp: 50_002, type: 'removedebuff', targetID: 1, abilityGameID: 1307612 },
        { timestamp: 50_018, type: 'damage', targetID: 2, abilityGameID: 1307635, amount: 300_000 },
        { timestamp: 50_020, type: 'removedebuff', targetID: 2, abilityGameID: 1307612 },
        // Single carrier bump 20s later -> clean noxious_splash
        { timestamp: 70_000, type: 'damage', targetID: 3, abilityGameID: 1307635, amount: 300_000 },
        { timestamp: 70_001, type: 'removedebuff', targetID: 3, abilityGameID: 1307612 },
      ],
    }

    const res = analyzeReportEventsTS(
      { title: 'Live Test', startTime: 1795450000000 },
      fights,
      actors,
      abilities,
      eventsByFight,
      'TEST1234567890AB',
    )

    const collisions = res.egg_fails.filter((e) => e.kind === 'egg_collision')
    const singleSplashes = res.egg_fails.filter((e) => e.kind === 'noxious_splash')
    expect(collisions).toHaveLength(2)
    expect(singleSplashes).toHaveLength(1)
    expect(collisions.find((c) => c.player === 'Alpha')?.collision_partners).toEqual(['Beta'])
    expect(collisions.find((c) => c.player === 'Beta')?.collision_partners).toEqual(['Alpha'])
    expect(res.last_pull_end_epoch_ms).toBe(1795450000000 + 130_000)
  })

  it('computes egg carrier uptime, shell damage buckets, and alive vs dead missed pickups in TS analyzer', () => {
    const actors = {
      1: { id: 1, name: 'Alice', type: 'Player', subType: 'Mage' },
      2: { id: 2, name: 'Bob', type: 'Player', subType: 'Warlock' },
      10: { id: 10, name: 'Spectral Coil', type: 'NPC', subType: 'NPC' },
    }
    const abilities = {
      1307612: 'Noxious Shell',
      1307617: 'Noxious Shell',
      1299010: 'Spectral Coils',
    }
    const fights = [
      { id: 1, name: "Ula'tek", startTime: 0, endTime: 60_000, bossPercentage: 70, kill: false, friendlyPlayers: [1, 2] },
      { id: 2, name: "Ula'tek", startTime: 100_000, endTime: 170_000, bossPercentage: 60, kill: false, friendlyPlayers: [1, 2] },
      { id: 3, name: "Ula'tek", startTime: 200_000, endTime: 260_000, bossPercentage: 50, kill: false, friendlyPlayers: [1, 2] },
      { id: 4, name: "Ula'tek", startTime: 300_000, endTime: 360_000, bossPercentage: 45, kill: false, friendlyPlayers: [1, 2] },
    ]
    const eventsByFight = {
      1: [
        { timestamp: 20_000, type: 'applydebuff', targetID: 1, abilityGameID: 1307612 },
        { timestamp: 25_000, type: 'damage', targetID: 1, abilityGameID: 1307617, amount: 60_000 },
        { timestamp: 30_000, type: 'applydebuff', targetID: 2, abilityGameID: 1307612 },
        { timestamp: 35_000, type: 'damage', targetID: 1, abilityGameID: 1307617, amount: 90_000 },
        { timestamp: 40_000, type: 'cast', sourceID: 10, abilityGameID: 1299010 },
        { timestamp: 40_000, type: 'removedebuff', targetID: 1, abilityGameID: 1307612 },
        { timestamp: 40_000, type: 'removedebuff', targetID: 2, abilityGameID: 1307612 },
      ],
      2: [
        { timestamp: 125_000, type: 'applydebuff', targetID: 1, abilityGameID: 1307612 },
        { timestamp: 140_000, type: 'cast', sourceID: 10, abilityGameID: 1299010 },
        { timestamp: 150_000, type: 'damage', targetID: 1, abilityGameID: 1307617, amount: 200_000 },
        { timestamp: 155_000, type: 'removedebuff', targetID: 1, abilityGameID: 1307612 },
      ],
      3: [
        { timestamp: 210_000, type: 'death', targetID: 2, killerID: 10, killingAbilityGameID: 1 },
        { timestamp: 232_000, type: 'applydebuff', targetID: 1, abilityGameID: 1307612 },
        { timestamp: 240_000, type: 'cast', sourceID: 10, abilityGameID: 1299010 },
        { timestamp: 240_000, type: 'removedebuff', targetID: 1, abilityGameID: 1307612 },
      ],
      4: [
        { timestamp: 330_000, type: 'applydebuff', targetID: 1, abilityGameID: 1307612 },
        { timestamp: 331_000, type: 'applydebuff', targetID: 2, abilityGameID: 1307612 },
        { timestamp: 340_000, type: 'cast', sourceID: 10, abilityGameID: 1299010 },
        { timestamp: 340_000, type: 'removedebuff', targetID: 1, abilityGameID: 1307612 },
        { timestamp: 340_000, type: 'removedebuff', targetID: 2, abilityGameID: 1307612 },
      ],
    }

    const res = analyzeReportEventsTS(
      { title: 'Carrier Test', startTime: 1795450000000 },
      fights,
      actors,
      abilities,
      eventsByFight,
      'TESTCARRIER12345',
    )

    expect([...res.egg_regular_carriers].sort()).toEqual(['Alice', 'Bob'])
    const evs = res.egg_carrier_events as Array<Record<string, unknown>>
    const a1 = evs.find((e) => e.player === 'Alice' && e.pull_num === 1)!
    expect(a1.total_shell_dmg).toBe(150_000)
    expect((a1.pre_dmg_sec as number[])[15]).toBe(60_000)
    expect((a1.pre_dmg_sec as number[])[5]).toBe(90_000)
    expect(evs.find((e) => e.player === 'Alice' && e.pull_num === 2)?.status).toBe('missed_break')
    expect(evs.find((e) => e.player === 'Bob' && e.pull_num === 2)?.status).toBe('missed_alive')
    expect(evs.find((e) => e.player === 'Bob' && e.pull_num === 3)?.status).toBe('missed_dead')
  })

  it('deduplicates deaths, excludes avoidable deaths, and computes healer emergency + tank soak reactions in TS analyzer', () => {
    const actors = {
      1: { id: 1, name: 'HolyVal', type: 'Player', subType: 'Priest' },
      2: { id: 2, name: 'RestoYav', type: 'Player', subType: 'Druid' },
      10: { id: 10, name: 'VictimA', type: 'Player', subType: 'Hunter' },
      25: { id: 25, name: 'BossTank', type: 'Player', subType: 'DeathKnight' },
      152: { id: 152, name: "Ula'tek", type: 'NPC', subType: 'Boss' },
    }
    const abilities = {
      1292403: 'Caustic Waves',
      1308275: 'Putrid Membrane',
      1298417: 'Stone Venom',
      1298369: "Mother's Wrath",
      2050: 'Holy Word: Serenity',
      8936: 'Regrowth',
      47788: 'Guardian Spirit',
    }
    const fights = [
      {
        id: 80,
        name: "Ula'tek",
        startTime: 100_000,
        endTime: 220_000,
        bossPercentage: 45,
        kill: false,
        friendlyPlayers: [1, 2, 10, 25],
      },
    ]
    const events = [
      // Duplicate avoidable Caustic Waves death -> excluded from defensive_events!
      { timestamp: 115_000, type: 'death', targetID: 10, killerID: 152, killingAbilityGameID: 1292403 },
      { timestamp: 115_000, type: 'death', targetID: 10, killerID: 152, killingAbilityGameID: 1292403 },
      // Isolated <35% drop on VictimA at 110s
      { timestamp: 110_000, type: 'damage', sourceID: 152, targetID: 10, abilityGameID: 1292403, amount: 500_000, hitPoints: 200_000, maxHitPoints: 1_000_000 },
      // Boss tank soak at 130s
      { timestamp: 130_000, type: 'applydebuff', sourceID: 152, targetID: 25, abilityGameID: 1298417, stack: 1 },
      { timestamp: 130_500, type: 'damage', sourceID: 152, targetID: 25, abilityGameID: 1298369, amount: 800_000, hitPoints: 250_000, maxHitPoints: 1_000_000 },
    ]
    const healerCasts = [
      { timestamp: 110_700, type: 'cast', sourceID: 1, targetID: 10, abilityGameID: 2050 },
      { timestamp: 111_200, type: 'begincast', sourceID: 2, targetID: -1, abilityGameID: 8936 },
      { timestamp: 112_400, type: 'cast', sourceID: 2, targetID: 10, abilityGameID: 8936 },
      { timestamp: 130_400, type: 'cast', sourceID: 1, targetID: 25, abilityGameID: 47788 },
    ]

    const res = analyzeReportEventsTS(
      { title: 'Healer TS Test', startTime: 1795450000000 },
      fights,
      actors,
      abilities,
      { 80: events },
      'TESTHEALTS123456',
      {
        healers_by_fight: { 80: { 1: 'Holy', 2: 'Restoration' } },
        low_hp_damage_by_fight: { 80: [events[2], events[4]] },
        healer_casts_by_fight: { 80: healerCasts },
      },
    )

    // Avoidable Caustic Waves death excluded
    expect(res.defensive_events.filter((e) => e.kind === 'death')).toHaveLength(0)

    // Emergency heal event
    const emerg = res.healer_emergency_events as Array<Record<string, unknown>>
    expect(emerg).toHaveLength(1)
    expect(emerg[0].victim).toBe('VictimA')
    expect(emerg[0].fastest_reaction_ms).toBe(700)
    expect(emerg[0].time_to_death_ms).toBe(5000)

    // Separate Boss Tank Soak event
    const soaks = res.healer_tank_soak_events as Array<Record<string, unknown>>
    expect(soaks).toHaveLength(1)
    expect(soaks[0].tank).toBe('BossTank')
    expect(soaks[0].any_healed).toBe(true)
  })

  it('tracks alternating Shattering (P2 groups) and P1 Soul Constrictor group soaks in TS analyzer', () => {
    const actors = {
      1: { id: 1, name: 'Betøng', type: 'Player', subType: 'Monk' },
      2: { id: 2, name: 'Barrumir', type: 'Player', subType: 'DeathKnight' },
      3: { id: 3, name: 'Alveria', type: 'Player', subType: 'Rogue' },
      4: { id: 4, name: 'Valysa', type: 'Player', subType: 'Priest' },
      5: { id: 5, name: 'Narande', type: 'Player', subType: 'Warlock' },
      6: { id: 6, name: 'Kaida', type: 'Player', subType: 'Mage' },
      7: { id: 7, name: 'DeadGuy', type: 'Player', subType: 'Hunter' },
      152: { id: 152, name: "Ula'tek", type: 'NPC', subType: 'Boss' },
      200: { id: 200, name: 'Doomscale Warden', type: 'NPC', subType: 'NPC' },
    }
    const abilities = { 1: 'Melee', 1300685: 'Soul Constrictor', 1298417: 'Stone Venom', 1308275: 'Putrid Membrane' }
    const fights = [
      {
        id: 90,
        name: "Ula'tek",
        startTime: 100_000,
        endTime: 400_000,
        bossPercentage: 35,
        kill: false,
        friendlyPlayers: [1, 2, 3, 4, 5, 6, 7],
        phaseTransitions: [
          { id: 1, startTime: 100_000 },
          { id: 2, startTime: 270_000 },
          { id: 3, startTime: 330_000 },
        ],
      },
    ]
    const events = [
      { timestamp: 110_000, type: 'damage', sourceID: 152, targetID: 1, abilityGameID: 1, amount: 200_000 },
      { timestamp: 112_000, type: 'applydebuff', sourceID: 152, targetID: 2, abilityGameID: 1298417 },
      { timestamp: 280_000, type: 'damage', sourceID: 1, targetID: 200, targetInstance: 1, abilityGameID: 1, amount: 500_000 },
      { timestamp: 280_100, type: 'damage', sourceID: 3, targetID: 200, targetInstance: 1, abilityGameID: 1, amount: 900_000 },
      { timestamp: 280_000, type: 'damage', sourceID: 2, targetID: 200, targetInstance: 2, abilityGameID: 1, amount: 500_000 },
      { timestamp: 280_100, type: 'damage', sourceID: 5, targetID: 200, targetInstance: 2, abilityGameID: 1, amount: 900_000 },
      { timestamp: 280_200, type: 'damage', sourceID: 6, targetID: 200, targetInstance: 2, abilityGameID: 1, amount: 900_000 },
      { timestamp: 280_300, type: 'damage', sourceID: 7, targetID: 200, targetInstance: 2, abilityGameID: 1, amount: 900_000 },
      { timestamp: 320_000, type: 'death', targetID: 7, killerID: 152, killingAbilityGameID: 1308275 },
      // Shattering Soak #1: Gruppe Betøng
      { timestamp: 340_000, type: 'applydebuff', targetID: 1, abilityGameID: 1300685 },
      { timestamp: 340_050, type: 'applydebuff', targetID: 3, abilityGameID: 1300685 },
      { timestamp: 340_100, type: 'applydebuff', targetID: 4, abilityGameID: 1300685 },
      // Shattering Soak #2: Expected Gruppe Barrumir (Kaida missed alive, DeadGuy dead, Alveria wrong+double)
      { timestamp: 345_000, type: 'applydebuff', targetID: 2, abilityGameID: 1300685 },
      { timestamp: 345_050, type: 'applydebuff', targetID: 5, abilityGameID: 1300685 },
      { timestamp: 345_100, type: 'applydebuff', targetID: 3, abilityGameID: 1300685 },
    ]
    const res = analyzeReportEventsTS(
      { title: 'Group Soak TS', startTime: 1795450000000 },
      fights,
      actors,
      abilities,
      { 90: events },
      'TESTSOAKTS123456',
    )
    const shat = (res.group_soaks as Array<Record<string, unknown>>).filter((s) => s.phase === 'shattering')
    expect(shat).toHaveLength(2)
    expect(shat[0].expected_group).toBe('Gruppe Betøng')
    expect(shat[0].alternation_ok).toBe(true)
    expect(shat[1].expected_group).toBe('Gruppe Barrumir')
    expect((shat[1].missed_alive as Array<{ player: string }>).map((p) => p.player)).toEqual(['Kaida'])
    expect((shat[1].dead_expected as Array<{ player: string }>).map((p) => p.player)).toEqual(['DeadGuy'])
    expect((shat[1].wrong_group as Array<{ player: string; double_soak?: boolean }>)[0]).toMatchObject({
      player: 'Alveria',
      double_soak: true,
    })
  })

  it('exempts active P1 Boss-Tank in TS analyzer even when off-tank has Stone Venom DoT ticks and boss tank dodged prior melees', () => {
    const actors = {
      1: { id: 1, name: 'Betøng', type: 'Player', subType: 'Monk' },
      2: { id: 2, name: 'Barrumir', type: 'Player', subType: 'DeathKnight' },
      3: { id: 3, name: 'Alveria', type: 'Player', subType: 'Rogue' },
      4: { id: 4, name: 'Narande', type: 'Player', subType: 'Warlock' },
      152: { id: 152, name: "Ula'tek", type: 'NPC', subType: 'Boss' },
    }
    const abilities = { 1: 'Melee', 1300685: 'Soul Constrictor', 1298417: 'Stone Venom', 1298418: 'Stone Venom' }
    const fights = [
      {
        id: 91,
        name: "Ula'tek",
        startTime: 100_000,
        endTime: 260_000,
        bossPercentage: 70,
        kill: false,
        friendlyPlayers: [1, 2, 3, 4],
        phaseTransitions: [{ id: 1, startTime: 100_000 }],
      },
    ]
    const events = [
      { timestamp: 110_000, type: 'damage', sourceID: 152, targetID: 1, abilityGameID: 1, amount: 200_000 },
      { timestamp: 112_000, type: 'applydebuff', sourceID: 152, targetID: 2, abilityGameID: 1298417 },
      { timestamp: 138_000, type: 'damage', sourceID: 152, targetID: 2, abilityGameID: 1, amount: 200_000 },
      { timestamp: 140_000, type: 'applydebuff', targetID: 1, abilityGameID: 1300685 },
      { timestamp: 140_050, type: 'applydebuff', targetID: 3, abilityGameID: 1300685 },
      { timestamp: 143_000, type: 'applydebuff', targetID: 4, abilityGameID: 1300685 },
      { timestamp: 143_050, type: 'applydebuff', targetID: 2, abilityGameID: 1300685 },
      { timestamp: 233_930, type: 'damage', sourceID: 152, targetID: 2, abilityGameID: 1298418, amount: 130_000 },
      { timestamp: 234_000, type: 'applydebuff', targetID: 3, abilityGameID: 1300685 },
      { timestamp: 234_050, type: 'applydebuff', targetID: 2, abilityGameID: 1300685 },
      { timestamp: 235_092, type: 'damage', sourceID: 152, targetID: 1, abilityGameID: 1, amount: 300_000 },
    ]
    const res = analyzeReportEventsTS(
      { title: 'Boss Tank Exempt TS', startTime: 1795450000000 },
      fights,
      actors,
      abilities,
      { 91: events },
      'TESTBTTSEX123456',
    )
    const p1 = (res.group_soaks as Array<Record<string, unknown>>).filter((s) => s.phase === 'p1')
    expect(p1).toHaveLength(3)
    const s3 = p1[2]
    expect((s3.missed_alive as Array<{ player: string }>).map((p) => p.player)).not.toContain('Betøng')
    expect(s3.boss_tank_exempt).toMatchObject({ player: 'Betøng' })
  })
})
