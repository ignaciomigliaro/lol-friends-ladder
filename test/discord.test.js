import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDiscordLeaderboard } from '../src/discord.js';

test('formatDiscordLeaderboard formats embeds correctly', () => {
  const mockBoard = {
    groupName: 'Los Pibes',
    updatedAt: 1700000000000,
    players: [
      {
        name: 'Faker',
        solo: { label: 'Challenger 900 LP' },
        stats: { avgScore: 9.2, winrate: 75, games: 20, kda: 4.5 },
        lpDelta: { week: 120 },
      },
    ],
  };

  const payload = formatDiscordLeaderboard(mockBoard);
  assert.ok(payload.embeds);
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.embeds[0].fields.length, 1);
  assert.ok(payload.embeds[0].fields[0].name.includes('🥇 Faker'));
});
