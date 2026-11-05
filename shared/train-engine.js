/* ==========================================================================
   GLAGGLE LEARN — TRAIN-ENGINE (shared/train-engine.js)
   v1.0 — Trainer-Seiten (Einmaleins, Plus, Minus) ohne eigenen Code.
   Die Aufgaben-Logik steckt HIER drin. Die Trainer-Datei liefert nur Texte.

   Einbindung in einer Trainer-Datei:

     <link rel="stylesheet" href="../shared/theme.css">
     <script src="../shared/train-engine.js"></script>
     <script>
       GlaggleTrainer.mount({
         type: 'einmaleins',            // 'einmaleins' | 'plus' | 'minus'
         title: 'Einmaleins-Trainer',
         intro: 'Wie schnell bist du im kleinen Einmaleins?',
         homeUrl: '../index.html'
       });
     </script>

   Optionale Texte: modeTimeLabel, modeCountLabel, startLabel, againLabel.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- Einstellungen (zentral, leicht anpassbar) ---------- */
  const LP_KEY = 'glaggleLPData';          // { total: Zahl } — an dein LP-System anpassen!
  const LP_PER_CORRECT = 1;                // Basis-LP pro richtiger Antwort
  const SPEED_BONUS = [                    // Ø-Zeit pro Aufgabe (s) → Bonus-Faktor
    { under: 3, factor: 0.5 },
    { under: 5, factor: 0.25 }
  ];
  const TIME_PRESETS = [30, 60, 120, 300]; // Sekunden
  const COUNT_PRESETS = [10, 20, 30, 50];  // Aufgaben
  const TIME_MIN = 10, TIME_MAX = 3600;
  const COUNT_MIN = 1, COUNT_MAX = 200;
  const FEEDBACK_OK_MS = 450;
  const FEEDBACK_BAD_MS = 1300;

  const COLOR_GREEN = 'var(--gl-primary)';
  const COLOR_ORANGE = '#f5a623';
  const COLOR_RED = 'var(--gl-danger)';

  /* ---------- AUFGABEN-LOGIK ---------- */
  function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  const TASKS = {
    einmaleins: function () {
      const a = rnd(1, 10), b = rnd(1, 10);
      return { text: a + ' × ' + b, answer: a * b };
    },
    plus: function () {
      const a = rnd(1, 99), b = rnd(1, 100 - a);
      return { text: a + ' + ' + b, answer: a + b };
    },
    minus: function () {
      const a = rnd(2, 100), b = rnd(1, a);
      return { text: a + ' − ' + b, answer: a - b };
    }
  };

  const DEFAULTS = {
    type: 'einmaleins',
    title: 'Trainer',
    siteName: 'Glaggle Learn',
    intro: '',
    homeUrl: 'index.html',
    homeIcon: '✕',
    modeTimeLabel: '⏱️ Auf Zeit',
    modeCountLabel: '🔢 Auf Aufgabenzahl',
    startLabel: 'Start',
    againLabel: 'Nochmal',
    backLabel: 'Fertig'
  };

  let CFG = null;
  let S = null;          // laufende Runde
  let setup = { mode: 'time', value: 60 };
  let timerId = 0;
  let el = {};

  /* ---------- Helfer ---------- */
  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function fmtSec(sec) {
    return sec.toFixed(1).replace('.', ',') + ' s';
  }

  function presetLabel(mode, v) {
    if (mode === 'count') return v + ' Aufgaben';
    return v < 60 ? v + ' Sek.' : (v / 60) + ' Min.';
  }

  function readLP() {
    try {
      const o = JSON.parse(localStorage.getItem(LP_KEY) || '{}');
      return (o && typeof o.total === 'number') ? o : { total: 0 };
    } catch (e) { return { total: 0 }; }
  }

  function addLP(amount) {
    try {
      const o = readLP();
      o.total = (o.total || 0) + amount;
      localStorage.setItem(LP_KEY, JSON.stringify(o));
    } catch (e) { console.warn('LP konnten nicht gespeichert werden:', e); }
  }

  function calcLP(correct, avgSec) {
    let factor = 0;
    for (const t of SPEED_BONUS) {
      if (avgSec < t.under) { factor = t.factor; break; }
    }
    return Math.round(correct * LP_PER_CORRECT * (1 + factor));
  }

  /* ---------- Styles, die nur die Trainer brauchen ---------- */
  function injectStyles() {
    if (document.getElementById('glTrainStyles')) return;
    const css =
      '.gl-train-bar{flex:1;height:14px;border-radius:999px;background:var(--gl-border);overflow:hidden}' +
      '.gl-train-bar-fill{height:100%;width:0;border-radius:999px;transition:width .3s ease,background-color .3s ease,box-shadow .3s ease}' +
      '.gl-train-clock{flex-shrink:0;min-width:48px;text-align:right;font-weight:800;color:var(--gl-text-soft)}' +
      '.gl-train-card{width:100%;max-width:clamp(300px,85vw,640px);text-align:center}' +
      '.gl-train-card h1{font-size:clamp(1.3rem,3vw,1.7rem);margin:0 0 8px}' +
      '.gl-train-intro{color:var(--gl-text-soft);line-height:1.6;margin:0 0 var(--gl-space-3)}' +
      '.gl-train-label{font-size:.8rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--gl-text-soft);margin:var(--gl-space-3) 0 var(--gl-space-1)}' +
      '.gl-train-chips{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}' +
      '.gl-train-chips .gl-option{width:auto;text-align:center;padding:12px 18px}' +
      '.gl-train-custom{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:var(--gl-space-2)}' +
      '.gl-train-custom .gl-input{width:120px;margin:0;text-align:center}' +
      '.gl-train-custom span{color:var(--gl-text-soft);font-weight:700}' +
      '.gl-train-q{font-size:clamp(2.4rem,9vw,4rem);font-weight:800;margin:var(--gl-space-3) 0}' +
      '.gl-train-card .gl-input.gl-train-answer{max-width:220px;margin:0 auto;text-align:center;font-size:1.6rem;font-weight:800}' +
      '.gl-train-reveal{min-height:1.6em;margin-top:var(--gl-space-2);font-weight:800;color:var(--gl-danger-shadow)}' +
      '.gl-train-btn{font-family:var(--gl-font);font-weight:800;font-size:1rem;color:var(--gl-text-on-accent);background:var(--gl-primary);border:none;border-bottom:4px solid var(--gl-primary-shadow);border-radius:var(--gl-radius-md);padding:14px 28px;cursor:pointer;width:100%;transition:transform .1s ease}' +
      '.gl-train-btn:hover{background:var(--gl-primary-hover)}' +
      '.gl-train-btn:active{transform:translateY(2px);border-bottom-width:2px}' +
      '.gl-train-btn:disabled{opacity:.5;cursor:not-allowed}' +
      '.gl-train-btn.gl-secondary{background:var(--gl-secondary);border-bottom-color:var(--gl-secondary-shadow)}' +
      '.gl-train-btn.gl-secondary:hover{background:var(--gl-secondary-hover)}' +
      '.gl-train-stats-4{grid-template-columns:repeat(2,1fr)!important}' +
      '.gl-train-error{color:var(--gl-danger-shadow);font-weight:700;min-height:1.4em;margin-top:8px}';
    const st = document.createElement('style');
    st.id = 'glTrainStyles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---------- Grundgerüst ---------- */
  function buildSkeleton() {
    document.title = CFG.siteName ? CFG.title + ' | ' + CFG.siteName : CFG.title;
    const wrap = document.createElement('div');
    wrap.className = 'gl-lesson-wrap';
    wrap.innerHTML =
      '<div class="gl-lesson-header">' +
        '<a href="' + esc(CFG.homeUrl) + '" title="Zurück">' + esc(CFG.homeIcon) + '</a>' +
        '<div class="gl-train-bar"><div class="gl-train-bar-fill" id="glTrainFill"></div></div>' +
        '<div class="gl-train-clock" id="glTrainClock"></div>' +
      '</div>' +
      '<div class="gl-lesson-content"><div class="gl-train-card" id="glTrainCard"></div></div>' +
      '<div class="gl-lesson-buttons" id="glTrainButtons"></div>';
    document.body.appendChild(wrap);
    el = {
      wrap: wrap,
      fill: document.getElementById('glTrainFill'),
      clock: document.getElementById('glTrainClock'),
      card: document.getElementById('glTrainCard'),
      buttons: document.getElementById('glTrainButtons')
    };
  }

  function setButtons(list) {
    el.buttons.innerHTML = '';
    list.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gl-train-btn' + (b.secondary ? ' gl-secondary' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', b.fn);
      el.buttons.appendChild(btn);
      if (b.id) btn.id = b.id;
    });
  }

  /* ---------- Fortschrittsbalken: Farbe nach Trefferquote ---------- */
  function barColor() {
    if (!S || S.correct + S.wrong === 0) return COLOR_GREEN;
    const acc = S.correct / (S.correct + S.wrong);
    if (acc >= 0.8) return COLOR_GREEN;
    if (acc >= 0.5) return COLOR_ORANGE;
    return COLOR_RED;
  }

  function updateBar(fraction) {
    const color = barColor();
    el.fill.style.width = Math.min(100, Math.max(0, fraction * 100)) + '%';
    el.fill.style.background = color;
    el.fill.style.boxShadow = '0 0 12px ' + color;
  }

  function resetBar() {
    el.fill.style.width = '0';
    el.fill.style.boxShadow = 'none';
    el.clock.textContent = '';
  }

  /* ---------- START: Modus + Zahl wählen ---------- */
  function showSetup() {
    clearInterval(timerId);
    S = null;
    resetBar();
    el.card.innerHTML =
      '<h1>' + esc(CFG.title) + '</h1>' +
      (CFG.intro ? '<p class="gl-train-intro">' + esc(CFG.intro) + '</p>' : '') +
      '<div class="gl-train-chips" id="glTrainModes">' +
        '<button type="button" class="gl-option" data-mode="time">' + esc(CFG.modeTimeLabel) + '</button>' +
        '<button type="button" class="gl-option" data-mode="count">' + esc(CFG.modeCountLabel) + '</button>' +
      '</div>' +
      '<div class="gl-train-label" id="glTrainValueLabel"></div>' +
      '<div class="gl-train-chips" id="glTrainPresets"></div>' +
      '<div class="gl-train-custom">' +
        '<input class="gl-input" id="glTrainCustom" type="text" inputmode="numeric" autocomplete="off" placeholder="Eigene">' +
        '<span id="glTrainUnit"></span>' +
      '</div>' +
      '<div class="gl-train-error" id="glTrainError"></div>';

    el.card.querySelectorAll('#glTrainModes .gl-option').forEach((b) => {
      b.addEventListener('click', () => {
        setup.mode = b.dataset.mode;
        setup.value = setup.mode === 'time' ? TIME_PRESETS[1] : COUNT_PRESETS[1];
        renderSetupValues();
      });
    });
    document.getElementById('glTrainCustom').addEventListener('input', (e) => {
      const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
      e.target.value = e.target.value.replace(/\D/g, '');
      if (!isNaN(n)) { setup.value = n; markPresets(); }
    });
    document.getElementById('glTrainCustom').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') startRound();
    });

    renderSetupValues();
    setButtons([{ label: CFG.startLabel, fn: startRound }]);
  }

  function renderSetupValues() {
    const isTime = setup.mode === 'time';
    el.card.querySelectorAll('#glTrainModes .gl-option').forEach((b) => {
      b.classList.toggle('gl-selected', b.dataset.mode === setup.mode);
    });
    document.getElementById('glTrainValueLabel').textContent = isTime ? 'Wie lange?' : 'Wie viele Aufgaben?';
    document.getElementById('glTrainUnit').textContent = isTime ? 'Sekunden' : 'Aufgaben';
    document.getElementById('glTrainCustom').value = '';
    const presets = isTime ? TIME_PRESETS : COUNT_PRESETS;
    const box = document.getElementById('glTrainPresets');
    box.innerHTML = '';
    presets.forEach((v) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gl-option';
      b.dataset.value = v;
      b.textContent = presetLabel(setup.mode, v);
      b.addEventListener('click', () => {
        setup.value = v;
        document.getElementById('glTrainCustom').value = '';
        markPresets();
      });
      box.appendChild(b);
    });
    markPresets();
  }

  function markPresets() {
    document.querySelectorAll('#glTrainPresets .gl-option').forEach((b) => {
      b.classList.toggle('gl-selected', Number(b.dataset.value) === setup.value);
    });
    document.getElementById('glTrainError').textContent = '';
  }

  /* ---------- RUNDE ---------- */
  function startRound() {
    const isTime = setup.mode === 'time';
    const min = isTime ? TIME_MIN : COUNT_MIN;
    const max = isTime ? TIME_MAX : COUNT_MAX;
    if (!(setup.value >= min && setup.value <= max)) {
      document.getElementById('glTrainError').textContent =
        'Bitte eine Zahl zwischen ' + min + ' und ' + max + ' wählen.';
      return;
    }
    S = {
      mode: setup.mode,
      limit: setup.value,
      correct: 0,
      wrong: 0,
      locked: false,
      cur: null,
      prevText: '',
      startTs: Date.now(),
      qStart: Date.now()
    };

    el.card.innerHTML =
      '<div class="gl-train-q" id="glTrainQ"></div>' +
      '<input class="gl-input gl-train-answer" id="glTrainAnswer" type="text" inputmode="numeric" autocomplete="off" placeholder="?">' +
      '<div class="gl-train-reveal" id="glTrainReveal"></div>';
    document.getElementById('glTrainAnswer').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitAnswer();
    });
    setButtons([{ label: 'Prüfen', fn: submitAnswer, id: 'glTrainCheck' }]);

    updateBar(0);
    nextQuestion();

    clearInterval(timerId);
    timerId = setInterval(tick, 100);
    tick();
  }

  function tick() {
    if (!S) return;
    const elapsed = (Date.now() - S.startTs) / 1000;
    if (S.mode === 'time') {
      const remaining = S.limit - elapsed;
      el.clock.textContent = fmtTime(Math.ceil(remaining));
      updateBar(elapsed / S.limit);
      if (remaining <= 0) finishRound();
    } else {
      el.clock.textContent = fmtTime(elapsed);
    }
  }

  function nextQuestion() {
    let q, tries = 0;
    do { q = TASKS[CFG.type](); tries++; } while (q.text === S.prevText && tries < 8);
    S.cur = q;
    S.prevText = q.text;
    S.locked = false;
    S.qStart = Date.now();
    document.getElementById('glTrainQ').textContent = q.text + ' = ?';
    document.getElementById('glTrainReveal').textContent = '';
    const input = document.getElementById('glTrainAnswer');
    input.value = '';
    input.disabled = false;
    input.focus();
    const btn = document.getElementById('glTrainCheck');
    if (btn) btn.disabled = false;
  }

  function submitAnswer() {
    if (!S || S.locked) return;
    const input = document.getElementById('glTrainAnswer');
    const raw = input.value.trim();
    if (raw === '') { input.focus(); return; }
    S.locked = true;
    input.disabled = true;
    const btn = document.getElementById('glTrainCheck');
    if (btn) btn.disabled = true;

    const ok = Number(raw) === S.cur.answer;
    if (ok) S.correct++; else S.wrong++;

    el.wrap.classList.add(ok ? 'gl-flash-ok' : 'gl-flash-bad');
    if (!ok) {
      document.getElementById('glTrainReveal').textContent =
        'Richtig wäre: ' + S.cur.answer;
    }

    const answered = S.correct + S.wrong;
    if (S.mode === 'count') updateBar(answered / S.limit);
    else updateBar((Date.now() - S.startTs) / 1000 / S.limit);

    setTimeout(() => {
      el.wrap.classList.remove('gl-flash-ok', 'gl-flash-bad');
      if (!S) return;
      if (S.mode === 'count' && answered >= S.limit) finishRound();
      else nextQuestion();
    }, ok ? FEEDBACK_OK_MS : FEEDBACK_BAD_MS);
  }

  /* ---------- ERGEBNIS ---------- */
  function finishRound() {
    if (!S) return;
    clearInterval(timerId);
    const round = S;
    S = null;
    el.wrap.classList.remove('gl-flash-ok', 'gl-flash-bad');

    const usedSec = round.mode === 'time'
      ? round.limit
      : (Date.now() - round.startTs) / 1000;
    const answered = round.correct + round.wrong;
    const avgSec = answered > 0 ? usedSec / answered : 0;
    const lp = calcLP(round.correct, avgSec || 999);
    if (lp > 0) addLP(lp);

    el.fill.style.width = '100%';
    el.clock.textContent = '';

    const boxes = [];
    boxes.push(box('gl-box-pct', round.correct, '✅ Richtig'));
    boxes.push(box('', round.wrong, '❌ Falsch'));
    if (round.mode === 'time') {
      boxes.push(box('gl-box-time', answered > 0 ? fmtSec(avgSec) : '–', '⏱️ Ø pro Aufgabe'));
    } else {
      boxes.push(box('gl-box-time', fmtTime(usedSec), '⏱️ Gebrauchte Zeit'));
    }
    boxes.push(box('gl-box-lp gl-glow', lp, '💠 Learn Points'));

    el.card.innerHTML =
      '<h1>Geschafft!</h1>' +
      '<div class="gl-result-stats gl-train-stats-4">' + boxes.join('') + '</div>';

    setButtons([
      { label: CFG.againLabel, fn: showSetup },
      { label: CFG.backLabel, fn: () => { window.location.href = CFG.homeUrl; }, secondary: true }
    ]);
  }

  function box(cls, value, label) {
    return '<div class="gl-result-box ' + cls + '">' +
      '<div class="gl-result-value">' + esc(value) + '</div>' +
      '<div class="gl-result-label">' + esc(label) + '</div></div>';
  }

  /* ---------- Start ---------- */
  function init() {
    if (!TASKS[CFG.type]) {
      document.body.textContent = 'Unbekannter Trainer-Typ: ' + CFG.type;
      return;
    }
    injectStyles();
    buildSkeleton();
    showSetup();
  }

  window.GlaggleTrainer = {
    mount(options) {
      CFG = Object.assign({}, DEFAULTS, options || {});
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
      else init();
    }
  };
})();
