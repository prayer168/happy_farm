'use strict';

// ── Crop definitions ──────────────────────────────────────────────────────────
const CROPS = {
  radish:     { name:'蘿蔔', emoji:'🥕', seedCost:5,   sellPrice:15,   growTime:30,   waterBonus:10,  expGain:10,  unlockLevel:1, waterInterval:20,  wiltGracePeriod:10,  fertilizerCost:3   },
  tomato:     { name:'番茄', emoji:'🍅', seedCost:12,  sellPrice:30,   growTime:60,   waterBonus:20,  expGain:20,  unlockLevel:1, waterInterval:40,  wiltGracePeriod:20,  fertilizerCost:6   },
  corn:       { name:'玉米', emoji:'🌽', seedCost:25,  sellPrice:65,   growTime:120,  waterBonus:40,  expGain:40,  unlockLevel:2, waterInterval:80,  wiltGracePeriod:40,  fertilizerCost:13  },
  strawberry: { name:'草莓', emoji:'🍓', seedCost:40,  sellPrice:110,  growTime:180,  waterBonus:60,  expGain:60,  unlockLevel:3, waterInterval:120, wiltGracePeriod:60,  fertilizerCost:20  },
  watermelon: { name:'西瓜', emoji:'🍉', seedCost:70,  sellPrice:200,  growTime:300,  waterBonus:100, expGain:100, unlockLevel:4, waterInterval:200, wiltGracePeriod:100, fertilizerCost:35  },
  pumpkin:    { name:'南瓜', emoji:'🎃', seedCost:100, sellPrice:300,  growTime:480,  waterBonus:150, expGain:150, unlockLevel:5, waterInterval:320, wiltGracePeriod:160, fertilizerCost:50  },
  bellpepper: { name:'青椒', emoji:'🫑', seedCost:150, sellPrice:420,  growTime:600,  waterBonus:180, expGain:200, unlockLevel:6, waterInterval:240, wiltGracePeriod:120, fertilizerCost:75  },
  eggplant:   { name:'茄子', emoji:'🍆', seedCost:200, sellPrice:580,  growTime:750,  waterBonus:220, expGain:260, unlockLevel:6, waterInterval:300, wiltGracePeriod:150, fertilizerCost:100 },
  blueberry:  { name:'藍莓', emoji:'🫐', seedCost:280, sellPrice:800,  growTime:900,  waterBonus:260, expGain:340, unlockLevel:7, waterInterval:360, wiltGracePeriod:180, fertilizerCost:140 },
  peach:      { name:'桃子', emoji:'🍑', seedCost:380, sellPrice:1100, growTime:1200, waterBonus:340, expGain:460, unlockLevel:7, waterInterval:450, wiltGracePeriod:225, fertilizerCost:190 },
  mango:      { name:'芒果', emoji:'🥭', seedCost:500, sellPrice:1500, growTime:1500, waterBonus:420, expGain:600, unlockLevel:8, waterInterval:550, wiltGracePeriod:275, fertilizerCost:250 },
};

const LEVEL_EXP     = [0, 800, 2500, 6000, 14000, 32000, 75000, 180000, 99999999];
const MAX_VAL       = 99999999;
const GRID_SIZE     = 6;
const TOTAL_PLOTS   = GRID_SIZE * GRID_SIZE;
const PLOTS_UNLOCKED= [12,18,24,30,36,36,36,36,36];

// ── Weather definitions ───────────────────────────────────────────────────────
const WEATHERS = {
  sunny:   { name:'晴天',   emoji:'🌞', minDur:120, maxDur:300, waterMult:1.0  },
  cloudy:  { name:'多雲',   emoji:'☁️', minDur:90,  maxDur:180, waterMult:1.15 },
  rainy:   { name:'下雨',   emoji:'🌧️', minDur:60,  maxDur:120, waterMult:2.0, autoWater:25 },
  drought: { name:'乾旱',   emoji:'🌵', minDur:90,  maxDur:180, waterMult:0.55 },
  storm:   { name:'暴風雨', emoji:'⛈️', minDur:45,  maxDur:90,  waterMult:1.3, stormDmg:0.02 },
};
const WEATHER_POOL = ['sunny','sunny','sunny','cloudy','cloudy','rainy','drought','storm'];

let state = { coins:100, exp:0, level:1, selectedSeed:'radish', selectedTool:'plant', plots:[], inventory:{}, log:[], weather:'sunny', weatherNextAt:0, lastAutoWaterAt:0 };

function defaultPlots() {
  return Array.from({length:TOTAL_PLOTS},(_,i)=>({id:i,status:'empty',cropKey:null,plantedAt:null,readyAt:null,watered:false,lastWateredAt:null,wiltStartAt:null,fertilized:false,fertCount:0,overWatered:false,deathCause:null}));
}

// ── Session timer & pause ────────────────────────────────────────────────────
let isPaused = false;
let sessionPlaySecs = 0;
const REST_SECS = 20 * 60; // 20 分鐘

function updateTimer() {
  const el = document.getElementById('session-timer');
  if (!el) return;
  if (sessionPlaySecs >= REST_SECS) {
    el.textContent = '該休息囉！';
    el.className = 'timer-rest';
  } else {
    const m = String(Math.floor(sessionPlaySecs / 60)).padStart(2, '0');
    const s = String(sessionPlaySecs % 60).padStart(2, '0');
    el.textContent = `⏱ ${m}:${s}`;
    el.className = '';
  }
}

function togglePause() {
  isPaused = !isPaused;
  const btn = document.getElementById('pause-btn');
  if (btn) {
    btn.textContent = isPaused ? '▶️' : '⏸';
    btn.setAttribute('aria-pressed', String(isPaused));
    btn.setAttribute('aria-label', isPaused ? '繼續遊戲' : '暫停遊戲');
    btn.title = isPaused ? '繼續' : '暫停';
  }
  document.getElementById('pause-overlay')?.classList.toggle('visible', isPaused);
  if (AudioManager.setBgSuspended) AudioManager.setBgSuspended(isPaused);
}

