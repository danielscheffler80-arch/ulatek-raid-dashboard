/** Spell IDs, defensive catalogs, damage schools, and interrupt cooldowns for Ula'tek Mythic. */

export const ULATEK_ENCOUNTER_ID = 3492
export const MYTHIC_DIFFICULTY = 5

export const SPELL_MELEE = 1
export const SPELL_NOXIOUS_SHELL_DEBUFF = 1307612
export const SPELL_NOXIOUS_SHELL_DMG = 1307617
export const SPELL_CAUSTIC_WAVES = 1292403
export const SPELL_NOXIOUS_SPLASH = 1307635
export const SPELL_SPECTRAL_COILS_CAST = 1299010
export const SPELL_SPECTRAL_COILS_DMG = 1287265
export const SPELL_SOUL_CONSTRICTOR = 1300685
export const SPELL_PUTRID_MEMBRANE_DEBUFF = 1301268
export const SPELL_PUTRID_MEMBRANE_DMG = 1308275
export const SPELL_RANCID_YOLK = 1312150
export const SPELL_STONE_VENOM_DEBUFF = 1298417
export const SPELL_STONE_VENOM_DMG = 1298418
export const SPELL_MOTHERS_WRATH_CAST = 1298367
export const SPELL_MOTHERS_WRATH_DMG = 1298369
export const SPELL_MEPHITIC_THRASH = 1296301
export const SPELL_RATTLER_SLAM = 1299206
export const SPELL_NECROTIC_VAPORS = 1286835

export const SPELL_VENOMOUS_HEART_BUFF = 1299526
export const SPELL_RAGE_OF_THE_SHACKLED_BUFF = 1286860
export const SPELL_RAGE_OF_THE_SHACKLED_DMG = 1307367
export const SPELL_FALLING_DEBRIS = 1286885

export const SPELL_GRASPING_FANGS_DEBUFF = 1311611
export const SPELL_GRASPING_FANGS_DMG = 1311612
export const SPELL_BLIGHT_VEIN_DMG = 1317955
export const SPELL_MALICE_CAST = 1290779
export const SPELL_MALICE_DMG = 1290991
export const SPELL_ACIDIC_BURST = 1301800
export const SPELL_ACIDIC_EXPULSION = 1313531
export const SPELL_PETRIFYING_STING = 1303414
export const SPELL_VIRULENT_SPIT = 1302982

export const NPC_ULATEK_GAME_ID = 257758
export const NPC_VENOMOUS_HEART_GAME_ID = 267460
export const NPC_DOOMSCALE_WARDEN_GAME_ID = 264045

export const P2_AVOIDABLE_IDS = new Set([
  SPELL_ACIDIC_BURST,
  SPELL_ACIDIC_EXPULSION,
  SPELL_PETRIFYING_STING,
  SPELL_VIRULENT_SPIT,
])

export const P3_KICK_SPELL_NAMES = ['vicious echoes']
export const P3_AVOIDABLE_SPELL_NAMES = ["serpent's bite", 'volatile purge']

export const CORE_MECHANIC_IDS = [
  SPELL_NOXIOUS_SHELL_DEBUFF,
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
  SPELL_ACIDIC_BURST,
  SPELL_ACIDIC_EXPULSION,
  SPELL_PETRIFYING_STING,
  SPELL_VIRULENT_SPIT,
]

export const RAID_SPIKE_ABILITY_IDS = new Set([
  SPELL_MEPHITIC_THRASH,
  SPELL_SPECTRAL_COILS_DMG,
  SPELL_PUTRID_MEMBRANE_DMG,
  SPELL_CAUSTIC_WAVES,
  SPELL_NECROTIC_VAPORS,
  SPELL_RAGE_OF_THE_SHACKLED_DMG,
  SPELL_BLIGHT_VEIN_DMG,
])

export const HEALTH_POTION_IDS = new Set([1234768, 1295247, 431416, 431418, 370511])
export const HEALTHSTONE_IDS = new Set([6262, 452930, 387636])
export const HEALTH_POTION_CD_MS = 300_000
export const DEMONIC_HEALTHSTONE_ID = 452930
export const DEMONIC_HEALTHSTONE_CD_MS = 60_000

export const EXTERNAL_DEF_NAMES = new Set([
  'pain suppression',
  'guardian spirit',
  'ironbark',
  'life cocoon',
  'blessing of sacrifice',
  'blessing of protection',
  'blessing of spellwarding',
  'time dilation',
  'spirit link totem',
  'power word: barrier',
  'anti-magic zone',
  'earthen wall totem',
  'darkness',
  'zephyr',
  'rescue',
  'twin guardian',
  'blistering scales',
  'intervene',
  'rewind',
  'rallying cry',
  'aura mastery',
  'ancestral protection totem',
  'luminous barrier',
])

