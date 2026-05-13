'use strict';

// ── Crop definitions ──────────────────────────────────────────────────────────
const CROPS = {
  radish: {
    name: '蘿蔔', emoji: '🥕',
    seedCost: 5, sellPrice: 15,
    growTime: 30, waterBonus: 10, expGain: 10,
    unlockLevel: 1,
    waterInterval: 20, wiltGracePeriod: 10, fertilizerCost: 3,
  },
  tomato: {
    name: '番茄', emoji: '🍅',
    seedCost: 12, sellPrice: 30,
    growTime: 60, waterBonus: 20, expGain: 20,
    unlockLevel: 1,
    waterInterval: 40, wiltGracePeriod: 20, fertilizerCost: 6,
  },
  corn: {
    name: '玉米', emoji: '🌽',
    seedCost: 25, sellPrice: 65,
    growTime: 120, waterBonus: 40, expGain: 40,
    unlockLevel: 2,
    waterInterval: 80, wiltGracePeriod: 40, fertilizerCost: 13,
  },
  strawberry: {
    name: '草莓', emoji: '🍓',
    seedCost: 40, sellPrice: 110,
    growTime: 180, waterBonus: 60, expGain: 60,
    unlockLevel: 3,
    waterInterval: 120, wiltGracePeriod: 60, fertilizerCost: 20,
  },
  watermelon: {
    name: '西瓜', emoji: '🍉',
    seedCost: 70, sellPrice: 200,
    growTime: 300, waterBonus: 100, expGain: 100,
    unlockLevel: 4,
    waterInterval: 200, wiltGracePeriod: 100, fertilizerCost: 35,
  },
  pumpkin: {
    name: '南瓜', emoji: '🎃',
    seedCost: 100, sellPrice: 300,
    growTime: 480, waterBonus: 150, expGain: 150,
    unlockLevel: 5,
    waterInterval: 320, wiltGracePeriod: 160, fertilizerCost: 50,
  },
  bellpepper: {
    name: '青椒', emoji: '🫑',
    seedCost: 150, sellPrice: 420,
    growTime: 600, waterBonus: 180, expGain: 200,
    unlockLevel: 6,
    waterInterval: 240, wiltGracePeriod: 120, fertilizerCost: 75,
  },
  eggplant: {
    name: '茄子', emoji: '🍆',
    seedCost: 200, sellPrice: 580,
    growTime: 750, waterBonus: 220, expGain: 260,
    unlockLevel: 6,
    waterInterval: 300, wiltGracePeriod: 150, fertilizerCost: 100,
  },
  blueberry: {
    name: '藍莓', emoji: '🫐',
    seedCost: 280, sellPrice: 800,
    growTime: 900, waterBonus: 260, expGain: 340,
    unlockLevel: 7,
    waterInterval: 360, wiltGracePeriod: 180, fertilizerCost: 140,
  },
  peach: {
    name: '桃子', emoji: '🍑',
    seedCost: 380, sellPrice: 1100,
    growTime: 1200, waterBonus: 340, expGain: 460,
    unlockLevel: 7,
    waterInterval: 450, wiltGracePeriod: 225, fertilizerCost: 190,
  },
  mango: {
    name: '芒果', emoji: '🥭',
    seedCost: 500, sellPrice: 1500,
    growTime: 1500, waterBonus: 420, expGain: 600,
    unlockLevel: 8,
    waterInterval: 550, wiltGracePeriod: 275, fertilizerCost: 250,
  },
};

// ── Level thresholds ──────────────────────────────────────────────────────────
const LEVEL_EXP = [0, 100, 250, 500, 900, 1500, 2500, 4000, 9999];
const GRID_SIZE = 6;
const TOTAL_PLOTS = GRID_SIZE * GRID_SIZE;
const PLOTS_UNLOCKED = [12, 18, 24, 30, 36, 36, 36, 36, 36];

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  coins: 100,
  exp: 0,
  level: 1,
  selectedSeed: 'radish',
  selectedTool: 'plant',
  plots: [],
  inventory: {},
  log: [],
};

