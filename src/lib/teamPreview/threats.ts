import { getTypeFromLabel, type PokemonType } from "../../data/typeChart";
import { getMultiplier } from "../effectiveness";
import {
  getBelievedMoves,
  getDamagePreview,
  getEffectiveSpeed,
  type BattleCombatantState,
  type BattleState,
  type BattleStateMemberInput,
} from "../engine";
import { getMoveRoleTags } from "../engine/moveRegistry";
import type {
  EnemyThreat,
  PreviewCombatantMeta,
  PreviewDamageSnapshot,
  PreviewMoveBelief,
  PreviewRoleTag,
  PreviewSupportFlags,
  PreviewThreatProfile,
  PreviewWeather,
} from "./types";

const WEATHER_SETTER_ABILITIES: Record<PreviewWeather, string[]> = {
  rain: ["drizzle"],
  sun: ["drought"],
  sand: ["sandstream"],
  snow: ["snowwarning"],
};

const WEATHER_ABUSER_ABILITIES: Record<PreviewWeather, string[]> = {
  rain: ["swiftswim", "raindish", "hydration"],
  sun: ["chlorophyll", "solarpower"],
  sand: ["sandrush", "sandforce", "sandveil"],
  snow: ["slushrush", "icebody", "snowcloak"],
};

const STAT_DROP_PUNISH_ABILITIES = new Set(["defiant", "competitive", "contrary", "mirrorarmor"]);

const SUPPORT_FLAG_TAGS: Array<
  Exclude<keyof PreviewSupportFlags, "weatherSetting" | "weatherAbuse">
> = [
  "priority",
  "fakeOut",
  "tailwind",
  "trickRoom",
  "speedControl",
  "redirection",
  "wideGuard",
  "quickGuard",
  "taunt",
  "encore",
  "disable",
  "helpingHand",
  "setup",
  "healing",
  "status",
];

function normalizeKey(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createSupportFlags(): PreviewSupportFlags {
  return {
    priority: 0,
    fakeOut: 0,
    tailwind: 0,
    trickRoom: 0,
    speedControl: 0,
    redirection: 0,
    wideGuard: 0,
    quickGuard: 0,
    taunt: 0,
    encore: 0,
    disable: 0,
    helpingHand: 0,
    weatherSetting: 0,
    weatherAbuse: 0,
    setup: 0,
    healing: 0,
    status: 0,
  };
}

function applyAbilityRoleTags(
  tags: Set<PreviewRoleTag>,
  roleConfidence: Partial<Record<PreviewRoleTag, number>>,
  abilityKey: string,
) {
  if (abilityKey === "intimidate") {
    tags.add("intimidate");
    tags.add("statDropPressure");
    roleConfidence.intimidate = 1;
    roleConfidence.statDropPressure = Math.max(roleConfidence.statDropPressure ?? 0, 0.9);
  }

  if (STAT_DROP_PUNISH_ABILITIES.has(abilityKey)) {
    tags.add("statDropPunisher");
    roleConfidence.statDropPunisher = 1;
  }

  for (const [weather, abilities] of Object.entries(WEATHER_SETTER_ABILITIES) as Array<[PreviewWeather, string[]]>) {
    if (!abilities.includes(abilityKey)) {
      continue;
    }

    const tag =
      weather === "rain"
        ? "weatherRain"
        : weather === "sun"
          ? "weatherSun"
          : weather === "sand"
            ? "weatherSand"
            : "weatherSnow";
    tags.add(tag);
    roleConfidence[tag] = 1;
  }

  for (const [weather, abilities] of Object.entries(WEATHER_ABUSER_ABILITIES) as Array<[PreviewWeather, string[]]>) {
    if (!abilities.includes(abilityKey)) {
      continue;
    }

    const tag =
      weather === "rain"
        ? "weatherRainAbuser"
        : weather === "sun"
          ? "weatherSunAbuser"
          : weather === "sand"
            ? "weatherSandAbuser"
            : "weatherSnowAbuser";
    tags.add(tag);
    roleConfidence[tag] = Math.max(roleConfidence[tag] ?? 0, 0.9);
  }
}

function isStabMove(combatant: BattleCombatantState, type: PokemonType | null) {
  return Boolean(type && combatant.pokemon.types.some((entry) => normalizeKey(entry) === type));
}

function buildBelievedMoves(combatant: BattleCombatantState) {
  return getBelievedMoves(combatant, { topN: 6, minimumCandidateWeight: 0.08 }).map<PreviewMoveBelief>((entry) => {
    const roleTags = getMoveRoleTags(entry.move) as PreviewRoleTag[];
    const stab = isStabMove(combatant, entry.move.type);
    const weightedPower =
      (entry.move.basePower ?? 0) *
      (0.4 + entry.certainty * 0.6) *
      (stab ? 1.2 : 1) *
      (entry.move.isSpreadMove ? 1.08 : 1);

    return {
      ...entry,
      roleTags,
      stab,
      weightedPower,
    };
  });
}

function getOffensiveLean(damagingBeliefs: PreviewMoveBelief[]) {
  const physical = damagingBeliefs
    .filter((entry) => entry.move.category === "physical")
    .reduce((sum, entry) => sum + entry.weightedPower, 0);
  const special = damagingBeliefs
    .filter((entry) => entry.move.category === "special")
    .reduce((sum, entry) => sum + entry.weightedPower, 0);
  const total = physical + special;

  if (total < 20) {
    return "support" as const;
  }
  if (physical / total >= 0.62) {
    return "physical" as const;
  }
  if (special / total >= 0.62) {
    return "special" as const;
  }
  return "mixed" as const;
}

function buildLikelyAttackTypes(damagingBeliefs: PreviewMoveBelief[]) {
  const byType = new Map<PokemonType, { type: PokemonType; weight: number; stabWeight: number }>();
  for (const entry of damagingBeliefs) {
    if (!entry.move.type) {
      continue;
    }
    const existing = byType.get(entry.move.type) ?? { type: entry.move.type, weight: 0, stabWeight: 0 };
    existing.weight += entry.weightedPower;
    existing.stabWeight += entry.weightedPower * (entry.stab ? 1 : 0);
    byType.set(entry.move.type, existing);
  }

  return [...byType.values()]
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 4);
}

