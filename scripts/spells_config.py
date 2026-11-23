"""Spell IDs and defensive/consumable catalogs for Ula'tek Mythic analysis."""

ULATEK_ENCOUNTER_ID = 3492
MYTHIC_DIFFICULTY = 5

# Core Ula'tek mechanic spell IDs
SPELL_MELEE = 1
SPELL_NOXIOUS_SHELL_DEBUFF = 1307612
SPELL_NOXIOUS_SHELL_DMG = 1307617
SPELL_CAUSTIC_WAVES = 1292403
SPELL_NOXIOUS_SPLASH = 1307635
SPELL_SPECTRAL_COILS_CAST = 1299010
SPELL_SPECTRAL_COILS_DMG = 1287265
SPELL_SOUL_CONSTRICTOR = 1300685
SPELL_PUTRID_MEMBRANE_DEBUFF = 1301268
SPELL_PUTRID_MEMBRANE_DMG = 1308275
SPELL_RANCID_YOLK = 1312150
SPELL_STONE_VENOM_DEBUFF = 1298417
SPELL_STONE_VENOM_DMG = 1298418
SPELL_MEPHITIC_THRASH = 1296301
SPELL_RATTLER_SLAM = 1299206
SPELL_NECROTIC_VAPORS = 1286835

# Major raid damage spike abilities for Def CD / Pot / HS evaluation
RAID_SPIKE_ABILITY_IDS = {
    SPELL_MEPHITIC_THRASH,
    SPELL_SPECTRAL_COILS_DMG,
    SPELL_PUTRID_MEMBRANE_DMG,
    SPELL_CAUSTIC_WAVES,
    SPELL_NECROTIC_VAPORS,
}

# Health Potions (Midnight + TWW + generic name matching)
HEALTH_POTION_IDS = {
    1234768,  # Silvermoon Health Potion
    1295247,  # Concentrated Silvermoon Health Potion
    431416,   # Algari Healing Potion
    431418,   # Cavedweller's Delight
    370511,   # Refreshing Healing Potion
}
HEALTH_POTION_NAME_SUBSTRINGS = (
    "health potion",
    "healing potion",
    "cavedweller's delight",
)

# Healthstones
HEALTHSTONE_IDS = {
    6262,     # Healthstone
    452930,   # Demonic Healthstone
    387636,   # Soulburn: Healthstone
}
HEALTHSTONE_NAME_SUBSTRINGS = (
    "healthstone",
)

# Healer Externals & Raid DR buffs
EXTERNAL_DEF_NAMES = {
    "pain suppression",
    "guardian spirit",
    "ironbark",
    "life cocoon",
    "blessing of sacrifice",
    "blessing of protection",
    "blessing of spellwarding",
    "time dilation",
    "spirit link totem",
    "power word: barrier",
    "anti-magic zone",
    "earthen wall totem",
    "darkness",
    "zephyr",
    "rescue",
    "twin guardian",
    "rallying cry",
    "devotion aura",
    "aura mastery",
    "ancestral protection totem",
    "luminous barrier",
}

# Personal & Tank Defensive Cooldowns (all classes)
PERSONAL_DEF_NAMES = {
    # Death Knight (Blood / Frost / Unholy)
    "icebound fortitude",
    "vampiric blood",
    "anti-magic shell",
    "dancing rune weapon",
    "rune tap",
    "lichborne",
    "tombstone",
    "blood shield",
    # Monk (Brewmaster / Windwalker / Mistweaver)
    "fortifying brew",
    "dampen harm",
    "diffuse magic",
    "celestial brew",
    "zen meditation",
    "touch of karma",
    # Paladin
    "divine shield",
    "divine protection",
    "ardent defender",
    "guardian of ancient kings",
    "shield of vengeance",
    "lay on hands",
    # Warrior
    "shield wall",
    "last stand",
    "spell reflection",
    "die by the sword",
    "enraged regeneration",
    "defensive stance",
    "ignore pain",
    "demoralizing shout",
    # Druid
    "barkskin",
    "survival instincts",
    "incarnation: guardian of ursoc",
    "frenzied regeneration",
    "bear form",
    # Demon Hunter
    "blur",
    "netherwalk",
    "metamorphosis",
    "fiery brand",
    "demon spikes",
    "fel devastation",
    # Mage
    "ice block",
    "ice cold",
    "greater invisibility",
    "alter time",
    "mirror image",
    "blazing barrier",
    "prismatic barrier",
    "ice barrier",
    "mass barrier",
    # Warlock
    "unending resolve",
    "dark pact",
    # Hunter
    "aspect of the turtle",
    "survival of the fittest",
    "exhilaration",
    "fortitude of the bear",
    # Shaman
    "astral shift",
    "stone bulwark totem",
    "earth elemental",
    # Evoker
    "obsidian scales",
    "renewing blaze",
    # Priest
    "dispersion",
    "desperate prayer",
    "fade",
    "translucent image",
    "vampiric embrace",
    # Rogue
    "cloak of shadows",
    "evasion",
    "feint",
    "crimson vial",
    "cheat death",
    "cheating death",
}

ALL_DEFENSIVE_BUFF_NAMES = EXTERNAL_DEF_NAMES | PERSONAL_DEF_NAMES

# Tank-specific Stone Venom check excludes ultra-high-uptime rotational buffs like Ironfur/Bone Shield/Stagger
TANK_DEF_OR_EXTERNAL_NAMES = (ALL_DEFENSIVE_BUFF_NAMES - {"bear form", "ignore pain", "blood shield"})


def is_health_potion(ability_id: int | None, ability_name: str) -> bool:
    if ability_id in HEALTH_POTION_IDS:
        return True
    low = (ability_name or "").lower()
    return any(s in low for s in HEALTH_POTION_NAME_SUBSTRINGS)


def is_healthstone(ability_id: int | None, ability_name: str) -> bool:
    if ability_id in HEALTHSTONE_IDS:
        return True
    low = (ability_name or "").lower()
    return any(s in low for s in HEALTHSTONE_NAME_SUBSTRINGS)


def is_defensive_buff(ability_name: str, *, for_tank_stone_venom: bool = False) -> bool:
    low = (ability_name or "").strip().lower()
    if not low:
        return False
    if for_tank_stone_venom:
        return low in TANK_DEF_OR_EXTERNAL_NAMES
    return low in ALL_DEFENSIVE_BUFF_NAMES
