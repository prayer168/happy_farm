/* global firebase */
'use strict';

(function () {
  const ADMIN_EMAIL = 'prayer168@gmail.com';
  const CROP_KEYS = ['radish', 'tomato', 'corn', 'strawberry', 'watermelon', 'pumpkin', 'bellpepper', 'eggplant', 'blueberry', 'peach', 'mango'];
  const WEATHER_KEYS = ['sunny', 'cloudy', 'rainy', 'drought', 'storm'];
  const TOOL_KEYS = ['plant', 'water', 'harvest', 'fertilize', 'remove'];
  const STATUSES = ['empty', 'locked', 'planted', 'growing', 'watered', 'wilting', 'ready', 'dead'];
  const DEATHS = ['thirst', 'overwater', 'overfertilize'];
  const TEST_KEY = 'happyFarmTestCloud';
  const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const params = new URLSearchParams(location.search);
  const localHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const testMode = localHost && params.get('testCloud') === '1';
  const emulatorMode = localHost && params.get('emulator') === '1';
  const firebaseConfig = window.HAPPY_FARM_FIREBASE || {};
  const configReady = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain && firebaseConfig.appId);

  let mode = 'unconfigured';
  let auth = null;
  let db = null;
  let current = null;
  let handlers = { onSignedIn() {}, onSignedOut() {} };
  let testDb = blankTestDb();

  function blankTestDb() {
    return { users: {}, players: {}, leaderboard: {}, accounts: {}, sessionUid: '' };
  }

  function loadTestDb() {
    try {
      const raw = sessionStorage.getItem(TEST_KEY);
      testDb = raw ? JSON.parse(raw) : blankTestDb();
    } catch (error) {
      testDb = blankTestDb();
    }
    if (!testDb.users) testDb = blankTestDb();
  }

  function persistTestDb() {
    const copy = JSON.parse(JSON.stringify(testDb));
    Object.values(copy.users).forEach((user) => { delete user.passwordPlain; });
    sessionStorage.setItem(TEST_KEY, JSON.stringify(copy));
  }

  async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function usernameToEmail(username) {
    return `${(await sha256Hex(username.trim())).slice(0, 32)}@students.happyfarm.local`;
  }

  function normalizeUsername(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function validateUsername(username) {
    if (!username || username.length > 12) return '帳號需為 1 到 12 個字。';
    if (/[\s,，\\/:*?"<>|@\u0000-\u001f]/.test(username)) return '帳號不能有空白、逗號或符號。';
    return '';
  }

  function validatePassword(password) {
    if (typeof password !== 'string' || password.length < 6 || password.length > 32) return '密碼需為 6 到 32 個字。';
    if (/[\s,，]/.test(password)) return '密碼不能有空白或逗號。';
    return '';
  }

  function parseAccountCsv(text, generateMissing) {
    const raw = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!raw) return { error: '請貼上或匯入至少一個帳號。', accounts: [] };
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const accounts = [];
    const seen = new Set();
    let start = 0;
    if (lines.length && /帳號/.test(lines[0]) && /密碼/.test(lines[0])) start = 1;
    for (let i = start; i < lines.length; i++) {
      const parts = lines[i].split(/[,，]/).map((part) => part.trim());
      const username = normalizeUsername(parts[0]);
      const password = parts[1] || '';
      const nameError = validateUsername(username);
      if (nameError) return { error: `第 ${i + 1} 行：${nameError}`, accounts: [] };
      if (seen.has(username)) return { error: `帳號「${username}」重複了。`, accounts: [] };
      seen.add(username);
      if (!password && !generateMissing) return { error: `第 ${i + 1} 行的「${username}」沒有密碼。`, accounts: [] };
      if (password) {
        const passwordError = validatePassword(password);
        if (passwordError) return { error: `第 ${i + 1} 行：${passwordError}`, accounts: [] };
      }
      if (parts.length > 2) return { error: `第 ${i + 1} 行格式不對。請用「帳號,密碼」。`, accounts: [] };
      accounts.push({ username, password });
    }
    if (!accounts.length) return { error: '沒有讀到帳號。', accounts: [] };
    if (accounts.length > 30) return { error: '一次最多建立 30 個帳號，請分成幾次。', accounts: [] };
    return { accounts };
  }

  function generatePassword() {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
    return out;
  }

  function clampInt(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isInteger(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function emptyPlot(id) {
    return {
      id,
      status: 'empty',
      cropKey: null,
      plantedAt: null,
      readyAt: null,
      watered: false,
      lastWateredAt: null,
      wiltStartAt: null,
      fertilized: false,
      fertCount: 0,
      overWatered: false,
      deathCause: null,
    };
  }

  function progressBody(state, displayName) {
    const name = typeof displayName === 'string' ? displayName.trim() : '';
    if (!name || name.length > 12) throw Object.assign(new Error('顯示名稱需為 1 到 12 個字。'), { code: 'invalid-argument' });
    const sourcePlots = Array.isArray(state.plots) ? state.plots : [];
    const plots = [];
    for (let index = 0; index < 36; index++) {
      const plot = sourcePlots[index] || {};
      const status = STATUSES.includes(plot.status) ? plot.status : 'empty';
      const cropKey = CROP_KEYS.includes(plot.cropKey) ? plot.cropKey : null;
      plots.push({
        id: index,
        status,
        cropKey,
        plantedAt: plot.plantedAt == null ? null : clampInt(plot.plantedAt, 0, 9999999999999, null),
        readyAt: plot.readyAt == null ? null : clampInt(plot.readyAt, 0, 9999999999999, null),
        watered: plot.watered === true,
        lastWateredAt: plot.lastWateredAt == null ? null : clampInt(plot.lastWateredAt, 0, 9999999999999, null),
        wiltStartAt: plot.wiltStartAt == null ? null : clampInt(plot.wiltStartAt, 0, 9999999999999, null),
        fertilized: plot.fertilized === true,
        fertCount: clampInt(plot.fertCount, 0, 3, 0),
        overWatered: plot.overWatered === true,
        deathCause: DEATHS.includes(plot.deathCause) ? plot.deathCause : null,
      });
    }
    const inventory = {};
    CROP_KEYS.forEach((key) => { inventory[key] = clampInt(state.inventory && state.inventory[key], 0, 99999999, 0); });
    const log = (Array.isArray(state.log) ? state.log : [])
      .filter((line) => typeof line === 'string')
      .slice(0, 30)
      .map((line) => line.slice(0, 200));
    return {
      displayName: name,
      level: clampInt(state.level, 1, 8, 1),
      exp: clampInt(state.exp, 0, 99999999, 0),
      coins: clampInt(state.coins, 0, 99999999, 0),
      selectedSeed: CROP_KEYS.includes(state.selectedSeed) ? state.selectedSeed : 'radish',
      selectedTool: TOOL_KEYS.includes(state.selectedTool) ? state.selectedTool : 'plant',
      plots,
      inventory,
      log,
      weather: WEATHER_KEYS.includes(state.weather) ? state.weather : 'sunny',
      weatherNextAt: clampInt(state.weatherNextAt, 0, 9999999999999, Date.now() + 60000),
      lastAutoWaterAt: clampInt(state.lastAutoWaterAt, 0, 9999999999999, 0),
    };
  }

  function boardFrom(body) {
    return { displayName: body.displayName, level: body.level, coins: body.coins };
  }

  function progressFrom(data) {
    const progress = Object.assign({}, data);
    delete progress.displayName;
    delete progress.updatedAt;
    return progress;
  }

  function millisOf(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    return 0;
  }

  function requireUser() {
    if (!current) {
      const error = new Error('請先登入。');
      error.code = 'permission-denied';
      throw error;
    }
  }

  function requireAdmin() {
    requireUser();
    if (current.email !== ADMIN_EMAIL || current.emailVerified !== true) {
      const error = new Error('只有管理者可以執行。');
      error.code = 'permission-denied';
      throw error;
    }
  }

  function deny(message) {
    const error = new Error(message || '沒有權限。');
    error.code = 'permission-denied';
    throw error;
  }

  function publicView() {
    if (!current) return null;
    return {
      uid: current.uid,
      provider: current.provider,
      loginName: current.loginName || '',
      isAdmin: current.email === ADMIN_EMAIL && current.emailVerified === true,
    };
  }

  function emitAuth() {
    const view = publicView();
    if (view) handlers.onSignedIn(view);
    else handlers.onSignedOut();
  }

  function initFirebase() {
    if (typeof firebase === 'undefined') return false;
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    if (emulatorMode) {
      auth.useEmulator('http://127.0.0.1:9099');
      db.useEmulator('127.0.0.1', 8080);
      firebase.app().functions('asia-east1').useEmulator('127.0.0.1', 5001);
    }
    mode = 'firebase';
    return true;
  }

  const FarmCloud = {
    get mode() { return mode; },
    configured() { return mode !== 'unconfigured'; },
    isAdmin() { return !!(current && current.email === ADMIN_EMAIL && current.emailVerified === true); },
    uid() { return current ? current.uid : ''; },
    start(nextHandlers) {
      handlers = Object.assign(handlers, nextHandlers || {});
      if (testMode) {
        mode = 'test';
        loadTestDb();
        current = testDb.sessionUid ? testDb.users[testDb.sessionUid] || null : null;
        emitAuth();
        return;
      }
      if (configReady && initFirebase()) {
        auth.onAuthStateChanged((user) => {
          if (!user) {
            current = null;
          } else {
            current = {
              uid: user.uid,
              email: user.email || '',
              emailVerified: user.emailVerified === true,
              provider: user.providerData.some((item) => item.providerId === 'google.com') ? 'google' : 'password',
              loginName: user.providerData.some((item) => item.providerId === 'password') ? (user.displayName || '') : '',
            };
          }
          emitAuth();
        });
        return;
      }
      mode = 'unconfigured';
      current = null;
      emitAuth();
    },
    async signInGoogle() {
      if (mode === 'unconfigured') return failUnconfigured();
      if (mode === 'test') return deny('這是本機測試，請用帳號密碼登入。');
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await auth.signInWithPopup(provider);
      } catch (error) {
        if (error && error.code === 'auth/popup-blocked') {
          await auth.signInWithRedirect(provider);
          return;
        }
        throw error;
      }
    },
    async signInPassword(username, password) {
      if (mode === 'unconfigured') return failUnconfigured();
      const name = normalizeUsername(username);
      const nameError = validateUsername(name);
      if (nameError) throw Object.assign(new Error(nameError), { code: 'invalid-argument' });
      const passwordError = validatePassword(password);
      if (passwordError) throw Object.assign(new Error('帳號或密碼不正確。'), { code: 'auth/invalid-credential' });
      if (mode === 'test') {
        const email = await usernameToEmail(name);
        const hash = await sha256Hex(password);
        const user = Object.values(testDb.users).find((item) => item.email === email && item.provider === 'password');
        if (!user || user.passwordHash !== hash) {
          throw Object.assign(new Error('帳號或密碼不正確。'), { code: 'auth/invalid-credential' });
        }
        testDb.sessionUid = user.uid;
        current = user;
        persistTestDb();
        emitAuth();
        return;
      }
      await auth.signInWithEmailAndPassword(await usernameToEmail(name), password);
    },
    async signOut() {
      if (mode === 'test') {
        testDb.sessionUid = '';
        current = null;
        persistTestDb();
        emitAuth();
        return;
      }
      if (auth) await auth.signOut();
      current = null;
      emitAuth();
    },
    async loadMine() {
      requireUser();
      if (mode === 'test') {
        const data = testDb.players[current.uid];
        if (!data) return null;
        return { displayName: data.displayName, savedAt: data.updatedAt || 0, progress: progressFrom(data) };
      }
      const snap = await db.collection('players').doc(current.uid).get();
      if (!snap.exists) return null;
      const data = snap.data();
      return { displayName: data.displayName || '', savedAt: millisOf(data.updatedAt), progress: progressFrom(data) };
    },
    async saveFor(uid, state, displayName) {
      requireUser();
      if (uid !== current.uid) deny('不能改別人的進度。');
      return this.saveMine(state, displayName);
    },
    async saveMine(state, displayName) {
      requireUser();
      const body = progressBody(state, displayName);
      const board = boardFrom(body);
      if (mode === 'test') {
        testDb.players[current.uid] = Object.assign({}, body, { updatedAt: Date.now() });
        testDb.leaderboard[current.uid] = board;
        persistTestDb();
        return testDb.players[current.uid].updatedAt;
      }
      const ref = db.collection('players').doc(current.uid);
      await ref.set(Object.assign({}, body, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }));
      await db.collection('leaderboard').doc(current.uid).set(board);
      const saved = await ref.get();
      return millisOf(saved.data() && saved.data().updatedAt) || Date.now();
    },
    async leaderboard() {
      requireUser();
      if (mode === 'test') {
        return Object.entries(testDb.leaderboard).map(([uid, row]) => ({
          uid,
          displayName: row.displayName,
          level: row.level,
          coins: row.coins,
        }));
      }
      const snap = await db.collection('leaderboard').get();
      return snap.docs.map((doc) => ({
        uid: doc.id,
        displayName: doc.get('displayName') || '',
        level: doc.get('level') || 1,
        coins: doc.get('coins') || 0,
      }));
    },
    async listRoster() {
      requireAdmin();
      if (mode === 'test') return rosterFrom(testDb);
      const [players, accounts] = await Promise.all([
        db.collection('players').get(),
        db.collection('accounts').get(),
      ]);
      const map = new Map();
      players.forEach((doc) => {
        map.set(doc.id, {
          uid: doc.id,
          displayName: doc.get('displayName') || '',
          level: doc.get('level') || 1,
          coins: doc.get('coins') || 0,
          savedAt: millisOf(doc.get('updatedAt')),
          loginName: '',
          provider: 'google',
        });
      });
      accounts.forEach((doc) => {
        const row = map.get(doc.id) || {
          uid: doc.id, displayName: '', level: null, coins: null, savedAt: 0, provider: 'password',
        };
        row.loginName = doc.get('loginName') || '';
        row.provider = 'password';
        map.set(doc.id, row);
      });
      return [...map.values()];
    },
    async createAccounts(text, generateMissing) {
      requireAdmin();
      if (mode === 'firebase') {
        const callable = firebase.app().functions('asia-east1').httpsCallable('createStudentAccounts');
        const result = await callable({ text, generateMissing: generateMissing !== false });
        return result.data;
      }
      const parsed = parseAccountCsv(text, generateMissing !== false);
      if (parsed.error) throw Object.assign(new Error(parsed.error), { code: 'invalid-argument' });
      const created = [];
      const failed = [];
      for (const row of parsed.accounts) {
        const email = await usernameToEmail(row.username);
        if (Object.values(testDb.users).some((user) => user.email === email)) {
          failed.push({ username: row.username, error: '這個帳號已經存在。' });
          continue;
        }
        const generated = !row.password;
        const password = generated ? generatePassword() : row.password;
        const uid = `pw_${(await sha256Hex(email)).slice(0, 16)}`;
        testDb.users[uid] = {
          uid,
          email,
          emailVerified: false,
          provider: 'password',
          loginName: row.username,
          passwordHash: await sha256Hex(password),
        };
        testDb.accounts[uid] = { loginName: row.username, provider: 'password' };
        created.push({ username: row.username, password, generated });
      }
      persistTestDb();
      return { created, failed };
    },
    async resetPassword(username) {
      requireAdmin();
      const name = normalizeUsername(username);
      const nameError = validateUsername(name);
      if (nameError) throw Object.assign(new Error(nameError), { code: 'invalid-argument' });
      if (mode === 'firebase') {
        const callable = firebase.app().functions('asia-east1').httpsCallable('resetStudentPassword');
        const result = await callable({ username: name });
        return result.data;
      }
      const email = await usernameToEmail(name);
      const user = Object.values(testDb.users).find((item) => item.email === email && item.provider === 'password');
      if (!user) throw Object.assign(new Error('找不到這個帳號。Google 登入的學生沒有密碼可重設。'), { code: 'not-found' });
      const password = generatePassword();
      user.passwordHash = await sha256Hex(password);
      persistTestDb();
      return { username: name, password };
    },
    async deletePlayer(uid) {
      requireAdmin();
      if (!uid || uid === current.uid) throw Object.assign(new Error('不能刪除自己的管理者帳號。'), { code: 'failed-precondition' });
      if (mode === 'firebase') {
        const callable = firebase.app().functions('asia-east1').httpsCallable('deleteStudent');
        const result = await callable({ uid });
        return result.data;
      }
      delete testDb.users[uid];
      delete testDb.players[uid];
      delete testDb.leaderboard[uid];
      delete testDb.accounts[uid];
      persistTestDb();
      return { ok: true };
    },
    debugSnapshot() {
      if (mode !== 'test') return null;
      return JSON.parse(JSON.stringify({
        players: testDb.players,
        leaderboard: testDb.leaderboard,
        accounts: testDb.accounts,
      }));
    },
    async devSignInGoogle(profile) {
      if (mode !== 'test') deny('測試登入只在本機測試模式可用。');
      const email = profile.email || '';
      const uid = `g_${(await sha256Hex(email)).slice(0, 16)}`;
      testDb.users[uid] = {
        uid,
        email,
        emailVerified: profile.emailVerified === true,
        provider: 'google',
        loginName: '',
      };
      testDb.sessionUid = uid;
      current = testDb.users[uid];
      persistTestDb();
      emitAuth();
    },
  };

  function rosterFrom(source) {
    const map = new Map();
    Object.entries(source.players).forEach(([uid, data]) => {
      map.set(uid, {
        uid,
        displayName: data.displayName || '',
        level: data.level,
        coins: data.coins,
        savedAt: data.updatedAt || 0,
        loginName: '',
        provider: source.accounts[uid] ? 'password' : 'google',
      });
    });
    Object.entries(source.accounts).forEach(([uid, data]) => {
      const row = map.get(uid) || { uid, displayName: '', level: null, coins: null, savedAt: 0, provider: 'password' };
      row.loginName = data.loginName || '';
      row.provider = 'password';
      map.set(uid, row);
    });
    return [...map.values()];
  }

  function failUnconfigured() {
    throw Object.assign(new Error('老師還沒完成雲端設定，現在無法登入。'), { code: 'unconfigured' });
  }

  window.FarmCloud = FarmCloud;
  window.FarmCloudError = function farmCloudError(error) {
    const code = String((error && error.code) || '');
    const message = String((error && error.message) || '');
    if (code === 'unconfigured' || message.includes('雲端設定')) return '老師還沒完成雲端設定，現在無法登入。';
    if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-login')) return '帳號或密碼不正確。';
    if (code.includes('too-many-requests')) return '嘗試太多次，請稍後再試。';
    if (code.includes('popup-blocked')) return '瀏覽器擋住了登入視窗。請允許彈出視窗，或改用帳號密碼。';
    if (code.includes('popup-closed')) return '登入視窗被關掉了，請再試一次。';
    if (code.includes('unauthorized-domain')) return '這個網址還沒加入 Firebase 授權網域。';
    if (code.includes('permission-denied')) return message || '沒有權限。';
    if (code.includes('unavailable') || code.includes('network')) return '網路連線失敗，請再試一次。';
    if (message && /[\u4e00-\u9fff]/.test(message)) return message;
    return '沒有成功，請再試一次。';
  };
})();