export function hasWeatherSetter(meta: PreviewCombatantMeta, weather: PreviewWeather) {
  return (
    (weather === "rain" && meta.roleTags.has("weatherRain")) ||
    (weather === "sun" && meta.roleTags.has("weatherSun")) ||
    (weather === "sand" && meta.roleTags.has("weatherSand")) ||
    (weather === "snow" && meta.roleTags.has("weatherSnow"))
  );
}

export function hasWeatherAbuser(meta: PreviewCombatantMeta, weather: PreviewWeather) {
  return (
    (weather === "rain" && meta.roleTags.has("weatherRainAbuser")) ||
    (weather === "sun" && meta.roleTags.has("weatherSunAbuser")) ||
    (weather === "sand" && meta.roleTags.has("weatherSandAbuser")) ||
    (weather === "snow" && meta.roleTags.has("weatherSnowAbuser"))
  );
}

export function getWeatherSetterKinds(meta: PreviewCombatantMeta) {
  const weather: PreviewWeather[] = [];
  if (meta.roleTags.has("weatherRain")) {
    weather.push("rain");
  }
  if (meta.roleTags.has("weatherSun")) {
    weather.push("sun");
  }
  if (meta.roleTags.has("weatherSand")) {
    weather.push("sand");
  }
  if (meta.roleTags.has("weatherSnow")) {
    weather.push("snow");
  }
  return weather;
}

export function getWeakTypes(meta: PreviewCombatantMeta) {
  if (!meta.primaryType) {
    return [] as PokemonType[];
  }
  const primaryType = meta.primaryType;
  const secondaryType = meta.secondaryType ?? undefined;

  const attackTypes = [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
    "fairy",
  ] as const;

  return attackTypes.filter((attackType) => getMultiplier(attackType, primaryType, secondaryType) > 1);
}

