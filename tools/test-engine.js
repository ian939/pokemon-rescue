/* 엔진·솔버 단위 테스트 + 전체 레벨 검증
 *
 *   node tools/test-engine.js
 *
 * plan §10 테스트 목록: 회전 4회 원복 · 비인접 밀기 금지 · 고정 타일 불변 · 포트 불일치 실패 ·
 *   동일 상태 결정적 결과 (+ 체크포인트·능력은 월드 4~5에서 추가)
 * plan §0.6: 레벨 전부 해 존재 · par 가 §3 범위 · 처음부터 풀린 판 없음 · 저장된 풀이가 실제로 풀림
 * plan §12: 월드 3(혼합)은 회전만으로도, 밀기만으로도 안 풀림 (두 조작 모두 필요)
 */
"use strict";
const assert = require("assert");
const E = require("../js/engine.js");
const LEVELS = require("../data/levels.js");
const { WORLDS } = require("../js/worlds.js");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.log("✗ " + name + "\n   " + e.message); }
}
/** 시험용 판: 모자란 줄은 나무로 채워 정사각형으로 */
function lv(rows, extra) {
  const n = rows[0].trim().split(/\s+/).length;
  const all = rows.concat(Array(Math.max(0, n - rows.length)).fill(Array(n).fill("#t").join(" ")));
  return Object.assign({ n, ops: "rs", start: { side: "W", at: 0 }, goal: { side: "E", at: 0 }, cells: all.join(" ").split(/\s+/) }, extra);
}

// ---------- 타일 · 포트 ----------
t("직선 포트: r0 = N·S, r1 = E·W", () => {
  assert.deepStrictEqual(E.ports(E.parseCell("S0")).sort(), [0, 2]);
  assert.deepStrictEqual(E.ports(E.parseCell("S1")).sort(), [1, 3]);
});
t("곡선 포트: r0 N·E → r1 E·S → r2 S·W → r3 W·N", () => {
  assert.deepStrictEqual(E.ports(E.parseCell("C0")).sort(), [0, 1]);
  assert.deepStrictEqual(E.ports(E.parseCell("C1")).sort(), [1, 2]);
  assert.deepStrictEqual(E.ports(E.parseCell("C2")).sort(), [2, 3]);
  assert.deepStrictEqual(E.ports(E.parseCell("C3")).sort(), [0, 3]);
});
t("토큰 왕복", () => {
  for (const k of ["C3r", "S1s", "T2rs", "X0", "S0b", "#t", "#r", "."]) assert.strictEqual(E.cellToken(E.parseCell(k, "x")), k);
});

// ---------- 회전 ----------
t("회전 4회면 원래 방향", () => {
  const L0 = lv(["C0r S1"]);
  let s = E.makeState(L0);
  const k0 = E.key(s);
  for (let i = 0; i < 4; i++) s = E.apply(s, { t: "r", i: 0 });
  assert.strictEqual(E.key(s), k0);
  assert.strictEqual(s.cells[0].r, 0);
});
t("회전은 정확히 90도(한 칸)", () => {
  const s = E.apply(E.makeState(lv(["C0r S1"])), { t: "r", i: 0 });
  assert.strictEqual(s.cells[0].r, 1);
});
t("돌릴 수 없는 타일은 회전 금지", () => {
  assert.throws(() => E.apply(E.makeState(lv(["C0 S1"])), { t: "r", i: 0 }));
  assert.throws(() => E.apply(E.makeState(lv(["#t S1"])), { t: "r", i: 0 }));
});
t("회전 조작 목록에 고정 타일·십자 없음", () => {
  const a = E.actions(E.makeState(lv(["C0r S1 X0r #t"])), "r");
  assert.deepStrictEqual(a.map((x) => x.i), [0]);
});

// ---------- 밀기 ----------
t("빈칸과 붙은 타일만 밀 수 있음", () => {
  const s = E.makeState(lv(["S1s . S1s", "S1s #t S1s", "S1s S1s S1s"]));
  const a = E.actions(s, "s");
  assert.deepStrictEqual(a.map((x) => x.i).sort(), [0, 2]);
  assert.throws(() => E.apply(s, { t: "s", i: 3, to: 1 }), /붙어|밀 수 없는/); // 대각선
  assert.throws(() => E.apply(s, { t: "s", i: 7, to: 1 })); // 멀리
});
t("밀면 자리만 바뀌고 방향은 그대로", () => {
  const s = E.apply(E.makeState(lv(["C2s . S1"])), { t: "s", i: 0, to: 1 });
  assert.strictEqual(s.cells[0], null);
  assert.strictEqual(s.cells[1].sh, "C");
  assert.strictEqual(s.cells[1].r, 2);
});
t("고정 길·다리·장애물은 밀 수 없음", () => {
  const s = E.makeState(lv(["S1 . S1b", "#t S1s #r"]));
  const a = E.actions(s, "s");
  assert.deepStrictEqual(a, [{ t: "s", i: 4, to: 1 }]);
});
t("원래 상태는 바뀌지 않음 (불변)", () => {
  const s = E.makeState(lv(["C0r . S1s"]));
  const k = E.key(s);
  E.apply(s, { t: "r", i: 0 });
  E.apply(s, { t: "s", i: 2, to: 1 });
  assert.strictEqual(E.key(s), k);
});

