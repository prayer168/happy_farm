'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const logic = require('./logic');

initializeApp();

const callOptions = { region: 'asia-east1' };

function assertAdmin(request) {
  if (!logic.isAdminToken(request.auth && request.auth.token)) {
    throw new HttpsError('permission-denied', '只有管理者可以執行。');
  }
}

async function findPasswordUser(username) {
  const email = logic.usernameToEmail(username);
  try {
    return await getAuth().getUserByEmail(email);
  } catch (error) {
    if (error.code === 'auth/user-not-found') return null;
    throw error;
  }
}

exports.createStudentAccounts = onCall(callOptions, async (request) => {
  assertAdmin(request);
  const parsed = logic.parseAccountCsv(request.data && request.data.text, {
    generateMissing: !request.data || request.data.generateMissing !== false,
  });
  if (parsed.error) throw new HttpsError('invalid-argument', parsed.error);

  const auth = getAuth();
  const db = getFirestore();
  const created = [];
  const failed = [];
  for (const row of parsed.accounts) {
    const existing = await findPasswordUser(row.username);
    if (existing) {
      failed.push({ username: row.username, error: '這個帳號已經存在。' });
      continue;
    }
    const generated = !row.password;
    const password = generated ? logic.generatePassword() : row.password;
    const email = logic.usernameToEmail(row.username);
    try {
      const user = await auth.createUser({
        email,
        password,
        displayName: row.username,
        emailVerified: false,
      });
      await db.collection('accounts').doc(user.uid).set({
        loginName: row.username,
        provider: 'password',
        createdAt: FieldValue.serverTimestamp(),
      });
      created.push({ username: row.username, password, generated });
    } catch (error) {
      failed.push({ username: row.username, error: '建立失敗，請稍後再試。' });
    }
  }
  return { created, failed };
});

exports.resetStudentPassword = onCall(callOptions, async (request) => {
  assertAdmin(request);
  const username = logic.normalizeUsername(request.data && request.data.username);
  const nameError = logic.validateUsername(username);
  if (nameError) throw new HttpsError('invalid-argument', nameError);
  const user = await findPasswordUser(username);
  if (!user) throw new HttpsError('not-found', '找不到這個帳號。Google 登入的學生沒有密碼可重設。');
  const password = logic.generatePassword();
  await getAuth().updateUser(user.uid, { password });
  return { username, password };
});

exports.deleteStudent = onCall(callOptions, async (request) => {
  assertAdmin(request);
  const uid = request.data && request.data.uid;
  if (typeof uid !== 'string' || !uid.trim()) throw new HttpsError('invalid-argument', '缺少要刪除的玩家。');
  if (request.auth && uid === request.auth.uid) throw new HttpsError('failed-precondition', '不能刪除自己的管理者帳號。');
  const db = getFirestore();
  await Promise.all([
    db.collection('players').doc(uid).delete(),
    db.collection('leaderboard').doc(uid).delete(),
    db.collection('accounts').doc(uid).delete(),
  ]);
  try {
    await getAuth().deleteUser(uid);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw new HttpsError('internal', '登入帳號沒有刪除成功。');
  }
  return { ok: true };
});
