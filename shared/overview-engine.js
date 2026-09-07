/* ==========================================================================
   GLAGGLE LEARN — ÜBERSICHTS-ENGINE (shared/overview-engine.js)
   Baut eine komplette Übersichts-/Lernpfad-Seite NUR aus einer Config-Liste.
   Die Übersichtsseite selbst enthält kein HTML, CSS und JS mehr, sondern
   nur noch die Einbindung dieser Datei + einen mount()-Aufruf (siehe
   lektionen/mathe/einmaleins-ueben/index.html).

   Benutzung:
     GlaggleOverview.mount({
       title:   'Einmaleins üben',         // Header-Titel + Tab-Titel
       homeUrl: 'https://learn.glaggle.ch/index.html',  // Ziel des ✕-Links
       intro:   'Einleitungstext...',     // optional, '' = weglassen
       lektionen: [
         { file: 'lektion2.html', label: 'Lektion 2', sub: 'Bunt gemischt', emoji: '🎲' },
       ],
       // optional:
       siteName:    'Glaggle Learn',       // Anhang im Tab-Titel
       homeIcon:    '✕',
       align:       'auto',                // 'auto' = Zickzack, oder 'left'/'center'/'right'
       progressKey: 'glaggleLessonProgress',
       footerAllDone: '🎉 Alle Lektionen geschafft — stark!',
     });

   Fortschritt kommt aus localStorage (Key "glaggleLessonProgress"),
   geschrieben von lesson-engine.js beim Lektionsabschluss:
   { "<dateiname>.html": { done: true, pct: 87, lastCompleted: "..." } }
   ========================================================================== */
