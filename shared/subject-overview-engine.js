/* ==========================================================================
   GLAGGLE LEARN — FACH-ÜBERSICHTS-ENGINE (shared/subject-overview-engine.js)
   Baut eine Fach-Seite (z.B. "Mathe") NUR aus einer Config-Liste von Themen.

   v2 — sieht jetzt aus wie die Lernpfad-Übersicht (overview-engine.js):
   - Themen liegen als Pfad-Karten im Zickzack (Desktop) bzw. in einer
     Spalte (Handy), verbunden mit S-Kurven — keine Listen-Kacheln mehr.
   - Gruppen-Labels werden als zentrierte Trennzeile über jedem Teilpfad
     dargestellt.
   - Suchfeld sitzt als zentrierte Pille unter dem Intro (mit Löschen-
     Button), filtert live und baut den Pfad neu auf.
   - Fortschritt = ECHTE Werte: abgeschlossene Lektionen / Gesamt-Lektionen
     des Themas (1 von 3 Lektionen geschafft → 33 %). Keine gemittelten
     Punkte-Prozente mehr. Die Dateinamen in "lektionen" sind dieselben wie
     in der overview-engine-Config des Themas.
   - Die sub-Zeile wird automatisch zu "x von y Lektionen", sobald
     "lektionen" angegeben ist (config.sub nur noch als Fallback).

   Benutzung (unverändert):
     GlaggleSubjectOverview.mount({
       title: 'Mathe',
       homeUrl: 'https://learn.glaggle.ch/index.html',
       intro: 'Wähle ein Thema, um zu üben.',
       gruppen: [
         {
           label: 'Grundrechenarten',
           themen: [
             {
               url:   'einmaleins-ueben/index.html',
               label: 'Einmaleins üben',
               emoji: '✖️',
               lektionen: ['lektion2.html', 'lektion3.html', 'lektion4.html']
             },
           ]
         },
       ],
       siteName: 'Glaggle Learn',
       homeIcon: '✕',
       searchPlaceholder: 'Thema suchen…',
       progressKey: 'glaggleLessonProgress',
       emptyText: 'Kein Thema gefunden.',
       footerAllDone: '🎉 Alle Themen geschafft — stark!',
     });
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
    searchPlaceholder: 'Thema suchen…',
    progressKey: 'glaggleLessonProgress',
    emptyText: 'Kein Thema gefunden.',
    footerAllDone: '🎉 Alle Themen geschafft — stark!',
    gruppen: null,
    themen: null
  };

  let CFG = null;
  let ALL_GROUPS = [];   // normalisiert: [{ label, themen: [...] }]
  let glQuery = '';
  let glRafId = 0;

  function glEsc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function glNorm(value) {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Umlaute/Akzente für die Suche vereinheitlichen
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

  /* ---------- ECHTER Fortschritt eines Themas ----------
     pct = abgeschlossene Lektionen / Gesamt-Lektionen.
     Beispiel: 1 von 3 Lektionen geschafft → 33 %. */
  function glThemaProgress(thema, progress) {
    const files = thema.lektionen || [];
    if (files.length === 0) return { pct: 0, done: 0, total: 0 };
    const done = files.filter((file) => !!progress[file]).length;
    const pct = Math.round((done / files.length) * 100);
    return { pct, done, total: files.length };
  }

  function glIsThemaDone(thema, progress) {
    const s = glThemaProgress(thema, progress);
    return s.total > 0 && s.done === s.total;
  }

  /* ---------- Config normalisieren: immer Gruppen-Form intern ---------- */
  function glNormalizeGroups() {
    if (Array.isArray(CFG.gruppen) && CFG.gruppen.length) {
      return CFG.gruppen.map((g) => ({
        label: g.label || '',
        themen: g.themen || []
      }));
    }
    if (Array.isArray(CFG.themen)) {
      return [{ label: '', themen: CFG.themen }];
    }
    return [];
  }

  function glAllThemen() {
    return ALL_GROUPS.reduce((acc, g) => acc.concat(g.themen), []);
  }

  /* ---------- Grundgerüst: Header + Content wie overview-engine ---------- */
  function glBuildSkeleton() {
    document.title = CFG.siteName ? CFG.title + ' | ' + CFG.siteName : CFG.title;

    const wrap = document.createElement('div');
    wrap.className = 'gl-overview-wrap';   // gleiche Optik wie overview-engine
    wrap.innerHTML =
      '<div class="gl-overview-header">' +
        '<a href="' + glEsc(CFG.homeUrl) + '" title="Zurück">' + glEsc(CFG.homeIcon) + '</a>' +
        '<h1></h1>' +
      '</div>' +
      '<div class="gl-overview-content">' +
        '<div class="gl-subject-main">' +
          (CFG.intro ? '<p class="gl-path-intro"></p>' : '') +
          '<div class="gl-subject-searchwrap">' +
            '<span class="gl-subject-search-icon">🔎</span>' +
            '<input type="search" id="glSubjectSearch" placeholder="' + glEsc(CFG.searchPlaceholder) + '" autocomplete="off">' +
            '<button type="button" class="gl-subject-search-clear" id="glSubjectSearchClear" title="Suche leeren" hidden>✕</button>' +
          '</div>' +
          '<div id="glSubjectGroups"></div>' +
          '<p class="gl-subject-empty" id="glSubjectEmpty" hidden></p>' +
          '<p class="gl-subject-footer" id="glSubjectFooter"></p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    wrap.querySelector('h1').textContent = CFG.title;
    if (CFG.intro) wrap.querySelector('.gl-path-intro').textContent = CFG.intro;
    document.getElementById('glSubjectEmpty').textContent = CFG.emptyText;
  }

  /* ---------- Layout: Positionen der Karten (Zickzack wie overview) ---------- */
  function glBuildLayout(count, heights, containerWidth) {
    const mobile = containerWidth <= MOBILE_BREAK;
    const nodeWidth = containerWidth * (mobile ? 0.92 : 0.46);
    const rowGap = mobile ? ROW_GAP_MOBILE : ROW_GAP;

    let y = 0;
    const positions = [];
    for (let i = 0; i < count; i++) {
      // Handy: eine Spalte. Desktop: Zickzack; Einzelkarte zentriert.
      const align = mobile ? 'center' : (count === 1 ? 'center' : (i % 2 === 0 ? 'left' : 'right'));
      let x = 0;
      if (align === 'right') x = containerWidth - nodeWidth;
      else if (align === 'center') x = (containerWidth - nodeWidth) / 2;
      const h = (heights && heights[i]) || FALLBACK_NODE_HEIGHT;
      positions.push({ x, y, w: nodeWidth, h });
      y += h + rowGap;
    }

    const totalHeight = positions.length
      ? positions[positions.length - 1].y + positions[positions.length - 1].h
      : 0;
    return { positions, totalHeight };
  }

  /* ---------- SVG-Verbindungslinien (S-Kurven von Karte zu Karte) ---------- */
  function glRenderConnectors(svg, positions, themen, progress, width, totalHeight) {
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
      const done = glIsThemaDone(themen[i], progress); // grün erst, wenn Thema komplett geschafft

      pathsHtml +=
        '<path class="gl-seg ' + (done ? 'gl-seg-done' : 'gl-seg-open') + '" ' +
        'd="M ' + fromX + ' ' + fromY +
        ' C ' + fromX + ' ' + (fromY + bend) + ', ' +
              toX + ' ' + (toY - bend) + ', ' +
              toX + ' ' + toY + '" />';
    }
    svg.innerHTML = pathsHtml;
  }

  /* ---------- eine Themen-Karte im Node-Stil der overview rendern ---------- */
  function glRenderThemaNode(thema, progress) {
    const stat = glThemaProgress(thema, progress);
    const hasLektionen = stat.total > 0;
    const isDone = glIsThemaDone(thema, progress);
    const pctLabel = (hasLektionen && stat.done > 0) ? stat.pct + '%' : '–';
    const sub = hasLektionen
      ? stat.done + ' von ' + stat.total + ' Lektionen'   // echter Wert statt config-Text
      : (thema.sub || '');

    const el = document.createElement('a');
    el.className = 'gl-node ' + (isDone ? 'gl-done' : 'gl-next');
    el.href = thema.url;

    el.innerHTML =
      '<div class="gl-node-box">' +
        '<div class="gl-node-icon">' + (isDone ? '✓' : glEsc(thema.emoji || '⭐')) + '</div>' +
        '<div class="gl-node-body">' +
          '<div class="gl-node-title">' + glEsc(thema.label) + '</div>' +
          '<div class="gl-node-sub">' + glEsc(sub) + '</div>' +
          '<div class="gl-node-bar-track">' +
            '<div class="gl-node-bar-fill" style="width:' + stat.pct + '%"></div>' +
          '</div>' +
        '</div>' +
        '<div class="gl-node-pct ' + (hasLektionen && stat.done > 0 ? '' : 'gl-empty') + '">' + pctLabel + '</div>' +
      '</div>';
    return el;
  }

  /* ---------- einen Teilpfad (Gruppe) bauen, messen, Linien zeichnen ---------- */
  function glLayoutPath(pathEl, themen, progress) {
    const nodesEl = pathEl.querySelector('.gl-nodes');
    const svg = pathEl.querySelector('.gl-path-svg');
    const width = pathEl.clientWidth;

    // Durchlauf 1: mit geschätzter Höhe setzen …
    let layout = glBuildLayout(themen.length, null, width);
    Array.from(nodesEl.children).forEach((n, i) => {
      n.style.left = layout.positions[i].x + 'px';
      n.style.top = layout.positions[i].y + 'px';
      n.style.width = layout.positions[i].w + 'px';
    });

    // … Durchlauf 2: echte Höhen messen und exakt nachpositionieren.
    const heights = Array.from(nodesEl.children).map((n) => n.offsetHeight);
    layout = glBuildLayout(themen.length, heights, width);
    Array.from(nodesEl.children).forEach((n, i) => {
      n.style.top = layout.positions[i].y + 'px';
    });
    nodesEl.style.height = layout.totalHeight + 'px';

    glRenderConnectors(svg, layout.positions, themen, progress, width, layout.totalHeight);
  }

  /* ---------- alle Gruppen rendern (mit Live-Filter) ---------- */
  function glRenderGroups(progress) {
    const q = glNorm(glQuery.trim());
    const container = document.getElementById('glSubjectGroups');
    container.innerHTML = '';
    let anyVisible = false;

    ALL_GROUPS.forEach((group) => {
      const themen = group.themen.filter((t) =>
        q === '' || glNorm(t.label + ' ' + (t.sub || '')).includes(q));
      if (!themen.length) return;
      anyVisible = true;

      const section = document.createElement('section');
      section.className = 'gl-subject-group';
      if (group.label) {
        const h2 = document.createElement('h2');
        h2.className = 'gl-subject-group-label';
        h2.textContent = group.label;
        section.appendChild(h2);
      }

      const pathEl = document.createElement('div');
      pathEl.className = 'gl-path';
      pathEl.innerHTML =
        '<div class="gl-path-canvas">' +
          '<svg class="gl-path-svg" preserveAspectRatio="none"></svg>' +
          '<div class="gl-nodes"></div>' +
        '</div>';
      section.appendChild(pathEl);
      container.appendChild(section);

      const nodesEl = pathEl.querySelector('.gl-nodes');
      themen.forEach((t) => nodesEl.appendChild(glRenderThemaNode(t, progress)));
      glLayoutPath(pathEl, themen, progress);
    });

    document.getElementById('glSubjectEmpty').hidden = anyVisible;
  }

  /* ---------- Footer: x von y Themen abgeschlossen ---------- */
  function glRenderFooter(progress) {
    const all = glAllThemen();
    const el = document.getElementById('glSubjectFooter');
    if (!all.length) { el.hidden = true; return; }
    const doneCount = all.filter((t) => glIsThemaDone(t, progress)).length;
    el.hidden = false;
    el.textContent = (doneCount === all.length)
      ? CFG.footerAllDone
      : doneCount + ' von ' + all.length + ' Themen abgeschlossen';
  }

  function glRenderAll() {
    const progress = glGetProgress();
    glRenderGroups(progress);
    glRenderFooter(progress);
  }

  function glInit() {
    ALL_GROUPS = glNormalizeGroups();
    glBuildSkeleton();
    glRenderAll();

    const searchEl = document.getElementById('glSubjectSearch');
    const clearEl = document.getElementById('glSubjectSearchClear');

    searchEl.addEventListener('input', () => {
      glQuery = searchEl.value;
      clearEl.hidden = glQuery === '';
      glRenderGroups(glGetProgress());   // Pfad wird mit Treffern neu aufgebaut
    });

    clearEl.addEventListener('click', () => {
      searchEl.value = '';
      glQuery = '';
      clearEl.hidden = true;
      glRenderGroups(glGetProgress());
      searchEl.focus();
    });

    window.addEventListener('resize', () => {
      cancelAnimationFrame(glRafId);
      glRafId = requestAnimationFrame(() => glRenderGroups(glGetProgress()));
    });
  }

  window.GlaggleSubjectOverview = {
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
