/* 하드 모드 레벨 — 노말 판과 같은 맵에서 나무·바위 자리를 가짜 길 조각으로 채워 판 전체를 쓴다
 *
 *   node tools/gen-hard.js             # 아직 없는 하드 레벨만 만든다 (data/levels-hard.js 에 있는 건 그대로)
 *   node tools/gen-hard.js --redo H97  # 그 레벨만 다시
 *
 * 규칙 (사용자 확정 v2026-11-01a)
 *  - 정답 길·문·물·낭떠러지·덤불(파이리 퍼즐)·빈칸은 노말과 같다. 장애물(나무·바위 등)의 약 3/4 을 가짜 길 조각으로 바꾼다.
 *  - 가짜 조각 일부는 그 월드에서 쓰는 조작(돌리기·밀기·⚡)으로 움직인다 → 헷갈리는 선택지가 늘어난다.
 *  - 솔버로 다시 풀어 **최소 조작 수가 노말보다 적지 않은** 판만 고른다 (가짜 길이 지름길이 되면 버림).
 *  - 노말 par 11 이상(월드 6·7 후반 등)은 BFS 가 무거워 움직이는 가짜 조각 없이 고정 가짜 길만 넣는다.
 *  - 하드 화면에서는 이어진 길이 빛나지 않는다 (app.js — G.hard).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const E = require("../js/engine.js");
const NORMAL = require("../data/levels.js");

const OUT = path.join(__dirname, "..", "data", "levels-hard.js");
let OLD = {};
try { for (const l of require(OUT)) OLD[l.id] = l; } catch (e) { OLD = {}; }
const ARGS = process.argv.slice(2);
const REDO = new Set(ARGS.includes("--redo") ? (ARGS[ARGS.indexOf("--redo") + 1] || "").split(",") : []);

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
function hashId(id) { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

/** 노말 판 → 하드 후보. move = 움직이는 가짜 조각 수, frac = 장애물 중 바꿀 비율 */
function makeHard(L, R, move, frac) {
  const cells = L.cells.slice();
  const obs = shuffle(R, cells.map((c, i) => (c[0] === "#" && c !== "#b" ? i : -1)).filter((i) => i >= 0));
  const conv = obs.slice(0, Math.round(obs.length * frac));
  const shapes = L.world >= 3 ? ["S", "C", "C", "T", "T", "X"] : ["S", "S", "C", "C", "C", "T"];
  const flags = [];
  if (L.ops.includes("r")) flags.push("r");
  if (L.ops.includes("s")) flags.push("s");
  if (L.ops.includes("z") && cells.some((c) => /^[SCTXP][0-3][a-z]*z/.test(c))) flags.push("z");
  conv.forEach((i, k) => {
    const f = k < move && flags.length ? pick(R, flags) : "";
    cells[i] = pick(R, shapes) + ri(R, 0, 3) + f;
  });
  return Object.assign({}, L, { id: "H" + L.id.slice(1), cells });
}

function build(L) {
  const heavy = L.par >= 11;
  // 시도 순서: 움직이는 가짜 조각 2~3개 → 1개 → 고정 가짜 길만 → 바꾸는 비율을 줄여서
  const plans = heavy
    ? [[0, 0.75, 40], [0, 0.55, 40], [0, 0.35, 40]]
    : [[L.world <= 2 ? 3 : 2, 0.75, 30], [1, 0.75, 30], [0, 0.75, 40], [0, 0.5, 40]];
  for (const [move, frac, tries] of plans) {
    for (let t = 0; t < tries; t++) {
      const R = mulberry(hashId(L.id) * 7919 + t * 131 + move * 17 + Math.round(frac * 100));
      const H = makeHard(L, R, move, frac);
      if (E.validate(H).length) continue;
      const sol = E.solve(E.makeState(H), H, { maxDepth: heavy ? L.par : L.par + 3, maxStates: 400000 });
      if (!sol || sol.moves < L.par) continue; // 못 풀거나 노말보다 쉬워짐(가짜 길이 지름길)
      return Object.assign(H, { par: sol.moves, sol: sol.actions, how: `가짜 ${move}움직임·${Math.round(frac * 100)}%` });
    }
  }
  throw new Error(L.id + ": 하드 판을 못 만듦");
}

function main() {
  const out = [];
  const t0 = Date.now();
  for (const L of NORMAL) {
    const hid = "H" + L.id.slice(1);
    if (OLD[hid] && !REDO.has(hid)) { out.push(OLD[hid]); continue; }
    const t1 = Date.now();
    const H = build(L);
    const how = H.how; delete H.how;
    out.push(H);
    console.log(`${hid} par ${L.par} → ${H.par} (${how}, ${((Date.now() - t1) / 1000).toFixed(1)}초)`);
    // 하나 만들 때마다 저장 (오래 걸리는 판에서 끊겨도 이어서 만들 수 있게)
    write(out.concat(NORMAL.slice(out.length).map((x) => OLD["H" + x.id.slice(1)]).filter(Boolean)));
  }
  write(out);
  console.log(`${out.length}개 → data/levels-hard.js (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
}
function write(list) {
  list.sort((a, b) => a.no - b.no);
  fs.writeFileSync(OUT, `/* 자동 생성 파일 — 손으로 고치지 말 것. node tools/gen-hard.js 로 만든다 (하드 모드: 노말과 같은 맵 + 가짜 길). */
(function (root) {
  const LEVELS_HARD = [
${list.map((l) => "  " + JSON.stringify(l)).join(",\n")}
  ];
  if (typeof module !== "undefined" && module.exports) module.exports = LEVELS_HARD;
  else root.LEVELS_HARD = LEVELS_HARD;
})(typeof window !== "undefined" ? window : globalThis);
`);
}
main();
