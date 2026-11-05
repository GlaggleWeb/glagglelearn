/* ==========================================================================
   GLAGGLE LEARN — TRAIN-ENGINE (shared/train-engine.js)
   v2.0 — Trainer-Seiten (Einmaleins, Plus, Minus) ohne eigenen Code.
   Gleiches Grundgerüst wie die lesson-engine: glaggle-progress oben,
   glaggle-card in der Mitte, glaggle-button unten, Feedback-Banner,
   Sounds, LP-System (glaggleLearnPoints) und animierte Ergebnisseite.

   Die Aufgaben-Logik steckt HIER drin. Die Trainer-Datei liefert nur Texte:

     <link rel="stylesheet" href="../../shared/theme.css">
     <script src="../../shared/components.js"></script>
     <script src="../../shared/train-engine.js"></script>
     <script>
       GlaggleTrainer.mount({
         type: 'einmaleins',            // 'einmaleins' | 'plus' | 'minus'
         title: 'Einmaleins-Trainer',
         intro: 'Wie schnell bist du im kleinen Einmaleins?',
         backHref: '../index.html'
       });
     </script>

   true.aac / false.aac / lp.png werden im selben Ordner wie diese Datei
   (shared/) gesucht.
   ========================================================================== */
(function () {
  'use strict';

  // Ordner dieser Datei (für Sounds + LP-Icon) — nur beim ersten Laden ermittelbar
  const BASE = (document.currentScript && document.currentScript.src)
    ? document.currentScript.src.replace(/[^/]*$/, '') : '';

  /* ---------- Einstellungen ---------- */
  const LP_KEY = 'glaggleLearnPoints';      // wie lesson-engine: einfache Zahl
  const LP_PER_CORRECT = 1;                 // Basis-LP pro richtiger Antwort
  const SPEED_BONUS = [                     // Ø Sekunden pro Aufgabe → Bonus-Faktor
    { under: 3, factor: 1.0 },
    { under: 5, factor: 0.5 },
    { under: 8, factor: 0.25 }
  ];
  const TIME_PRESETS = [30, 60, 120, 300];  // Sekunden
  const COUNT_PRESETS = [10, 20, 30, 50];   // Aufgaben
  const TIME_MIN = 10, TIME_MAX = 3600;
  const COUNT_MIN = 1, COUNT_MAX = 200;
  const FEEDBACK_OK_MS = 700;
  const FEEDBACK_BAD_MS = 1500;
  const COUNT_DURATION = 2000;

  /* Balkenfarben nach Trefferquote: [Farbe, Schatten] — null = Standard-Grün */
  const BAR_GREEN = null;
  const BAR_ORANGE = ['#f5a623', '#c77d0a'];
  const BAR_RED = ['var(--gl-danger)', 'var(--gl-danger-shadow)'];

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

  /* ---------- Sprüche für die Ergebnisseite ---------- */
  const SPRUECHE = {
    perfekt: [
      '🏆 Kein einziger Fehler — dein Kopf rechnet schneller als jeder Taschenrechner.',
      '⚡ Fehlerfrei! Selbst Albert Zweistein schaut neidisch zu.',
      '🎯 Volltreffer auf ganzer Linie — die Zahlen zittern vor dir.'
    ],
    stark: [
      '💪 Sehr stark! Nur ein kleiner Ausrutscher hat sich eingeschlichen.',
      '🚀 Fast perfekt — beim nächsten Mal knackst du die 100 %.',
      '📐 Solide Rechenleistung, der Taschenrechner kann Urlaub machen.'
    ],
    ok: [
      '🙂 Gute Basis — mit ein bisschen Übung wirst du richtig schnell.',
      '📈 Jede Runde macht dich fixer, bleib dran!',
      '🧩 Ein paar Rechnungen haben noch gewackelt, aber du bist auf dem Weg.'
    ],
    schwach: [
      '🌱 Aller Anfang ist schwer — die nächste Runde läuft besser!',
      '🔁 Nochmal versuchen? Beim zweiten Anlauf sitzen die Zahlen lockerer.',
      '🐢 Langsam, aber du bist unterwegs — und das zählt.'
    ]
  };

  function pickSpruch(pct) {
    const list = pct === 100 ? SPRUECHE.perfekt : pct >= 70 ? SPRUECHE.stark
      : pct >= 40 ? SPRUECHE.ok : SPRUECHE.schwach;
    return list[Math.floor(Math.random() * list.length)];
  }

  const DEFAULTS = {
    type: 'einmaleins',
    title: 'Trainer',
    siteName: 'Glaggle Learn',
    intro: '',
    backHref: '../index.html',
    modeTimeLabel: '⏱️ Auf Zeit',
    modeCountLabel: '🔢 Auf Aufgabenzahl',
    startLabel: 'Start',
    againLabel: 'Nochmal',
    finishLabel: 'Zur Startseite'
  };

  let CFG = null;
  let S = null;                 // laufende Runde
  let setup = { mode: 'time', value: 60 };
  let timerId = 0;
  let el = {};
  const SOUNDS = {};

  /* ---------- LP (identisch zur lesson-engine) ---------- */
  function getTotalLP() {
    const n = parseInt(localStorage.getItem(LP_KEY), 10);
    return Number.isFinite(n) ? n : 0;
  }
  function addLP(amount) {
    const total = getTotalLP() + amount;
    localStorage.setItem(LP_KEY, String(total));
    return total;
  }

  /* ---------- Helfer ---------- */
  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? m + 'm ' + s + 's' : s + 's';
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  function fmtSec(sec) { return sec.toFixed(1).replace('.', ',') + ' s'; }
  function presetLabel(mode, v) {
    if (mode === 'count') return v + ' Aufgaben';
    return v < 60 ? v + ' Sek.' : (v / 60) + ' Min.';
  }

  function countUp(node, target, duration, formatFn) {
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      node.innerHTML = formatFn(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
      else { node.innerHTML = formatFn(target); node.classList.add('gl-count-done'); }
    }
    requestAnimationFrame(tick);
  }

  function calcBonus(correct, avgSec) {
    let factor = 0;
    for (const t of SPEED_BONUS) { if (avgSec < t.under) { factor = t.factor; break; } }
    return Math.round(correct * LP_PER_CORRECT * factor);
  }

  function play(ok) {
    const a = SOUNDS[ok ? 'true' : 'false'];
    if (!a) return;
    a.currentTime = 0;
    a.play().catch((e) => console.warn('Sound konnte nicht abgespielt werden:', e));
  }

  /* ---------- Zusatz-Styles (nur Trainer-spezifisch, nutzt Theme-Variablen) ---------- */
  function injectStyles() {
    if (document.getElementById('glTrainStyles')) return;
    const css =
      '.gl-train-hud{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-bottom:var(--gl-space-2)}' +
      '.gl-train-pill{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border:2px solid var(--gl-border);border-radius:999px;background:var(--gl-surface);font-weight:800;font-size:.9rem;color:var(--gl-text)}' +
      '.gl-train-pill.gl-pop{animation:glTrainPop .45s ease}' +
      '.gl-train-pill.gl-low{border-color:var(--gl-danger);color:var(--gl-danger-shadow);animation:glTrainPulse 1s ease-in-out infinite}' +
      '.gl-train-q{font-size:clamp(2.4rem,9vw,4rem);font-weight:800;margin:var(--gl-space-3) 0;line-height:1.1}' +
      '.gl-train-q.gl-in{animation:glTrainIn .35s cubic-bezier(.34,1.56,.64,1)}' +
      '.gl-input.gl-train-answer{max-width:240px;margin:0 auto var(--gl-space-2);display:block;text-align:center;font-size:1.6rem;font-weight:800}' +
      '.gl-input.gl-train-answer.gl-shake{animation:glTrainShake .4s ease}' +
      '.gl-train-chips{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}' +
      '.gl-train-chips .gl-option{width:auto;text-align:center;padding:12px 18px}' +
      '.gl-train-label{font-size:.8rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--gl-text-soft);margin:var(--gl-space-3) 0 var(--gl-space-1)}' +
      '.gl-train-custom{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:var(--gl-space-2)}' +
      '.gl-train-custom .gl-input{width:130px;margin:0;text-align:center}' +
      '.gl-train-custom span{color:var(--gl-text-soft);font-weight:700}' +
      '.gl-train-error{color:var(--gl-danger-shadow);font-weight:700;min-height:1.4em;margin-top:8px}' +
      '.gl-train-stats{grid-template-columns:repeat(2,1fr)!important}' +
      '.gl-train-stats .gl-result-box{opacity:0;animation:glTrainIn .5s cubic-bezier(.34,1.56,.64,1) forwards}' +
      '.gl-train-stats .gl-result-box:nth-child(2){animation-delay:.12s}' +
      '.gl-train-stats .gl-result-box:nth-child(3){animation-delay:.24s}' +
      '.gl-train-stats .gl-result-box:nth-child(4){animation-delay:.36s}' +
      'glaggle-progress{transition:filter .3s ease}' +
      '@keyframes glTrainIn{from{opacity:0;transform:translateY(14px) scale(.94)}to{opacity:1;transform:none}}' +
      '@keyframes glTrainPop{0%{transform:scale(1)}40%{transform:scale(1.25)}100%{transform:scale(1)}}' +
      '@keyframes glTrainPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}' +
      '@keyframes glTrainShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}';
    const st = document.createElement('style');
    st.id = 'glTrainStyles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---------- Buttons unten (wie lesson-engine: glaggle-button) ---------- */
  function clearButtons() { el.buttons.innerHTML = ''; }

  function addButton(text, variant, id, disabled) {
    const btn = document.createElement('glaggle-button');
    btn.setAttribute('text', text);
    btn.setAttribute('variant', variant);
    btn.setAttribute('full-width', '');
    btn.id = id;
    if (disabled) btn.setAttribute('disabled', '');
    el.buttons.appendChild(btn);
    return btn;
  }

  function setFlash(state) {
    el.wrap.classList.remove('gl-flash-ok', 'gl-flash-bad');
    if (state === 'ok') el.wrap.classList.add('gl-flash-ok');
    else if (state === 'bad') el.wrap.classList.add('gl-flash-bad');
  }

  /* ---------- Fortschrittsbalken: Farbe nach Trefferquote ---------- */
  function barTheme() {
    if (!S || S.correct + S.wrong === 0) return BAR_GREEN;
    const acc = S.correct / (S.correct + S.wrong);
    if (acc >= 0.8) return BAR_GREEN;
    if (acc >= 0.5) return BAR_ORANGE;
    return BAR_RED;
  }

  function updateBar(fraction) {
    const p = el.progress;
    p.setAttribute('max', '1000');
    p.setAttribute('value', String(Math.round(Math.min(1, Math.max(0, fraction)) * 1000)));
    const theme = barTheme();
    if (theme) {
      p.style.setProperty('--gl-primary', theme[0]);
      p.style.setProperty('--gl-primary-hover', theme[0]);
      p.style.setProperty('--gl-primary-shadow', theme[1]);
      p.style.filter = 'drop-shadow(0 0 8px ' + theme[0] + ')';
    } else {
      p.style.removeProperty('--gl-primary');
      p.style.removeProperty('--gl-primary-hover');
      p.style.removeProperty('--gl-primary-shadow');
      p.style.filter = 'drop-shadow(0 0 8px rgba(164, 214, 94, 0.8))';
    }
  }

  function resetBar() {
    el.progress.setAttribute('value', '0');
    el.progress.setAttribute('max', '1000');
    el.progress.style.removeProperty('--gl-primary');
    el.progress.style.removeProperty('--gl-primary-hover');
    el.progress.style.removeProperty('--gl-primary-shadow');
    el.progress.style.filter = 'none';
  }

  /* ---------- START: Modus + Zahl wählen ---------- */
  function showSetup() {
    clearInterval(timerId);
    S = null;
    setFlash(null);
    resetBar();

    el.lesson.innerHTML =
      '<div class="gl-step" style="text-align:center;">' +
        '<h2>' + esc(CFG.title) + '</h2>' +
        (CFG.intro ? '<p class="gl-step-text">' + esc(CFG.intro) + '</p>' : '') +
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
        '<div class="gl-train-error" id="glTrainError"></div>' +
      '</div>';

    el.lesson.querySelectorAll('#glTrainModes .gl-option').forEach((b) => {
      b.addEventListener('click', () => {
        setup.mode = b.dataset.mode;
        setup.value = setup.mode === 'time' ? TIME_PRESETS[1] : COUNT_PRESETS[1];
        renderSetupValues();
      });
    });
    const custom = document.getElementById('glTrainCustom');
    custom.addEventListener('input', () => {
      custom.value = custom.value.replace(/\D/g, '');
      const n = parseInt(custom.value, 10);
      if (!isNaN(n)) { setup.value = n; markPresets(); }
    });
    custom.addEventListener('keydown', (e) => { if (e.key === 'Enter') startRound(); });

    renderSetupValues();
    clearButtons();
    addButton(CFG.startLabel, 'primary', 'glTrainStart', false)
      .addEventListener('glaggle-click', startRound);
  }

  function renderSetupValues() {
    const isTime = setup.mode === 'time';
    el.lesson.querySelectorAll('#glTrainModes .gl-option').forEach((b) => {
      b.classList.toggle('gl-selected', b.dataset.mode === setup.mode);
    });
    document.getElementById('glTrainValueLabel').textContent = isTime ? 'Wie lange?' : 'Wie viele Aufgaben?';
    document.getElementById('glTrainUnit').textContent = isTime ? 'Sekunden' : 'Aufgaben';
    document.getElementById('glTrainCustom').value = '';
    const box = document.getElementById('glTrainPresets');
    box.innerHTML = '';
    (isTime ? TIME_PRESETS : COUNT_PRESETS).forEach((v) => {
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
      mode: setup.mode, limit: setup.value,
      correct: 0, wrong: 0, locked: false,
      cur: null, prevText: '', startTs: Date.now()
    };

    el.lesson.innerHTML =
      '<div class="gl-step" style="text-align:center;">' +
        '<div class="gl-train-hud">' +
          '<span class="gl-train-pill" id="glTrainClock">⏱️ 0:00</span>' +
          (S.mode === 'count' ? '<span class="gl-train-pill" id="glTrainNr">1 / ' + S.limit + '</span>' : '') +
          '<span class="gl-train-pill" id="glTrainOk">✅ 0</span>' +
          '<span class="gl-train-pill" id="glTrainBad">❌ 0</span>' +
        '</div>' +
        '<h2 class="gl-train-q" id="glTrainQ"></h2>' +
        '<input type="text" id="glTrainAnswer" class="gl-input gl-train-answer" inputmode="numeric" placeholder="?" autocomplete="off">' +
      '</div>';

    const input = document.getElementById('glTrainAnswer');
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^\d-]/g, '');
      const btn = document.getElementById('glCheck');
      if (!btn || S.locked) return;
      if (input.value.trim().length > 0) btn.removeAttribute('disabled');
      else btn.setAttribute('disabled', '');
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAnswer(); });

    updateBar(0);
    nextQuestion();

    clearInterval(timerId);
    timerId = setInterval(tick, 100);
    tick();
  }

  function tick() {
    if (!S) return;
    const elapsed = (Date.now() - S.startTs) / 1000;
    const clock = document.getElementById('glTrainClock');
    if (S.mode === 'time') {
      const remaining = S.limit - elapsed;
      if (clock) {
        clock.textContent = '⏱️ ' + fmtClock(remaining);
        clock.classList.toggle('gl-low', remaining <= 10);
      }
      updateBar(elapsed / S.limit);
      if (remaining <= 0) finishRound();
    } else if (clock) {
      clock.textContent = '⏱️ ' + fmtClock(elapsed);
    }
  }

  function nextQuestion() {
    let q, tries = 0;
    do { q = TASKS[CFG.type](); tries++; } while (q.text === S.prevText && tries < 8);
    S.cur = q;
    S.prevText = q.text;
    S.locked = false;
    setFlash(null);

    const qEl = document.getElementById('glTrainQ');
    qEl.textContent = q.text + ' = ?';
    qEl.classList.remove('gl-in');
    void qEl.offsetWidth;               // Animation neu starten
    qEl.classList.add('gl-in');

    const nr = document.getElementById('glTrainNr');
    if (nr) nr.textContent = (S.correct + S.wrong + 1) + ' / ' + S.limit;

    const input = document.getElementById('glTrainAnswer');
    input.value = '';
    input.disabled = false;
    input.classList.remove('gl-shake');
    input.focus();

    clearButtons();
    addButton('Prüfen', 'secondary', 'glCheck', true)
      .addEventListener('glaggle-click', submitAnswer);
  }

  function pop(id) {
    const n = document.getElementById(id);
    if (!n) return;
    n.classList.remove('gl-pop');
    void n.offsetWidth;
    n.classList.add('gl-pop');
  }

  function submitAnswer() {
    if (!S || S.locked) return;
    const input = document.getElementById('glTrainAnswer');
    const raw = input.value.trim();
    if (raw === '' || raw === '-') { input.focus(); return; }
    S.locked = true;
    input.disabled = true;

    const round = S;
    const ok = Number(raw) === round.cur.answer;
    if (ok) round.correct++; else round.wrong++;

    document.getElementById('glTrainOk').textContent = '✅ ' + round.correct;
    document.getElementById('glTrainBad').textContent = '❌ ' + round.wrong;
    pop(ok ? 'glTrainOk' : 'glTrainBad');
    if (!ok) { void input.offsetWidth; input.classList.add('gl-shake'); }

    const answered = round.correct + round.wrong;
    updateBar(round.mode === 'count' ? answered / round.limit : (Date.now() - round.startTs) / 1000 / round.limit);

    /* Feedback wie in der lesson-engine: Flash + Sound + Banner statt Prüfen-Button */
    setFlash(ok ? 'ok' : 'bad');
    play(ok);
    clearButtons();
    const banner = document.createElement('div');
    banner.className = 'gl-feedback-banner ' + (ok ? 'gl-feedback-ok' : 'gl-feedback-bad');
    banner.innerHTML = ok
      ? '<span class="gl-feedback-icon">✅</span><span>Richtig!</span>'
      : '<span class="gl-feedback-icon">❌</span><span>Leider falsch — richtig wäre: ' + esc(round.cur.answer) + '</span>';
    el.buttons.appendChild(banner);

    setTimeout(() => {
      if (S !== round) return;               // Runde inzwischen beendet
      if (round.mode === 'count' && answered >= round.limit) finishRound();
      else nextQuestion();
    }, ok ? FEEDBACK_OK_MS : FEEDBACK_BAD_MS);
  }

  /* ---------- ERGEBNIS (gleicher Aufbau wie lesson-engine, aber mit Trainer-Werten) ---------- */
  function finishRound() {
    if (!S) return;
    clearInterval(timerId);
    const r = S;
    S = null;
    setFlash(null);

    const answered = r.correct + r.wrong;
    const usedSec = r.mode === 'time' ? r.limit : Math.round((Date.now() - r.startTs) / 1000);
    const avgSec = answered > 0 ? usedSec / answered : 999;
    const pct = answered > 0 ? Math.round((r.correct / answered) * 100) : 0;

    const basePoints = r.correct * LP_PER_CORRECT;
    const bonusPoints = calcBonus(r.correct, avgSec);
    const totalLP = basePoints + bonusPoints;
    const newTotal = addLP(totalLP);
    const prevTotal = newTotal - totalLP;

    el.progress.setAttribute('value', '1000');
    el.progress.setAttribute('max', '1000');

    const third = r.mode === 'time'
      ? '<div class="gl-result-box gl-box-time"><div class="gl-result-value" id="glStatThird">0,0 s</div><div class="gl-result-label">Ø pro Aufgabe</div></div>'
      : '<div class="gl-result-box gl-box-time"><div class="gl-result-value" id="glStatThird">0s</div><div class="gl-result-label">Gebrauchte Zeit</div></div>';

    el.lesson.innerHTML =
      '<div class="gl-step" style="text-align:center;">' +
        '<h2>🎉 Runde geschafft!</h2>' +
        '<div class="gl-result-stats gl-train-stats">' +
          '<div class="gl-result-box gl-box-pct"><div class="gl-result-value" id="glStatOk">0</div><div class="gl-result-label">Richtig</div></div>' +
          '<div class="gl-result-box"><div class="gl-result-value" id="glStatBad">0</div><div class="gl-result-label">Falsch</div></div>' +
          third +
          '<div class="gl-result-box gl-box-lp"><div class="gl-result-value" id="glStatLP">0 LP</div><div class="gl-result-label" id="glStatLPLabel">Learn Points</div></div>' +
        '</div>' +
        '<p class="gl-result-quote">' + pickSpruch(pct) + '</p>' +
        '<p class="gl-result-quote" style="animation-delay:2.1s;">Gesamt-LP: <strong id="glTotalLP">' + prevTotal + '</strong></p>' +
      '</div>';

    const lpIcon = '<img src="' + BASE + 'lp.png" alt="" class="gl-lp-icon" onerror="this.remove()">';
    const q = (id) => el.lesson.querySelector(id);

    q('#glStatLPLabel').textContent = bonusPoints > 0 ? '+' + bonusPoints + ' Bonus' : 'Learn Points';

    // kleine Verzögerung, damit die Boxen nacheinander einfliegen und dann hochzählen
    countUp(q('#glStatOk'), r.correct, COUNT_DURATION, (v) => String(v));
    countUp(q('#glStatBad'), r.wrong, COUNT_DURATION, (v) => String(v));
    if (r.mode === 'time') {
      countUp(q('#glStatThird'), Math.round(avgSec * 10) * (answered > 0 ? 1 : 0), COUNT_DURATION,
        (v) => fmtSec(v / 10));
    } else {
      countUp(q('#glStatThird'), usedSec, COUNT_DURATION, (v) => fmtTime(v));
    }
    countUp(q('#glStatLP'), totalLP, COUNT_DURATION, (v) => lpIcon + v + ' LP');
    countUp(q('#glTotalLP'), newTotal, COUNT_DURATION, (v) => String(Math.max(prevTotal, v)));

    setTimeout(() => {
      el.lesson.querySelectorAll('.gl-result-box').forEach((b) => b.classList.add('gl-glow'));
    }, COUNT_DURATION + 100);

    clearButtons();
    addButton(CFG.againLabel, 'primary', 'glTrainAgain', false)
      .addEventListener('glaggle-click', showSetup);
    addButton(CFG.finishLabel, 'secondary', 'glTrainFinish', false)
      .addEventListener('glaggle-click', () => { window.location.href = CFG.backHref; });
  }

  /* ---------- Grundgerüst (1:1 wie GlaggleLesson.mount) ---------- */
  function init() {
    if (!TASKS[CFG.type]) {
      document.body.textContent = 'Unbekannter Trainer-Typ: ' + CFG.type;
      return;
    }
    document.title = CFG.siteName ? CFG.title + ' | ' + CFG.siteName : CFG.title;
    injectStyles();
    SOUNDS.true = new Audio(BASE + 'true.aac'); SOUNDS.true.preload = 'auto';
    SOUNDS.false = new Audio(BASE + 'false.aac'); SOUNDS.false.preload = 'auto';

    document.body.innerHTML =
      '<div class="gl-lesson-wrap" id="glWrap">' +
        '<div class="gl-lesson-header">' +
          '<a href="' + esc(CFG.backHref) + '" title="Zurück">✕</a>' +
          '<glaggle-progress id="glProgress" value="0" max="1000"></glaggle-progress>' +
        '</div>' +
        '<div class="gl-lesson-content">' +
          '<glaggle-card><div id="glLesson"></div></glaggle-card>' +
        '</div>' +
        '<div class="gl-lesson-buttons" id="glButtons"></div>' +
      '</div>';

    el = {
      wrap: document.getElementById('glWrap'),
      lesson: document.getElementById('glLesson'),
      progress: document.getElementById('glProgress'),
      buttons: document.getElementById('glButtons')
    };

    Promise.all([
      customElements.whenDefined('glaggle-button'),
      customElements.whenDefined('glaggle-card'),
      customElements.whenDefined('glaggle-progress')
    ]).then(showSetup);
  }

  window.GlaggleTrainer = {
    mount(options) {
      CFG = Object.assign({}, DEFAULTS, options || {});
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
      else init();
    }
  };
})();
