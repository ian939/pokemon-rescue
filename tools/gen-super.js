/* 🌈 슈퍼하드 레벨 — 하드 맵을 좌우로 뒤집은 거울 판 (외운 답이 안 통하게)
 *
 *   node tools/gen-super.js     # data/levels-super.js (S01~S135) 를 다시 만든다 (몇 초)
 *
 * 그냥 뒤집으면 시계방향 회전이 반시계가 되어 필요한 탭 수가 바뀐다. 그래서
 *  1) 하드 판에 저장된 풀이를 끝까지 둬서 '풀린 판'과 조각마다 돈 횟수(c)를 얻고
 *  2) 풀린 판을 거울로 뒤집은 뒤, 조각마다 c 번 거꾸로 돌려 놓은 것을 시작 판으로 한다
 *  → 거울 풀이(칸 번호만 뒤집은 같은 조작들)로 똑같이 풀리고, 솔버로 최소 조작 수를 다시 잰다.
 * 문(출발·센터)·물·낭떠러지·워프 패널·열매·⚡ 무리도 함께 뒤집힌다.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const E = require("../js/engine.js");
const HARD = require("../data/levels-hard.js");

// 방향 뒤집기: 좌우(h) N→N E→W S→S W→E · 위아래(v) N→S E→E S→N W→W
//   180° 돌리기(r) N→S E→W S→N W→E — 돌리는 방향이 그대로라 최소 조작 수가 정확히 같다 (거울이 너무 쉬워질 때)
const MIRS = { h: [0, 3, 2, 1], v: [2, 1, 0, 3], r: [2, 3, 0, 1] };
let MIR = MIRS.h;
/** 모양 sh 가 포트 모음 set 이 되는 방향 r */
function rFor(sh, set) {
  const want = [...set].sort().join();
  for (let r = 0; r < 4; r++) if (E.SHAPES[sh].map((d) => (d + r) % 4).sort().join() === want) return r;
  throw new Error("방향 없음 " + sh + " " + want);
}
const mirR = (sh, r) => rFor(sh, E.SHAPES[sh].map((d) => MIR[(d + r) % 4]));
const back = (r, c) => (((r - c) % 4) + 4) % 4;

