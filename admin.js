'use strict';

let issuedPasswords = [];

function show(id, on) {
  const el = document.getElementById(id);
  if (el) el.hidden = !on;
}

function setError(id, message) {
  const el = document.getElementById(id);
  if (el) el.textContent = message || '';
}

function clock(ms) {
  if (!ms) return '尚未開始';
  const date = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

function csvEscape(value) {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(filename, rows) {
  const body = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + body + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function renderPasswords(created) {
  issuedPasswords = created.map((row) => ({ username: row.username, password: row.password }));
  const tbody = document.getElementById('password-table');
  tbody.replaceChildren();
  issuedPasswords.forEach((row) => {
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = row.username;
    const password = document.createElement('td');
    password.textContent = row.password;
    tr.append(name, password);
    tbody.appendChild(tr);
  });
  show('password-result', issuedPasswords.length > 0);
}

function renderRoster(rows) {
  const tbody = document.getElementById('roster-body');
  tbody.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = '還沒有玩家。';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  rows.sort((a, b) => (b.level || 0) - (a.level || 0) || (b.coins || 0) - (a.coins || 0));
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const cells = [
      row.displayName || '（尚未取名）',
      row.provider === 'password' ? (row.loginName || '帳號密碼') : 'Google 登入',
      row.level == null ? '—' : String(row.level),
      row.coins == null ? '—' : row.coins.toLocaleString(),
      clock(row.savedAt),
    ];
    cells.forEach((text) => {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    });
    const ops = document.createElement('td');
    if (row.provider === 'password' && row.loginName) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.textContent = '重設密碼';
      reset.addEventListener('click', () => resetPassword(row.loginName));
      ops.appendChild(reset);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger-btn';
    remove.textContent = '刪除';
    remove.addEventListener('click', () => deletePlayer(row));
    ops.appendChild(remove);
    tr.appendChild(ops);
    tbody.appendChild(tr);
  });
}

async function loadRoster() {
  setError('roster-error', '');
  try {
    renderRoster(await FarmCloud.listRoster());
  } catch (error) {
    setError('roster-error', FarmCloudError(error));
  }
}

async function createAccounts() {
  setError('create-error', '');
  show('password-result', false);
  issuedPasswords = [];
  const button = document.getElementById('create-accounts');
  button.disabled = true;
  try {
    const result = await FarmCloud.createAccounts(
      document.getElementById('account-text').value,
      document.getElementById('generate-missing').checked,
    );
    const failed = result.failed || [];
    if (failed.length) {
      setError('create-error', failed.map((row) => `${row.username || '（空白）'}：${row.error}`).join('；'));
    }
    renderPasswords(result.created || []);
    await loadRoster();
  } catch (error) {
    setError('create-error', FarmCloudError(error));
  } finally {
    button.disabled = false;
  }
}

function showSecret(username, password) {
  document.getElementById('secret-body').textContent = `帳號「${username}」的新密碼是 ${password}。請立刻交給學生，關閉後就看不到了。`;
  const dialog = document.getElementById('secret-result');
  dialog.hidden = false;
  document.getElementById('secret-download').onclick = () => downloadCsv(`開心農場密碼_${username}.csv`, [['帳號', '密碼'], [username, password]]);
  document.getElementById('secret-close').focus();
}

async function resetPassword(username) {
  if (!confirm(`確定重設「${username}」的密碼？舊密碼會立刻失效。`)) return;
  try {
    const result = await FarmCloud.resetPassword(username);
    showSecret(result.username, result.password);
  } catch (error) {
    setError('roster-error', FarmCloudError(error));
  }
}

async function deletePlayer(row) {
  const label = row.displayName || row.loginName || '這位玩家';
  if (!confirm(`確定刪除「${label}」的登入帳號和雲端進度？此動作無法復原。`)) return;
  try {
    await FarmCloud.deletePlayer(row.uid);
    await loadRoster();
  } catch (error) {
    setError('roster-error', FarmCloudError(error));
  }
}

function enterAdmin() {
  document.body.classList.add('logged-in');
  document.body.classList.remove('logged-out');
  show('admin-login', false);
  show('admin-app', true);
  document.getElementById('admin-logout').hidden = false;
  loadRoster();
}

function leaveAdmin(message) {
  document.body.classList.add('logged-out');
  document.body.classList.remove('logged-in');
  show('admin-login', true);
  show('admin-app', false);
  document.getElementById('admin-logout').hidden = true;
  issuedPasswords = [];
  show('password-result', false);
  setError('admin-login-error', message || '');
}

document.getElementById('admin-google').addEventListener('click', async () => {
  setError('admin-login-error', '');
  try {
    await FarmCloud.signInGoogle();
  } catch (error) {
    setError('admin-login-error', FarmCloudError(error));
  }
});

document.getElementById('admin-logout').addEventListener('click', () => FarmCloud.signOut());
document.getElementById('create-accounts').addEventListener('click', createAccounts);
document.getElementById('reload-roster').addEventListener('click', loadRoster);
document.getElementById('download-passwords').addEventListener('click', () => {
  const rows = [['帳號', '密碼']].concat(issuedPasswords.map((row) => [row.username, row.password]));
  downloadCsv('開心農場新帳號.csv', rows);
});
document.getElementById('secret-close').addEventListener('click', () => {
  document.getElementById('secret-result').hidden = true;
});
document.getElementById('csv-file').addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  document.getElementById('account-text').value = await file.text();
});

FarmCloud.start({
  onSignedIn() {
    if (!FarmCloud.isAdmin()) {
      leaveAdmin('這個 Google 帳號不是管理者，不能查看或修改學生資料。');
      return;
    }
    enterAdmin();
  },
  onSignedOut() { leaveAdmin(''); },
});
