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
SPELL_MOTHERS_WRATH_CAST = 1298367
SPELL_MOTHERS_WRATH_DMG = 1298369
SPELL_MEPHITIC_THRASH = 1296301
SPELL_RATTLER_SLAM = 1299206
SPELL_NECROTIC_VAPORS = 1286835

# Heart Phase, Phase 2 & Phase 3 mechanic IDs
SPELL_VENOMOUS_HEART_BUFF = 1299526
SPELL_RAGE_OF_THE_SHACKLED_BUFF = 1286860
SPELL_RAGE_OF_THE_SHACKLED_DMG = 1307367
SPELL_FALLING_DEBRIS = 1286885

SPELL_GRASPING_FANGS_DEBUFF = 1311611
SPELL_GRASPING_FANGS_DMG = 1311612
SPELL_BLIGHT_VEIN_DEBUFF = 1311609
SPELL_BLIGHT_VEIN_DMG = 1317955
SPELL_MALICE_CAST = 1290779
SPELL_MALICE_DMG = 1290991
SPELL_ACIDIC_BURST = 1301800
SPELL_ACIDIC_EXPULSION = 1313531
SPELL_PETRIFYING_STING = 1303414
SPELL_VIRULENT_SPIT = 1302982

NPC_ULATEK_GAME_ID = 257758
NPC_VENOMOUS_HEART_GAME_ID = 267460
NPC_DOOMSCALE_WARDEN_GAME_ID = 264045

P2_AVOIDABLE_IDS = {
    SPELL_ACIDIC_BURST,
    SPELL_ACIDIC_EXPULSION,
    SPELL_PETRIFYING_STING,
    SPELL_VIRULENT_SPIT,
}

# Dynamic name matching for Phase 3 abilities (auto-activates once logs reach P3)
P3_KICK_SPELL_NAMES = ("vicious echoes",)
P3_AVOIDABLE_SPELL_NAMES = ("serpent's bite", "volatile purge")

# Major raid damage spike abilities for Def CD / Pot / HS evaluation
RAID_SPIKE_ABILITY_IDS = {
    SPELL_MEPHITIC_THRASH,
    SPELL_SPECTRAL_COILS_DMG,
    SPELL_PUTRID_MEMBRANE_DMG,
    SPELL_CAUSTIC_WAVES,
    SPELL_NECROTIC_VAPORS,
    SPELL_RAGE_OF_THE_SHACKLED_DMG,
    SPELL_BLIGHT_VEIN_DMG,
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

# Healer Externals & Active Raid DR buffs (NO permanent passive auras like Devotion Aura!)
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
    "blistering scales",
    "intervene",
    "rewind",
    "rallying cry",
    "aura mastery",
    "ancestral protection totem",
    "luminous barrier",
}

