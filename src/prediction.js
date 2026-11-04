import { rankValue, rankLabel } from './ranks.js';

// Base map win rate in competitive League of Legends (Blue side camera & Baron control advantage)
const BLUE_SIDE_BASE_WINRATE = 51.5;
const UNRANKED_DEFAULT_VALUE = 1000; // ~Gold IV baseline for unranked participants

// Champion Scaling Curves based on competitive stats & power-spikes
// 'early' : peaks min 0-16 (lane bullies, early dive/ganks)
// 'mid'   : peaks min 17-26 (2-item spikes, skirmishers)
// 'late'  : peaks min 27-40+ (hyper-carries, infinite scalers)
// 'steady': constant utility / vanguard tanks
export const CHAMPION_CURVES = {
  // Early Game Bullies
  leesin: 'early', renekton: 'early', elise: 'early', draven: 'early', nidalee: 'early',
  pantheon: 'early', jayce: 'early', leblanc: 'early', lucian: 'early', kalista: 'early',
  blitzcrank: 'early', olaf: 'early', xinzhao: 'early', jarvaniv: 'early', talon: 'early',
  reksai: 'early', warwick: 'early', kled: 'early', qiyana: 'early', pyke: 'early',
  shaco: 'early', rengar: 'early', rumble: 'early', quinn: 'early', naafiri: 'early',
  locke: 'early',

  // Hyper-Scalers & Late Game Beasts
  kayle: 'late', kassadin: 'late', aurelionsol: 'late', jinx: 'late', smolder: 'late',
  senna: 'late', vladimir: 'late', veigar: 'late', kogmaw: 'late', vayne: 'late',
  nasus: 'late', gangplank: 'late', twitch: 'late', masteryi: 'late', sivir: 'late',
  viktor: 'late', aphelios: 'late', cassiopeia: 'late', ashe: 'late', tristana: 'late',
  camille: 'late', fiora: 'late', jax: 'late', gwen: 'late', azir: 'late', ryze: 'late',
  chogath: 'late', sion: 'late', belveth: 'late', kindred: 'late', karthus: 'late',

  // Mid Game Spikers
  ahri: 'mid', syndra: 'mid', orianna: 'mid', hwei: 'mid', yone: 'mid', yasuo: 'mid',
  ezreal: 'mid', kaisa: 'mid', akali: 'mid', zed: 'mid', sylas: 'mid', katarina: 'mid',
  nocturne: 'mid', viego: 'mid', aatrox: 'mid', diana: 'mid', ekko: 'mid', fizz: 'mid',
  irelia: 'mid', riven: 'mid', samira: 'mid', varus: 'mid', missfortune: 'mid', jhin: 'mid',
  lux: 'mid', vex: 'mid', xerath: 'mid', zoe: 'mid', caitlyn: 'mid', mordekaiser: 'mid',
  kayn: 'mid', sett: 'mid', volibear: 'mid', wukong: 'mid', monkeyking: 'mid',

  // Utility & Tanks
  malphite: 'steady', ornn: 'steady', sejuani: 'steady', maokai: 'steady', nautilus: 'steady',
  leona: 'steady', thresh: 'steady', braum: 'steady', lulu: 'steady', janna: 'steady',
  nami: 'steady', rell: 'steady', amumu: 'steady', rammus: 'steady', zac: 'steady',
  alistar: 'steady', shen: 'steady', poppy: 'steady', taric: 'steady', bard: 'steady',
};

