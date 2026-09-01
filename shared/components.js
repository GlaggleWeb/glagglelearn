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
    this._lastPct = 0;
    this.render();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) this.render();
  }

  render() {
    const value = parseFloat(this.getAttribute('value')) || 0;
    const max = parseFloat(this.getAttribute('max')) || 100;
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    const grew = pct > this._lastPct;
    this._lastPct = pct;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
        }
        .track {
          width: 100%;
          height: 18px;
          background: var(--gl-border, #e5e7eb);
          border-radius: 999px;
          overflow: hidden;
          box-shadow: inset 0 2px 3px rgba(0,0,0,0.08);
        }
        .fill {
          position: relative;
          height: 100%;
          width: ${pct}%;
          background: linear-gradient(180deg, var(--gl-primary-hover, #b3e070), var(--gl-primary, #a4d65e));
          border-radius: 999px 0 0 999px;
          box-shadow: inset 0 -3px 0 rgba(0,0,0,0.12);
          transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .fill.full {
          border-radius: 999px;
        }
        /* Kurzer Glanz-Sweep, der über den Balken läuft, wenn er wächst */
        .fill.grew::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(
            110deg,
            transparent 30%,
            rgba(255,255,255,0.55) 50%,
            transparent 70%
          );
          background-size: 200% 100%;
          animation: gl-progress-sweep 0.6s ease-out;
        }
        /* Ganzer Balken macht einen kleinen "Hüpfer" beim Update */
        .fill.grew {
          animation: gl-progress-bump 0.4s ease-out;
        }
        @keyframes gl-progress-sweep {
          from { background-position: 150% 0; }
          to   { background-position: -50% 0; }
        }
        @keyframes gl-progress-bump {
          0%   { transform: scaleY(1); }
          40%  { transform: scaleY(1.35); }
          100% { transform: scaleY(1); }
        }
      </style>
      <div class="track">
        <div class="fill ${pct >= 100 ? 'full' : ''} ${grew ? 'grew' : ''}"></div>
      </div>
    `;
  }
}

class GlaggleResults extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    const correct = parseInt(this.getAttribute('correct')) || 0;
    const total = parseInt(this.getAttribute('total')) || 0;
    const percent = parseInt(this.getAttribute('percent')) || 0;
    const seconds = parseInt(this.getAttribute('seconds')) || 0;

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timeStr = mins > 0 ? `${mins} min ${secs} s` : `${secs} s`;

    const { emoji, headline, quote } = this._pickMessage(percent);

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; width: 100%; }
        .wrap {
          text-align: center;
          padding: 8px 4px;
        }
        .emoji {
          font-size: 3.4rem;
          margin-bottom: 8px;
          display: inline-block;
          animation: gl-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        h2 {
          font-size: clamp(1.2rem, 3vw, 1.5rem);
          margin: 0 0 6px;
          color: var(--gl-text);
        }
        .quote {
          color: var(--gl-text-soft);
          font-size: 0.95rem;
          line-height: 1.5;
          margin: 0 0 var(--gl-space-3, 24px);
          font-style: italic;
        }
        .stats {
          display: flex;
          gap: 12px;
          margin-bottom: var(--gl-space-3, 24px);
        }
        .stat {
          flex: 1;
          background: var(--gl-bg);
          border: 1px solid var(--gl-border);
          border-radius: var(--gl-radius-md, 16px);
          padding: 16px 8px;
        }
        .stat-value {
          font-size: 1.6rem;
          font-weight: 800;
          color: var(--gl-primary-shadow);
          display: block;
          animation: gl-pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .stat-label {
          font-size: 0.75rem;
          color: var(--gl-text-soft);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .ring-wrap {
          position: relative;
          width: 120px;
          height: 120px;
          margin: 0 auto var(--gl-space-3, 24px);
        }
        svg { transform: rotate(-90deg); }
        .ring-bg { fill: none; stroke: var(--gl-border); stroke-width: 10; }
        .ring-fg {
          fill: none;
          stroke: var(--gl-primary);
          stroke-width: 10;
          stroke-linecap: round;
          stroke-dasharray: 314;
          stroke-dashoffset: 314;
          animation: gl-ring 1.1s cubic-bezier(0.4, 0, 0.2, 1) 0.15s forwards;
        }
        .ring-label {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--gl-text);
        }
        @keyframes gl-pop {
          0%   { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.12); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes gl-ring {
          to { stroke-dashoffset: ${314 - (314 * percent) / 100}; }
        }
        ::slotted(glaggle-button) {
          display: block;
          margin-top: 8px;
        }
      </style>
      <div class="wrap">
        <span class="emoji">${emoji}</span>
        <h2>${headline}</h2>
        <p class="quote">${quote}</p>

        <div class="ring-wrap">
          <svg viewBox="0 0 120 120" width="120" height="120">
            <circle class="ring-bg" cx="60" cy="60" r="50"></circle>
            <circle class="ring-fg" cx="60" cy="60" r="50"></circle>
          </svg>
          <div class="ring-label">${percent}%</div>
        </div>

        <div class="stats">
          <div class="stat">
            <span class="stat-value">${correct}/${total}</span>
            <span class="stat-label">Richtig</span>
          </div>
          <div class="stat">
            <span class="stat-value">${timeStr}</span>
            <span class="stat-label">Zeit</span>
          </div>
        </div>

        <slot></slot>
      </div>
    `;

    if (percent >= 80) this._launchConfetti();
  }

  _pickMessage(percent) {
    if (percent === 100) {
      return {
        emoji: '🏆',
        headline: 'Perfekt! Alles richtig!',
        quote: 'Wenn das so weitergeht, wirst du noch Albert Einstein 2.0! 🧠⚡'
      };
    }
    if (percent >= 80) {
      return {
        emoji: '🌟',
        headline: 'Stark gemacht!',
        quote: 'Du bist auf dem besten Weg zum Meister — weiter so!'
      };
    }
    if (percent >= 60) {
      return {
        emoji: '💪',
        headline: 'Gut gemacht!',
        quote: 'Solide Runde! Noch ein bisschen Übung und du glänzt richtig.'
      };
    }
    if (percent >= 40) {
      return {
        emoji: '🙂',
        headline: 'Nicht schlecht!',
        quote: 'Übung macht den Meister — probier's gleich nochmal!'
      };
    }
    return {
      emoji: '🌱',
      headline: 'Guter Start!',
      quote: 'Jeder Profi hat mal klein angefangen. Dranbleiben lohnt sich!'
    };
  }

  _launchConfetti() {
    const colors = ['#a4d65e', '#70c4f7', '#ffd166', '#f76c6c', '#c792ea'];
    const count = 26;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = (2 + Math.random() * 1.5) + 's';
      piece.style.animationDelay = (Math.random() * 0.4) + 's';
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 4200);
    }
  }
}

customElements.define('glaggle-button', GlaggleButton);
customElements.define('glaggle-card', GlaggleCard);
customElements.define('glaggle-progress', GlaggleProgress);
customElements.define('glaggle-results', GlaggleResults);
