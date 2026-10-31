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
    this.data = Object.assign({ levels: {}, dex: {}, dexOrder: [], deco: [], seen: {}, last: 1, memories: {} }, d);
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
    if (!this._pool[w.no]) this._pool[w.no] = PK.types.map((t, i) => [i + 1, t.split("·")])
      .filter(([n, ts]) => ts.some((x) => w.types.includes(x)) || (w.rare && "ul".includes(this.rar(n)))).map(([n]) => n);
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
      for (const [r, p] of Object.entries(w.odds || window.RARITY_ODDS)) { if (x < p) { rar = r; break; } x -= p; }
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
// 지도 그림(worldmap9.webp) 위 월드 자리 (%) — 숲·강·동굴·설산·마을·화산·하늘성·발전소·신전
const MAP_POS = [[12, 68], [35, 78], [26, 50], [17, 17], [44, 18], [55, 49], [71, 17], [85, 69], [90, 26]];
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
// 능력 (월드 4~) — 버튼 그림은 그 포켓몬 도트
const ABIL_INFO = {
  w: { poke: 7, name: "꼬부기", what: "물 다리", fx: "💦" },
  f: { poke: 4, name: "파이리", what: "덤불 태우기", fx: "🔥" },
  v: { poke: 1, name: "이상해씨", what: "덩굴 다리", fx: "🌿" },
};
// ⚡ 스위치 (월드 8~): 노랑 무리 = 피카츄, 파랑 무리 = 라이츄
const SW_INFO = { z: { poke: 25, name: "피카츄" }, y: { poke: 26, name: "라이츄" } };
const INTRO_SAY = { r: "introR", s: "introS", rs: "introRS", w: "introW", f: "introF", v: "introV", k: "introK", m: "introM", m3: "introM3", k2: "introK2", z: "introZ", z2: "introZ2", p: "introP", p2: "introP2" };
function startLevel(no) {
  const lv = LV[no], w = worldOf(no);
  Store.data.last = no; Store.save();
  const gates = E.startsOf(lv);
  const keep = G.lv && G.lv.no === no && G.pokes && G.pokes.length === gates.length;
  Object.assign(G, {
    lv, w, gates,
    init: E.makeState(lv),
    state: E.makeState(lv),
    moves: 0,
    hist: [], redo: [],
    ang: {}, prevR: {}, sig: {},
    busy: false,
    hint: 0,
    hintIds: null,
    aim: null,
    rescued: new Set(),
    t0: Date.now(),
    wasReady: "",
    wasNeed: false,
    pokes: keep ? G.pokes : pickPokes(w, no, gates.length),
  });
  renderGame();
  const names = G.pokes.map(Poke.name);
  const intro = lv.intro ? L[INTRO_SAY[lv.intro]] : null;
  say(...names, L.lost, intro);
  if (lv.intro) introGuide();
}
/** 구조할 포켓몬 — 두 마리면 서로 다르게 */
function pickPokes(w, no, k) {
  const out = [];
  while (out.length < k) {
    const p = Poke.pick(w, no === w.to && out.length === 0);
    if (!out.includes(p) || out.length > 20) out.push(p);
  }
  return out;
}
function introGuide() {
  const lv = G.lv;
  if ("wfv".includes(lv.intro)) {
    // 능력 소개: 버튼이 반짝이고, 손가락은 쓸 자리에
    $(`.abil[data-k="${lv.intro}"]`).classList.add("pulse");
    const a = lv.sol.find((x) => x.t === "a");
    if (a) showFinger({ t: "r", i: a.i });
  } else if (lv.intro === "k" || lv.intro === "k2") {
    $$(".tile .berry").forEach((b) => b.classList.add("pulse"));
    showFinger(lv.sol[0]);
  } else if (lv.intro === "z" || lv.intro === "z2") {
    $$(".abil.sw").forEach((b) => b.classList.add("pulse")); // 스위치 소개: 스위치 버튼이 반짝
    $$(".tile .badge.zap").forEach((b) => b.classList.add("pulse"));
  } else if (lv.intro === "p" || lv.intro === "p2") {
    $$(".tile .portal").forEach((b) => b.classList.add("pulse")); // 워프 소개: 패널이 반짝
    showFinger(lv.sol[0]);
  } else showFinger(lv.sol[0]);
}

