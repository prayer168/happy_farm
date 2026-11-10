'use strict';

const crypto = require('crypto');

const ADMIN_EMAIL = 'prayer168@gmail.com';
const EMAIL_DOMAIN = 'students.happyfarm.local';
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_BATCH = 30;

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

function usernameToEmail(username) {
  const hex = crypto.createHash('sha256').update(normalizeUsername(username), 'utf8').digest('hex').slice(0, 32);
  return `${hex}@${EMAIL_DOMAIN}`;
}

function generatePassword() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  return out;
}

function isAdminToken(token) {
  return !!(token && token.email === ADMIN_EMAIL && token.email_verified === true);
}

function parseAccountCsv(text, options = {}) {
  const generateMissing = options.generateMissing !== false;
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
    let password = parts[1] || '';
    const nameError = validateUsername(username);
    if (nameError) return { error: `第 ${i + 1} 行：${nameError}`, accounts: [] };
    if (seen.has(username)) return { error: `帳號「${username}」重複了。`, accounts: [] };
    seen.add(username);
    if (!password && generateMissing) password = '';
    if (!password && !generateMissing) return { error: `第 ${i + 1} 行的「${username}」沒有密碼。`, accounts: [] };
    if (password) {
      const passwordError = validatePassword(password);
      if (passwordError) return { error: `第 ${i + 1} 行：${passwordError}`, accounts: [] };
    }
    if (parts.length > 2) return { error: `第 ${i + 1} 行格式不對。請用「帳號,密碼」。`, accounts: [] };
    accounts.push({ username, password });
  }
  if (!accounts.length) return { error: '沒有讀到帳號。', accounts: [] };
  if (accounts.length > MAX_BATCH) return { error: `一次最多建立 ${MAX_BATCH} 個帳號，請分成幾次。`, accounts: [] };
  return { accounts };
}

module.exports = {
  ADMIN_EMAIL,
  EMAIL_DOMAIN,
  MAX_BATCH,
  normalizeUsername,
  validateUsername,
  validatePassword,
  usernameToEmail,
  generatePassword,
  isAdminToken,
  parseAccountCsv,
};
