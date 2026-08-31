/* ==========================================================================
   GLAGGLE LEARN — LESSON ENGINE
   Rendert eine Lektion aus einem simplen JS-Array. Unterstützte Typen:

   { type: 'info',   title: '...', text: '...' }
   { type: 'mc',      question: '...', options: ['A','B','C'], correct: 1 }
   { type: 'blank',   question: '...', answer: 'wort' }  // Lückentext

   Benutzung auf einer Lektionsseite:
     <script src="../shared/lesson-engine.js" defer></script>
     <script>
       const steps = [ ... ];
       window.addEventListener('DOMContentLoaded', () => {
         new GlaggleLesson(document.getElementById('lesson'), steps, {
           onComplete: () => alert('Fertig!')
         });
       });
     </script>
   ========================================================================== */

class GlaggleLesson {
  constructor(container, steps, options = {}) {
    this.container = container;
    this.steps = steps;
    this.current = 0;
    this.correctCount = 0;
    this.onComplete = options.onComplete || (() => {});
    this.progressEl = options.progressEl || null;

    this.renderStep();
  }

  updateProgress() {
    if (this.progressEl) {
      this.progressEl.setAttribute('value', this.current);
      this.progressEl.setAttribute('max', this.steps.length);
    }
  }

  renderStep() {
    this.updateProgress();
    const step = this.steps[this.current];
    if (!step) {
      this.onComplete(this.correctCount, this.steps.length);
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

  renderInfo(step) {
    this.container.innerHTML = `
      <div class="gl-step">
        <h2>${step.title}</h2>
        <p class="gl-step-text">${step.text}</p>
        <glaggle-button text="Weiter" variant="primary" full-width id="glNext"></glaggle-button>
      </div>
    `;
    this.container.querySelector('#glNext')
      .addEventListener('glaggle-click', () => this.next());
  }

  renderMC(step) {
    this.container.innerHTML = `
      <div class="gl-step">
        <h2>${step.question}</h2>
        <div class="gl-options" id="glOptions"></div>
        <div id="glFeedback" class="gl-feedback"></div>
        <glaggle-button text="Weiter" variant="primary" full-width id="glNext" disabled></glaggle-button>
      </div>
    `;
    const optionsEl = this.container.querySelector('#glOptions');
    const feedbackEl = this.container.querySelector('#glFeedback');
    const nextBtn = this.container.querySelector('#glNext');
    let answered = false;

    step.options.forEach((optText, i) => {
      const optBtn = document.createElement('button');
      optBtn.className = 'gl-option';
      optBtn.type = 'button';
      optBtn.innerText = optText;
      optBtn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const isCorrect = i === step.correct;
        optBtn.classList.add(isCorrect ? 'gl-correct' : 'gl-wrong');
        if (!isCorrect) {
          const correctBtn = optionsEl.children[step.correct];
          correctBtn.classList.add('gl-correct');
        } else {
          this.correctCount++;
        }
        feedbackEl.innerText = isCorrect ? '✅ Richtig!' : '❌ Leider falsch.';
        feedbackEl.className = 'gl-feedback ' + (isCorrect ? 'gl-feedback-ok' : 'gl-feedback-bad');
        nextBtn.removeAttribute('disabled');
      });
      optionsEl.appendChild(optBtn);
    });

    nextBtn.addEventListener('glaggle-click', () => {
      if (!answered) return;
      this.next();
    });
  }

  renderBlank(step) {
    this.container.innerHTML = `
      <div class="gl-step">
        <h2>${step.question}</h2>
        <input type="text" id="glBlankInput" class="gl-input" placeholder="Antwort eingeben..." autocomplete="off">
        <div id="glFeedback" class="gl-feedback"></div>
        <glaggle-button text="Prüfen" variant="secondary" full-width id="glCheck"></glaggle-button>
        <glaggle-button text="Weiter" variant="primary" full-width id="glNext" disabled></glaggle-button>
      </div>
    `;
    const input = this.container.querySelector('#glBlankInput');
    const feedbackEl = this.container.querySelector('#glFeedback');
    const checkBtn = this.container.querySelector('#glCheck');
    const nextBtn = this.container.querySelector('#glNext');
    let answered = false;

    const check = () => {
      if (answered) return;
      answered = true;
      const isCorrect = input.value.trim().toLowerCase() === step.answer.trim().toLowerCase();
      if (isCorrect) this.correctCount++;
      feedbackEl.innerText = isCorrect ? '✅ Richtig!' : `❌ Richtige Antwort: ${step.answer}`;
      feedbackEl.className = 'gl-feedback ' + (isCorrect ? 'gl-feedback-ok' : 'gl-feedback-bad');
      input.disabled = true;
      nextBtn.removeAttribute('disabled');
    };

    checkBtn.addEventListener('glaggle-click', check);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
    nextBtn.addEventListener('glaggle-click', () => {
      if (!answered) return;
      this.next();
    });
  }
}
