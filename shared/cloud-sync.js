/* ==========================================================================
   GLAGGLE LEARN — CLOUD SYNC (shared/cloud-sync.js)
   Spiegelt localStorage <-> Appwrite (Glaggle Accounts), NUR wenn eingeloggt.
   Ohne Login passiert nichts: alles läuft weiter rein über localStorage.
   ========================================================================== */
(function () {
  'use strict';

  /* ===== HIER ANPASSEN ===== */
  const ENDPOINT      = 'https://fra.cloud.appwrite.io/v1';
  const PROJECT_ID    = '69fb638a002b7d03d829';
  const DATABASE_ID   = '69fb65330007c1a1af0a';
  const COLLECTION_ID = '6aad671e00041f08f0b3';
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

  function mergeCrystals(a, b) {
    const opened = Object.assign({}, a.opened || {}, b.opened || {});
    const sum = Object.values(opened).reduce((s, v) => s + (Number(v) || 0), 0);
    const total = Math.max(sum, Number(a.total) || 0, Number(b.total) || 0);
    return { total, opened };
  }

  /* ---------- Appwrite ---------- */
  function initClient() {
    if (!window.Appwrite) {
      console.error('[CloudSync] Appwrite library not loaded');
      return false;
    }
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
      syncing = true;
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
    } finally {
      syncing = false;
    }
  }

  function schedulePush(changedKey) {
    if (!userId) return;
    clearTimeout(pushTimer);
    
    const immediateKeys = ['glaggleCrystalData', 'glaggleLearnPoints'];
    
    if (immediateKeys.includes(changedKey)) {
      // Kritische Updates: Sofort pushen
      pushNow().catch(err => console.warn('[CloudSync]', err));
    } else {
      // Normales Debouncing
      pushTimer = setTimeout(pushNow, 1500);
    }
  }

  async function pullAndMerge() {
    if (syncing) return;
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
    await pushNow();
    window.dispatchEvent(new Event('glaggle-synced'));
  }

  /* ---------- localStorage überwachen ---------- */
  function patchStorage() {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      orig.apply(this, arguments);
      if (this === window.localStorage && SYNC_KEYS.indexOf(key) !== -1) {
        schedulePush(key);
      }
    };
  }

  /* ========== ÖFFENTLICHE API ========== */
  window.GlaggleCloud = {
    get loggedIn() { return !!userId; },

    _pushNow() { return pushNow(); },

    _pullAndMerge() { return pullAndMerge(); },

    async init() {
      if (!initClient()) return;
      patchStorage();
      try {
        const user = await account.get();
        userId = user.$id;
        await pullAndMerge();
      } catch (e) {
        userId = null;
      }
    },

    async logout() {
      try { await account.deleteSession('current'); } catch (e) {}
      userId = null;
      docExists = false;
    },

    async sendMagicLink(email, redirectUrl) {
      return account.createMagicURLToken(Appwrite.ID.unique(), email, redirectUrl);
    },

    async confirmMagicLink(uid, secret) {
      await account.createSession(uid, secret);
      const user = await account.get();
      userId = user.$id;
      await pullAndMerge();
    }
  };
})();