# Personal & Tank Defensive Cooldowns (all classes, incl. Midnight Season 2)
PERSONAL_DEF_NAMES = {
    # Death Knight (Blood / Frost / Unholy) — Lichborne removed (no DR in Midnight!)
    "icebound fortitude",
    "vampiric blood",
    "anti-magic shell",
    "dancing rune weapon",
    "rune tap",
    "tombstone",
    "purgatory",
    "blood shield",
    # Monk (Brewmaster / Windwalker / Mistweaver) — Exploding Keg removed (only melee miss debuff, no spell/DoT DR)
    "fortifying brew",
    "celestial infusion",
    "celestial brew",
    "invoke niuzao, the black ox",
    "dampen harm",
    "diffuse magic",
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

# Consumable cooldowns (seconds)
HEALTH_POTION_CD_SEC = 300
DEMONIC_HEALTHSTONE_ID = 452930
DEMONIC_HEALTHSTONE_CD_SEC = 60

# Rotational / passive / non-cooldown buffs excluded from "was a Def-CD ready?" checks
EXCLUDED_FROM_READY_CHECK = {
    "bear form",
    "ignore pain",
    "blood shield",
    "defensive stance",
    "demon spikes",
    "cheat death",
    "cheating death",
    "purgatory",
    "feint",
    "blazing barrier",
    "prismatic barrier",
    "ice barrier",
    "crimson vial",
    "fade",
    "translucent image",
    "frenzied regeneration",
}

# Standard baseline cooldowns (in seconds) for personal Defensive CDs across all 13 classes
DEFENSIVE_COOLDOWNS_SEC: dict[str, int] = {
    # Death Knight
    "icebound fortitude": 120,
    "vampiric blood": 90,
    "anti-magic shell": 45,
    "dancing rune weapon": 120,
    "rune tap": 25,
    "tombstone": 60,
    # Monk
    "fortifying brew": 120,
    "celestial infusion": 60,
    "celestial brew": 60,
    "invoke niuzao, the black ox": 120,
    "dampen harm": 120,
    "diffuse magic": 90,
    "zen meditation": 180,
    "touch of karma": 90,
    # Paladin
    "divine shield": 300,
    "divine protection": 60,
    "ardent defender": 90,
    "guardian of ancient kings": 180,
    "shield of vengeance": 90,
    "lay on hands": 420,
    # Warrior
    "shield wall": 210,
    "last stand": 180,
    "spell reflection": 25,
    "die by the sword": 120,
    "enraged regeneration": 120,
    "demoralizing shout": 45,
    # Druid
    "barkskin": 60,
    "survival instincts": 180,
    "incarnation: guardian of ursoc": 180,
    # Demon Hunter
    "blur": 60,
    "netherwalk": 180,
    "metamorphosis": 180,
    "fiery brand": 60,
    "fel devastation": 40,
    # Mage
    "ice block": 240,
    "ice cold": 240,
    "greater invisibility": 120,
    "alter time": 50,
    "mirror image": 120,
    "mass barrier": 120,
    # Warlock
    "unending resolve": 180,
    "dark pact": 60,
    # Hunter
    "aspect of the turtle": 180,
    "survival of the fittest": 90,
    "exhilaration": 120,
    "fortitude of the bear": 120,
    # Shaman
    "astral shift": 90,
    "stone bulwark totem": 180,
    "earth elemental": 300,
    # Evoker
    "obsidian scales": 90,
    "renewing blaze": 60,
    # Priest
    "dispersion": 90,
    "desperate prayer": 90,
    "vampiric embrace": 120,
    # Rogue
    "cloak of shadows": 120,
    "evasion": 120,
}

# Guaranteed baseline personal defensives per WoW class (WCL Actor subType)
CLASS_BASELINE_DEFS: dict[str, tuple[str, ...]] = {
    "DeathKnight": ("Icebound Fortitude", "Anti-Magic Shell"),
    "DemonHunter": ("Blur",),
    "Druid": ("Barkskin",),
    "Evoker": ("Obsidian Scales",),
    "Hunter": ("Aspect of the Turtle", "Exhilaration"),
    "Mage": ("Alter Time",),
    "Monk": ("Fortifying Brew",),
    "Paladin": ("Divine Shield", "Divine Protection"),
    "Priest": ("Desperate Prayer",),
    "Rogue": ("Cloak of Shadows", "Evasion"),
    "Shaman": ("Astral Shift",),
    "Warlock": ("Unending Resolve",),
    "Warrior": ("Spell Reflection",),
}


# Damage-school scope per defensive CD / external:
#   "magic"    -> only mitigates Magic/Nature/Shadow/Fire/Frost/Arcane/Holy damage
#   "physical" -> only mitigates Physical/Melee damage
#   default    -> "all" (mitigates both Physical and Magic via universal DR, absorb, or max-HP)
DEFENSIVE_DAMAGE_SCOPE: dict[str, str] = {
    # Magic-only defensives & externals
    "anti-magic shell": "magic",
    "anti-magic zone": "magic",
    "diffuse magic": "magic",
    "cloak of shadows": "magic",
    "blessing of spellwarding": "magic",
    "spell reflection": "magic",
    "zen meditation": "magic",
    # Physical-only defensives & externals
    "evasion": "physical",
    "blessing of protection": "physical",
    "dancing rune weapon": "physical",
    "intervene": "physical",
    "blistering scales": "physical",
    "demon spikes": "physical",
}

KNOWN_MAGIC_ABILITY_IDS = {
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
}


def infer_damage_school(
    ability_id: int | None,
    ability_schools: dict[int, int] | None = None,
) -> str:
    """Return 'physical', 'magic', or 'all' from WCL school bitmask or known Ula'tek spell IDs."""
    if ability_id is None:
        return "all"
    if ability_schools and ability_id in ability_schools:
        mask = int(ability_schools[ability_id] or 0)
        if mask == 1:
            return "physical"
        if mask > 1:
            if mask & 1:
                return "all"  # Hybrid Physical+Magic
            return "magic"
    if ability_id == SPELL_MELEE:
        return "physical"
    if ability_id in KNOWN_MAGIC_ABILITY_IDS:
        return "magic"
    return "all"


def defensive_mitigates(ability_name: str, damage_school: str) -> bool:
    """True if this defensive buff/external actually reduces damage of `damage_school`."""
    if damage_school == "all":
        return True
    scope = DEFENSIVE_DAMAGE_SCOPE.get((ability_name or "").strip().lower(), "all")
    if scope == "all":
        return True
    return scope == damage_school


def get_defensive_cooldown_ms(ability_name: str) -> int:
    low = (ability_name or "").strip().lower()
    return DEFENSIVE_COOLDOWNS_SEC.get(low, 120) * 1000


def is_trackable_personal_def(ability_name: str) -> bool:
    low = (ability_name or "").strip().lower()
    return low in PERSONAL_DEF_NAMES and low not in EXCLUDED_FROM_READY_CHECK


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
