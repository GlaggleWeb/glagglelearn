/* ==========================================================================
   GLAGGLE LEARN — SHARED COMPONENTS
   Definiert wiederverwendbare Web Components. Einbinden per:
     <script src="../shared/components.js" defer></script>
   Danach einfach im HTML verwenden, z.B.:
     <glaggle-button text="Weiter" variant="primary"></glaggle-button>
   Kein CSS/JS muss auf der einzelnen Seite wiederholt werden.
   ========================================================================== */

class GlaggleProgress extends HTMLElement {
  static get observedAttributes() {
    return ['value', 'max'];
  }

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this._built = false;
    this.render();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) this.render();
  }

  render() {
    const value = parseFloat(this.getAttribute('value')) || 0;
    const max = parseFloat(this.getAttribute('max')) || 100;
    const pct = Math.max(0, Math.min(100, (value / max) * 100));

    // Beim allerersten Aufbau: komplettes Markup schreiben.
    // Danach NUR noch die Breite ändern, damit die CSS-Transition
    // sanft animiert statt bei jedem Rebuild schlagartig zu springen.
    if (!this._built) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; width: 100%; }
          .track {
            width: 100%;
            height: 18px;
            background: var(--gl-border, #e5e7eb);
            border-radius: 999px;
            overflow: hidden;
            box-shadow: inset 0 2px 3px rgba(0,0,0,0.08);
          }
          .fill {
            height: 100%;
            width: 0%;
            background: linear-gradient(180deg, var(--gl-primary-hover, #b3e070), var(--gl-primary, #a4d65e));
            border-radius: 999px 0 0 999px;
            box-shadow: inset 0 -3px 0 rgba(0,0,0,0.12);
            transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
          }
          .fill.full { border-radius: 999px; }
          .fill.pulse { animation: glPulse 0.4s ease-out; }
          @keyframes glPulse {
            0% { filter: brightness(1); }
            40% { filter: brightness(1.35); }
            100% { filter: brightness(1); }
          }
        </style>
        <div class="track">
          <div class="fill"></div>
        </div>
      `;
      this._built = true;
      // Erstes Setzen der Breite in nächstem Frame, damit die
      // Transition von 0% auf den Startwert auch greift.
      requestAnimationFrame(() => this._applyWidth(pct, value));
      return;
    }

    this._applyWidth(pct, value);
  }

  _applyWidth(pct, value) {
    const fillEl = this.shadowRoot.querySelector('.fill');
    if (!fillEl) return;
    fillEl.style.width = pct + '%';
    fillEl.classList.toggle('full', pct >= 100);

    if (value > 0) {
      fillEl.classList.remove('pulse');
      // reflow erzwingen, damit die Animation bei wiederholtem
      // Hinzufügen der Klasse jedes Mal neu startet
      void fillEl.offsetWidth;
      fillEl.classList.add('pulse');
      fillEl.addEventListener('animationend', () => fillEl.classList.remove('pulse'), { once: true });
    }
  }
}

class GlaggleCard extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          box-sizing: border-box;
        }
        .inner {
          background: var(--gl-surface);
          border: 1px solid var(--gl-border);
          border-radius: var(--gl-radius-md, 16px);
          padding: var(--gl-space-3, 24px);
          box-shadow: 0 4px 14px rgba(0,0,0,0.06);
          box-sizing: border-box;
        }
      </style>
      <div class="inner"><slot></slot></div>
    `;
  }
}

class GlaggleProgress extends HTMLElement {
  static get observedAttributes() {
    return ['value', 'max'];
  }

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.render();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) this.render();
  }

  render() {
    const value = parseFloat(this.getAttribute('value')) || 0;
    const max = parseFloat(this.getAttribute('max')) || 100;
    const pct = Math.max(0, Math.min(100, (value / max) * 100));

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; width: 100%; }
        .track {
          width: 100%;
          height: 18px;
          background: var(--gl-border, #e5e7eb);
          border-radius: 999px;
          overflow: hidden;
          box-shadow: inset 0 2px 3px rgba(0,0,0,0.08);
        }
        .fill {
          height: 100%;
          width: ${pct}%;
          background: linear-gradient(180deg, var(--gl-primary-hover, #b3e070), var(--gl-primary, #a4d65e));
          border-radius: 999px 0 0 999px;
          box-shadow: inset 0 -3px 0 rgba(0,0,0,0.12);
          transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .fill.full { border-radius: 999px; }
        .fill.pulse { animation: glPulse 0.4s ease-out; }
        @keyframes glPulse {
          0% { filter: brightness(1); }
          40% { filter: brightness(1.35); }
          100% { filter: brightness(1); }
        }
      </style>
      <div class="track">
        <div class="fill ${pct >= 100 ? 'full' : ''}"></div>
      </div>
    `;

  if (value > 0) {
      const fillEl = this.shadowRoot.querySelector('.fill');
      fillEl.classList.add('pulse');
      fillEl.addEventListener('animationend', () => fillEl.classList.remove('pulse'), { once: true });
    }
  }   // ← schliesst render()
}     // ← schliesst die Klasse GlaggleProgress

customElements.define('glaggle-button', GlaggleButton);
customElements.define('glaggle-card', GlaggleCard);
customElements.define('glaggle-progress', GlaggleProgress);
