/* ==========================================================================
   GLAGGLE LEARN — ÜBERSICHTS-ENGINE (shared/overview-engine.js)
   Baut eine komplette Übersichts-/Lernpfad-Seite NUR aus einer Config-Liste.
   Die Übersichtsseite selbst enthält kein HTML, CSS und JS mehr, sondern
   nur noch die Einbindung dieser Datei + einen mount()-Aufruf (siehe
   lektionen/mathe/einmaleins-ueben/index.html).

   Benutzung:
     GlaggleOverview.mount({
       title:   'Einmaleins üben',
       homeUrl: 'https://learn.glaggle.ch/index.html',
       intro:   'Einleitungstext...',     // optional, '' = weglassen
       lektionen: [
         { file: 'lektion2.html', label: 'Lektion 2', sub: 'Bunt gemischt', emoji: '🎲' },
       ],
       // optional:
       siteName:    'Glaggle Learn',
       homeIcon:    '✕',
       align:       'auto',   // 'auto' = Zickzack (Desktop) / Spalte (Handy),
                              // oder fest 'left'/'center'/'right'
       progressKey: 'glaggleLessonProgress',
       footerAllDone: '🎉 Alle Lektionen geschafft — stark!',
     });

   Fortschritt kommt aus localStorage (Key "glaggleLessonProgress"),
   geschrieben von lesson-engine.js beim Lektionsabschluss:
   { "<dateiname>.html": { done: true, pct: 87, lastCompleted: "..." } }

   v2:
   - Verbindungslinien laufen wie in der Skizze von Karte zu Karte
     (Unterkante → Oberkante, sanfte S-Kurve), kein loser roter Strich mehr.
   - Kartenhöhen werden gemessen statt geschätzt → Linien sitzen exakt.
   - Offene Abschnitte: grau gepunktete Spur; erledigte: grün durchgezogen.
   - Mobil (< 560px): zentrierte Spalte, Karten ~92% breit, gerade Spur.
   ========================================================================== */
