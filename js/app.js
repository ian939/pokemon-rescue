/* 포켓몬 구조대 — 화면·연출
 * 퍼즐 규칙은 engine.js, 레벨은 data/levels.js, 월드는 worlds.js, 읽어 줄 말은 voice-lines.js.
 * 화면: 처음 → 지도 → 레벨 고르기 → 퍼즐 → 구조 성공 / 도감 / 센터 / 🔒 보호자
 */
"use strict";

const E = window.Engine;
const PK = window.PKDATA;
const { L, EN } = window.VoiceLines;
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const QS = new URLSearchParams(location.search);
const TEST = QS.has("test");
const LV = Object.fromEntries(window.LEVELS.map((l) => [l.no, l]));

// ---------- 저장 ----------
const Store = {
  KEY: "pokerescue_v1",
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(this.KEY) || "null"); } catch (e) { this.data = null; }
    const d = this.data || {};
    this.data = Object.assign({ levels: {}, dex: {}, dexOrder: [], deco: [], seen: {}, last: 1 }, d);
    this.data.settings = Object.assign({ sound: true, voice: true, hintMax: 3, openAll: false, autoSolve: false }, d.settings || {});
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* 저장 공간 없음 */ } },
};
Store.load();

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, TEST ? ms * 0.02 : ms)));

// ---------- 효과음 (WebAudio 칩튠) ----------
const SFX = {
  ctx: null,
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },
  tone(seq, type) {
    if (!Store.data.settings.sound || TEST) return;
    const c = this.ensure();
    if (!c) return;
    let t = c.currentTime;
    for (const [f, d, v] of seq) {
      if (f) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type || "square";
        o.frequency.value = f;
        g.gain.setValueAtTime(v || 0.06, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.connect(g); g.connect(c.destination);
        o.start(t); o.stop(t + d);
      }
      t += d;
    }
  },
  turn() { this.tone([[520, 0.04, 0.05], [780, 0.05, 0.04]], "triangle"); },
  slide() { this.tone([[300, 0.05, 0.05], [420, 0.06, 0.04]], "triangle"); },
  step() { this.tone([[660, 0.04, 0.03]]); },
  link() { this.tone([[784, 0.08], [988, 0.08], [1319, 0.18]], "triangle"); },
  no() { this.tone([[220, 0.1, 0.05]], "sawtooth"); },
  bad() { this.tone([[300, 0.12], [220, 0.22]], "sawtooth"); },
  win() { this.tone([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.12], [784, 0.1], [1047, 0.35]]); },
  pop() { this.tone([[1200, 0.04], [1600, 0.05]], "triangle"); },
};

// ---------- 목소리 (Edge TTS 미리 녹음, 없으면 기기 목소리) ----------
const Voice = {
  el: null,
  token: 0,
  key(s) {
    return String(s).replace(/[\u{1F000}-\u{1FAFF}☀-➿️‍]/gu, "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC")
      .toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9'가-힣]+/g, " ").trim();
  },
  unlock() {
    if (this.el) return;
    this.el = new Audio();
    this.el.preload = "auto";
    // iOS 사파리: 첫 터치 안에서 한 번 재생해 둬야 나중에 녹음이 나온다 (무음 wav)
    this.el.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
    const p = this.el.play();
    if (p && p.catch) p.catch(() => {});
    SFX.ensure();
  },
  stop() {
    this.token++;
    if (this.el) { try { this.el.pause(); } catch (e) { /* */ } }
    if (window.speechSynthesis) speechSynthesis.cancel();
  },
  playOne(text, lang, my) {
    return new Promise((resolve) => {
      if (my !== this.token) return resolve();
      const file = window.VOICE && window.VOICE[this.key(text)];
      const done = () => resolve();
      if (file && this.el) {
        this.el.onended = done;
        this.el.onerror = done;
        this.el.src = "assets/voice/" + file;
        const p = this.el.play();
        if (p && p.catch) p.catch(done);
        setTimeout(done, 9000);
      } else if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.rate = lang === "en-US" ? 0.85 : 1;
        u.onend = done; u.onerror = done;
        speechSynthesis.speak(u);
        setTimeout(done, 6000);
      } else resolve();
    });
  },
  /** 조각을 이어 읽는다. 조각 = 한국어 글자 또는 { en: "..." }. 새 말이 오면 하던 말은 끊는다. */
  speak(pieces) {
    if (!Store.data.settings.voice || TEST) return Promise.resolve();
    this.stop();
    const my = this.token;
    const list = pieces.filter((x) => x != null && (x.en || String(x).trim()));
    return (async () => {
      for (const p of list) {
        if (my !== this.token) return;
        if (p.en) await this.playOne(p.en, "en-US", my);
        else await this.playOne(String(p), "ko-KR", my);
      }
    })();
  },
};
const say = (...pieces) => Voice.speak(pieces);
const en = (text) => ({ en: text });
document.addEventListener("pointerdown", () => Voice.unlock(), { once: true });

// ---------- 포켓몬 ----------
const Poke = {
  name: (n) => PK.names[n - 1],
  types: (n) => PK.types[n - 1].split("·"),
  rar: (n) => PK.rarity[n] || "c",
  img: (n) => `assets/sprites/${n}.png`,
  _pool: {},
  pool(w) {
    if (!this._pool[w.no]) this._pool[w.no] = PK.types.map((t, i) => [i + 1, t.split("·")]).filter(([, ts]) => ts.some((x) => w.types.includes(x))).map(([n]) => n);
    return this._pool[w.no];
  },
  /** 월드 풀에서 희귀도 비율대로 한 마리. last = 월드 마지막 레벨이면 유니크·전설 확정 */
  pick(w, last) {
    const pool = this.pool(w);
    const by = (r) => pool.filter((n) => this.rar(n) === r);
    let rar;
    if (last) rar = Math.random() < 0.35 && by("l").length ? "l" : "u";
    else {
      let x = Math.random() * 100;
      rar = "c";
      for (const [r, p] of Object.entries(window.RARITY_ODDS)) { if (x < p) { rar = r; break; } x -= p; }
    }
    const list = by(rar).length ? by(rar) : pool;
    return list[Math.floor(Math.random() * list.length)];
  },
};
const RAR_CLASS = { c: "rc", r: "rr", u: "ru", l: "rl" };
function rarBadge(n) { const r = Poke.rar(n); return `<span class="rar ${RAR_CLASS[r]}">${window.RARITY_NAME[r]}</span>`; }

