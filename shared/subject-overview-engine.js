/* ==========================================================================
   GLAGGLE LEARN — FACH-ÜBERSICHTS-ENGINE (shared/subject-overview-engine.js)
   Baut eine Fach-Seite (z.B. "Mathe") NUR aus einer Config-Liste von Themen.
   Jedes Thema ist eine Kachel, die auf die jeweilige Themen-Übersicht
   verlinkt (die von overview-engine.js gebaut wird, z.B. einmaleins-ueben/).

   Die Fach-Seite selbst enthält kein HTML/CSS/JS mehr, nur die Einbindung
   dieser Datei + einen mount()-Aufruf (siehe mathe/index.html).

   Benutzung:
     GlaggleSubjectOverview.mount({
       title:   'Mathe',
       homeUrl: 'https://learn.glaggle.ch/index.html',
       intro:   'Wähle ein Thema...',            // optional
       gruppen: [                                 // ODER "themen" direkt (siehe unten)
         {
           label: 'Grundrechenarten',             // optional, weglassen = keine Überschrift
           themen: [
             {
               url:   'einmaleins-ueben/index.html',
               label: 'Einmaleins üben',
               sub:   '3 Lektionen',
               emoji: '✖️',
               // Dateinamen der Lektionen dieses Themas, für den
               // aggregierten Fortschrittsbalken (gleiche Namen wie in
               // der overview-engine.js-Config dieses Themas):
               lektionen: ['lektion2.html', 'lektion3.html', 'lektion4.html']
             },
           ]
         },
       ],
       // Alternative ohne Gruppen: einfach "themen: [...]" auf oberster Ebene
       // statt "gruppen" verwenden — gleiches Themen-Objekt-Format.

       siteName:      'Glaggle Learn',
       homeIcon:      '✕',
       searchPlaceholder: 'Thema suchen…',
       progressKey:   'glaggleLessonProgress',
       emptyText:     'Kein Thema gefunden.',
     });

   Fortschritt kommt aus localStorage (Key "glaggleLessonProgress"),
   geschrieben von lesson-engine.js beim Lektionsabschluss:
   { "<dateiname>.html": { done: true, pct: 87, lastCompleted: "..." } }
   Pro Thema wird der Durchschnitt über die angegebenen "lektionen"
   gebildet (nur abgeschlossene zählen mit ihrem pct, offene mit 0).
   ========================================================================== */