function renderGame() {
  const { lv, w } = G;
  const s = lvState(lv.no);
  const ab = G.state.ab;
  const abKeys = E.ABIL.filter((k) => lv.abil && lv.abil[k]);
  const swKeys = ["z", "y"].filter((g) => G.init.cells.some((c) => c && c.sw === g));
  const nBtn = abKeys.length + swKeys.length;
  show(`
  <div class="game" style="--bg:url(../assets/board/region-${w.bg}.webp)">
    <div class="board-wrap" id="boardWrap"><div class="board" id="board"></div></div>
    <aside class="panel">
      <div class="pan-head"><button class="btn small" data-a="back" aria-label="레벨 고르기">◀</button><b>${lvLabel(lv.no)}</b><span>${esc(w.name)}</span></div>
      <div class="win-box who ${G.pokes.length > 1 ? "two" : ""} ${G.pokes.length > 2 ? "three" : ""}">
        ${G.pokes.map((p, k) => `<div class="who-one" data-g="${k}"><img src="${Poke.img(p)}" alt=""><div><b>${esc(Poke.name(p))}</b>${rarBadge(p)}<small>${G.pokes.length > 1 ? "" : "길을 잃었어요"}</small></div></div>`).join("")}
      </div>
      ${nBtn ? `<div class="abils n${nBtn}">${swKeys.map((g) => `<button class="btn abil sw sw-${g}" data-z="${g}" aria-label="${SW_INFO[g].name} 스위치">
        <img src="${Poke.img(SW_INFO[g].poke)}" alt=""><span class="zap-ico">⚡</span></button>`).join("")}${abKeys.map((k) => `<button class="btn abil" data-k="${k}" aria-label="${ABIL_INFO[k].name} ${ABIL_INFO[k].what}">
        <img src="${Poke.img(ABIL_INFO[k].poke)}" alt=""><span>${ABIL_INFO[k].what}</span><i class="cnt">${ab[k]}</i></button>`).join("")}</div>` : ""}
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
    const swb = e.target.closest(".abil.sw");
    if (swb) { if (!G.busy) pressSwitch(swb.dataset.z); return; }
    const ab = e.target.closest(".abil");
    if (ab && !G.busy) return pickAbility(ab.dataset.k);
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
function roadSVG(dirs, cls, rot) {
  const d = dirs.map((k) => ROAD[DIRK[k]]).join("");
  return `<svg class="road ${cls || ""}" viewBox="0 0 100 100" preserveAspectRatio="none"${rot ? ` style="transform:rotate(${rot}deg)"` : ""}><path class="rd-o" d="${d}"/><path class="rd-i" d="${d}"/><path class="rd-g" d="${d}"/></svg>`;
}
const OB_IMG = { t: "ob-tree", r: "ob-rock", b: "ob-bush", l: "ob-lava", v: "ob-basalt", c: "ob-cloud", s: "ob-star", g: "ob-gen", d: "ob-drum", p: "ob-pillar", q: "ob-rainbow" }; // l·v 화산, c·s 하늘성, g·d 발전소, p·q 신전
function gatePos(n, g) {
  const s = E.SIDE[g.side];
  if (s === 3) return [0, g.at + 1];
  if (s === 1) return [n + 1, g.at + 1];
  if (s === 0) return [g.at + 1, 0];
  return [g.at + 1, n + 1];
}
/** 타일 종류가 바뀌었는지 (물 → 다리, 덤불 → 없음) 알아보는 글자 — 방향(r)은 빼고 */
function tileSig(t) {
  if (t.ob) return "o" + t.ob;
  if (t.wa) return "w";
  if (t.pit) return "p";
  return ["P", t.sh, t.rot, t.sl, t.br, t.cp, t.wb, t.vb, t.sw, t.pair].join("");
}
function tileHTML(t) {
  if (t.ob) return { cls: "tile ob", html: `<img src="assets/board/${OB_IMG[t.ob]}.png" alt="">` };
  // 물·낭떠러지: 능력을 쓰면 생길 길을 흐리게 미리 보여 준다 (plan §4 예상 결과 표시)
  if (t.wa) return { cls: "tile water", html: `<div class="blk"></div>${roadSVG(E.SHAPES[t.wa.sh], "ghost", t.wa.r * 90)}` };
  // 낭떠러지 그림은 틈이 세로 — 세로 길이면 틈을 가로로 돌려 길이 틈을 건너가게
  if (t.pit) return { cls: "tile pit", html: `<div class="blk"${t.pit.sh === "S" && t.pit.r % 2 === 0 ? ` style="transform:rotate(90deg)"` : ""}></div>${roadSVG(E.SHAPES[t.pit.sh], "ghost", t.pit.r * 90)}` };
  const base = t.wb ? "bridge" : t.vb ? "vine" : t.br ? "bridge" : t.rot || t.sl ? "wood" : "stone";
  const turn = (t.br || t.wb || t.vb) && t.sh === "S" && t.r % 2 ? ` style="transform:rotate(90deg)"` : ""; // 판자·덩굴을 길 방향으로
  return {
    cls: `tile path ${base} ${t.rot ? "can-rot" : ""} ${t.sw ? "zap-" + t.sw : ""}`,
    html: `<div class="blk"${turn}></div>${t.pair ? `<img class="portal portal-${t.pair}" src="assets/board/portal-tile.png" alt="">` : ""}${roadSVG(E.SHAPES[t.sh])}${t.sw ? `<span class="badge zap ${t.sw}">⚡</span>` : ""}${t.cp ? `<img class="berry" src="assets/items/oran-berry.png" alt="">` : ""}${t.rot ? `<span class="badge rot">↻</span>` : ""}${t.sl && G.lv.ops !== "s" ? `<span class="badge sl">✋</span>` : ""}<span class="badge arrow"></span>`,
  };
}
function buildBoard() {
  const { lv } = G;
  const n = lv.n;
  const wrap = $("#boardWrap"), board = $("#board");
  // 바깥 테두리(문 자리) 두께 R칸: 보통 1칸, 칸이 44px 보다 작아지면 0.6칸으로 줄여 칸을 키운다 (폰 가로 7×7)
  const room = Math.min(wrap.clientWidth, wrap.clientHeight);
  G.R = room / (n + 2) >= 46 ? 1 : 0.6;
  const S = Math.floor(room / (n + 2 * G.R));
  G.S = S;
  board.style.setProperty("--S", S + "px");
  board.style.setProperty("--G", G.R * S + "px");
  board.style.width = board.style.height = Math.round(S * (n + 2 * G.R)) + "px";
  const gp = gatePos(n, lv.goal);
  const toBoard = (g) => (E.SIDE[g.side] + 2) % 4; // 문에서 판 쪽 방향
  board.innerHTML = `
    <div class="field" style="left:${px(1)}px;top:${px(1)}px;width:${S * n}px;height:${S * n}px"></div>
    <div class="holes"></div>
    ${G.gates.map((g, k) => { return `<div class="gate start" data-g="${k}" style="${gateBox(gatePos(n, g))}">${roadSVG([toBoard(g)], "stub")}
      <img class="gp" src="${Poke.img(G.pokes[k])}" alt=""><span class="bubble">?</span></div>`; }).join("")}
    <div class="gate goal" style="${gateBox(gp)}">${roadSVG([toBoard(lv.goal)], "stub")}
      <img class="house" src="assets/ui/center-house.png" alt=""></div>
    <div class="tiles"></div>
    <div class="marks"></div>
    <div class="walker hidden"><img src="${Poke.img(G.pokes[0])}" alt=""></div>
    <div class="finger hidden">👆</div>`;
  G.els = {};
  G.sig = {};
  sync(true);
  requestAnimationFrame(() => { for (const id in G.els) G.els[id].style.transition = ""; });
  bindBoard(board);
}
function cellXY(i) { const n = G.lv.n; return [(i % n) + 1, Math.floor(i / n) + 1]; }
/** 테두리 좌표(0 = 바깥 문 줄, 1..n = 칸, n+1 = 반대편 문 줄) → 왼쪽 위 픽셀 · 가운데 픽셀 */
function px(c) { return c === 0 ? 0 : (G.R + c - 1) * G.S; }
function span(c) { return c === 0 || c === G.lv.n + 1 ? G.R * G.S : G.S; }
function cpx(c) { return px(c) + span(c) / 2; }
/** 문 상자: 테두리 두께만 한 정사각형을 그 칸 줄 가운데에 */
function gateBox(p) {
  const gs = G.R * G.S;
  return `left:${px(p[0]) + (span(p[0]) - gs) / 2}px;top:${px(p[1]) + (span(p[1]) - gs) / 2}px;width:${gs}px;height:${gs}px`;
}
/** 아직 구조 안 한 문 중 지금 출발하면 구조되는 문 */
function readyGates() { return G.gates.map((_, k) => k).filter((k) => !G.rescued.has(k) && G.conns[k].win); }

/** 상태 → 화면 (자리 · 종류 · 방향 · 빛 · 표시 · 버튼) */
function sync(fresh) {
  const { state, lv, S } = G;
  G.conns = G.gates.map((_, k) => E.connect(state, lv, k));
  const lit = new Set();
  G.conns.forEach((c) => c.lit.forEach((i) => lit.add(i)));
  const ops = lv.ops;
  const box = $(".tiles");
  const live = new Set();
  state.cells.forEach((t, i) => {
    if (!t) return;
    live.add(t.id);
    let el = G.els[t.id];
    const sig = tileSig(t);
    if (!el) {
      el = document.createElement("div");
      el.dataset.id = t.id;
      el.style.transition = "none";
      box.appendChild(el);
      G.els[t.id] = el;
    }
    if (G.sig[t.id] !== sig) {
      // 처음 그리거나 종류가 바뀜 (물 → 물 다리 등) — 속을 다시 그리고 방향은 지금 방향으로
      const h = tileHTML(t);
      el.className = h.cls;
      el.innerHTML = h.html;
      G.sig[t.id] = sig;
      if (t.sh) { G.ang[t.id] = t.r * 90; G.prevR[t.id] = t.r; }
    }
    el.style.display = "";
    const [x, y] = cellXY(i);
    el.style.left = px(x) + "px";
    el.style.top = px(y) + "px";
    el.classList.toggle("aim", !!(G.aim && E.canUse(state, G.aim, i)));
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
  for (const id in G.els) if (!live.has(id)) G.els[id].style.display = "none"; // 태운 덤불 (되돌리면 다시 보임)
  $(".holes").innerHTML = state.cells.map((t, i) => {
    if (t) return "";
    const [x, y] = cellXY(i);
    return `<div class="hole" style="left:${px(x)}px;top:${px(y)}px"></div>`;
  }).join("");
  const ready = readyGates();
  G.gates.forEach((_, k) => {
    const gEl = $(`.gate.start[data-g="${k}"]`);
    gEl.classList.toggle("lit", G.conns[k].lit.length > 0);
    gEl.classList.toggle("done", G.rescued.has(k));
    const w = $(`.who-one[data-g="${k}"]`);
    if (w) w.classList.toggle("done", G.rescued.has(k));
  });
  // 센터까지 닿았는데 열매가 빠졌으면 열매를 깜빡여 알려 준다
  const need = G.gates.some((_, k) => !G.rescued.has(k) && G.conns[k].reach && !G.conns[k].win);
  $$(".tile .berry").forEach((b) => b.classList.toggle("need", need));
  $(".gate.goal").classList.toggle("lit", ready.length > 0);
  $("#board").classList.toggle("won", ready.length > 0);
  $("#board").classList.toggle("aiming", !!G.aim);
  $("#goBtn").classList.toggle("ready", ready.length > 0);
  $("#mv").textContent = G.moves;
  $("#undoBtn").disabled = !G.hist.length;
  $("#redoBtn").disabled = !G.redo.length;
  $("#resetBtn").disabled = G.moves === 0 && !G.hist.length;
  $$(".abil[data-k]").forEach((b) => {
    const k = b.dataset.k;
    $(".cnt", b).textContent = state.ab[k];
    b.classList.toggle("on", G.aim === k);
    b.classList.toggle("used", !state.ab[k]);
  });
  const rk = ready.join(",");
  if (!fresh) {
    if (ready.length && rk !== G.wasReady) { SFX.link(); say(L.connected); }
    else if (need && !G.wasNeed) say(L.needItem);
  }
  G.wasReady = rk;
  G.wasNeed = need;
}

// ---------- 손가락 조작 ----------
function bindBoard(board) {
  let drag = null;
  board.onpointerdown = (e) => {
    if (G.busy || drag) return;
    const el = e.target.closest(".tile");
    if (!el) return;
    const i = G.state.cells.findIndex((t) => t && t.id === el.dataset.id);
    if (i < 0) return;
    const tgt = G.lv.ops.includes("s") && !G.aim ? E.slideTarget(G.state, i) : -1;
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
  board.onpointercancel = () => { if (drag) { drag.el.classList.remove("dragging"); drag.el.style.transform = ""; } drag = null; };
}
function tap(i, el) {
  const t = G.state.cells[i], ops = G.lv.ops;
  if (G.aim) {
    const k = G.aim;
    if (E.canUse(G.state, k, i)) return act({ t: "a", k, i });
    G.aim = null; sync(true);
    SFX.no();
    return say(L.abilNo);
  }
  if (ops.includes("r") && E.canRotate(G.state, i)) return act({ t: "r", i });
  if (ops.includes("s")) {
    const tgt = E.slideTarget(G.state, i);
    if (tgt >= 0) return act({ t: "s", i, to: tgt });
  }
  SFX.no();
  el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
  // 능력을 쓸 수 있는 칸을 그냥 누르면: 그 능력 버튼을 알려 준다
  const k = E.ABIL.find((x) => G.state.ab[x] > 0 && ((x === "w" && t.wa) || (x === "f" && t.ob === "b") || (x === "v" && t.pit)));
  if (k) { const b = $(`.abil[data-k="${k}"]`); b.classList.remove("hint1"); void b.offsetWidth; b.classList.add("hint1"); return say(ABIL_INFO[k].name, L.abilFirst); }
  if (t.sw) { const b = $(`.abil.sw[data-z="${t.sw}"]`); b.classList.remove("hint1"); void b.offsetWidth; b.classList.add("hint1"); return say(L.switchFirst); }
  if (ops === "r") say(t.sh ? L.cantRotate : L.cantMove);
  else say(t.sh && t.sl ? L.notNext : L.cantMove);
}
/** ⚡ 스위치: 그 무리 조각이 모두 한꺼번에 90° */
function pressSwitch(g) {
  if (G.aim) { G.aim = null; sync(true); }
  $$(".abil.sw.pulse, .tile .badge.zap.pulse").forEach((b) => b.classList.remove("pulse"));
  act({ t: "z", g });
}
function pickAbility(k) {
  if (!G.state.ab[k]) { SFX.no(); return say(L.abilEmpty); }
  G.aim = G.aim === k ? null : k;
  $$(".abil.pulse").forEach((b) => b.classList.remove("pulse"));
  SFX.pop();
  sync(true);
  if (G.aim) say(ABIL_INFO[k].name, L["abilPick" + k.toUpperCase()]);
}
function act(a) {
  G.hist.push({ state: G.state, moves: G.moves });
  G.redo = [];
  G.state = E.apply(G.state, a);
  G.moves++;
  G.aim = null;
  afterChange();
  if (a.t === "r") SFX.turn();
  else if (a.t === "s") SFX.slide();
  else if (a.t === "z") switchFx(a.g);
  else abilityFx(a);
}
function switchFx(g) {
  SFX.tone([[1400, 0.03, 0.05], [700, 0.03, 0.05], [1600, 0.06, 0.05]], "sawtooth");
  $(".marks").insertAdjacentHTML("beforeend", G.state.cells.map((t, j) => {
    if (!t || t.sw !== g) return "";
    const [cx, cy] = cellXY(j);
    return `<span class="fx fx-z" style="left:${cpx(cx)}px;top:${cpx(cy)}px">⚡</span>`;
  }).join(""));
}
function abilityFx(a) {
  SFX.link();
  const [x, y] = cellXY(a.i);
  const cells = a.k === "v" ? G.state.cells.map((t, j) => (t && t.vb ? j : -1)).filter((j) => j >= 0) : [a.i];
  $(".marks").insertAdjacentHTML("beforeend", cells.map((j) => {
    const [cx, cy] = cellXY(j);
    return `<span class="fx fx-${a.k}" style="left:${cpx(cx)}px;top:${cpx(cy)}px">${ABIL_INFO[a.k].fx}</span>`;
  }).join("") + `<img class="fx-poke" src="${Poke.img(ABIL_INFO[a.k].poke)}" alt="" style="left:${cpx(x)}px;top:${cpx(y)}px">`);
  say(L["abilDone" + a.k.toUpperCase()]);
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
  G.state = h.state; G.moves = h.moves; G.aim = null;
  afterChange(); SFX.pop();
}
function redo() {
  if (!G.redo.length) return;
  G.hist.push({ state: G.state, moves: G.moves });
  const h = G.redo.pop();
  G.state = h.state; G.moves = h.moves; G.aim = null;
  afterChange(); SFX.pop();
}
function reset() {
  if (G.moves === 0 && E.key(G.state) === E.key(G.init)) return;
  G.hist.push({ state: G.state, moves: G.moves });
  G.redo = [];
  G.state = G.init; G.moves = 0; G.aim = null;
  afterChange(); SFX.pop();
}

// ---------- 힌트 ----------
function manipulable() {
  const ids = new Set();
  G.state.cells.forEach((t, i) => {
    if (!t) return;
    if (G.lv.ops.includes("r") && t.sh && t.rot) ids.add(t.id);
    if (G.lv.ops.includes("s") && E.slideTarget(G.state, i) >= 0) ids.add(t.id);
    if (E.ABIL.some((k) => E.canUse(G.state, k, i))) ids.add(t.id);
    if (t.sw) ids.add(t.id);
  });
  return ids;
}
function solution() {
  return storedSolution() || E.solve(G.state, G.lv, { maxDepth: 14, maxStates: 150000, rescued: [...G.rescued] });
}
/** 레벨에 저장된 풀이를 따라가는 중이면(처음 상태 포함) 남은 풀이 — 7×7 어려운 판은 패드에서 BFS 가 무거워서 */
function storedSolution() {
  const lv = G.lv;
  const cur = E.key(G.state) + "|" + [...G.rescued].sort().join();
  let st = G.init;
  const res = new Set();
  for (let m = 0; m <= lv.sol.length; m++) {
    if (E.key(st) + "|" + [...res].sort().join() === cur) return { moves: lv.sol.length - m, actions: lv.sol.slice(m) };
    if (m === lv.sol.length) break;
    st = E.apply(st, lv.sol[m]);
    E.wins(st, lv).forEach((w, k) => { if (w) res.add(k); });
  }
  return null;
}
/** 풀이의 조작마다 그 순간 만지는 타일 id */
function solutionIds(sol) {
  const ids = new Set();
  let st = G.state;
  for (const a of sol.actions) {
    if (a.t === "z") st.cells.forEach((c) => { if (c && c.sw === a.g) ids.add(c.id); });
    else ids.add(st.cells[a.i].id);
    st = E.apply(st, a);
  }
  return ids;
}
function flashAbil(sol) {
  for (const g of new Set(sol.actions.filter((a) => a.t === "z").map((a) => a.g))) {
    const b = $(`.abil.sw[data-z="${g}"]`);
    if (b) { b.classList.remove("hint1"); void b.offsetWidth; b.classList.add("hint1"); }
  }
  for (const k of new Set(sol.actions.filter((a) => a.t === "a").map((a) => a.k))) {
    const b = $(`.abil[data-k="${k}"]`);
    if (b) { b.classList.remove("hint1"); void b.offsetWidth; b.classList.add("hint1"); }
  }
}
function hint() {
  if (readyGates().length) { say(L.alreadyOk); $("#goBtn").classList.add("ready"); return; }
  G.hint = Math.min(G.hint + 1, Store.data.settings.hintMax);
  if (G.hint >= 3 || G.hint >= Store.data.settings.hintMax) $("#skipBtn").classList.remove("hidden");
  if (G.hint === 1) {
    const ids = manipulable();
    for (const id of ids) { const el = G.els[id]; el.classList.remove("hint1"); void el.offsetWidth; el.classList.add("hint1"); }
    $$(".abil:not(.used)").forEach((b) => { b.classList.remove("hint1"); void b.offsetWidth; b.classList.add("hint1"); });
    say(L.hint1);
    return;
  }
  const sol = solution();
  if (!sol) { say(L.hintReset); $("#resetBtn").classList.add("hint1"); setTimeout(() => $("#resetBtn") && $("#resetBtn").classList.remove("hint1"), 2500); return; }
  G.hintIds = solutionIds(sol);
  sync(true);
  flashAbil(sol);
  if (G.hint === 2) { say(L.hint2); return; }
  const a = sol.actions[0];
  if (a.t === "a") { flashAbil({ actions: [a] }); showFinger({ t: "r", i: a.i }); say(ABIL_INFO[a.k].name, L.abilFirst); return; }
  if (a.t === "z") { flashAbil({ actions: [a] }); say(L.switchHint); return; }
  showFinger(a);
  say(L.hint3);
}
function showFinger(a) {
  const f = $(".finger");
  if (!f || !a) return;
  const [x, y] = cellXY(a.i);
  f.style.left = cpx(x) + "px";
  f.style.top = cpx(y) + "px";
  f.className = "finger " + (a.t === "s" ? "dragme" : "tapme");
  if (a.t === "s") {
    const d = [0, 1, 2, 3].find((k) => E.neighbor(G.lv.n, a.i, k) === a.to);
    f.style.setProperty("--fx", E.DX[d] * G.S * 0.8 + "px");
    f.style.setProperty("--fy", E.DY[d] * G.S * 0.8 + "px");
  }
}
function hideFinger() { const f = $(".finger"); if (f) f.className = "finger hidden"; }

// ---------- 출발 ----------
function center(x, y) { return [cpx(x), cpx(y)]; }
/** 문 k 의 포켓몬이 길을 따라 걷는다. ok = 센터까지 들어가나 */
async function walk(k, conn, ok) {
  const { lv } = G;
  const wk = $(".walker"), gate = $(`.gate.start[data-g="${k}"]`);
  $("img", wk).src = Poke.img(G.pokes[k]);
  const sp = gatePos(lv.n, G.gates[k]), gp = gatePos(lv.n, lv.goal);
  const pts = [sp].concat(conn.path.map(cellXY));
  if (ok) pts.push(gp);
  const place = (p, flip) => {
    const [cx, cy] = center(p[0], p[1]);
    wk.style.left = cx + "px"; wk.style.top = cy + "px";
    if (flip != null) wk.classList.toggle("flip", flip);
  };
  wk.style.transition = "none";
  place(sp, false);
  wk.classList.remove("hidden", "gone", "home", "hop");
  gate.classList.add("away");
  void wk.offsetWidth;
  wk.style.transition = "";
  if (pts.length === 1) return false;
  say(en(EN.go));
  await sleep(500);
  const seen = new Set();
  for (let q = 1; q < pts.length; q++) {
    const [ax, ay] = pts[q - 1], [bx, by] = pts[q];
    const d = by < ay ? 0 : bx > ax ? 1 : by > ay ? 2 : 3;
    // 방향 영어(Up!·Right!)는 걸음이 빨라 다 끊겨서 뺐다 (v2026-10-19b 사용자 요청) — 걷는 동안 말은 넣지 않는다
    if (Math.abs(bx - ax) + Math.abs(by - ay) > 1) {
      // 워프 패널: 빙글 사라졌다가 짝 패널에서 나타남
      wk.classList.add("warp");
      SFX.tone([[900, 0.05, 0.05], [1300, 0.05, 0.05], [1800, 0.08, 0.05]], "triangle");
      await sleep(TEST ? 20 : 300);
      wk.style.transition = "none";
      place(pts[q], null);
      void wk.offsetWidth;
      wk.style.transition = "";
      wk.classList.remove("warp");
      await sleep(TEST ? 20 : 300);
      continue;
    }
    place(pts[q], d === 1 ? true : d === 3 ? false : null);
    SFX.step();
    const i = conn.path[q - 1];
    if (i != null && G.state.cells[i] && G.state.cells[i].cp && !seen.has(i)) {
      seen.add(i);
      const [cx, cy] = center(bx, by);
      $(".marks").insertAdjacentHTML("beforeend", `<img class="fx-berry" src="assets/items/oran-berry.png" alt="" style="left:${cx}px;top:${cy}px">`);
      SFX.pop();
    }
    await sleep(TEST ? 20 : 420);
  }
  return true;
}
async function go() {
  const { lv } = G;
  G.busy = true;
  G.aim = null;
  hideFinger();
  $(".marks").innerHTML = "";
  $("#app").classList.add("busy");
  const ready = readyGates();
  if (ready.length) {
    // 이어진 친구부터 한 마리씩 센터로
    for (const k of ready) {
      await walk(k, G.conns[k], true);
      $(".walker").classList.add("gone");
      SFX.win();
      G.rescued.add(k);
      await sleep(600);
      $(".walker").classList.add("hidden");
      sync(true);
    }
    if (G.rescued.size === G.gates.length) return rescued();
    say(en(EN.rescued), L.oneMore);
    G.busy = false;
    $("#app").classList.remove("busy");
    return;
  }
  // 못 가는 경우 — 아직 구조 안 한 첫 친구로 어디까지 갈 수 있는지 보여 준다
  const k = G.gates.findIndex((_, q) => !G.rescued.has(q));
  const conn = G.conns[k];
  const moved = await walk(k, conn, false);
  if (!moved) {
    $(".walker").classList.add("hop");
    markBroken([{ i: conn.startCell, d: E.SIDE[G.gates[k].side] }]);
    SFX.bad();
    await say(L.noStart);
    await sleep(600);
    return backHome(k);
  }
  if (conn.reach) {
    // 센터까지 닿았지만 열매를 안 지나감
    markItems(conn.missing);
    SFX.bad();
    await say(L.needItem);
  } else {
    markBroken(conn.broken);
    SFX.bad();
    await say(L.broken);
  }
  await sleep(500);
  backHome(k);
}
function markBroken(list) {
  const S = G.S;
  $(".marks").innerHTML = list.map(({ i, d }) => {
    const [x, y] = cellXY(i);
    const cx = cpx(x) + E.DX[d] * 0.5 * S, cy = cpx(y) + E.DY[d] * 0.5 * S;
    return `<span class="xmark" style="left:${cx}px;top:${cy}px">✕</span>`;
  }).join("");
}
function markItems(list) {
  $(".marks").innerHTML = list.map((i) => {
    const [x, y] = cellXY(i);
    return `<span class="xmark berry-need" style="left:${cpx(x)}px;top:${cpx(y)}px">!</span>`;
  }).join("");
}
function backHome(k) {
  const wk = $(".walker");
  wk.classList.add("home");
  setTimeout(() => {
    wk.classList.add("hidden"); wk.classList.remove("home", "hop");
    $(`.gate.start[data-g="${k}"]`).classList.remove("away");
    G.busy = false;
    $("#app").classList.remove("busy");
  }, TEST ? 10 : 450);
}

// ---------- 구조 성공 ----------
async function rescued() {
  const { lv, w, pokes } = G;
  await sleep(200);
  const stars = G.moves <= lv.par ? 3 : G.moves <= lv.par + 3 ? 2 : 1;
  const prev = lvState(lv.no);
  setLv(lv.no, { done: true, stars: Math.max(prev.stars || 0, stars), best: Math.min(prev.best || 99, G.moves), skipped: false });
  const dex = Store.data.dex;
  const fresh = [];
  for (const p of pokes) {
    const isNew = !dex[p];
    dex[p] = { n: (dex[p] ? dex[p].n : 0) + 1, w: dex[p] ? dex[p].w : w.no, at: dex[p] ? dex[p].at : Date.now() };
    if (isNew) { Store.data.dexOrder.push(p); fresh.push(p); }
  }
  const worldDone = lv.no === w.to && !Store.data.deco.includes(w.deco.id);
  if (worldDone) Store.data.deco.push(w.deco.id);
  Store.save();
  const names = pokes.map(Poke.name);
  const d = layer("modal result", `<div class="win-box res">
    <div class="res-scene ${pokes.length > 1 ? "two" : ""}">${pokes.map((p) => `<img class="res-poke" src="${Poke.img(p)}" alt="">`).join("")}<span class="sparkle s1">✦</span><span class="sparkle s2">✧</span><span class="sparkle s3">✦</span></div>
    <h2>${names.map(esc).join(" · ")} 구조 성공!</h2>
    <div class="stars">${[1, 2, 3].map((k) => `<span class="${k <= stars ? "on" : ""}">★</span>`).join("")}</div>
    <p class="res-moves">${G.moves}번 움직였어요 <small>(⭐⭐⭐ = ${lv.par}번 안에)</small></p>
    <p class="res-dex">${pokes.map((p) => fresh.includes(p) ? `📖 <b>${esc(Poke.name(p))} 도감에 새 친구!</b> ${rarBadge(p)}` : `📖 ${esc(Poke.name(p))} 구조 ${dex[p].n}번째`).join("<br>")}</p>
    <div class="row">
      <button class="btn big primary" data-v="next">${worldDone ? "🎉 계속" : LV[lv.no + 1] && unlocked(lv.no + 1) ? "▶ 다음 레벨" : "🗺 지도로"}</button>
      <button class="btn big" data-v="again">🔁 다시</button>
      <button class="btn big" data-v="map">레벨 고르기</button>
    </div></div>`);
  say(en(EN.rescued), ...names, L.saved, en(EN.stars[stars]), fresh.length ? L.dexNew : null);
  const v = await waitPick(d);
  d.remove();
  G.busy = false;
  if (v === "again") { G.lv = null; return startLevel(lv.no); }
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
  const last = !nw;
  const extra = `<div class="deco-get"><img src="assets/ui/deco-${w.deco.id}.png" alt=""><p>🏥 센터에 새 장식: <b>${esc(w.deco.name)}</b></p>
    <p>${last ? "🏆 모든 지역의 포켓몬을 구했어요!" : nw.open ? "🗺 " + esc(nw.name) + " 지역이 열렸어요!" : "🚧 다음 지역은 곧 열려요!"}</p></div>`;
  await rocketScene(L.rocketOut, null, extra);
  say(L.newDeco, last ? L.allClear : nw.open ? L.newWorld : L.soon);
  // 월드 3부터: 구조한 친구들이 행복해하는 기념 그림이 도감에 들어간다 (사용자 요청 v2026-10-24a)
  if (MEMORY_BG[w.no]) {
    makeMemory(w);
    await showMemory(w.no, true);
  }
}
function skipLevel() {
  const { lv } = G;
  if (!lvState(lv.no).done) setLv(lv.no, { skipped: true });
  say(L.skip);
  toast("⏭ " + L.skip);
  const w = worldOf(lv.no);
  if (lv.no === w.to && !Store.data.deco.includes(w.deco.id)) {
    // 마지막 레벨을 넘겨도 다음 지역은 열린다 (장식·기념 그림은 깨야 받음)
    return renderMap();
  }
  goNext(lv.no);
}
async function autoSolve() {
  const sol = solution();
  if (!sol) return toast("풀이를 못 찾았어요 — 처음부터 해 보세요");
  G.busy = true;
  for (const a of sol.actions) {
    G.busy = false; act(a); G.busy = true;
    await sleep(450);
    // 두 친구 판: 이어진 친구는 바로 출발
    if (G.gates.length > 1 && readyGates().length && G.rescued.size + readyGates().length < G.gates.length) {
      G.busy = false; await go(); await waitIdle(); G.busy = true;
    }
  }
  G.busy = false;
  go();
}
function waitIdle() { return new Promise((r) => { const t = setInterval(() => { if (!G.busy) { clearInterval(t); r(); } }, 50); }); }

// =====================================================================
// 기념 그림 (월드 3~ 을 끝내면 — 구조한 친구들이 행복해하는 모습)
// 포켓몬은 공식 도트, 배경만 Codex 그림 (포켓몬 캐릭터는 Codex 가 그리지 않는다)
// =====================================================================
const MEMORY_BG = { 3: "party-cave", 4: "party-snow", 5: "party-town", 6: "party-volcano", 7: "party-sky", 8: "party-power", 9: "party-temple" };
function makeMemory(w) {
  const dex = Store.data.dex;
  const mine = Store.data.dexOrder.filter((n) => dex[n] && dex[n].w === w.no);
  const rank = { l: 0, u: 1, r: 2, c: 3 };
  // 전설·유니크 먼저, 그다음 최근에 구조한 친구 — 12마리까지
  const pokes = mine.slice().reverse().sort((a, b) => rank[Poke.rar(a)] - rank[Poke.rar(b)]).slice(0, 12);
  Store.data.memories[w.no] = { pokes, at: Date.now() };
  Store.save();
}
/** 예전에 월드를 끝낸 기록이면 (기념 그림이 생기기 전) 지금 만들어 준다 */
function ensureMemories() {
  for (const w of window.WORLDS) if (MEMORY_BG[w.no] && Store.data.deco.includes(w.deco.id) && !Store.data.memories[w.no]) makeMemory(w);
}
function memoryHTML(wno, small) {
  const m = Store.data.memories[wno];
  const list = small ? m.pokes.slice(0, 5) : m.pokes;
  const half = Math.ceil(list.length / 2);
  const spots = list.map((p, k) => {
    const back = k >= half && !small;
    const row = back ? list.length - half : half;
    const j = back ? k - half : k;
    const x = small ? 12 + j * 19 : 8 + ((j + (back ? 0.5 : 0)) * 84) / Math.max(row, 1);
    const y = small ? 92 : back ? 74 : 99;
    return `<img class="mem-poke ${k % 3 === 1 ? "flip" : ""}" src="${Poke.img(p)}" alt="" style="left:${x}%;top:${y}%;animation-delay:-${(k * 0.37) % 1.2}s;${back ? "z-index:1;" : "z-index:2;"}">`;
  }).join("");
  const deco = small ? "" : Array.from({ length: 14 }, (_, k) => `<span class="mem-fx" style="left:${(k * 37) % 96}%;animation-delay:-${(k * 0.53) % 4}s">${["♥", "♪", "✦", "♥", "✿", "♫"][k % 6]}</span>`).join("");
  return `<div class="mem-scene ${small ? "small" : ""}" style="background-image:url(assets/ui/${MEMORY_BG[wno]}.webp)">${deco}${spots}</div>`;
}
function showMemory(wno, fresh) {
  const w = window.WORLDS[wno - 1];
  const d = layer("modal memory", `<div class="win-box mem-box">
    <h2>📸 ${esc(w.name)} 기념 그림</h2>
    ${memoryHTML(wno)}
    <p class="mem-note">${fresh ? "도감에 기념 그림이 들어갔어요!" : new Date(Store.data.memories[wno].at).toLocaleDateString("ko-KR")}</p>
    <button class="btn big primary" data-v="ok">${fresh ? "좋아요!" : "닫기"}</button></div>`);
  say(L.memory);
  return waitPick(d).then(() => d.remove());
}

// =====================================================================
// 도감
// =====================================================================
function renderDex() {
  ensureMemories();
  const dex = Store.data.dex;
  const mem = Object.keys(Store.data.memories).map(Number).sort();
  const W = window.WORLDS.filter((w) => w.open);
  const total = Store.data.dexOrder.length;
  show(`
  <div class="dex">
    <header class="bar"><button class="btn" data-a="back">◀ 처음</button><h2>📖 구조 도감</h2><span class="bar-r">${total}마리</span></header>
    <div class="dex-body">
      ${mem.length ? `<section class="win-box dex-sec"><h3>📸 기념 그림 <small>지역을 끝내면 구조한 친구들이 모여요</small></h3>
        <div class="mem-grid">${mem.map((no) => `<button class="mem-card" data-m="${no}">${memoryHTML(no, true)}<b>${no}. ${esc(window.WORLDS[no - 1].name)}</b></button>`).join("")}</div></section>` : ""}
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
    const m = e.target.closest("[data-m]");
    if (m) return showMemory(+m.dataset.m, false);
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
const DECO_POS = { pot: [7, 99], fountain: [92, 99], crystal: [20, 99], snowman: [80, 99], bunting: [50, 70], bench: [66, 99], brazier: [33, 99], telescope: [68, 99], tesla: [14, 99], trophy: [50, 99] };
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
        Object.assign(Store.data, { levels: {}, dex: {}, dexOrder: [], deco: [], seen: {}, last: 1, memories: {} });
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
if (TEST) window.__T = { G, Store, Update, E, LV, Poke, startLevel, renderTitle, renderMap, renderLevels, renderDex, renderCenter, renderParent, act, go, tap, hint, undo, redo, reset, skipLevel, unlocked, pickAbility, pressSwitch, readyGates, showMemory, makeMemory, storedSolution, solution };

renderTitle();