export const PERSONAL_DEF_NAMES = new Set([
  'icebound fortitude',
  'vampiric blood',
  'anti-magic shell',
  'dancing rune weapon',
  'rune tap',
  'tombstone',
  'purgatory',
  'blood shield',
  'fortifying brew',
  'celestial infusion',
  'celestial brew',
  'invoke niuzao, the black ox',
  'dampen harm',
  'diffuse magic',
  'zen meditation',
  'touch of karma',
  'divine shield',
  'divine protection',
  'ardent defender',
  'guardian of ancient kings',
  'shield of vengeance',
  'lay on hands',
  'shield wall',
  'last stand',
  'spell reflection',
  'die by the sword',
  'enraged regeneration',
  'defensive stance',
  'ignore pain',
  'demoralizing shout',
  'barkskin',
  'survival instincts',
  'incarnation: guardian of ursoc',
  'frenzied regeneration',
  'bear form',
  'blur',
  'netherwalk',
  'metamorphosis',
  'fiery brand',
  'demon spikes',
  'fel devastation',
  'ice block',
  'ice cold',
  'greater invisibility',
  'alter time',
  'mirror image',
  'blazing barrier',
  'prismatic barrier',
  'ice barrier',
  'mass barrier',
  'unending resolve',
  'dark pact',
  'aspect of the turtle',
  'survival of the fittest',
  'exhilaration',
  'fortitude of the bear',
  'astral shift',
  'stone bulwark totem',
  'earth elemental',
  'obsidian scales',
  'renewing blaze',
  'dispersion',
  'desperate prayer',
  'fade',
  'translucent image',
  'vampiric embrace',
  'cloak of shadows',
  'evasion',
  'feint',
  'crimson vial',
  'cheat death',
  'cheating death',
])

export const ALL_DEFENSIVE_BUFF_NAMES = new Set([...EXTERNAL_DEF_NAMES, ...PERSONAL_DEF_NAMES])
const TANK_EXCLUDED = new Set(['bear form', 'ignore pain', 'blood shield'])
const EXCLUDED_FROM_READY = new Set([
  'bear form',
  'ignore pain',
  'blood shield',
  'defensive stance',
  'demon spikes',
  'cheat death',
  'cheating death',
  'purgatory',
  'feint',
  'blazing barrier',
  'prismatic barrier',
  'ice barrier',
  'crimson vial',
  'fade',
  'translucent image',
  'frenzied regeneration',
])

export const DEFENSIVE_COOLDOWNS_SEC: Record<string, number> = {
  'icebound fortitude': 120,
  'vampiric blood': 90,
  'anti-magic shell': 45,
  'dancing rune weapon': 120,
  'rune tap': 25,
  tombstone: 60,
  'fortifying brew': 120,
  'celestial infusion': 60,
  'celestial brew': 60,
  'invoke niuzao, the black ox': 120,
  'dampen harm': 120,
  'diffuse magic': 90,
  'zen meditation': 180,
  'touch of karma': 90,
  'divine shield': 300,
  'divine protection': 60,
  'ardent defender': 90,
  'guardian of ancient kings': 180,
  'shield of vengeance': 90,
  'lay on hands': 420,
  'shield wall': 210,
  'last stand': 180,
  'spell reflection': 25,
  'die by the sword': 120,
  'enraged regeneration': 120,
  'demoralizing shout': 45,
  barkskin: 60,
  'survival instincts': 180,
  'incarnation: guardian of ursoc': 180,
  blur: 60,
  netherwalk: 180,
  metamorphosis: 180,
  'fiery brand': 60,
  'fel devastation': 40,
  'ice block': 240,
  'ice cold': 240,
  'greater invisibility': 120,
  'alter time': 50,
  'mirror image': 120,
  'mass barrier': 120,
  'unending resolve': 180,
  'dark pact': 60,
  'aspect of the turtle': 180,
  'survival of the fittest': 90,
  exhilaration: 120,
  'fortitude of the bear': 120,
  'astral shift': 90,
  'stone bulwark totem': 180,
  'earth elemental': 300,
  'obsidian scales': 90,
  'renewing blaze': 60,
  dispersion: 90,
  'desperate prayer': 90,
  'vampiric embrace': 120,
  'cloak of shadows': 120,
  evasion: 120,
}

export const CLASS_BASELINE_DEFS: Record<string, string[]> = {
  DeathKnight: ['Icebound Fortitude', 'Anti-Magic Shell'],
  DemonHunter: ['Blur'],
  Druid: ['Barkskin'],
  Evoker: ['Obsidian Scales'],
  Hunter: ['Aspect of the Turtle', 'Exhilaration'],
  Mage: ['Alter Time'],
  Monk: ['Fortifying Brew'],
  Paladin: ['Divine Shield', 'Divine Protection'],
  Priest: ['Desperate Prayer'],
  Rogue: ['Cloak of Shadows', 'Evasion'],
  Shaman: ['Astral Shift'],
  Warlock: ['Unending Resolve'],
  Warrior: ['Spell Reflection'],
}

export const DEFENSIVE_DAMAGE_SCOPE: Record<string, 'magic' | 'physical'> = {
  'anti-magic shell': 'magic',
  'anti-magic zone': 'magic',
  'diffuse magic': 'magic',
  'cloak of shadows': 'magic',
  'blessing of spellwarding': 'magic',
  'spell reflection': 'magic',
  'zen meditation': 'magic',
  evasion: 'physical',
  'blessing of protection': 'physical',
  'dancing rune weapon': 'physical',
  intervene: 'physical',
  'blistering scales': 'physical',
  'demon spikes': 'physical',
}

