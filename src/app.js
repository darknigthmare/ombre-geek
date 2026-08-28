(() => {
  'use strict';

  const DATA = Array.from(window.OMBRE_GEEK_DATA || []);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const formatNumber = (value) => Math.max(0, Math.round(value || 0)).toLocaleString('fr-FR');
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const STORAGE_KEY = 'ombre-geek-profile-v2';
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
    version: 2,
    settings: {sound:true, motion:true, contrast:false, scale:'normal'},
    unlocked: [],
    xp: 0,
    games: 0,
    correct: 0,
    answers: 0,
    bestCombo: 0,
    totalScore: 0,
    bestScores: {arcade:0, chrono:0, survival:0, duel:0, daily:0, training:0},
    bestRounds: {survival:0, chrono:0},
    daily: {date:'', score:0, completed:false},
    lastPlayed: ''
  };

  let profile = loadProfile();
  let currentScreen = 'home';
  let selectedMode = 'arcade';
  let session = null;
  let lastRunConfig = null;
  let audioContext = null;
  let resultAdvanceTimer = 0;
  let lastFocusedElement = null;

  function loadProfile() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_PROFILE);
      const parsed = JSON.parse(raw);
      return {
        ...structuredClone(DEFAULT_PROFILE),
        ...parsed,
        settings: {...DEFAULT_PROFILE.settings, ...(parsed.settings || {})},
        bestScores: {...DEFAULT_PROFILE.bestScores, ...(parsed.bestScores || {})},
        bestRounds: {...DEFAULT_PROFILE.bestRounds, ...(parsed.bestRounds || {})},
        daily: {...DEFAULT_PROFILE.daily, ...(parsed.daily || {})},
        unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked.filter((id) => DATA.some((q) => q.id === id)) : []
      };
    } catch (error) {
      console.warn('Sauvegarde illisible, profil réinitialisé.', error);
      return structuredClone(DEFAULT_PROFILE);
    }
  }

  function saveProfile() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch (error) { console.warn('Sauvegarde locale indisponible.', error); }
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
    return function rng() {
      let value = seed += 0x6D2B79F5;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
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
    const {sound, motion, contrast, scale} = profile.settings;
    document.body.classList.toggle('sound-off', !sound);
    document.body.classList.toggle('no-motion', !motion);
    document.body.classList.toggle('high-contrast', contrast);
    document.body.classList.toggle('ui-compact', scale === 'compact');
    document.body.classList.toggle('ui-large', scale === 'large');
    $('#sound-toggle').textContent = sound ? '♪' : '×';
    $('#setting-sound').checked = sound;
    $('#setting-motion').checked = motion;
    $('#setting-contrast').checked = contrast;
    $('#setting-scale').value = scale;
  }

  function updateProfileUI() {
    const level = currentLevel();
    $('#profile-level').textContent = `NIV. ${level}`;
    $('#profile-xp').style.width = `${(profile.xp % 1000) / 10}%`;
    $('#home-best').textContent = formatNumber(Math.max(...Object.values(profile.bestScores)));
    $('#home-unlocked').textContent = `${profile.unlocked.length}/${DATA.length}`;
    $('#home-accuracy').textContent = profile.answers ? `${Math.round(profile.correct / profile.answers * 100)} %` : '—';
    const today = dateKey();
    const dailyDone = profile.daily.date === today && profile.daily.completed;
    $('#daily-status').textContent = dailyDone ? `TERMINÉ · ${formatNumber(profile.daily.score)}` : 'NOUVEL ESSAI';
    $('#daily-tag').textContent = dailyDone ? 'REJOUABLE HORS CLASSEMENT' : 'DÉFI DU JOUR';
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
    gain.gain.linearRampToValueAtTime(volume, start + .01);
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

  function showScreen(name) {
    const target = $(`#${name}-screen`);
    if (!target) return;
    $$('.screen').forEach((screen) => screen.classList.remove('active'));
    target.classList.add('active');
    currentScreen = name;
    window.scrollTo({top:0, behavior:profile.settings.motion ? 'smooth' : 'auto'});
    if (name === 'home') updateProfileUI();
    if (name === 'collection') renderCollection();
    if (name === 'stats') renderStats();
  }

  function makeArtSvg(question, label = '') {
    const palette = question.palette || ['#fff','#aaa','#777','#555','#333','#111'];
    const variables = palette.map((value, index) => `--c${index + 1}:${value}`).join(';');
    return `<svg viewBox="0 0 400 400" style="${variables}" role="img" aria-label="${escapeHtml(label || question.answer)}"><g>${question.art()}</g></svg>`;
  }

  function populateCategorySelects() {
    const categories = [...new Set(DATA.map((q) => q.category))].sort((a,b) => a.localeCompare(b, 'fr'));
    const options = ['<option value="all">Toutes les catégories</option>', ...categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)].join('');
    $('#setup-category').innerHTML = options;
    $('#collection-filter').innerHTML = `<option value="all">Toutes les catégories</option><option value="unlocked">Débloquées uniquement</option><option value="locked">Non découvertes</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}`;
  }

  function openSetup(mode) {
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
    $('#setup-amount').innerHTML = config.amounts.map(({value,label}) => `<option value="${value}">${label}</option>`).join('');
    $('#amount-label').textContent = mode === 'chrono' ? 'Durée de la partie' : 'Nombre de manches';
    $('#amount-field').classList.toggle('hidden', mode === 'survival');
    $('#players-section').classList.toggle('hidden', mode !== 'duel');
    $('#difficulty-field').classList.toggle('hidden', mode === 'daily');
    if (mode === 'daily') $('#setup-difficulty').value = 'normal';
    if (mode === 'training') $('#setup-difficulty').value = 'normal';
    updatePlayerFields();
    showScreen('setup');
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
    if (pool.length < 4) pool = DATA.filter((question) => category === 'all' || question.category === category);
    return pool.length >= 4 ? pool : DATA;
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
      category: $('#setup-category').value,
      difficulty: mode === 'daily' ? 'normal' : $('#setup-difficulty').value,
      amount: Number($('#setup-amount').value || MODE[mode].amounts[0].value),
      playerCount: mode === 'duel' ? Number($('#player-count').value) : 1,
      names
    };
  }

  function startGame(mode, options) {
    clearSessionTimers();
    const today = dateKey();
    const officialDaily = mode !== 'daily' || !(profile.daily.date === today && profile.daily.completed);
    const seed = mode === 'daily' ? hashString(`OMBRE-GEEK-${today}`) : (Date.now() ^ Math.floor(Math.random() * 0xffffffff));
    const rng = mulberry32(seed >>> 0);
    const pool = getEligibleQuestions(options.category, options.difficulty);
    session = {
      mode,
      options: {...options},
      rng,
      pool,
      queue: [],
      current: null,
      choices: [],
      round: 0,
      totalRounds: mode === 'daily' ? 10 : (mode === 'survival' || mode === 'chrono' ? Infinity : options.amount),
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
      globalDuration: mode === 'chrono' ? options.amount : 0,
      globalRemaining: mode === 'chrono' ? options.amount : 0,
      lastTick: 0,
      raf: 0,
      feedbackTimer: 0,
      tickSecond: null,
      modifier: '',
      officialDaily,
      buzzed: null,
      buzzLockUntil: 0,
      players: mode === 'duel' ? options.names.map((name, index) => ({name, key:PLAYER_KEYS[index], color:PLAYER_COLORS[index], points:0, score:0})) : []
    };
    lastRunConfig = {mode, options:structuredClone(options)};
    refillQueue();
    showScreen('game');
    resetGameDisplay();
    beginCountdown(() => {
      if (!session) return;
      sfx('start');
      nextQuestion();
    });
  }

  function beginCountdown(callback) {
    const overlay = $('#countdown-overlay');
    const value = $('#countdown-value');
    overlay.classList.remove('hidden');
    let count = 3;
    const show = () => {
      value.textContent = count > 0 ? count : 'GO';
      value.style.animation = 'none';
      void value.offsetWidth;
      value.style.animation = '';
      if (count > 0) sfx('tick'); else sfx('start');
      if (count < 0) {
        overlay.classList.add('hidden');
        callback();
        return;
      }
      count -= 1;
      window.setTimeout(show, count === -1 ? 480 : 700);
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
      <button class="answer-button${session.mode === 'duel' ? ' locked' : ''}" data-answer="${index}" ${session.mode === 'duel' ? 'disabled' : ''}>
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
    if (!session || session.paused || session.answered || session.finished) return;
    const delta = Math.min(.1, (now - session.lastTick) / 1000);
    session.lastTick = now;
    if (session.mode === 'chrono') session.globalRemaining = Math.max(0, session.globalRemaining - delta);
    else session.roundRemaining = Math.max(0, session.roundRemaining - delta);
    const remaining = session.mode === 'chrono' ? session.globalRemaining : session.roundRemaining;
    const second = Math.ceil(remaining);
    if (second <= 3 && second > 0 && session.tickSecond !== second) sfx('tick');
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

    profile.answers += 1;
    if (correct) {
      session.correct += 1;
      session.combo += 1;
      session.maxCombo = Math.max(session.maxCombo, session.combo);
      profile.correct += 1;
      profile.bestCombo = Math.max(profile.bestCombo, session.combo);
      points = calculatePoints(remainingRatio);
      session.score += points;
      profile.xp += 70 + Math.min(session.combo, 10) * 5;
      unlockQuestion(session.current);
      if (session.mode === 'duel' && session.buzzed !== null) {
        session.players[session.buzzed].points += 1;
        session.players[session.buzzed].score += points;
      }
      sfx('correct');
      if (session.combo > 0 && session.combo % 5 === 0) confetti(18);
    } else {
      if (skipped) session.skipped += 1; else session.wrong += 1;
      session.combo = 0;
      if (session.mode === 'survival') session.lives -= 1;
      if (session.mode === 'duel' && session.buzzed !== null) {
        session.players[session.buzzed].points -= 1;
      }
      sfx('wrong');
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

    const delay = session.mode === 'chrono' ? 650 : 1550;
    session.feedbackTimer = window.setTimeout(continueAfterFeedback, delay);
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
      shuffle(wrongButtons, session.rng).slice(0, Math.min(2, wrongButtons.length)).forEach((button) => button.classList.add('removed'));
      toast('50 / 50', 'Deux mauvaises réponses ont été éliminées.');
    } else {
      const stage = $('#art-stage');
      stage.classList.remove('silhouette');
      stage.classList.add('revealed');
      toast('Flash couleur', 'La silhouette se révèle pendant un bref instant.');
      window.setTimeout(() => {
        if (session && !session.answered) {
          stage.classList.remove('revealed');
          stage.classList.add('silhouette');
          if (session.modifier) stage.classList.add(`modifier-${session.modifier}`);
        }
      }, 850);
    }
    sfx('click');
    updateHintsUI();
  }

  function skipQuestion() {
    if (!session || session.answered || session.mode === 'duel') return;
    processAnswer({selectedIndex:-1, skipped:true});
  }

  function unlockQuestion(question) {
    if (profile.unlocked.includes(question.id)) return;
    profile.unlocked.push(question.id);
    profile.xp += 120;
    sfx('unlock');
    toast('Nouvelle fiche débloquée', `${question.answer} rejoint ta collection.`);
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

  function pauseGame() {
    if (!session || session.finished || session.paused) return;
    session.paused = true;
    cancelAnimationFrame(session.raf);
    lastFocusedElement = document.activeElement;
    $('#pause-modal').classList.remove('hidden');
    $('#resume-button').focus();
  }

  function resumeGame() {
    if (!session || !session.paused) return;
    session.paused = false;
    $('#pause-modal').classList.add('hidden');
    if (!session.answered) startTicker();
    lastFocusedElement?.focus?.();
  }

  function quitGame() {
    clearSessionTimers();
    session = null;
    $('#pause-modal').classList.add('hidden');
    showScreen('home');
  }

  function clearSessionTimers() {
    if (!session) return;
    cancelAnimationFrame(session.raf || 0);
    clearTimeout(session.feedbackTimer || 0);
    clearTimeout(resultAdvanceTimer);
  }

  function finishGame() {
    if (!session || session.finished) return;
    session.finished = true;
    clearSessionTimers();
    profile.games += 1;
    profile.totalScore += Math.max(0, session.score);
    profile.lastPlayed = new Date().toISOString();
    const previousBest = profile.bestScores[session.mode] || 0;
    const isBest = session.score > previousBest;
    if (isBest) profile.bestScores[session.mode] = Math.round(session.score);
    if (session.mode === 'survival') profile.bestRounds.survival = Math.max(profile.bestRounds.survival || 0, session.correct);
    if (session.mode === 'chrono') profile.bestRounds.chrono = Math.max(profile.bestRounds.chrono || 0, session.correct);
    if (session.mode === 'daily' && session.officialDaily) profile.daily = {date:dateKey(), score:Math.round(session.score), completed:true};
    profile.xp += 100 + session.correct * 12;
    saveProfile();
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
    if (accuracy >= .9 && session.correct >= Math.min(5, attempts)) return 'S';
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
    $('#result-rank').textContent = rank;
    $('#result-title').textContent = session.mode === 'duel' ? 'Fin du duel' : titles[rank];
    $('#result-subtitle').textContent = session.mode === 'duel' ? 'Le classement local est maintenant définitif.' : subtitles[rank];
    $('#result-kicker').textContent = `${MODE[session.mode].name.toUpperCase()} · PARTIE TERMINÉE`;
    $('#result-score').textContent = formatNumber(session.score);
    $('#result-best').textContent = isBest ? 'NOUVEAU RECORD' : `RECORD : ${formatNumber(profile.bestScores[session.mode])}`;
    $('#result-stats').innerHTML = [
      [session.correct,'bonnes réponses'],
      [`${accuracy} %`,'précision'],
      [`×${session.maxCombo}`,'meilleur combo'],
      [session.mode === 'chrono' ? `${Math.round(session.globalDuration)} s` : session.round,'manches vues']
    ].map(([value,label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('');
    const duel = $('#duel-results');
    if (session.mode === 'duel') {
      duel.classList.remove('hidden');
      const ranking = [...session.players].sort((a,b) => b.points - a.points || b.score - a.score);
      duel.innerHTML = ranking.map((player, index) => `<div class="duel-result-row" style="--player-color:${player.color}"><span>#${index + 1}</span><strong>${escapeHtml(player.name)}</strong><strong>${player.points} pt${Math.abs(player.points) > 1 ? 's' : ''}</strong></div>`).join('');
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
    lastFocusedElement = document.activeElement;
    $('#collection-modal-art').innerHTML = makeArtSvg(question, question.answer);
    $('#collection-modal-category').textContent = question.category.toUpperCase();
    $('#collection-modal-title').textContent = question.answer;
    $('#collection-modal-franchise').textContent = question.franchise;
    $('#collection-modal-fact').textContent = question.fact;
    $('#collection-modal-tags').innerHTML = [question.universe, `Difficulté ${question.difficulty}/3`, question.category].map((tag) => `<span>${escapeHtml(tag)}</span>`).join('');
    $('#collection-modal').classList.remove('hidden');
    $('#collection-modal-close').focus();
  }

  function closeCollectionModal() {
    $('#collection-modal').classList.add('hidden');
    lastFocusedElement?.focus?.();
  }

  function renderStats() {
    const accuracy = profile.answers ? Math.round(profile.correct / profile.answers * 100) : 0;
    const stats = [
      ['Parties jouées', profile.games, 'Toutes les épreuves confondues'],
      ['Précision globale', `${accuracy} %`, `${profile.correct} bonnes réponses sur ${profile.answers}`],
      ['Meilleur combo', `×${profile.bestCombo}`, 'Série de réponses consécutives'],
      ['Collection', `${profile.unlocked.length}/${DATA.length}`, `${Math.round(profile.unlocked.length / DATA.length * 100)} % révélée`],
      ['Score cumulé', formatNumber(profile.totalScore), 'Points gagnés au fil des parties'],
      ['Niveau', currentLevel(), `${profile.xp % 1000}/1000 XP vers le suivant`],
      ['Record Survie', profile.bestRounds.survival || 0, 'Bonnes réponses avant élimination'],
      ['Record Chrono', profile.bestRounds.chrono || 0, 'Bonnes réponses dans une session']
    ];
    $('#stats-grid').innerHTML = stats.map(([label,value,detail]) => `<article class="stat-card panel"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`).join('');
    $('#mode-records').innerHTML = Object.keys(MODE).map((mode) => `<div class="mode-record-row"><span>${MODE[mode].icon} ${MODE[mode].name}</span><strong>${formatNumber(profile.bestScores[mode] || 0)}</strong></div>`).join('');
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

  function handleKeyboard(event) {
    const key = event.key.toLowerCase();
    if (!$('#collection-modal').classList.contains('hidden')) {
      if (event.key === 'Escape') closeCollectionModal();
      return;
    }
    if (!$('#pause-modal').classList.contains('hidden')) {
      if (event.key === 'Escape') resumeGame();
      return;
    }
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
    $('#brand-home').addEventListener('click', () => {
      if (currentScreen === 'game' && session && !session.finished) pauseGame(); else showScreen('home');
    });
    $('#quick-play').addEventListener('click', () => startGame('arcade', {category:'all',difficulty:'normal',amount:10,playerCount:1,names:[]}));
    $$('.mode-card').forEach((button) => button.addEventListener('click', () => openSetup(button.dataset.mode)));
    $$('[data-nav]').forEach((button) => button.addEventListener('click', () => showScreen(button.dataset.nav)));
    $('#setup-form').addEventListener('submit', (event) => { event.preventDefault(); startGame(selectedMode, parseStartOptions()); });
    $('#player-count').addEventListener('change', updatePlayerFields);
    $('#hint-button').addEventListener('click', useHint);
    $('#skip-button').addEventListener('click', skipQuestion);
    $('#pause-button').addEventListener('click', pauseGame);
    $('#resume-button').addEventListener('click', resumeGame);
    $('#quit-button').addEventListener('click', quitGame);
    $('#replay-button').addEventListener('click', () => lastRunConfig && startGame(lastRunConfig.mode, structuredClone(lastRunConfig.options)));
    $('#collection-search').addEventListener('input', renderCollection);
    $('#collection-filter').addEventListener('change', renderCollection);
    $('#collection-sort').addEventListener('change', renderCollection);
    $('#collection-modal-close').addEventListener('click', closeCollectionModal);
    $('#collection-modal').addEventListener('click', (event) => { if (event.target === $('#collection-modal')) closeCollectionModal(); });
    $('#sound-toggle').addEventListener('click', () => { profile.settings.sound = !profile.settings.sound; applySettings(); saveProfile(); if (profile.settings.sound) sfx('click'); });
    $('#fullscreen-toggle').addEventListener('click', toggleFullscreen);
    $('#setting-sound').addEventListener('change', (event) => { profile.settings.sound = event.target.checked; applySettings(); saveProfile(); });
    $('#setting-motion').addEventListener('change', (event) => { profile.settings.motion = event.target.checked; applySettings(); saveProfile(); });
    $('#setting-contrast').addEventListener('change', (event) => { profile.settings.contrast = event.target.checked; applySettings(); saveProfile(); });
    $('#setting-scale').addEventListener('change', (event) => { profile.settings.scale = event.target.value; applySettings(); saveProfile(); });
    $('#reset-profile').addEventListener('click', () => {
      if (!window.confirm('Réinitialiser définitivement scores, collection, niveau et options ?')) return;
      profile = structuredClone(DEFAULT_PROFILE);
      saveProfile();
      applySettings();
      updateProfileUI();
      renderStats();
      toast('Profil réinitialisé', 'Toutes les données locales ont été effacées.');
    });
    document.addEventListener('keydown', handleKeyboard);
    window.addEventListener('beforeunload', saveProfile);
    document.addEventListener('visibilitychange', () => { if (document.hidden && currentScreen === 'game' && session && !session.answered && !session.paused) pauseGame(); });
  }

  function init() {
    if (!DATA.length) {
      document.body.innerHTML = '<main style="padding:40px;color:white"><h1>Erreur de chargement</h1><p>Le pack de silhouettes est introuvable.</p></main>';
      return;
    }
    populateCategorySelects();
    applySettings();
    bindEvents();
    updateProfileUI();
    showScreen('home');
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
    window.OMBRE_GEEK_TEST_API = {DATA, buildOptions, makeArtSvg, getEligibleQuestions, hashString, mulberry32, runSelfTest};
    if (new URLSearchParams(location.search).has('selftest')) window.setTimeout(runSelfTest, 50);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
