(() => {
  'use strict';

  const DATA = Array.from(window.OMBRE_GEEK_DATA || []);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const formatNumber = (value) => Math.max(0, Math.round(value || 0)).toLocaleString('fr-FR');
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const deepClone = (value) => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const APP_VERSION = '1.1.0';
  const STORAGE_KEY = 'ombre-geek-profile-v2';
  const SESSION_KEY = 'ombre-geek-session-v1';
  const CORRUPT_BACKUP_KEY = 'ombre-geek-profile-corrupt-backup';
  const PLAYER_COLORS = ['#16e0bd', '#ffd166', '#ff4d6d', '#a78bfa'];
  const PLAYER_KEYS = ['A', 'L', 'Q', 'M'];

  const MODE = {
    arcade: {
      name: 'Arcade', icon: '◈', kicker: 'MODE CLASSIQUE', color: '#16e0bd',
      description: 'Une série de silhouettes, un chrono par manche et un score qui récompense vitesse, précision et combos.',
      amounts: [{value:10,label:'10 manches — partie courte'},{value:20,label:'20 manches — format standard'},{value:30,label:'30 manches — marathon'}],
      rules: [['Chrono','7 à 15 secondes'],['Indices','3 par partie'],['Objectif','Meilleur score']]
    },
    chrono: {
      name: 'Contre-la-montre', icon: '◷', kicker: 'MODE SOUS PRESSION', color: '#ffd166',
      description: 'Le temps est global. Réponds vite pour afficher une nouvelle silhouette et battre ton record.',
      amounts: [{value:60,label:'60 secondes — sprint'},{value:90,label:'90 secondes — standard'},{value:120,label:'120 secondes — endurance'}],
      rules: [['Chrono','Temps global'],['Indices','2 par partie'],['Objectif','Maximum de réponses']]
    },
    survival: {
      name: 'Survie', icon: '♥', kicker: 'MODE SANS FIN', color: '#ff4d6d',
      description: 'Tu disposes de trois vies. La vitesse augmente et les effets de silhouette deviennent progressivement plus agressifs.',
      amounts: [{value:999,label:'Jusqu’à la dernière vie'}],
      rules: [['Vies','3 au départ'],['Difficulté','Progressive'],['Objectif','Tenir le plus longtemps']]
    },
    duel: {
      name: 'Duel local', icon: '⚡', kicker: 'MODE MULTIJOUEUR', color: '#8b5cf6',
      description: 'De deux à quatre joueurs partagent l’écran. Le premier à presser sa touche de buzz gagne le droit de répondre.',
      amounts: [{value:10,label:'10 manches'},{value:15,label:'15 manches'},{value:20,label:'20 manches'}],
      rules: [['Buzz','A · L · Q · M'],['Réponse','Touches 1 à 4'],['Victoire','Plus de points']]
    },
    daily: {
      name: 'Défi quotidien', icon: '◆', kicker: 'DÉFI DU JOUR', color: '#4cc9f0',
      description: 'Dix silhouettes déterminées par la date. Ton premier essai devient ton résultat officiel du jour.',
      amounts: [{value:10,label:'10 manches fixes'}],
      rules: [['Sélection','Identique aujourd’hui'],['Indices','2 par défi'],['Objectif','Score quotidien']]
    },
    training: {
      name: 'Entraînement', icon: '◎', kicker: 'MODE DÉTENTE', color: '#a8dadc',
      description: 'Aucun chronomètre. Étudie les formes, utilise les indices et complète tranquillement ta collection.',
      amounts: [{value:10,label:'10 silhouettes'},{value:20,label:'20 silhouettes'},{value:30,label:'30 silhouettes'}],
      rules: [['Chrono','Désactivé'],['Indices','5 par session'],['Objectif','Compléter la collection']]
    }
  };

  const DIFFICULTY = {
    easy: {name:'Facile', seconds:15, multiplier:1, maxQuestion:2, modifierChance:0},
    normal: {name:'Normal', seconds:12, multiplier:1.2, maxQuestion:3, modifierChance:.10},
    hard: {name:'Difficile', seconds:9, multiplier:1.55, maxQuestion:3, modifierChance:.42},
    expert: {name:'Expert', seconds:7, multiplier:2, maxQuestion:3, modifierChance:.75}
  };

  const DEFAULT_PROFILE = {
    version: 3,
    settings: {sound:true, volume:.7, vibration:true, autoAdvance:false, motion:true, contrast:false, scale:'normal'},
    unlocked: [],
    xp: 0,
    games: 0,
    abandoned: 0,
    correct: 0,
    answers: 0,
    bestCombo: 0,
    totalScore: 0,
    bestScores: {arcade:0, chrono:0, survival:0, duel:0, daily:0, training:0},
    bestRounds: {survival:0, chrono:0},
    daily: {date:'', score:0, completed:false, started:false},
    achievements: [],
    onboardingDone: false,
    lastPlayed: ''
  };

  const ACHIEVEMENTS = [
    {id:'first_game', title:'Première lumière', text:'Terminer une première partie.'},
    {id:'combo_5', title:'Vision nocturne', text:'Atteindre un combo de 5.'},
    {id:'collector_10', title:'Archiviste', text:'Révéler 10 silhouettes.'},
    {id:'survivor_10', title:'Insaisissable', text:'Trouver 10 réponses en Survie.'},
    {id:'daily_clear', title:'Rituel quotidien', text:'Terminer un défi quotidien officiel.'}
  ];

  let storageState = 'ok';
  let profile = loadProfile();
  let savedSessionSnapshot = loadSessionSnapshot();
  let currentScreen = 'home';
  let selectedMode = 'arcade';
  let session = null;
  let lastRunConfig = null;
  let audioContext = null;
  let resultAdvanceTimer = 0;
  let countdownTimer = 0;
  let countdownToken = 0;
  let lastFocusedElement = null;
  let activeDialog = null;
  let deferredInstallPrompt = null;

  function loadProfile() {
    let raw = '';
    try {
      raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const fresh = deepClone(DEFAULT_PROFILE);
        fresh.settings.motion = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        return fresh;
      }
      const parsed = JSON.parse(raw);
      return normalizeProfile(parsed);
    } catch (error) {
      console.warn('Sauvegarde illisible, profil réinitialisé.', error);
      storageState = 'warning';
      try {
        if (raw) localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      return deepClone(DEFAULT_PROFILE);
    }
  }

  function normalizeProfile(value) {
    const source = value && typeof value === 'object' ? value : {};
    const clean = deepClone(DEFAULT_PROFILE);
    const number = (input) => Number.isFinite(Number(input)) ? Math.max(0, Number(input)) : 0;
    clean.settings.sound = typeof source.settings?.sound === 'boolean' ? source.settings.sound : true;
    clean.settings.volume = clamp(Number(source.settings?.volume ?? .7) || 0, 0, 1);
    clean.settings.vibration = typeof source.settings?.vibration === 'boolean' ? source.settings.vibration : true;
    clean.settings.autoAdvance = Boolean(source.settings?.autoAdvance);
    clean.settings.motion = typeof source.settings?.motion === 'boolean' ? source.settings.motion : !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    clean.settings.contrast = Boolean(source.settings?.contrast);
    clean.settings.scale = ['compact','normal','large'].includes(source.settings?.scale) ? source.settings.scale : 'normal';
    clean.unlocked = Array.isArray(source.unlocked) ? [...new Set(source.unlocked)].filter((id) => DATA.some((q) => q.id === id)) : [];
    ['xp','games','abandoned','correct','answers','bestCombo','totalScore'].forEach((key) => { clean[key] = number(source[key]); });
    Object.keys(clean.bestScores).forEach((key) => { clean.bestScores[key] = number(source.bestScores?.[key]); });
    Object.keys(clean.bestRounds).forEach((key) => { clean.bestRounds[key] = number(source.bestRounds?.[key]); });
    clean.daily.date = typeof source.daily?.date === 'string' ? source.daily.date : '';
    clean.daily.score = number(source.daily?.score);
    clean.daily.completed = Boolean(source.daily?.completed);
    clean.daily.started = Boolean(source.daily?.started) && !clean.daily.completed;
    const validAchievements = new Set(ACHIEVEMENTS.map(({id}) => id));
    clean.achievements = Array.isArray(source.achievements) ? [...new Set(source.achievements)].filter((id) => validAchievements.has(id)) : [];
    clean.onboardingDone = Boolean(source.onboardingDone);
    clean.lastPlayed = typeof source.lastPlayed === 'string' ? source.lastPlayed : '';
    return clean;
  }

  function saveProfile() {
    try {
      profile = normalizeProfile(profile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      storageState = 'ok';
      updateSaveStatus();
      return true;
    } catch (error) {
      storageState = 'error';
      updateSaveStatus();
      console.warn('Sauvegarde locale indisponible.', error);
      return false;
    }
  }

  function loadSessionSnapshot() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!parsed || parsed.version !== 1 || !MODE[parsed.mode] || !parsed.savedAt) return null;
      if (Date.now() - parsed.savedAt > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return parsed;
    } catch (error) {
      console.warn('Partie sauvegardée illisible, reprise ignorée.', error);
      try { localStorage.removeItem(SESSION_KEY); } catch {}
      return null;
    }
  }

  function dateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    const rng = function rng() {
      let value = state = (state + 0x6D2B79F5) >>> 0;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
    rng.getState = () => state >>> 0;
    return rng;
  }

  function shuffle(items, rng = Math.random) {
    const array = [...items];
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function currentLevel() {
    return Math.floor(profile.xp / 1000) + 1;
  }

  function applySettings() {
    const {sound, volume, vibration, autoAdvance, motion, contrast, scale} = profile.settings;
    document.body.classList.toggle('sound-off', !sound);
    document.body.classList.toggle('no-motion', !motion);
    document.body.classList.toggle('high-contrast', contrast);
    document.body.classList.toggle('ui-compact', scale === 'compact');
    document.body.classList.toggle('ui-large', scale === 'large');
    $('#sound-toggle').textContent = sound ? '♪' : '×';
    $('#sound-toggle').setAttribute('aria-pressed', String(sound));
    $('#sound-toggle').setAttribute('aria-label', sound ? 'Couper les sons' : 'Activer les sons');
    $('#sound-toggle').title = sound ? 'Son activé' : 'Son coupé';
    $('#setting-sound').checked = sound;
    $('#setting-volume').value = Math.round(volume * 100);
    $('#setting-vibration').checked = vibration;
    $('#setting-auto-advance').checked = autoAdvance;
    $('#setting-motion').checked = motion;
    $('#setting-contrast').checked = contrast;
    $('#setting-scale').value = scale;
    updateSaveStatus();
  }

  function updateProfileUI() {
    const level = currentLevel();
    $('#profile-level').textContent = `NIV. ${level}`;
    $('#profile-xp').style.width = `${(profile.xp % 1000) / 10}%`;
    $('#profile-xp-track').setAttribute('aria-valuenow', String(Math.round(profile.xp % 1000)));
    $('#profile-xp-track').setAttribute('aria-valuetext', `${Math.round(profile.xp % 1000)} XP sur 1000 vers le niveau ${level + 1}`);
    $('#home-best').textContent = formatNumber(Math.max(...Object.values(profile.bestScores)));
    $('#home-unlocked').textContent = `${profile.unlocked.length}/${DATA.length}`;
    $('#home-accuracy').textContent = profile.answers ? `${Math.round(profile.correct / profile.answers * 100)} %` : '—';
    const today = dateKey();
    const dailyDone = profile.daily.date === today && profile.daily.completed;
    const dailyStarted = profile.daily.date === today && profile.daily.started && !dailyDone;
    $('#daily-status').textContent = dailyDone ? `TERMINÉ · ${formatNumber(profile.daily.score)}` : dailyStarted ? 'ESSAI EN COURS' : 'NOUVEL ESSAI';
    $('#daily-tag').textContent = dailyDone ? 'REJOUABLE HORS CLASSEMENT' : dailyStarted ? 'À REPRENDRE' : 'DÉFI DU JOUR';
    updateResumeCard();
    updateSaveStatus();
  }

  function updateSaveStatus() {
    const status = $('#save-status');
    if (!status) return;
    status.className = `save-status${storageState === 'ok' ? '' : ` ${storageState}`}`;
    status.textContent = storageState === 'error' ? 'SAUVEGARDE INDISPONIBLE' : storageState === 'warning' ? 'PROFIL RÉINITIALISÉ' : 'SAUVEGARDE LOCALE';
  }

  function updateResumeCard() {
    const card = $('#resume-card');
    if (!card) return;
    const snapshot = savedSessionSnapshot;
    card.classList.toggle('hidden', !snapshot);
    if (!snapshot) return;
    const total = snapshot.totalRounds === null ? '∞' : snapshot.totalRounds;
    const modeName = MODE[snapshot.mode]?.name || 'Partie';
    $('#resume-summary').textContent = `${modeName} · manche ${Math.max(1, snapshot.round || 1)}/${total} · ${formatNumber(snapshot.score)} points`;
  }

  function ensureAudio() {
    if (!profile.settings.sound) return null;
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      return audioContext;
    } catch { return null; }
  }

  function tone(frequency, duration = .08, type = 'sine', volume = .04, delay = 0) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume * profile.settings.volume, start + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
  }

  function sfx(name) {
    if (!profile.settings.sound) return;
    if (name === 'click') tone(420, .05, 'square', .025);
    if (name === 'start') { tone(330,.12,'sine',.045); tone(495,.15,'sine',.045,.10); }
    if (name === 'correct') { tone(523,.12,'triangle',.05); tone(659,.13,'triangle',.05,.08); tone(784,.18,'triangle',.045,.16); }
    if (name === 'wrong') { tone(180,.18,'sawtooth',.04); tone(120,.24,'sawtooth',.035,.1); }
    if (name === 'buzz') { tone(880,.09,'square',.045); tone(660,.08,'square',.035,.08); }
    if (name === 'tick') tone(760,.045,'square',.025);
    if (name === 'unlock') { tone(660,.12,'sine',.04); tone(880,.16,'sine',.04,.1); tone(1100,.22,'sine',.035,.2); }
    if (name === 'finish') { tone(392,.13,'triangle',.04); tone(523,.13,'triangle',.04,.1); tone(659,.2,'triangle',.04,.2); }
  }

  function vibrate(pattern = 12) {
    if (profile.settings.vibration && navigator.vibrate) navigator.vibrate(pattern);
  }

  function showScreen(name) {
    const target = $(`#${name}-screen`);
    if (!target) return;
    const changed = currentScreen !== name;
    $$('.screen').forEach((screen) => {
      const active = screen === target;
      screen.classList.toggle('active', active);
      screen.setAttribute('aria-hidden', String(!active));
    });
    currentScreen = name;
    window.scrollTo({top:0, behavior:profile.settings.motion ? 'smooth' : 'auto'});
    if (name === 'home') updateProfileUI();
    if (name === 'collection') renderCollection();
    if (name === 'stats') renderStats();
    if (changed) {
      const label = target.querySelector('h1, h2')?.textContent?.trim() || MODE[session?.mode]?.name || name;
      $('#screen-announcer').textContent = `Écran ${label}`;
      target.tabIndex = -1;
      requestAnimationFrame(() => target.focus({preventScroll:true}));
    }
  }

  function makeArtSvg(question, label = '') {
    const palette = question.palette || ['#fff','#aaa','#777','#555','#333','#111'];
    const variables = palette.map((value, index) => `--c${index + 1}:${value}`).join(';');
    return `<svg viewBox="0 0 400 400" style="${variables}" role="img" aria-label="${escapeHtml(label || question.answer)}"><g>${question.art()}</g></svg>`;
  }

  function populateCategorySelects() {
    const categories = [...new Set(DATA.map((q) => q.category))].sort((a,b) => a.localeCompare(b, 'fr'));
    const options = ['<option value="all">Toutes les catégories</option>', ...categories.map((category) => {
      const count = DATA.filter((q) => q.category === category).length;
      return `<option value="${escapeHtml(category)}">${escapeHtml(category)} · ${count}</option>`;
    })].join('');
    $('#setup-category').innerHTML = options;
    $('#collection-filter').innerHTML = `<option value="all">Toutes les catégories</option><option value="unlocked">Débloquées uniquement</option><option value="locked">Non découvertes</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}`;
  }

  function openSetup(mode) {
    if (mode === 'daily' && savedSessionSnapshot?.mode === 'daily' && savedSessionSnapshot.officialDaily && profile.daily.date === dateKey() && profile.daily.started) {
      showScreen('home');
      toast('Défi quotidien en cours', 'Reprends ton essai officiel depuis la sauvegarde affichée.');
      requestAnimationFrame(() => $('#continue-game').focus());
      return;
    }
    selectedMode = mode;
    const config = MODE[mode];
    const intro = $('.setup-intro');
    intro.style.setProperty('--mode-color', config.color);
    $('#setup-icon').textContent = config.icon;
    $('#setup-kicker').textContent = config.kicker;
    $('#setup-title').textContent = config.name;
    $('#setup-description').textContent = config.description;
    $('#setup-preview').innerHTML = [
      `${DATA.length} silhouettes`,
      `${new Set(DATA.map((q) => q.category)).size} catégories`,
      'Illustrations vectorielles',
      'Sauvegarde locale'
    ].map((item) => `<span>${item}</span>`).join('');
    $('#setup-rules').innerHTML = config.rules.map(([title, text]) => `<div><strong>${title}</strong><span>${text}</span></div>`).join('');
    $('#amount-label').textContent = mode === 'chrono' ? 'Durée de la partie' : 'Nombre de manches';
    $('#amount-field').classList.toggle('hidden', mode === 'survival');
    $('#players-section').classList.toggle('hidden', mode !== 'duel');
    $('#difficulty-field').classList.toggle('hidden', mode === 'daily');
    $('#category-field').classList.toggle('hidden', mode === 'daily');
    if (mode === 'daily') {
      $('#setup-difficulty').value = 'normal';
      $('#setup-category').value = 'all';
    }
    if (mode === 'training') $('#setup-difficulty').value = 'normal';
    syncSetupAmounts();
    updatePlayerFields();
    showScreen('setup');
  }

  function syncSetupAmounts() {
    const config = MODE[selectedMode];
    const category = selectedMode === 'daily' ? 'all' : $('#setup-category').value;
    let amounts = [...config.amounts];
    if (!['chrono','survival','daily'].includes(selectedMode) && category !== 'all') {
      const count = DATA.filter((question) => question.category === category).length;
      amounts = amounts.filter(({value}) => value <= count);
      if (!amounts.some(({value}) => value === count)) amounts.push({value:count, label:`${count} silhouette${count > 1 ? 's' : ''} — intégrale de la catégorie`});
      amounts.sort((a,b) => a.value - b.value);
    }
    $('#setup-amount').innerHTML = amounts.map(({value,label}) => `<option value="${value}">${label}</option>`).join('');
  }

  function updatePlayerFields() {
    const count = Number($('#player-count').value || 2);
    const previousNames = $$('.player-field input').map((input) => input.value);
    $('#player-fields').innerHTML = Array.from({length:count}, (_, index) => `
      <label class="player-field" style="--player-color:${PLAYER_COLORS[index]}">
        <span>${index + 1}</span>
        <input type="text" maxlength="14" value="${escapeHtml(previousNames[index] || `Joueur ${index + 1}`)}" aria-label="Nom du joueur ${index + 1}">
        <kbd>${PLAYER_KEYS[index]}</kbd>
      </label>`).join('');
  }

  function getEligibleQuestions(category, difficulty) {
    const diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    let pool = DATA.filter((question) => question.difficulty <= diff.maxQuestion);
    if (category && category !== 'all') pool = pool.filter((question) => question.category === category);
    return pool.length ? pool : DATA.filter((question) => category === 'all' || question.category === category);
  }

  function buildOptions(question, rng = Math.random) {
    const candidates = DATA.filter((item) => item.id !== question.id && item.answer !== question.answer).map((item) => {
      let score = rng() * 1.2;
      if (item.category === question.category) score += 4;
      if (item.universe === question.universe) score += 2.2;
      if (item.franchise === question.franchise) score += 1.6;
      if (Math.abs(item.difficulty - question.difficulty) <= 1) score += 1;
      return {item, score};
    }).sort((a,b) => b.score - a.score);
    const chosen = [];
    for (const entry of candidates) {
      if (!chosen.some((item) => item.answer === entry.item.answer)) chosen.push(entry.item);
      if (chosen.length === 3) break;
    }
    return shuffle([question, ...chosen], rng);
  }

  function refillQueue() {
    if (!session) return;
    let next = shuffle(session.pool, session.rng);
    if (session.current && next[0]?.id === session.current.id && next.length > 1) [next[0], next[1]] = [next[1], next[0]];
    session.queue.push(...next);
  }

  function parseStartOptions() {
    const mode = selectedMode;
    const names = mode === 'duel' ? $$('.player-field input').map((input, index) => input.value.trim() || `Joueur ${index + 1}`) : [];
    return {
      category: mode === 'daily' ? 'all' : $('#setup-category').value,
      difficulty: mode === 'daily' ? 'normal' : $('#setup-difficulty').value,
      amount: Number($('#setup-amount').value || MODE[mode].amounts[0].value),
      playerCount: mode === 'duel' ? Number($('#player-count').value) : 1,
      names
    };
  }

  function createSessionSnapshot() {
    if (!session || session.finished) return null;
    return {
      version: 1,
      appVersion: APP_VERSION,
      savedAt: Date.now(),
      mode: session.mode,
      options: deepClone(session.options),
      seed: session.seed >>> 0,
      rngState: session.rng.getState?.() ?? session.seed,
      pool: session.pool.map(({id}) => id),
      queue: session.queue.map(({id}) => id),
      current: session.current?.id || '',
      choices: session.choices.map(({id}) => id),
      round: session.round,
      totalRounds: Number.isFinite(session.totalRounds) ? session.totalRounds : null,
      score: session.score,
      correct: session.correct,
      wrong: session.wrong,
      skipped: session.skipped,
      combo: session.combo,
      maxCombo: session.maxCombo,
      lives: session.lives,
      hints: session.hints,
      hintStep: session.hintStep,
      roundHints: session.roundHints,
      answered: session.answered,
      paused: session.paused,
      roundDuration: session.roundDuration,
      roundRemaining: session.roundRemaining,
      globalDuration: session.globalDuration,
      globalRemaining: session.globalRemaining,
      tickSecond: session.tickSecond,
      modifier: session.modifier,
      officialDaily: session.officialDaily,
      rankedRun: session.rankedRun,
      buzzed: session.buzzed,
      players: deepClone(session.players)
    };
  }

  function saveSessionCheckpoint() {
    const snapshot = createSessionSnapshot();
    if (!snapshot) return;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
      savedSessionSnapshot = snapshot;
      updateResumeCard();
    } catch (error) {
      storageState = 'error';
      updateSaveStatus();
      console.warn('Reprise de partie indisponible.', error);
    }
  }

  function clearSessionSnapshot() {
    savedSessionSnapshot = null;
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    updateResumeCard();
  }

  function abandonRun(run = session) {
    if (!run) return;
    if (run.rankedRun !== false) {
      profile.games += 1;
      profile.abandoned += 1;
      profile.totalScore += Math.max(0, Number(run.score) || 0);
    }
    if (run.mode === 'daily' && run.officialDaily && profile.daily.date === dateKey() && profile.daily.started) {
      profile.daily = {date:dateKey(), score:0, completed:true, started:false};
    }
    profile.lastPlayed = new Date().toISOString();
    saveProfile();
  }

  function restoreSavedGame() {
    const snapshot = savedSessionSnapshot;
    if (!snapshot || !MODE[snapshot.mode]) return;
    const byId = new Map(DATA.map((question) => [question.id, question]));
    const pool = (snapshot.pool || []).map((id) => byId.get(id)).filter(Boolean);
    const seed = Number(snapshot.seed) >>> 0;
    const rng = mulberry32(Number(snapshot.rngState ?? seed) >>> 0);
    session = {
      mode: snapshot.mode,
      options: deepClone(snapshot.options || {}),
      seed,
      rng,
      pool: pool.length ? pool : getEligibleQuestions(snapshot.options?.category, snapshot.options?.difficulty),
      queue: (snapshot.queue || []).map((id) => byId.get(id)).filter(Boolean),
      current: byId.get(snapshot.current) || null,
      choices: (snapshot.choices || []).map((id) => byId.get(id)).filter(Boolean),
      round: Math.max(0, Number(snapshot.round) || 0),
      totalRounds: snapshot.totalRounds === null ? Infinity : Math.max(1, Number(snapshot.totalRounds) || 1),
      score: Math.max(0, Number(snapshot.score) || 0),
      correct: Math.max(0, Number(snapshot.correct) || 0),
      wrong: Math.max(0, Number(snapshot.wrong) || 0),
      skipped: Math.max(0, Number(snapshot.skipped) || 0),
      combo: Math.max(0, Number(snapshot.combo) || 0),
      maxCombo: Math.max(0, Number(snapshot.maxCombo) || 0),
      lives: Number(snapshot.lives) || 0,
      hints: Math.max(0, Number(snapshot.hints) || 0),
      hintStep: Math.max(0, Number(snapshot.hintStep) || 0),
      roundHints: Math.max(0, Number(snapshot.roundHints) || 0),
      answered: Boolean(snapshot.answered),
      paused: true,
      finished: false,
      startedAt: performance.now(),
      roundDuration: Number(snapshot.roundDuration) || 0,
      roundRemaining: Math.max(0, Number(snapshot.roundRemaining) || 0),
      globalDuration: Math.max(0, Number(snapshot.globalDuration) || 0),
      globalRemaining: Math.max(0, Number(snapshot.globalRemaining) || 0),
      lastTick: 0,
      raf: 0,
      feedbackTimer: 0,
      hintFlashTimer: 0,
      tickSecond: snapshot.tickSecond,
      modifier: snapshot.modifier || '',
      officialDaily: Boolean(snapshot.officialDaily),
      rankedRun: snapshot.rankedRun !== false,
      buzzed: Number.isInteger(snapshot.buzzed) ? snapshot.buzzed : null,
      buzzLockUntil: 0,
      players: Array.isArray(snapshot.players) ? deepClone(snapshot.players) : []
    };
    if (session.current && session.choices.length !== 4) session.choices = buildOptions(session.current, session.rng);
    lastRunConfig = {mode:session.mode, options:deepClone(session.options)};
    showScreen('game');
    resetGameDisplay();
    if (session.answered) continueAfterFeedback();
    else if (session.current) renderQuestion();
    else nextQuestion();
    session.paused = true;
    $('#pause-title').textContent = 'Partie retrouvée';
    $('#pause-copy').textContent = 'Ta session a été restaurée au dernier état sûr. Le chrono est en pause.';
    openDialog($('#pause-modal'), $('#resume-button'));
    saveSessionCheckpoint();
  }

  function discardSavedGame() {
    const snapshot = savedSessionSnapshot;
    if (!snapshot) return;
    if (!window.confirm('Abandonner cette partie sauvegardée ? Un défi quotidien officiel sera compté comme terminé avec 0 point.')) return;
    abandonRun(snapshot);
    clearSessionSnapshot();
    updateProfileUI();
    toast('Partie abandonnée', 'La sauvegarde de session a été supprimée.');
  }

  function startGame(mode, options) {
    clearSessionTimers();
    const today = dateKey();
    const canonicalOptions = mode === 'daily' ? {...options, category:'all', difficulty:'normal', amount:10} : {...options};
    const currentDaily = profile.daily.date === today;
    const officialDaily = mode === 'daily' && !(currentDaily && (profile.daily.completed || profile.daily.started));
    if (mode === 'daily' && officialDaily) {
      profile.daily = {date:today, score:0, completed:false, started:true};
      saveProfile();
    }
    const seed = mode === 'daily' ? hashString(`OMBRE-GEEK-${today}`) : (Date.now() ^ Math.floor(Math.random() * 0xffffffff));
    const rng = mulberry32(seed >>> 0);
    const pool = getEligibleQuestions(canonicalOptions.category, canonicalOptions.difficulty);
    session = {
      mode,
      options: canonicalOptions,
      seed: seed >>> 0,
      rng,
      pool,
      queue: [],
      current: null,
      choices: [],
      round: 0,
      totalRounds: mode === 'daily' ? 10 : (mode === 'survival' || mode === 'chrono' ? Infinity : canonicalOptions.amount),
      score: 0,
      correct: 0,
      wrong: 0,
      skipped: 0,
      combo: 0,
      maxCombo: 0,
      lives: mode === 'survival' ? 3 : 0,
      hints: mode === 'training' ? 5 : (mode === 'chrono' || mode === 'daily' ? 2 : 3),
      hintStep: 0,
      roundHints: 0,
      answered: false,
      paused: false,
      finished: false,
      startedAt: performance.now(),
      roundDuration: 0,
      roundRemaining: 0,
      globalDuration: mode === 'chrono' ? canonicalOptions.amount : 0,
      globalRemaining: mode === 'chrono' ? canonicalOptions.amount : 0,
      lastTick: 0,
      raf: 0,
      feedbackTimer: 0,
      hintFlashTimer: 0,
      tickSecond: null,
      modifier: '',
      officialDaily,
      rankedRun: mode !== 'daily' || officialDaily,
      buzzed: null,
      buzzLockUntil: 0,
      players: mode === 'duel' ? canonicalOptions.names.map((name, index) => ({name, key:PLAYER_KEYS[index], color:PLAYER_COLORS[index], points:0, score:0})) : []
    };
    lastRunConfig = {mode, options:deepClone(canonicalOptions)};
    refillQueue();
    saveSessionCheckpoint();
    showScreen('game');
    resetGameDisplay();
    beginCountdown(() => {
      if (!session) return;
      nextQuestion();
    });
  }

  function beginCountdown(callback) {
    clearTimeout(countdownTimer);
    const token = ++countdownToken;
    const overlay = $('#countdown-overlay');
    const value = $('#countdown-value');
    overlay.classList.remove('hidden');
    let count = 3;
    const show = () => {
      if (token !== countdownToken || !session) return;
      if (count < 0) {
        overlay.classList.add('hidden');
        callback();
        return;
      }
      value.textContent = count > 0 ? count : 'GO';
      value.style.animation = 'none';
      void value.offsetWidth;
      value.style.animation = '';
      if (count > 0) sfx('tick'); else sfx('start');
      count -= 1;
      countdownTimer = window.setTimeout(show, count === -1 ? 480 : 700);
    };
    show();
  }

  function resetGameDisplay() {
    $('#hud-mode').textContent = MODE[session.mode].name.toUpperCase();
    $('#hud-score').textContent = '000000';
    $('#hud-round').textContent = session.mode === 'chrono' || session.mode === 'survival' ? '00' : `00 / ${String(session.totalRounds).padStart(2,'0')}`;
    $('#combo-pill').classList.remove('visible','hot');
    $('#life-row').innerHTML = '';
    $('#hint-reveal').textContent = '';
    $('#answer-grid').innerHTML = '';
    $('#round-feedback').classList.add('hidden');
    $('#duel-scoreboard').classList.toggle('hidden', session.mode !== 'duel');
    $('#duel-prompt').classList.toggle('hidden', session.mode !== 'duel');
    $('#hint-button').classList.toggle('hidden', session.mode === 'duel');
    $('#skip-button').classList.toggle('hidden', session.mode === 'duel');
    updateHintsUI();
    renderLives();
    renderDuelScoreboard();
  }

  function nextQuestion() {
    if (!session || session.finished) return;
    clearTimeout(session.feedbackTimer);
    if (session.mode !== 'chrono' && session.mode !== 'survival' && session.round >= session.totalRounds) return finishGame();
    if (session.mode === 'survival' && session.lives <= 0) return finishGame();
    if (!session.queue.length) refillQueue();
    const question = session.queue.shift();
    session.current = question;
    session.round += 1;
    session.choices = buildOptions(question, session.rng);
    session.answered = false;
    session.hintStep = 0;
    session.roundHints = 0;
    session.buzzed = null;
    session.buzzLockUntil = performance.now() + 700;
    const diff = DIFFICULTY[session.options.difficulty] || DIFFICULTY.normal;
    const escalation = session.mode === 'survival' ? Math.floor((session.round - 1) / 5) * .65 : 0;
    session.roundDuration = session.mode === 'training' ? Infinity : Math.max(4.5, diff.seconds - escalation);
    session.roundRemaining = session.mode === 'duel' ? Math.min(12, session.roundDuration + 3) : session.roundDuration;
    session.tickSecond = Math.ceil(session.mode === 'chrono' ? session.globalRemaining : session.roundRemaining);
    session.modifier = chooseModifier(diff, session.round);
    renderQuestion();
    startTicker();
    saveSessionCheckpoint();
  }

  function chooseModifier(diff, round) {
    let chance = diff.modifierChance;
    if (session.mode === 'survival') chance = clamp(chance + Math.floor((round - 1) / 5) * .1, 0, .92);
    if (session.rng() > chance) return '';
    const pool = session.options.difficulty === 'expert' ? ['mirror','tilt','crop','fog'] : ['mirror','tilt','fog'];
    return pool[Math.floor(session.rng() * pool.length)];
  }

  function renderQuestion() {
    const q = session.current;
    const stage = $('#art-stage');
    stage.className = 'art-stage silhouette';
    if (session.modifier) stage.classList.add(`modifier-${session.modifier}`);
    $('#art-holder').innerHTML = makeArtSvg(q, 'Silhouette à reconnaître');
    $('#question-category').textContent = q.category.toUpperCase();
    $('#question-difficulty').textContent = '★'.repeat(q.difficulty) + '☆'.repeat(3 - q.difficulty);
    $('#question-title').textContent = session.mode === 'duel' ? 'Buzzez pour répondre' : 'Choisis une réponse';
    $('#hint-reveal').textContent = '';
    $('#round-feedback').className = 'round-feedback hidden';
    const showFranchise = session.options.difficulty !== 'expert';
    $('#answer-grid').innerHTML = session.choices.map((choice, index) => `
      <button class="answer-button${session.mode === 'duel' ? ' locked' : ''}" data-answer="${index}" aria-label="Réponse ${index + 1} : ${escapeHtml(choice.answer)}${showFranchise ? `, ${escapeHtml(choice.franchise)}` : ''}" ${session.mode === 'duel' ? 'disabled' : ''}>
        <span class="answer-index">${index + 1}</span>
        <span class="answer-copy"><strong>${escapeHtml(choice.answer)}</strong>${showFranchise ? `<span>${escapeHtml(choice.franchise)}</span>` : ''}</span>
      </button>`).join('');
    $$('.answer-button').forEach((button) => button.addEventListener('click', () => answerQuestion(Number(button.dataset.answer))));
    $('#hud-round').textContent = session.totalRounds === Infinity ? String(session.round).padStart(2,'0') : `${String(session.round).padStart(2,'0')} / ${String(session.totalRounds).padStart(2,'0')}`;
    updateScoreUI();
    updateComboUI();
    updateHintsUI();
    renderLives();
    if (session.mode === 'duel') {
      renderDuelScoreboard();
      const prompt = $('#duel-prompt');
      prompt.className = 'duel-prompt';
      prompt.style.removeProperty('--player-color');
      prompt.innerHTML = session.players.map((player) => `<kbd>${player.key}</kbd> ${escapeHtml(player.name)}`).join(' &nbsp;·&nbsp; ');
    }
    updateTimerUI();
  }

  function startTicker() {
    cancelAnimationFrame(session?.raf || 0);
    if (!session || session.paused || session.answered || session.mode === 'training') return;
    session.lastTick = performance.now();
    session.raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    if (!session || session.paused || session.finished || (session.answered && session.mode !== 'chrono')) return;
    const delta = Math.max(0, (now - session.lastTick) / 1000);
    session.lastTick = now;
    if (session.mode === 'chrono') session.globalRemaining = Math.max(0, session.globalRemaining - delta);
    else session.roundRemaining = Math.max(0, session.roundRemaining - delta);
    const remaining = session.mode === 'chrono' ? session.globalRemaining : session.roundRemaining;
    const second = Math.ceil(remaining);
    if (second <= 3 && second > 0 && session.tickSecond !== second) sfx('tick');
    if (session.tickSecond !== second) saveSessionCheckpoint();
    session.tickSecond = second;
    updateTimerUI();
    if (remaining <= 0) {
      if (session.mode === 'chrono') finishGame();
      else handleTimeout();
      return;
    }
    session.raf = requestAnimationFrame(tick);
  }

  function updateTimerUI() {
    if (!session) return;
    let remaining;
    let duration;
    if (session.mode === 'training') {
      $('#timer-value').textContent = '∞';
      $('#timer-fill').style.width = '100%';
      $('#timer-track').setAttribute('aria-valuetext', 'Chronomètre désactivé');
      $('#timer-track').setAttribute('aria-valuenow', '1');
      $('#timer-track').setAttribute('aria-valuemax', '1');
      return;
    }
    if (session.mode === 'chrono') {
      remaining = session.globalRemaining;
      duration = session.globalDuration;
    } else {
      remaining = session.roundRemaining;
      duration = session.mode === 'duel' ? Math.max(6, session.roundDuration + 3) : session.roundDuration;
    }
    $('#timer-value').textContent = remaining.toFixed(1);
    const ratio = clamp(remaining / duration, 0, 1);
    $('#timer-fill').style.width = `${ratio * 100}%`;
    $('#timer-value').style.color = ratio < .25 ? 'var(--danger)' : ratio < .55 ? 'var(--warning)' : 'var(--cyan)';
    $('#timer-track').setAttribute('aria-valuemax', String(Math.round(duration * 10)));
    $('#timer-track').setAttribute('aria-valuenow', String(Math.round(remaining * 10)));
    $('#timer-track').setAttribute('aria-valuetext', `${remaining.toFixed(1)} secondes restantes`);
  }

  function handleTimeout() {
    if (!session || session.answered) return;
    processAnswer({selectedIndex:-1, timedOut:true});
  }

  function answerQuestion(index) {
    if (!session || session.answered || session.paused) return;
    if (session.mode === 'duel' && session.buzzed === null) {
      toast('Il faut buzzer', 'Presse la touche de ton joueur avant de choisir.');
      return;
    }
    processAnswer({selectedIndex:index, timedOut:false});
  }

  function processAnswer({selectedIndex, timedOut = false, skipped = false}) {
    if (!session || session.answered) return;
    session.answered = true;
    cancelAnimationFrame(session.raf);
    const selected = selectedIndex >= 0 ? session.choices[selectedIndex] : null;
    const correct = !skipped && selected?.id === session.current.id;
    const correctIndex = session.choices.findIndex((choice) => choice.id === session.current.id);
    const remainingRatio = session.mode === 'training' ? 1 : session.mode === 'chrono' ? 1 : clamp(session.roundRemaining / session.roundDuration, 0, 1);
    let points = 0;

    if (session.rankedRun) profile.answers += 1;
    if (correct) {
      session.correct += 1;
      session.combo += 1;
      session.maxCombo = Math.max(session.maxCombo, session.combo);
      if (session.rankedRun) {
        profile.correct += 1;
        profile.bestCombo = Math.max(profile.bestCombo, session.combo);
      }
      points = calculatePoints(remainingRatio);
      session.score += points;
      if (session.rankedRun) profile.xp += 70 + Math.min(session.combo, 10) * 5;
      unlockQuestion(session.current, session.rankedRun);
      if (session.mode === 'duel' && session.buzzed !== null) {
        session.players[session.buzzed].points += 1;
        session.players[session.buzzed].score += points;
      }
      sfx('correct');
      vibrate(18);
      if (session.rankedRun && session.combo >= 5) awardAchievement('combo_5');
      if (session.combo > 0 && session.combo % 5 === 0) confetti(18);
    } else {
      if (skipped) session.skipped += 1; else session.wrong += 1;
      session.combo = 0;
      if (session.mode === 'survival') session.lives -= 1;
      if (session.mode === 'duel' && session.buzzed !== null) {
        session.players[session.buzzed].points -= 1;
      }
      sfx('wrong');
      vibrate([25, 35, 25]);
    }
    if (skipped && session.mode !== 'training') session.score = Math.max(0, session.score - 250);

    const stage = $('#art-stage');
    stage.className = 'art-stage revealed';
    $$('.answer-button').forEach((button, index) => {
      button.disabled = true;
      button.classList.remove('locked');
      if (index === correctIndex) button.classList.add('correct');
      if (!correct && index === selectedIndex) button.classList.add('wrong');
    });
    updateScoreUI();
    updateComboUI();
    renderLives();
    renderDuelScoreboard();
    showFeedback(correct, points, {timedOut, skipped});
    saveProfile();
    saveSessionCheckpoint();
    if (session.mode === 'chrono') {
      session.lastTick = performance.now();
      session.raf = requestAnimationFrame(tick);
    }
    if (session.mode === 'chrono' || profile.settings.autoAdvance) {
      const delay = session.mode === 'chrono' ? 900 : 3600;
      session.feedbackTimer = window.setTimeout(continueAfterFeedback, delay);
    } else {
      requestAnimationFrame(() => $('#feedback-continue').focus());
    }
  }

  function calculatePoints(timeRatio) {
    const diff = DIFFICULTY[session.options.difficulty] || DIFFICULTY.normal;
    const timeFactor = .35 + timeRatio * .65;
    const comboFactor = 1 + Math.min(session.combo - 1, 10) * .08;
    const hintPenalty = Math.max(.45, 1 - session.roundHints * .18);
    const modeFactor = session.mode === 'survival' ? 1.12 : session.mode === 'daily' ? 1.08 : session.mode === 'training' ? .35 : 1;
    return Math.round(1000 * timeFactor * diff.multiplier * comboFactor * hintPenalty * modeFactor / 10) * 10;
  }

  function showFeedback(correct, points, {timedOut, skipped}) {
    const feedback = $('#round-feedback');
    feedback.className = `round-feedback${correct ? '' : ' wrong'}`;
    $('#feedback-icon').textContent = correct ? '✓' : skipped ? '↷' : timedOut ? '⌛' : '×';
    $('#feedback-title').textContent = correct ? 'Bonne réponse !' : skipped ? 'Silhouette passée' : timedOut ? 'Temps écoulé' : 'Mauvaise réponse';
    const prefix = session.mode === 'duel' && session.buzzed !== null ? `${session.players[session.buzzed].name} · ` : '';
    $('#feedback-text').textContent = `${prefix}${session.current.answer} — ${session.current.franchise}. ${session.current.fact}`;
    $('#feedback-points').textContent = correct ? `+${formatNumber(points)}` : skipped && session.mode !== 'training' ? '−250' : '0';
  }

  function continueAfterFeedback() {
    if (!session || !session.answered || session.finished) return;
    clearTimeout(session.feedbackTimer);
    if (session.mode === 'survival' && session.lives <= 0) finishGame();
    else if (session.mode !== 'chrono' && session.mode !== 'survival' && session.round >= session.totalRounds) finishGame();
    else nextQuestion();
  }

  function updateScoreUI() {
    if (!session) return;
    $('#hud-score').textContent = String(Math.max(0, Math.round(session.score))).padStart(6, '0');
  }

  function updateComboUI() {
    if (!session) return;
    const pill = $('#combo-pill');
    pill.textContent = `COMBO ×${Math.max(1, session.combo)}`;
    pill.classList.toggle('visible', session.combo >= 2);
    pill.classList.toggle('hot', session.combo >= 5);
  }

  function renderLives() {
    const row = $('#life-row');
    if (!session || session.mode !== 'survival') {
      row.innerHTML = '';
      row.classList.add('hidden');
      return;
    }
    row.classList.remove('hidden');
    row.innerHTML = Array.from({length:3}, (_, index) => `<span class="${index >= session.lives ? 'lost' : ''}">♥</span>`).join('');
    row.setAttribute('aria-label', `${Math.max(0, session.lives)} vie${session.lives > 1 ? 's' : ''} restante${session.lives > 1 ? 's' : ''}`);
  }

  function updateHintsUI() {
    if (!session) return;
    $('#hint-count').textContent = session.hints;
    $('#hint-button').disabled = session.hints <= 0 || session.answered;
  }

  function useHint() {
    if (!session || session.answered || session.paused || session.mode === 'duel') return;
    if (session.hints <= 0) {
      toast('Plus d’indice', 'Tu as utilisé tous les indices de cette session.');
      return;
    }
    session.hints -= 1;
    session.roundHints += 1;
    const step = session.hintStep % 3;
    session.hintStep += 1;
    if (step === 0) {
      $('#hint-reveal').textContent = `LICENCE : ${session.current.franchise.toUpperCase()}`;
      toast('Indice de licence', session.current.franchise);
    } else if (step === 1) {
      const wrongButtons = $$('.answer-button').filter((button, index) => session.choices[index].id !== session.current.id && !button.classList.contains('removed'));
      shuffle(wrongButtons, session.rng).slice(0, Math.min(2, wrongButtons.length)).forEach((button) => {
        button.classList.add('removed');
        button.disabled = true;
      });
      toast('50 / 50', 'Deux mauvaises réponses ont été éliminées.');
    } else {
      const stage = $('#art-stage');
      stage.classList.remove('silhouette');
      stage.classList.add('revealed');
      toast('Flash couleur', 'La silhouette se révèle pendant un bref instant.');
      clearTimeout(session.hintFlashTimer);
      session.hintFlashTimer = window.setTimeout(() => {
        if (session && !session.answered) {
          stage.classList.remove('revealed');
          stage.classList.add('silhouette');
          if (session.modifier) stage.classList.add(`modifier-${session.modifier}`);
        }
      }, 850);
    }
    sfx('click');
    updateHintsUI();
    saveSessionCheckpoint();
  }

  function skipQuestion() {
    if (!session || session.answered || session.mode === 'duel') return;
    processAnswer({selectedIndex:-1, skipped:true});
  }

  function unlockQuestion(question, awardXp = true) {
    if (profile.unlocked.includes(question.id)) return;
    profile.unlocked.push(question.id);
    if (awardXp) profile.xp += 120;
    sfx('unlock');
    toast('Nouvelle fiche débloquée', `${question.answer} rejoint ta collection.`);
    if (profile.unlocked.length >= 10) awardAchievement('collector_10');
  }

  function awardAchievement(id) {
    if (profile.achievements.includes(id)) return false;
    const achievement = ACHIEVEMENTS.find((item) => item.id === id);
    if (!achievement) return false;
    profile.achievements.push(id);
    toast(`Succès · ${achievement.title}`, achievement.text);
    sfx('unlock');
    return true;
  }

  function buzzPlayer(index) {
    if (!session || session.mode !== 'duel' || session.answered || session.paused || session.buzzed !== null) return;
    if (performance.now() < session.buzzLockUntil) return;
    if (!session.players[index]) return;
    session.buzzed = index;
    session.roundRemaining = Math.min(session.roundRemaining, 6);
    $$('.answer-button').forEach((button) => { button.disabled = false; button.classList.remove('locked'); });
    const prompt = $('#duel-prompt');
    prompt.className = 'duel-prompt buzzed';
    prompt.style.setProperty('--player-color', session.players[index].color);
    prompt.textContent = `${session.players[index].name.toUpperCase()} A BUZZÉ · RÉPONDS AVEC 1–4`;
    $('#question-title').textContent = `${session.players[index].name}, choisis !`;
    renderDuelScoreboard();
    sfx('buzz');
    vibrate(16);
    saveSessionCheckpoint();
  }

  function renderDuelScoreboard() {
    const board = $('#duel-scoreboard');
    if (!session || session.mode !== 'duel') {
      board.classList.add('hidden');
      return;
    }
    board.classList.remove('hidden');
    board.innerHTML = session.players.map((player, index) => `
      <button class="duel-player${session.buzzed === index ? ' active' : ''}" data-player="${index}" style="--player-color:${player.color}" aria-label="${escapeHtml(player.name)}, buzzer avec ${player.key}">
        <span>${escapeHtml(player.name)} <kbd>${player.key}</kbd></span><strong>${player.points}</strong>
      </button>`).join('');
    $$('.duel-player', board).forEach((button) => button.addEventListener('click', () => buzzPlayer(Number(button.dataset.player))));
  }

  function openDialog(dialog, focusTarget) {
    if (!dialog) return;
    if (activeDialog && activeDialog !== dialog) closeDialog(activeDialog, false);
    if (!dialog.contains(document.activeElement)) lastFocusedElement = document.activeElement;
    activeDialog = dialog;
    dialog.classList.remove('hidden');
    $('#main-content').inert = true;
    $('.topbar').inert = true;
    document.body.classList.add('dialog-open');
    requestAnimationFrame(() => focusTarget?.focus());
  }

  function closeDialog(dialog = activeDialog, restoreFocus = true) {
    if (!dialog) return;
    dialog.classList.add('hidden');
    if (activeDialog === dialog) activeDialog = null;
    $('#main-content').inert = false;
    $('.topbar').inert = false;
    document.body.classList.remove('dialog-open');
    if (restoreFocus) requestAnimationFrame(() => lastFocusedElement?.focus?.());
  }

  function trapDialogFocus(event) {
    if (!activeDialog || event.key !== 'Tab') return;
    const focusable = $$('button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])', activeDialog).filter((element) => !element.closest('.hidden'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function pauseGame() {
    if (!session || session.finished || session.paused) return;
    session.paused = true;
    cancelAnimationFrame(session.raf);
    clearTimeout(session.feedbackTimer);
    $('#pause-title').textContent = 'Pause';
    $('#pause-copy').textContent = 'Ta progression est sauvegardée. Le chrono reprendra avec toi.';
    saveSessionCheckpoint();
    openDialog($('#pause-modal'), $('#resume-button'));
  }

  function resumeGame() {
    if (!session || !session.paused) return;
    session.paused = false;
    closeDialog($('#pause-modal'));
    if (!session.answered || session.mode === 'chrono') startTicker();
    if (session.answered && (session.mode === 'chrono' || profile.settings.autoAdvance)) {
      session.feedbackTimer = window.setTimeout(continueAfterFeedback, session.mode === 'chrono' ? 900 : 3600);
    }
    saveSessionCheckpoint();
  }

  function quitGame() {
    abandonRun(session);
    clearSessionTimers();
    clearSessionSnapshot();
    session = null;
    closeDialog($('#pause-modal'), false);
    showScreen('home');
    toast('Partie abandonnée', 'Le score partiel a été archivé dans tes statistiques.');
  }

  function clearSessionTimers() {
    ++countdownToken;
    clearTimeout(countdownTimer);
    $('#countdown-overlay')?.classList.add('hidden');
    if (session) {
      cancelAnimationFrame(session.raf || 0);
      clearTimeout(session.feedbackTimer || 0);
      clearTimeout(session.hintFlashTimer || 0);
    }
    clearTimeout(resultAdvanceTimer);
  }

  function finishGame() {
    if (!session || session.finished) return;
    session.finished = true;
    clearSessionTimers();
    profile.lastPlayed = new Date().toISOString();
    const previousBest = profile.bestScores[session.mode] || 0;
    const isBest = session.rankedRun && session.score > previousBest;
    if (session.rankedRun) {
      profile.games += 1;
      profile.totalScore += Math.max(0, session.score);
      if (isBest) profile.bestScores[session.mode] = Math.round(session.score);
      if (session.mode === 'survival') profile.bestRounds.survival = Math.max(profile.bestRounds.survival || 0, session.correct);
      if (session.mode === 'chrono') profile.bestRounds.chrono = Math.max(profile.bestRounds.chrono || 0, session.correct);
      profile.xp += 100 + session.correct * 12;
      awardAchievement('first_game');
      if (session.mode === 'survival' && session.correct >= 10) awardAchievement('survivor_10');
      if (session.mode === 'daily' && session.officialDaily) awardAchievement('daily_clear');
    }
    if (session.mode === 'daily' && session.officialDaily) profile.daily = {date:dateKey(), score:Math.round(session.score), completed:true, started:false};
    saveProfile();
    clearSessionSnapshot();
    renderResults(isBest);
    showScreen('result');
    sfx('finish');
    if (rankForSession() === 'S' || isBest) confetti(42);
  }

  function rankForSession() {
    const attempts = session.correct + session.wrong + session.skipped;
    const accuracy = attempts ? session.correct / attempts : 0;
    if (session.mode === 'survival') {
      if (session.correct >= 25) return 'S';
      if (session.correct >= 16) return 'A';
      if (session.correct >= 9) return 'B';
      if (session.correct >= 4) return 'C';
      return 'D';
    }
    if (session.mode === 'chrono') {
      const pace = session.globalDuration ? session.correct / session.globalDuration * 60 : 0;
      if (accuracy >= .85 && pace >= 12) return 'S';
      if (accuracy >= .75 && pace >= 8) return 'A';
      if (accuracy >= .6 && pace >= 5) return 'B';
      if (accuracy >= .4 && pace >= 2) return 'C';
      return 'D';
    }
    if (accuracy >= .9 && session.correct >= 5) return 'S';
    if (accuracy >= .75) return 'A';
    if (accuracy >= .6) return 'B';
    if (accuracy >= .4) return 'C';
    return 'D';
  }

  function renderResults(isBest) {
    const attempts = session.correct + session.wrong + session.skipped;
    const accuracy = attempts ? Math.round(session.correct / attempts * 100) : 0;
    const rank = rankForSession();
    const titles = {S:'Maître des ombres',A:'Œil de lynx',B:'Connaisseur geek',C:'Chasseur débutant',D:'Encore dans le brouillard'};
    const subtitles = {
      S:'Tu reconnais les icônes avant même que le projecteur ne s’allume.',
      A:'Excellente lecture des formes. Quelques pièges ont résisté.',
      B:'Une solide culture geek et une marge de progression motivante.',
      C:'La collection commence à prendre forme. Continue à t’entraîner.',
      D:'Les ombres ont gagné cette manche, mais elles ne resteront pas mystérieuses longtemps.'
    };
    let title = titles[rank];
    let subtitle = subtitles[rank];
    let kicker = `${MODE[session.mode].name.toUpperCase()} · MISSION ACCOMPLIE`;
    let duelRanking = [];
    if (session.mode === 'survival') {
      title = 'Les ombres ont gagné';
      subtitle = `${session.correct} silhouette${session.correct > 1 ? 's' : ''} reconnue${session.correct > 1 ? 's' : ''} avant de perdre tes trois vies.`;
      kicker = 'SURVIE · FIN DE COURSE';
    } else if (session.mode === 'chrono') {
      title = 'Temps écoulé';
      subtitle = `${session.correct} bonne${session.correct > 1 ? 's' : ''} réponse${session.correct > 1 ? 's' : ''} en ${Math.round(session.globalDuration)} secondes.`;
      kicker = 'CONTRE-LA-MONTRE · CHRONO TERMINÉ';
    } else if (session.mode === 'training') {
      title = 'Entraînement terminé';
      kicker = 'ENTRAÎNEMENT · SESSION VALIDÉE';
    } else if (session.mode === 'daily') {
      title = session.officialDaily ? 'Défi du jour validé' : 'Entraînement quotidien terminé';
      kicker = session.officialDaily ? 'DÉFI QUOTIDIEN · SCORE OFFICIEL' : 'DÉFI QUOTIDIEN · HORS CLASSEMENT';
    } else if (session.mode === 'duel') {
      duelRanking = [...session.players].sort((a,b) => b.points - a.points || b.score - a.score);
      const leaders = duelRanking.filter((player) => player.points === duelRanking[0]?.points && player.score === duelRanking[0]?.score);
      title = leaders.length > 1 ? 'Égalité parfaite' : `${leaders[0]?.name || 'Duel'} remporte le duel`;
      subtitle = leaders.length > 1 ? `${leaders.map(({name}) => name).join(' et ')} restent à égalité après le départage au score.` : `${leaders[0]?.points || 0} point${Math.abs(leaders[0]?.points || 0) > 1 ? 's' : ''}, puis le score cumulé comme départage.`;
      kicker = leaders.length > 1 ? 'DUEL LOCAL · ÉGALITÉ' : 'DUEL LOCAL · VICTOIRE';
    }
    $('#result-rank').textContent = rank;
    $('#result-title').textContent = title;
    $('#result-subtitle').textContent = subtitle;
    $('#result-kicker').textContent = kicker;
    $('#result-score').textContent = formatNumber(session.score);
    $('#result-best').textContent = !session.rankedRun ? 'HORS CLASSEMENT · RECORD INCHANGÉ' : isBest ? 'NOUVEAU RECORD' : `RECORD : ${formatNumber(profile.bestScores[session.mode])}`;
    $('#result-stats').innerHTML = [
      [session.correct,'bonnes réponses'],
      [`${accuracy} %`,'précision'],
      [`×${session.maxCombo}`,'meilleur combo'],
      [session.mode === 'chrono' ? `${Math.round(session.globalDuration)} s` : session.round,'manches vues']
    ].map(([value,label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('');
    const duel = $('#duel-results');
    if (session.mode === 'duel') {
      duel.classList.remove('hidden');
      duel.innerHTML = duelRanking.map((player, index) => `<div class="duel-result-row" style="--player-color:${player.color}"><span>#${index + 1}</span><strong>${escapeHtml(player.name)}</strong><strong>${player.points} pt${Math.abs(player.points) > 1 ? 's' : ''}</strong></div>`).join('');
    } else duel.classList.add('hidden');
  }

  function renderCollection() {
    const unlocked = new Set(profile.unlocked);
    const search = ($('#collection-search').value || '').trim().toLocaleLowerCase('fr');
    const filter = $('#collection-filter').value || 'all';
    const sort = $('#collection-sort').value || 'unlock';
    let items = DATA.filter((question) => {
      const isUnlocked = unlocked.has(question.id);
      if (filter === 'unlocked' && !isUnlocked) return false;
      if (filter === 'locked' && isUnlocked) return false;
      if (!['all','unlocked','locked'].includes(filter) && question.category !== filter) return false;
      if (search && !`${question.answer} ${question.franchise} ${question.category}`.toLocaleLowerCase('fr').includes(search)) return false;
      return true;
    });
    items.sort((a,b) => {
      if (sort === 'unlock') return Number(unlocked.has(b.id)) - Number(unlocked.has(a.id)) || a.answer.localeCompare(b.answer,'fr');
      if (sort === 'difficulty') return a.difficulty - b.difficulty || a.answer.localeCompare(b.answer,'fr');
      return a.answer.localeCompare(b.answer,'fr');
    });
    $('#collection-progress-value').textContent = `${unlocked.size} / ${DATA.length}`;
    $('#collection-progress-fill').style.width = `${unlocked.size / DATA.length * 100}%`;
    $('#collection-grid').innerHTML = items.length ? items.map((question) => {
      const isUnlocked = unlocked.has(question.id);
      return `<button class="collection-card ${isUnlocked ? 'unlocked' : 'locked'}" data-id="${question.id}">
        <span class="collection-art">${makeArtSvg(question, isUnlocked ? question.answer : 'Silhouette verrouillée')}<i class="collection-lock">${isUnlocked ? '✓' : '⌑'}</i></span>
        <span class="collection-copy"><strong>${isUnlocked ? escapeHtml(question.answer) : '????????'}</strong><span>${isUnlocked ? escapeHtml(question.franchise) : escapeHtml(question.category)}</span><em>${'★'.repeat(question.difficulty)}${'☆'.repeat(3-question.difficulty)}</em></span>
      </button>`;
    }).join('') : '<div class="empty-state">Aucune silhouette ne correspond à cette recherche.</div>';
    $$('.collection-card').forEach((card) => card.addEventListener('click', () => {
      const question = DATA.find((item) => item.id === card.dataset.id);
      if (!profile.unlocked.includes(question.id)) toast('Silhouette verrouillée', 'Trouve-la pendant une partie pour révéler sa fiche.');
      else openCollectionModal(question);
    }));
  }

  function openCollectionModal(question) {
    $('#collection-modal-art').innerHTML = makeArtSvg(question, question.answer);
    $('#collection-modal-category').textContent = question.category.toUpperCase();
    $('#collection-modal-title').textContent = question.answer;
    $('#collection-modal-franchise').textContent = question.franchise;
    $('#collection-modal-fact').textContent = question.fact;
    $('#collection-modal-tags').innerHTML = [question.universe, `Difficulté ${question.difficulty}/3`, question.category].map((tag) => `<span>${escapeHtml(tag)}</span>`).join('');
    openDialog($('#collection-modal'), $('#collection-modal-close'));
  }

  function closeCollectionModal() {
    closeDialog($('#collection-modal'));
  }

  function renderStats() {
    const accuracy = profile.answers ? Math.round(profile.correct / profile.answers * 100) : 0;
    const stats = [
      ['Parties jouées', profile.games, 'Toutes les épreuves confondues'],
      ['Parties abandonnées', profile.abandoned, 'Sessions quittées avant leur terme'],
      ['Précision globale', `${accuracy} %`, `${profile.correct} bonnes réponses sur ${profile.answers}`],
      ['Meilleur combo', `×${profile.bestCombo}`, 'Série de réponses consécutives'],
      ['Collection', `${profile.unlocked.length}/${DATA.length}`, `${Math.round(profile.unlocked.length / DATA.length * 100)} % révélée`],
      ['Score cumulé', formatNumber(profile.totalScore), 'Points gagnés au fil des parties'],
      ['Niveau', currentLevel(), `${profile.xp % 1000}/1000 XP vers le suivant`],
      ['Succès', `${profile.achievements.length}/${ACHIEVEMENTS.length}`, 'Objectifs de progression accomplis'],
      ['Record Survie', profile.bestRounds.survival || 0, 'Bonnes réponses avant élimination'],
      ['Record Chrono', profile.bestRounds.chrono || 0, 'Bonnes réponses dans une session']
    ];
    $('#stats-grid').innerHTML = stats.map(([label,value,detail]) => `<article class="stat-card panel"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`).join('');
    $('#mode-records').innerHTML = Object.keys(MODE).map((mode) => `<div class="mode-record-row"><span>${MODE[mode].icon} ${MODE[mode].name}</span><strong>${formatNumber(profile.bestScores[mode] || 0)}</strong></div>`).join('');
    $('#achievements-grid').innerHTML = ACHIEVEMENTS.map((achievement) => {
      const unlocked = profile.achievements.includes(achievement.id);
      return `<article class="achievement${unlocked ? '' : ' locked'}"><span aria-hidden="true">${unlocked ? '◆' : '◇'}</span><strong>${escapeHtml(achievement.title)}</strong><small>${escapeHtml(achievement.text)}</small></article>`;
    }).join('');
  }

  function toast(title, text = '') {
    const region = $('#toast-region');
    const item = document.createElement('div');
    item.className = 'toast';
    item.innerHTML = `<strong>${escapeHtml(title)}</strong>${text ? `<span>${escapeHtml(text)}</span>` : ''}`;
    region.appendChild(item);
    window.setTimeout(() => item.remove(), 3200);
  }

  function confetti(amount = 30) {
    if (!profile.settings.motion) return;
    const layer = $('#confetti-layer');
    for (let i = 0; i < amount; i += 1) {
      const piece = document.createElement('i');
      piece.className = 'confetti';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.setProperty('--drift', `${(Math.random() - .5) * 260}px`);
      piece.style.animationDelay = `${Math.random() * .35}s`;
      piece.style.animationDuration = `${1.45 + Math.random() * 1.1}s`;
      layer.appendChild(piece);
      window.setTimeout(() => piece.remove(), 3000);
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => toast('Plein écran indisponible'));
    else document.exitFullscreen?.();
  }

  function updateFullscreenButton() {
    const active = Boolean(document.fullscreenElement);
    $('#fullscreen-toggle').setAttribute('aria-pressed', String(active));
    $('#fullscreen-toggle').setAttribute('aria-label', active ? 'Quitter le plein écran' : 'Passer en plein écran');
    $('#fullscreen-toggle').title = active ? 'Quitter le plein écran' : 'Plein écran';
  }

  function openOnboarding() {
    openDialog($('#onboarding-modal'), $('#onboarding-start'));
  }

  function closeOnboarding(complete = false) {
    if (complete) {
      profile.onboardingDone = true;
      saveProfile();
    }
    closeDialog($('#onboarding-modal'));
  }

  function exportSave() {
    const payload = JSON.stringify({game:'OMBRE//GEEK', version:APP_VERSION, exportedAt:new Date().toISOString(), profile:normalizeProfile(profile)}, null, 2);
    const url = URL.createObjectURL(new Blob([payload], {type:'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = `ombre-geek-save-${dateKey()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Sauvegarde exportée', 'Le fichier JSON peut être conservé ou importé ailleurs.');
  }

  async function importSaveFile(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      profile = normalizeProfile(parsed.profile || parsed);
      clearSessionSnapshot();
      saveProfile();
      applySettings();
      updateProfileUI();
      renderStats();
      toast('Sauvegarde importée', 'Profil, collection, options et records ont été restaurés.');
    } catch (error) {
      console.warn('Import de sauvegarde refusé.', error);
      toast('Import impossible', 'Le fichier ne contient pas une sauvegarde OMBRE//GEEK valide.');
    } finally {
      $('#import-save-file').value = '';
    }
  }

  async function installApp() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('#install-button').classList.add('hidden');
  }

  function handleKeyboard(event) {
    if (activeDialog) {
      trapDialogFocus(event);
      if (event.key === 'Escape') {
        event.preventDefault();
        if (activeDialog === $('#pause-modal')) resumeGame();
        else if (activeDialog === $('#collection-modal')) closeCollectionModal();
        else closeOnboarding(false);
      }
      return;
    }
    const key = event.key.toLowerCase();
    if (currentScreen !== 'game' || !session) return;
    if (event.key === 'Escape') { event.preventDefault(); pauseGame(); return; }
    if (session.paused) return;
    if (session.answered && event.key === 'Enter') { event.preventDefault(); continueAfterFeedback(); return; }
    if (session.mode === 'duel' && session.buzzed === null) {
      const index = session.players.findIndex((player) => player.key.toLowerCase() === key);
      if (index >= 0) { event.preventDefault(); buzzPlayer(index); }
      return;
    }
    if (key === 'h') { event.preventDefault(); useHint(); return; }
    const digit = event.code?.match(/^Digit([1-4])$/)?.[1] || (/^[1-4]$/.test(event.key) ? event.key : '');
    if (digit) { event.preventDefault(); answerQuestion(Number(digit) - 1); }
  }

  function runSelfTest() {
    const problems = [];
    if (DATA.length < 50) problems.push(`Seulement ${DATA.length} questions.`);
    const ids = new Set();
    for (const question of DATA) {
      if (!question.id || ids.has(question.id)) problems.push(`ID invalide ou dupliqué: ${question.id}`);
      ids.add(question.id);
      if (typeof question.art !== 'function' || !question.art().includes('<')) problems.push(`Illustration absente: ${question.id}`);
      if (!Array.isArray(question.palette) || question.palette.length < 6) problems.push(`Palette incomplète: ${question.id}`);
      const options = buildOptions(question, mulberry32(hashString(question.id)));
      if (options.length !== 4 || !options.some((item) => item.id === question.id) || new Set(options.map((item) => item.answer)).size !== 4) problems.push(`Options invalides: ${question.id}`);
    }
    const required = ['home-screen','setup-screen','game-screen','result-screen','collection-screen','stats-screen','settings-screen'];
    required.forEach((id) => { if (!document.getElementById(id)) problems.push(`Écran absent: ${id}`); });
    const report = $('#self-test-report');
    report.hidden = false;
    report.textContent = problems.length ? `FAIL: ${problems.join(' | ')}` : `PASS: ${DATA.length} questions, IDs uniques, SVG valides, options à 4 choix et écrans présents.`;
    document.documentElement.dataset.selftest = problems.length ? 'fail' : 'pass';
    console.log(report.textContent);
  }

  function bindEvents() {
    let collectionSearchTimer = 0;
    $('#brand-home').addEventListener('click', () => {
      if (currentScreen === 'game' && session && !session.finished) pauseGame(); else showScreen('home');
    });
    $('#quick-play').addEventListener('click', () => startGame('arcade', {category:'all',difficulty:'normal',amount:10,playerCount:1,names:[]}));
    $$('.mode-card').forEach((button) => button.addEventListener('click', () => openSetup(button.dataset.mode)));
    $$('[data-nav]').forEach((button) => button.addEventListener('click', () => showScreen(button.dataset.nav)));
    $('#setup-form').addEventListener('submit', (event) => { event.preventDefault(); startGame(selectedMode, parseStartOptions()); });
    $('#setup-category').addEventListener('change', syncSetupAmounts);
    $('#player-count').addEventListener('change', updatePlayerFields);
    $('#hint-button').addEventListener('click', useHint);
    $('#skip-button').addEventListener('click', skipQuestion);
    $('#pause-button').addEventListener('click', pauseGame);
    $('#resume-button').addEventListener('click', resumeGame);
    $('#quit-button').addEventListener('click', quitGame);
    $('#feedback-continue').addEventListener('click', continueAfterFeedback);
    $('#continue-game').addEventListener('click', restoreSavedGame);
    $('#discard-game').addEventListener('click', discardSavedGame);
    $('#replay-button').addEventListener('click', () => lastRunConfig && startGame(lastRunConfig.mode, deepClone(lastRunConfig.options)));
    $('#collection-search').addEventListener('input', () => {
      clearTimeout(collectionSearchTimer);
      collectionSearchTimer = window.setTimeout(renderCollection, 120);
    });
    $('#collection-filter').addEventListener('change', renderCollection);
    $('#collection-sort').addEventListener('change', renderCollection);
    $('#collection-modal-close').addEventListener('click', closeCollectionModal);
    $('#collection-modal').addEventListener('click', (event) => { if (event.target === $('#collection-modal')) closeCollectionModal(); });
    $('#sound-toggle').addEventListener('click', () => { profile.settings.sound = !profile.settings.sound; applySettings(); saveProfile(); if (profile.settings.sound) sfx('click'); });
    $('#help-toggle').addEventListener('click', openOnboarding);
    $('#install-button').addEventListener('click', installApp);
    $('#fullscreen-toggle').addEventListener('click', toggleFullscreen);
    $('#setting-sound').addEventListener('change', (event) => { profile.settings.sound = event.target.checked; applySettings(); saveProfile(); });
    $('#setting-volume').addEventListener('input', (event) => { profile.settings.volume = Number(event.target.value) / 100; saveProfile(); });
    $('#setting-volume').addEventListener('change', () => sfx('click'));
    $('#setting-vibration').addEventListener('change', (event) => { profile.settings.vibration = event.target.checked; applySettings(); saveProfile(); vibrate(18); });
    $('#setting-auto-advance').addEventListener('change', (event) => { profile.settings.autoAdvance = event.target.checked; applySettings(); saveProfile(); });
    $('#setting-motion').addEventListener('change', (event) => { profile.settings.motion = event.target.checked; applySettings(); saveProfile(); });
    $('#setting-contrast').addEventListener('change', (event) => { profile.settings.contrast = event.target.checked; applySettings(); saveProfile(); });
    $('#setting-scale').addEventListener('change', (event) => { profile.settings.scale = event.target.value; applySettings(); saveProfile(); });
    $('#export-save').addEventListener('click', exportSave);
    $('#import-save').addEventListener('click', () => $('#import-save-file').click());
    $('#import-save-file').addEventListener('change', (event) => importSaveFile(event.target.files?.[0]));
    $('#onboarding-start').addEventListener('click', () => closeOnboarding(true));
    $('#onboarding-close').addEventListener('click', () => closeOnboarding(false));
    $('#onboarding-modal').addEventListener('click', (event) => { if (event.target === $('#onboarding-modal')) closeOnboarding(false); });
    $('#reset-profile').addEventListener('click', () => {
      if (!window.confirm('Réinitialiser définitivement scores, collection, niveau et options ?')) return;
      profile = deepClone(DEFAULT_PROFILE);
      profile.settings.motion = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      clearSessionSnapshot();
      saveProfile();
      applySettings();
      updateProfileUI();
      renderStats();
      toast('Profil réinitialisé', 'Toutes les données locales ont été effacées.');
    });
    document.addEventListener('keydown', handleKeyboard);
    document.addEventListener('fullscreenchange', updateFullscreenButton);
    window.addEventListener('beforeunload', () => { saveProfile(); saveSessionCheckpoint(); });
    window.addEventListener('pagehide', saveSessionCheckpoint);
    document.addEventListener('visibilitychange', () => { if (document.hidden && currentScreen === 'game' && session && !session.paused) pauseGame(); });
    window.addEventListener('offline', () => toast('Mode hors ligne', 'La partie et la collection restent disponibles sur cet appareil.'));
    window.addEventListener('online', () => toast('Connexion retrouvée', 'OMBRE//GEEK est de nouveau en ligne.'));
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      $('#install-button').classList.remove('hidden');
    });
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) toast('Mise à jour prête', 'Recharge la page quand tu le souhaites pour utiliser la nouvelle version.');
        });
      });
    } catch (error) {
      console.warn('Mode hors ligne indisponible.', error);
      toast('Mode hors ligne indisponible', 'Le jeu reste jouable, mais le cache local n’a pas pu être activé.');
    }
  }

  function init() {
    if (!DATA.length) {
      document.body.innerHTML = '<main style="padding:40px;color:white"><h1>Erreur de chargement</h1><p>Le pack de silhouettes est introuvable.</p></main>';
      return;
    }
    populateCategorySelects();
    if (profile.daily.date !== dateKey() && profile.daily.started) profile.daily = {date:'', score:0, completed:false, started:false};
    if (savedSessionSnapshot?.mode === 'daily' && dateKey(new Date(savedSessionSnapshot.savedAt)) !== dateKey()) clearSessionSnapshot();
    applySettings();
    bindEvents();
    updateProfileUI();
    showScreen('home');
    updateFullscreenButton();
    registerServiceWorker();
    window.OMBRE_GEEK_TEST_API = {APP_VERSION, DATA, DEFAULT_PROFILE, ACHIEVEMENTS, buildOptions, makeArtSvg, getEligibleQuestions, hashString, mulberry32, normalizeProfile, createSessionSnapshot, runSelfTest};
    if (new URLSearchParams(location.search).has('selftest')) window.setTimeout(runSelfTest, 50);
    if (!profile.onboardingDone) window.setTimeout(openOnboarding, 180);
    if (storageState === 'warning') window.setTimeout(() => toast('Profil réparé', 'Une sauvegarde illisible a été mise de côté et le profil a été réinitialisé.'), 220);
  }

  window.OMBRE_GEEK_CORE = Object.freeze({APP_VERSION, DEFAULT_PROFILE, ACHIEVEMENTS, buildOptions, getEligibleQuestions, hashString, mulberry32, normalizeProfile});
  document.addEventListener('DOMContentLoaded', init);
})();
