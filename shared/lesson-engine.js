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
           buttonsContainer: document.getElementById('glButtons'),
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
    this.buttonsContainer = options.buttonsContainer || null;

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
        <div id="glFeedback" class="gl-feedback"></div>
      </div>
    `;
    
    const optionsEl = this.container.querySelector('#glOptions');
    const feedbackEl = this.container.querySelector('#glFeedback');
    
    let selected = null;
    let checked = false;
    const optionButtons = [];

    // Buttons erstellen
    this.clearButtons();
    const checkBtn = this.addButton('Prüfen', 'secondary', 'glCheck', true);
    const nextBtn = this.addButton('Weiter', 'primary', 'glNext', true);

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
      if (isCorrect) this.correctCount++;

      feedbackEl.innerText = isCorrect ? '✅ Richtig!' : '❌ Leider falsch.';
      feedbackEl.className = 'gl-feedback ' + (isCorrect ? 'gl-feedback-ok' : 'gl-feedback-bad');
      checkBtn.setAttribute('disabled', '');
      nextBtn.removeAttribute('disabled');
    });

    nextBtn.addEventListener('glaggle-click', () => {
      if (!checked) return;
      this.next();
    });
  }

  renderBlank(step) {
    this.container.innerHTML = `
      <div class="gl-step">
        <h2>${step.question}</h2>
        <input type="text" id="glBlankInput" class="gl-input" placeholder="Antwort eingeben..." autocomplete="off">
        <div id="glFeedback" class="gl-feedback"></div>
      </div>
    `;
    
    const input = this.container.querySelector('#glBlankInput');
    const feedbackEl = this.container.querySelector('#glFeedback');
    
    this.clearButtons();
    const checkBtn = this.addButton('Prüfen', 'secondary', 'glCheck', true);
    const nextBtn = this.addButton('Weiter', 'primary', 'glNext', true);
    
    let answered = false;

    const check = () => {
      if (answered) return;
      answered = true;
      const isCorrect = input.value.trim().toLowerCase() === step.answer.trim().toLowerCase();
      if (isCorrect) this.correctCount++;
      feedbackEl.innerText = isCorrect ? '✅ Richtig!' : `❌ Richtige Antwort: ${step.answer}`;
      feedbackEl.className = 'gl-feedback ' + (isCorrect ? 'gl-feedback-ok' : 'gl-feedback-bad');
      input.disabled = true;
      checkBtn.setAttribute('disabled', '');
      nextBtn.removeAttribute('disabled');
    };

    input.addEventListener('input', () => {
      if (input.value.trim().length > 0) checkBtn.removeAttribute('disabled');
      else checkBtn.setAttribute('disabled', '');
    });
    checkBtn.addEventListener('glaggle-click', check);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !answered) check(); });
    nextBtn.addEventListener('glaggle-click', () => {
      if (!answered) return;
      this.next();
    });
  }
}
