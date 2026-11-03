import test from 'node:test';
import assert from 'node:assert/strict';
import { getChampionBuild, BUILDS_CATALOG } from '../src/builds.js';

test('getChampionBuild returns exact build for catalog champion', () => {
  const j4 = getChampionBuild('JarvanIV');
  assert.ok(j4);
  assert.equal(j4.champion, 'Jarvan IV');
  assert.equal(j4.role, 'JUNGLE');
  assert.equal(j4.core.length, 3);
  assert.ok(j4.core.some((item) => item.name === 'Eclipse'));
  assert.equal(j4.skillOrder, 'Q > E > W');
  assert.ok(j4.starter.length >= 1);
});

test('getChampionBuild falls back gracefully to archetype for any champion', () => {
  const ahri = getChampionBuild('Ahri');
  assert.ok(ahri);
  assert.equal(ahri.role, 'MID');
  assert.ok(ahri.core.some((item) => item.name === 'Sombrero Mortal de Rabadon'));

  const jinx = getChampionBuild('Jinx');
  assert.ok(jinx);
  assert.equal(jinx.role, 'BOTTOM');

  const ornn = getChampionBuild('Ornn');
  assert.ok(ornn);
  assert.ok(ornn.core.some((item) => item.name === 'Corazón de Acero'));
});