// ---------- 레벨 진행 ----------
const worldOf = (no) => window.WORLDS.find((w) => no >= w.from && no <= w.to);
const lvState = (no) => Store.data.levels[LV[no] ? LV[no].id : "L" + no] || {};
function setLv(no, patch) {
  const id = LV[no].id;
  Store.data.levels[id] = Object.assign({}, Store.data.levels[id], patch);
  Store.save();
}
function unlocked(no) {
  if (!LV[no]) return false;
  const w = worldOf(no);
  if (!w || !w.open) return false;
  if (Store.data.settings.openAll || no === 1) return true;
  const p = lvState(no - 1);
  return !!(p.done || p.skipped);
}
function worldUnlocked(w) { return w.open && unlocked(w.from); }
function worldStars(w) {
  let s = 0, d = 0;
  for (let no = w.from; no <= w.to; no++) { const st = lvState(no); s += st.stars || 0; if (st.done) d++; }
  return { stars: s, done: d, total: w.to - w.from + 1 };
}
const lvLabel = (no) => { const w = worldOf(no); return `${w.no}-${no - w.from + 1}`; };

// ---------- 화면 틀 ----------
function show(html, cls) {
  closeLayers();
  const app = $("#app");
  app.className = cls || "";
  app.innerHTML = html;
  app.onclick = null;
  window.onresize = null;
}
function layer(cls, html) {
  const d = document.createElement("div");
  d.className = "layer " + cls;
  d.innerHTML = html;
  document.body.appendChild(d);
  return d;
}
function closeLayers() { $$(".layer").forEach((d) => d.remove()); }
function waitPick(root) {
  return new Promise((resolve) => {
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (b) resolve(b.dataset.v);
    });
  });
}
let toastT = 0;
function toast(msg, ms) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.add("hidden"), ms || 2200);
}

// =====================================================================
// 처음 화면
// =====================================================================
function renderTitle() {
  Voice.stop();
  const cast = Store.data.dexOrder.slice(-5);
  const show5 = cast.length >= 3 ? cast : [1, 7, 10];
  show(`
  <div class="title-screen">
    <div class="title-sky">
      <h1 class="logo"><span>포켓몬 구조대</span><b>포켓몬센터를 찾아라!</b></h1>
      <div class="title-cast">${show5.map((n, k) => `<img src="${Poke.img(n)}" alt="" style="animation-delay:${k * 0.2}s">`).join("")}</div>
    </div>
    <div class="title-menu">
      <button class="btn big primary" data-a="play">▶ 구조하러 가기</button>
      <div class="row">
        <button class="btn big" data-a="dex">📖 도감</button>
        <button class="btn big" data-a="center">🏥 센터</button>
        <button class="btn big" data-a="parent" aria-label="보호자">🔒</button>
      </div>
    </div>
    <div class="ver">v${esc(APP_VERSION)}<span id="updFoot"></span></div>
    ${Update.ver ? `<button class="btn upd primary" data-a="upd">🎁 새 버전으로 바꾸기</button>` : ""}
  </div>`, "screen-title");
  $("#app").onclick = (e) => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    if (a === "play") { say(L.title); renderMap(); }
    if (a === "dex") renderDex();
    if (a === "center") renderCenter();
    if (a === "parent") parentGate();
    if (a === "upd") applyUpdate();
  };
  if (Update.ver && !Update.shown) checkUpdate(true);
  else checkUpdate();
}

// =====================================================================
// 지도 · 레벨 고르기
// =====================================================================
// 지도 그림(worldmap.webp) 위 월드 자리 (%)
const MAP_POS = [[20, 64], [44, 76], [51, 44], [52, 20], [84, 22]];
function renderMap() {
  const W = window.WORLDS;
  show(`
  <div class="map">
    <header class="bar"><button class="btn" data-a="back">◀ 처음</button><h2>🗺 구조 지도</h2><span class="bar-r">⭐ ${W.reduce((s, w) => s + worldStars(w).stars, 0)}</span></header>
    <div class="map-box"><div class="map-art">
      ${W.map((w, k) => {
        const st = worldStars(w), ok = worldUnlocked(w);
        const tag = !w.open ? "곧 열려요" : !ok ? "🔒" : `${st.done}/${st.total}`;
        return `<button class="wnode ${ok ? "" : "locked"} ${w.open ? "" : "soon"}" data-w="${w.no}" style="left:${MAP_POS[k][0]}%;top:${MAP_POS[k][1]}%">
          <span class="wthumb" style="background-image:url(assets/board/region-${w.bg}.webp)">${w.no}</span>
          <b>${esc(w.name)}</b><small>${tag}</small></button>`;
      }).join("")}
    </div></div>
  </div>`, "screen-map");
  $("#app").onclick = (e) => {
    if (e.target.closest("[data-a=back]")) return renderTitle();
    const b = e.target.closest("[data-w]");
    if (!b) return;
    const w = W[+b.dataset.w - 1];
    if (!w.open) { SFX.no(); toast("🚧 " + L.soon); say(L.soon); return; }
    if (!worldUnlocked(w)) { SFX.no(); toast("🔒 " + L.locked); say(L.locked); return; }
    renderLevels(w);
  };
}