(function () {
  'use strict';

  const FALLBACK_NODE_HEIGHT = 96;  // nur für den ersten Mess-Durchlauf
  const ROW_GAP = 72;               // Desktop: Luft für die S-Kurve
  const ROW_GAP_MOBILE = 56;
  const MOBILE_BREAK = 560;

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
  let glRafId = 0;

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

  /* ---------- v2.1: echten Themen-Fortschritt veröffentlichen ----------
     Schreibt unter "glaggleTopicProgress" einen Eintrag mit der Ordner-
     Kennung des Themas (z.B. "einmaleins-ueben"), damit die Fach-Übersicht
     themenscharfe Werte lesen kann — keine Kollisionen mehr zwischen
     gleich benannten Lektions-Dateien verschiedener Themen. */
  const TOPIC_PROGRESS_KEY = 'glaggleTopicProgress';

  function glTopicIdFromPath() {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length && parts[parts.length - 1].toLowerCase().endsWith('.html')) parts.pop();
    return parts.length ? decodeURIComponent(parts[parts.length - 1]) : '';
  }

  function glPublishTopicProgress(progress) {
    const total = (CFG.lektionen || []).length;
    const id = CFG.topicId || glTopicIdFromPath();
    if (!id || total === 0) return;
    const done = CFG.lektionen.filter((l) => !!progress[l.file]).length;
    let map = {};
    try { map = JSON.parse(localStorage.getItem(TOPIC_PROGRESS_KEY) || '{}') || {}; } catch (e) { map = {}; }
    map[id] = { done, total, pct: Math.round((done / total) * 100), updated: new Date().toISOString() };
    try { localStorage.setItem(TOPIC_PROGRESS_KEY, JSON.stringify(map)); } catch (e) {}
  }

  /* ---------- horizontale Position einer Karte ---------- */
  function glAlignFor(lek, i, mobile) {
    if (lek.align) return lek.align;                       // pro Lektion überschreibbar
    if (CFG.align && CFG.align !== 'auto') return CFG.align;
    if (mobile) return 'center';                           // Handy: eine Spalte
    return i % 2 === 0 ? 'left' : 'right';                 // Desktop: Zickzack wie Skizze
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
          '<div class="gl-path-canvas">' +
            '<svg class="gl-path-svg" id="glPathSvg" preserveAspectRatio="none"></svg>' +
            '<div class="gl-nodes" id="glNodes"></div>' +
          '</div>' +
          '<p class="gl-path-footer" id="glPathFooter"></p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    wrap.querySelector('h1').textContent = CFG.title;
    if (CFG.intro) wrap.querySelector('.gl-path-intro').textContent = CFG.intro;
  }

  /* ---------- Layout: Positionen der Karten berechnen ----------
     heights = gemessene Kartenhöhen (null → Fallbackwerte) */
  function glBuildLayout(heights) {
    const pathEl = document.querySelector('.gl-path');
    const containerWidth = pathEl.clientWidth;
    const mobile = containerWidth <= MOBILE_BREAK;
    const nodeWidth = containerWidth * (mobile ? 0.92 : 0.46);
    const rowGap = mobile ? ROW_GAP_MOBILE : ROW_GAP;

    let y = 0;
    const positions = CFG.lektionen.map((lek, i) => {
      const align = glAlignFor(lek, i, mobile);
      let x = 0;
      if (align === 'right') x = containerWidth - nodeWidth;
      else if (align === 'center') x = (containerWidth - nodeWidth) / 2;
      const h = (heights && heights[i]) || FALLBACK_NODE_HEIGHT;
      const pos = { x, y, w: nodeWidth, h };
      y += h + rowGap;
      return pos;
    });

    const totalHeight = positions.length
      ? positions[positions.length - 1].y + positions[positions.length - 1].h
      : 0;
    return { positions, totalHeight };
  }

  /* ---------- SVG-Verbindungslinien (S-Kurven von Karte zu Karte) ---------- */
  function glRenderConnectors(positions, totalHeight, progress) {
    const svg = document.getElementById('glPathSvg');
    const width = document.querySelector('.gl-path').clientWidth;
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + Math.max(totalHeight, 1));
    svg.style.height = totalHeight + 'px';

    let pathsHtml = '';
    for (let i = 0; i < positions.length - 1; i++) {
      const from = positions[i];
      const to = positions[i + 1];
      const dir = to.x > from.x ? 1 : (to.x < from.x ? -1 : 0);
      const anchor = 0.5 + dir * 0.14;        // Anker leicht zur Zielseite verschoben
      const fromX = from.x + from.w * anchor; // Unterkante Karte i
      const fromY = from.y + from.h;
      const toX = to.x + to.w * anchor;       // Oberkante Karte i+1
      const toY = to.y;
      const bend = (toY - fromY) * 0.45;
      const done = !!progress[CFG.lektionen[i].file];

      pathsHtml +=
        '<path class="gl-seg ' + (done ? 'gl-seg-done' : 'gl-seg-open') + '" ' +
        'd="M ' + fromX + ' ' + fromY +
        ' C ' + fromX + ' ' + (fromY + bend) + ', ' +
              toX + ' ' + (toY - bend) + ', ' +
              toX + ' ' + toY + '" />';
    }
    svg.innerHTML = pathsHtml;
  }

  /* ---------- Lektions-Karten (done / next / locked) ---------- */
  function glRenderNodes(positions, progress) {
    const nodesEl = document.getElementById('glNodes');
    nodesEl.innerHTML = '';

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

  /* ---------- alles rendern (2 Durchläufe: bauen → messen → exakt setzen) ---------- */
  function glRenderAll() {
    const progress = glGetProgress();
    glPublishTopicProgress(progress);
    console.log('[Übersicht] gelesener Fortschritt aus localStorage:', progress);
    if (Object.keys(progress).length === 0) {
      console.warn('[Übersicht] "' + CFG.progressKey + '" ist leer oder nicht vorhanden. ' +
        'Prüfe: 1) läuft diese Seite auf demselben Origin wie die Lektionsseiten? ' +
        '2) schreibt lesson-engine.js den Fortschritt unter diesem Key? ' +
        '3) wurde mindestens eine Lektion bis zum Ende durchgespielt?');
    }

    // Durchlauf 1: Karten mit geschätzter Höhe bauen …
    let layout = glBuildLayout(null);
    glRenderNodes(layout.positions, progress);

    // … dann echte Höhen messen und exakt nachpositionieren.
    const nodesEl = document.getElementById('glNodes');
    const heights = Array.from(nodesEl.children).map((n) => n.offsetHeight);
    layout = glBuildLayout(heights);
    Array.from(nodesEl.children).forEach((n, i) => {
      n.style.top = layout.positions[i].y + 'px';
    });
    nodesEl.style.height = layout.totalHeight + 'px';

    glRenderConnectors(layout.positions, layout.totalHeight, progress);
  }

  function glInit() {
    glBuildSkeleton();
    glRenderAll();
    window.addEventListener('resize', function () {
      cancelAnimationFrame(glRafId);
      glRafId = requestAnimationFrame(glRenderAll);   // SVG-Linien verrutschen nicht
    });
        // Nach Zurück-Navigieren (z.B. von einer Lektion) neu rendern,
    // damit der veröffentlichte Themen-Fortschritt aktuell bleibt.
    window.addEventListener('pageshow', function () { glRenderAll(); });
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