// ---------- 연결 판정 ----------
t("포트가 맞으면 이어짐", () => {
  const c = E.connect(E.makeState(lv(["S1 S1 S1"])), lv(["S1 S1 S1"]));
  assert.ok(c.win);
  assert.deepStrictEqual(c.path, [0, 1, 2]);
});
t("겉으로 붙어 있어도 포트가 안 맞으면 끊김", () => {
  const L0 = lv(["S1 C0 S1"]); // 가운데 곡선은 N·E — 왼쪽 W 포트 없음
  const c = E.connect(E.makeState(L0), L0);
  assert.ok(!c.win);
  assert.deepStrictEqual(c.lit, [0]);
  assert.deepStrictEqual(c.broken, [{ i: 0, d: 1 }]);
});
t("센터 문 쪽 포트가 없으면 실패", () => {
  const L0 = lv(["S1 S1 C3"]); // 마지막 칸 W·N — E 포트 없음
  assert.ok(!E.connect(E.makeState(L0), L0).win);
});
t("출발 문 쪽 포트가 없으면 아무것도 안 빛남", () => {
  const L0 = lv(["S0 S1 S1"]);
  const c = E.connect(E.makeState(L0), L0);
  assert.deepStrictEqual(c.lit, []);
  assert.deepStrictEqual(c.path, []);
});
t("곁가지·막힌 가지·긴 길이 있어도 성공 + 가장 짧은 길", () => {
  const L0 = lv(["T2 S1 T2", "C0 S1 C3"]); // 위·아래 두 갈래
  const c = E.connect(E.makeState(L0), L0);
  assert.ok(c.win);
  assert.deepStrictEqual(c.path, [0, 1, 2]);
});
t("같은 상태 → 같은 결과 (결정적)", () => {
  const L0 = lv(["X0 X0 X0", "X0 X0 X0", "X0 X0 X0"], { goal: { side: "E", at: 2 } });
  const a = E.connect(E.makeState(L0), L0), b = E.connect(E.makeState(L0), L0);
  assert.deepStrictEqual(a.path, b.path);
  assert.deepStrictEqual(a.path, [0, 1, 2, 5, 8]); // 같은 길이면 N·E·S·W 순서
});
t("문 위치 계산", () => {
  assert.strictEqual(E.gateCell(4, { side: "W", at: 2 }), 8);
  assert.strictEqual(E.gateCell(4, { side: "E", at: 2 }), 11);
  assert.strictEqual(E.gateCell(4, { side: "N", at: 3 }), 3);
  assert.strictEqual(E.gateCell(4, { side: "S", at: 1 }), 13);
});

// ---------- 솔버 ----------
t("솔버: 회전 최소 수 (곡선 3번)", () => {
  const L0 = Object.assign(lv(["S1 C3r", "#t S0"]), { ops: "r", goal: { side: "S", at: 1 } }); // C3 → C2 = 세 번
  const r = E.solve(E.makeState(L0), L0);
  assert.strictEqual(r.moves, 3);
});
t("솔버: 직선은 한 번이면 됨 (2주기)", () => {
  const L0 = Object.assign(lv(["S1 S0r S1"]), { ops: "r" });
  assert.strictEqual(E.solve(E.makeState(L0), L0).moves, 1);
});
t("솔버: 밀기 최소 수", () => {
  const L0 = Object.assign(lv(["S1 . S1", "#t S1s #t"]), { ops: "s" });
  const r = E.solve(E.makeState(L0), L0);
  assert.strictEqual(r.moves, 1);
  assert.deepStrictEqual(r.actions, [{ t: "s", i: 4, to: 1 }]);
});
t("솔버: 해 없으면 null", () => {
  const L0 = Object.assign(lv(["S1 #t S1"]), { ops: "r" });
  assert.strictEqual(E.solve(E.makeState(L0), L0), null);
});
t("레벨 검사: 처음부터 풀린 판·잘못된 플래그를 잡음", () => {
  assert.ok(E.validate(Object.assign(lv(["S1 S1"]), { ops: "r" })).some((m) => m.includes("처음부터")));
  assert.ok(E.validate(Object.assign(lv(["S1 S0s"]), { ops: "r" })).some((m) => m.includes("밀기가 없는데")));
  assert.ok(E.validate(Object.assign(lv(["S1 S0r"]), { ops: "s" })).some((m) => m.includes("회전이 없는데")));
});