// ── Player management ────────────────────────────────────────────────────────
const PLAYER_KEY = 'happyFarm_currentPlayer';
function getPlayerName() { return localStorage.getItem(PLAYER_KEY) || ''; }
function setPlayerName(n) { localStorage.setItem(PLAYER_KEY, n.trim()); }
function getSaveKey()     { return 'happyFarm_save_' + (getPlayerName() || '_'); }

function saveState() {
  if (!getPlayerName()) return false;
  const status = document.getElementById('save-status');
  try {
    localStorage.setItem(getSaveKey(), JSON.stringify(state));
    if (status) status.textContent = '已儲存 ' + new Date().toLocaleTimeString('zh-TW', { hour12: false });
    return true;
  } catch {
    if (status) status.textContent = '儲存失敗，請確認瀏覽器允許儲存資料';
    return false;
  }
}
function loadState()  { try { const s=localStorage.getItem(getSaveKey()); if(s) Object.assign(state,JSON.parse(s)); } catch(e){} }
function unlockedPlotCount() { return PLOTS_UNLOCKED[Math.min(state.level-1,PLOTS_UNLOCKED.length-1)]; }
function expToNextLevel()    { return LEVEL_EXP[Math.min(state.level,LEVEL_EXP.length-1)]; }
function addLog(msg) {
  state.log.unshift(msg);
  if (state.log.length>30) state.log.pop();
  renderLog();
  const ann = document.getElementById('action-announcer');
  if (ann) ann.textContent = msg;
}
function now() { return Date.now(); }
function effectiveWaterInterval(cropKey) {
  return CROPS[cropKey].waterInterval * (WEATHERS[state.weather]?.waterMult ?? 1.0) * 1000;
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function renderStats() {
  document.getElementById('coins').textContent    = state.coins;
  document.getElementById('level').textContent    = state.level;
  document.getElementById('exp').textContent      = state.exp;
  document.getElementById('exp-next').textContent = expToNextLevel();
}

function renderSeedShop() {
  const list = document.getElementById('seed-list');
  list.innerHTML = '';
  for (const [key,crop] of Object.entries(CROPS)) {
    const locked = crop.unlockLevel > state.level;
    const selected = state.selectedSeed===key && !locked;
    const card = document.createElement('div');
    card.className = 'seed-card'+(locked?' locked-seed':'')+(selected?' selected':'');
    card.dataset.seed = key;
    card.setAttribute('role', 'button');
    card.tabIndex = locked ? -1 : 0;
    card.setAttribute('aria-disabled', locked ? 'true' : 'false');
    card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    card.setAttribute('aria-label', locked
      ? `${crop.name}，等級 ${crop.unlockLevel} 解鎖，種子 ${crop.seedCost} 金幣`
      : `${crop.name}，種子 ${crop.seedCost} 金幣${selected ? '，已選取' : ''}`);
    card.innerHTML = `<span class="seed-emoji" aria-hidden="true">${crop.emoji}</span><span class="seed-name">${locked?`🔒 等級${crop.unlockLevel}解鎖`:crop.name}</span><span class="seed-cost">🪙${crop.seedCost}</span>`;
    if (!locked) {
      const choose = () => selectSeed(key);
      card.addEventListener('click', choose);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
      });
    }
    list.appendChild(card);
  }
}

function renderFarm() {
  const grid = document.getElementById('farm-grid');
  const unlocked = unlockedPlotCount();
  state.plots.forEach((plot,i) => {
    if (i>=unlocked && plot.status!=='locked') { plot.status='locked'; plot.cropKey=null; }
    else if (i<unlocked && plot.status==='locked') plot.status='empty';
  });
  grid.innerHTML = '';
  state.plots.forEach((plot,i) => {
    const div = document.createElement('div');
    div.className = 'plot '+plot.status+(plot.overWatered?' ow':'');
    div.dataset.id = i;
    let emoji='🟫', label='空地';
    if (plot.status==='locked') { emoji='🔒'; label='未解鎖'; }
    else if (plot.status==='dead') {
      const de = { thirst:'💀', overwater:'🫧', overfertilize:'☠️' };
      const dl = { thirst:'枯死（缺水）', overwater:'溺斃（水太多）', overfertilize:'死亡（肥料中毒）' };
      emoji = de[plot.deathCause] || '💀';
      label = dl[plot.deathCause] || '已枯死';
    }
    else if (plot.cropKey) {
      const crop=CROPS[plot.cropKey];
      if      (plot.status==='planted')  { emoji=crop.emoji; label=crop.name+'（剛種）'; }
      else if (plot.status==='growing')  { emoji=crop.emoji; label=crop.name; }
      else if (plot.status==='watered')  { emoji=crop.emoji; label=plot.overWatered?'⚠️水過多！':crop.name+'💧'; }
      else if (plot.status==='wilting')  { emoji='🥀'; label=crop.name+' 缺水！'; }
      else if (plot.status==='ready')    { emoji=crop.emoji; label='可收穫！'; }
    }
    let progressHTML='';
    if (plot.cropKey && !['ready','empty','locked','dead','wilting'].includes(plot.status)) {
      const pct=growProgress(plot);
      progressHTML=`<div class="plot-progress"><div class="plot-progress-bar" style="width:${pct}%"></div></div>`;
    }
    const fc = plot.fertCount || 0;
    const fertBadge=(fc>0&&!['ready','empty','locked'].includes(plot.status))? `<span class="plot-fertilized-badge">⚗️${fc>1?'×'+fc:''}</span>`:'';
    div.innerHTML=`${fertBadge}<span class="plot-emoji" aria-hidden="true">${emoji}</span><span class="plot-label">${label}</span>${progressHTML}`;
    const toolNames = { plant:'種植', water:'澆水', harvest:'收穫', fertilize:'施肥', remove:'清除' };
    let progressNote = '';
    if (plot.cropKey && !['ready','empty','locked','dead','wilting'].includes(plot.status)) {
      progressNote = `，生長 ${growProgress(plot)}%`;
    }
    div.setAttribute('role', 'button');
    div.tabIndex = plot.status === 'locked' ? -1 : 0;
    div.setAttribute('aria-disabled', plot.status === 'locked' ? 'true' : 'false');
    div.setAttribute('aria-label', `第 ${i + 1} 格，${label}${progressNote}。目前工具：${toolNames[state.selectedTool] || ''}`);
    const fx = plotFx.get(i);
    if (fx && fx.until > Date.now()) div.classList.add('fx', 'fx-' + fx.kind);
    else plotFx.delete(i);
    div.addEventListener('click',()=>handlePlotClick(i));
    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePlotClick(i); }
    });
    grid.appendChild(div);
  });
}

