import { describe, expect, it } from 'vitest'
import type { ReportData } from '../types'
import {
  aggregateDefensives,
  aggregateEggCarriers,
  aggregateEggFails,
  aggregateGroupSoaks,
  aggregateHealerEmergency,
  aggregateHealerTankSoaks,
  aggregateHeartPhases,
  aggregatePhaseAnalysis,
  aggregateTankFails,
  aggregateWaveFails,
  computePhaseBuckets,
  filterByMaxDeaths,
  getEventBossPhase,
  getLatestP2Groups,
  parseMrtSoakGroups,
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
    {
      id: 'e4', kind: 'egg_collision', player: 'Narande', class: 'Warlock', target_id: 3, pull_num: 2, fight_id: 11, is_kill: false,
      rel_time: '01:05.000', rel_ms: 65000, timestamp: 265000, deaths_before: 1, damage: 310000, overkill: 0, lethal: false, gap_ms: 2, has_putrid: true, has_rancid: true,
      collision_partners: ['Betøng'], collision_gap_ms: 14,
      events_url: 'https://wcl/e4', replay_url: 'https://wcl/r4',
    },
    {
      id: 'e5', kind: 'egg_collision', player: 'Betøng', class: 'Monk', target_id: 1, pull_num: 2, fight_id: 11, is_kill: false,
      rel_time: '01:05.014', rel_ms: 65014, timestamp: 265014, deaths_before: 1, damage: 305000, overkill: 0, lethal: true, gap_ms: 2, has_putrid: true, has_rancid: true,
      collision_partners: ['Narande'], collision_gap_ms: 14,
      events_url: 'https://wcl/e5', replay_url: 'https://wcl/r5',
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
      rel_time: '02:05.000', rel_ms: 125000, timestamp: 325000, deaths_before: 4, trigger_ability: 'Putrid Membrane', hp_pct: 0,
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
    expect(filterByMaxDeaths(mockReport.egg_fails, null)).toHaveLength(5)
    expect(filterByMaxDeaths(mockReport.egg_fails, 0)).toHaveLength(1)
    expect(filterByMaxDeaths(mockReport.egg_fails, 2)).toHaveLength(4)
  })

  it('aggregates egg fails counting Caustic Waves and 2-carrier Egg Collisions with paired incidents', () => {
    const allRes = aggregateEggFails([mockReport], null)
    expect(allRes.total).toBe(4)
    expect(allRes.waveTotal).toBe(2)
    expect(allRes.collisionTotal).toBe(2)
    expect(allRes.collisionIncidents).toHaveLength(1)
    expect(allRes.collisionIncidents[0].pull_num).toBe(2)
    expect(allRes.collisionIncidents[0].gap_ms).toBe(14)
    expect(allRes.collisionIncidents[0].lethal).toBe(true)
    expect(allRes.collisionIncidents[0].participants.map((p) => p.player)).toEqual(['Betøng', 'Narande'])
    expect(allRes.collisionIncidents[0].participants.map((p) => p.className)).toEqual(['Monk', 'Warlock'])
    // Separate phase buckets for wave hits vs collision pairs
    expect(allRes.wavePhases[0].count).toBe(0)
    expect(allRes.wavePhases[1].count).toBe(2)
    expect(allRes.collisionPhases[0].count).toBe(1)
    expect(allRes.collisionPhases[1].count).toBe(0)
    expect(allRes.cleanSplashCount).toBe(1)
    expect(allRes.players[0].player).toBe('Narande')
    expect(allRes.players[0].count).toBe(3)
    expect(allRes.players[0].waveCount).toBe(2)
    expect(allRes.players[0].collisionCount).toBe(1)
    expect(allRes.players[0].lethalCount).toBe(1)

    const onlyCol = aggregateEggFails([mockReport], null, null, 'egg_collision')
    expect(onlyCol.total).toBe(2)
    expect(onlyCol.collisionIncidents).toHaveLength(1)
    expect(onlyCol.items[0].collision_partners).toEqual(['Betøng'])

    const max2Res = aggregateEggFails([mockReport], 2)
    expect(max2Res.total).toBe(3)
    expect(max2Res.players.find((p) => p.player === 'Narande')!.lethalCount).toBe(0)
  })

  it('aggregates wave fails and tank fails with maxDeaths', () => {
    expect(aggregateWaveFails([mockReport], null).total).toBe(2)
    expect(aggregateWaveFails([mockReport], 2).total).toBe(1)

    const tanksAll = aggregateTankFails([mockReport], null)
    expect(tanksAll.total).toBe(2)
    expect(tanksAll.tentacleCount).toBe(1)
    expect(tanksAll.stoneVenomCount).toBe(1)
    expect(tanksAll.stoneVenomLethalCount).toBe(1)

    // Dead tank tentacle aggro is NOT a fail and must be excluded
    const withDeadTank: ReportData = {
      ...mockReport,
      tank_fails: [
        ...mockReport.tank_fails,
        { ...mockReport.tank_fails[0], id: 't-dead-tank', tank_was_dead: true },
      ],
    }
    expect(aggregateTankFails([withDeadTank], null).total).toBe(2)

    const tanksZero = aggregateTankFails([mockReport], 0)
    expect(tanksZero.total).toBe(1)
    expect(tanksZero.players[0].tank).toBe('Barrumir')

    // Pull range filter (ab Try 2 bis Try 2)
    expect(aggregateWaveFails([mockReport], null, { from: 2, to: 2 }).total).toBe(1)
    expect(aggregateEggFails([mockReport], null, { from: 2, to: 2 }).total).toBe(2)
    expect(aggregateEggFails([mockReport], null, { from: 2, to: 2 }).collisionIncidents).toHaveLength(1)
    expect(aggregateEggFails([mockReport], null, { from: 2, to: 2 }, 'caustic_waves').total).toBe(0)
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

    // Avoidable Caustic Waves low_hp_spike must be ignored in aggregateDefensives
    const withAvoidableSpike: ReportData = {
      ...mockReport,
      defensive_events: [
        ...mockReport.defensive_events,
        {
          id: 'd-avoid', kind: 'low_hp_spike', player: 'Narande', class: 'Warlock', target_id: 3, pull_num: 1, fight_id: 10, is_kill: false,
          rel_time: '01:05.000', rel_ms: 65000, timestamp: 66000, deaths_before: 0, trigger_ability: 'Caustic Waves', hp_pct: 18.0,
          had_def_cd: false, active_defs: [], ready_defs: ['Unending Resolve'], pot_used_in_pull: false, hs_used_in_pull: false,
          events_url: 'https://wcl/da', replay_url: 'https://wcl/rda',
        },
      ],
    }
    const defFiltered = aggregateDefensives([withAvoidableSpike], null)
    expect(defFiltered.players.find((p) => p.player === 'Narande')!.lowSpikes).toBe(1)

    // Healing Potion used right at <35% drop counts as usedAnyCount (not missedWhileReadyCount)
    const withPotReaction: ReportData = {
      ...mockReport,
      defensive_events: [
        {
          id: 'd-pot', kind: 'low_hp_spike', player: 'Narande', class: 'Warlock', target_id: 3, pull_num: 1, fight_id: 10, is_kill: false,
          rel_time: '00:50.000', rel_ms: 50000, timestamp: 51000, deaths_before: 0, trigger_ability: 'Mephitic Thrash', hp_pct: 22.0,
          had_def_cd: false, active_defs: [], used_pot_here: true, used_hs_here: false, used_any_here: true,
          ready_defs: ['Unending Resolve'], pot_ready: false, hs_ready: true, any_ready: true,
          pot_used_in_pull: true, hs_used_in_pull: false,
          events_url: 'https://wcl/dp', replay_url: 'https://wcl/rdp',
        },
        {
          id: 'd-miss', kind: 'low_hp_spike', player: 'Narande', class: 'Warlock', target_id: 3, pull_num: 2, fight_id: 11, is_kill: false,
          rel_time: '01:10.000', rel_ms: 70000, timestamp: 270000, deaths_before: 0, trigger_ability: 'Mephitic Thrash', hp_pct: 19.0,
          had_def_cd: false, active_defs: [], used_pot_here: false, used_hs_here: false, used_any_here: false,
          ready_defs: ['Unending Resolve'], pot_ready: true, hs_ready: true, any_ready: true,
          pot_used_in_pull: false, hs_used_in_pull: false,
          events_url: 'https://wcl/dm', replay_url: 'https://wcl/rdm',
        },
      ],
    }
    const defReact = aggregateDefensives([withPotReaction], null)
    const nRow = defReact.players.find((p) => p.player === 'Narande')!
    expect(nRow.criticalEvents).toBe(2)
    expect(nRow.usedAnyCount).toBe(1)
    expect(nRow.usedPotAtDropCount).toBe(1)
    expect(nRow.missedWhileReadyCount).toBe(1)
    expect(nRow.missedPotReadyCount).toBe(1)
    expect(nRow.missedHsReadyCount).toBe(1)
  })

  it('computes phase buckets cleanly on empty and populated arrays', () => {
    expect(computePhaseBuckets([])).toEqual([
      { label: 'Runde 1 (< 01:15)', count: 0, pct: 0 },
      { label: 'Runde 2 (01:15–02:20)', count: 0, pct: 0 },
      { label: 'Runde 3+ (≥ 02:20)', count: 0, pct: 0 },
    ])
    const b = computePhaseBuckets(mockReport.egg_fails)
    expect(b[0].count).toBe(3)
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
          first_switch_player: 'Narande',
          first_switch_spell: 'Shadow Bolt',
          first_switch_rel_time: '02:26.000',
          players: [
            { player: 'Narande', class: 'Warlock', player_id: 3, heart_dmg: 20_000_000, heart_raw_dmg: 10_000_000, boss_dmg: 4_000_000, total_boss_dmg: 24_000_000, other_dmg: 500_000, heart_share_pct: 83.3, debris_hits: 0, switch_delay_ms: 0, first_heart_spell: 'Shadow Bolt', was_dead_at_heart: false },
            { player: 'Betøng', class: 'Monk', player_id: 1, heart_dmg: 12_000_000, heart_raw_dmg: 6_000_000, boss_dmg: 8_000_000, total_boss_dmg: 20_000_000, other_dmg: 0, heart_share_pct: 60.0, debris_hits: 1, switch_delay_ms: 1400, first_heart_spell: 'Tiger Palm', was_dead_at_heart: false },
          ],
          events_url: 'https://wcl/hw1',
          replay_url: 'https://wcl/rhw1',
        },
      ],
    }

    const res = aggregateHeartPhases([repWithHeart], 4, { from: 1, to: 2 })
    expect(res.windowCount).toBe(1)
    expect(res.totalEffectiveDmg).toBe(44_000_000)
    expect(res.overallAvgSwitchDelayMs).toBe(700)
    expect(res.players[0].player).toBe('Narande')
    expect(res.players[0].totalBossDmg).toBe(24_000_000)
    expect(res.players[0].heartSharePct).toBe(83.3)
    expect(res.players[0].avgSwitchDelayMs).toBe(0)
    expect(res.players[0].firstSwitchCount).toBe(1)
    expect(res.players[1].avgSwitchDelayMs).toBe(1400)
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
          id: 'pe2', kind: 'malice_kick', phase: 'p2', side: 'Betøng Seite', side_tank_class: 'Monk', player: 'Betøng', class: 'Monk', target_id: 1,
          ability: 'Malice', detail: 'Spear Hand Strike',
          ready_kickers: [{ player: 'Narande', class: 'Warlock', spell: 'Spell Lock' }],
          on_cd_kickers: [],
          gap_ms: null, damage: 0, lethal: false,
          pull_num: 2, fight_id: 11, is_kill: false, rel_time: '03:05.000', rel_ms: 185000, timestamp: 385000,
          deaths_before: 1, events_url: 'https://wcl/pe2', replay_url: 'https://wcl/rpe2',
        },
        {
          id: 'pe3', kind: 'malice_missed', phase: 'p2', side: 'Barrumir Seite', side_tank_class: 'DeathKnight', player: 'Barrumir Seite (nicht gekickt)', class: '', target_id: 0,
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
    expect(res.kickSides).toEqual(['Barrumir Seite', 'Betøng Seite'])
    expect(res.kickSideTankClass['Betøng Seite']).toBe('Monk')
    const betongK = res.kickPlayers.find((p) => p.player === 'Betøng')!
    expect(betongK.totalKicks).toBe(1)
    expect(betongK.kicksBySide['Betøng Seite']).toBe(1)
    // Narande only had kick rdy on a cast that Betøng already kicked -> MUST be excluded!
    expect(res.kickPlayers.find((p) => p.player === 'Narande')).toBeUndefined()
    const barrumirK = res.kickPlayers.find((p) => p.player === 'Barrumir')!
    expect(barrumirK.missedReadyCount).toBe(1)
    expect(barrumirK.missedBySide['Barrumir Seite']).toBe(1)
    // Grouped by side
    expect(res.kickGroups).toHaveLength(2)
    const betongGrp = res.kickGroups.find((g) => g.side === 'Betøng Seite')!
    expect(betongGrp.totalKicks).toBe(1)
    expect(betongGrp.missedCasts).toBe(0)
    expect(betongGrp.players.map((p) => p.player)).toEqual(['Betøng'])
    const barrumirGrp = res.kickGroups.find((g) => g.side === 'Barrumir Seite')!
    expect(barrumirGrp.totalKicks).toBe(0)
    expect(barrumirGrp.missedCasts).toBe(1)
    expect(barrumirGrp.players).toEqual([
      expect.objectContaining({ player: 'Barrumir', kicks: 0, missedReady: 1 }),
    ])
    expect(res.wardenPlayers[0].player).toBe('Narande')
    expect(res.wardenPlayers[0].totalDamage).toBe(25_000_000)
    expect(res.wardenPulls[0].kill_sync_delta_ms).toBe(3500)
  })

  it('aggregates egg carrier uptime, dynamic min-max tolerance unnecessary shell damage, and alive vs dead misses', () => {
    const preBuckets = new Array<number>(21).fill(0)
    preBuckets[5] = 90_000
    preBuckets[14] = 80_000
    preBuckets[18] = 70_000

    const repWithCarriers: ReportData = {
      ...mockReport,
      egg_regular_carriers: ['Narande', 'Betøng'],
      egg_carrier_events: [
        {
          id: 'ec1', pull_num: 1, fight_id: 10, is_kill: false, round_num: 1,
          player: 'Narande', class: 'Warlock', target_id: 3, is_regular: true,
          status: 'ok', break_reason: 'spectral_coils', player_was_dead: false,
          pickup_rel_time: '00:20.000', pickup_rel_ms: 20_000, end_rel_time: '00:40.000', end_rel_ms: 40_000,
          break_rel_time: '00:40.000', timestamp: 21_000, duration_ms: 20_000,
          held_before_break_ms: 20_000, post_break_ms: 0,
          total_shell_dmg: 240_000, pre_dmg_sec: preBuckets, post_break_dmg: 0,
          deaths_before: 0, events_url: 'https://wcl/ec1', replay_url: 'https://wcl/rec1',
        },
        {
          id: 'ec2', pull_num: 1, fight_id: 10, is_kill: false, round_num: 1,
          player: 'Betøng', class: 'Monk', target_id: 1, is_regular: true,
          status: 'missed_alive', break_reason: 'missed_alive', player_was_dead: false,
          pickup_rel_time: '—', pickup_rel_ms: 40_000, end_rel_time: '—', end_rel_ms: 40_000,
          break_rel_time: '00:40.000', timestamp: 41_000, duration_ms: 0,
          held_before_break_ms: 0, post_break_ms: 0,
          total_shell_dmg: 0, pre_dmg_sec: [], post_break_dmg: 0,
          deaths_before: 0, events_url: 'https://wcl/ec2', replay_url: 'https://wcl/rec2',
        },
        {
          id: 'ec3', pull_num: 2, fight_id: 11, is_kill: false, round_num: 1,
          player: 'Betøng', class: 'Monk', target_id: 1, is_regular: true,
          status: 'missed_dead', break_reason: 'missed_dead', player_was_dead: true,
          pickup_rel_time: '—', pickup_rel_ms: 40_000, end_rel_time: '—', end_rel_ms: 40_000,
          break_rel_time: '00:40.000', timestamp: 240_000, duration_ms: 0,
          held_before_break_ms: 0, post_break_ms: 0,
          total_shell_dmg: 0, pre_dmg_sec: [], post_break_dmg: 0,
          deaths_before: 1, events_url: 'https://wcl/ec3', replay_url: 'https://wcl/rec3',
        },
        {
          id: 'ec4', pull_num: 2, fight_id: 11, is_kill: false, round_num: 1,
          player: 'Narande', class: 'Warlock', target_id: 3, is_regular: true,
          status: 'hit_fail', break_reason: 'caustic_waves', player_was_dead: false,
          pickup_rel_time: '00:37.000', pickup_rel_ms: 37_000, end_rel_time: '00:40.000', end_rel_ms: 40_000,
          break_rel_time: '00:40.000', timestamp: 237_000, duration_ms: 3_000,
          held_before_break_ms: 3_000, post_break_ms: 0,
          total_shell_dmg: 30_000, pre_dmg_sec: [10_000, 10_000, 10_000], post_break_dmg: 0,
          deaths_before: 1, events_url: 'https://wcl/ec4', replay_url: 'https://wcl/rec4',
        },
      ],
    }

    // Default 5-12s tolerance: buckets 14 (80k) + 18 (70k) = 150k unnecessary dmg; ec4 (3s < 5s + hit_fail) = lateHit
    const res12 = aggregateEggCarriers([repWithCarriers], 4, { from: 1, to: 2 }, 5, 12)
    expect(res12.totalShellDmg).toBe(270_000)
    expect(res12.totalUnnecessaryDmg).toBe(150_000)
    expect(res12.missedAliveTotal).toBe(1)
    expect(res12.missedDeadTotal).toBe(1)
    expect(res12.lateHitTotal).toBe(1)
    const nar = res12.players.find((p) => p.player === 'Narande')!
    expect(nar.unnecessaryMs).toBe(8_000) // 20s - 12s
    expect(nar.lateHitCount).toBe(1)

    // Raised tolerance 5-16s: only bucket 18 (70k) is unnecessary!
    const res16 = aggregateEggCarriers([repWithCarriers], 4, { from: 1, to: 2 }, 5, 16)
    expect(res16.totalUnnecessaryDmg).toBe(70_000)
    expect(res16.players.find((p) => p.player === 'Narande')!.unnecessaryMs).toBe(4_000)
  })

  it('aggregates healer emergency reactions and boss tank soak healing separately', () => {
    const repWithHealers: ReportData = {
      ...mockReport,
      defensive_events: [
        ...mockReport.defensive_events,
        // Avoidable Caustic Waves death -> must be ignored by aggregateDefensives!
        {
          id: 'd-cw-avoid', kind: 'death', player: 'Narande', class: 'Warlock', target_id: 3,
          pull_num: 1, fight_id: 10, is_kill: false, rel_time: '00:50.000', rel_ms: 50000, timestamp: 50000,
          deaths_before: 0, trigger_ability: 'Caustic Waves', hp_pct: 0, had_def_cd: false, active_defs: [],
          used_pot_here: false, used_hs_here: false, used_any_here: false,
          ready_defs: ['Unending Resolve'], pot_ready: true, hs_ready: true, any_ready: true,
          pot_used_in_pull: false, hs_used_in_pull: false,
          events_url: 'https://wcl/dcw', replay_url: 'https://wcl/rdcw',
        },
      ],
      healer_emergency_events: [
        {
          id: 'hem1', pull_num: 1, fight_id: 10, is_kill: false, rel_time: '00:45.000', rel_ms: 45000, timestamp: 45000,
          deaths_before: 0, victim: 'Narande', victim_class: 'Warlock', victim_id: 3,
          trigger_ability: 'Caustic Waves', hp_pct: 22.5, concurrent_low_count: 1, target_died: false,
          fastest_reaction_ms: 600, fastest_healer: 'Valysa', fastest_healer_class: 'Priest',
          reactions: [
            {
              healer: 'Valysa', healer_class: 'Priest', healer_spec: 'Holy', healer_id: 5,
              status: 'instant_used', reaction_ms: 600, spell: 'Holy Word: Serenity', is_external: false,
              instant_was_ready: true, ready_instants: ['Holy Word: Serenity'], covered_fast_by_other: false,
            },
            {
              healer: 'Yaviroarz', healer_class: 'Druid', healer_spec: 'Restoration', healer_id: 157,
              status: 'no_heal', reaction_ms: null, spell: null, is_external: false,
              instant_was_ready: true, ready_instants: ['Swiftmend'], covered_fast_by_other: true,
            },
          ],
          events_url: 'https://wcl/hem1', replay_url: 'https://wcl/rhem1',
        },
        {
          id: 'hem2', pull_num: 2, fight_id: 11, is_kill: false, rel_time: '01:05.000', rel_ms: 65000, timestamp: 265000,
          deaths_before: 1, victim: 'Narande', victim_class: 'Warlock', victim_id: 3,
          trigger_ability: 'Noxious Shell', hp_pct: 18.0, concurrent_low_count: 1, target_died: true,
          fastest_reaction_ms: 1800, fastest_healer: 'Valysa', fastest_healer_class: 'Priest',
          reactions: [
            {
              healer: 'Valysa', healer_class: 'Priest', healer_spec: 'Holy', healer_id: 5,
              status: 'cast_used', reaction_ms: 1800, spell: 'Flash Heal', is_external: false,
              instant_was_ready: false, ready_instants: [], covered_fast_by_other: false,
            },
            {
              healer: 'Yaviroarz', healer_class: 'Druid', healer_spec: 'Restoration', healer_id: 157,
              status: 'no_heal', reaction_ms: null, spell: null, is_external: false,
              instant_was_ready: true, ready_instants: ['Swiftmend'], covered_fast_by_other: false,
            },
          ],
          events_url: 'https://wcl/hem2', replay_url: 'https://wcl/rhem2',
        },
      ],
      healer_tank_soak_events: [
        {
          id: 'hts1', pull_num: 1, fight_id: 10, is_kill: false, rel_time: '00:55.000', rel_ms: 55000, timestamp: 55000,
          deaths_before: 0, tank: 'Betøng', tank_class: 'Monk', tank_id: 1,
          stacks: 3, min_hp_pct: 28.0, tank_died: false, any_healed: true, healers_reacted_count: 1,
          fastest_reaction_ms: 400, fastest_healer: 'Valysa',
          reactions: [
            {
              healer: 'Valysa', healer_class: 'Priest', healer_spec: 'Holy', healer_id: 5,
              healed: true, reaction_ms: 400, heal_count: 3, used_external: true, spells: ['Guardian Spirit', 'Flash Heal'],
            },
            {
              healer: 'Yaviroarz', healer_class: 'Druid', healer_spec: 'Restoration', healer_id: 157,
              healed: false, reaction_ms: null, heal_count: 0, used_external: false, spells: [],
            },
          ],
          events_url: 'https://wcl/hts1', replay_url: 'https://wcl/rhts1',
        },
      ],
    }

    // Avoidable Caustic Waves death must not be counted in Defensives
    const defs = aggregateDefensives([repWithHealers], 4, { from: 1, to: 2 })
    expect(defs.players.flatMap((p) => p.items).some((e) => e.id === 'd-cw-avoid')).toBe(false)

    // Emergency Heals aggregation
    const em = aggregateHealerEmergency([repWithHealers], 4, { from: 1, to: 2 })
    expect(em.totalEvents).toBe(2)
    expect(em.targetDiedCount).toBe(1)
    expect(em.avgFastestMs).toBe(1200)
    const valEm = em.healers.find((h) => h.healer === 'Valysa')!
    expect(valEm.instantUsedCount).toBe(1)
    expect(valEm.castUsedCount).toBe(1)
    expect(valEm.avgReactionMs).toBe(1200)
    const yavEm = em.healers.find((h) => h.healer === 'Yaviroarz')!
    expect(yavEm.noHealCount).toBe(2)
    expect(yavEm.missedInstantReadyUnassistedCount).toBe(1) // hem1 was covered_fast_by_other; hem2 target died!
    expect(yavEm.coveredFastCount).toBe(1)

    // Separate Boss Tank Soak aggregation
    const tk = aggregateHealerTankSoaks([repWithHealers], 4, { from: 1, to: 2 })
    expect(tk.totalSoaks).toBe(1)
    expect(tk.soaksWithHealCount).toBe(1)
    const valTk = tk.healers.find((h) => h.healer === 'Valysa')!
    expect(valTk.healedSoaks).toBe(1)
    expect(valTk.externalCount).toBe(1)
    expect(valTk.avgReactionMs).toBe(400)
    const yavTk = tk.healers.find((h) => h.healer === 'Yaviroarz')!
    expect(yavTk.unhealedSoaks).toBe(1)
  })

  it('filters instant deaths below minInstantAliveSec and respects minCastAliveSec tolerance (0.5-1.7s)', () => {
    const repTol: ReportData = {
      ...mockReport,
      healer_emergency_events: [
        // Instant death after 300ms -> excluded when minInstantAliveSec = 0.5!
        {
          id: 'hem-inst-death', pull_num: 1, fight_id: 10, is_kill: false, rel_time: '00:30.000', rel_ms: 30000, timestamp: 30000,
          deaths_before: 0, victim: 'Narande', victim_class: 'Warlock', victim_id: 3,
          trigger_ability: 'Caustic Waves', hp_pct: 12.0, concurrent_low_count: 1, target_died: true, time_to_death_ms: 300,
          fastest_reaction_ms: null, fastest_healer: null, fastest_healer_class: null,
          reactions: [
            {
              healer: 'Valysa', healer_class: 'Priest', healer_spec: 'Holy', healer_id: 5,
              status: 'no_heal', reaction_ms: null, spell: null, is_external: false,
              instant_was_ready: true, ready_instants: ['Holy Word: Serenity'], covered_fast_by_other: false,
            },
          ],
          events_url: 'https://wcl/hid', replay_url: 'https://wcl/rhid',
        },
        // Tight death after 1100ms (0.5s <= 1.1s < 1.7s): Valysa had instant rdy, Yaviroarz had NO instant rdy (too short for hardcast!)
        {
          id: 'hem-tight', pull_num: 1, fight_id: 10, is_kill: false, rel_time: '00:50.000', rel_ms: 50000, timestamp: 50000,
          deaths_before: 0, victim: 'Narande', victim_class: 'Warlock', victim_id: 3,
          trigger_ability: 'Noxious Shell', hp_pct: 20.0, concurrent_low_count: 1, target_died: true, time_to_death_ms: 1100,
          fastest_reaction_ms: null, fastest_healer: null, fastest_healer_class: null,
          reactions: [
            {
              healer: 'Valysa', healer_class: 'Priest', healer_spec: 'Holy', healer_id: 5,
              status: 'no_heal', reaction_ms: null, spell: null, is_external: false,
              instant_was_ready: true, ready_instants: ['Holy Word: Serenity'], covered_fast_by_other: false,
            },
            {
              healer: 'Yaviroarz', healer_class: 'Druid', healer_spec: 'Restoration', healer_id: 157,
              status: 'no_heal', reaction_ms: null, spell: null, is_external: false,
              instant_was_ready: false, ready_instants: [], covered_fast_by_other: false,
            },
          ],
          events_url: 'https://wcl/ht', replay_url: 'https://wcl/rht',
        },
      ],
    }

    const resDefault = aggregateHealerEmergency([repTol], 4, { from: 1, to: 2 }, 0.5, 1.7)
    expect(resDefault.filteredInstantDeathCount).toBe(1)
    expect(resDefault.totalEvents).toBe(1)
    const valRow = resDefault.healers.find((h) => h.healer === 'Valysa')!
    const yavRow = resDefault.healers.find((h) => h.healer === 'Yaviroarz')!
    expect(valRow.missedInstantReadyUnassistedCount).toBe(1)
    expect(valRow.missedWhileTargetDiedCount).toBe(1)
    // Yaviroarz had no instant ready & 1.1s < 1.7s -> NOT blamed for death!
    expect(yavRow.missedWhileTargetDiedCount).toBe(0)
    expect(yavRow.tooShortForCastCount).toBe(1)

    // Raising Min to 1.5s hides BOTH deaths as instant deaths!
    const resStrict = aggregateHealerEmergency([repTol], 4, { from: 1, to: 2 }, 1.5, 1.7)
    expect(resStrict.filteredInstantDeathCount).toBe(2)
    expect(resStrict.totalEvents).toBe(0)
  })

  it('aggregates group soaks by phase (shattering / p1 / all), missed_alive, wrong_group, double_soak, and dead_expected', () => {
    const repWithSoaks: ReportData = {
      ...mockReport,
      soak_groups: {
        shattering: {
          group_a_label: 'Gruppe Barrumir',
          group_a_class: 'DeathKnight',
          group_a_players: [
            { player: 'Barrumir', class: 'DeathKnight', player_id: 2 },
            { player: 'Narande', class: 'Warlock', player_id: 3 },
          ],
          group_b_label: 'Gruppe Betøng',
          group_b_class: 'Monk',
          group_b_players: [
            { player: 'Betøng', class: 'Monk', player_id: 1 },
            { player: 'Slyfastorm', class: 'Shaman', player_id: 4 },
          ],
        },
        p1: {
          group_a_label: 'Soak-Gruppe 1',
          group_a_class: '',
          group_a_players: [{ player: 'Narande', class: 'Warlock', player_id: 3 }],
          group_b_label: 'Soak-Gruppe 2',
          group_b_class: '',
          group_b_players: [{ player: 'Slyfastorm', class: 'Shaman', player_id: 4 }],
        },
      },
      group_soaks: [
        {
          id: 'gsk-p1-1', phase: 'p1', pull_num: 1, fight_id: 10, is_kill: false, soak_num: 1,
          rel_time: '00:25.000', rel_ms: 25000, timestamp: 26000, deaths_before: 0,
          expected_group: 'Soak-Gruppe 1', expected_group_class: '',
          total_soakers: 1, correct_count: 1, alternation_ok: true,
          soakers: [{ player: 'Narande', class: 'Warlock', player_id: 3 }],
          missed_alive: [], wrong_group: [], dead_expected: [],
          boss_tank_exempt: { player: 'Betøng', class: 'Monk', player_id: 1 },
          events_url: 'https://wcl/g1', replay_url: 'https://wcl/rg1',
        },
        {
          id: 'gsk-shat-1', phase: 'shattering', pull_num: 2, fight_id: 11, is_kill: false, soak_num: 1,
          rel_time: '04:10.000', rel_ms: 250000, timestamp: 450000, deaths_before: 0,
          expected_group: 'Gruppe Betøng', expected_group_class: 'Monk',
          total_soakers: 2, correct_count: 2, alternation_ok: true,
          soakers: [
            { player: 'Betøng', class: 'Monk', player_id: 1 },
            { player: 'Slyfastorm', class: 'Shaman', player_id: 4 },
          ],
          missed_alive: [], wrong_group: [], dead_expected: [],
          events_url: 'https://wcl/gs1', replay_url: 'https://wcl/rgs1',
        },
        {
          id: 'gsk-shat-2', phase: 'shattering', pull_num: 2, fight_id: 11, is_kill: false, soak_num: 2,
          rel_time: '04:20.000', rel_ms: 260000, timestamp: 460000, deaths_before: 1,
          expected_group: 'Gruppe Barrumir', expected_group_class: 'DeathKnight',
          total_soakers: 1, correct_count: 0, alternation_ok: false,
          soakers: [],
          missed_alive: [{ player: 'Narande', class: 'Warlock', player_id: 3 }],
          wrong_group: [{ player: 'Slyfastorm', class: 'Shaman', player_id: 4, double_soak: true }],
          dead_expected: [{ player: 'Barrumir', class: 'DeathKnight', player_id: 2 }],
          events_url: 'https://wcl/gs2', replay_url: 'https://wcl/rgs2',
        },
      ],
    }

    const shat = aggregateGroupSoaks([repWithSoaks], 4, { from: 1, to: 2 }, 'shattering')
    expect(shat.shatteringCount).toBe(2)
    expect(shat.p1Count).toBe(1)
    expect(shat.totalSoaks).toBe(2)
    expect(shat.cleanSoaks).toBe(1)
    expect(shat.cleanRatePct).toBe(50)
    expect(shat.missedAliveTotal).toBe(1)
    expect(shat.wrongGroupTotal).toBe(1)
    expect(shat.doubleSoakTotal).toBe(1)
    expect(shat.groups?.group_a_label).toBe('Gruppe Barrumir')
    const nar = shat.players.find((p) => p.player === 'Narande')!
    expect(nar.missedAliveCount).toBe(1)
    expect(nar.soakRatePct).toBe(0)
    expect(nar.groupLabel).toBe('Gruppe Barrumir')
    const sly = shat.players.find((p) => p.player === 'Slyfastorm')!
    expect(sly.correctCount).toBe(1)
    expect(sly.wrongGroupCount).toBe(1)
    expect(sly.doubleSoakCount).toBe(1)
    // Dead expected (Barrumir) is NOT counted as missed_alive!
    const bar = shat.players.find((p) => p.player === 'Barrumir')!
    expect(bar.missedAliveCount).toBe(0)
    expect(bar.deadCount).toBe(1)
    // Split group tables: 2 distinct tables (Gruppe Barrumir & Gruppe Betøng)
    expect(shat.groupTables).toHaveLength(2)
    expect(shat.groupTables[0].label).toBe('Gruppe Barrumir')
    expect(shat.groupTables[0].players.map((p) => p.player)).toEqual(['Narande', 'Barrumir'])
    expect(shat.groupTables[1].label).toBe('Gruppe Betøng')
    expect(shat.groupTables[1].players.map((p) => p.player)).toEqual(['Slyfastorm', 'Betøng'])

    const p1 = aggregateGroupSoaks([repWithSoaks], 4, { from: 1, to: 2 }, 'p1')
    expect(p1.totalSoaks).toBe(1)
    expect(p1.cleanRatePct).toBe(100)
    expect(p1.groups?.group_a_label).toBe('Soak-Gruppe 1')
    expect(p1.bossTankExemptTotal).toBe(1)
    const betP1 = p1.players.find((p) => p.player === 'Betøng')!
    expect(betP1.bossTankExemptCount).toBe(1)
    expect(betP1.missedAliveCount).toBe(0)

    const all = aggregateGroupSoaks([repWithSoaks], 4, { from: 1, to: 2 }, 'all')
    expect(all.totalSoaks).toBe(3)
  })

  it('classifies events into BossPhaseKey and filters defensives & healers cleanly by phaseFilter', () => {
    const pullWithPhases = {
      ...mockReport.pulls[0],
      fight_id: 10,
      start_time: 1000,
      end_time: 260_000,
      phase_transitions: [
        { id: 1, start_time: 1000 },
        { id: 2, start_time: 150_000 },
        { id: 3, start_time: 200_000 },
        { id: 4, start_time: 235_000 },
      ],
    }
    expect(getEventBossPhase(pullWithPhases, 80_000)).toBe('p1')
    expect(getEventBossPhase(pullWithPhases, 165_000)).toBe('p2')
    expect(getEventBossPhase(pullWithPhases, 210_000)).toBe('intermission')
    expect(getEventBossPhase(pullWithPhases, 240_000)).toBe('p3')
    expect(getEventBossPhase(undefined, 80_000)).toBe('p1')

    const repPhased: ReportData = {
      ...mockReport,
      pulls: [
        pullWithPhases,
        {
          ...mockReport.pulls[1],
          fight_id: 11,
          phase_transitions: [{ id: 1, start_time: 200_000 }], // Pull 2 never reached P2!
        },
      ],
      defensive_events: [
        {
          id: 'def-p1', kind: 'low_hp_spike', player: 'Narande', class: 'Warlock', target_id: 3,
          pull_num: 1, fight_id: 10, is_kill: false, rel_time: '01:00.000', rel_ms: 59_000, timestamp: 60_000,
          deaths_before: 0, trigger_ability: 'Putrid Membrane', hp_pct: 25, had_def_cd: false, active_defs: [],
          ready_defs: ['Unending Resolve'], pot_used_in_pull: false, hs_used_in_pull: false,
          events_url: 'https://wcl/dp1', replay_url: 'https://wcl/rdp1',
        },
        {
          id: 'def-p2', kind: 'death', player: 'Betøng', class: 'Monk', target_id: 1,
          pull_num: 1, fight_id: 10, is_kill: false, rel_time: '02:45.000', rel_ms: 164_000, timestamp: 165_000,
          deaths_before: 0, trigger_ability: 'Blight Vein', hp_pct: 0, had_def_cd: true, active_defs: ['Fortifying Brew'],
          ready_defs: [], pot_used_in_pull: true, hs_used_in_pull: true,
          events_url: 'https://wcl/dp2', replay_url: 'https://wcl/rdp2',
        },
      ],
      healer_emergency_events: [
        {
          id: 'hem-p1', pull_num: 1, fight_id: 10, is_kill: false, rel_time: '01:00.000', rel_ms: 59_000, timestamp: 60_000,
          deaths_before: 0, victim: 'Narande', victim_class: 'Warlock', victim_id: 3,
          trigger_ability: 'Putrid Membrane', hp_pct: 25, concurrent_low_count: 1, target_died: false, time_to_death_ms: null,
          fastest_reaction_ms: 400, fastest_healer: 'Valysa', fastest_healer_class: 'Priest',
          reactions: [{ healer: 'Valysa', healer_class: 'Priest', healer_spec: 'Holy', healer_id: 5, status: 'instant_used', reaction_ms: 400, spell: 'Holy Word: Serenity', is_external: false, instant_was_ready: true, ready_instants: ['Holy Word: Serenity'], covered_fast_by_other: false }],
          events_url: 'https://wcl/hp1', replay_url: 'https://wcl/rhp1',
        },
        {
          id: 'hem-p2', pull_num: 1, fight_id: 10, is_kill: false, rel_time: '02:45.000', rel_ms: 164_000, timestamp: 165_000,
          deaths_before: 0, victim: 'Betøng', victim_class: 'Monk', victim_id: 1,
          trigger_ability: 'Blight Vein', hp_pct: 20, concurrent_low_count: 1, target_died: false, time_to_death_ms: null,
          fastest_reaction_ms: 600, fastest_healer: 'Valysa', fastest_healer_class: 'Priest',
          reactions: [{ healer: 'Valysa', healer_class: 'Priest', healer_spec: 'Holy', healer_id: 5, status: 'instant_used', reaction_ms: 600, spell: 'Holy Word: Serenity', is_external: false, instant_was_ready: true, ready_instants: ['Holy Word: Serenity'], covered_fast_by_other: false }],
          events_url: 'https://wcl/hp2', replay_url: 'https://wcl/rhp2',
        },
      ],
    }

    const defAll = aggregateDefensives([repPhased], 4, { from: 1, to: 2 })
    expect(defAll.totalCritical).toBe(2)
    const defP1 = aggregateDefensives([repPhased], 4, { from: 1, to: 2 }, 'p1')
    expect(defP1.totalCritical).toBe(1)
    expect(defP1.players.find((p) => p.player === 'Narande')?.criticalEvents).toBe(1)
    const defP2 = aggregateDefensives([repPhased], 4, { from: 1, to: 2 }, 'p2')
    expect(defP2.totalCritical).toBe(1)
    expect(defP2.players.find((p) => p.player === 'Betøng')?.criticalEvents).toBe(1)
    expect(defP2.players.find((p) => p.player === 'Narande')?.pullsPresent).toBe(1) // only Pull 1 reached P2!
    const defP3 = aggregateDefensives([repPhased], 4, { from: 1, to: 2 }, 'p3')
    expect(defP3.totalCritical).toBe(0)

    const emP1 = aggregateHealerEmergency([repPhased], 4, { from: 1, to: 2 }, 0.5, 1.7, 'p1')
    expect(emP1.totalEvents).toBe(1)
    expect(emP1.avgFastestMs).toBe(400)
    const emP2 = aggregateHealerEmergency([repPhased], 4, { from: 1, to: 2 }, 0.5, 1.7, 'p2')
    expect(emP2.totalEvents).toBe(1)
    expect(emP2.avgFastestMs).toBe(600)
    const emInter = aggregateHealerEmergency([repPhased], 4, { from: 1, to: 2 }, 0.5, 1.7, 'intermission')
    expect(emInter.totalEvents).toBe(0)
  })

  it('parses MRT-Notes with WoW color codes/accents and re-evaluates 3-group Shattering soaks instantly', () => {
    const roster = [
      { player: 'Betøng', class: 'Monk', player_id: 1 },
      { player: 'Barrumir', class: 'DeathKnight', player_id: 2 },
      { player: 'Näxxs', class: 'Hunter', player_id: 3 },
      { player: 'Leÿlu', class: 'Paladin', player_id: 4 },
      { player: 'ßigpriest', class: 'Priest', player_id: 5 },
      { player: 'Narande', class: 'Warlock', player_id: 6 },
    ]
    const mrtRaw = [
      '{rt1} Gruppe 1: |cff00ff98Betong|r, Naxxs',
      'G2: Leylu - Bigpriest',
      '3) Barrumir Narande UnknownGuy',
    ].join('\n')

    const parsed = parseMrtSoakGroups(mrtRaw, roster)
    expect(parsed.groups).toHaveLength(3)
    expect(parsed.groups[0].players.map((p) => p.player)).toEqual(['Betøng', 'Näxxs'])
    expect(parsed.groups[1].players.map((p) => p.player)).toEqual(['Leÿlu', 'ßigpriest'])
    expect(parsed.groups[2].players.map((p) => p.player)).toEqual(['Barrumir', 'Narande'])
    expect(parsed.unknownNames).toEqual(['UnknownGuy'])

    // Even on a provisional 1-round report, passing customShatteringGroups re-evaluates deterministically with 3 groupTables!
    const rep3Grp: ReportData = {
      ...mockReport,
      soak_groups: {
        p2: {
          group_a_label: 'Gruppe Barrumir',
          group_a_class: 'DeathKnight',
          group_a_players: [roster[1]],
          group_b_label: 'Gruppe Betøng',
          group_b_class: 'Monk',
          group_b_players: [roster[0]],
        },
        shattering: {
          confidence: 'provisional',
          rounds_observed: 1,
          groups: [
            { key: 'G1', label: 'Gruppe 1', players: [roster[0], roster[2]] },
            { key: 'G2', label: 'Gruppe 2', players: [roster[3], roster[4]] },
            { key: 'G3', label: 'Gruppe 3', players: [roster[1], roster[5]] },
          ],
        },
        p1: {
          group_a_label: 'Soak-Gruppe 1',
          group_a_class: '',
          group_a_players: [],
          group_b_label: 'Soak-Gruppe 2',
          group_b_class: '',
          group_b_players: [],
        },
      },
      group_soaks: [
        {
          id: 'sh-1', phase: 'shattering', pull_num: 1, fight_id: 10, is_kill: false, soak_num: 1, round_num: 1, confidence: 'provisional',
          rel_time: '04:10.000', rel_ms: 250000, timestamp: 450000, deaths_before: 0,
          expected_group: 'Gruppe 1', expected_group_class: '', total_soakers: 2, correct_count: 2, alternation_ok: true,
          soakers: [roster[0], roster[2]], missed_alive: [], wrong_group: [], dead_expected: [],
          absent_alive: [roster[1], roster[3], roster[4], roster[5]], absent_dead: [],
          events_url: 'https://wcl/sh1', replay_url: 'https://wcl/rsh1',
        },
        {
          // Soak #2: Expected G2 (Leÿlu, ßigpriest), but ßigpriest MISSED ALIVE and Betøng DOUBLE-SOAKED!
          id: 'sh-2', phase: 'shattering', pull_num: 1, fight_id: 10, is_kill: false, soak_num: 2, round_num: 1, confidence: 'provisional',
          rel_time: '04:15.000', rel_ms: 255000, timestamp: 455000, deaths_before: 0,
          expected_group: 'Gruppe 2', expected_group_class: '', total_soakers: 2, correct_count: 1, alternation_ok: false,
          soakers: [roster[3]], missed_alive: [], wrong_group: [{ ...roster[0], double_soak: true }], dead_expected: [],
          absent_alive: [roster[1], roster[2], roster[4], roster[5]], absent_dead: [],
          events_url: 'https://wcl/sh2', replay_url: 'https://wcl/rsh2',
        },
      ],
    }

    expect(getLatestP2Groups([rep3Grp])?.group_a_label).toBe('Gruppe Barrumir')

    const resMrt = aggregateGroupSoaks([rep3Grp], 4, { from: 1, to: 2 }, 'shattering', parsed.groups)
    expect(resMrt.confidence).toBe('mrt')
    expect(resMrt.groupTables).toHaveLength(3)
    expect(resMrt.groupTables.map((t) => t.label)).toEqual(['Gruppe 1', 'Gruppe 2', 'Gruppe 3'])
    // Under MRT override, ßigpriest is immediately flagged as missed_alive on Soak #2!
    expect(resMrt.soaks[1].missed_alive.map((p) => p.player)).toEqual(['ßigpriest'])
    expect(resMrt.soaks[1].wrong_group[0]).toMatchObject({ player: 'Betøng', double_soak: true })
  })
})
