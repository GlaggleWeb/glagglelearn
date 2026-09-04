/* ==========================================================================
   GLAGGLE LEARN — LESSON ENGINE
   Rendert eine Lektion aus einem simplen JS-Array. Unterstützte Typen:

   { type: 'info',   title: '...', text: '...' }
   { type: 'mc',      question: '...', options: ['A','B','C'], correct: 1 }
   { type: 'blank',   question: '...', answer: 'wort' }  // Lückentext

   Benutzung auf einer Lektionsseite (siehe lektionen/mathe/lektion1.html
   für ein Minimalbeispiel — die Seite selbst enthält NUR noch das
   steps-Array und einen Aufruf von GlaggleLesson.mount(...)):

     <script src="../../shared/lesson-engine.js" defer></script>
     <script>
       GlaggleLesson.mount({
         steps: [ ... ],
         backHref: '../index.html'
       });
     </script>

   Alles Weitere — DOM-Grundgerüst, Buttons, Fortschritt, Feedback,
   Ergebnisseite mit Animation, LP-Speicherung in localStorage — übernimmt
   diese Datei.
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

/* ---------- Hilfsfunktionen ---------- */
function glFormatTime(totalSeconds) {
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

/* Zählt ein Element von 0 auf einen Zielwert hoch, ca. `duration` ms lang.
   formatFn formatiert den jeweiligen Zwischenwert (z.B. mit "%" oder "LP"). */
function glCountUp(el, target, duration, formatFn) {
  const start = performance.now();
  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(1, elapsed / duration);
    // easeOutCubic — schnell am Anfang, sanft einlaufend am Ende
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
    this.startTime = Date.now();
    this.onComplete = options.onComplete || (() => {});
    this.progressEl = options.progressEl || null;
    this.buttonsContainer = options.buttonsContainer || null;
    this.wrapEl = options.wrapEl || null; // für Hintergrund-Flash grün/rot

    // Nur Fragen zählen (mc/blank), nicht info-Folien
    this.totalQuestions = steps.filter(s => s.type === 'mc' || s.type === 'blank').length;

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
      this.onComplete(this.correctCount, this.totalQuestions, elapsedSeconds);
      return;
    }

    if (step.type === 'info') this.renderInfo(step);
    else if (step.type === 'mc') this.renderMC(step);
    else if (step.type === 'blank') this.renderBlank(step);
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

  /* Ersetzt den Prüfen-Button durch ein Feedback-Banner + Weiter-Button.
     isCorrect steuert Text/Farbe des Banners und den Hintergrund-Flash. */
showFeedback(isCorrect, correctAnswerText) {
  // Hintergrund grün/rot setzen
  this.setFlash(isCorrect ? 'ok' : 'bad');

  // Prüfen-Button entfernen
  this.clearButtons();

  // Sound bei richtiger Antwort abspielen
  if (isCorrect) {
    const audio = new Audio('./true.aac');

    audio.play().catch((error) => {
      console.warn('true.aac konnte nicht abgespielt werden:', error);
    });
  }

  // Feedback-Banner erstellen
  const banner = document.createElement('div');

  banner.className =
    'gl-feedback-banner ' +
    (isCorrect ? 'gl-feedback-ok' : 'gl-feedback-bad');

  banner.innerHTML = isCorrect
    ? `
      <span class="gl-feedback-icon">✅</span>
      <span>Richtig!</span>
    `
    : `
      <span class="gl-feedback-icon">❌</span>
      <span>Leider falsch — richtig wäre: ${correctAnswerText}</span>
    `;

  this.buttonsContainer.appendChild(banner);

  // Weiter-Button erstellen
  const nextBtn = this.addButton(
    'Weiter',
    'primary',
    'glNext',
    false
  );

  // Beim Klicken zur nächsten Frage
  nextBtn.addEventListener('glaggle-click', () => {
    this.next();
  });
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

      this.showFeedback(isCorrect, step.options[step.correct]);
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
      input.disabled = true;

      this.showFeedback(isCorrect, step.answer);
    };

    input.addEventListener('input', () => {
      if (input.value.trim().length > 0) checkBtn.removeAttribute('disabled');
      else checkBtn.setAttribute('disabled', '');
    });
    checkBtn.addEventListener('glaggle-click', check);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !answered) check(); });
  }

  /* Rendert die animierte, bunte Ergebnisseite und speichert die LP.
     lessonEl/buttonsEl: DOM-Container. finishHref: Ziel des Abschluss-Buttons. */
  static renderResults(lessonEl, buttonsEl, correct, totalQuestions, elapsedSeconds, finishHref) {
    const pct = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;

    // LP-Berechnung: 5 LP pro richtige Antwort + Zeit-Bonus pro Frage
    const avgSecPerQuestion = totalQuestions > 0 ? elapsedSeconds / totalQuestions : 999;
    let bonusPerCorrect = 0;
    if (avgSecPerQuestion < 30) bonusPerCorrect = 3;
    else if (avgSecPerQuestion < 60) bonusPerCorrect = 1;

    const basePoints = correct * 5;
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

    const DURATION = 2000; // ca. 2 Sekunden pro Kästchen, wie gewünscht

    // Zeit-Kästchen zählt in Sekunden hoch und wird am Ende formatiert
    glCountUp(timeEl, elapsedSeconds, DURATION, (v) => glFormatTime(v));
    glCountUp(pctEl, pct, DURATION, (v) => `${v}%`);
    glCountUp(lpEl, totalLP, DURATION, (v) => `${lpIcon}${v} LP`);

    // Glüh-Effekt erst NACH dem Hochzählen aktivieren
    setTimeout(() => {
      lessonEl.querySelectorAll('.gl-result-box').forEach(box => box.classList.add('gl-glow'));
    }, DURATION + 100);

    // Gesamt-LP ebenfalls sanft von "vorher" auf "nachher" hochzählen
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

  /* Baut das komplette Lektions-DOM-Grundgerüst in `target` auf und startet
     die Lektion, sobald die Web Components registriert sind. Damit braucht
     eine einzelne Lektionsseite nur noch:
       <div id="glLessonRoot"></div>
       <script src="../../shared/lesson-engine.js" defer></script>
       <script>
         GlaggleLesson.mount({ target: document.getElementById('glLessonRoot'),
                                steps: [...], backHref: '../index.html' });
       </script> */
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
        onComplete: (correct, totalQuestions, elapsedSeconds) => {
          GlaggleLesson.renderResults(lessonEl, buttonsEl, correct, totalQuestions, elapsedSeconds, backHref);
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