function mirrorLevel(H, axis) {
  const n = H.n;
  MIR = MIRS[axis];
  const mi = axis === "h" ? (i) => Math.floor(i / n) * n + (n - 1 - (i % n)) : axis === "v" ? (i) => (n - 1 - Math.floor(i / n)) * n + (i % n) : (i) => n * n - 1 - i;
  const SW = axis === "h" ? { E: "W", W: "E" } : axis === "v" ? { N: "S", S: "N" } : null;
  const OPP = { N: "S", S: "N", E: "W", W: "E" };
  const mg = (g) => (!SW ? { side: OPP[g.side], at: n - 1 - g.at } : SW[g.side] ? { side: SW[g.side], at: g.at } : { side: g.side, at: n - 1 - g.at });
  // 1) 하드 풀이를 끝까지: 풀린 판 + 조각(id)마다 시계방향으로 돈 횟수
  let st = E.makeState(H);
  const turns = {};
  for (const a of H.sol) {
    const before = st;
    st = E.apply(st, a);
    st.cells.forEach((t, i) => {
      if (!t || !t.sh) return;
      const old = before.cells.find((x) => x && x.id === t.id);
      if (old && old.sh && old.r !== t.r) turns[t.id] = (turns[t.id] || 0) + (((t.r - old.r) % 4) + 4) % 4;
    });
  }
  // 2) 시작 판 = 하드 시작 판의 칸 배치(자리) + 거울 방향 − 돈 횟수
  const init = E.makeState(H);
  const finalOf = {};
  st.cells.forEach((t) => { if (t && t.sh) finalOf[t.id] = t; });
  const cells = new Array(n * n);
  init.cells.forEach((t, i) => {
    const j = mi(i);
    if (!t) { cells[j] = "."; return; }
    if (t.ob) { cells[j] = "#" + t.ob; return; }
    if (t.wa) { cells[j] = "~" + t.wa.sh + mirR(t.wa.sh, t.wa.r); return; }
    if (t.pit) { cells[j] = "^" + t.pit.sh + mirR(t.pit.sh, t.pit.r) + t.pit.g; return; }
    const f = finalOf[t.id] || t; // 끝에 사라진 타일은 없음(물·낭떠러지는 위에서), 그대로
    const r0 = back(mirR(t.sh, f.r), turns[t.id] || 0);
    cells[j] = E.cellToken(Object.assign({}, t, { r: r0 }));
  });
  const S = Object.assign({}, H, { id: "S" + H.id.slice(1), cells, goal: mg(H.goal) });
  if (H.starts) S.starts = H.starts.map(mg);
  if (H.start) S.start = mg(H.start);
  // 거울 풀이: 칸 번호만 뒤집는다
  const msol = H.sol.map((a) => {
    const b = Object.assign({}, a);
    if (b.i != null) b.i = mi(b.i);
    if (b.to != null) b.to = mi(b.to);
    return b;
  });
  // 물 다리·덩굴 다리는 쓰는 순간 정해진 모양이 되므로 위 '~','^' 거울로 충분. 확인:
  const replays = (lv, sol) => {
    let s2 = E.makeState(lv);
    const res = new Set();
    for (const a of sol) { s2 = E.apply(s2, a); E.wins(s2, lv).forEach((w, k) => { if (w) res.add(k); }); }
    return res.size === E.startsOf(lv).length;
  };
  const errs = E.validate(S);
  if (!errs.length && replays(S, msol)) {
    // 최소 조작 수 다시 재기 (거울 풀이 길이까지만 — 그보다 짧으면 그게 par)
    const best = E.solve(E.makeState(S), S, { maxDepth: msol.length - 1, maxStates: 300000 });
    S.sol = best ? best.actions : msol;
    S.par = S.sol.length;
    return S;
  }
  // 두 친구 판처럼 풀이 도중에 구조가 일어나면 중간 방향이 달라 거울 풀이가 안 맞을 수 있다 → 솔버로 직접 푼다
  //   ① 위에서 만든 시작 판  ② 하드 시작 판을 그대로 거울로 (방향만 뒤집음)
  const plain = Object.assign({}, S, {
    cells: (() => {
      const c = new Array(n * n);
      init.cells.forEach((t, i) => {
        const j = mi(i);
        if (!t) c[j] = ".";
        else if (t.ob) c[j] = "#" + t.ob;
        else if (t.wa) c[j] = "~" + t.wa.sh + mirR(t.wa.sh, t.wa.r);
        else if (t.pit) c[j] = "^" + t.pit.sh + mirR(t.pit.sh, t.pit.r) + t.pit.g;
        else c[j] = E.cellToken(Object.assign({}, t, { r: mirR(t.sh, t.r) }));
      });
      return c;
    })(),
  });
  for (const [cand, depth, cap] of [[S, H.par + 6, 400000], [plain, H.par + 6, 400000], [plain, H.par + 10, 1500000]]) {
    if (E.validate(cand).length) continue;
    const r = E.solve(E.makeState(cand), cand, { maxDepth: depth, maxStates: cap });
    if (r && r.moves >= Math.max(1, H.par - 2)) return Object.assign(cand, { sol: r.actions, par: r.moves });
  }
  // 그래도 안 되면 그 판만 하드 판을 그대로 (거울 아님) — 기록에 남긴다
  console.log(S.id + ": 거울 판을 못 만들어 하드 판 그대로");
  return Object.assign({}, H, { id: S.id, unmirrored: true });
}

function main() {
  const t0 = Date.now();
  const out = HARD.map((H) => {
    // 좌우 거울 먼저. 하드보다 2번 넘게 쉬워지면 위아래 거울도 만들어 더 어려운 쪽
    // 좌우 거울 → 위아래 거울 → 180° 돌리기 순서로, 하드보다 2번 넘게 쉬워지지 않는 첫 판
    let S = null;
    for (const axis of ["h", "v", "r"]) {
      const C = Object.assign(mirrorLevel(H, axis), { mirror: axis });
      if (!C.unmirrored && C.par >= H.par - 2) { S = C; break; }
    }
    if (!S) throw new Error(H.id + ": 뒤집은 판을 못 만듦");
    if (S.par !== H.par || S.mirror !== "h") console.log(`${S.id} par ${H.par} → ${S.par} (${{ h: "좌우", v: "위아래", r: "180°" }[S.mirror]})`);
    return S;
  });
  fs.writeFileSync(path.join(__dirname, "..", "data", "levels-super.js"), `/* 자동 생성 파일 — 손으로 고치지 말 것. node tools/gen-super.js 로 만든다 (슈퍼하드: 하드 맵의 거울 판). */
(function (root) {
  const LEVELS_SUPER = [
${out.map((l) => "  " + JSON.stringify(l)).join(",\n")}
  ];
  if (typeof module !== "undefined" && module.exports) module.exports = LEVELS_SUPER;
  else root.LEVELS_SUPER = LEVELS_SUPER;
})(typeof window !== "undefined" ? window : globalThis);
`);
  console.log(`${out.length}개 → data/levels-super.js (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
}
main();