// ---------- 레벨 전부 ----------
const RANGE = {}; // plan §3 월드별 세부 난이도 (최소 조작 수)
[[1, 3, 1, 2], [4, 8, 2, 3], [9, 12, 3, 4], [13, 15, 4, 5], [16, 18, 1, 2], [19, 23, 2, 4], [24, 27, 3, 5], [28, 30, 4, 6],
  [31, 33, 2, 2], [34, 38, 3, 5], [39, 42, 5, 7], [43, 45, 6, 8]]
  .forEach(([a, b, lo, hi]) => { for (let i = a; i <= b; i++) RANGE[i] = [lo, hi]; });
t("레벨 번호 1~45 빠짐없이", () => {
  assert.deepStrictEqual(LEVELS.map((l) => l.no), Array.from({ length: 45 }, (_, i) => i + 1));
});
for (const L0 of LEVELS) {
  t(`${L0.id}: 정의·par·풀이`, () => {
    const w = WORLDS.find((x) => L0.no >= x.from && L0.no <= x.to);
    assert.strictEqual(L0.world, w.no);
    assert.strictEqual(L0.ops, w.ops, "월드 조작 규칙과 다름");
    assert.deepStrictEqual(E.validate(L0), []);
    const st = E.makeState(L0);
    const r = E.solve(st, L0);
    assert.ok(r, "해 없음");
    assert.strictEqual(r.moves, L0.par, "저장된 par 와 솔버 결과가 다름");
    const [lo, hi] = RANGE[L0.no];
    assert.ok(L0.par >= lo && L0.par <= hi, `par ${L0.par} 가 범위 ${lo}~${hi} 밖`);
    // 저장된 풀이(손가락 안내·자동 풀기에 씀)가 실제로 합법이고 풀린다
    let s = st;
    for (const a of L0.sol) {
      const ok = E.actions(s, L0.ops).some((x) => x.t === a.t && x.i === a.i && x.to === a.to);
      assert.ok(ok, "풀이에 불법 조작 " + JSON.stringify(a));
      s = E.apply(s, a);
    }
    assert.ok(E.connect(s, L0).win, "저장된 풀이로 안 풀림");
    // 크기: 월드 1 = 4×4, 월드 2 = 4×4 → 5×5, 월드 3 = 5×5
    assert.ok(L0.world === 1 ? L0.n === 4 : L0.world === 2 ? L0.n === (L0.no <= 23 ? 4 : 5) : L0.n === 5);
    if (L0.ops === "rs") {
      for (const ops of ["r", "s"]) assert.strictEqual(E.solve(st, Object.assign({}, L0, { ops }), { maxDepth: 20 }), null, ops + " 만으로 풀림");
      const ns = L0.sol.filter((a) => a.t === "s").length;
      assert.ok(ns >= 1 && L0.par - ns >= 1, "풀이에 회전·밀기가 다 있어야 함");
      if (L0.no <= 33) assert.strictEqual(ns, 1, "31~33 은 회전 1 + 밀기 1");
      // 한 조각이 돌리기·밀기 둘 다 되지 않음 (표시가 헷갈리지 않게)
      assert.ok(!st.cells.some((c) => c && c.rot && c.sl), "돌리고 미는 조각이 섞임");
    }
    // 월드 2는 빈칸 1개 (여러 빈칸은 초반 제외)
    if (L0.ops === "s") assert.strictEqual(st.cells.filter((c) => c === null).length, 1);
  });
}
t("소개 레벨: L01 은 돌릴 수 있는 곡선 1개 · L16 은 밀 수 있는 타일 1개 · L31 은 곡선 1 + 직선 1", () => {
  const c = E.makeState(LEVELS[30]).cells;
  assert.deepStrictEqual(c.filter((x) => x && x.rot).map((x) => x.sh), ["C"]);
  assert.deepStrictEqual(c.filter((x) => x && x.sl).map((x) => x.sh), ["S"]);
  assert.strictEqual(LEVELS[30].par, 2);
  const a = E.makeState(LEVELS[0]).cells.filter((c) => c && c.rot);
  assert.strictEqual(a.length, 1); assert.strictEqual(a[0].sh, "C"); assert.strictEqual(LEVELS[0].par, 1);
  const b = E.makeState(LEVELS[15]).cells.filter((c) => c && c.sl);
  assert.strictEqual(b.length, 1); assert.strictEqual(LEVELS[15].par, 1);
});

console.log(`\n${fail ? "❌" : "✅"} ${pass}개 통과 · ${fail}개 실패`);
process.exit(fail ? 1 : 0);