function nextPlayable(w) {
  for (let no = w.from; no <= w.to; no++) if (unlocked(no) && !lvState(no).done) return no;
  return 0;
}
async function renderLevels(w) {
  const cur = nextPlayable(w);
  const st = worldStars(w);
  show(`
  <div class="levels" style="--bg:url(../assets/board/region-${w.bg}.webp)">
    <header class="bar"><button class="btn" data-a="back">◀ 지도</button><h2>${w.no}. ${esc(w.name)}</h2><span class="bar-r">⭐ ${st.stars}/${st.total * 3}</span></header>
    <div class="lv-grid">
      ${Array.from({ length: w.to - w.from + 1 }, (_, k) => {
        const no = w.from + k, s = lvState(no), ok = unlocked(no);
        const stars = s.done ? "★".repeat(s.stars || 1) + "☆".repeat(3 - (s.stars || 1)) : s.skipped ? "❓" : "";
        return `<button class="lvbtn ${ok ? "" : "locked"} ${s.done ? "done" : ""} ${s.skipped && !s.done ? "skipped" : ""} ${no === cur ? "cur" : ""}" data-no="${no}">
          <b>${ok ? k + 1 : "🔒"}</b><small>${stars}</small>${k === w.to - w.from ? `<img class="lv-last" src="assets/ui/center-house.png" alt="">` : ""}</button>`;
      }).join("")}
    </div>
  </div>`, "screen-levels");
  $("#app").onclick = (e) => {
    if (e.target.closest("[data-a=back]")) return renderMap();
    const b = e.target.closest("[data-no]");
    if (!b) return;
    const no = +b.dataset.no;
    if (!unlocked(no)) { SFX.no(); toast("🔒 " + L.locked); say(L.locked); return; }
    startLevel(no);
  };
  if (!Store.data.seen[w.no]) {
    Store.data.seen[w.no] = 1; Store.save();
    await rocketScene(L.rocketIntro, L.rocketIntro2);
  }
}

/** 로켓단 연출 (월드 시작·끝) — 퍼즐 규칙과 상관없음 */
function rocketScene(line, line2, extra) {
  const d = layer("modal rocket", `<div class="win-box rocket-box">
    <div class="rocket-cast"><img src="assets/ui/rocket-jessie.png" alt=""><img src="assets/ui/rocket-meowth.png" alt=""><img src="assets/ui/rocket-james.png" alt=""></div>
    <p class="say">▶ ${esc(line)}</p>${line2 ? `<p class="say2">${esc(line2)}</p>` : ""}${extra || ""}
    <button class="btn big primary" data-v="ok">좋아요!</button></div>`);
  say(line, line2);
  return waitPick(d).then(() => d.remove());
}

// =====================================================================
// 퍼즐
// =====================================================================
const G = {};
function startLevel(no) {
  const lv = LV[no], w = worldOf(no);
  Store.data.last = no; Store.save();
  const keepPoke = G.lv && G.lv.no === no && G.poke;
  Object.assign(G, {
    lv, w,
    init: E.makeState(lv),
    state: E.makeState(lv),
    moves: 0,
    hist: [], redo: [],
    ang: {}, prevR: {},
    busy: false,
    hint: 0,
    hintIds: null,
    t0: Date.now(),
    wasWin: false,
    poke: keepPoke || Poke.pick(w, no === w.to),
  });
  G.state.cells.forEach((t) => { if (t && t.sh) { G.ang[t.id] = t.r * 90; G.prevR[t.id] = t.r; } });
  renderGame();
  const name = Poke.name(G.poke);
  if (lv.intro) say(name, L.lost, { r: L.introR, s: L.introS, rs: L.introRS }[lv.intro]);
  else say(name, L.lost);
  if (lv.intro) showFinger(lv.sol[0]);
}

function renderGame() {
  const { lv, w } = G;
  const s = lvState(lv.no);
  show(`
  <div class="game" style="--bg:url(../assets/board/region-${w.bg}.webp)">
    <div class="board-wrap" id="boardWrap"><div class="board" id="board"></div></div>
    <aside class="panel">
      <div class="pan-head"><button class="btn small" data-a="back" aria-label="레벨 고르기">◀</button><b>${lvLabel(lv.no)}</b><span>${esc(w.name)}</span></div>
      <div class="win-box who">
        <img src="${Poke.img(G.poke)}" alt="">
        <div><b>${esc(Poke.name(G.poke))}</b>${rarBadge(G.poke)}<small>길을 잃었어요</small></div>
      </div>
      <div class="win-box moves"><span>움직인 횟수</span><b id="mv">0</b><small>⭐⭐⭐ = ${lv.par}번 안에${s.best ? ` · 최고 ${s.best}번` : ""}</small></div>
      <button id="goBtn" class="btn huge go" data-a="go">출발!</button>
      <div class="tools">
        <button class="btn" data-a="undo" id="undoBtn" aria-label="되돌리기">↩<small>되돌리기</small></button>
        <button class="btn" data-a="redo" id="redoBtn" aria-label="다시 하기">↪<small>다시</small></button>
        <button class="btn" data-a="reset" id="resetBtn" aria-label="처음부터">🔄<small>처음부터</small></button>
        <button class="btn" data-a="hint" id="hintBtn" aria-label="힌트">💡<small>힌트</small></button>
      </div>
      <button class="btn skip hidden" data-a="skip" id="skipBtn">⏭ 다음에 도전</button>
      ${Store.data.settings.autoSolve ? `<button class="btn skip" data-a="auto">🤖 풀어 보기</button>` : ""}
    </aside>
  </div>
  <svg width="0" height="0" style="position:absolute"><defs>
    <pattern id="dirt" patternUnits="userSpaceOnUse" width="40" height="40"><image href="assets/board/lane-dirt.webp" width="40" height="40" preserveAspectRatio="none"/></pattern>
  </defs></svg>`, "screen-game w" + w.no);
  buildBoard();
  window.onresize = () => { if (!G.busy) buildBoard(); };
  $("#app").onclick = (e) => {
    const b = e.target.closest("[data-a]");
    if (!b || b.disabled) return;
    const a = b.dataset.a;
    if (a === "back") { if (!G.busy) { Voice.stop(); renderLevels(G.w); } return; }
    if (G.busy) return;
    if (a === "go") go();
    if (a === "undo") undo();
    if (a === "redo") redo();
    if (a === "reset") reset();
    if (a === "hint") hint();
    if (a === "skip") skipLevel();
    if (a === "auto") autoSolve();
  };
  clearInterval(G.timer);
  G.timer = setInterval(() => {
    if (!$("#skipBtn")) return clearInterval(G.timer);
    if (Date.now() - G.t0 > 180000) $("#skipBtn").classList.remove("hidden");
  }, 5000);
}

