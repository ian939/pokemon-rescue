/* 레벨 생성기 + 솔버 선별 → data/levels.js
 *
 *   node tools/gen-levels.js
 *
 * 방법: 정답 길(출발 문 → 센터 문)을 먼저 깔고 → 나머지 칸을 장애물·곁가지로 채우고 →
 *       월드 1은 돌릴 수 있는 칸을 섞고, 월드 2는 빈칸을 무작위로 돌아다니게 해 섞는다 →
 *       솔버(BFS)로 잰 최소 조작 수가 그 레벨의 목표(par)와 같은 것만 고른다.
 * 씨앗이 레벨 번호로 고정이라 다시 돌려도 같은 판이 나온다.
 * 소개 레벨은 tools/levels-hand.js 에서 손으로 고친다.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const E = require("../js/engine.js");
const HAND = require("./levels-hand.js");

// ---------- 레벨 목표 ----------
// par = 솔버가 확인한 최소 조작 수 (plan §3 월드별 범위 안에서 조금씩 오른다)
// len = 정답 길 길이(칸 수) 범위 · ob = 장애물 수 · gates = 출발·센터 문 방향 후보
const WE = [["W", "E"]];
const MIX = [["W", "E"], ["W", "E"], ["N", "S"], ["W", "S"], ["N", "E"], ["E", "W"], ["S", "N"]];
const W1 = [
  // 월드 1 초록 숲 — 회전 전용, 4×4. k = 섞을 정답 길 칸 수, dr = 돌릴 수 있는 곁가지 수
  { id: "L02", par: 1, k: 1, dr: 0, len: [5, 6], ob: [6, 8], gates: WE },
  { id: "L03", par: 2, k: 2, dr: 0, len: [5, 7], ob: [5, 7], gates: WE },
  { id: "L04", par: 2, k: 2, dr: 1, len: [5, 7], ob: [4, 6], gates: WE },
  { id: "L05", par: 2, k: 2, dr: 1, len: [6, 8], ob: [3, 5], gates: MIX },
  { id: "L06", par: 3, k: 2, dr: 1, len: [6, 8], ob: [3, 5], gates: MIX },
  { id: "L07", par: 3, k: 3, dr: 1, len: [6, 8], ob: [3, 5], gates: MIX },
  { id: "L08", par: 3, k: 3, dr: 2, len: [6, 9], ob: [2, 4], gates: MIX },
  { id: "L09", par: 3, k: 3, dr: 2, len: [7, 9], ob: [2, 4], gates: MIX },
  { id: "L10", par: 4, k: 3, dr: 2, len: [7, 9], ob: [2, 4], gates: MIX },
  { id: "L11", par: 4, k: 4, dr: 3, len: [7, 10], ob: [2, 3], gates: MIX },
  { id: "L12", par: 4, k: 4, dr: 3, len: [7, 10], ob: [1, 3], gates: MIX },
  { id: "L13", par: 5, k: 4, dr: 3, len: [8, 10], ob: [1, 3], gates: MIX },
  { id: "L14", par: 5, k: 5, dr: 4, len: [8, 11], ob: [1, 2], gates: MIX },
  { id: "L15", par: 5, k: 5, dr: 5, len: [8, 11], ob: [0, 2], gates: MIX },
];
const W2 = [
  // 월드 2 물결 강가 — 밀기 전용(회전 잠금). d = 밀 수 있는 곁가지 수, br = 다리(고정 길) 수, fx = 고정 길 수
  { id: "L17", n: 4, par: 1, d: 0, br: 0, fx: 2, len: [4, 6], gates: WE },
  { id: "L18", n: 4, par: 2, d: 0, br: 0, fx: 2, len: [4, 6], gates: WE },
  { id: "L19", n: 4, par: 2, d: 1, br: 1, fx: 1, len: [5, 7], gates: WE },
  { id: "L20", n: 4, par: 3, d: 1, br: 1, fx: 1, len: [5, 7], gates: MIX },
  { id: "L21", n: 4, par: 3, d: 1, br: 1, fx: 0, len: [5, 7], gates: MIX },
  { id: "L22", n: 4, par: 4, d: 2, br: 1, fx: 0, len: [5, 8], gates: MIX },
  { id: "L23", n: 4, par: 3, d: 2, br: 1, fx: 0, len: [6, 8], gates: MIX },
  { id: "L24", n: 5, par: 3, d: 2, br: 1, fx: 2, len: [6, 8], gates: WE },
  { id: "L25", n: 5, par: 4, d: 2, br: 1, fx: 1, len: [6, 9], gates: MIX },
  { id: "L26", n: 5, par: 4, d: 3, br: 2, fx: 1, len: [6, 9], gates: MIX },
  { id: "L27", n: 5, par: 5, d: 3, br: 2, fx: 0, len: [7, 10], gates: MIX },
  { id: "L28", n: 5, par: 4, d: 3, br: 1, fx: 0, len: [7, 10], gates: MIX },
  { id: "L29", n: 5, par: 5, d: 4, br: 2, fx: 0, len: [7, 10], gates: MIX },
  { id: "L30", n: 5, par: 6, d: 4, br: 2, fx: 0, len: [8, 11], gates: MIX },
];
const INTRO = { L01: "r", L02: "r", L03: "r", L16: "s", L17: "s", L18: "s" };

// ---------- 난수 ----------
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (R, a, b) => a + Math.floor(R() * (b - a + 1));
const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
function shuffle(R, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// ---------- 정답 길 ----------
/** 출발 칸 → 센터 칸까지 스스로 겹치지 않는 길 (칸 번호 배열) */
function randomPath(R, n, s, g, len) {
  let budget = 30000, found = null;
  const want = ri(R, len[0], len[1]);
  const seen = new Set([s]);
  const walk = [s];
  function dfs(i) {
    if (found || --budget < 0) return;
    if (i === g) { if (walk.length >= len[0] && walk.length <= len[1] && Math.abs(walk.length - want) <= 1) found = walk.slice(); return; }
    if (walk.length >= len[1]) return;
    for (const d of shuffle(R, [0, 1, 2, 3])) {
      const j = E.neighbor(n, i, d);
      if (j < 0 || seen.has(j)) continue;
      seen.add(j); walk.push(j);
      dfs(j);
      walk.pop(); seen.delete(j);
      if (found) return;
    }
  }
  dfs(s);
  return found;
}
function dirTo(n, a, b) { for (let d = 0; d < 4; d++) if (E.neighbor(n, a, d) === b) return d; return -1; }
/** 두 포트를 잇는 타일 모양·방향 */
function shapeFor(a, b) {
  if ((a + 2) % 4 === b) return { sh: "S", r: a % 2 };
  return { sh: "C", r: (a + 1) % 4 === b ? a : b };
}
function pathTiles(n, cells, start, goal) {
  const out = [];
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k];
    const a = k === 0 ? E.SIDE[start.side] : dirTo(n, i, cells[k - 1]);
    const b = k === cells.length - 1 ? E.SIDE[goal.side] : dirTo(n, i, cells[k + 1]);
    out.push(Object.assign({ i }, shapeFor(a, b)));
  }
  return out;
}
function gatesFor(R, n, pair) {
  const start = { side: pair[0], at: ri(R, 0, n - 1) };
  const goal = { side: pair[1], at: ri(R, 0, n - 1) };
  return { start, goal };
}
const tok = (sh, r, f) => sh + r + (f || "");
const OBS_W1 = ["t", "t", "t", "b", "r"];
const OBS_W2 = ["t", "b", "r", "r"];

