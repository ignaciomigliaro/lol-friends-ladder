import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePlayerStats, computeTeamSummary, computeMatchPrediction } from '../src/prediction.js';

test('analyzePlayerStats parses solo and flex entries with mastery', () => {
  const entries = [
    { queueType: 'RANKED_SOLO_5x5', tier: 'EMERALD', rank: 'II', leaguePoints: 50, wins: 50, losses: 50, hotStreak: true },
    { queueType: 'RANKED_FLEX_SR', tier: 'GOLD', rank: 'I', leaguePoints: 20, wins: 10, losses: 10, hotStreak: false },
  ];
  const mastery = { championPoints: 150_000, championLevel: 7 };

  const stats = analyzePlayerStats(entries, mastery);
  assert.equal(stats.tier, 'EMERALD');
  assert.equal(stats.rank, 'II');
  assert.equal(stats.winrate, 50);
  assert.equal(stats.hotStreak, true);
  assert.equal(stats.mastery.points, 150_000);
  assert.equal(stats.mastery.isMain, true);
});

test('analyzePlayerStats defaults gracefully for unranked without mastery', () => {
  const stats = analyzePlayerStats([], null);
  assert.equal(stats.rankLabel, 'Unranked');
  assert.equal(stats.winrate, 50);
  assert.equal(stats.mastery.points, 0);
  assert.equal(stats.mastery.isMain, false);
});

test('computeMatchPrediction favors team with higher rank and mastery', () => {
  const strongBlue = Array.from({ length: 5 }, (_, i) => ({
    summonerName: `Blue${i}`,
    champion: 'Ahri',
    stats: {
      rankValue: 2400, // Diamond IV
      winrate: 58,
      hotStreak: true,
      mastery: { points: 150_000, isMain: true },
    },
  }));

  const weakerRed = Array.from({ length: 5 }, (_, i) => ({
    summonerName: `Red${i}`,
    champion: 'Yasuo',
    stats: {
      rankValue: 1200, // Silver
      winrate: 45,
      hotStreak: false,
      mastery: { points: 10_000, isMain: false },
    },
  }));

  const pred = computeMatchPrediction(strongBlue, weakerRed);
  assert.ok(pred.blue.probability > 65);
  assert.ok(pred.red.probability < 35);
  assert.equal(pred.blue.probability + pred.red.probability, 100);
  assert.equal(pred.favored, 'blue');
  assert.ok(pred.reasons.length > 0);
});

test('computeMatchPrediction clamps probability between 20 and 80%', () => {
  const godTeam = Array.from({ length: 5 }, () => ({
    stats: { rankValue: 4000, winrate: 90, hotStreak: true, mastery: { points: 1_000_000, isMain: true } },
  }));
  const lowTeam = Array.from({ length: 5 }, () => ({
    stats: { rankValue: 0, winrate: 10, hotStreak: false, mastery: { points: 0, isMain: false } },
  }));

  const pred = computeMatchPrediction(godTeam, lowTeam);
  assert.ok(pred.blue.probability <= 85);
  assert.ok(pred.red.probability >= 15);
});

test('computeMatchPrediction shifts dynamically with game minutes based on scaling curves', () => {
  // Blue has 3 late scalers (Kayle, Jinx, Kassadin)
  const scalingBlue = [
    { champion: 'Kayle', stats: { rankValue: 1500, winrate: 50, mastery: { points: 50000 } } },
    { champion: 'Kassadin', stats: { rankValue: 1500, winrate: 50, mastery: { points: 50000 } } },
    { champion: 'Jinx', stats: { rankValue: 1500, winrate: 50, mastery: { points: 50000 } } },
    { champion: 'Thresh', stats: { rankValue: 1500, winrate: 50, mastery: { points: 50000 } } },
    { champion: 'Sejuani', stats: { rankValue: 1500, winrate: 50, mastery: { points: 50000 } } },
  ];

  // Red has early bullies (Renekton, Elise, Draven)
  const earlyRed = [
    { champion: 'Renekton', stats: { rankValue: 1500, winrate: 50, mastery: { points: 50000 } } },
    { champion: 'Elise', stats: { rankValue: 1500, winrate: 50, mastery: { points: 50000 } } },
    { champion: 'Draven', stats: { rankValue: 1500, winrate: 50, mastery: { points: 50000 } } },
    { champion: 'Blitzcrank', stats: { rankValue: 1500, winrate: 50, mastery: { points: 50000 } } },
    { champion: 'Jayce', stats: { rankValue: 1500, winrate: 50, mastery: { points: 50000 } } },
  ];

  // Early game: minute 8
  const earlyPred = computeMatchPrediction(scalingBlue, earlyRed, 8);
  assert.equal(earlyPred.phase.name, 'early');
  // Red should have the early game advantage
  assert.ok(earlyPred.red.probability > earlyPred.blue.probability, 'Red should lead in early game');

  // Late game: minute 34
  const latePred = computeMatchPrediction(scalingBlue, earlyRed, 34);
  assert.equal(latePred.phase.name, 'late');
  // Blue should dominate in late game!
  assert.ok(latePred.blue.probability > latePred.red.probability, 'Blue should lead in late game');
  assert.ok(latePred.reasons.some((r) => r.includes('Late Game')));
});
