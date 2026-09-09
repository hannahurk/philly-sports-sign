const TEAMS = [
  { key:'nfl',  sport:'football',   league:'nfl',   id:'phi',    label:'NFL', name:'Eagles'   },
  { key:'mlb',  sport:'baseball',   league:'mlb',   id:'phi',    label:'MLB', name:'Phillies' },
  { key:'nba',  sport:'basketball', league:'nba',   id:'phi',    label:'NBA', name:'76ers'    },
  { key:'nhl',  sport:'hockey',     league:'nhl',   id:'phi',    label:'NHL', name:'Flyers'   },
  { key:'mls',  sport:'soccer',     league:'usa.1', id:'10739',  label:'MLS', name:'Union'    },
  { key:'ncaaf-penn', sport:'football',   league:'college-football',       id:'219', label:'NCAAF', name:'Penn Quakers' },
  { key:'ncaab-penn', sport:'basketball', league:'mens-college-basketball', id:'219', label:'NCAAM', name:'Penn Quakers' },
];

const ROTATE_MS = 9000;

let teamData = [];
let activeIndex = 0;
let rotateTimer = null;
let progressStart = null;
let progressRAF = null;

function api(sport, league, id){
  return `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${id}`;
}

async function fetchTeam(t){
  try{
    const res = await fetch(api(t.sport, t.league, t.id));
    const json = await res.json();
    const team = json.team;
    const record = team.record && team.record.items && team.record.items[0]
      ? team.record.items[0].summary : '';
    const event = (team.nextEvent && team.nextEvent[0]) || null;
    let comp = null, status = null, competitors = null, home=null, away=null, own=null, opp=null;
    if(event){
      comp = event.competitions[0];
      status = comp.status;
      competitors = comp.competitors;
      home = competitors.find(c => c.homeAway === 'home');
      away = competitors.find(c => c.homeAway === 'away');
      if(home && away){
        const homeIsUs = home.team && home.team.id === team.id;
        own = homeIsUs ? home : away;
        opp = homeIsUs ? away : home;
      }
    }
    return {
      key:t.key, label:t.label,
      name: team.displayName || t.name,
      logo: team.logos && team.logos[0] ? team.logos[0].href : '',
      color: team.color ? `#${team.color}` : '#ff2b2b',
      record,
      event, status, home, away, own, opp
    };
  }catch(e){
    return { key:t.key, label:t.label, name:t.name, logo:'', color:'#ff2b2b', record:'', event:null, status:null };
  }
}

