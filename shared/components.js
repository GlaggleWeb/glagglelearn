/* ==========================================================================
   GLAGGLE LEARN — SHARED COMPONENTS
   Definiert wiederverwendbare Web Components. Einbinden per:
     <script src="../shared/components.js" defer></script>
   Danach einfach im HTML verwenden, z.B.:
     <glaggle-button text="Weiter" variant="primary"></glaggle-button>
   Kein CSS/JS muss auf der einzelnen Seite wiederholt werden.
   ========================================================================== */

class GlaggleButton extends HTMLElement {
  static get observedAttributes() {
    return ['text', 'variant', 'disabled', 'full-width'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    // Delegation auf shadowRoot statt auf dem <button> selbst:
    // so geht der Listener nicht verloren, wenn render() das <button>
    // Element beim Attribut-Wechsel (z.B. disabled entfernen) neu erzeugt.
    this.shadowRoot.addEventListener('click', (e) => {
      if (!e.target.closest('button')) return;
      if (this.hasAttribute('disabled')) return;
      this.dispatchEvent(new CustomEvent('glaggle-click', { bubbles: true, composed: true }));
    });
  }

  attributeChangedCallback() {
    if (this.shadowRoot.innerHTML) this.render();
  }

  render() {
    const text = this.getAttribute('text') || this.textContent.trim() || 'Button';
    const variant = this.getAttribute('variant') || 'primary';
    const disabled = this.hasAttribute('disabled');
    const fullWidth = this.hasAttribute('full-width');

    const colors = {
      primary:   { bg: 'var(--gl-primary)',   shadow: 'var(--gl-primary-shadow)',   hover: 'var(--gl-primary-hover)',   text: 'var(--gl-text-on-accent)' },
      secondary: { bg: 'var(--gl-secondary)', shadow: 'var(--gl-secondary-shadow)', hover: 'var(--gl-secondary-hover)', text: '#0d2b3a' },
      danger:    { bg: 'var(--gl-danger)',    shadow: 'var(--gl-danger-shadow)',    hover: 'var(--gl-danger)',          text: '#3a0d0d' },
      ghost:     { bg: 'transparent',         shadow: 'var(--gl-border)',           hover: 'var(--gl-border)',          text: 'var(--gl-text)' }
    };
    const c = colors[variant] || colors.primary;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: ${fullWidth ? 'block' : 'inline-block'};
          --font: var(--gl-font, 'Segoe UI', sans-serif);
        }
        button {
          font-family: var(--font);
          width: ${fullWidth ? '100%' : 'auto'};
          padding: 16px 32px;
          font-size: 1rem;
          font-weight: 800;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          color: ${c.text};
          background: ${c.bg};
          border: none;
          border-radius: var(--gl-radius-lg, 24px);
          box-shadow: 0 6px 0 ${c.shadow};
          cursor: ${disabled ? 'not-allowed' : 'pointer'};
          opacity: ${disabled ? 0.5 : 1};
          transition: transform 0.08s ease, box-shadow 0.08s ease, background 0.2s ease;
          user-select: none;
        }
        button:hover:not(:disabled) {
          background: ${c.hover};
        }
        button:active:not(:disabled) {
          transform: translateY(4px);
          box-shadow: 0 2px 0 ${c.shadow};
        }
      </style>
      <button ${disabled ? 'disabled' : ''}>${text}</button>
    `;
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
          /* Sanftes Gleiten nach vorne statt Aufpump-Effekt */
          transition: width 0.6s cubic-bezier(0.65, 0, 0.35, 1), border-radius 0.6s ease;
        }
        .fill.full { border-radius: 999px; }
      </style>
      <div class="track">
        <div class="fill"></div>
      </div>
    `;
    this.updateFill();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) this.updateFill();
  }

  updateFill() {
    const fillEl = this.shadowRoot.querySelector('.fill');
    if (!fillEl) return;
    const value = parseFloat(this.getAttribute('value')) || 0;
    const max = parseFloat(this.getAttribute('max')) || 100;
    const pct = Math.max(0, Math.min(100, (value / max) * 100));

    // requestAnimationFrame sorgt dafür, dass der Browser den Startwert
    // (z.B. 0%) erst rendert, bevor die transition zum neuen Wert greift —
    // sonst gleitet die allererste Füllung nicht sichtbar.
    requestAnimationFrame(() => {
      fillEl.style.width = pct + '%';
      fillEl.classList.toggle('full', pct >= 100);
    });
  }
}

customElements.define('glaggle-button', GlaggleButton);
customElements.define('glaggle-card', GlaggleCard);
customElements.define('glaggle-progress', GlaggleProgress);