// ---------- 월드 1: 회전 ----------
function genRotate(cfg, R) {
  const n = 4;
  const { start, goal } = gatesFor(R, n, pick(R, cfg.gates));
  const s = E.gateCell(n, start), g = E.gateCell(n, goal);
  if (s === g) return null;
  const p = randomPath(R, n, s, g, cfg.len);
  if (!p) return null;
  const cells = new Array(n * n).fill(null);
  const pt = pathTiles(n, p, start, goal);
  const onPath = new Set(p);
  // 섞을 정답 길 칸: 곡선을 먼저
  const order = shuffle(R, pt.slice()).sort((a, b) => (b.sh === "C") - (a.sh === "C"));
  const mix = new Set(order.slice(0, cfg.k).map((t) => t.i));
  for (const t of pt) {
    if (mix.has(t.i)) {
      const per = E.PERIOD[t.sh];
      const r = (t.r + ri(R, 1, per - 1)) % 4;
      cells[t.i] = tok(t.sh, r, "r");
    } else cells[t.i] = tok(t.sh, t.r);
  }
  const rest = shuffle(R, [...Array(n * n).keys()].filter((i) => !onPath.has(i)));
  const ob = Math.min(rest.length, ri(R, cfg.ob[0], cfg.ob[1]));
  rest.forEach((i, k) => {
    if (k < ob) cells[i] = "#" + pick(R, OBS_W1);
    else cells[i] = tok(pick(R, ["S", "C", "C"]), ri(R, 0, 3), k < ob + cfg.dr ? "r" : "");
  });
  return { n, ops: "r", start, goal, cells };
}