export function buildPreviewCombatantMetas(state: BattleState, members: BattleStateMemberInput[]) {
  return members
    .map<PreviewCombatantMeta | null>((member) => {
      const combatant = state.combatants[member.id];
      if (!combatant) {
        return null;
      }

      const primaryType = getTypeFromLabel(combatant.pokemon.types[0]) ?? null;
      const secondaryType = getTypeFromLabel(combatant.pokemon.types[1] ?? "") ?? null;
      const speed = getEffectiveSpeed(state, combatant.id);
      const bulkyScore = combatant.maxHp * ((combatant.pokemon.baseStats.def + combatant.pokemon.baseStats.spd) / 2);
      const abilityKey = normalizeKey(combatant.abilityName ?? combatant.abilityId);
      const roleTags = new Set<PreviewRoleTag>();
      const roleConfidence: Partial<Record<PreviewRoleTag, number>> = {};
      applyAbilityRoleTags(roleTags, roleConfidence, abilityKey);

      const believedMoves = buildBelievedMoves(combatant);
      for (const entry of believedMoves) {
        const certainty = entry.inferred ? entry.certainty * 0.85 : entry.certainty;
        for (const roleTag of entry.roleTags) {
          roleConfidence[roleTag] = Math.max(roleConfidence[roleTag] ?? 0, certainty);
          if (certainty >= 0.45 || entry.move.source !== "candidate") {
            roleTags.add(roleTag);
          }
        }
      }

      const damagingBeliefs = believedMoves.filter((entry) => entry.move.category !== null);
      const damagingMoves = damagingBeliefs
        .filter((entry) => entry.certainty >= 0.45 || entry.move.source !== "candidate")
        .map((entry) => entry.move);
      const dedupedDamagingMoves = [...new Map(damagingMoves.map((move) => [move.id, move])).values()];
      const offensiveLean = getOffensiveLean(damagingBeliefs);

      if (speed <= 95 && damagingBeliefs.length > 0) {
        roleTags.add("slowBreaker");
        roleConfidence.slowBreaker = Math.max(roleConfidence.slowBreaker ?? 0, 0.7);
      }
      if (speed >= 140 && damagingBeliefs.length > 0) {
        roleTags.add("fastPressure");
        roleConfidence.fastPressure = Math.max(roleConfidence.fastPressure ?? 0, 0.7);
      }

      const supportFlags = createSupportFlags();
      for (const tag of SUPPORT_FLAG_TAGS) {
        supportFlags[tag] = clamp(roleConfidence[tag] ?? 0, 0, 1);
      }
      supportFlags.weatherSetting = clamp(
        Math.max(
          roleConfidence.weatherRain ?? 0,
          roleConfidence.weatherSun ?? 0,
          roleConfidence.weatherSand ?? 0,
          roleConfidence.weatherSnow ?? 0,
        ),
        0,
        1,
      );
      supportFlags.weatherAbuse = clamp(
        Math.max(
          roleConfidence.weatherRainAbuser ?? 0,
          roleConfidence.weatherSunAbuser ?? 0,
          roleConfidence.weatherSandAbuser ?? 0,
          roleConfidence.weatherSnowAbuser ?? 0,
        ),
        0,
        1,
      );

      return {
        member,
        combatant,
        roleTags,
        roleConfidence,
        supportFlags,
        abilityKey,
        itemKey: normalizeKey(combatant.itemName ?? combatant.itemId),
        speed,
        believedMoves,
        damagingBeliefs,
        damagingMoves: dedupedDamagingMoves,
        likelyAttackTypes: buildLikelyAttackTypes(damagingBeliefs),
        offensiveLean,
        primaryType,
        secondaryType,
        bulkyScore,
      } satisfies PreviewCombatantMeta;
    })
    .filter((entry): entry is PreviewCombatantMeta => Boolean(entry));
}

