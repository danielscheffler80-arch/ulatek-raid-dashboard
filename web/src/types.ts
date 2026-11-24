export interface ReportsStore {
  schema_version: number
  updated_at: string
  reports: ReportData[]
}

export interface TankActor {
  id: number
  name: string
  class: string
}

export interface HealerActor {
  id: number
  name: string
  class: string
  spec: string
  pulls: number
}

export type HealerEmergencyStatus = 'instant_used' | 'cast_used' | 'no_heal'

export interface HealerEmergencyReaction {
  healer: string
  healer_class: string
  healer_spec: string
  healer_id: number
  status: HealerEmergencyStatus
  reaction_ms: number | null
  spell: string | null
  is_external: boolean
  instant_was_ready: boolean
  ready_instants: string[]
  covered_fast_by_other: boolean
}

export interface HealerEmergencyEvent {
  id: string
  pull_num: number
  fight_id: number
  is_kill: boolean
  rel_time: string
  rel_ms: number
  timestamp: number
  deaths_before: number
  victim: string
  victim_class: string
  victim_id: number
  trigger_ability: string
  hp_pct: number
  concurrent_low_count: number
  target_died: boolean
  time_to_death_ms?: number | null
  fastest_reaction_ms: number | null
  fastest_healer: string | null
  fastest_healer_class: string | null
  reactions: HealerEmergencyReaction[]
  events_url: string
  replay_url: string
}

export interface HealerTankSoakReaction {
  healer: string
  healer_class: string
  healer_spec: string
  healer_id: number
  healed: boolean
  reaction_ms: number | null
  heal_count: number
  used_external: boolean
  spells: string[]
}

export interface HealerTankSoakEvent {
  id: string
  pull_num: number
  fight_id: number
  is_kill: boolean
  rel_time: string
  rel_ms: number
  timestamp: number
  deaths_before: number
  tank: string
  tank_class: string
  tank_id: number
  stacks: number
  min_hp_pct: number | null
  tank_died: boolean
  any_healed: boolean
  healers_reacted_count: number
  fastest_reaction_ms: number | null
  fastest_healer: string | null
  reactions: HealerTankSoakReaction[]
  events_url: string
  replay_url: string
}

export interface PlayerSummary {
  id: number
  name: string
  class: string
  is_tank: boolean
  pulls_present: number
}

export interface PullPhaseTransition {
  id: number
  start_time: number
}

export type BossPhaseKey = 'p1' | 'p2' | 'intermission' | 'p3'

export type OberTabKey = 'general' | 'p1' | 'p2' | 'intermission' | 'p3'

export type PhaseViewKey =
  | 'p1_soaks'
  | 'p2_overlaps'
  | 'p2_kicks'
  | 'p2_warden'
  | 'p2_avoidables'
  | 'intermission_soaks'
  | 'p3_burn'
  | 'p3_kicks'
  | 'p3_avoidables'

export interface PullData {
  pull_num: number
  fight_id: number
  is_kill: boolean
  boss_percentage: number
  duration_ms: number
  start_time: number
  end_time: number
  deaths_total: number
  phase_transitions?: PullPhaseTransition[]
  report_url: string
}

export interface EggFail {
  id: string
  kind: 'caustic_waves' | 'egg_collision' | 'noxious_splash'
  player: string
  class: string
  target_id: number
  pull_num: number
  fight_id: number
  is_kill: boolean
  rel_time: string
  rel_ms: number
  timestamp: number
  deaths_before: number
  damage: number
  overkill: number
  lethal: boolean
  gap_ms: number
  has_putrid: boolean
  has_rancid: boolean
  collision_partners?: string[]
  collision_gap_ms?: number | null
  is_regular?: boolean
  all_regulars_alive_at_pickup?: boolean | null
  dead_regulars_at_pickup?: string[]
  events_url: string
  replay_url: string
}

export type EggCarrierStatus =
  | 'ok'
  | 'missed_break'
  | 'hit_fail'
  | 'player_death'
  | 'wiped_before_break'
  | 'missed_alive'
  | 'missed_dead'