export function getChampionCurve(championName) {
  const clean = String(championName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return CHAMPION_CURVES[clean] || 'mid';
}

export function formatMasteryPoints(points = 0) {
  const n = Number(points) || 0;
  if (n >= 1_000_000) {
    const val = (n / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${val}M`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1_000)}k`;
  }
  return n > 0 ? `${n}` : '0';
}

export function computeChampionPowerAtMinute(curve, minutes = 0) {
  if (minutes <= 15) {
    if (curve === 'early') return 2.5;
    if (curve === 'late') return -2.5;
    if (curve === 'steady') return 0.5;
    return 0; // mid
  }
  if (minutes <= 26) {
    if (curve === 'mid') return 2.2;
    if (curve === 'early') return -0.5;
    if (curve === 'late') return 1.0;
    return 1.2; // steady
  }
  // minutes > 26 (Late game)
  if (curve === 'late') return 3.5;
  if (curve === 'early') return -3.0;
  if (curve === 'mid') return 0.5;
  return 1.5; // steady
}

export function analyzePlayerStats(entries = [], mastery = null) {
  const solo = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5');
  const flex = entries.find((e) => e.queueType === 'RANKED_FLEX_SR');
  const primary = solo || flex;

  let rValue = UNRANKED_DEFAULT_VALUE;
  let rLabel = 'Unranked';
  let winrate = 50;
  let games = 0;
  let hotStreak = false;

  if (primary) {
    rValue = rankValue(primary);
    rLabel = rankLabel(primary);
    games = (primary.wins || 0) + (primary.losses || 0);
    winrate = games > 0 ? Math.round(((primary.wins || 0) / games) * 100) : 50;
    hotStreak = Boolean(primary.hotStreak);
  }

  const points = mastery?.championPoints || 0;
  const level = mastery?.championLevel || 0;
  const isGodOtp = points >= 1_000_000;
  const isOtp = points >= 250_000;
  const isMain = points >= 100_000;

  return {
    rankValue: rValue,
    rankLabel: rLabel,
    tier: primary?.tier || null,
    rank: primary?.rank || null,
    lp: primary?.leaguePoints ?? null,
    winrate,
    games,
    hotStreak,
    mastery: {
      points,
      level,
      isMain,
      isOtp,
      isGodOtp,
      formattedPoints: formatMasteryPoints(points),
    },
  };
}

export function computeTeamSummary(team = []) {
  if (!team.length) {
    return {
      avgRankValue: UNRANKED_DEFAULT_VALUE,
      avgWinrate: 50,
      totalMastery: 0,
      mainsCount: 0,
      hotStreakCount: 0,
    };
  }

  const rankValues = team.map((p) => p.stats?.rankValue ?? UNRANKED_DEFAULT_VALUE);
  const winrates = team.map((p) => p.stats?.winrate ?? 50);
  const totalMastery = team.reduce((acc, p) => acc + (p.stats?.mastery?.points || 0), 0);
  const mainsCount = team.filter((p) => p.stats?.mastery?.isMain).length;
  const hotStreakCount = team.filter((p) => p.stats?.hotStreak).length;

  const avgRankValue = Math.round(rankValues.reduce((a, b) => a + b, 0) / team.length);
  const avgWinrate = Math.round(winrates.reduce((a, b) => a + b, 0) / team.length);

  return {
    avgRankValue,
    avgWinrate,
    totalMastery,
    mainsCount,
    hotStreakCount,
  };
}

export function computeMatchPrediction(blueTeam = [], redTeam = [], minutes = 0) {
  const blue = computeTeamSummary(blueTeam);
  const red = computeTeamSummary(redTeam);

  // 1. Rank / MMR Shift (every 100 LP diff = ~3.5% probability shift, max +/- 18%)
  const rankDiff = blue.avgRankValue - red.avgRankValue;
  const rankShift = Math.max(-18, Math.min(18, (rankDiff / 100) * 3.5));

  // 2. Champion Mastery Shift (more experience on picks, max +/- 10%)
  const masteryDiff = blue.totalMastery - red.totalMastery;
  const masteryShift = Math.max(-10, Math.min(10, (masteryDiff / 100_000) * 2));

  // 3. Winrate & Streak Shift (max +/- 8%)
  const wrDiff = blue.avgWinrate - red.avgWinrate;
  const streakDiff = blue.hotStreakCount - red.hotStreakCount;
  const formShift = Math.max(-8, Math.min(8, wrDiff * 0.4 + streakDiff * 1.5));

  // 4. Dynamic Time & Champion Scaling Curve Shift (max +/- 14%)
  let blueScaling = 0;
  let redScaling = 0;
  for (const p of blueTeam) {
    p.curve = getChampionCurve(p.champion);
    blueScaling += computeChampionPowerAtMinute(p.curve, minutes);
  }
  for (const p of redTeam) {
    p.curve = getChampionCurve(p.champion);
    redScaling += computeChampionPowerAtMinute(p.curve, minutes);
  }

  const scalingDiff = blueScaling - redScaling;
  const scalingShift = Math.max(-14, Math.min(14, scalingDiff * 1.4));

  // Determine game phase
  const phaseName = minutes <= 15 ? 'early' : minutes <= 26 ? 'mid' : 'late';
  const phaseLabels = {
    early: 'Fase Temprana (Early Game)',
    mid: 'Fase Media (Mid Game)',
    late: 'Juego Tardío (Late Game)',
  };
  const phase = {
    name: phaseName,
    label: phaseLabels[phaseName],
    minutes,
  };

  // Base Blue side + shifts
  let blueProb = BLUE_SIDE_BASE_WINRATE + rankShift + masteryShift + formShift + scalingShift;
  blueProb = Math.max(15, Math.min(85, Math.round(blueProb)));
  const redProb = 100 - blueProb;

  // Determine if friend is in a specific team to orient tactical advice toward helping the friend
  const friendInBlue = blueTeam.some((p) => p.isFriend);
  const friendInRed = redTeam.some((p) => p.isFriend);
  const friendSide = friendInBlue && !friendInRed ? 'blue' : friendInRed && !friendInBlue ? 'red' : null;

  // Generate tactical insights (clean, no emojis)
  const reasons = [];

  if (Math.abs(scalingDiff) >= 2.5) {
    const blueScalingAdv = scalingDiff > 0;
    const friendHasScalingAdv = friendSide === 'blue' ? blueScalingAdv : !blueScalingAdv;

    if (friendSide) {
      if (friendHasScalingAdv) {
        if (phaseName === 'late') {
          reasons.push(`Minuto ${minutes} (Late Game): Tu equipo toma ventaja por composición superior de escalado tardío.`);
        } else if (phaseName === 'early') {
          reasons.push(`Minuto ${minutes} (Early Game): Tu equipo cuenta con mayor presión temprana para buscar ventajas en líneas.`);
        } else {
          reasons.push(`Minuto ${minutes} (Mid Game): Tu equipo alcanza picos de poder de 2 objetos para forzar peleas grupales.`);
        }
      } else {
        if (phaseName === 'late') {
          reasons.push(`Minuto ${minutes} (Late Game): La composición rival escala más fuerte en juego tardío; busquen cerrar antes de peleas 5v5 largas.`);
        } else if (phaseName === 'early') {
          reasons.push(`Minuto ${minutes} (Early Game): Cuidado en fase de líneas; los rivales tienen picos de agresión y daño temprano.`);
        } else {
          reasons.push(`Minuto ${minutes} (Mid Game): Cuidado con los picos de poder rivales en peleas por dragón y torres.`);
        }
      }
    } else {
      const leader = blueScalingAdv ? 'Equipo Azul' : 'Equipo Rojo';
      if (phaseName === 'late') {
        reasons.push(`Minuto ${minutes} (Late Game): ${leader} toma ventaja por composición superior de escalado tardío.`);
      } else if (phaseName === 'early') {
        reasons.push(`Minuto ${minutes} (Early Game): ${leader} explota su pico de agresividad temprana en líneas.`);
      } else {
        reasons.push(`Minuto ${minutes} (Mid Game): ${leader} alcanza picos de poder de 2 objetos para peleas grupales.`);
      }
    }
  }

  if (Math.abs(rankDiff) >= 80) {
    const blueRankAdv = rankDiff > 0;
    const diffLp = Math.abs(rankDiff);
    if (friendSide) {
      const friendHasAdv = friendSide === 'blue' ? blueRankAdv : !blueRankAdv;
      if (friendHasAdv) {
        reasons.push(`Ventaja de Rango: Tu equipo promedia +${diffLp} LP de elo.`);
      } else {
        reasons.push(`Rango Rival: El equipo rival promedia +${diffLp} LP de elo superior.`);
      }
    } else {
      const leader = blueRankAdv ? 'Equipo Azul' : 'Equipo Rojo';
      reasons.push(`Ventaja de Rango: ${leader} promedia +${diffLp} LP de elo.`);
    }
  }

  if (Math.abs(masteryDiff) >= 70_000) {
    const blueMasteryAdv = masteryDiff > 0;
    const leaderPts = formatMasteryPoints(Math.max(blue.totalMastery, red.totalMastery));
    const trailerPts = formatMasteryPoints(Math.min(blue.totalMastery, red.totalMastery));
    if (friendSide) {
      const friendHasAdv = friendSide === 'blue' ? blueMasteryAdv : !blueMasteryAdv;
      if (friendHasAdv) {
        reasons.push(`Maestría de Campeones: Tu equipo suma más experiencia (${leaderPts} vs ${trailerPts} pts).`);
      } else {
        reasons.push(`Maestría Rival: El equipo rival acumula mayor experiencia (${leaderPts} vs ${trailerPts} pts).`);
      }
    } else {
      const leader = blueMasteryAdv ? 'Equipo Azul' : 'Equipo Rojo';
      reasons.push(`Maestría de Campeones: ${leader} suma más experiencia (${leaderPts} vs ${trailerPts} pts).`);
    }
  }

  if (blue.hotStreakCount > 0 || red.hotStreakCount > 0) {
    if (blue.hotStreakCount !== red.hotStreakCount) {
      const blueStreakAdv = blue.hotStreakCount > red.hotStreakCount;
      const count = Math.max(blue.hotStreakCount, red.hotStreakCount);
      if (friendSide) {
        const friendHasAdv = friendSide === 'blue' ? blueStreakAdv : !blueStreakAdv;
        if (friendHasAdv) {
          reasons.push(`Invocadores en Racha: Tu equipo tiene ${count} ${count === 1 ? 'jugador' : 'jugadores'} con racha de victorias.`);
        } else {
          reasons.push(`Rival en Racha: El equipo rival cuenta con ${count} ${count === 1 ? 'jugador' : 'jugadores'} con racha ganadora.`);
        }
      } else {
        const leader = blueStreakAdv ? 'Equipo Azul' : 'Equipo Rojo';
        reasons.push(`Invocadores en Racha: ${leader} tiene ${count} ${count === 1 ? 'jugador' : 'jugadores'} con racha de victorias.`);
      }
    }
  }

  if (reasons.length === 0) {
    reasons.push('Duelo Equilibrado: Ambos equipos están sumamente parejos en rango y maestría.');
  }

  // Tactical alerts focused exclusively on opponent threats
  const alerts = [];
  const opponents = friendSide === 'red' ? blueTeam : redTeam;
  const dangerousOpponents = opponents.filter((p) => (p.stats?.mastery?.points || 0) >= 200_000);
  for (const opp of dangerousOpponents) {
    alerts.push(`Cuidado con ${opp.champion} rival: Invocador OTP con ${formatMasteryPoints(opp.stats.mastery.points)} puntos de maestría.`);
  }

  return {
    blue: {
      probability: blueProb,
      ...blue,
    },
    red: {
      probability: redProb,
      ...red,
    },
    favored: blueProb >= 50 ? 'blue' : 'red',
    phase,
    scaling: {
      blueScore: Math.round(blueScaling * 10) / 10,
      redScore: Math.round(redScaling * 10) / 10,
      diff: Math.round(scalingDiff * 10) / 10,
      shift: Math.round(scalingShift * 10) / 10,
    },
    reasons,
    alerts,
  };
}

export function computeDynamicPrediction(basePrediction, telemetry) {
  if (!telemetry) return basePrediction;

  const baseBlueProb = basePrediction?.blue?.probability ?? 50;

  const goldLead = telemetry.goldLead || 0; // blue - red
  const killLead = telemetry.killsLead || 0;
  const towerLead = (telemetry.blue?.towers || 0) - (telemetry.red?.towers || 0);
  const dragonLead = (telemetry.blue?.dragons || 0) - (telemetry.red?.dragons || 0);
  const baronLead = (telemetry.blue?.barons || 0) - (telemetry.red?.barons || 0);

  // Minute weight: early/mid game gold lead has high impact per 1k
  const minutes = Math.max(1, (telemetry.gameTime || 0) / 60);
  const goldCoeff = minutes < 20 ? 4.5 : minutes < 35 ? 3.5 : 2.5;

  const goldShift = (goldLead / 1000) * goldCoeff;
  const killShift = killLead * 0.8;
  const objShift = towerLead * 3.0 + dragonLead * 4.0 + baronLead * 12.0;

  // Base prediction weight decreases as actual in-game reality takes over
  const baseWeight = Math.max(0.1, 0.45 - (minutes / 60) * 0.4);
  const inGameShift = goldShift + killShift + objShift;

  let dynamicBlue = Math.round(50 + (baseBlueProb - 50) * baseWeight + inGameShift);
  dynamicBlue = Math.max(2, Math.min(98, dynamicBlue));
  const dynamicRed = 100 - dynamicBlue;

  const reasons = [...(basePrediction?.reasons || [])];
  const liveReasons = [];

  if (Math.abs(goldLead) >= 1500) {
    const leader = goldLead > 0 ? 'Equipo Azul' : 'Equipo Rojo';
    liveReasons.push(`Ventaja de Oro: ${leader} lidera con +${(Math.abs(goldLead) / 1000).toFixed(1)}k de oro.`);
  }

  if (Math.abs(killLead) >= 4) {
    const leader = killLead > 0 ? 'Equipo Azul' : 'Equipo Rojo';
    liveReasons.push(`Marcador de Bajas: ${leader} saca +${Math.abs(killLead)} asesinatos.`);
  }

  if (Math.abs(dragonLead) >= 1) {
    const leader = dragonLead > 0 ? 'Equipo Azul' : 'Equipo Rojo';
    liveReasons.push(`Control de Dragones: ${leader} tiene +${Math.abs(dragonLead)} ${Math.abs(dragonLead) === 1 ? 'dragón' : 'dragones'}.`);
  }

  if (baronLead !== 0) {
    const leader = baronLead > 0 ? 'Equipo Azul' : 'Equipo Rojo';
    liveReasons.push(`Barón Nashor: ${leader} tiene la bonificación del Barón.`);
  }

  return {
    ...basePrediction,
    blue: {
      ...basePrediction.blue,
      probability: dynamicBlue,
    },
    red: {
      ...basePrediction.red,
      probability: dynamicRed,
    },
    favored: dynamicBlue >= 50 ? 'blue' : 'red',
    reasons: liveReasons.length > 0 ? [...liveReasons, ...reasons.slice(0, 2)] : reasons,
    isDynamic: true,
  };
}