export function buildPreviewThreatProfile(team: PreviewCombatantMeta[]) {
  const damagingMoves = team.flatMap((meta) => meta.damagingBeliefs);
  const damageWeight = Math.max(1, damagingMoves.reduce((sum, move) => sum + Math.max(1, move.weightedPower), 0));

  const physicalWeight = damagingMoves
    .filter((move) => move.move.category === "physical")
    .reduce((sum, move) => sum + Math.max(1, move.weightedPower), 0);
  const specialWeight = damagingMoves
    .filter((move) => move.move.category === "special")
    .reduce((sum, move) => sum + Math.max(1, move.weightedPower), 0);
  const spreadWeight = damagingMoves
    .filter((move) => move.move.isSpreadMove)
    .reduce((sum, move) => sum + Math.max(1, move.weightedPower), 0);
  const priorityMoves = damagingMoves.filter((move) => move.move.priority > 0).length;

  const weatherStrength = { rain: 0, sun: 0, sand: 0, snow: 0 };
  for (const meta of team) {
    if (meta.roleTags.has("weatherRain")) {
      weatherStrength.rain += 0.7;
    }
    if (meta.roleTags.has("weatherRainAbuser")) {
      weatherStrength.rain += 0.45;
    }
    if (meta.roleTags.has("weatherSun")) {
      weatherStrength.sun += 0.7;
    }
    if (meta.roleTags.has("weatherSunAbuser")) {
      weatherStrength.sun += 0.45;
    }
    if (meta.roleTags.has("weatherSand")) {
      weatherStrength.sand += 0.7;
    }
    if (meta.roleTags.has("weatherSandAbuser")) {
      weatherStrength.sand += 0.45;
    }
    if (meta.roleTags.has("weatherSnow")) {
      weatherStrength.snow += 0.7;
    }
    if (meta.roleTags.has("weatherSnowAbuser")) {
      weatherStrength.snow += 0.45;
    }
  }

  return {
    physicalShare: physicalWeight / damageWeight,
    specialShare: specialWeight / damageWeight,
    spreadShare: spreadWeight / damageWeight,
    singleTargetShare: clamp(1 - spreadWeight / damageWeight, 0, 1),
    priorityShare: damagingMoves.length > 0 ? priorityMoves / damagingMoves.length : 0,
    tailwindModeStrength: clamp(
      team.reduce(
        (sum, meta) => sum + meta.supportFlags.tailwind * 0.8 + meta.supportFlags.speedControl * 0.2 + (meta.roleTags.has("fastPressure") ? 0.2 : 0),
        0,
      ) / Math.max(1, team.length),
      0,
      1,
    ),
    trickRoomModeStrength: clamp(
      team.reduce(
        (sum, meta) => sum + meta.supportFlags.trickRoom * 0.85 + (meta.roleTags.has("slowBreaker") ? 0.28 : 0),
        0,
      ) / Math.max(1, team.length),
      0,
      1,
    ),
    weatherStrength: {
      rain: clamp(weatherStrength.rain / Math.max(1, team.length), 0, 1),
      sun: clamp(weatherStrength.sun / Math.max(1, team.length), 0, 1),
      sand: clamp(weatherStrength.sand / Math.max(1, team.length), 0, 1),
      snow: clamp(weatherStrength.snow / Math.max(1, team.length), 0, 1),
    },
    statDropPressure: clamp(team.reduce((sum, meta) => sum + (meta.roleConfidence.statDropPressure ?? 0), 0) / Math.max(1, team.length), 0, 1),
    statDropPunisherRisk: clamp(team.reduce((sum, meta) => sum + (meta.roleConfidence.statDropPunisher ?? 0), 0) / Math.max(1, team.length), 0, 1),
  } satisfies PreviewThreatProfile;
}

export function getBestDamageSnapshot(state: BattleState, attacker: PreviewCombatantMeta, defender: PreviewCombatantMeta) {
  return attacker.damagingMoves.reduce<PreviewDamageSnapshot>(
    (best, move) => {
      const preview = getDamagePreview(state, attacker.combatant.id, defender.combatant.id, move);
      if (!preview) {
        return best;
      }

      if (preview.estimate.averagePercent > best.averagePercent) {
        return {
          averagePercent: preview.estimate.averagePercent,
          maxPercent: preview.estimate.maxPercent,
          move,
        };
      }

      if (preview.estimate.averagePercent === best.averagePercent && preview.estimate.maxPercent > best.maxPercent) {
        return {
          averagePercent: preview.estimate.averagePercent,
          maxPercent: preview.estimate.maxPercent,
          move,
        };
      }

      return best;
    },
    { averagePercent: 0, maxPercent: 0, move: null },
  );
}

export function buildPreviewDamageMatrix(
  state: BattleState,
  attackers: PreviewCombatantMeta[],
  defenders: PreviewCombatantMeta[],
) {
  const matrix = new Map<string, PreviewDamageSnapshot>();
  for (const attacker of attackers) {
    for (const defender of defenders) {
      matrix.set(`${attacker.combatant.id}->${defender.combatant.id}`, getBestDamageSnapshot(state, attacker, defender));
    }
  }
  return matrix;
}

