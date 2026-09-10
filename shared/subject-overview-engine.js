/* ==========================================================================
   GLAGGLE LEARN — FACH-ÜBERSICHTS-ENGINE (shared/subject-overview-engine.js)
   v2.2 — Fach-Seite im Look der overview-engine (Zickzack-Pfad mit
   S-Kurven auf dem Computer, Spalte auf dem Handy).

   Fortschritt = ECHTE, themenscharfe Werte:
   - Primärquelle: "glaggleTopicProgress", veröffentlicht von der
     overview-engine des Themas (Key = Ordnername, z.B. "einmaleins-ueben").
     1 von 3 Lektionen geschafft → 33 %.
   - Fallback (nur falls die Themen-Übersicht noch nicht aktualisiert ist):
     optionales "lektionen"-Array wie früher. Themen OHNE Lektionen bekommen
     keinerlei Fortschritt mehr angezeigt ("–", leerer Balken).
   - Suche: Lupe oben rechts im Header, Klick klappt das Suchfeld auf.
   ========================================================================== */
(function () {
  'use strict';

  const FALLBACK_NODE_HEIGHT = 96;
  const ROW_GAP = 72;
  const ROW_GAP_MOBILE = 56;
  const MOBILE_BREAK = 560;
  const TOPIC_PROGRESS_KEY = 'glaggleTopicProgress';

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
  let ALL_GROUPS = [];
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
      .replace(/[\u0300-\u036f]/g, '');
  }

  function glReadJson(key) {
    try {
      const obj = JSON.parse(localStorage.getItem(key) || '{}');
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
      console.warn('Konnte "' + key + '" nicht lesen:', e);
      return {};
    }
  }

  /* ---------- Kennung eines Themas = Ordnername der URL ----------
     'einmaleins-ueben/index.html' → 'einmaleins-ueben'
     (identisch zur Kennung, die die overview-engine veröffentlicht) */
  function glThemaId(thema) {
    if (thema.topicId) return thema.topicId;
    const parts = String(thema.url || '').split('#')[0].split('?')[0].split('/').filter(Boolean);
    if (parts.length && parts[parts.length - 1].toLowerCase().endsWith('.html')) parts.pop();
    return parts.length ? decodeURIComponent(parts[parts.length - 1]) : glNorm(thema.label);
  }

  /* ---------- ECHTER Fortschritt: erst Themen-Sammelwert, dann Fallback ---------- */
  function glThemaProgress(thema, progress, topicMap) {
    const agg = topicMap[glThemaId(thema)];
    if (agg && typeof agg.total === 'number' && agg.total > 0) {
      const done = Math.min(Math.max(agg.done | 0, 0), agg.total);
      return { pct: Math.round((done / agg.total) * 100), done, total: agg.total };
    }
    const files = thema.lektionen || [];           // Legacy-Fallback, optional
    if (files.length === 0) return { pct: 0, done: 0, total: 0 };
    const done = files.filter((f) => !!progress[f]).length;
    return { pct: Math.round((done / files.length) * 100), done, total: files.length };
  }

  function glIsThemaDone(stat) {
    return stat.total > 0 && stat.done === stat.total;
  }

  function glNormalizeGroups() {
    if (Array.isArray(CFG.gruppen) && CFG.gruppen.length) {
      return CFG.gruppen.map((g) => ({ label: g.label || '', themen: g.themen || [] }));
    }
    if (Array.isArray(CFG.themen)) return [{ label: '', themen: CFG.themen }];
    return [];
  }

  function glAllThemen() {
    return ALL_GROUPS.reduce((acc, g) => acc.concat(g.themen), []);
  }

  /* ---------- Grundgerüst: Header wie overview + Lupe rechts ---------- */
  function glBuildSkeleton() {
    document.title = CFG.siteName ? CFG.title + ' | ' + CFG.siteName : CFG.title;

    const wrap = document.createElement('div');
    wrap.className = 'gl-overview-wrap';
    wrap.innerHTML =
      '<div class="gl-overview-header">' +
        '<a href="' + glEsc(CFG.homeUrl) + '" title="Zurück">' + glEsc(CFG.homeIcon) + '</a>' +
        '<h1></h1>' +
        '<div class="gl-subject-search" id="glSubjectSearchWrap">' +
          '<div class="gl-subject-search-field">' +
            '<input type="search" id="glSubjectSearch" placeholder="' + glEsc(CFG.searchPlaceholder) + '" autocomplete="off">' +
            '<button type="button" class="gl-subject-search-clear" id="glSubjectSearchClear" title="Suche leeren" hidden>✕</button>' +
          '</div>' +
          '<button type="button" class="gl-subject-search-btn" id="glSubjectSearchBtn" title="Thema suchen">🔎</button>' +
        '</div>' +
      '</div>' +
      '<div class="gl-overview-content">' +
        '<div class="gl-subject-main" id="glSubjectMain">' +
          (CFG.intro ? '<p class="gl-path-intro"></p>' : '') +
          '<div id="glSubjectGroups"></div>' +
          '<p class="gl-subject-empty" id="glSubjectEmpty" hidden></p>' +
          '<p class="gl-subject-footer" id="glSubjectFooter"></p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    // Sicherheits-Inline-Styles, damit die Spalte auch ohne CSS stimmt
    const main = document.getElementById('glSubjectMain');
    main.style.width = '100%';
    main.style.maxWidth = '640px';

    wrap.querySelector('h1').textContent = CFG.title;
    if (CFG.intro) wrap.querySelector('.gl-path-intro').textContent = CFG.intro;
    document.getElementById('glSubjectEmpty').textContent = CFG.emptyText;
  }

  /* ---------- Layout: Zickzack wie overview-engine ---------- */
  function glBuildLayout(count, heights, containerWidth) {
    const mobile = containerWidth <= MOBILE_BREAK;
    const nodeWidth = containerWidth * (mobile ? 0.92 : 0.46);
    const rowGap = mobile ? ROW_GAP_MOBILE : ROW_GAP;

    let y = 0;
    const positions = [];
    for (let i = 0; i < count; i++) {
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

  /* ---------- S-Kurven von Karte zu Karte ---------- */
  function glRenderConnectors(svg, positions, themen, stats, width, totalHeight) {
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + Math.max(totalHeight, 1));
    svg.style.height = totalHeight + 'px';

    let html = '';
    for (let i = 0; i < positions.length - 1; i++) {
      const from = positions[i];
      const to = positions[i + 1];
      const dir = to.x > from.x ? 1 : (to.x < from.x ? -1 : 0);
      const anchor = 0.5 + dir * 0.14;
      const fromX = from.x + from.w * anchor;
      const fromY = from.y + from.h;
      const toX = to.x + to.w * anchor;
      const toY = to.y;
      const bend = (toY - fromY) * 0.45;
      const done = glIsThemaDone(stats[i]);

      html +=
        '<path class="gl-seg ' + (done ? 'gl-seg-done' : 'gl-seg-open') + '" ' +
        'd="M ' + fromX + ' ' + fromY +
        ' C ' + fromX + ' ' + (fromY + bend) + ', ' +
              toX + ' ' + (toY - bend) + ', ' +
              toX + ' ' + toY + '" />';
    }
    svg.innerHTML = html;
  }

  /* ---------- Themen-Karte im Node-Stil der overview ---------- */
  function glRenderThemaNode(thema, stat) {
    const hasLektionen = stat.total > 0;
    const isDone = glIsThemaDone(stat);
    const pctLabel = (hasLektionen && stat.done > 0) ? stat.pct + '%' : '–';
    const sub = hasLektionen
      ? stat.done + ' von ' + stat.total + ' Lektionen'
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

  /* ---------- Teilpfad bauen → messen → Linien zeichnen ---------- */
  function glLayoutPath(pathEl, themen, stats, progressUnused) {
    const nodesEl = pathEl.querySelector('.gl-nodes');
    const svg = pathEl.querySelector('.gl-path-svg');
    const width = pathEl.clientWidth;

    let layout = glBuildLayout(themen.length, null, width);
    Array.from(nodesEl.children).forEach((n, i) => {
      n.style.left = layout.positions[i].x + 'px';
      n.style.top = layout.positions[i].y + 'px';
      n.style.width = layout.positions[i].w + 'px';
    });

    const heights = Array.from(nodesEl.children).map((n) => n.offsetHeight);
    layout = glBuildLayout(themen.length, heights, width);
    Array.from(nodesEl.children).forEach((n, i) => {
      n.style.top = layout.positions[i].y + 'px';
    });
    nodesEl.style.height = layout.totalHeight + 'px';

    glRenderConnectors(svg, layout.positions, themen, stats, width, layout.totalHeight);
  }

  /* ---------- Gruppen rendern (mit Live-Filter) ---------- */
  function glRenderGroups(progress, topicMap) {
    const q = glNorm(glQuery.trim());
    const container = document.getElementById('glSubjectGroups');
    container.innerHTML = '';
    let anyVisible = false;

    ALL_GROUPS.forEach((group) => {
      const themen = group.themen.filter((t) =>
        q === '' || glNorm(t.label + ' ' + (t.sub || '')).includes(q));
      if (!themen.length) return;
      anyVisible = true;

      const stats = themen.map((t) => glThemaProgress(t, progress, topicMap));

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
      themen.forEach((t, i) => nodesEl.appendChild(glRenderThemaNode(t, stats[i])));
      glLayoutPath(pathEl, themen, stats);
    });

    document.getElementById('glSubjectEmpty').hidden = anyVisible;
  }

  /* ---------- Footer: x von y Themen abgeschlossen ---------- */
  function glRenderFooter(progress, topicMap) {
    const all = glAllThemen();
    const el = document.getElementById('glSubjectFooter');
    if (!all.length) { el.hidden = true; return; }
    const doneCount = all.filter((t) => glIsThemaDone(glThemaProgress(t, progress, topicMap))).length;
    el.hidden = false;
    el.textContent = (doneCount === all.length)
      ? CFG.footerAllDone
      : doneCount + ' von ' + all.length + ' Themen abgeschlossen';
  }

  function glRenderAll() {
    const progress = glReadJson(CFG.progressKey);
    const topicMap = glReadJson(TOPIC_PROGRESS_KEY);
    glRenderGroups(progress, topicMap);
    glRenderFooter(progress, topicMap);
  }

  /* ---------- Lupe: Klick → Suchfeld klappt auf ---------- */
  function glInitSearch() {
    const wrap = document.getElementById('glSubjectSearchWrap');
    const btn = document.getElementById('glSubjectSearchBtn');
    const input = document.getElementById('glSubjectSearch');
    const clear = document.getElementById('glSubjectSearchClear');

    function setQuery(value) {
      glQuery = value;
      clear.hidden = value === '';
      glRenderAll();
    }
    function open() { wrap.classList.add('gl-open'); input.focus(); }
    function close(reset) {
      if (reset) { input.value = ''; setQuery(''); }
      wrap.classList.remove('gl-open');
    }

    btn.addEventListener('click', () => {
      if (wrap.classList.contains('gl-open')) close(true);
      else open();
    });
    input.addEventListener('input', () => setQuery(input.value));
    clear.addEventListener('click', () => { input.value = ''; setQuery(''); input.focus(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(true); });
    input.addEventListener('blur', () => { if (input.value === '') close(false); });
  }

  function glInit() {
    ALL_GROUPS = glNormalizeGroups();
    glBuildSkeleton();
    glInitSearch();
    glRenderAll();

    window.addEventListener('resize', () => {
      cancelAnimationFrame(glRafId);
      glRafId = requestAnimationFrame(glRenderAll);
    });
    // frisch lesen, wenn man z.B. von einer Lektion zurückkommt
    window.addEventListener('pageshow', glRenderAll);
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
    render() { if (CFG) glRenderAll(); }
  };
})();