(function () {
  'use strict';

  const NODE_HEIGHT = 96;   // ungefähre Höhe einer Karte inkl. Abstand
  const ROW_GAP = 56;       // vertikaler Abstand zwischen den Reihen

  const DEFAULTS = {
    title: 'Übersicht',
    siteName: 'Glaggle Learn',
    homeUrl: 'index.html',
    homeIcon: '✕',
    intro: '',
    progressKey: 'glaggleLessonProgress',
    footerAllDone: '🎉 Alle Lektionen geschafft — stark!',
    align: 'auto',
    lektionen: []
  };

  let CFG = null;

  function glEsc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* ---------- Fortschritt aus localStorage ---------- */
  function glGetProgress() {
    try {
      const raw = localStorage.getItem(CFG.progressKey);
      const obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
      console.warn('Konnte "' + CFG.progressKey + '" nicht lesen:', e);
      return {};
    }
  }

  /* ---------- horizontale Position einer Karte ---------- */
  function glAlignFor(lek, i) {
    if (lek.align) return lek.align;                       // pro Lektion überschreibbar
    if (CFG.align && CFG.align !== 'auto') return CFG.align;
    return i % 2 === 0 ? 'left' : 'right';                 // Standard: Zickzack wie Skizze
  }

  /* ---------- Grundgerüst (Header, Content, Pfad) einmalig aufbauen ---------- */
  function glBuildSkeleton() {
    document.title = CFG.siteName ? CFG.title + ' | ' + CFG.siteName : CFG.title;

    const wrap = document.createElement('div');
    wrap.className = 'gl-overview-wrap';
    wrap.innerHTML =
      '<div class="gl-overview-header">' +
        '<a href="' + glEsc(CFG.homeUrl) + '" title="Zurück">' + glEsc(CFG.homeIcon) + '</a>' +
        '<h1></h1>' +
      '</div>' +
      '<div class="gl-overview-content">' +
        '<div class="gl-path">' +
          (CFG.intro ? '<p class="gl-path-intro"></p>' : '') +
          '<svg class="gl-path-svg" id="glPathSvg" preserveAspectRatio="none"></svg>' +
          '<div class="gl-nodes" id="glNodes"></div>' +
          '<p class="gl-path-footer" id="glPathFooter"></p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    wrap.querySelector('h1').textContent = CFG.title;
    if (CFG.intro) wrap.querySelector('.gl-path-intro').textContent = CFG.intro;
  }

  /* ---------- Layout: Positionen der Karten berechnen ---------- */
  function glBuildLayout() {
    const pathEl = document.querySelector('.gl-path');
    const containerWidth = pathEl.clientWidth;
    const nodeWidthPct = containerWidth <= 560 ? 0.60 : 0.46;
    const nodeWidth = containerWidth * nodeWidthPct;

    const positions = CFG.lektionen.map((lek, i) => {
      const align = glAlignFor(lek, i);
      const y = i * (NODE_HEIGHT + ROW_GAP);
      let x = 0;
      if (align === 'right') x = containerWidth - nodeWidth;
      else if (align === 'center') x = (containerWidth - nodeWidth) / 2;
      return { x, y, w: nodeWidth };
    });

    const totalHeight =
      Math.max(0, CFG.lektionen.length - 1) * (NODE_HEIGHT + ROW_GAP) + NODE_HEIGHT;
    return { positions, totalHeight };
  }

  /* ---------- SVG-Verbindungslinien (S-Kurven) ---------- */
  function glRenderConnectors(positions, totalHeight) {
    const svg = document.getElementById('glPathSvg');
    const width = document.querySelector('.gl-path').clientWidth;
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + totalHeight);
    svg.style.height = totalHeight + 'px';

    let pathsHtml = '';
    for (let i = 0; i < positions.length - 1; i++) {
      const from = positions[i];
      const to = positions[i + 1];
      const fromX = from.x + (to.x > from.x ? from.w : 0);
      const fromY = from.y + NODE_HEIGHT * 0.55;
      const toX = to.x + (to.x > from.x ? 0 : to.w);
      const toY = to.y + NODE_HEIGHT * 0.45;
      const midY = (fromY + toY) / 2;
      pathsHtml += '<path d="M ' + fromX + ' ' + fromY +
                   ' C ' + fromX + ' ' + midY + ', ' + toX + ' ' + midY +
                   ', ' + toX + ' ' + toY + '" />';
    }
    svg.innerHTML = pathsHtml;
  }

  /* ---------- Lektions-Karten (done / next / locked) ---------- */
  function glRenderNodes(positions, progress) {
    const nodesEl = document.getElementById('glNodes');
    nodesEl.innerHTML = '';
    if (CFG.lektionen.length > 0) {
      nodesEl.style.height = (positions[positions.length - 1].y + NODE_HEIGHT) + 'px';
    }

    let nextAssigned = false;

    CFG.lektionen.forEach((lek, i) => {
      const pos = positions[i];
      const entry = progress[lek.file];
      const isDone = !!entry;
      const prevDone = i === 0 || !!progress[CFG.lektionen[i - 1].file];
      const isNext = !isDone && prevDone && !nextAssigned;
      if (isNext) nextAssigned = true;
      const isLocked = !isDone && !isNext;

      const stateClass = isDone ? 'gl-done' : (isNext ? 'gl-next' : 'gl-locked');
      const tag = isLocked ? 'div' : 'a';
      const pct = isDone ? (entry.pct || 0) : 0;
      const pctLabel = isDone ? pct + '%' : '–';

      const node = document.createElement(tag);
      node.className = 'gl-node ' + stateClass;
      if (!isLocked) node.setAttribute('href', lek.file);
      node.style.left = pos.x + 'px';
      node.style.top = pos.y + 'px';
      node.style.width = pos.w + 'px';

      node.innerHTML =
        '<div class="gl-node-box">' +
          (isNext ? '<div class="gl-node-badge">Weiter</div>' : '') +
          '<div class="gl-node-icon">' +
            (isDone ? '✓' : (isLocked ? '🔒' : glEsc(lek.emoji || '⭐'))) +
          '</div>' +
          '<div class="gl-node-body">' +
            '<div class="gl-node-title">' + glEsc(lek.label) + '</div>' +
            '<div class="gl-node-sub">' + glEsc(lek.sub || '') + '</div>' +
            '<div class="gl-node-bar-track">' +
              '<div class="gl-node-bar-fill" style="width:' + pct + '%"></div>' +
            '</div>' +
          '</div>' +
          '<div class="gl-node-pct ' + (isDone ? '' : 'gl-empty') + '">' + pctLabel + '</div>' +
        '</div>';
      nodesEl.appendChild(node);
    });

    const doneCount = CFG.lektionen.filter((l) => progress[l.file]).length;
    document.getElementById('glPathFooter').textContent =
      (CFG.lektionen.length > 0 && doneCount === CFG.lektionen.length)
        ? CFG.footerAllDone
        : doneCount + ' von ' + CFG.lektionen.length + ' Lektionen abgeschlossen';
  }

  /* ---------- alles rendern ---------- */
  function glRenderAll() {
    const progress = glGetProgress();
    console.log('[Übersicht] gelesener Fortschritt aus localStorage:', progress);
    if (Object.keys(progress).length === 0) {
      console.warn('[Übersicht] "' + CFG.progressKey + '" ist leer oder nicht vorhanden. ' +
        'Prüfe: 1) läuft diese Seite auf demselben Origin wie die Lektionsseiten? ' +
        '2) schreibt lesson-engine.js den Fortschritt unter diesem Key? ' +
        '3) wurde mindestens eine Lektion bis zum Ende durchgespielt?');
    }
    const layout = glBuildLayout();
    glRenderConnectors(layout.positions, layout.totalHeight);
    glRenderNodes(layout.positions, progress);
  }

  function glInit() {
    glBuildSkeleton();
    glRenderAll();
    window.addEventListener('resize', glRenderAll);   // SVG-Linien verrutschen nicht
  }

  window.GlaggleOverview = {
    mount(options) {
      CFG = Object.assign({}, DEFAULTS, options || {});
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', glInit);
      } else {
        glInit();
      }
    },
    render() { if (CFG) glRenderAll(); }   // manuelles Neu-Rendern, z.B. zum Testen
  };
})();