function getBestBelievedOutgoingPressure(
  state: BattleState,
  attacker: PreviewCombatantMeta,
  defender: PreviewCombatantMeta,
  cache: Map<string, number>,
) {
  let best = 0;
  for (const entry of attacker.damagingBeliefs) {
    const key = `${attacker.combatant.id}:${defender.combatant.id}:${entry.move.id}`;
    const cached = cache.get(key);
    const weighted =
      cached ??
      ((getDamagePreview(state, attacker.combatant.id, defender.combatant.id, entry.move)?.estimate.averagePercent ?? 0) *
        (0.45 + entry.certainty * 0.55));
    cache.set(key, weighted);
    if (weighted > best) {
      best = weighted;
    }
  }
  return best;
}

function describeTypePair(meta: PreviewCombatantMeta) {
  if (meta.primaryType && meta.secondaryType) {
    return `${meta.primaryType}/${meta.secondaryType}`;
  }
  if (meta.primaryType) {
    return meta.primaryType;
  }
  return "neutral";
}

function buildSingleThreatLabel(meta: PreviewCombatantMeta) {
  const tags: string[] = [];
  if (meta.roleTags.has("spread")) {
    tags.push("spread pressure");
  }
  if (meta.roleTags.has("setup")) {
    tags.push("setup");
  }
  if (meta.roleTags.has("tailwind")) {
    tags.push("Tailwind");
  }
  if (meta.roleTags.has("trickRoom")) {
    tags.push("Trick Room");
  }
  if (meta.roleTags.has("fakeOut")) {
    tags.push("Fake Out");
  }
  if (tags.length === 0 && meta.offensiveLean !== "support") {
    tags.push(`${meta.offensiveLean} pressure`);
  }
  return `${meta.combatant.pokemon.name} (${describeTypePair(meta)} ${tags[0] ?? "threat"})`;
}

function buildPackageThreat(
  id: string,
  label: string,
  members: PreviewCombatantMeta[],
  modeTags: string[],
  allyMetas: PreviewCombatantMeta[],
  state: BattleState,
  damageCache: Map<string, number>,
  explanationTags: string[],
) {
  const offensivePressure =
    allyMetas.reduce(
      (sum, ally) =>
        sum +
        Math.max(...members.map((member) => getBestBelievedOutgoingPressure(state, member, ally, damageCache))),
      0,
    ) / Math.max(1, allyMetas.length);
  const speedPressure =
    allyMetas.length > 0
      ? members.reduce(
          (sum, member) => sum + allyMetas.filter((ally) => member.speed > ally.speed).length / allyMetas.length,
          0,
        ) / members.length
      : 0;
  const removalDifficulty =
    members.reduce((sum, member) => sum + member.bulkyScore / 600, 0) / Math.max(1, members.length) +
    members.filter((member) => member.roleTags.has("redirection") || member.roleTags.has("wideGuard")).length * 0.18;
  const disruptionValue =
    members.reduce(
      (sum, member) =>
        sum +
        member.supportFlags.fakeOut * 0.5 +
        member.supportFlags.taunt * 0.4 +
        member.supportFlags.redirection * 0.5 +
        member.supportFlags.helpingHand * 0.25 +
        member.supportFlags.wideGuard * 0.45,
      0,
    );
  const modeAnchorValue = members.reduce((sum, member) => sum + member.supportFlags.weatherSetting * 0.5 + member.supportFlags.trickRoom * 0.6 + member.supportFlags.tailwind * 0.45 + member.supportFlags.setup * 0.25, 0);
  const packageCoherence =
    0.7 +
    members.reduce((sum, member) => sum + member.supportFlags.fakeOut * 0.12 + member.supportFlags.redirection * 0.12 + member.supportFlags.setup * 0.1, 0);
  const antiUsMatchupValue = offensivePressure * 0.42 + speedPressure * 65 + disruptionValue * 58;

  return {
    id,
    label,
    kind: "package" as const,
    memberTeamIndices: members.map((member) => member.member.teamIndex),
    modeTags,
    importance: clamp(
      offensivePressure * 1.15 +
        speedPressure * 75 +
        removalDifficulty * 55 +
        disruptionValue * 70 +
        modeAnchorValue * 80 +
        packageCoherence * 85,
      60,
      420,
    ),
    offensivePressure,
    speedPressure,
    removalDifficulty,
    disruptionValue,
    modeAnchorValue,
    packageCoherence,
    antiUsMatchupValue,
    likelyBringContribution: 0,
    likelyLeadContribution: 0,
    explanationTags,
  } satisfies EnemyThreat;
}

