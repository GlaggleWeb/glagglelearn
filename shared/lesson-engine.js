/* ==========================================================================
   GLAGGLE LEARN — LESSON ENGINE
   Rendert eine Lektion aus einem simplen JS-Array. Unterstützte Typen:

   { type: 'info',   title: '...', text: '...' }
   { type: 'mc',     question: '...', options: ['A','B','C'], correct: 1 }
   { type: 'blank',  question: '...', answer: 'wort' }
   { type: 'click',  question: 'Klicke alle Nomen',
                     text: 'Der Hund rennt durch den Park.',
                     answers: ['Hund', 'Park'],
                     color: '#ffeb3b' }   // 2 LP pro richtig markiertes Wort

   Benutzung:
     <script src="../../shared/lesson-engine.js" defer></script>
     <script>
       GlaggleLesson.mount({
         steps: [ ... ],
         backHref: '../index.html'
       });
     </script>
   ========================================================================== */

/* ---------- Lustige Sprüche für die Ergebnisseite ---------- */
const GL_SPRUECHE = {
  perfekt: [
    '🏆 100%! Wenn das so weitergeht, nennen wir dich bald Albert Zweistein.',
    '🧠 Fehlerfrei. Dein Gehirn hat gerade den Taschenrechner gekündigt.',
    '🔥 Kein einziger Ausrutscher — sogar Pythagoras wäre neidisch.',
    '🎯 Perfekte Runde! Das Einmaleins zittert vor dir.'
  ],
  stark: [
    '💪 Fast makellos — nur ein kleiner Ausrutscher hat sich reingeschummelt.',
    '👏 Stark! Da fehlt nur noch das letzte Prozent zum Zweistein-Titel.',
    '📐 Sehr solide — dein Taschenrechner kann in Rente gehen.',
    '✨ Knapp am Perfekten vorbeigeschrammt — nächstes Mal schnappst du dir den Titel.'
  ],
  ok: [
    '🙂 Solide Basis — da geht aber definitiv noch mehr!',
    '📈 Übung macht den Meister, und du übst gerade fleissig.',
    '🧩 Ein paar Puzzleteile fehlen noch, aber das Bild wird schon klar.',
    '☕ Mitte des Feldes — ein Krümel Konzentration mehr und es reicht für Gold.'
  ],
  schwach: [
    '🌱 Jede Lektion macht dich ein bisschen schlauer — weiter so!',
    '🔁 Nochmal von vorne? Beim zweiten Anlauf sitzen die Zahlen lockerer.',
    '☕ Kurz durchatmen, Kaffee holen, nochmal ran — das wird schon.',
    '🐢 Langsam, aber du bist unterwegs — und das zählt.'
  ]
};

function glGetSprueche(pct) {
  if (pct === 100) return GL_SPRUECHE.perfekt;
  if (pct >= 70) return GL_SPRUECHE.stark;
  if (pct >= 40) return GL_SPRUECHE.ok;
  return GL_SPRUECHE.schwach;
}

const GL_SOUNDS = { true: new Audio('../../../shared/true.aac'), false: new Audio('../../../shared/false.aac') }; GL_SOUNDS.true.preload = 'auto'; GL_SOUNDS.false.preload = 'auto';

/* ---------- LP-Speicherung (localStorage) ---------- */
const GL_LP_KEY = 'glaggleLearnPoints';

