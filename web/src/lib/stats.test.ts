import { describe, expect, it } from 'vitest'
import type { ReportData } from '../types'
import {
  aggregateDefensives,
  aggregateEggFails,
  aggregateHeartPhases,
  aggregatePhaseAnalysis,
  aggregateTankFails,
  aggregateWaveFails,
  computePhaseBuckets,
  filterByMaxDeaths,
} from './stats'

const mockReport: ReportData = {
  code: 'qy9FnMvjwQ2R13c7',
  title: 'Test Raid',
  label: 'Mittwoch',
  date_iso: '2026-11-23',
  start_time_epoch_ms: 1795450000000,
  encounter_id: 3492,
  boss_name: "Ula'tek",
  difficulty: 5,
  analyzed_at: '2026-11-23T23:00:00Z',
  pulls_total: 2,
  wipes_count: 2,
  kills_count: 0,
  tanks: [
    { id: 1, name: 'Betøng', class: 'Monk' },
    { id: 2, name: 'Barrumir', class: 'DeathKnight' },
  ],
  players: [
    { id: 1, name: 'Betøng', class: 'Monk', is_tank: true, pulls_present: 2 },
    { id: 2, name: 'Barrumir', class: 'DeathKnight', is_tank: true, pulls_present: 2 },
    { id: 3, name: 'Narande', class: 'Warlock', is_tank: false, pulls_present: 2 },
  ],
  removal_summary: { spectral_coils: 10, caustic_waves: 2, noxious_splash: 1, player_death: 0, other: 0 },
  pulls: [
    { pull_num: 1, fight_id: 10, is_kill: false, boss_percentage: 40, duration_ms: 140000, start_time: 1000, end_time: 141000, deaths_total: 5, report_url: 'https://wcl/1' },
    { pull_num: 2, fight_id: 11, is_kill: false, boss_percentage: 25, duration_ms: 160000, start_time: 200000, end_time: 360000, deaths_total: 2, report_url: 'https://wcl/2' },
  ],
  egg_fails: [
    {
      id: 'e1', kind: 'caustic_waves', player: 'Narande', class: 'Warlock', target_id: 3, pull_num: 1, fight_id: 10, is_kill: false,
      rel_time: '01:58.000', rel_ms: 118000, timestamp: 119000, deaths_before: 1, damage: 450000, overkill: 0, lethal: false, gap_ms: 1, has_putrid: true, has_rancid: true,
      events_url: 'https://wcl/e1', replay_url: 'https://wcl/r1',
    },
    {
      id: 'e2', kind: 'caustic_waves', player: 'Narande', class: 'Warlock', target_id: 3, pull_num: 1, fight_id: 10, is_kill: false,
      rel_time: '02:05.000', rel_ms: 125000, timestamp: 126000, deaths_before: 4, damage: 480000, overkill: 10000, lethal: true, gap_ms: 2, has_putrid: true, has_rancid: true,
      events_url: 'https://wcl/e2', replay_url: 'https://wcl/r2',
    },
    {
      id: 'e3', kind: 'noxious_splash', player: 'Narande', class: 'Warlock', target_id: 3, pull_num: 2, fight_id: 11, is_kill: false,
      rel_time: '00:40.000', rel_ms: 40000, timestamp: 240000, deaths_before: 0, damage: 300000, overkill: 0, lethal: false, gap_ms: 1, has_putrid: true, has_rancid: true,
      events_url: 'https://wcl/e3', replay_url: 'https://wcl/r3',
    },
  ],
  wave_fails: [
    {
      id: 'w1', player: 'Narande', class: 'Warlock', target_id: 3, pull_num: 1, fight_id: 10, is_kill: false,
      rel_time: '01:58.000', rel_ms: 118000, timestamp: 119000, deaths_before: 1, damage: 450000, overkill: 0, lethal: false, had_noxious_shell: true,
      events_url: 'https://wcl/w1', replay_url: 'https://wcl/rw1',
    },
    {
      id: 'w2', player: 'Betøng', class: 'Monk', target_id: 1, pull_num: 2, fight_id: 11, is_kill: false,
      rel_time: '02:30.000', rel_ms: 150000, timestamp: 350000, deaths_before: 5, damage: 320000, overkill: 0, lethal: false, had_noxious_shell: false,
      events_url: 'https://wcl/w2', replay_url: 'https://wcl/rw2',
    },
  ],
  tank_fails: [
    {
      id: 't1', kind: 'tentacle_aggro', tank: 'Barrumir', tank_class: 'DeathKnight', tank_id: 2, victim: 'Narande', victim_class: 'Warlock',
      other_tank: 'Betøng', tank_was_dead: false, min_hp_pct: null, stacks: null, lethal: true, death_rel_time: '01:33.000', death_ability: 'Gore Rattle Melee', pull_num: 1, fight_id: 10, is_kill: false,
      rel_time: '01:33.000', rel_ms: 93000, timestamp: 94000, deaths_before: 0, events_url: 'https://wcl/t1', replay_url: 'https://wcl/rt1',
    },
    {
      id: 't2', kind: 'stone_venom_no_def', tank: 'Betøng', tank_class: 'Monk', tank_id: 1, victim: null, victim_class: null,
      other_tank: 'Barrumir', tank_was_dead: false, min_hp_pct: 21.5, stacks: 5, lethal: true, death_rel_time: '01:14.200', death_ability: 'Stone Venom', pull_num: 2, fight_id: 11, is_kill: false,
      rel_time: '01:12.000', rel_ms: 72000, timestamp: 272000, deaths_before: 3, events_url: 'https://wcl/t2', replay_url: 'https://wcl/rt2',
    },
  ],
  defensive_events: [
    {
      id: 'd1', kind: 'low_hp_spike', player: 'Narande', class: 'Warlock', target_id: 3, pull_num: 1, fight_id: 10, is_kill: false,
      rel_time: '00:50.000', rel_ms: 50000, timestamp: 51000, deaths_before: 0, trigger_ability: 'Mephitic Thrash', hp_pct: 24.0,
      had_def_cd: true, active_defs: ['Unending Resolve'], pot_used_in_pull: true, hs_used_in_pull: false,
      events_url: 'https://wcl/d1', replay_url: 'https://wcl/rd1',
    },
    {
      id: 'd2', kind: 'death', player: 'Narande', class: 'Warlock', target_id: 3, pull_num: 2, fight_id: 11, is_kill: false,
      rel_time: '02:05.000', rel_ms: 125000, timestamp: 325000, deaths_before: 4, trigger_ability: 'Caustic Waves', hp_pct: 0,
      had_def_cd: false, active_defs: [], pot_used_in_pull: false, hs_used_in_pull: false,
      events_url: 'https://wcl/d2', replay_url: 'https://wcl/rd2',
    },
  ],
  consumable_usage: [
    { pull_num: 1, fight_id: 10, player: 'Narande', class: 'Warlock', target_id: 3, used_health_pot: true, health_pot_count: 1, used_healthstone: false, healthstone_count: 0, def_cd_casts: 2 },
    { pull_num: 2, fight_id: 11, player: 'Narande', class: 'Warlock', target_id: 3, used_health_pot: false, health_pot_count: 0, used_healthstone: true, healthstone_count: 1, def_cd_casts: 1 },
  ],
}