// ---------- 보드 그리기 ----------
const ROAD = { N: "M50 50L50 -2", E: "M50 50L102 50", S: "M50 50L50 102", W: "M50 50L-2 50" };
const DIRK = ["N", "E", "S", "W"];
function roadSVG(dirs, cls) {
  const d = dirs.map((k) => ROAD[DIRK[k]]).join("");
  return `<svg class="road ${cls || ""}" viewBox="0 0 100 100" preserveAspectRatio="none"><path class="rd-o" d="${d}"/><path class="rd-i" d="${d}"/><path class="rd-g" d="${d}"/></svg>`;
}
const OB_IMG = { t: "ob-tree", r: "ob-rock", b: "ob-bush" };
function gatePos(n, g) {
  const s = E.SIDE[g.side];
  if (s === 3) return [0, g.at + 1];
  if (s === 1) return [n + 1, g.at + 1];
  if (s === 0) return [g.at + 1, 0];
  return [g.at + 1, n + 1];
}
function buildBoard() {
  const { lv } = G;
  const n = lv.n;
  const wrap = $("#boardWrap"), board = $("#board");
  const S = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight) / (n + 2));
  G.S = S;
  board.style.setProperty("--S", S + "px");
  board.style.width = board.style.height = S * (n + 2) + "px";
  const tiles = G.state.cells.map((t) => {
    if (!t) return "";
    if (t.ob) return `<div class="tile ob" data-id="${t.id}"><img src="assets/board/${OB_IMG[t.ob]}.png" alt=""></div>`;
    const base = t.br ? "bridge" : t.rot || t.sl ? "wood" : "stone";
    const turn = t.br && t.sh === "S" && t.r % 2 ? ` style="transform:rotate(90deg)"` : ""; // 다리 판자를 길 방향으로
    return `<div class="tile path ${base} ${t.rot ? "can-rot" : ""}" data-id="${t.id}">
      <div class="blk"${turn}></div>${roadSVG(E.SHAPES[t.sh])}${t.rot ? `<span class="badge rot">↻</span>` : ""}${t.sl && G.lv.ops === "rs" ? `<span class="badge sl">✋</span>` : ""}<span class="badge arrow"></span></div>`;
  }).join("");
  const sp = gatePos(n, lv.start), gp = gatePos(n, lv.goal);
  const toBoard = (g) => (E.SIDE[g.side] + 2) % 4; // 문에서 판 쪽 방향
  board.innerHTML = `
    <div class="field" style="left:${S}px;top:${S}px;width:${S * n}px;height:${S * n}px"></div>
    <div class="holes"></div>
    <div class="gate start" style="left:${sp[0] * S}px;top:${sp[1] * S}px">${roadSVG([toBoard(lv.start)], "stub")}
      <img class="gp" src="${Poke.img(G.poke)}" alt=""><span class="bubble">?</span></div>
    <div class="gate goal" style="left:${gp[0] * S}px;top:${gp[1] * S}px">${roadSVG([toBoard(lv.goal)], "stub")}
      <img class="house" src="assets/ui/center-house.png" alt=""></div>
    ${tiles}
    <div class="marks"></div>
    <div class="walker hidden"><img src="${Poke.img(G.poke)}" alt=""></div>
    <div class="finger hidden">👆</div>`;
  G.els = {};
  $$(".tile", board).forEach((el) => { G.els[el.dataset.id] = el; });
  for (const id in G.els) G.els[id].style.transition = "none";
  sync();
  requestAnimationFrame(() => { for (const id in G.els) G.els[id].style.transition = ""; });
  bindBoard(board);
}
function cellXY(i) { const n = G.lv.n; return [(i % n) + 1, Math.floor(i / n) + 1]; }

/** 상태 → 화면 (자리 · 방향 · 빛 · 표시 · 버튼) */
function sync() {
  const { state, lv, S } = G;
  const conn = E.connect(state, lv);
  G.conn = conn;
  const lit = new Set(conn.lit);
  const ops = lv.ops;
  state.cells.forEach((t, i) => {
    if (!t) return;
    const el = G.els[t.id];
    const [x, y] = cellXY(i);
    el.style.left = x * S + "px";
    el.style.top = y * S + "px";
    if (!t.sh) return;
    const pr = G.prevR[t.id];
    if (pr !== t.r) {
      const dlt = (((t.r - pr) % 4) + 4) % 4;
      G.ang[t.id] += dlt === 3 ? -90 : dlt * 90;
      G.prevR[t.id] = t.r;
    }
    $(".road", el).style.transform = `rotate(${G.ang[t.id]}deg)`;
    el.classList.toggle("lit", lit.has(i));
    // 밀 수 있는 지금: 빈칸 쪽 화살표
    const tgt = ops.includes("s") ? E.slideTarget(state, i) : -1;
    el.classList.toggle("can-slide", tgt >= 0);
    if (tgt >= 0) { const d = [0, 1, 2, 3].find((k) => E.neighbor(lv.n, i, k) === tgt); $(".badge.arrow", el).dataset.d = d; }
    el.classList.toggle("hint2", !!(G.hintIds && G.hintIds.has(t.id)));
  });
  $(".holes").innerHTML = state.cells.map((t, i) => {
    if (t) return "";
    const [x, y] = cellXY(i);
    return `<div class="hole" style="left:${x * S}px;top:${y * S}px"></div>`;
  }).join("");
  $(".gate.start").classList.toggle("lit", conn.lit.length > 0);
  $(".gate.goal").classList.toggle("lit", conn.win);
  $("#board").classList.toggle("won", conn.win);
  $("#goBtn").classList.toggle("ready", conn.win);
  $("#mv").textContent = G.moves;
  $("#undoBtn").disabled = !G.hist.length;
  $("#redoBtn").disabled = !G.redo.length;
  $("#resetBtn").disabled = G.moves === 0 && !G.hist.length;
  if (conn.win && !G.wasWin) { SFX.link(); say(L.connected); }
  G.wasWin = conn.win;
}

