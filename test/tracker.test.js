import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeJson, readJson, weekStart, sortPlayers } from '../src/tracker.js';

test('writeJson performs atomic write and readJson reads data', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lol-test-'));
  const testFile = path.join(tmpDir, 'data.json');

  const payload = { test: 'atomic', count: 42 };
  await writeJson(testFile, payload);

  const read = await readJson(testFile, null);
  assert.deepEqual(read, payload);

  // Check fallback for missing file
  const fallback = await readJson(path.join(tmpDir, 'nonexistent.json'), { fallback: true });
  assert.deepEqual(fallback, { fallback: true });

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('weekStart calculates start of the week accurately', () => {
  // A known Wednesday: 2026-11-04 12:00:00 UTC
  const wednesday = Date.parse('2026-11-04T12:00:00Z');
  const start = weekStart(wednesday, { day: 'monday', timeZone: 'America/New_York' });
  const startDate = new Date(start);
  assert.ok(start < wednesday);
  assert.equal(startDate.getUTCDay(), 1, 'Start day should be Monday');
});

test('sortPlayers orders by solo rank value descending', () => {
  const players = [
    { name: 'SilverGuy', solo: { value: 1200 }, stats: { avgScore: 7.0 } },
    { name: 'ChallengerGuy', solo: { value: 3000 }, stats: { avgScore: 8.5 } },
    { name: 'UnrankedGuy', solo: null, stats: { avgScore: 5.0 } },
  ];

  const sorted = sortPlayers(players);
  assert.equal(sorted[0].name, 'ChallengerGuy');
  assert.equal(sorted[1].name, 'SilverGuy');
  assert.equal(sorted[2].name, 'UnrankedGuy');
});
