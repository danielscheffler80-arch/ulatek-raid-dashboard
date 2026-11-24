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

export interface PlayerSummary {
  id: number
  name: string
  class: string
  is_tank: boolean
  pulls_present: number
}

export interface PullData {
  pull_num: number
  fight_id: number
  is_kill: boolean
  boss_percentage: number
  duration_ms: number
  start_time: number
  end_time: number
  deaths_total: number
  report_url: string
}

export interface EggFail {
  id: string
  kind: 'caustic_waves' | 'noxious_splash'
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

export interface ReportData {
  code: string
  title: string
  label: string | null
  date_iso: string
  start_time_epoch_ms: number
  encounter_id: number
  boss_name: string
  difficulty: number
  analyzed_at: string
  pulls_total: number
  wipes_count: number
  kills_count: number
  tanks: TankActor[]
  players: PlayerSummary[]
  removal_summary: {
    spectral_coils: number
    caustic_waves: number
    noxious_splash: number
    player_death: number
    other: number
  }
  pulls: PullData[]
  egg_fails: EggFail[]
  wave_fails: WaveFail[]
  tank_fails: TankFail[]
  defensive_events: DefensiveEvent[]
  consumable_usage: ConsumableUsage[]
  heart_phases?: HeartPhaseWindow[]
  phase_events?: PhaseEvent[]
  warden_summaries?: WardenPullSummary[]
  p3_summaries?: P3PullSummary[]
}

export type TabKey = 'egg' | 'wave' | 'tank' | 'defensives' | 'heart' | 'phases' | 'pulls'