// ---------- 손가락 조작 ----------
function bindBoard(board) {
  let drag = null;
  board.onpointerdown = (e) => {
    if (G.busy || drag) return;
    const el = e.target.closest(".tile");
    if (!el) return;
    const i = G.state.cells.findIndex((t) => t && t.id === el.dataset.id);
    const tgt = G.lv.ops.includes("s") ? E.slideTarget(G.state, i) : -1;
    const d = tgt >= 0 ? [0, 1, 2, 3].find((k) => E.neighbor(G.lv.n, i, k) === tgt) : -1;
    drag = { el, i, tgt, d, x0: e.clientX, y0: e.clientY, moved: false, proj: 0, pid: e.pointerId };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* */ }
  };
  board.onpointermove = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) > 12) drag.moved = true;
    if (drag.moved && drag.tgt >= 0) {
      const p = Math.max(0, Math.min(G.S, dx * E.DX[drag.d] + dy * E.DY[drag.d]));
      drag.proj = p;
      drag.el.classList.add("dragging");
      drag.el.style.transform = `translate(${E.DX[drag.d] * p}px,${E.DY[drag.d] * p}px)`;
    }
  };
  const end = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    if (d.moved && d.tgt >= 0) {
      if (d.proj > G.S * 0.35) { d.el.style.transform = ""; act({ t: "s", i: d.i, to: d.tgt }); requestAnimationFrame(() => d.el.classList.remove("dragging")); }
      else { d.el.classList.remove("dragging"); d.el.style.transform = ""; }
      return;
    }
    if (d.moved) return; // 움직일 수 없는 칸을 문질렀을 뿐
    tap(d.i, d.el);
  };
  board.onpointerup = end;
  board.onpointercancel = (e) => { if (drag) { drag.el.classList.remove("dragging"); drag.el.style.transform = ""; } drag = null; };
}
function tap(i, el) {
  const t = G.state.cells[i], ops = G.lv.ops;
  if (ops.includes("r") && E.canRotate(G.state, i)) return act({ t: "r", i });
  if (ops.includes("s")) {
    const tgt = E.slideTarget(G.state, i);
    if (tgt >= 0) return act({ t: "s", i, to: tgt });
  }
  SFX.no();
  el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
  if (ops === "r") say(t.sh ? L.cantRotate : L.cantMove);
  else say(t.sh && t.sl ? L.notNext : L.cantMove);
}
function act(a) {
  G.hist.push({ state: G.state, moves: G.moves });
  G.redo = [];
  G.state = E.apply(G.state, a);
  G.moves++;
  afterChange();
  if (a.t === "r") SFX.turn(); else SFX.slide();
}
function afterChange() {
  G.hintIds = null;
  hideFinger();
  $(".marks").innerHTML = "";
  sync();
}
function undo() {
  if (!G.hist.length) return;
  G.redo.push({ state: G.state, moves: G.moves });
  const h = G.hist.pop();
  G.state = h.state; G.moves = h.moves;
  afterChange(); SFX.pop();
}
function redo() {
  if (!G.redo.length) return;
  G.hist.push({ state: G.state, moves: G.moves });
  const h = G.redo.pop();
  G.state = h.state; G.moves = h.moves;
  afterChange(); SFX.pop();
}
function reset() {
  if (G.moves === 0 && E.key(G.state) === E.key(G.init)) return;
  G.hist.push({ state: G.state, moves: G.moves });
  G.redo = [];
  G.state = G.init; G.moves = 0;
  afterChange(); SFX.pop();
}

// ---------- 힌트 ----------
function manipulable() {
  const ids = new Set();
  G.state.cells.forEach((t, i) => {
    if (!t || !t.sh) return;
    if (G.lv.ops.includes("r") && t.rot) ids.add(t.id);
    if (G.lv.ops.includes("s") && E.slideTarget(G.state, i) >= 0) ids.add(t.id);
  });
  return ids;
}
function solution() {
  return E.solve(G.state, G.lv, { maxDepth: 14, maxStates: 150000 });
}
/** 풀이의 조작마다 그 순간 만지는 타일 id */
function solutionIds(sol) {
  const ids = new Set();
  let st = G.state;
  for (const a of sol.actions) { ids.add(st.cells[a.i].id); st = E.apply(st, a); }
  return ids;
}
function hint() {
  if (G.conn.win) { say(L.alreadyOk); $("#goBtn").classList.add("ready"); return; }
  G.hint = Math.min(G.hint + 1, Store.data.settings.hintMax);
  if (G.hint >= 3 || G.hint >= Store.data.settings.hintMax) $("#skipBtn").classList.remove("hidden");
  if (G.hint === 1) {
    const ids = manipulable();
    for (const id of ids) { const el = G.els[id]; el.classList.remove("hint1"); void el.offsetWidth; el.classList.add("hint1"); }
    say(L.hint1);
    return;
  }
  const sol = solution();
  if (!sol) { say(L.hintReset); $("#resetBtn").classList.add("hint1"); setTimeout(() => $("#resetBtn") && $("#resetBtn").classList.remove("hint1"), 2500); return; }
  G.hintIds = solutionIds(sol);
  sync();
  if (G.hint === 2) { say(L.hint2); return; }
  showFinger(sol.actions[0]);
  say(L.hint3);
}
function showFinger(a) {
  const f = $(".finger");
  if (!f || !a) return;
  const [x, y] = cellXY(a.i);
  f.style.left = (x + 0.5) * G.S + "px";
  f.style.top = (y + 0.5) * G.S + "px";
  f.className = "finger " + (a.t === "r" ? "tapme" : "dragme");
  if (a.t === "s") {
    const d = [0, 1, 2, 3].find((k) => E.neighbor(G.lv.n, a.i, k) === a.to);
    f.style.setProperty("--fx", E.DX[d] * G.S * 0.8 + "px");
    f.style.setProperty("--fy", E.DY[d] * G.S * 0.8 + "px");
  }
}
function hideFinger() { const f = $(".finger"); if (f) f.className = "finger hidden"; }