function fmtDate(iso){
  if(!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
}

function buildCard(t, idx){
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.idx = idx;

  if(t.comingSoon){
    card.innerHTML = `
      <div class="card-left">
        <div class="logo-wrap" style="box-shadow: inset 0 0 0 2px ${t.color}55;">
          <span class="coming-soon-icon">🏀</span>
        </div>
        <div class="team-meta">
          <div class="league">${t.label}</div>
          <div class="name">${t.name}</div>
          <div class="record">${t.record}</div>
        </div>
      </div>
      <div class="matchup">
        <div class="status-pill coming-soon-pill">COMING SOON</div>
        <div class="game-detail">${t.detail}</div>
      </div>
    `;
    return card;
  }

  const left = document.createElement('div');
  left.className = 'card-left';
  left.innerHTML = `
    <div class="logo-wrap" style="box-shadow: inset 0 0 0 2px ${t.color}55;">
      ${t.logo ? `<img src="${t.logo}" alt="${t.name}">` : ''}
    </div>
    <div class="team-meta">
      <div class="league">${t.label}</div>
      <div class="name">${t.name}</div>
      <div class="record">${t.record ? t.record : ''}</div>
    </div>
  `;

  const right = document.createElement('div');
  right.className = 'matchup';

  if(t.event && t.home && t.away){
    const isLive = t.status && t.status.type && t.status.type.state === 'in';
    const isFinal = t.status && t.status.type && t.status.type.state === 'post';
    const isPreseason = t.event.seasonType && t.event.seasonType.abbreviation === 'pre';
    const pillClass = isLive ? 'status-pill live' : 'status-pill';
    const pillText = isLive ? 'LIVE' : (isFinal ? 'FINAL' : (isPreseason ? 'PRESEASON' : 'UPCOMING'));

    const homeAbbr = (t.home.team && t.home.team.abbreviation) || '';
    const awayAbbr = (t.away.team && t.away.team.abbreviation) || '';
    const homeLogo = (t.home.team && t.home.team.logo) || '';
    const awayLogo = (t.away.team && t.away.team.logo) || '';
    const showScore = (isLive || isFinal) && !!(t.away.score && t.home.score);

    right.innerHTML = `
      <div class="${pillClass}">${pillText}</div>
      <div class="vs-row">
        <div class="vs-team">
          ${awayLogo ? `<img src="${awayLogo}">` : ''}
          <span class="abbr">${awayAbbr}</span>
        </div>
        ${showScore ? `<div class="score">${t.away.score.displayValue}</div>` : ''}
        <div class="vs-sep">${showScore ? '–' : '@'}</div>
        ${showScore ? `<div class="score">${t.home.score.displayValue}</div>` : ''}
        <div class="vs-team">
          <span class="abbr">${homeAbbr}</span>
          ${homeLogo ? `<img src="${homeLogo}">` : ''}
        </div>
      </div>
      <div class="game-detail">${isLive ? (t.status.type.shortDetail || '') : fmtDate(t.event.date)}</div>
    `;
  } else {
    right.innerHTML = `
      <div class="status-pill">SCHEDULE</div>
      <div class="game-detail">No upcoming game data</div>
    `;
  }

  card.appendChild(left);
  card.appendChild(right);
  return card;
}

function renderStage(){
  document.getElementById('loadingMsg').style.display = 'none';
  const cardsContainer = document.getElementById('cardsContainer');
  cardsContainer.innerHTML = '';
  teamData.forEach((t, i) => {
    const card = buildCard(t, i);
    if(i === activeIndex) card.classList.add('active');
    cardsContainer.appendChild(card);
  });

  const dotsEl = document.getElementById('dots');
  dotsEl.innerHTML = '';
  teamData.forEach((t, i) => {
    const d = document.createElement('span');
    if(i === activeIndex) d.classList.add('on');
    dotsEl.appendChild(d);
  });
}

function setActive(i){
  activeIndex = i;
  document.querySelectorAll('.card').forEach(c => {
    c.classList.toggle('active', Number(c.dataset.idx) === i);
  });
  document.querySelectorAll('.dots span').forEach((d, idx) => {
    d.classList.toggle('on', idx === i);
  });
  renderHighFiveCount();
  startProgress();
}

function startProgress(){
  cancelAnimationFrame(progressRAF);
  progressStart = performance.now();
  const fill = document.getElementById('progressFill');
  fill.style.width = '0%';
  if(multiLiveActive) return;
  function tick(now){
    const elapsed = now - progressStart;
    const pct = Math.min(100, (elapsed / ROTATE_MS) * 100);
    fill.style.width = pct + '%';
    if(pct < 100){
      progressRAF = requestAnimationFrame(tick);
    }
  }
  progressRAF = requestAnimationFrame(tick);
}

function startRotation(){
  clearInterval(rotateTimer);
  startProgress();
  if(multiLiveActive) return;
  rotateTimer = setInterval(() => {
    const next = (activeIndex + 1) % teamData.length;
    setActive(next);
  }, ROTATE_MS);
}

let multiLiveActive = false;

function updateLiveBanner(){
  const liveCount = teamData.filter(t =>
    t.status && t.status.type && t.status.type.state === 'in'
  ).length;
  const wasMultiLive = multiLiveActive;
  multiLiveActive = liveCount >= 2;

  const banner = document.getElementById('liveBanner');
  document.getElementById('liveBannerText').textContent =
    `${liveCount} GAMES LIVE NOW`;
  banner.classList.toggle('show', multiLiveActive);

  if(multiLiveActive !== wasMultiLive){
    startRotation();
  }
}

function goRelative(delta){
  const stage = document.getElementById('stage');
  stage.classList.remove('nudge-left', 'nudge-right');
  void stage.offsetWidth;
  stage.classList.add(delta > 0 ? 'nudge-right' : 'nudge-left');

  const next = (activeIndex + delta + teamData.length) % teamData.length;
  setActive(next);

  if(!multiLiveActive){
    clearInterval(rotateTimer);
    rotateTimer = setInterval(() => {
      const n = (activeIndex + 1) % teamData.length;
      setActive(n);
    }, ROTATE_MS);
  }
}

function initGestureLayer(){
  const stage = document.getElementById('stage');
  let dragStart = null;

  stage.addEventListener('pointerdown', e => {
    dragStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  stage.addEventListener('pointerup', e => {
    if(dragStart === null) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const dt = performance.now() - dragStart.t;
    const startPos = { x: dragStart.x, y: dragStart.y };
    dragStart = null;

    if(Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)){
      goRelative(dx < 0 ? 1 : -1);
    } else if(Math.abs(dx) < 20 && Math.abs(dy) < 20 && dt < 400){
      registerHighFive(startPos.x, startPos.y);
    }
  });

  window.addEventListener('keydown', e => {
    if(e.key === 'ArrowRight') goRelative(1);
    if(e.key === 'ArrowLeft') goRelative(-1);
    if(e.key === ' '){ e.preventDefault(); registerHighFive(); }
  });
}

const HIGH_FIVE_KEY = 'phillySignHighFivesByTeam';
let highFiveCounts = {};
try{
  const saved = JSON.parse(localStorage.getItem(HIGH_FIVE_KEY) || '{}');
  if(saved && typeof saved === 'object') highFiveCounts = saved;
}catch(e){}

function renderHighFiveCount(){
  const t = teamData[activeIndex];
  if(!t) return;
  const count = highFiveCounts[t.key] || 0;
  const shortName = (t.name || '').replace(/^Philadelphia\s*/i, '').trim() || t.label;
  document.getElementById('highFiveCount').textContent = count.toLocaleString('en-US');
  document.getElementById('highFiveLabel').textContent = `${shortName.toUpperCase()} HIGH FIVES`;
}

function registerHighFive(x, y){
  const t = teamData[activeIndex];
  if(!t) return;
  highFiveCounts[t.key] = (highFiveCounts[t.key] || 0) + 1;
  try{ localStorage.setItem(HIGH_FIVE_KEY, JSON.stringify(highFiveCounts)); }catch(e){}
  renderHighFiveCount();

  const badge = document.getElementById('highFiveBadge');
  badge.classList.remove('pop');
  void badge.offsetWidth;
  badge.classList.add('pop');

  const stage = document.getElementById('stage');
  const rect = stage.getBoundingClientRect();
  const burst = document.createElement('div');
  burst.className = 'high-five-burst';
  burst.textContent = '🙌';
  burst.style.left = (x !== undefined ? x - rect.left : rect.width / 2) + 'px';
  burst.style.top  = (y !== undefined ? y - rect.top  : rect.height / 2) + 'px';
  stage.appendChild(burst);
  requestAnimationFrame(() => burst.classList.add('play'));
  setTimeout(() => burst.remove(), 750);
}

const WNBA_COMING_SOON = {
  key:'wnba', label:'WNBA', name:'Philadelphia',
  color:'#6f2da8', comingSoon:true,
  record:'Expansion franchise', detail:'First tip-off: 2030 season'
};

let audioCtx = null;
function getAudioCtx(){
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if(audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function unlockAudioOnce(){
  getAudioCtx();
  window.removeEventListener('pointerdown', unlockAudioOnce);
  window.removeEventListener('keydown', unlockAudioOnce);
}
window.addEventListener('pointerdown', unlockAudioOnce);
window.addEventListener('keydown', unlockAudioOnce);

function noiseBurst(ctx, now, duration, filterType, freqFrom, freqTo, peakGain){
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(freqFrom, now);
  filter.frequency.linearRampToValueAtTime(freqTo, now + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + duration * 0.18);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + duration);
}

function playCheer(){
  try{
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    noiseBurst(ctx, now, 2.4, 'bandpass', 500, 1800, 0.9);
    [0, 0.18, 0.42].forEach((t, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime([440, 554, 659][i], now + t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(0.22, now + t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.4);
      osc.connect(g).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.45);
    });
  }catch(e){}
}

function playBoo(){
  try{
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 1.3);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.45, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.5);
    noiseBurst(ctx, now, 1.5, 'lowpass', 350, 150, 0.25);
  }catch(e){}
}

let fireworksRAF = null;
let fireworksBurstTimer = null;
function launchFireworks(durationMs){
  const canvas = document.getElementById('fireworksCanvas');
  const stage = document.getElementById('stage');
  const rect = stage.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx2d = canvas.getContext('2d');
  const colors = ['#ff2b2b', '#f5f6fa', '#4c9aff', '#ffd166', '#2ecc71'];
  let particles = [];

  function spawnBurst(){
    const x = canvas.width * (0.2 + Math.random() * 0.6);
    const y = canvas.height * (0.15 + Math.random() * 0.4);
    const color = colors[Math.floor(Math.random() * colors.length)];
    const count = 46;
    for(let i = 0; i < count; i++){
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
      const speed = 2 + Math.random() * 3.2;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color
      });
    }
  }

  spawnBurst();
  fireworksBurstTimer = setInterval(spawnBurst, 550);

  function tick(){
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.045;
      p.life -= 0.013;
    });
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      ctx2d.globalAlpha = Math.max(p.life, 0);
      ctx2d.fillStyle = p.color;
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx2d.fill();
    });
    ctx2d.globalAlpha = 1;
    fireworksRAF = requestAnimationFrame(tick);
  }
  tick();

  setTimeout(() => clearInterval(fireworksBurstTimer), Math.max(durationMs - 900, 0));
  setTimeout(() => {
    cancelAnimationFrame(fireworksRAF);
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  }, durationMs);
}

