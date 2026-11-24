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
})