// ---------- 출발 ----------
function center(x, y) { return [(x + 0.5) * G.S, (y + 0.5) * G.S]; }
async function go() {
  const { lv } = G;
  const conn = E.connect(G.state, lv);
  G.busy = true;
  hideFinger();
  $(".marks").innerHTML = "";
  $("#app").classList.add("busy");
  const wk = $(".walker"), gate = $(".gate.start");
  const sp = gatePos(lv.n, lv.start), gp = gatePos(lv.n, lv.goal);
  const pts = [sp].concat(conn.path.map(cellXY));
  if (conn.win) pts.push(gp);
  const place = (p, flip) => {
    const [cx, cy] = center(p[0], p[1]);
    wk.style.left = cx + "px"; wk.style.top = cy + "px";
    if (flip != null) wk.classList.toggle("flip", flip);
  };
  wk.style.transition = "none";
  place(sp, false);
  wk.classList.remove("hidden", "gone", "home");
  gate.classList.add("away");
  void wk.offsetWidth;
  wk.style.transition = "";
  if (pts.length === 1) {
    // 첫 칸부터 안 이어짐 — 제자리에서 폴짝
    wk.classList.add("hop");
    markBroken([{ i: conn.startCell, d: E.SIDE[lv.start.side] }]);
    SFX.bad();
    await say(L.noStart);
    await sleep(600);
    return backHome();
  }
  say(en(EN.go));
  await sleep(500);
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
    const d = by < ay ? 0 : bx > ax ? 1 : by > ay ? 2 : 3;
    // 방향 영어(Up!·Right!)는 걸음이 빨라 다 끊겨서 뺐다 (v2026-10-19b 사용자 요청)
    place(pts[k], d === 1 ? true : d === 3 ? false : null);
    SFX.step();
    await sleep(TEST ? 20 : 420);
  }
  if (conn.win) return rescued();
  markBroken(conn.broken);
  SFX.bad();
  await say(L.broken);
  await sleep(500);
  backHome();
}
function markBroken(list) {
  const S = G.S;
  $(".marks").innerHTML = list.map(({ i, d }) => {
    const [x, y] = cellXY(i);
    const cx = (x + 0.5 + E.DX[d] * 0.5) * S, cy = (y + 0.5 + E.DY[d] * 0.5) * S;
    return `<span class="xmark" style="left:${cx}px;top:${cy}px">✕</span>`;
  }).join("");
}
function backHome() {
  const wk = $(".walker");
  wk.classList.add("home");
  setTimeout(() => {
    wk.classList.add("hidden"); wk.classList.remove("home", "hop");
    $(".gate.start").classList.remove("away");
    G.busy = false;
    $("#app").classList.remove("busy");
  }, TEST ? 10 : 450);
}

// ---------- 구조 성공 ----------
async function rescued() {
  const { lv, w, poke } = G;
  $(".walker").classList.add("gone");
  SFX.win();
  await sleep(600);
  const stars = G.moves <= lv.par ? 3 : G.moves <= lv.par + 3 ? 2 : 1;
  const prev = lvState(lv.no);
  setLv(lv.no, { done: true, stars: Math.max(prev.stars || 0, stars), best: Math.min(prev.best || 99, G.moves), skipped: false });
  const dex = Store.data.dex;
  const isNew = !dex[poke];
  dex[poke] = { n: (dex[poke] ? dex[poke].n : 0) + 1, w: w.no, at: dex[poke] ? dex[poke].at : Date.now() };
  if (isNew) Store.data.dexOrder.push(poke);
  const worldDone = lv.no === w.to && !Store.data.deco.includes(w.deco.id);
  if (worldDone) Store.data.deco.push(w.deco.id);
  Store.save();
  const name = Poke.name(poke);
  const d = layer("modal result", `<div class="win-box res">
    <div class="res-scene"><img class="res-poke" src="${Poke.img(poke)}" alt=""><span class="sparkle s1">✦</span><span class="sparkle s2">✧</span><span class="sparkle s3">✦</span></div>
    <h2>${esc(name)} 구조 성공!</h2>
    <div class="stars">${[1, 2, 3].map((k) => `<span class="${k <= stars ? "on" : ""}">★</span>`).join("")}</div>
    <p class="res-moves">${G.moves}번 움직였어요 <small>(⭐⭐⭐ = ${lv.par}번 안에)</small></p>
    <p class="res-dex">${isNew ? `📖 <b>도감에 새 친구!</b> ${rarBadge(poke)}` : `📖 ${esc(name)} 구조 ${dex[poke].n}번째`}</p>
    <div class="row">
      <button class="btn big primary" data-v="next">${worldDone ? "🎉 계속" : LV[lv.no + 1] && unlocked(lv.no + 1) ? "▶ 다음 레벨" : "🗺 지도로"}</button>
      <button class="btn big" data-v="again">🔁 다시</button>
      <button class="btn big" data-v="map">레벨 고르기</button>
    </div></div>`);
  say(en(EN.rescued), name, L.saved, en(EN.stars[stars]), isNew ? L.dexNew : null);
  const v = await waitPick(d);
  d.remove();
  G.busy = false;
  if (v === "again") { G.poke = Poke.pick(w, lv.no === w.to); G.lv = null; return startLevel(lv.no); }
  if (v === "map") return renderLevels(w);
  if (worldDone) await worldClear(w);
  goNext(lv.no);
}
function goNext(no) {
  const w = worldOf(no);
  const nx = LV[no + 1];
  if (nx && unlocked(no + 1)) {
    const nw = worldOf(no + 1);
    if (nw !== w) return renderLevels(nw);
    G.lv = null;
    return startLevel(no + 1);
  }
  renderMap();
}
async function worldClear(w) {
  const nw = window.WORLDS[w.no];
  const extra = `<div class="deco-get"><img src="assets/ui/deco-${w.deco.id}.png" alt=""><p>🏥 센터에 새 장식: <b>${esc(w.deco.name)}</b></p>
    <p>${nw && nw.open ? "🗺 " + esc(nw.name) + " 지역이 열렸어요!" : "🚧 다음 지역은 곧 열려요!"}</p></div>`;
  await rocketScene(L.rocketOut, null, extra);
  say(L.newDeco, nw && nw.open ? L.newWorld : L.soon);
}
function skipLevel() {
  const { lv } = G;
  if (!lvState(lv.no).done) setLv(lv.no, { skipped: true });
  say(L.skip);
  toast("⏭ " + L.skip);
  const w = worldOf(lv.no);
  if (lv.no === w.to && !Store.data.deco.includes(w.deco.id)) {
    // 마지막 레벨을 넘겨도 다음 지역은 열린다 (장식은 깨야 받음)
    return renderMap();
  }
  goNext(lv.no);
}
async function autoSolve() {
  const sol = solution();
  if (!sol) return toast("풀이를 못 찾았어요 — 처음부터 해 보세요");
  G.busy = true;
  for (const a of sol.actions) { G.busy = false; act(a); G.busy = true; await sleep(450); }
  G.busy = false;
  go();
}