export const KNOWN_MAGIC_ABILITY_IDS = new Set([
  SPELL_NOXIOUS_SHELL_DMG,
  SPELL_CAUSTIC_WAVES,
  SPELL_NOXIOUS_SPLASH,
  SPELL_SPECTRAL_COILS_DMG,
  SPELL_PUTRID_MEMBRANE_DMG,
  SPELL_STONE_VENOM_DMG,
  SPELL_MOTHERS_WRATH_DMG,
  SPELL_MEPHITIC_THRASH,
  SPELL_NECROTIC_VAPORS,
  SPELL_RAGE_OF_THE_SHACKLED_DMG,
  SPELL_FALLING_DEBRIS,
  SPELL_GRASPING_FANGS_DMG,
  SPELL_BLIGHT_VEIN_DMG,
  SPELL_MALICE_DMG,
  SPELL_ACIDIC_BURST,
  SPELL_ACIDIC_EXPULSION,
  SPELL_PETRIFYING_STING,
  SPELL_VIRULENT_SPIT,
])

export const INTERRUPT_COOLDOWNS_SEC: Record<string, number> = {
  'wind shear': 12,
  kick: 15,
  'spear hand strike': 15,
  'mind freeze': 15,
  rebuke: 15,
  pummel: 15,
  'skull bash': 15,
  disrupt: 15,
  muzzle: 15,
  quell: 20,
  counterspell: 24,
  'counter shot': 24,
  'spell lock': 24,
  'optical blast': 24,
  'axe toss': 30,
  silence: 45,
  'solar beam': 60,
}

export const CLASS_DEFAULT_INTERRUPT: Record<string, [string, number]> = {
  DeathKnight: ['Mind Freeze', 15],
  DemonHunter: ['Disrupt', 15],
  Hunter: ['Counter Shot', 24],
  Mage: ['Counterspell', 24],
  Rogue: ['Kick', 15],
  Shaman: ['Wind Shear', 12],
  Warrior: ['Pummel', 15],
  Evoker: ['Quell', 20],
  Warlock: ['Spell Lock', 24],
}

export const TANK_DEFAULT_INTERRUPT: Record<string, [string, number]> = {
  Monk: ['Spear Hand Strike', 15],
  Paladin: ['Rebuke', 15],
  Druid: ['Skull Bash', 15],
}

export function isHealthPotion(abilityId: number | undefined, abilityName: string): boolean {
  if (abilityId !== undefined && HEALTH_POTION_IDS.has(abilityId)) return true
  const low = (abilityName || '').toLowerCase()
  return low.includes('health potion') || low.includes('healing potion') || low.includes("cavedweller's delight")
}

export function isHealthstone(abilityId: number | undefined, abilityName: string): boolean {
  if (abilityId !== undefined && HEALTHSTONE_IDS.has(abilityId)) return true
  return (abilityName || '').toLowerCase().includes('healthstone')
}

export function isDefensiveBuff(abilityName: string, forTankStoneVenom = false): boolean {
  const low = (abilityName || '').trim().toLowerCase()
  if (!low || !ALL_DEFENSIVE_BUFF_NAMES.has(low)) return false
  if (forTankStoneVenom && TANK_EXCLUDED.has(low)) return false
  return true
}

export function isTrackablePersonalDef(abilityName: string): boolean {
  const low = (abilityName || '').trim().toLowerCase()
  return PERSONAL_DEF_NAMES.has(low) && !EXCLUDED_FROM_READY.has(low)
}

export function getDefensiveCooldownMs(abilityName: string): number {
  const low = (abilityName || '').trim().toLowerCase()
  return (DEFENSIVE_COOLDOWNS_SEC[low] ?? 120) * 1000
}

export function inferDamageSchool(
  abilityId: number | undefined,
  abilitySchools?: Record<number, number>,
): 'physical' | 'magic' | 'all' {
  if (abilityId === undefined) return 'all'
  if (abilitySchools && abilityId in abilitySchools) {
    const mask = Number(abilitySchools[abilityId] || 0)
    if (mask === 1) return 'physical'
    if (mask > 1) return mask & 1 ? 'all' : 'magic'
  }
  if (abilityId === SPELL_MELEE) return 'physical'
  if (KNOWN_MAGIC_ABILITY_IDS.has(abilityId)) return 'magic'
  return 'all'
}

export function defensiveMitigates(abilityName: string, damageSchool: 'physical' | 'magic' | 'all'): boolean {
  if (damageSchool === 'all') return true
  const scope = DEFENSIVE_DAMAGE_SCOPE[(abilityName || '').trim().toLowerCase()]
  if (!scope) return true
  return scope === damageSchool
}

export function isInterruptSpell(abilityName: string): boolean {
  return (abilityName || '').trim().toLowerCase() in INTERRUPT_COOLDOWNS_SEC
}

export function getInterruptCooldownMs(abilityName: string): number {
  return (INTERRUPT_COOLDOWNS_SEC[(abilityName || '').trim().toLowerCase()] ?? 15) * 1000
}