function growProgress(plot) {
  if (!plot.plantedAt||!plot.readyAt) return 0;
  return Math.round((Math.min(now()-plot.plantedAt, plot.readyAt-plot.plantedAt))/(plot.readyAt-plot.plantedAt)*100);
}

function renderInventory() {
  const inv=document.getElementById('inventory');
  inv.innerHTML='';
  let hasItems=false;
  for (const [key,count] of Object.entries(state.inventory)) {
    if (count<=0) continue;
    hasItems=true;
    const crop=CROPS[key], item=document.createElement('div');
    item.className='inv-item';
    item.innerHTML=`<span class="inv-emoji">${crop.emoji}</span><span class="inv-count">x${count}</span><span class="inv-value">🪙${crop.sellPrice}</span>`;
    inv.appendChild(item);
  }
  if (!hasItems) inv.innerHTML='<span class="inv-empty">倉庫空空如也</span>';
}

function renderLog() {
  const ul=document.getElementById('log-list');
  ul.innerHTML='';
  state.log.slice(0,15).forEach(msg=>{ const li=document.createElement('li'); li.textContent=msg; ul.appendChild(li); });
}

function renderWeather() {
  const w = WEATHERS[state.weather] || WEATHERS.sunny;
  const el = document.getElementById('weather-display');
  document.body.dataset.weather = state.weather || 'sunny';
  if (!el) return;
  const hints = {
    sunny: '晴天，作物照常生長',
    cloudy: '多雲，澆水間隔稍長',
    rainy: '下雨，作物會自動澆到水',
    drought: '乾旱，作物更快缺水',
    storm: '暴風雨，作物可能受損',
  };
  el.textContent = `${w.emoji} ${w.name}`;
  el.className = `weather-${state.weather}`;
  el.title = hints[state.weather] || w.name;
  el.setAttribute('aria-label', `目前天氣：${w.name}。${hints[state.weather] || ''}`);
}

function renderPlayer() {
  const btn = document.getElementById('player-btn');
  if (!btn) return;
  const name = getPlayerName();
  btn.textContent = name ? `👤 ${name}` : '👤 ?';
  btn.setAttribute('aria-label', name ? `目前玩家 ${name}，切換玩家` : '設定玩家名稱');
}

function renderLeaderboard() {
  const el = document.getElementById('leaderboard-list');
  if (!el) return;
  const players = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith('happyFarm_save_')) continue;
    try {
      const d = JSON.parse(localStorage.getItem(key));
      const lv = d.level || 1, coins = d.coins || 0;
      players.push({ name: key.replace('happyFarm_save_', ''), level: lv, coins, score: lv * 10000 + coins });
    } catch(e) {}
  }
  players.sort((a, b) => b.score - a.score);
  const medals = ['🥇','🥈','🥉'];
  const me = getPlayerName();
  el.innerHTML = '';
  if (!players.length) { el.innerHTML = '<li class="lb-empty">尚無記錄</li>'; return; }
  players.slice(0, 10).forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'lb-item' + (p.name === me ? ' lb-me' : '');
    if (p.name === me) li.setAttribute('aria-current', 'true');
    const rank = document.createElement('span');
    rank.className = 'lb-rank';
    rank.textContent = medals[i] || String(i + 1);
    const nameEl = document.createElement('span');
    nameEl.className = 'lb-name';
    nameEl.textContent = p.name;
    const score = document.createElement('span');
    score.className = 'lb-score';
    score.textContent = `Lv${p.level} 🪙${p.coins.toLocaleString()}`;
    li.append(rank, nameEl, score);
    el.appendChild(li);
  });
}

function render() { renderStats(); renderSeedShop(); renderFarm(); renderInventory(); renderWeather(); renderPlayer(); renderLeaderboard(); }