function glGetTotalLP() {
  const raw = localStorage.getItem(GL_LP_KEY);
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function glAddLP(amount) {
  const total = glGetTotalLP() + amount;
  localStorage.setItem(GL_LP_KEY, String(total));
  return total;
}

/* ---------- Lektions-Fortschritt (localStorage) ---------- */
const GL_PROGRESS_KEY = 'glaggleLessonProgress';

function glGetCurrentLessonFile() {
  const path = window.location.pathname;
  return path.substring(path.lastIndexOf('/') + 1) || 'unbekannt.html';
}

function glGetProgress() {
  try {
    const raw = localStorage.getItem(GL_PROGRESS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (e) {
    return {};
  }
}

function glSaveLessonProgress(pct) {
  const file = glGetCurrentLessonFile();
  const progress = glGetProgress();
  progress[file] = {
    done: true,
    pct: pct,
    lastCompleted: new Date().toISOString()
  };
  localStorage.setItem(GL_PROGRESS_KEY, JSON.stringify(progress));
}

/* ---------- Hilfsfunktionen ---------- */
function glFormatTime(totalSeconds) {
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

function glCountUp(el, target, duration, formatFn) {
  const start = performance.now();
  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(target * eased);
    el.innerHTML = formatFn(current);
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.innerHTML = formatFn(target);
      el.classList.add('gl-count-done');
    }
  }
  requestAnimationFrame(tick);
}

class GlaggleLesson {
  constructor(container, steps, options = {}) {
    this.container = container;
    this.steps = steps;
    this.current = 0;
    this.correctCount = 0;
    this.stepPoints = []; // NEU: LP pro Schritt (5 bei mc/blank, 2/Wort bei click)
    this.startTime = Date.now();
    this.onComplete = options.onComplete || (() => {});
    this.progressEl = options.progressEl || null;
    this.buttonsContainer = options.buttonsContainer || null;
    this.wrapEl = options.wrapEl || null;

    // Nur Fragen zählen (mc/blank/click), nicht info-Folien
    this.totalQuestions = steps.filter(s =>
      s.type === 'mc' || s.type === 'blank' || s.type === 'click'
    ).length;

    this.renderStep();
  }

  updateProgress() {
    if (this.progressEl) {
      this.progressEl.setAttribute('value', this.current);
      this.progressEl.setAttribute('max', this.steps.length);
    }
  }

  setFlash(state) {
    if (!this.wrapEl) return;
    this.wrapEl.classList.remove('gl-flash-ok', 'gl-flash-bad');
    if (state === 'ok') this.wrapEl.classList.add('gl-flash-ok');
    else if (state === 'bad') this.wrapEl.classList.add('gl-flash-bad');
  }

  renderStep() {
    this.updateProgress();
    this.setFlash(null);
    const step = this.steps[this.current];
    if (!step) {
      const elapsedSeconds = Math.round((Date.now() - this.startTime) / 1000);
      this.onComplete(
        this.correctCount,
        this.totalQuestions,
        elapsedSeconds,
        this.stepPoints
      );
      return;
    }

    if (step.type === 'info') this.renderInfo(step);
    else if (step.type === 'mc') this.renderMC(step);
    else if (step.type === 'blank') this.renderBlank(step);
    else if (step.type === 'click') this.renderClick(step);
    else console.warn('Unbekannter Lektions-Typ:', step.type);
  }

  next() {
    this.current++;
    this.renderStep();
  }

  clearButtons() {
    if (this.buttonsContainer) {
      this.buttonsContainer.innerHTML = '';
    }
  }

  addButton(text, variant, id, disabled = false) {
    if (!this.buttonsContainer) return null;

    const btn = document.createElement('glaggle-button');
    btn.setAttribute('text', text);
    btn.setAttribute('variant', variant);
    btn.setAttribute('full-width', '');
    btn.id = id;
    if (disabled) btn.setAttribute('disabled', '');

    this.buttonsContainer.appendChild(btn);
    return btn;
  }

  /* GEÄNDERT: Nimmt jetzt einen beliebigen Feedback-Text entgegen. */
  showFeedback(isCorrect, message) {
    this.setFlash(isCorrect ? 'ok' : 'bad');
    this.clearButtons();

    const audio = isCorrect ? GL_SOUNDS.true : GL_SOUNDS.false;
    audio.currentTime = 0;
    audio.play().catch((error) => {
      console.warn(`${isCorrect ? 'true.aac' : 'false.aac'} konnte nicht abgespielt werden:`, error);
    });

    const banner = document.createElement('div');
    banner.className =
      'gl-feedback-banner ' +
      (isCorrect ? 'gl-feedback-ok' : 'gl-feedback-bad');

    banner.innerHTML = isCorrect
      ? `<span class="gl-feedback-icon">✅</span><span>${message || 'Richtig!'}</span>`
      : `<span class="gl-feedback-icon">❌</span><span>${message || 'Leider falsch.'}</span>`;

    this.buttonsContainer.appendChild(banner);

    const nextBtn = this.addButton('Weiter', 'primary', 'glNext', false);
    nextBtn.addEventListener('glaggle-click', () => this.next());
  }

  renderInfo(step) {
    this.container.innerHTML = `
      <div class="gl-step">
        <h2>${step.title}</h2>
        <p class="gl-step-text">${step.text}</p>
      </div>
    `;
    this.clearButtons();
    const nextBtn = this.addButton('Weiter', 'primary', 'glNext', false);
    nextBtn.addEventListener('glaggle-click', () => this.next());
  }

  renderMC(step) {
    this.container.innerHTML = `
      <div class="gl-step">
        <h2>${step.question}</h2>
        <div class="gl-options" id="glOptions"></div>
      </div>
    `;

    const optionsEl = this.container.querySelector('#glOptions');
    let selected = null;
    let checked = false;
    const optionButtons = [];

    this.clearButtons();
    const checkBtn = this.addButton('Prüfen', 'secondary', 'glCheck', true);

    step.options.forEach((optText, i) => {
      const optBtn = document.createElement('button');
      optBtn.className = 'gl-option';
      optBtn.type = 'button';
      optBtn.innerText = optText;
      optBtn.addEventListener('click', () => {
        if (checked) return;
        optionButtons.forEach(b => b.classList.remove('gl-selected'));
        optBtn.classList.add('gl-selected');
        selected = i;
        checkBtn.removeAttribute('disabled');
      });
      optionButtons.push(optBtn);
      optionsEl.appendChild(optBtn);
    });

    checkBtn.addEventListener('glaggle-click', () => {
      if (selected === null || checked) return;
      checked = true;
      const isCorrect = selected === step.correct;
      optionButtons[selected].classList.add(isCorrect ? 'gl-correct' : 'gl-wrong');
      if (!isCorrect) optionButtons[step.correct].classList.add('gl-correct');
      optionButtons.forEach(b => b.disabled = true);
      if (isCorrect) this.correctCount++;
      this.stepPoints.push(isCorrect ? 5 : 0);

      const msg = isCorrect
        ? 'Richtig!'
        : `Leider falsch — richtig wäre: ${step.options[step.correct]}`;
      this.showFeedback(isCorrect, msg);
    });
  }

  renderBlank(step) {
    this.container.innerHTML = `
      <div class="gl-step">
        <h2>${step.question}</h2>
        <input type="text" id="glBlankInput" class="gl-input" placeholder="Antwort eingeben..." autocomplete="off">
      </div>
    `;

    const input = this.container.querySelector('#glBlankInput');
    this.clearButtons();
    const checkBtn = this.addButton('Prüfen', 'secondary', 'glCheck', true);

    let answered = false;

    const check = () => {
      if (answered) return;
      answered = true;
      const isCorrect = input.value.trim().toLowerCase() === step.answer.trim().toLowerCase();
      if (isCorrect) this.correctCount++;
      this.stepPoints.push(isCorrect ? 5 : 0);
      input.disabled = true;

      const msg = isCorrect
        ? 'Richtig!'
        : `Leider falsch — richtig wäre: ${step.answer}`;
      this.showFeedback(isCorrect, msg);
    };

    input.addEventListener('input', () => {
      if (input.value.trim().length > 0) checkBtn.removeAttribute('disabled');
      else checkBtn.setAttribute('disabled', '');
    });
    checkBtn.addEventListener('glaggle-click', check);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !answered) check(); });
  }

  /* ===== NEU: Fragetyp "click" ===== */
  renderClick(step) {
    const text = step.text || '';
    const color = step.color || '#ffeb3b';
    // Antworten normalisieren (lowercase, ohne Satzzeichen)
    const normalize = (s) => s.toLowerCase().replace(/[^a-zäöüß0-9]/gi, '');
    const answers = (step.answers || []).map(normalize);

    this.container.innerHTML = `
      <div class="gl-step">
        <h2>${step.question}</h2>
        <p class="gl-click-text" id="glClickText"></p>
      </div>
    `;

    const textEl = this.container.querySelector('#glClickText');
    const wordSpans = [];

    // Text in Wörter + Trennzeichen splitten (Trennzeichen bleiben erhalten)
    const tokens = text.split(/(\s+|[.,!?;:])/);

    tokens.forEach((token) => {
      // Leerzeichen und Satzzeichen einfach als Text einfügen
      if (/^(\s+|[.,!?;:])$/.test(token) || token === '') {
        textEl.appendChild(document.createTextNode(token));
        return;
      }

      const span = document.createElement('span');
      span.className = 'gl-click-word';
      span.innerText = token;
      span.dataset.word = normalize(token);

      span.addEventListener('click', () => {
        // Toggle: markieren / entmarkieren
        if (span.classList.contains('gl-word-marked')) {
          span.classList.remove('gl-word-marked');
          span.style.backgroundColor = '';
        } else {
          span.classList.add('gl-word-marked');
          span.style.backgroundColor = color;
        }

        // Prüfen-Button nur aktivieren wenn mind. 1 Wort markiert ist
        const anyMarked = textEl.querySelectorAll('.gl-word-marked').length > 0;
        if (anyMarked) checkBtn.removeAttribute('disabled');
        else checkBtn.setAttribute('disabled', '');
      });

      textEl.appendChild(span);
      wordSpans.push(span);
    });

    this.clearButtons();
    const checkBtn = this.addButton('Prüfen', 'secondary', 'glCheck', true);

    let checked = false;

    checkBtn.addEventListener('glaggle-click', () => {
      if (checked) return;
      checked = true;

      let correctWords = 0;
      let wrongMarked = 0;
      let missed = 0;

      // Jedes anklickbare Wort auswerten
      wordSpans.forEach(span => {
        const isAnswer = answers.includes(span.dataset.word) && span.dataset.word !== '';
        const isMarked = span.classList.contains('gl-word-marked');

        if (isAnswer && isMarked) {
          span.classList.add('gl-word-correct');
          span.style.backgroundColor = '#a8e6a3'; // grün
          correctWords++;
        } else if (isAnswer && !isMarked) {
          span.classList.add('gl-word-missed');
          span.style.backgroundColor = '#ffd27f'; // orange = hättest du markieren sollen
          missed++;
        } else if (!isAnswer && isMarked) {
          span.classList.add('gl-word-wrong');
          span.style.backgroundColor = '#ffb3b3'; // rot = falsch markiert
          wrongMarked++;
        }
        span.style.cursor = 'default';
      });

      const totalToFind = answers.length;
      const isFullyCorrect = correctWords === totalToFind && wrongMarked === 0;

      if (isFullyCorrect) this.correctCount++;
      // 2 LP pro richtig markiertes Wort
      this.stepPoints.push(correctWords * 2);

      // Feedback-Text zusammenbauen
      let msg;
      if (isFullyCorrect) {
        msg = `Perfekt! Alle ${totalToFind} Wörter richtig markiert.`;
      } else {
        const parts = [];
        if (correctWords > 0) parts.push(`${correctWords} richtig`);
        if (missed > 0) parts.push(`${missed} vergessen`);
        if (wrongMarked > 0) parts.push(`${wrongMarked} zu viel`);
        msg = `${parts.join(', ')} markiert.`;
      }

      this.showFeedback(isFullyCorrect, msg);
    });
  }

  /* ===== GEÄNDERT: LP kommen jetzt aus stepPoints statt correct * 5 ===== */
  static renderResults(lessonEl, buttonsEl, correct, totalQuestions, elapsedSeconds, finishHref, stepPoints) {
    const pct = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;
    glSaveLessonProgress(pct);

    // Basis-LP aus allen gesammelten Schritt-Punkten
    const basePoints = stepPoints.reduce((sum, p) => sum + p, 0);

    const avgSecPerQuestion = totalQuestions > 0 ? elapsedSeconds / totalQuestions : 999;
    let bonusPerCorrect = 0;
    if (avgSecPerQuestion < 10) bonusPerCorrect = 3;
    else if (avgSecPerQuestion < 20) bonusPerCorrect = 1;

    const bonusPoints = correct * bonusPerCorrect;
    const totalLP = basePoints + bonusPoints;
    const newTotalLP = glAddLP(totalLP);

    const sprueche = glGetSprueche(pct);
    const spruch = sprueche[Math.floor(Math.random() * sprueche.length)];

    lessonEl.innerHTML = `
      <div class="gl-step" style="text-align:center;">
        <h2>🎉 Lektion abgeschlossen!</h2>
        <div class="gl-result-stats">
          <div class="gl-result-box gl-box-time">
            <div class="gl-result-value" id="glStatTime">0s</div>
            <div class="gl-result-label">Zeit</div>
          </div>
          <div class="gl-result-box gl-box-pct">
            <div class="gl-result-value" id="glStatPct">0%</div>
            <div class="gl-result-label">Richtig</div>
          </div>
          <div class="gl-result-box gl-box-lp">
            <div class="gl-result-value" id="glStatLP">0 LP</div>
            <div class="gl-result-label" id="glStatLPLabel">Learn Points</div>
          </div>
        </div>
        <p class="gl-result-quote">${spruch}</p>
        <p class="gl-result-quote" style="animation-delay: 2.1s;">Gesamt-LP: <strong id="glTotalLP">${glGetTotalLP() - totalLP}</strong></p>
      </div>
    `;

    const lpIcon = '<img src="../../shared/lp.png" alt="" class="gl-lp-icon" onerror="this.remove()">';

    const timeEl = lessonEl.querySelector('#glStatTime');
    const pctEl = lessonEl.querySelector('#glStatPct');
    const lpEl = lessonEl.querySelector('#glStatLP');
    const lpLabelEl = lessonEl.querySelector('#glStatLPLabel');
    const totalLpEl = lessonEl.querySelector('#glTotalLP');

    lpLabelEl.textContent = bonusPoints > 0 ? `+${bonusPoints} Bonus` : 'Learn Points';

    const DURATION = 2000;

    glCountUp(timeEl, elapsedSeconds, DURATION, (v) => glFormatTime(v));
    glCountUp(pctEl, pct, DURATION, (v) => `${v}%`);
    glCountUp(lpEl, totalLP, DURATION, (v) => `${lpIcon}${v} LP`);

    setTimeout(() => {
      lessonEl.querySelectorAll('.gl-result-box').forEach(box => box.classList.add('gl-glow'));
    }, DURATION + 100);

    const prevTotal = newTotalLP - totalLP;
    glCountUp(totalLpEl, newTotalLP, DURATION, (v) => String(Math.max(prevTotal, v)));

    buttonsEl.innerHTML = '';
    const finishBtn = document.createElement('glaggle-button');
    finishBtn.setAttribute('text', 'Zur Startseite');
    finishBtn.setAttribute('variant', 'primary');
    finishBtn.setAttribute('full-width', '');
    finishBtn.id = 'glFinish';
    buttonsEl.appendChild(finishBtn);
    finishBtn.addEventListener('glaggle-click', () => {
      window.location.href = finishHref;
    });
  }

  static mount(options) {
    const target = options.target || document.body;
    const backHref = options.backHref || '../index.html';
    const steps = options.steps;

    target.innerHTML = `
      <div class="gl-lesson-wrap" id="glWrap">
        <div class="gl-lesson-header">
          <a href="${backHref}" title="Zurück">✕</a>
          <glaggle-progress id="glProgress" value="0" max="1"></glaggle-progress>
        </div>
        <div class="gl-lesson-content">
          <glaggle-card>
            <div id="glLesson"></div>
          </glaggle-card>
        </div>
        <div class="gl-lesson-buttons" id="glButtons"></div>
      </div>
    `;

    const wrapEl = target.querySelector('#glWrap');
    const lessonEl = target.querySelector('#glLesson');
    const progressEl = target.querySelector('#glProgress');
    const buttonsEl = target.querySelector('#glButtons');

    const start = () => {
      new GlaggleLesson(lessonEl, steps, {
        progressEl,
        buttonsContainer: buttonsEl,
        wrapEl,
        onComplete: (correct, totalQuestions, elapsedSeconds, stepPoints) => {
          GlaggleLesson.renderResults(
            lessonEl, buttonsEl, correct, totalQuestions,
            elapsedSeconds, backHref, stepPoints
          );
        }
      });
    };

    Promise.all([
      customElements.whenDefined('glaggle-button'),
      customElements.whenDefined('glaggle-card'),
      customElements.whenDefined('glaggle-progress')
    ]).then(start);
  }
}