(function () {
  'use strict';

  const DEFAULTS = {
    title: 'Übersicht',
    siteName: 'Glaggle Learn',
    homeUrl: 'index.html',
    homeIcon: '✕',
    intro: '',
    searchPlaceholder: 'Thema suchen…',
    progressKey: 'glaggleLessonProgress',
    emptyText: 'Kein Thema gefunden.',
    gruppen: null,
    themen: null
  };

  let CFG = null;
  let ALL_GROUPS = [];   // normalisiert: [{ label, themen: [...] }]

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

  /* ---------- aggregierten Fortschritt für ein Thema berechnen ---------- */
  function glThemaProgress(thema, progress) {
    const files = thema.lektionen || [];
    if (files.length === 0) return { pct: 0, done: 0, total: 0 };
    let sum = 0;
    let doneCount = 0;
    files.forEach((file) => {
      const entry = progress[file];
      if (entry) {
        doneCount++;
        sum += (typeof entry.pct === 'number') ? entry.pct : 100;
      }
    });
    const pct = Math.round(sum / files.length);
    return { pct, done: doneCount, total: files.length };
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

  /* ---------- Grundgerüst (Header, Suche, Content) einmalig aufbauen ---------- */
  function glBuildSkeleton() {
    document.title = CFG.siteName ? CFG.title + ' | ' + CFG.siteName : CFG.title;

    const wrap = document.createElement('div');
    wrap.className = 'gl-subject-wrap';
    wrap.innerHTML =
      '<div class="gl-subject-header">' +
        '<a href="' + glEsc(CFG.homeUrl) + '" class="gl-subject-home" title="Zurück">' + glEsc(CFG.homeIcon) + '</a>' +
        '<h1 class="gl-subject-title"></h1>' +
        '<div class="gl-subject-search">' +
          '<span class="gl-subject-search-icon">🔎</span>' +
          '<input type="search" id="glSubjectSearch" placeholder="' + glEsc(CFG.searchPlaceholder) + '" autocomplete="off">' +
        '</div>' +
      '</div>' +
      '<div class="gl-subject-content">' +
        (CFG.intro ? '<p class="gl-subject-intro"></p>' : '') +
        '<div id="glSubjectGroups"></div>' +
        '<p class="gl-subject-empty" id="glSubjectEmpty" hidden></p>' +
      '</div>';
    document.body.appendChild(wrap);

    wrap.querySelector('.gl-subject-title').textContent = CFG.title;
    if (CFG.intro) wrap.querySelector('.gl-subject-intro').textContent = CFG.intro;
    document.getElementById('glSubjectEmpty').textContent = CFG.emptyText;
  }

  /* ---------- eine Themen-Karte rendern ---------- */
  function glRenderThemaCard(thema, progress) {
    const stat = glThemaProgress(thema, progress);
    const hasLektionen = stat.total > 0;
    const isDone = hasLektionen && stat.done === stat.total;
    const pctLabel = hasLektionen ? stat.pct + '%' : '–';

    const el = document.createElement('a');
    el.className = 'gl-thema ' + (isDone ? 'gl-thema-done' : (stat.done > 0 ? 'gl-thema-progress' : 'gl-thema-open'));
    el.href = thema.url;
    el.dataset.search = glNorm(thema.label + ' ' + (thema.sub || ''));

    el.innerHTML =
      '<div class="gl-thema-box">' +
        '<div class="gl-thema-icon">' + (isDone ? '✓' : glEsc(thema.emoji || '⭐')) + '</div>' +
        '<div class="gl-thema-body">' +
          '<div class="gl-thema-titel">' + glEsc(thema.label) + '</div>' +
          '<div class="gl-thema-sub">' + glEsc(thema.sub || '') + '</div>' +
          (hasLektionen ?
            '<div class="gl-node-bar-track"><div class="gl-node-bar-fill" style="width:' + stat.pct + '%"></div></div>' :
            '') +
        '</div>' +
        '<div class="gl-thema-pct ' + (hasLektionen ? '' : 'gl-empty') + '">' + pctLabel + '</div>' +
      '</div>';
    return el;
  }

  /* ---------- alle Gruppen + Themen rendern ---------- */
  function glRenderAll() {
    const progress = glGetProgress();
    const container = document.getElementById('glSubjectGroups');
    container.innerHTML = '';

    ALL_GROUPS.forEach((group) => {
      if (!group.themen.length) return;
      const groupEl = document.createElement('div');
      groupEl.className = 'gl-thema-group';
      if (group.label) {
        groupEl.dataset.groupLabel = glNorm(group.label);
        const h2 = document.createElement('h2');
        h2.className = 'gl-thema-group-label';
        h2.textContent = group.label;
        groupEl.appendChild(h2);
      }
      const listEl = document.createElement('div');
      listEl.className = 'gl-thema-list';
      group.themen.forEach((thema) => {
        listEl.appendChild(glRenderThemaCard(thema, progress));
      });
      groupEl.appendChild(listEl);
      container.appendChild(groupEl);
    });

    glApplyFilter(document.getElementById('glSubjectSearch').value);
  }

  /* ---------- Live-Filter beim Tippen ---------- */
  function glApplyFilter(query) {
    const q = glNorm(query.trim());
    const container = document.getElementById('glSubjectGroups');
    let anyVisible = false;

    container.querySelectorAll('.gl-thema-group').forEach((groupEl) => {
      let groupHasVisible = false;
      groupEl.querySelectorAll('.gl-thema').forEach((cardEl) => {
        const match = q === '' || cardEl.dataset.search.includes(q);
        cardEl.hidden = !match;
        if (match) groupHasVisible = true;
      });
      groupEl.hidden = !groupHasVisible;
      if (groupHasVisible) anyVisible = true;
    });

    document.getElementById('glSubjectEmpty').hidden = anyVisible;
  }

  function glInit() {
    ALL_GROUPS = glNormalizeGroups();
    glBuildSkeleton();
    glRenderAll();

    const searchEl = document.getElementById('glSubjectSearch');
    searchEl.addEventListener('input', () => glApplyFilter(searchEl.value));
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