// ── Actions ───────────────────────────────────────────────────────────────────
function selectSeed(key) {
  state.selectedSeed=key;
  renderSeedShop();
  document.querySelector(`.seed-card[data-seed="${key}"]`)?.focus();
}
function selectTool(tool) {
  state.selectedTool=tool;
  document.querySelectorAll('.tool-btn').forEach(btn => {
    const on = btn.dataset.tool===tool;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

const plotFx = new Map();

function showActionFeedback(idx, fb) {
  if (!fb) return;
  plotFx.set(idx, { kind: fb.kind, until: Date.now() + 880 });
  const plotEl = document.querySelector(`#farm-grid .plot[data-id="${idx}"]`);
  if (plotEl) plotEl.classList.add('fx', 'fx-' + fb.kind);
  const layer = document.getElementById('fx-layer');
  const section = document.getElementById('farm-section');
  if (!plotEl || !layer || !section) return;
  const pr = plotEl.getBoundingClientRect();
  const sr = section.getBoundingClientRect();
  const el = document.createElement('span');
  el.className = 'action-floater fx-' + fb.kind;
  el.textContent = fb.text;
  el.style.left = (pr.left - sr.left + pr.width / 2) + 'px';
  el.style.top = (pr.top - sr.top + pr.height * 0.16) + 'px';
  layer.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function handlePlotClick(idx) {
  if (isPaused) { addLog('⏸ 遊戲暫停中'); return; }
  const plot=state.plots[idx];
  if (plot.status==='locked') { showModal('🔒 尚未解鎖','升級以解鎖更多農地！'); return; }
  let fb = null;
  switch(state.selectedTool) {
    case 'plant':     fb = doPlant(plot);     break;
    case 'water':     fb = doWater(plot);     break;
    case 'harvest':   fb = doHarvest(plot);   break;
    case 'remove':    fb = doRemove(plot);    break;
    case 'fertilize': fb = doFertilize(plot); break;
  }
  saveState(); render();
  if (fb) showActionFeedback(idx, fb);
}

function doPlant(plot) {
  if (plot.status==='dead')    { addLog('⚠️ 請先清除枯死的植物再種植'); return; }
  if (plot.status!=='empty')   { addLog('⚠️ 這塊地已有作物'); return; }
  const cropKey=state.selectedSeed, crop=CROPS[cropKey];
  if (crop.unlockLevel>state.level) { addLog(`⚠️ 等級不足，需要等級 ${crop.unlockLevel}`); return; }
  if (state.coins<crop.seedCost)    { addLog(`⚠️ 金幣不足！需要 ${crop.seedCost} 金幣`); showModal('金幣不足',`購買 ${crop.name} 種子需要 🪙${crop.seedCost}，你只有 🪙${state.coins}。`); return; }
  state.coins-=crop.seedCost;
  const t=now();
  Object.assign(plot,{status:'planted',cropKey,plantedAt:t,readyAt:t+crop.growTime*1000,watered:false,lastWateredAt:t,wiltStartAt:null,fertilized:false,fertCount:0,overWatered:false,deathCause:null});
  addLog(`🌱 種下了 ${crop.name}，記得每 ${crop.waterInterval} 秒澆水！`);
  AudioManager.sfxPlant();
  return { kind:'plant', text:'🌱 種下' };
}

function doWater(plot) {
  if (plot.status==='empty'||plot.status==='locked') { addLog('⚠️ 這裡沒有可澆水的作物'); return; }
  if (plot.status==='dead')  { addLog('⚠️ 植物已枯死，澆水也沒用了，請清除後重新種植'); return; }
  if (plot.status==='ready') { addLog('✅ 這個作物已成熟，請收穫！'); return; }
  const crop=CROPS[plot.cropKey], t=now(), wasWilting=plot.status==='wilting';
  // 過度澆水檢查：在最小間隔（25% waterInterval）內再澆水為過量
  if (!wasWilting && plot.lastWateredAt) {
    const minGap = crop.waterInterval * 0.25 * 1000;
    if (t - plot.lastWateredAt < minGap) {
      if (plot.overWatered) {
        plot.status='dead'; plot.deathCause='overwater';
        addLog(`🫧 ${crop.emoji} ${crop.name} 溺斃了！根部腐爛，澆水過多所致！`);
        AudioManager.sfxDead();
        return { kind:'water', text:'🫧 太多水' };
      }
      plot.overWatered=true;
      addLog(`⚠️ ${crop.name} 水分已足夠！再澆水植物會溺斃！`);
      return { kind:'water', text:'💧 夠了' };
    }
  }
  plot.lastWateredAt=t; plot.watered=true; plot.wiltStartAt=null; plot.overWatered=false;
  plot.readyAt=Math.max(t+1000, plot.readyAt-crop.waterBonus*1000);
  if (wasWilting) { plot.status=growProgress(plot)>40?'growing':'planted'; addLog(`💧 澆水！${crop.name} 從枯萎中恢復，繼續生長`); }
  else            { plot.status='watered'; addLog(`💧 澆水！${crop.name} 加速成長 ${crop.waterBonus} 秒`); }
  AudioManager.sfxWater();
  return { kind:'water', text:'💧 澆水' };
}

function doHarvest(plot) {
  if (plot.status==='dead')    { addLog('⚠️ 植物已枯死，請改用清除工具'); return; }
  if (plot.status!=='ready')   { addLog(plot.cropKey?'⏳ 作物還沒成熟，請耐心等待':'⚠️ 這裡沒有作物可收穫'); return; }
  const crop=CROPS[plot.cropKey];
  state.inventory[plot.cropKey]=(state.inventory[plot.cropKey]||0)+1;
  gainExp(crop.expGain);
  addLog(`🌾 收穫了 ${crop.emoji} ${crop.name}！獲得 ${crop.expGain} 經驗`);
  AudioManager.sfxHarvest();
  resetPlot(plot);
  return { kind:'harvest', text:'🌾 收穫' };
}

function doRemove(plot) {
  if (plot.status==='empty') { addLog('⚠️ 這塊地是空的'); return; }
  addLog(plot.cropKey?`🗑️ 清除了 ${CROPS[plot.cropKey].name}`:'🗑️ 清除了枯死的植物');
  AudioManager.sfxRemove();
  resetPlot(plot);
  return { kind:'clear', text:'🗑️ 清除' };
}

function doFertilize(plot) {
  if (plot.status==='empty'||plot.status==='locked') { addLog('⚠️ 這裡沒有作物可施肥'); return; }
  if (plot.status==='dead')    { addLog('⚠️ 植物已枯死，無法施肥'); return; }
  if (plot.status==='ready')   { addLog('✅ 作物已成熟，不需要施肥'); return; }
  if (plot.status==='wilting') { addLog('⚠️ 植物正在枯萎，請先澆水再施肥'); return; }
  const crop=CROPS[plot.cropKey];
  const fc = plot.fertCount || 0;
  // 第3次施肥 → 肥料中毒死亡
  if (fc >= 2) {
    const cost = Math.floor(crop.fertilizerCost * 3);
    if (state.coins < cost) { showModal('金幣不足',`施肥 ${crop.name} 需要 🪙${cost}，你只有 🪙${state.coins}。`); return; }
    state.coins -= cost;
    plot.status='dead'; plot.deathCause='overfertilize';
    addLog(`☠️ 施肥過量！${crop.emoji} ${crop.name} 肥料中毒死亡！（第3次施肥）`);
    AudioManager.sfxDead();
    return { kind:'fertilize', text:'☠️ 過量' };
  }
  const cost = Math.floor(crop.fertilizerCost * (fc === 0 ? 1 : 2));
  if (state.coins < cost) { showModal('金幣不足',`施肥 ${crop.name} 需要 🪙${cost}，你只有 🪙${state.coins}。`); return; }
  state.coins -= cost;
  const reduction = fc === 0 ? 0.4 : 0.2;
  const remaining = plot.readyAt - now();
  plot.readyAt = Math.max(now()+1000, plot.readyAt - Math.floor(remaining * reduction));
  plot.fertCount = fc + 1;
  plot.fertilized = true;
  addLog(`⚗️ 施肥（第${plot.fertCount}次）！${crop.name} 縮短 ${Math.round(reduction*100)}% 時間，🪙${cost}${fc===1?' ⚠️ 再施肥一次會中毒！':''}`);
  AudioManager.sfxFertilize();
  return { kind:'fertilize', text:'⚗️ 施肥' };
}

function resetPlot(plot) {
  Object.assign(plot,{status:'empty',cropKey:null,plantedAt:null,readyAt:null,watered:false,lastWateredAt:null,wiltStartAt:null,fertilized:false,fertCount:0,overWatered:false,deathCause:null});
}

function gainExp(amount) {
  state.exp = Math.min(state.exp + amount, MAX_VAL);
  const needed=expToNextLevel();
  if (state.exp>=needed && state.level<LEVEL_EXP.length-1) {
    state.exp-=needed; state.level+=1;
    const bonus = Math.min(state.level * 500, MAX_VAL);
    state.coins = Math.min(state.coins + bonus, MAX_VAL);
    addLog(`⭐ 升級！達到等級 ${state.level}，獲得 🪙${bonus} 金幣`);
    AudioManager.sfxLevelUp();
    showModal(`🎉 升級了！`,`恭喜升到 ⭐ 等級 ${state.level}！\n解鎖了更多農地，並獲得 🪙${bonus} 金幣獎勵！`);
  }
}

function sellAll() {
  let total=0, sold=[];
  for (const [key,count] of Object.entries(state.inventory)) {
    if (count<=0) continue;
    const crop=CROPS[key]; total+=crop.sellPrice*count; sold.push(`${crop.emoji}${crop.name} x${count}`); state.inventory[key]=0;
  }
  if (total===0) { addLog('⚠️ 倉庫是空的，沒有東西可以賣'); return; }
  state.coins = Math.min(state.coins + total, MAX_VAL);
  addLog(`💰 賣出 ${sold.join('、')}，獲得 🪙${total}`);
  AudioManager.sfxSell();
  saveState(); render(); renderLeaderboard();
}

// ── Weather Tick ──────────────────────────────────────────────────────────────
function weatherTick() {
  const t = now();
  if (t < state.weatherNextAt) return;
  let next = WEATHER_POOL[Math.floor(Math.random() * WEATHER_POOL.length)];
  if (next === state.weather) next = WEATHER_POOL[Math.floor(Math.random() * WEATHER_POOL.length)];
  state.weather = next;
  const w = WEATHERS[next];
  state.weatherNextAt = t + (w.minDur + Math.random() * (w.maxDur - w.minDur)) * 1000;
  const msgs = {
    sunny:   '🌞 天氣放晴，陽光普照！',
    cloudy:  '☁️ 天空多雲，涼爽宜人',
    rainy:   '🌧️ 開始下雨了！作物將自動獲得澆水',
    drought: '🌵 乾旱來襲！作物需要更頻繁地澆水！',
    storm:   '⛈️ 暴風雨警報！小心作物受損！',
  };
  addLog(msgs[next]);
  renderWeather();
}

// ── Grow Tick ─────────────────────────────────────────────────────────────────
function growTick() {
  if (isPaused) return;
  sessionPlaySecs++;
  updateTimer();
  weatherTick();
  let changed=false;
  const t=now();

  // Rain: auto-water all growing plots
  if (state.weather === 'rainy' && t - (state.lastAutoWaterAt || 0) >= WEATHERS.rainy.autoWater * 1000) {
    state.lastAutoWaterAt = t;
    let anyWatered = false;
    state.plots.forEach(p => {
      if (!p.cropKey || ['ready','empty','locked','dead'].includes(p.status)) return;
      p.lastWateredAt = t; p.watered = true; p.wiltStartAt = null;
      if (p.status === 'wilting') p.status = growProgress(p) > 40 ? 'growing' : 'planted';
      anyWatered = true;
    });
    if (anyWatered) { addLog('🌧️ 雨水滋潤農場，所有作物都澆到水了！'); changed = true; }
  }

  state.plots.forEach(plot => {
    if (!plot.cropKey) return;
    if (['ready','empty','locked'].includes(plot.status)) return;
    const crop=CROPS[plot.cropKey];
    if (plot.status==='dead') return;
    if (plot.status==='wilting') {
      if (plot.wiltStartAt && t>=plot.wiltStartAt+crop.wiltGracePeriod*1000) {
        plot.status='dead'; plot.deathCause='thirst';
        addLog(`💀 ${crop.emoji} ${crop.name} 枯死了（缺水）！`);
        AudioManager.sfxDead(); changed=true;
      }
      return;
    }
    if (t>=plot.readyAt) { plot.status='ready'; addLog(`✅ ${crop.emoji} ${crop.name} 成熟了，快去收穫！`); changed=true; return; }
    if (plot.lastWateredAt && t >= plot.lastWateredAt + effectiveWaterInterval(plot.cropKey)) {
      plot.status='wilting'; plot.wiltStartAt=t;
      addLog(`🥀 ${crop.emoji} ${crop.name} 開始枯萎，快去澆水！`);
      AudioManager.sfxWilt(); changed=true; return;
    }
    // Storm: small chance to damage each growing plot
    if (state.weather === 'storm' && ['planted','growing','watered'].includes(plot.status)) {
      if (Math.random() < WEATHERS.storm.stormDmg) {
        plot.status = 'wilting'; plot.wiltStartAt = t;
        addLog(`⛈️ 暴風雨！${crop.emoji} ${crop.name} 受損開始枯萎！`);
        AudioManager.sfxWilt(); changed = true; return;
      }
    }
    const newStatus=plot.watered?'watered':(growProgress(plot)>40?'growing':'planted');
    // 過度澆水警告在過了安全時間後自動解除
    if (plot.overWatered && plot.lastWateredAt && t - plot.lastWateredAt >= CROPS[plot.cropKey].waterInterval * 0.5 * 1000) {
      plot.overWatered = false; changed = true;
    }
    if (plot.status!==newStatus) { plot.status=newStatus; changed=true; }
  });
  if (changed) { saveState(); renderFarm(); renderStats(); }
}

// ── Reset Game ────────────────────────────────────────────────────────────────
function resetGame() {
  localStorage.removeItem(getSaveKey());
  Object.assign(state,{coins:100,exp:0,level:1,selectedSeed:'radish',selectedTool:'plant',plots:defaultPlots(),log:[],weather:'sunny',weatherNextAt:now()+60000,lastAutoWaterAt:0});
  Object.keys(CROPS).forEach(k=>{state.inventory[k]=0;});
  selectTool('plant');
  render();
  addLog('🌾 新遊戲開始！選種子開始你的農場之旅！');
}

// ── Modal ─────────────────────────────────────────────────────────────────────
let lastFocus = null;

function showModal(title, body, opts = {}) {
  const overlay = document.getElementById('modal-overlay');
  if (overlay.classList.contains('hidden')) lastFocus = document.activeElement;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent  = body;

  const inp = document.getElementById('modal-input');
  const confirmBtn = document.getElementById('modal-confirm');
  const closeBtn   = document.getElementById('modal-close');

  if (opts.input) {
    inp.value = opts.inputValue || '';
    inp.placeholder = opts.placeholder || '';
    inp.classList.remove('hidden');
    setTimeout(() => inp.focus(), 80);
  } else {
    inp.classList.add('hidden');
  }

  if (opts.onConfirm) {
    confirmBtn.textContent = opts.confirmText || '確認';
    confirmBtn.classList.remove('hidden');
    confirmBtn.onclick = () => { closeModal(); opts.onConfirm(inp.value); };
    inp.onkeydown = (e) => { if (e.key === 'Enter') { closeModal(); opts.onConfirm(inp.value); } };
  } else {
    confirmBtn.classList.add('hidden');
  }

  closeBtn.textContent = opts.closeText || '關閉';
  closeBtn.style.display = opts.hideClose ? 'none' : '';
  overlay.classList.remove('hidden');
  if (!opts.input) setTimeout(() => (opts.onConfirm ? confirmBtn : closeBtn).focus(), 30);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-body').replaceChildren();
  document.getElementById('modal-input').classList.add('hidden');
  document.getElementById('modal-confirm').classList.add('hidden');
  const back = lastFocus;
  lastFocus = null;
  if (back && typeof back.focus === 'function' && document.contains(back)) back.focus();
}

function openSaveManager() {
  const admin = window.farmAdminAuth;
  if (admin?.isAdmin()) {
    showSaveManager();
    return;
  }
  if (!admin) {
    showModal('管理員登入', '暫時無法載入 Google 登入，請重新整理後再試。');
    return;
  }
  showModal('管理員登入', '請使用已授權的 Google 帳號登入，以管理本機玩家存檔。', {
    confirmText: '使用 Google 登入',
    closeText: '取消',
    onConfirm: async () => {
      const button = document.getElementById('manage-saves-btn');
      button.disabled = true;
      try {
        if (await admin.signIn()) showSaveManager();
        else showModal('帳號未獲授權', '請改用教材中心的管理員 Google 帳號登入。');
      } catch {
        showModal('登入未完成', '請允許 Google 登入彈出視窗，然後再試一次。');
      } finally {
        button.disabled = false;
      }
    }
  });
}

function showSaveManager() {
  if (!window.farmAdminAuth?.isAdmin()) return;
  saveState();
  showModal('本機後台管理', '這個瀏覽器的玩家存檔。刪除後無法復原。');
  const list = document.createElement('div');
  list.className = 'save-manager-list';
  const keys = Object.keys(localStorage).filter(key => key.startsWith('happyFarm_save_')).sort();
  keys.forEach(key => {
    const name = key.slice('happyFarm_save_'.length);
    const row = document.createElement('div');
    row.className = 'save-manager-row';
    const details = document.createElement('span');
    details.textContent = name + (name === getPlayerName() ? '（目前玩家）' : '');
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      const summary = document.createElement('small');
      summary.textContent = '等級 ' + (saved.level || 1) + '・金幣 ' + (saved.coins || 0);
      details.appendChild(summary);
    } catch {
      details.append('・存檔無法讀取');
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '刪除';
    remove.setAttribute('aria-label', '刪除玩家 ' + name);
    remove.addEventListener('click', () => {
      showModal('刪除玩家資料', '確定要刪除「' + name + '」的存檔與排行榜資料嗎？刪除後無法復原。', {
        confirmText: '刪除玩家資料',
        closeText: '取消',
        onConfirm: () => {
          if (!window.farmAdminAuth?.isAdmin()) return;
          try {
            const isCurrent = name === getPlayerName();
            localStorage.removeItem(key);
            if (isCurrent) {
              localStorage.removeItem(PLAYER_KEY);
              location.reload();
              return;
            }
            renderLeaderboard();
            showSaveManager();
          } catch {
            showModal('無法刪除', '請確認瀏覽器允許修改儲存資料，然後再試一次。');
          }
        }
      });
    });
    row.append(details, remove);
    list.appendChild(row);
  });
  if (!keys.length) list.textContent = '目前沒有玩家存檔。';
  const logout = document.createElement('button');
  logout.type = 'button';
  logout.id = 'admin-sign-out';
  logout.textContent = '登出 Google';
  logout.addEventListener('click', async () => {
    closeModal();
    try {
      await window.farmAdminAuth.signOut();
    } catch {
      showModal('登出未完成', '請重新整理頁面以結束這次管理員登入。');
    }
  });
  document.getElementById('modal-body').append(list, logout);
}

// ── Player modal ──────────────────────────────────────────────────────────────
function showPlayerModal(required = false) {
  const current = getPlayerName();
  const title = required ? '👋 歡迎來到開心農場！' : '🔄 切換玩家';
  const body  = required
    ? '請輸入你的名稱來儲存進度：'
    : `目前玩家：${current}\n輸入名稱切換（或建立新玩家）：`;
  showModal(title, body, {
    input: true,
    inputValue: required ? '' : '',
    placeholder: '輸入名稱（最多12字）',
    confirmText: '開始遊戲',
    closeText: '取消',
    hideClose: required,
    onConfirm: (raw) => {
      const name = raw.trim();
      if (!name) { showPlayerModal(required); return; }
      saveState();                   // save current player before switching
      setPlayerName(name);
      // reset state then load this player's save
      Object.assign(state,{coins:100,exp:0,level:1,selectedSeed:'radish',selectedTool:'plant',
        plots:defaultPlots(),log:[],weather:'sunny',weatherNextAt:now()+60000,lastAutoWaterAt:0});
      Object.keys(CROPS).forEach(k=>{state.inventory[k]=0;});
      state.plots.forEach(p=>{ p.fertCount=0; p.overWatered=false; p.deathCause=null; });
      loadState();
      selectTool(state.selectedTool || 'plant');
      render();
      addLog(`🌾 歡迎，${name}！繼續你的農場之旅！`);
      maybeShowTutorial();
    },
  });
}

// ── First-visit tutorial ──────────────────────────────────────────────────────
const TUTORIAL_STEPS = [
  {
    title: '歡迎來到開心農場',
    body: '左邊是工具、倉庫和前十名，中間是農地，右邊是種子商店和日誌。先選一種種子（一開始有蘿蔔和番茄），再點「種植」，然後點空地。',
  },
  {
    title: '澆水與收穫',
    body: '作物渴了會枯萎，用「澆水」照顧它。成熟後改選「收穫」，作物會進倉庫。不要在很短的時間裡連續澆水，水太多也會讓植物受傷。',
  },
  {
    title: '賣出、升級、施肥',
    body: '按「賣出全部」換成金幣。經驗累積到 800 會升上等級 2，並解鎖更多農地。施肥能加快生長，但同一株最多兩次。',
  },
  {
    title: '天氣、聲音與休息',
    body: '上方會顯示晴天、多雲、下雨、乾旱或暴風雨。下雨會幫忙澆水，乾旱要更勤快，暴風雨可能讓作物受損。背景音樂預設關閉，教室裡不會突然出聲；需要時再按「音樂」。玩滿 20 分鐘，計時器會提醒休息。',
  },
];

let tutorialIndex = 0;

function tutorialStorageKey() { return 'happyFarm_tutorialSeen_' + getPlayerName(); }
function hasSeenTutorial() { return !!getPlayerName() && localStorage.getItem(tutorialStorageKey()) === '1'; }
function markTutorialSeen() { if (getPlayerName()) localStorage.setItem(tutorialStorageKey(), '1'); }

function renderTutorial() {
  const step = TUTORIAL_STEPS[tutorialIndex];
  document.getElementById('tutorial-title').textContent = step.title;
  document.getElementById('tutorial-body').textContent = step.body;
  document.getElementById('tutorial-count').textContent = `第 ${tutorialIndex + 1} 步，共 ${TUTORIAL_STEPS.length} 步`;
  const prev = document.getElementById('tutorial-prev');
  const next = document.getElementById('tutorial-next');
  prev.disabled = tutorialIndex === 0;
  next.textContent = tutorialIndex === TUTORIAL_STEPS.length - 1 ? '開始玩' : '下一步';
  const dots = document.getElementById('tutorial-dots');
  dots.innerHTML = '';
  TUTORIAL_STEPS.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'tutorial-dot' + (i === tutorialIndex ? ' on' : '');
    dots.appendChild(dot);
  });
}

function openTutorial() {
  tutorialIndex = 0;
  document.getElementById('tutorial-overlay').classList.remove('hidden');
  renderTutorial();
  document.getElementById('tutorial-next').focus();
}

function closeTutorial() {
  markTutorialSeen();
  document.getElementById('tutorial-overlay').classList.add('hidden');
}

function maybeShowTutorial() {
  if (!getPlayerName() || hasSeenTutorial()) return;
  if (!document.getElementById('modal-overlay').classList.contains('hidden')) return;
  openTutorial();
}

function syncAudioButtons() {
  const bg = document.getElementById('bg-toggle');
  const sfx = document.getElementById('sfx-toggle');
  if (!bg || !sfx || typeof AudioManager === 'undefined') return;
  const bgOn = AudioManager.isBgOn();
  const sfxOn = AudioManager.isSfxOn();
  bg.querySelector('.btn-label').textContent = bgOn ? '音樂開' : '音樂關';
  bg.classList.toggle('is-on', bgOn);
  bg.classList.toggle('muted', !bgOn);
  bg.setAttribute('aria-pressed', String(bgOn));
  bg.setAttribute('aria-label', bgOn ? '關閉背景音樂' : '開啟背景音樂');
  sfx.querySelector('.btn-label').textContent = sfxOn ? '音效開' : '音效關';
  sfx.classList.toggle('is-on', sfxOn);
  sfx.classList.toggle('muted', !sfxOn);
  sfx.setAttribute('aria-pressed', String(sfxOn));
  sfx.setAttribute('aria-label', sfxOn ? '關閉音效' : '開啟音效');
}

function syncFullscreenBtn() {
  const fsBtn = document.getElementById('fullscreen-btn');
  if (!fsBtn) return;
  const on = !!document.fullscreenElement;
  fsBtn.textContent = on ? '⊠' : '⛶';
  fsBtn.setAttribute('aria-pressed', String(on));
  fsBtn.setAttribute('aria-label', on ? '退出全螢幕' : '進入全螢幕');
  fsBtn.title = on ? '退出全螢幕' : '全螢幕';
}

function focusableIn(container) {
  return [...container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && !el.classList.contains('hidden') && el.offsetParent !== null);
}

function trapFocus(container, event) {
  if (event.key !== 'Tab') return;
  const dialog = container.querySelector('[role="dialog"]') || container;
  const nodes = focusableIn(dialog);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  loadState();
  if (!state.plots||state.plots.length!==TOTAL_PLOTS) state.plots=defaultPlots();
  state.plots.forEach(plot => {
    if (plot.lastWateredAt===undefined) plot.lastWateredAt=null;
    if (plot.wiltStartAt===undefined)   plot.wiltStartAt=null;
    if (plot.fertilized===undefined)    plot.fertilized=false;
    if (plot.fertCount===undefined)     plot.fertCount = plot.fertilized ? 1 : 0;
    if (plot.overWatered===undefined)   plot.overWatered=false;
    if (plot.deathCause===undefined)    plot.deathCause=null;
  });
  Object.keys(CROPS).forEach(k=>{ if(state.inventory[k]===undefined) state.inventory[k]=0; });
  if (!state.weather)                    state.weather = 'sunny';
  if (!state.weatherNextAt)              state.weatherNextAt = now() + 60000;
  if (state.lastAutoWaterAt===undefined) state.lastAutoWaterAt = 0;

  document.querySelectorAll('.tool-btn').forEach(btn=>btn.addEventListener('click',()=>selectTool(btn.dataset.tool)));
  document.getElementById('sell-all-btn').addEventListener('click', sellAll);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target !== e.currentTarget) return;
    const closeBtn = document.getElementById('modal-close');
    if (closeBtn && closeBtn.style.display === 'none') return;
    closeModal();
  });

  document.getElementById('manage-saves-btn').addEventListener('click', openSaveManager);
  document.getElementById('save-btn').addEventListener('click', () => {
    if (!getPlayerName()) { showPlayerModal(true); return; }
    if (saveState()) addLog('進度已儲存在這個瀏覽器。');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveState();
  });

  document.getElementById('player-btn').addEventListener('click', () => showPlayerModal(false));
  document.getElementById('pause-btn').addEventListener('click', togglePause);
  document.getElementById('help-btn').addEventListener('click', openTutorial);
  document.getElementById('tutorial-skip').addEventListener('click', closeTutorial);
  document.getElementById('tutorial-prev').addEventListener('click', () => {
    if (tutorialIndex === 0) return;
    tutorialIndex -= 1;
    renderTutorial();
  });
  document.getElementById('tutorial-next').addEventListener('click', () => {
    if (tutorialIndex >= TUTORIAL_STEPS.length - 1) { closeTutorial(); return; }
    tutorialIndex += 1;
    renderTutorial();
    document.getElementById('tutorial-next').focus();
  });
  document.getElementById('tutorial-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeTutorial();
  });
  document.addEventListener('keydown', (e) => {
    const tut = document.getElementById('tutorial-overlay');
    if (tut && !tut.classList.contains('hidden')) {
      trapFocus(tut, e);
      if (e.key === 'Escape') { e.preventDefault(); closeTutorial(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); document.getElementById('tutorial-next').click(); }
      if (e.key === 'ArrowLeft' && tutorialIndex > 0) { e.preventDefault(); tutorialIndex -= 1; renderTutorial(); }
      return;
    }
    const modal = document.getElementById('modal-overlay');
    if (modal && !modal.classList.contains('hidden')) {
      trapFocus(modal, e);
      if (e.key === 'Escape') {
        const closeBtn = document.getElementById('modal-close');
        if (closeBtn && closeBtn.style.display !== 'none') closeModal();
      }
    }
  });

  document.getElementById('restart-btn').addEventListener('click', () => {
    showModal('🔄 重玩', `確定要清除 ${getPlayerName()} 的所有進度，重新開始嗎？`, {
      confirmText: '確定重玩',
      closeText: '取消',
      onConfirm: () => resetGame(),
    });
  });

  const fsBtn = document.getElementById('fullscreen-btn');
  if (fsBtn) {
    fsBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });
    document.addEventListener('fullscreenchange', syncFullscreenBtn);
  }

  // Music stays off until chosen. The first gesture only resumes a saved "on".
  document.body.addEventListener('pointerdown', () => AudioManager.start(), { once: true });
  document.getElementById('bg-toggle').addEventListener('click', () => {
    AudioManager.toggleBg();
    syncAudioButtons();
  });
  document.getElementById('sfx-toggle').addEventListener('click', () => {
    AudioManager.toggleSfx();
    syncAudioButtons();
  });

  selectTool(state.selectedTool || 'plant');
  syncAudioButtons();
  render();
  setInterval(growTick, 1000);
  setInterval(saveState, 10000);

  if (!getPlayerName()) {
    showPlayerModal(true);   // 第一次進入：強制輸入名稱
  } else {
    addLog(`🌾 歡迎回來，${getPlayerName()}！繼續你的農場之旅！`);
    maybeShowTutorial();
  }
}

document.addEventListener('DOMContentLoaded', init);