// =====================================================================
// 도감
// =====================================================================
function renderDex() {
  const dex = Store.data.dex;
  const W = window.WORLDS.filter((w) => w.open);
  const total = Store.data.dexOrder.length;
  show(`
  <div class="dex">
    <header class="bar"><button class="btn" data-a="back">◀ 처음</button><h2>📖 구조 도감</h2><span class="bar-r">${total}마리</span></header>
    <div class="dex-body">
      ${W.map((w) => {
        const pool = Poke.pool(w);
        const got = pool.filter((n) => dex[n] && dex[n].w === w.no).length;
        const mine = Store.data.dexOrder.filter((n) => dex[n].w === w.no);
        return `<section class="win-box dex-sec"><h3>${w.no}. ${esc(w.name)} <small>${w.types.join("·")} 타입 친구들 · ${got}/${pool.length}</small></h3>
          <div class="dex-grid">${mine.length ? mine.map((n) => `<button class="dcard ${RAR_CLASS[Poke.rar(n)]}" data-n="${n}"><img src="${Poke.img(n)}" alt=""><b>${esc(Poke.name(n))}</b>${dex[n].n > 1 ? `<i>×${dex[n].n}</i>` : ""}</button>`).join("") : `<p class="empty">아직 구조한 친구가 없어요</p>`}</div></section>`;
      }).join("")}
    </div>
  </div>`, "screen-dex");
  $("#app").onclick = (e) => {
    if (e.target.closest("[data-a=back]")) return renderTitle();
    const c = e.target.closest("[data-n]");
    if (!c) return;
    const n = +c.dataset.n, r = dex[n];
    const d = layer("modal", `<div class="win-box dex-card ${RAR_CLASS[Poke.rar(n)]}"><img src="${Poke.img(n)}" alt=""><h2>${esc(Poke.name(n))}</h2>
      <p>${Poke.types(n).map((t) => `<span class="type">${esc(t)}</span>`).join(" ")} ${rarBadge(n)}</p>
      <p>구조 ${r.n}번 · 처음 구조 ${new Date(r.at).toLocaleDateString("ko-KR")}</p><button class="btn big" data-v="ok">닫기</button></div>`);
    say(Poke.name(n));
    waitPick(d).then(() => d.remove());
  };
}

// =====================================================================
// 포켓몬센터
// =====================================================================
// 장식 자리 (%, 그림 아래쪽 가운데 기준) — 바닥 깔개 양쪽 끝
const DECO_POS = { pot: [7, 99], fountain: [92, 99], crystal: [20, 99], snowman: [80, 99], bunting: [50, 70], bench: [66, 99] };
function renderCenter() {
  const list = Store.data.dexOrder.slice(-14);
  show(`
  <div class="center">
    <header class="bar"><button class="btn" data-a="back">◀ 처음</button><h2>🏥 포켓몬센터</h2><span class="bar-r">${Store.data.dexOrder.length}마리</span></header>
    <div class="center-room">
      ${Store.data.deco.map((id) => `<img class="deco" src="assets/ui/deco-${id}.png" alt="" style="left:${DECO_POS[id][0]}%;top:${DECO_POS[id][1]}%">`).join("")}
      ${list.map((n, k) => {
        const x = 26 + ((k * 37) % 48), y = 90 + ((k * 7) % 9); // 바닥 깔개 위
        return `<button class="roam" data-n="${n}" style="left:${x}%;top:${y}%;animation-duration:${6 + (k % 5)}s;animation-delay:-${k * 0.7}s"><img src="${Poke.img(n)}" alt=""></button>`;
      }).join("")}
      ${list.length ? "" : `<div class="win-box center-empty">${esc(L.emptyCenter)}<button class="btn big primary" data-a="play">▶ 구조하러 가기</button></div>`}
    </div>
  </div>`, "screen-center");
  say(list.length ? L.center : L.emptyCenter);
  $("#app").onclick = (e) => {
    if (e.target.closest("[data-a=back]")) return renderTitle();
    if (e.target.closest("[data-a=play]")) return renderMap();
    const r = e.target.closest(".roam");
    if (!r) return;
    r.classList.remove("jump"); void r.offsetWidth; r.classList.add("jump");
    SFX.pop();
    say(Poke.name(+r.dataset.n));
  };
}