describe('stats aggregation and maxDeaths filtering', () => {
  it('filters by maxDeaths (null keeps all, integer keeps deaths_before <= maxDeaths)', () => {
    expect(filterByMaxDeaths(mockReport.egg_fails, null)).toHaveLength(3)
    expect(filterByMaxDeaths(mockReport.egg_fails, 0)).toHaveLength(1)
    expect(filterByMaxDeaths(mockReport.egg_fails, 2)).toHaveLength(2)
  })

  it('aggregates egg fails counting only Caustic Waves on Noxious Shell (Bumps/Splash are valid plays, not fails)', () => {
    const allRes = aggregateEggFails([mockReport], null)
    expect(allRes.total).toBe(2)
    expect(allRes.cleanSplashCount).toBe(1)
    expect(allRes.players[0].count).toBe(2)
    expect(allRes.players[0].lethalCount).toBe(1)

    const max2Res = aggregateEggFails([mockReport], 2)
    expect(max2Res.total).toBe(1)
    expect(max2Res.players[0].lethalCount).toBe(0)
  })

  it('aggregates wave fails and tank fails with maxDeaths', () => {
    expect(aggregateWaveFails([mockReport], null).total).toBe(2)
    expect(aggregateWaveFails([mockReport], 2).total).toBe(1)

    const tanksAll = aggregateTankFails([mockReport], null)
    expect(tanksAll.total).toBe(2)
    expect(tanksAll.tentacleCount).toBe(1)
    expect(tanksAll.stoneVenomCount).toBe(1)
    expect(tanksAll.stoneVenomLethalCount).toBe(1)

    const tanksZero = aggregateTankFails([mockReport], 0)
    expect(tanksZero.total).toBe(1)
    expect(tanksZero.players[0].tank).toBe('Barrumir')

    // Pull range filter (ab Try 2 bis Try 2)
    expect(aggregateWaveFails([mockReport], null, { from: 2, to: 2 }).total).toBe(1)
    expect(aggregateEggFails([mockReport], null, { from: 2, to: 2 }).total).toBe(0)
    expect(aggregateTankFails([mockReport], null, 'all', { from: 2, to: 2 }).total).toBe(1)
    expect(aggregateDefensives([mockReport], null, { from: 2, to: 2 }).players[0].pullsPresent).toBe(1)
  })

  it('aggregates defensive events and consumable quotes', () => {
    const defAll = aggregateDefensives([mockReport], null)
    const narande = defAll.players.find((p) => p.player === 'Narande')!
    expect(narande.pullsPresent).toBe(2)
    expect(narande.potPulls).toBe(1)
    expect(narande.hsPulls).toBe(1)
    expect(narande.lowSpikes).toBe(1)
    expect(narande.lowSpikesWithDef).toBe(1)
    expect(narande.deaths).toBe(1)
    expect(narande.deathsNoPotNoHs).toBe(1)

    const defMax2 = aggregateDefensives([mockReport], 2)
    expect(defMax2.players.find((p) => p.player === 'Narande')!.deaths).toBe(0)
  })

  it('computes phase buckets cleanly on empty and populated arrays', () => {
    expect(computePhaseBuckets([])).toEqual([
      { label: 'Runde 1 (< 01:15)', count: 0, pct: 0 },
      { label: 'Runde 2 (01:15–02:20)', count: 0, pct: 0 },
      { label: 'Runde 3+ (≥ 02:20)', count: 0, pct: 0 },
    ])
    const b = computePhaseBuckets(mockReport.egg_fails)
    expect(b[0].count).toBe(1)
    expect(b[1].count).toBe(2)
    expect(b[2].count).toBe(0)
  })

  it('aggregates heart phases across windows and ranks players by total boss damage', () => {
    const repWithHeart: ReportData = {
      ...mockReport,
      heart_phases: [
        {
          id: 'hw1',
          pull_num: 1,
          fight_id: 10,
          is_kill: false,
          window_num: 1,
          start_rel_time: '02:25.550',
          start_rel_ms: 145550,
          duration_ms: 20005,
          deaths_before: 1,
          total_heart_dmg: 32_000_000,
          total_boss_dmg: 12_000_000,
          total_effective_dmg: 44_000_000,
          total_other_dmg: 500_000,
          debris_hits_total: 1,
          players: [
            { player: 'Narande', class: 'Warlock', player_id: 3, heart_dmg: 20_000_000, heart_raw_dmg: 10_000_000, boss_dmg: 4_000_000, total_boss_dmg: 24_000_000, other_dmg: 500_000, heart_share_pct: 83.3, debris_hits: 0 },
            { player: 'Betøng', class: 'Monk', player_id: 1, heart_dmg: 12_000_000, heart_raw_dmg: 6_000_000, boss_dmg: 8_000_000, total_boss_dmg: 20_000_000, other_dmg: 0, heart_share_pct: 60.0, debris_hits: 1 },
          ],
          events_url: 'https://wcl/hw1',
          replay_url: 'https://wcl/rhw1',
        },
      ],
    }

    const res = aggregateHeartPhases([repWithHeart], 4, { from: 1, to: 2 })
    expect(res.windowCount).toBe(1)
    expect(res.totalEffectiveDmg).toBe(44_000_000)
    expect(res.players[0].player).toBe('Narande')
    expect(res.players[0].totalBossDmg).toBe(24_000_000)
    expect(res.players[0].heartSharePct).toBe(83.3)
    expect(res.players[1].debrisHits).toBe(1)

    // maxDeaths = 0 excludes window with deaths_before=1
    expect(aggregateHeartPhases([repWithHeart], 0, { from: 1, to: 2 }).windowCount).toBe(0)
  })

  it('aggregates P2/P3 events, kicks, blight vein overlaps, and warden focus damage', () => {
    const repWithP2: ReportData = {
      ...mockReport,
      phase_events: [
        {
          id: 'pe1', kind: 'blight_vein_overlap', phase: 'p2', player: 'Narande', class: 'Warlock', target_id: 3,
          ability: 'Blight Vein Overlap', detail: 'Betøng', gap_ms: 1100, damage: 0, lethal: false,
          pull_num: 2, fight_id: 11, is_kill: false, rel_time: '03:10.000', rel_ms: 190000, timestamp: 390000,
          deaths_before: 2, events_url: 'https://wcl/pe1', replay_url: 'https://wcl/rpe1',
        },
        {
          id: 'pe2', kind: 'malice_kick', phase: 'p2', side: 'Seite Betøng', player: 'Betøng', class: 'Monk', target_id: 1,
          ability: 'Malice', detail: 'Spear Hand Strike', gap_ms: null, damage: 0, lethal: false,
          pull_num: 2, fight_id: 11, is_kill: false, rel_time: '03:05.000', rel_ms: 185000, timestamp: 385000,
          deaths_before: 1, events_url: 'https://wcl/pe2', replay_url: 'https://wcl/rpe2',
        },
        {
          id: 'pe3', kind: 'malice_missed', phase: 'p2', side: 'Seite Barrumir', player: 'Seite Barrumir (nicht gekickt)', class: '', target_id: 0,
          ability: 'Malice', detail: 'Cast durchgekommen',
          ready_kickers: [{ player: 'Barrumir', class: 'DeathKnight', spell: 'Mind Freeze' }],
          on_cd_kickers: [],
          gap_ms: null, damage: 3_150_000, lethal: false,
          pull_num: 2, fight_id: 11, is_kill: false, rel_time: '03:20.000', rel_ms: 200000, timestamp: 400000,
          deaths_before: 2, events_url: 'https://wcl/pe3', replay_url: 'https://wcl/rpe3',
        },
      ],
      warden_summaries: [
        {
          pull_num: 2, fight_id: 11, is_kill: false, p2_start_rel_time: '02:54.000', deaths_at_p2_start: 1,
          warden_kills: 2, kill_sync_delta_ms: 3500, total_warden_dmg: 25_000_000,
          players: [{ player: 'Narande', class: 'Warlock', player_id: 3, damage: 25_000_000 }],
          events_url: 'https://wcl/w2', replay_url: 'https://wcl/rw2',
        },
      ],
      p3_summaries: [],
    }

    const res = aggregatePhaseAnalysis([repWithP2], 4, { from: 1, to: 2 })
    expect(res.blightOverlaps).toHaveLength(1)
    expect(res.maliceKicks).toHaveLength(1)
    expect(res.maliceMissed).toHaveLength(1)
    expect(res.kickSides).toEqual(['Seite Barrumir', 'Seite Betøng'])
    const betongK = res.kickPlayers.find((p) => p.player === 'Betøng')!
    expect(betongK.totalKicks).toBe(1)
    expect(betongK.kicksBySide['Seite Betøng']).toBe(1)
    const barrumirK = res.kickPlayers.find((p) => p.player === 'Barrumir')!
    expect(barrumirK.missedReadyCount).toBe(1)
    expect(barrumirK.missedBySide['Seite Barrumir']).toBe(1)
    expect(res.wardenPlayers[0].player).toBe('Narande')
    expect(res.wardenPlayers[0].totalDamage).toBe(25_000_000)
    expect(res.wardenPulls[0].kill_sync_delta_ms).toBe(3500)
  })
})