function defaultPlots() {
  return Array.from({ length: TOTAL_PLOTS }, (_, i) => ({
    id: i,
    status: 'empty',
    cropKey: null,
    plantedAt: null,
    readyAt: null,
    watered: false,
    lastWateredAt: null,
    wiltStartAt: null,
    fertilized: false,
  }));
}

// ── Save / Load ───────────────────────────────────────────────────────────────
function saveState() {
  localStorage.setItem('happyFarm', JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem('happyFarm');
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    Object.assign(state, saved);
  } catch (e) { /* ignore corrupt save */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function unlockedPlotCount() {
  return PLOTS_UNLOCKED[Math.min(state.level - 1, PLOTS_UNLOCKED.length - 1)];
}

function expToNextLevel() {
  return LEVEL_EXP[Math.min(state.level, LEVEL_EXP.length - 1)];
}

function addLog(msg) {
  state.log.unshift(msg);
  if (state.log.length > 30) state.log.pop();
  renderLog();
}

function now() { return Date.now(); }

// ── Rendering ─────────────────────────────────────────────────────────────────
function renderStats() {
  document.getElementById('coins').textContent = state.coins;
  document.getElementById('level').textContent = state.level;
  document.getElementById('exp').textContent = state.exp;
  document.getElementById('exp-next').textContent = expToNextLevel();
}

function renderSeedShop() {
  const list = document.getElementById('seed-list');
  list.innerHTML = '';
  for (const [key, crop] of Object.entries(CROPS)) {
    const locked = crop.unlockLevel > state.level;
    const card = document.createElement('div');
    card.className = 'seed-card' + (locked ? ' locked-seed' : '') + (state.selectedSeed === key && !locked ? ' selected' : '');
    card.innerHTML = `
      <span class="seed-emoji">${crop.emoji}</span>
      <div class="seed-info">
        <div class="seed-name">${crop.name}${locked ? ` (等級${crop.unlockLevel}解鎖)` : ''}</div>
        <div class="seed-meta">⏱ ${crop.growTime}秒 &nbsp;💧${crop.waterInterval}秒/次 &nbsp;💰 售價 ${crop.sellPrice}</div>
      </div>
      <span class="seed-cost">🪙${crop.seedCost}</span>`;
    if (!locked) {
      card.addEventListener('click', () => selectSeed(key));
    }
    list.appendChild(card);
  }
}

function renderFarm() {
  const grid = document.getElementById('farm-grid');
  const unlocked = unlockedPlotCount();

  state.plots.forEach((plot, i) => {
    if (i >= unlocked && plot.status !== 'locked') {
      plot.status = 'locked';
      plot.cropKey = null;
    } else if (i < unlocked && plot.status === 'locked') {
      plot.status = 'empty';
    }
  });

  grid.innerHTML = '';
  state.plots.forEach((plot, i) => {
    const div = document.createElement('div');
    div.className = 'plot ' + plot.status;
    div.dataset.id = i;

    let emoji = '🟫';
    let label = '空地';

    if (plot.status === 'locked') {
      emoji = '🔒'; label = '未解鎖';
    } else if (plot.status === 'dead') {
      emoji = '💀'; label = '已枯死';
    } else if (plot.cropKey) {
      const crop = CROPS[plot.cropKey];
      if (plot.status === 'planted')  { emoji = '🌱'; label = crop.name; }
      else if (plot.status === 'growing')  { emoji = '🌿'; label = crop.name; }
      else if (plot.status === 'watered')  { emoji = '💧'; label = crop.name; }
      else if (plot.status === 'wilting')  { emoji = '🥀'; label = `${crop.name} 缺水！`; }
      else if (plot.status === 'ready')    { emoji = crop.emoji; label = '可收穫！'; }
    }

    let progressHTML = '';
    if (plot.cropKey && !['ready', 'empty', 'locked', 'dead', 'wilting'].includes(plot.status)) {
      const pct = growProgress(plot);
      progressHTML = `<div class="plot-progress"><div class="plot-progress-bar" style="width:${pct}%"></div></div>`;
    }

    const fertBadge = (plot.fertilized && plot.status !== 'ready' && plot.status !== 'empty' && plot.status !== 'locked')
      ? '<span class="plot-fertilized-badge">⚗️</span>' : '';

    div.innerHTML = `${fertBadge}<span class="plot-emoji">${emoji}</span><span class="plot-label">${label}</span>${progressHTML}`;
    div.addEventListener('click', () => handlePlotClick(i));
    grid.appendChild(div);
  });
}

function growProgress(plot) {
  if (!plot.plantedAt || !plot.readyAt) return 0;
  const total = plot.readyAt - plot.plantedAt;
  const elapsed = Math.min(now() - plot.plantedAt, total);
  return Math.round((elapsed / total) * 100);
}

function renderInventory() {
  const inv = document.getElementById('inventory');
  inv.innerHTML = '';
  let hasItems = false;
  for (const [key, count] of Object.entries(state.inventory)) {
    if (count <= 0) continue;
    hasItems = true;
    const crop = CROPS[key];
    const item = document.createElement('div');
    item.className = 'inv-item';
    item.innerHTML = `<span class="inv-emoji">${crop.emoji}</span><span class="inv-count">x${count}</span><span class="inv-value">🪙${crop.sellPrice}</span>`;
    inv.appendChild(item);
  }
  if (!hasItems) {
    inv.innerHTML = '<span style="font-size:.78rem;color:#888">倉庫空空如也</span>';
  }
}

function renderLog() {
  const ul = document.getElementById('log-list');
  ul.innerHTML = '';
  state.log.slice(0, 15).forEach(msg => {
    const li = document.createElement('li');
    li.textContent = msg;
    ul.appendChild(li);
  });
}

function render() {
  renderStats();
  renderSeedShop();
  renderFarm();
  renderInventory();
}

// ── Actions ───────────────────────────────────────────────────────────────────
function selectSeed(key) {
  state.selectedSeed = key;
  renderSeedShop();
}

function selectTool(tool) {
  state.selectedTool = tool;
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
}

function handlePlotClick(idx) {
  const plot = state.plots[idx];
  if (plot.status === 'locked') {
    showModal('🔒 尚未解鎖', `升級以解鎖更多農地！`);
    return;
  }

  switch (state.selectedTool) {
    case 'plant':     doPlant(plot);     break;
    case 'water':     doWater(plot);     break;
    case 'harvest':   doHarvest(plot);   break;
    case 'remove':    doRemove(plot);    break;
    case 'fertilize': doFertilize(plot); break;
  }

  saveState();
  render();
}

function doPlant(plot) {
  if (plot.status === 'dead') {
    addLog('⚠️ 請先清除枯死的植物再種植');
    return;
  }
  if (plot.status !== 'empty') {
    addLog('⚠️ 這塊地已有作物');
    return;
  }
  const cropKey = state.selectedSeed;
  const crop = CROPS[cropKey];
  if (crop.unlockLevel > state.level) {
    addLog(`⚠️ 等級不足，需要等級 ${crop.unlockLevel}`);
    return;
  }
  if (state.coins < crop.seedCost) {
    addLog(`⚠️ 金幣不足！需要 ${crop.seedCost} 金幣`);
    showModal('金幣不足', `購買 ${crop.name} 種子需要 🪙${crop.seedCost}，你只有 🪙${state.coins}。`);
    return;
  }
  state.coins -= crop.seedCost;
  const t = now();
  plot.status = 'planted';
  plot.cropKey = cropKey;
  plot.plantedAt = t;
  plot.readyAt = t + crop.growTime * 1000;
  plot.watered = false;
  plot.lastWateredAt = t;
  plot.wiltStartAt = null;
  plot.fertilized = false;
  addLog(`🌱 種下了 ${crop.name}，記得每 ${crop.waterInterval} 秒澆水！`);
  AudioManager.sfxPlant();
}

function doWater(plot) {
  if (plot.status === 'empty' || plot.status === 'locked') {
    addLog('⚠️ 這裡沒有可澆水的作物');
    return;
  }
  if (plot.status === 'dead') {
    addLog('⚠️ 植物已枯死，澆水也沒用了，請清除後重新種植');
    return;
  }
  if (plot.status === 'ready') {
    addLog('✅ 這個作物已成熟，請收穫！');
    return;
  }

  const crop = CROPS[plot.cropKey];
  const t = now();
  const wasWilting = plot.status === 'wilting';

  plot.lastWateredAt = t;
  plot.watered = true;
  plot.wiltStartAt = null;

  // Accelerate growth by waterBonus
  plot.readyAt = Math.max(t + 1000, plot.readyAt - crop.waterBonus * 1000);

  // Restore wilting plant to growing state
  if (wasWilting) {
    plot.status = growProgress(plot) > 40 ? 'growing' : 'planted';
    addLog(`💧 澆水！${crop.name} 從枯萎中恢復，繼續生長`);
  } else {
    plot.status = 'watered';
    addLog(`💧 澆水！${crop.name} 加速成長 ${crop.waterBonus} 秒`);
  }
  AudioManager.sfxWater();
}

function doHarvest(plot) {
  if (plot.status === 'dead') {
    addLog('⚠️ 植物已枯死，請改用清除工具');
    return;
  }
  if (plot.status !== 'ready') {
    if (plot.cropKey) {
      addLog('⏳ 作物還沒成熟，請耐心等待');
    } else {
      addLog('⚠️ 這裡沒有作物可收穫');
    }
    return;
  }
  const crop = CROPS[plot.cropKey];
  state.inventory[plot.cropKey] = (state.inventory[plot.cropKey] || 0) + 1;
  gainExp(crop.expGain);
  addLog(`🌾 收穫了 ${crop.emoji} ${crop.name}！獲得 ${crop.expGain} 經驗`);
  AudioManager.sfxHarvest();
  resetPlot(plot);
}

function doRemove(plot) {
  if (plot.status === 'empty') {
    addLog('⚠️ 這塊地是空的');
    return;
  }
  if (plot.cropKey) {
    addLog(`🗑️ 清除了 ${CROPS[plot.cropKey].name}`);
  } else {
    addLog('🗑️ 清除了枯死的植物');
  }
  AudioManager.sfxRemove();
  resetPlot(plot);
}

function doFertilize(plot) {
  if (plot.status === 'empty' || plot.status === 'locked') {
    addLog('⚠️ 這裡沒有作物可施肥');
    return;
  }
  if (plot.status === 'dead') {
    addLog('⚠️ 植物已枯死，無法施肥');
    return;
  }
  if (plot.status === 'ready') {
    addLog('✅ 作物已成熟，不需要施肥');
    return;
  }
  if (plot.fertilized) {
    addLog('⚠️ 這塊地已施過肥，每次種植只能施肥一次');
    return;
  }
  if (plot.status === 'wilting') {
    addLog('⚠️ 植物正在枯萎，請先澆水再施肥');
    return;
  }

  const crop = CROPS[plot.cropKey];
  const cost = crop.fertilizerCost;
  if (state.coins < cost) {
    showModal('金幣不足', `施肥 ${crop.name} 需要 🪙${cost}，你只有 🪙${state.coins}。`);
    return;
  }

  state.coins -= cost;
  const remaining = plot.readyAt - now();
  plot.readyAt = Math.max(now() + 1000, plot.readyAt - Math.floor(remaining * 0.4));
  plot.fertilized = true;
  addLog(`⚗️ 施肥！${crop.name} 成熟時間縮短 40%，花費 🪙${cost}`);
  AudioManager.sfxFertilize();
}

function resetPlot(plot) {
  plot.status = 'empty';
  plot.cropKey = null;
  plot.plantedAt = null;
  plot.readyAt = null;
  plot.watered = false;
  plot.lastWateredAt = null;
  plot.wiltStartAt = null;
  plot.fertilized = false;
}

function gainExp(amount) {
  state.exp += amount;
  const needed = expToNextLevel();
  if (state.exp >= needed && state.level < LEVEL_EXP.length - 1) {
    state.exp -= needed;
    state.level += 1;
    const bonus = state.level * 50;
    state.coins += bonus;
    addLog(`⭐ 升級！達到等級 ${state.level}，獲得 🪙${bonus} 金幣`);
    AudioManager.sfxLevelUp();
    showModal(`🎉 升級了！`, `恭喜升到 ⭐ 等級 ${state.level}！\n解鎖了更多農地，並獲得 🪙${bonus} 金幣獎勵！`);
  }
}

function sellAll() {
  let total = 0;
  let sold = [];
  for (const [key, count] of Object.entries(state.inventory)) {
    if (count <= 0) continue;
    const crop = CROPS[key];
    total += crop.sellPrice * count;
    sold.push(`${crop.emoji}${crop.name} x${count}`);
    state.inventory[key] = 0;
  }
  if (total === 0) {
    addLog('⚠️ 倉庫是空的，沒有東西可以賣');
    return;
  }
  state.coins += total;
  addLog(`💰 賣出 ${sold.join('、')}，獲得 🪙${total}`);
  AudioManager.sfxSell();
  saveState();
  render();
}

// ── Grow Tick ─────────────────────────────────────────────────────────────────
function growTick() {
  let changed = false;
  const t = now();

  state.plots.forEach(plot => {
    if (!plot.cropKey) return;
    if (['ready', 'empty', 'locked'].includes(plot.status)) return;

    const crop = CROPS[plot.cropKey];

    // Dead plants do nothing
    if (plot.status === 'dead') return;

    // Wilting → dead check
    if (plot.status === 'wilting') {
      if (plot.wiltStartAt && t >= plot.wiltStartAt + crop.wiltGracePeriod * 1000) {
        plot.status = 'dead';
        addLog(`💀 ${crop.emoji} ${crop.name} 枯死了！記得定時澆水`);
        AudioManager.sfxDead();
        changed = true;
      }
      return;
    }

    // Normal growth: check if ready
    if (t >= plot.readyAt) {
      plot.status = 'ready';
      addLog(`✅ ${crop.emoji} ${crop.name} 成熟了，快去收穫！`);
      changed = true;
      return;
    }

    // Check if needs water → wilt
    if (plot.lastWateredAt && t >= plot.lastWateredAt + crop.waterInterval * 1000) {
      plot.status = 'wilting';
      plot.wiltStartAt = t;
      addLog(`🥀 ${crop.emoji} ${crop.name} 開始枯萎，快去澆水！`);
      AudioManager.sfxWilt();
      changed = true;
      return;
    }

    // Update visual state
    const newStatus = plot.watered ? 'watered' : (growProgress(plot) > 40 ? 'growing' : 'planted');
    if (plot.status !== newStatus) { plot.status = newStatus; changed = true; }
  });

  if (changed) { saveState(); renderFarm(); renderStats(); }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function showModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  loadState();

  if (!state.plots || state.plots.length !== TOTAL_PLOTS) {
    state.plots = defaultPlots();
  }

  // Backfill new plot fields for saves from older version
  state.plots.forEach(plot => {
    if (plot.lastWateredAt === undefined) plot.lastWateredAt = null;
    if (plot.wiltStartAt === undefined)   plot.wiltStartAt = null;
    if (plot.fertilized === undefined)    plot.fertilized = false;
  });

  Object.keys(CROPS).forEach(k => {
    if (state.inventory[k] === undefined) state.inventory[k] = 0;
  });

  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => selectTool(btn.dataset.tool));
  });

  document.getElementById('sell-all-btn').addEventListener('click', sellAll);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Audio controls — start context on first interaction (browser autoplay policy)
  document.body.addEventListener('click', () => AudioManager.start(), { once: true });

  document.getElementById('bg-toggle').addEventListener('click', () => {
    const on = AudioManager.toggleBg();
    document.getElementById('bg-toggle').textContent = on ? '🎵' : '🔇';
    document.getElementById('bg-toggle').classList.toggle('muted', !on);
  });

  document.getElementById('sfx-toggle').addEventListener('click', () => {
    const on = AudioManager.toggleSfx();
    document.getElementById('sfx-toggle').textContent = on ? '🔊' : '🔕';
    document.getElementById('sfx-toggle').classList.toggle('muted', !on);
  });

  render();
  setInterval(growTick, 1000);
  setInterval(saveState, 10000);

  addLog('🌾 歡迎來到開心農場！選種子點農地種植，記得定時澆水！');
}

document.addEventListener('DOMContentLoaded', init);
