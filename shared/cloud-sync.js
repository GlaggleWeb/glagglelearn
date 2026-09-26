/* ==========================================================================
   GLAGGLE LEARN — CLOUD SYNC (shared/cloud-sync.js)
   Spiegelt localStorage <-> Appwrite (Glaggle Accounts), NUR wenn eingeloggt.
   Ohne Login passiert nichts: alles läuft weiter rein über localStorage.
   ========================================================================== */
(function () {
  'use strict';

  /* ===== HIER ANPASSEN ===== */
  const ENDPOINT      = 'https://fra.cloud.appwrite.io/v1';
  const PROJECT_ID    = '69fb638a002b7d03d829';      // Projekt "Glaggle Accounts"
  const DATABASE_ID   = '69fb65330007c1a1af0a';     // DB "Glaggle Accounts"
  const COLLECTION_ID = '6aad671e00041f08f0b3';   // Tabelle mit den Spalten aus dem Screenshot
  /* ========================= */

  const LP_KEY       = 'glaggleLearnPoints';
  const CRYSTAL_KEY  = 'glaggleCrystalData';
  const LESSON_KEY   = 'glaggleLessonProgress';
  const TOPIC_KEY    = 'glaggleTopicProgress';
  const SYNC_KEYS    = [LP_KEY, CRYSTAL_KEY, LESSON_KEY, TOPIC_KEY];

  let client, account, databases;
  let userId = null;
  let docExists = false;
  let pushTimer = 0;
  let syncing = false;

  function readJson(key) {
    try {
      const o = JSON.parse(localStorage.getItem(key) || '{}');
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }
  function writeJson(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }
  function readInt(key) {
    const n = parseInt(localStorage.getItem(key), 10);
    return Number.isFinite(n) ? n : 0;
  }
  function parseJson(str) {
    try {
      const o = JSON.parse(str || '{}');
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }

  /* ---------- Merge-Regeln ---------- */

  // Lektionsfortschritt: pro Datei den besseren/neueren Eintrag behalten
  function mergeLessons(a, b) {
    const out = Object.assign({}, a);
    Object.keys(b).forEach((file) => {
      const x = out[file], y = b[file];
      if (!x) { out[file] = y; return; }
      const better = ((y.pct || 0) > (x.pct || 0)) ? y : x;
      const latest = (new Date(y.lastCompleted || 0) > new Date(x.lastCompleted || 0))
        ? y.lastCompleted : x.lastCompleted;
      out[file] = Object.assign({}, better, { done: true, lastCompleted: latest });
    });
    return out;
  }

  // Themen-Fortschritt: pro Thema den Eintrag mit mehr "done" bzw. neuerem Datum
  function mergeTopics(a, b) {
    const out = Object.assign({}, a);
    Object.keys(b).forEach((id) => {
      const x = out[id], y = b[id];
      if (!x) { out[id] = y; return; }
      if ((y.done || 0) > (x.done || 0)) out[id] = y;
      else if ((y.done || 0) === (x.done || 0) &&
               new Date(y.updated || 0) > new Date(x.updated || 0)) out[id] = y;
    });
    return out;
  }
// Crystals: geöffnete Truhen vereinigen (Verdienst), "spent" wird als
// Maximum übernommen (monoton steigend, nie verloren). Total = verdiente
// Summe minus ausgegebene Menge, nie negativ.
function mergeCrystals(a, b) {
  const opened = Object.assign({}, a.opened || {}, b.opened || {});
  const earned = Object.values(opened).reduce((s, v) => s + (Number(v) || 0), 0);
  const spent  = Math.max(Number(a.spent) || 0, Number(b.spent) || 0);
  const total  = Math.max(earned - spent, 0);
  return { total, opened, spent };
}

  /* ---------- Appwrite ---------- */
  function initClient() {
    if (!window.Appwrite) return false;
    client = new Appwrite.Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
    account = new Appwrite.Account(client);
    databases = new Appwrite.Databases(client);
    return true;
  }

  async function fetchCloud() {
    try {
      const doc = await databases.getDocument(DATABASE_ID, COLLECTION_ID, userId);
      docExists = true;
      return doc;
    } catch (e) {
      if (e && e.code === 404) { docExists = false; return null; }
      throw e;
    }
  }

  function localPayload() {
    return {
      glaggleLearnPoints:    readInt(LP_KEY),
      glaggleCrystalData:    localStorage.getItem(CRYSTAL_KEY) || '{}',
      glaggleLessonProgress: localStorage.getItem(LESSON_KEY)  || '{}',
      glaggleTopicProgress:  localStorage.getItem(TOPIC_KEY)   || '{}'
    };
  }

async function pushNow() {
  if (!userId || syncing) return;
  const data = localPayload();
  try {
    if (docExists) {
      await databases.updateDocument(DATABASE_ID, COLLECTION_ID, userId, data);
    } else {
      await databases.createDocument(DATABASE_ID, COLLECTION_ID, userId, data, [
        Appwrite.Permission.read(Appwrite.Role.user(userId)),
        Appwrite.Permission.update(Appwrite.Role.user(userId))
      ]);
      docExists = true;
    }
  } catch (e) {
    console.warn('[CloudSync] Upload fehlgeschlagen:', e);
  }
}

  function schedulePush() {
    if (!userId) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 1500);
  }

  async function pullAndMerge() {
    syncing = true;
    try {
      const cloud = await fetchCloud();
      if (cloud) {
        localStorage.setItem(LP_KEY, String(
          Math.max(readInt(LP_KEY), Number(cloud.glaggleLearnPoints) || 0)));
        writeJson(CRYSTAL_KEY, mergeCrystals(
          readJson(CRYSTAL_KEY), parseJson(cloud.glaggleCrystalData)));
        writeJson(LESSON_KEY, mergeLessons(
          readJson(LESSON_KEY), parseJson(cloud.glaggleLessonProgress)));
        writeJson(TOPIC_KEY, mergeTopics(
          readJson(TOPIC_KEY), parseJson(cloud.glaggleTopicProgress)));
      }
    } finally {
      syncing = false;
    }
    await pushNow();                       // zusammengeführten Stand hochladen
    window.dispatchEvent(new Event('glaggle-synced'));
  }

  /* ---------- localStorage überwachen ----------
     Die Engines rufen localStorage.setItem direkt auf. Wir hängen uns
     darüber, damit du an den Engines fast nichts ändern musst. */
  function patchStorage() {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      orig.apply(this, arguments);
      if (this === window.localStorage && SYNC_KEYS.indexOf(key) !== -1) schedulePush();
    };
  }

  /* ---------- Öffentliche API ---------- */
  window.GlaggleCloud = {
    get loggedIn() { return !!userId; },

    async init() {
      patchStorage();
      if (!initClient()) return;
      try {
        const user = await account.get();
        userId = user.$id;
        await pullAndMerge();
      } catch (e) {
        userId = null;                     // nicht eingeloggt → nur localStorage
      }
    },

    async logout() {
      try { await account.deleteSession('current'); } catch (e) {}
      userId = null;
    },

    // vom Login-Formular aufgerufen
    async sendMagicLink(email, redirectUrl) {
      return account.createMagicURLToken(Appwrite.ID.unique(), email, redirectUrl);
    },
    async confirmMagicLink(uid, secret) {
      await account.createSession(uid, secret);
      const user = await account.get();
      userId = user.$id;
      await pullAndMerge();
    }
  // NEU: erzwingt sofortigen Push, umgeht den Debounce
  async flush() {
    clearTimeout(pushTimer);
    await pushNow();
  }
};