export interface EggCarrierEvent {
  id: string
  pull_num: number
  fight_id: number
  is_kill: boolean
  round_num: number
  player: string
  class: string
  target_id: number
  is_regular: boolean
  all_regulars_alive_at_pickup?: boolean | null
  dead_regulars_at_pickup?: string[]
  status: EggCarrierStatus
  break_reason: string
  player_was_dead: boolean
  pickup_rel_time: string
  pickup_rel_ms: number
  end_rel_time: string
  end_rel_ms: number
  break_rel_time: string
  timestamp: number
  duration_ms: number
  held_before_break_ms: number
  post_break_ms: number
  total_shell_dmg: number
  pre_dmg_sec: number[]
  post_break_dmg: number
  deaths_before: number
  events_url: string
  replay_url: string
}

export interface WaveFail {
  id: string
  player: string
  class: string
  target_id: number
  pull_num: number
  fight_id: number
  is_kill: boolean
  rel_time: string
  rel_ms: number
  timestamp: number
  deaths_before: number
  damage: number
  overkill: number
  lethal: boolean
  had_noxious_shell: boolean
  events_url: string
  replay_url: string
}

export interface TankFail {
  id: string
  kind: 'tentacle_aggro' | 'stone_venom_no_def'
  tank: string
  tank_class: string
  tank_id: number
  victim: string | null
  victim_class: string | null
  other_tank: string | null
  tank_was_dead: boolean
  min_hp_pct: number | null
  stacks: number | null
  lethal: boolean
  death_rel_time: string | null
  death_ability: string | null
  ready_defs?: string[]
  pot_ready?: boolean
  hs_ready?: boolean
  any_ready?: boolean
  pull_num: number
  fight_id: number
  is_kill: boolean
  rel_time: string
  rel_ms: number
  timestamp: number
  deaths_before: number
  events_url: string
  replay_url: string
}

export interface DefensiveEvent {
  id: string
  kind: 'death' | 'low_hp_spike'
  player: string
  class: string
  target_id: number
  pull_num: number
  fight_id: number
  is_kill: boolean
  rel_time: string
  rel_ms: number
  timestamp: number
  deaths_before: number
  trigger_ability: string
  hp_pct: number
  had_def_cd: boolean
  active_defs: string[]
  used_pot_here?: boolean
  used_hs_here?: boolean
  used_any_here?: boolean
  ready_defs?: string[]
  pot_ready?: boolean
  hs_ready?: boolean
  any_ready?: boolean
  pot_used_in_pull: boolean
  hs_used_in_pull: boolean
  events_url: string
  replay_url: string
}

export interface ConsumableUsage {
  pull_num: number
  fight_id: number
  player: string
  class: string
  target_id: number
  used_health_pot: boolean
  health_pot_count: number
  used_healthstone: boolean
  healthstone_count: number
  def_cd_casts: number
}

export interface HeartPlayerDamage {
  player: string
  class: string
  player_id: number
  heart_dmg: number
  heart_raw_dmg: number
  boss_dmg: number
  total_boss_dmg: number
  other_dmg: number
  heart_share_pct: number
  debris_hits: number
  switch_delay_ms?: number | null
  first_heart_spell?: string | null
  first_heart_switch_type?: 'direct' | 'aoe' | null
  was_dead_at_heart?: boolean
}

export interface HeartPhaseWindow {
  id: string
  pull_num: number
  fight_id: number
  is_kill: boolean
  window_num: number
  start_rel_time: string
  start_rel_ms: number
  duration_ms: number
  deaths_before: number
  first_switch_player?: string | null
  first_switch_spell?: string | null
  first_switch_rel_time?: string | null
  total_heart_dmg: number
  total_boss_dmg: number
  total_effective_dmg: number
  total_other_dmg: number
  debris_hits_total: number
  players: HeartPlayerDamage[]
  events_url: string
  replay_url: string
}

export type PhaseEventKind =
  | 'blight_vein_overlap'
  | 'malice_kick'
  | 'malice_missed'
  | 'vicious_echoes_kick'
  | 'vicious_echoes_missed'
  | 'falling_debris'
  | 'p2_avoidable'
  | 'p3_avoidable'