// =====================================================================
// 보호자 화면 (두 자리 곱셈 잠금)
// =====================================================================
function parentGate(onOk) {
  const a = 12 + Math.floor(Math.random() * 28), b = 3 + Math.floor(Math.random() * 7);
  let typed = "";
  const d = layer("modal", `<div class="win-box gate-box"><h2>🔒 보호자 화면</h2><p>어른만 열 수 있어요: <b>${a} × ${b} = ?</b></p>
    <div class="typed"><span id="gateT">?</span></div>
    <div class="keypad">${"1234567890".split("").map((k) => `<button class="key" data-v="${k}">${k}</button>`).join("")}<button class="key" data-v="del">⌫</button><button class="key ok" data-v="ok">확인</button></div>
    <button class="btn" data-v="close">닫기</button></div>`);
  d.onclick = (e) => {
    const k = e.target.closest("[data-v]");
    if (!k) return;
    const v = k.dataset.v;
    if (v === "close") return d.remove();
    if (v === "del") typed = typed.slice(0, -1);
    else if (v === "ok") {
      if (+typed === a * b) { d.remove(); (onOk || renderParent)(); return; }
      typed = ""; toast("다시 해 보세요");
    } else if (typed.length < 4) typed += v;
    $("#gateT", d).textContent = typed || "?";
  };
}
function renderParent() {
  const s = Store.data.settings;
  const onoff = (k, label) => `<label class="opt"><span>${label}</span><button class="chip ${s[k] ? "on" : ""}" data-t="${k}">${s[k] ? "켜짐" : "꺼짐"}</button></label>`;
  const W = window.WORLDS.filter((w) => w.open);
  show(`
  <div class="parent">
    <header class="bar"><button class="btn" data-a="back">◀ 처음</button><h2>🔒 보호자</h2><span></span></header>
    <section class="win-box">
      <h3>설정</h3>
      ${onoff("sound", "🔔 효과음")}
      ${onoff("voice", "🗣 목소리 (한국어 안내 + 영어 한마디)")}
      <label class="opt"><span>💡 힌트 최대 단계</span><span>${[1, 2, 3].map((k) => `<button class="chip ${s.hintMax === k ? "on" : ""}" data-h="${k}">${k}단계</button>`).join(" ")}</span></label>
      <p class="note">1 = 움직일 수 있는 조각 · 2 = 바꿔야 할 조각 · 3 = 다음 한 동작</p>
      ${onoff("openAll", "🔓 모든 레벨 열기")}
      ${onoff("autoSolve", "🤖 퍼즐 화면에 '풀어 보기' 버튼")}
    </section>
    <section class="win-box">
      <h3>기록</h3>
      ${W.map((w) => {
        const st = worldStars(w);
        const sk = Array.from({ length: w.to - w.from + 1 }, (_, k) => w.from + k).filter((no) => lvState(no).skipped && !lvState(no).done);
        return `<p>${w.no}. ${esc(w.name)} — 깬 레벨 ${st.done}/${st.total} · ⭐ ${st.stars}/${st.total * 3}${sk.length ? ` · 건너뜀 ${sk.map(lvLabel).join(", ")}` : ""}</p>`;
      }).join("")}
      <p>📖 구조한 포켓몬 ${Store.data.dexOrder.length}마리 · 🏥 장식 ${Store.data.deco.length}개</p>
    </section>
    <section class="win-box danger-zone"><h3>기록 지우기</h3><p>레벨·도감·센터 기록을 모두 지우려면 <b>초기화</b> 라고 써 주세요.</p>
      <input id="wipeIn" placeholder="초기화" autocomplete="off"><button class="btn" data-a="wipe">지우기</button></section>
    <p class="ver dark">v${esc(APP_VERSION)}</p>
  </div>`, "screen-parent");
  $("#app").onclick = (e) => {
    const t = e.target.closest("[data-t]");
    if (t) { s[t.dataset.t] = !s[t.dataset.t]; Store.save(); return renderParent(); }
    const h = e.target.closest("[data-h]");
    if (h) { s.hintMax = +h.dataset.h; Store.save(); return renderParent(); }
    const b = e.target.closest("[data-a]");
    if (!b) return;
    if (b.dataset.a === "back") renderTitle();
    if (b.dataset.a === "wipe") {
      if ($("#wipeIn").value.trim() === "초기화") {
        Object.assign(Store.data, { levels: {}, dex: {}, dexOrder: [], deco: [], seen: {}, last: 1 });
        Store.save(); toast("지웠어요"); renderParent();
      } else toast("'초기화' 라고 정확히 써 주세요");
    }
  };
}

// =====================================================================
// 새 버전 감지 (패드가 옛 HTML 을 붙들고 있는 문제)
// =====================================================================
const Update = { ver: null, last: 0, shown: false };
async function checkUpdate(force) {
  if (location.protocol === "file:" || !navigator.onLine) return;
  const now = Date.now();
  if (!force && now - Update.last < 60000) return;
  Update.last = now;
  try {
    const r = await fetch(location.pathname + "?v=" + now, { cache: "no-store" });
    if (r.ok) {
      const m = /APP_VERSION\s*=\s*"([^"]+)"/.exec(await r.text());
      if (m && m[1] !== APP_VERSION) Update.ver = m[1];
    }
  } catch (e) { return; }
  if (!Update.ver) return;
  const f = $("#updFoot");
  if (f) f.textContent = " → 새 버전 v" + Update.ver;
  // 퍼즐 중에는 방해하지 않는다 — 처음 화면에서만
  if (!$("#app.screen-title")) return;
  if (Update.shown) return;
  Update.shown = true;
  const d = layer("modal", `<div class="win-box"><h2>🎁 ${esc(L.updateNew)}</h2>
    <p>지금 <b>v${esc(APP_VERSION)}</b> 을 쓰고 있어요.<br>새 버전 <b>v${esc(Update.ver)}</b> 으로 바꿔 볼까요?<br><small>구조 기록은 그대로 남아요</small></p>
    <div class="row"><button class="btn big primary" data-v="go">🔄 새 버전으로 바꾸기</button><button class="btn big" data-v="later">나중에</button></div></div>`);
  waitPick(d).then((v) => { d.remove(); if (v === "go") applyUpdate(); else renderTitle(); });
}
function applyUpdate() { location.replace(location.pathname + "?v=" + Date.now()); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
window.addEventListener("online", () => checkUpdate(true));
setInterval(() => checkUpdate(), 10 * 60000);

// ---------- 시험용 손잡이 (?test) ----------
if (TEST) window.__T = { G, Store, Update, E, LV, Poke, startLevel, renderTitle, renderMap, renderLevels, renderDex, renderCenter, renderParent, act, go, tap, hint, undo, redo, reset, skipLevel, unlocked };

renderTitle();
