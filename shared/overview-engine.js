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
       chests:      true,     // Belohnungs-Truhen auf dem Pfad (an/aus)
       searchPlaceholder: 'Lektion suchen…',
       emptyText:   'Keine Lektion gefunden.',
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

   v3:
   - Navbar: nutzt dieselbe .gl-overview-header-Klasse wie die Subject-
     Overview → beide Navbars sind exakt gleich hoch (CSS: fixe Höhe).
   - Suchfeld: 100% identisch zur Subject-Overview (Lupe oben rechts,
     aufklappbares Feld, ✕-Clear, Escape, Blur). Filtert die Lektionen.
   - Belohnungssystem: pro Lektion eine Truhe auf dem Pfad. Entsperrt,
     sobald die Lektion geschafft ist; genau 1x insgesamt öffbar.
     Beim Öffnen: Popup mit kurzer Animation, danach 10–30 Crystals.
     Crystal-Stand + geöffnete Truhen liegen in localStorage
     ("glaggleCrystalData") — NUR diese Engine fasst den Key an.
   ========================================================================== */
(function () {
  'use strict';

  const FALLBACK_NODE_HEIGHT = 96;  // nur für den ersten Mess-Durchlauf
  const ROW_GAP = 72;               // Desktop: Luft für die S-Kurve
  const ROW_GAP_MOBILE = 56;
  const MOBILE_BREAK = 560;

  const CRYSTAL_KEY = 'glaggleCrystalData';
  const CHEST_MIN = 10;
  const CHEST_MAX = 30;

  const DEFAULTS = {
    title: 'Übersicht',
    siteName: 'Glaggle Learn',
    homeUrl: 'index.html',
    homeIcon: '✕',
    intro: '',
    progressKey: 'glaggleLessonProgress',
    footerAllDone: '🎉 Alle Lektionen geschafft — stark!',
    align: 'auto',
    lektionen: [],
    chests: true,
    searchPlaceholder: 'Lektion suchen…',
    emptyText: 'Keine Lektion gefunden.'
  };

  let CFG = null;
  let glQuery = '';
  let glRafId = 0;
  let glModalOpen = false;

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

  /* ---------- Fortschritt aus localStorage ---------- */
  function glGetProgress() {
    return glReadJson(CFG.progressKey);
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

  /* ---------- v3: Crystals / Truhen (NUR diese Engine!) ---------- */
  function glReadCrystals() {
    const d = glReadJson(CRYSTAL_KEY);
    return {
      total: (typeof d.total === 'number') ? d.total : 0,
      opened: (d.opened && typeof d.opened === 'object') ? d.opened : {}
    };
  }

  function glSaveCrystals(data) {
    try { localStorage.setItem(CRYSTAL_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function glChestId(lek) {
    return (CFG.topicId || glTopicIdFromPath()) + '::' + lek.file;
  }

  function glUpdatePill(pulse) {
    const count = document.getElementById('glCrystalCount');
    if (count) count.textContent = glReadCrystals().total;
    if (pulse) {
      const pill = document.getElementById('glCrystalPill');
      if (pill) {
        pill.classList.remove('gl-pulse');
        void pill.offsetWidth;
        pill.classList.add('gl-pulse');
      }
    }
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
        '<div class="gl-header-tools">' +
          '<div class="gl-crystal-pill" id="glCrystalPill" title="Deine Crystals">💎 <span id="glCrystalCount">0</span></div>' +
          '<div class="gl-subject-search" id="glSearchWrap">' +
            '<div class="gl-subject-search-field">' +
              '<input type="search" id="glSearch" placeholder="' + glEsc(CFG.searchPlaceholder) + '" autocomplete="off">' +
              '<button type="button" class="gl-subject-search-clear" id="glSearchClear" title="Suche leeren" hidden>✕</button>' +
            '</div>' +
            '<button type="button" class="gl-subject-search-btn" id="glSearchBtn" title="Lektion suchen">🔎</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="gl-overview-content">' +
        '<div class="gl-path">' +
          (CFG.intro ? '<p class="gl-path-intro"></p>' : '') +
          '<div class="gl-path-canvas">' +
            '<svg class="gl-path-svg" id="glPathSvg" preserveAspectRatio="none"></svg>' +
            '<div class="gl-nodes" id="glNodes"></div>' +
            '<div class="gl-chests" id="glChests"></div>' +
          '</div>' +
          '<p class="gl-subject-empty" id="glOverviewEmpty" hidden></p>' +
          '<p class="gl-path-footer" id="glPathFooter"></p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    wrap.querySelector('h1').textContent = CFG.title;
    if (CFG.intro) wrap.querySelector('.gl-path-intro').textContent = CFG.intro;
    document.getElementById('glOverviewEmpty').textContent = CFG.emptyText;
  }

  /* ---------- Layout: Positionen der Karten berechnen ----------
     heights = gemessene Kartenhöhen (null → Fallbackwerte) */
  function glBuildLayout(items, heights, containerWidth, mobile) {
    const nodeWidth = containerWidth * (mobile ? 0.92 : 0.46);
    const rowGap = mobile ? ROW_GAP_MOBILE : ROW_GAP;

    let y = 0;
    const positions = items.map((item, i) => {
      const align = glAlignFor(item.lek, item.fi, mobile);
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
    return { positions, totalHeight, rowGap };
  }

  /* ---------- SVG-Verbindungslinien (S-Kurven von Karte zu Karte) ---------- */
  function glRenderConnectors(positions, doneFlags, totalHeight) {
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
      const done = !!doneFlags[i];

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
  function glRenderNodes(items, positions, progress) {
    const nodesEl = document.getElementById('glNodes');
    nodesEl.innerHTML = '';

    // Prefix-Done über die VOLLE Liste, damit next/locked auch beim
    // Filtern exakt wie vorher stimmt.
    const prefixDone = [];
    let acc = true;
    CFG.lektionen.forEach((l, i) => {
      acc = acc && !!progress[l.file];
      prefixDone[i] = acc;
    });

    let nextAssigned = false;

    items.forEach((item, i) => {
      const lek = item.lek;
      const pos = positions[i];
      const entry = progress[lek.file];
      const isDone = !!entry;
      const prevDone = item.fi === 0 || prefixDone[item.fi - 1];
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

  /* ---------- v3: Truhen auf dem Pfad ----------
     Sitzt jeweils auf der Mitte der Verbindungslinie nach der Lektion;
     die letzte Truhe sitzt unterhalb der letzten Karte.
     Bereits geöffnete Truhen verschwinden komplett vom Pfad. */
  function glChestSize(mobile) { return mobile ? 46 : 56; }

  function glRenderChests(items, positions, progress, crystals, mobile, rowGap) {
    const box = document.getElementById('glChests');
    box.innerHTML = '';
    if (!CFG.chests) return;

    const size = glChestSize(mobile);

    items.forEach((item, i) => {
      const done = !!progress[item.lek.file];
      const id = glChestId(item.lek);
      const isOpened = crystals.opened[id] !== undefined;

      // NEU: geöffnete Truhe wird nicht mehr angezeigt → verschwindet
      if (done && isOpened) return;

      const state = done ? 'ready' : 'locked';

      const pos = positions[i];
      let cx, cy;
      if (i < positions.length - 1) {
        const to = positions[i + 1];
        const dir = to.x > pos.x ? 1 : (to.x < pos.x ? -1 : 0);
        const anchor = 0.5 + dir * 0.14;
        const fromX = pos.x + pos.w * anchor;
        const toX = to.x + to.w * anchor;
        const fromY = pos.y + pos.h;
        const toY = to.y;
        cx = (fromX + toX) / 2;
        cy = (fromY + toY) / 2;
      } else {
        cx = pos.x + pos.w / 2;
        cy = pos.y + pos.h + rowGap * 0.55;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gl-chest gl-chest-' + state;
      btn.style.left = (cx - size / 2) + 'px';
      btn.style.top = (cy - size / 2) + 'px';
      btn.style.width = size + 'px';
      btn.style.height = size + 'px';
      btn.title = state === 'ready' ? 'Truhe öffnen' : 'Erst die Lektion abschliessen';

      btn.innerHTML =
        '<span class="gl-chest-icon">📦</span>' +
        (state === 'locked' ? '<span class="gl-chest-lock">🔒</span>' : '') +
        (state === 'ready' ? '<span class="gl-chest-badge">Öffnen</span>' : '');

      if (state === 'ready') {
        btn.addEventListener('click', function () {
          glOpenChestModal(id, function (amount) {
            const data = glReadCrystals();
            data.total += amount;
            data.opened[id] = amount;      // 1x insgesamt → merke Öffnung
            glSaveCrystals(data);
            glUpdatePill(true);
            glRenderAll();                 // NEU rendern → Truhe ist jetzt weg
          });
        });
      } else {
        btn.disabled = true;
      }
      box.appendChild(btn);
    });
  }

  /* ---------- v3: Truhen-Popup mit Animation ---------- */
  function glSpawnSparks(container) {
    for (let k = 0; k < 8; k++) {
      const s = document.createElement('span');
      s.textContent = (k % 2 === 0) ? '💎' : '✨';
      const angle = (k / 8) * Math.PI * 2;
      const dist = 70 + Math.random() * 45;
      s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      s.style.animationDelay = (k * 0.04) + 's';
      container.appendChild(s);
    }
  }

  function glCountUp(el, target) {
    const start = performance.now();
    const dur = 700;
    function step(t) {
      const p = Math.min(1, (t - start) / dur);
      el.textContent = '💎 +' + Math.round(target * p);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function glOpenChestModal(chestId, onCollect) {
    if (glModalOpen) return;
    glModalOpen = true;

    const amount = CHEST_MIN + Math.floor(Math.random() * (CHEST_MAX - CHEST_MIN + 1));

    const ov = document.createElement('div');
    ov.className = 'gl-chest-overlay';
    ov.innerHTML =
      '<div class="gl-chest-modal">' +
        '<h2 class="gl-chest-modal-title">Truhe geöffnet!</h2>' +
        '<div class="gl-chest-modal-stage">' +
          '<div class="gl-chest-modal-chest">📦</div>' +
          '<div class="gl-chest-sparks"></div>' +
        '</div>' +
        '<div class="gl-chest-modal-amount">💎 +0</div>' +
        '<div class="gl-chest-modal-total"></div>' +
        '<button type="button" class="gl-chest-modal-btn">Einkassieren</button>' +
      '</div>';
    document.body.appendChild(ov);

    const modal = ov.querySelector('.gl-chest-modal');

    setTimeout(function () {
      modal.classList.add('gl-burst');
      glSpawnSparks(ov.querySelector('.gl-chest-sparks'));
      glCountUp(ov.querySelector('.gl-chest-modal-amount'), amount);
      ov.querySelector('.gl-chest-modal-total').textContent =
        'Gesamt: ' + (glReadCrystals().total + amount) + ' Crystals';
    }, 850);

    ov.querySelector('.gl-chest-modal-btn').addEventListener('click', function () {
      ov.remove();
      glModalOpen = false;
      onCollect(amount);
    });
  }

  /* ---------- alles rendern (2 Durchläufe: bauen → messen → exakt setzen) ---------- */
  function glRenderAll() {
    const progress = glGetProgress();
    glPublishTopicProgress(progress);
    const crystals = glReadCrystals();
    glUpdatePill(false);
    console.log('[Übersicht] gelesener Fortschritt aus localStorage:', progress);
    if (Object.keys(progress).length === 0) {
      console.warn('[Übersicht] "' + CFG.progressKey + '" ist leer oder nicht vorhanden. ' +
        'Prüfe: 1) läuft diese Seite auf demselben Origin wie die Lektionsseiten? ' +
        '2) schreibt lesson-engine.js den Fortschritt unter diesem Key? ' +
        '3) wurde mindestens eine Lektion bis zum Ende durchgespielt?');
    }

    // Suche: sichtbare Lektionen bestimmen (Zustände bleiben vom vollen Pfad)
    const q = glNorm(glQuery.trim());
    const items = CFG.lektionen
      .map(function (lek, fi) { return { lek: lek, fi: fi }; })
      .filter(function (item) {
        return q === '' || glNorm(item.lek.label + ' ' + (item.lek.sub || '')).includes(q);
      });
    document.getElementById('glOverviewEmpty').hidden = items.length > 0;

    const pathEl = document.querySelector('.gl-path');
    const containerWidth = pathEl.clientWidth;
    const mobile = containerWidth <= MOBILE_BREAK;

    // Durchlauf 1: Karten mit geschätzter Höhe bauen …
    let layout = glBuildLayout(items, null, containerWidth, mobile);
    glRenderNodes(items, layout.positions, progress);

    // … dann echte Höhen messen und exakt nachpositionieren.
    const nodesEl = document.getElementById('glNodes');
    const heights = Array.from(nodesEl.children).map((n) => n.offsetHeight);
    layout = glBuildLayout(items, heights, containerWidth, mobile);
    Array.from(nodesEl.children).forEach((n, i) => {
      n.style.top = layout.positions[i].y + 'px';
    });

    // Platz für die letzte Truhe unterhalb der letzten Karte reservieren
    // (nur solange sie noch sichtbar ist — geöffnete Truhen sind weg)
    let totalHeight = layout.totalHeight;
    if (CFG.chests && layout.positions.length) {
      const lastItem = items[items.length - 1];
      const lastDone = !!progress[lastItem.lek.file];
      const lastOpened = crystals.opened[glChestId(lastItem.lek)] !== undefined;
      const lastChestVisible = !(lastDone && lastOpened);
      if (lastChestVisible) {
        const last = layout.positions[layout.positions.length - 1];
        const size = glChestSize(mobile);
        const need = last.y + last.h + layout.rowGap * 0.55 + size / 2 + 8;
        totalHeight = Math.max(totalHeight, need);
      }
    }
    nodesEl.style.height = totalHeight + 'px';

    const doneFlags = items.map(function (item) { return !!progress[item.lek.file]; });
    glRenderConnectors(layout.positions, doneFlags, totalHeight);
    glRenderChests(items, layout.positions, progress, crystals, mobile, layout.rowGap);
  }

  /* ---------- v3: Lupe — 100% identisch zur Subject-Overview ---------- */
  function glInitSearch() {
    const wrap = document.getElementById('glSearchWrap');
    const btn = document.getElementById('glSearchBtn');
    const input = document.getElementById('glSearch');
    const clear = document.getElementById('glSearchClear');

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

    btn.addEventListener('click', function () {
      if (wrap.classList.contains('gl-open')) close(true);
      else open();
    });
    input.addEventListener('input', function () { setQuery(input.value); });
    clear.addEventListener('click', function () { input.value = ''; setQuery(''); input.focus(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(true); });
    input.addEventListener('blur', function () { if (input.value === '') close(false); });
  }

  function glInit() {
    glBuildSkeleton();
    glInitSearch();
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