export interface KickerRef {
  player: string
  class: string
  spell: string
}

export interface PhaseEvent {
  id: string
  kind: PhaseEventKind
  phase: 'heart' | 'p2' | 'p3'
  side?: string | null
  side_tank_class?: string
  player: string
  class: string
  target_id: number
  ability: string
  detail: string | null
  ready_kickers?: KickerRef[]
  on_cd_kickers?: KickerRef[]
  gap_ms: number | null
  damage: number
  lethal: boolean
  pull_num: number
  fight_id: number
  is_kill: boolean
  rel_time: string
  rel_ms: number
  timestamp: number
  deaths_before: number
  events_url: string
  replay_url: string
}

export interface PhaseDamagePlayer {
  player: string
  class: string
  player_id: number
  damage: number
}

export interface WardenPullSummary {
  pull_num: number
  fight_id: number
  is_kill: boolean
  p2_start_rel_time: string
  deaths_at_p2_start: number
  warden_kills: number
  kill_sync_delta_ms: number | null
  total_warden_dmg: number
  players: PhaseDamagePlayer[]
  events_url: string
  replay_url: string
}

export interface P3PullSummary {
  pull_num: number
  fight_id: number
  is_kill: boolean
  p3_start_rel_time: string
  deaths_at_p3_start: number
  total_boss_dmg: number
  players: PhaseDamagePlayer[]
  events_url: string
  replay_url: string
}

export interface GroupSoakPlayerRef {
  player: string
  class: string
  player_id: number
  double_soak?: boolean
}

export interface SoakGroupDefinition {
  group_a_label: string
  group_a_class: string
  group_a_players: GroupSoakPlayerRef[]
  group_b_label: string
  group_b_class: string
  group_b_players: GroupSoakPlayerRef[]
}

export interface ReportSoakGroups {
  shattering: SoakGroupDefinition
  p1: SoakGroupDefinition
}

export interface GroupSoakEvent {
  id: string
  phase: 'shattering' | 'p1'
  pull_num: number
  fight_id: number
  is_kill: boolean
  soak_num: number
  rel_time: string
  rel_ms: number
  timestamp: number
  deaths_before: number
  expected_group: string
  expected_group_class: string
  total_soakers: number
  correct_count: number
  alternation_ok: boolean
  soakers: GroupSoakPlayerRef[]
  missed_alive: GroupSoakPlayerRef[]
  wrong_group: GroupSoakPlayerRef[]
  dead_expected: GroupSoakPlayerRef[]
  boss_tank_exempt?: GroupSoakPlayerRef | null
  events_url: string
  replay_url: string
}

export interface ReportData {
  code: string
  title: string
  label: string | null
  date_iso: string
  start_time_epoch_ms: number
  last_pull_end_epoch_ms?: number
  encounter_id: number
  boss_name: string
  difficulty: number
  analyzed_at: string
  pulls_total: number
  wipes_count: number
  kills_count: number
  tanks: TankActor[]
  healers?: HealerActor[]
  players: PlayerSummary[]
  egg_regular_carriers?: string[]
  soak_groups?: ReportSoakGroups
  removal_summary: {
    spectral_coils: number
    caustic_waves: number
    egg_collision?: number
    noxious_splash: number
    player_death: number
    other: number
  }
  pulls: PullData[]
  egg_fails: EggFail[]
  egg_carrier_events?: EggCarrierEvent[]
  wave_fails: WaveFail[]
  tank_fails: TankFail[]
  defensive_events: DefensiveEvent[]
  healer_emergency_events?: HealerEmergencyEvent[]
  healer_tank_soak_events?: HealerTankSoakEvent[]
  group_soaks?: GroupSoakEvent[]
  consumable_usage: ConsumableUsage[]
  heart_phases?: HeartPhaseWindow[]
  phase_events?: PhaseEvent[]
  warden_summaries?: WardenPullSummary[]
  p3_summaries?: P3PullSummary[]
}

export type TabKey = 'egg' | 'wave' | 'tank' | 'defensives' | 'healers' | 'heart' | 'phases' | 'pulls'