export function buildEnemyThreats(
  state: BattleState,
  enemyMetas: PreviewCombatantMeta[],
  allyMetas: PreviewCombatantMeta[],
) {
  const threats: EnemyThreat[] = [];
  const damageCache = new Map<string, number>();

  for (const enemy of enemyMetas) {
    const offensivePressure =
      allyMetas.reduce((sum, ally) => sum + getBestBelievedOutgoingPressure(state, enemy, ally, damageCache), 0) /
      Math.max(1, allyMetas.length);
    const speedPressure = allyMetas.length > 0 ? allyMetas.filter((ally) => enemy.speed > ally.speed).length / allyMetas.length : 0;
    const removalDifficulty = enemy.bulkyScore / 650 + (enemy.supportFlags.redirection + enemy.supportFlags.wideGuard) * 0.15;
    const disruptionValue =
      enemy.supportFlags.fakeOut * 0.48 +
      enemy.supportFlags.taunt * 0.44 +
      enemy.supportFlags.encore * 0.36 +
      enemy.supportFlags.disable * 0.33 +
      enemy.supportFlags.redirection * 0.42 +
      enemy.supportFlags.wideGuard * 0.42 +
      enemy.supportFlags.quickGuard * 0.32 +
      enemy.supportFlags.status * 0.2;
    const modeAnchorValue =
      enemy.supportFlags.weatherSetting * 0.56 +
      enemy.supportFlags.weatherAbuse * 0.42 +
      enemy.supportFlags.tailwind * 0.36 +
      enemy.supportFlags.trickRoom * 0.46 +
      enemy.supportFlags.setup * 0.24;
    const antiUsMatchupValue = offensivePressure * 0.46 + speedPressure * 62 + disruptionValue * 64;
    const importance = clamp(
      offensivePressure * 1.55 +
        speedPressure * 90 +
        removalDifficulty * 55 +
        disruptionValue * 85 +
        modeAnchorValue * 80 +
        antiUsMatchupValue * 0.35,
      35,
      360,
    );

    threats.push({
      id: `single:${enemy.member.teamIndex}`,
      label: buildSingleThreatLabel(enemy),
      kind: "single",
      memberTeamIndices: [enemy.member.teamIndex],
      modeTags: [
        enemy.roleTags.has("spread") ? "spread" : "",
        enemy.roleTags.has("setup") ? "setup" : "",
        enemy.roleTags.has("tailwind") ? "tailwind" : "",
        enemy.roleTags.has("trickRoom") ? "trickRoom" : "",
        enemy.roleTags.has("fakeOut") ? "fakeOut" : "",
      ].filter(Boolean),
      importance,
      offensivePressure,
      speedPressure,
      removalDifficulty,
      disruptionValue,
      modeAnchorValue,
      packageCoherence: 0.2,
      antiUsMatchupValue,
      likelyBringContribution: 0,
      likelyLeadContribution: 0,
      explanationTags: [
        enemy.offensiveLean !== "support" ? `${enemy.offensiveLean} pressure` : "utility pressure",
        enemy.roleTags.has("spread") ? "spread damage" : "single-target pressure",
        enemy.speed >= 140 ? "fast threat" : enemy.speed <= 95 ? "slow breaker" : "speed neutral",
      ],
    });
  }

  for (let i = 0; i < enemyMetas.length; i += 1) {
    for (let j = i + 1; j < enemyMetas.length; j += 1) {
      const left = enemyMetas[i];
      const right = enemyMetas[j];

      for (const weather of ["rain", "sun", "sand", "snow"] as const) {
        if (
          (hasWeatherSetter(left, weather) && hasWeatherAbuser(right, weather)) ||
          (hasWeatherSetter(right, weather) && hasWeatherAbuser(left, weather))
        ) {
          threats.push(
            buildPackageThreat(
              `package:${weather}:${left.member.teamIndex}:${right.member.teamIndex}`,
              `${weather[0].toUpperCase()}${weather.slice(1)} package`,
              [left, right],
              ["weather", weather],
              allyMetas,
              state,
              damageCache,
              ["weather setter + abuser", `${weather} mode coherence`],
            ),
          );
        }
      }

      if (
        (left.supportFlags.trickRoom >= 0.45 && right.roleTags.has("slowBreaker")) ||
        (right.supportFlags.trickRoom >= 0.45 && left.roleTags.has("slowBreaker"))
      ) {
        threats.push(
          buildPackageThreat(
            `package:trick-room:${left.member.teamIndex}:${right.member.teamIndex}`,
            "Trick Room package",
            [left, right],
            ["trickRoom"],
            allyMetas,
            state,
            damageCache,
            ["Trick Room setter + slow breaker"],
          ),
        );
      }

      if (
        (left.supportFlags.redirection >= 0.45 && right.supportFlags.setup >= 0.4) ||
        (right.supportFlags.redirection >= 0.45 && left.supportFlags.setup >= 0.4)
      ) {
        threats.push(
          buildPackageThreat(
            `package:redirection-setup:${left.member.teamIndex}:${right.member.teamIndex}`,
            "Redirection + setup package",
            [left, right],
            ["redirection", "setup"],
            allyMetas,
            state,
            damageCache,
            ["redirection enabling setup"],
          ),
        );
      }

      if (
        (left.supportFlags.fakeOut >= 0.45 && (right.supportFlags.setup >= 0.35 || right.supportFlags.speedControl >= 0.45)) ||
        (right.supportFlags.fakeOut >= 0.45 && (left.supportFlags.setup >= 0.35 || left.supportFlags.speedControl >= 0.45))
      ) {
        threats.push(
          buildPackageThreat(
            `package:fakeout-mode:${left.member.teamIndex}:${right.member.teamIndex}`,
            "Fake Out tempo package",
            [left, right],
            ["fakeOut", "tempo"],
            allyMetas,
            state,
            damageCache,
            ["Fake Out enabling setup or speed control"],
          ),
        );
      }

      if (
        (left.roleTags.has("spread") && right.supportFlags.speedControl >= 0.45) ||
        (right.roleTags.has("spread") && left.supportFlags.speedControl >= 0.45)
      ) {
        threats.push(
          buildPackageThreat(
            `package:spread-speed:${left.member.teamIndex}:${right.member.teamIndex}`,
            "Spread pressure package",
            [left, right],
            ["spread", "speedControl"],
            allyMetas,
            state,
            damageCache,
            ["spread damage backed by speed control"],
          ),
        );
      }

      const leftGroundPressure = left.likelyAttackTypes.some((entry) => entry.type === "ground" && entry.weight >= 70);
      const rightGroundPressure = right.likelyAttackTypes.some((entry) => entry.type === "ground" && entry.weight >= 70);
      const leftAvoidsGround = left.primaryType === "flying" || left.secondaryType === "flying" || left.abilityKey === "levitate";
      const rightAvoidsGround = right.primaryType === "flying" || right.secondaryType === "flying" || right.abilityKey === "levitate";
      if ((leftGroundPressure && rightAvoidsGround) || (rightGroundPressure && leftAvoidsGround)) {
        threats.push(
          buildPackageThreat(
            `package:ground-spam:${left.member.teamIndex}:${right.member.teamIndex}`,
            "Ground pressure package",
            [left, right],
            ["ground", "spread"],
            allyMetas,
            state,
            damageCache,
            ["ground pressure with ally that avoids collateral damage"],
          ),
        );
      }
    }
  }

  return threats.sort((left, right) => right.importance - left.importance);
}

export function applyThreatLikelihoods(
  threats: EnemyThreat[],
  enemyBringWeights: Map<number, number>,
  enemyLeadWeights: Map<number, number>,
) {
  return threats.map((threat) => {
    const likelyBringContribution =
      threat.memberTeamIndices.reduce((sum, teamIndex) => sum + (enemyBringWeights.get(teamIndex) ?? 0), 0) /
      Math.max(1, threat.memberTeamIndices.length);
    const likelyLeadContribution =
      threat.memberTeamIndices.reduce((sum, teamIndex) => sum + (enemyLeadWeights.get(teamIndex) ?? 0), 0) /
      Math.max(1, threat.memberTeamIndices.length);

    return {
      ...threat,
      likelyBringContribution,
      likelyLeadContribution,
      importance: threat.importance * (0.72 + likelyBringContribution * 0.18 + likelyLeadContribution * 0.1),
    };
  });
}