let lastScores = {};
function checkScoringEvents(newTeamData){
  newTeamData.forEach(t => {
    if(t.comingSoon || !t.own || !t.opp) return;
    const isLive = t.status && t.status.type && t.status.type.state === 'in';
    if(!isLive){
      delete lastScores[t.key];
      return;
    }
    const ownVal = t.own.score ? Number(t.own.score.value) : NaN;
    const oppVal = t.opp.score ? Number(t.opp.score.value) : NaN;
    if(Number.isNaN(ownVal) || Number.isNaN(oppVal)) return;

    const prev = lastScores[t.key];
    if(prev){
      if(ownVal > prev.own) triggerCheer(t);
      if(oppVal > prev.opp) triggerBoo();
    }
    lastScores[t.key] = { own: ownVal, opp: oppVal };
  });
}

function triggerCheer(t){
  playCheer();
  launchFireworks(3800);
}

function triggerBoo(){
  playBoo();
  const stage = document.getElementById('stage');
  stage.classList.remove('boo-flash', 'boo-shake');
  void stage.offsetWidth;
  stage.classList.add('boo-flash', 'boo-shake');
  setTimeout(() => stage.classList.remove('boo-flash', 'boo-shake'), 800);
}

const LIVE_REFRESH_MS = 15 * 1000;
const IDLE_REFRESH_MS = 5 * 60 * 1000;
let refreshTimer = null;

function scheduleNextRefresh(){
  clearTimeout(refreshTimer);
  const anyLive = teamData.some(t => t.status && t.status.type && t.status.type.state === 'in');
  refreshTimer = setTimeout(loadAll, anyLive ? LIVE_REFRESH_MS : IDLE_REFRESH_MS);
}

async function loadAll(){
  const results = await Promise.all(TEAMS.map(fetchTeam));
  const newTeamData = [...results, WNBA_COMING_SOON];
  checkScoringEvents(newTeamData);
  teamData = newTeamData;
  renderStage();
  renderHighFiveCount();
  updateLiveBanner();
  startRotation();
  scheduleNextRefresh();
}

function tickClock(){
  const now = new Date();
  document.getElementById('clockTime').textContent =
    now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  document.getElementById('clockDate').textContent =
    now.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
}

tickClock();
setInterval(tickClock, 1000 * 30);

initGestureLayer();

function renderQrCode(){
  const el = document.getElementById('qrCode');
  if(!el || typeof qrcode === 'undefined') return;
  const qr = qrcode(0, 'M');
  qr.addData(window.location.href);
  qr.make();
  el.innerHTML = qr.createSvgTag({ scalable: true });
}
renderQrCode();

loadAll();
