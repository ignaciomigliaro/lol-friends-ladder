import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLiveClientData, recordTelemetry, getLatestTelemetry, getDemoTelemetry } from '../src/telemetry.js';
import { computeDynamicPrediction } from '../src/prediction.js';

test('parseLiveClientData parses raw allgamedata correctly', () => {
  const raw = {
    gameData: { gameTime: 1200 },
    allPlayers: [
      {
        summonerName: 'Panda',
        championName: 'Jarvan IV',
        team: 'ORDER',
        scores: { kills: 5, deaths: 1, assists: 7, creepScore: 130 },
        items: [{ itemID: 6692, displayName: 'Eclipse', price: 2800, count: 1 }],
      },
      {
        summonerName: 'Rival',
        championName: 'Yone',
        team: 'CHAOS',
        scores: { kills: 2, deaths: 4, assists: 1, creepScore: 110 },
        items: [{ itemID: 3046, displayName: 'Phantom Dancer', price: 2600, count: 1 }],
      },
    ],
    events: {
      Events: [
        { EventName: 'DragonKill', KillerName: 'Panda' },
        { EventName: 'TurretKilled', KillerName: 'Panda' },
      ],
    },
  };

  const parsed = parseLiveClientData(raw);
  assert.equal(parsed.minutes, 20);
  assert.equal(parsed.blue.kills, 5);
  assert.equal(parsed.red.kills, 2);
  assert.equal(parsed.blue.dragons, 1);
  assert.equal(parsed.blue.towers, 1);
  assert.ok(parsed.goldLead > 0);
  assert.ok(parsed.players.panda);
  assert.equal(parsed.players.panda.kills, 5);
});

test('computeDynamicPrediction shifts probability according to gold and kill lead', () => {
  const base = {
    blue: { probability: 52 },
    red: { probability: 48 },
    reasons: [],
    alerts: [],
  };

  const telemetry = {
    gameTime: 1200, // min 20
    blue: { kills: 20, deaths: 10, towers: 4, dragons: 2, barons: 0 },
    red: { kills: 10, deaths: 20, towers: 1, dragons: 0, barons: 0 },
    goldLead: 5000,
    killsLead: 10,
  };

  const dynamic = computeDynamicPrediction(base, telemetry);
  assert.ok(dynamic.isDynamic);
  assert.ok(dynamic.blue.probability > 70, `Expected > 70%, got ${dynamic.blue.probability}%`);
  assert.equal(dynamic.blue.probability + dynamic.red.probability, 100);
  assert.ok(dynamic.reasons.some((r) => r.includes('Ventaja de Oro')));
  assert.ok(dynamic.reasons.some((r) => r.includes('Marcador de Bajas')));
});

test('getDemoTelemetry returns complete and realistic snapshot', () => {
  const demo = getDemoTelemetry();
  assert.equal(typeof demo.blue.kills, 'number');
  assert.equal(typeof demo.red.kills, 'number');
  assert.ok(demo.players.panda);
  assert.ok(demo.players.panda.items.length > 0);
});