// ---------- 월드 2: 밀기 ----------
function genSlide(cfg, R) {
  const n = cfg.n;
  const { start, goal } = gatesFor(R, n, pick(R, cfg.gates));
  const s = E.gateCell(n, start), g = E.gateCell(n, goal);
  if (s === g) return null;
  const p = randomPath(R, n, s, g, cfg.len);
  if (!p) return null;
  const cells = new Array(n * n).fill(null);
  const pt = shuffle(R, pathTiles(n, p, start, goal));
  pt.forEach((t, k) => {
    const f = k < cfg.br ? "b" : k < cfg.br + cfg.fx ? "" : "s";
    cells[t.i] = tok(t.sh, t.r, f);
  });
  const onPath = new Set(p);
  const rest = shuffle(R, [...Array(n * n).keys()].filter((i) => !onPath.has(i)));
  if (rest.length < 1 + cfg.d) return null;
  rest.forEach((i, k) => {
    if (k === 0) cells[i] = ".";
    else if (k <= cfg.d) cells[i] = tok(pick(R, ["S", "C"]), ri(R, 0, 3), "s");
    else cells[i] = "#" + pick(R, OBS_W2);
  });
  // 빈칸을 무작위로 돌아다니게 해서 섞는다 (바로 되돌리는 밀기는 하지 않음)
  const lv = { n, ops: "s", start, goal, cells };
  let st = E.makeState(lv), last = -1;
  const steps = ri(R, cfg.par, cfg.par * 3 + 2);
  for (let k = 0; k < steps; k++) {
    const acts = E.actions(st, "s").filter((a) => a.i !== last); // 방금 민 타일은 다시 안 민다
    if (!acts.length) break;
    const a = pick(R, acts);
    last = a.to;
    st = E.apply(st, a);
  }
  lv.cells = st.cells.map(E.cellToken);
  return lv;
}

// ---------- 고르기 ----------
function finish(id, lv) {
  const err = E.validate(lv);
  if (err.length) return { err };
  const sol = E.solve(E.makeState(lv), lv, { maxDepth: 14 });
  if (!sol) return { err: ["해 없음"] };
  return { sol };
}
function hashId(id) { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

function build(cfg, world) {
  for (let tries = 0; tries < 20000; tries++) {
    const R = mulberry(hashId(cfg.id) * 7919 + tries);
    const lv = world === 1 ? genRotate(cfg, R) : genSlide(cfg, R);
    if (!lv) continue;
    const { err, sol } = finish(cfg.id, lv);
    if (err || sol.moves !== cfg.par) continue;
    // 정답 길에서 돌리거나 미는 칸이 실제로 쓰이는지 (곁가지만 만지는 풀이는 버림)
    return Object.assign(lv, { par: sol.moves, sol: sol.actions, tries });
  }
  throw new Error(cfg.id + ": 조건에 맞는 판을 못 찾음");
}

function fromHand(id, h) {
  const cells = h.rows.join(" ").trim().split(/\s+/);
  const lv = { n: h.n, ops: h.ops, start: h.start, goal: h.goal, cells };
  const { err, sol } = finish(id, lv);
  if (err) throw new Error(id + ": " + err.join(", "));
  return Object.assign(lv, { par: sol.moves, sol: sol.actions, hand: true });
}

function main() {
  const all = [];
  const t0 = Date.now();
  const add = (id, world, lv) => {
    all.push(Object.assign({ id, no: +id.slice(1), world }, lv, INTRO[id] ? { intro: INTRO[id] } : {}));
    console.log(`${id} 월드${world} ${lv.n}×${lv.n} ${lv.ops} par ${lv.par}${lv.hand ? " (손)" : ` (시도 ${lv.tries + 1})`}`);
  };
  add("L01", 1, fromHand("L01", HAND.L01));
  for (const c of W1) add(c.id, 1, build(c, 1));
  add("L16", 2, fromHand("L16", HAND.L16));
  for (const c of W2) add(c.id, 2, build(c, 2));
  for (const lv of all) { delete lv.tries; delete lv.hand; }
  all.sort((a, b) => a.no - b.no);
  const out = path.join(__dirname, "..", "data", "levels.js");
  const body = all.map((l) => "  " + JSON.stringify(l)).join(",\n");
  fs.writeFileSync(out, `/* 자동 생성 파일 — 손으로 고치지 말 것. node tools/gen-levels.js 로 다시 만든다. */
(function (root) {
  const LEVELS = [
${body}
  ];
  if (typeof module !== "undefined" && module.exports) module.exports = LEVELS;
  else root.LEVELS = LEVELS;
})(typeof window !== "undefined" ? window : globalThis);
`);
  console.log(`${all.length}개 → data/levels.js (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
}
main();
