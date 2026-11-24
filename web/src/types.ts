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
}

export type TabKey = 'egg' | 'wave' | 'tank' | 'defensives' | 'pulls'
