import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [dataSource, appSource, html, manifestSource, portable] = await Promise.all([
  read('src/data.js'),
  read('src/app.js'),
  read('index.html'),
  read('manifest.webmanifest'),
  read('OMBRE_GEEK_portable.html')
]);

const memory = new Map();
const context = {
  console,
  performance: {now: () => 0},
  navigator: {},
  localStorage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key)
  },
  document: {addEventListener() {}},
  window: {matchMedia: () => ({matches:false})},
  structuredClone
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(dataSource, context);
vm.runInContext(appSource, context);
const data = Array.from(context.window.OMBRE_GEEK_DATA);
const core = context.window.OMBRE_GEEK_CORE;

test('le catalogue livré est complet et cohérent', () => {
  assert.equal(data.length, 52);
  assert.equal(new Set(data.map(({id}) => id)).size, data.length);
  assert.equal(new Set(data.map(({answer}) => answer)).size, data.length);
  for (const question of data) {
    assert.match(question.id, /^[a-z0-9]+$/);
    assert.ok(question.answer && question.franchise && question.category && question.fact);
    assert.ok([1, 2, 3].includes(question.difficulty));
    assert.equal(question.palette.length, 6);
    assert.match(question.art(), /<(?:path|circle|rect|ellipse|polygon|line)/);
  }
});

test('chaque question produit quatre choix uniques avec la bonne réponse', () => {
  for (const question of data) {
    const choices = core.buildOptions(question, core.mulberry32(core.hashString(question.id)));
    assert.equal(choices.length, 4);
    assert.equal(new Set(choices.map(({answer}) => answer)).size, 4);
    assert.ok(choices.some(({id}) => id === question.id));
  }
});

test('le RNG peut reprendre exactement depuis son état sauvegardé', () => {
  const rng = core.mulberry32(42);
  rng();
  const state = rng.getState();
  const expected = rng();
  assert.equal(core.mulberry32(state)(), expected);
});

test('la migration de profil neutralise les valeurs corrompues', () => {
  const profile = core.normalizeProfile({
    xp: -9,
    games: '7',
    unlocked: ['mario', 'mario', 'introuvable'],
    settings: {volume: 4, scale: 'géante'},
    achievements: ['first_game', 'inconnu']
  });
  assert.equal(profile.version, 3);
  assert.equal(profile.xp, 0);
  assert.equal(profile.games, 7);
  assert.deepEqual(Array.from(profile.unlocked), ['mario']);
  assert.equal(profile.settings.volume, 1);
  assert.equal(profile.settings.scale, 'normal');
  assert.deepEqual(Array.from(profile.achievements), ['first_game']);
});

test('les surfaces critiques et leurs libellés accessibles existent', () => {
  for (const id of ['home-screen','setup-screen','game-screen','result-screen','collection-screen','stats-screen','settings-screen','resume-card','onboarding-modal','feedback-continue','screen-announcer']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /Aller au contenu principal/);
});

test('le manifeste et le portable restent valides et autonomes', () => {
  const manifest = JSON.parse(manifestSource);
  assert.equal(manifest.lang, 'fr');
  assert.ok(manifest.start_url);
  assert.match(portable, /portable-build" content="1\.1\.0"/);
  assert.doesNotMatch(portable, /(?:src\/app\.js|src\/data\.js|src\/styles\.css|manifest\.webmanifest|assets\/icon\.svg)/);
});
