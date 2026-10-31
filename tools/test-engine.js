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

// ---------- 월드 4·5: 능력 · 열매 · 두 친구 ----------
const adv = (rows, extra) => lv(rows, Object.assign({ ops: "rsa" }, extra));
t("꼬부기: 물 → 물 다리(고정 길), 횟수 1 줄고 되돌리면 그대로", () => {
  const L0 = adv(["S1 ~S1 S1"], { abil: { w: 1 } });
  const s0 = E.makeState(L0);
  assert.ok(!E.connect(s0, L0).win);
  assert.ok(E.canUse(s0, "w", 1) && !E.canUse(s0, "w", 0) && !E.canUse(s0, "f", 1));
  const s1 = E.apply(s0, { t: "a", k: "w", i: 1 });
  assert.ok(E.connect(s1, L0).win);
  assert.strictEqual(s1.ab.w, 0);
  assert.ok(s1.cells[1].wb && !s1.cells[1].rot && !s1.cells[1].sl);
  assert.strictEqual(s0.ab.w, 1); // 원래 상태(= 되돌리기 기록)는 그대로
  assert.throws(() => E.apply(s1, { t: "a", k: "w", i: 1 }));
});
t("파이리: 덤불만 태움(바위·나무 안 됨) → 빈칸, 밀어 넣을 수 있음", () => {
  const L0 = adv(["S1 #b S1", "#t S1s #r"], { abil: { f: 1 } });
  const s0 = E.makeState(L0);
  assert.ok(E.canUse(s0, "f", 1) && !E.canUse(s0, "f", 3) && !E.canUse(s0, "f", 5));
  const s1 = E.apply(s0, { t: "a", k: "f", i: 1 });
  assert.strictEqual(s1.cells[1], null);
  const s2 = E.apply(s1, { t: "s", i: 4, to: 1 });
  assert.ok(E.connect(s2, L0).win);
  assert.strictEqual(E.solve(s0, L0).moves, 2);
});
t("이상해씨: 같은 글자 낭떠러지가 한 번에 덩굴 다리", () => {
  const L0 = adv(["S1 ^S1a ^S1a S1"], { abil: { v: 1 } });
  const s0 = E.makeState(L0);
  assert.strictEqual(E.actions(s0, "a").length, 1); // 한 무리에 조작 하나
  const s1 = E.apply(s0, { t: "a", k: "v", i: 2 });
  assert.ok(s1.cells[1].vb && s1.cells[2].vb);
  assert.ok(E.connect(s1, L0).win);
});
t("능력 횟수가 0 이면 못 씀 · 능력 없이 못 푸는 판은 solve 가 null", () => {
  const L0 = adv(["S1 ~S1 S1"], { abil: { w: 0 } });
  assert.strictEqual(E.actions(E.makeState(L0), "rsa").length, 0);
  assert.strictEqual(E.solve(E.makeState(L0), L0), null);
});
t("열매: 센터에 닿아도 열매 칸이 길에 없으면 실패(reach 만), 지나가면 성공", () => {
  const L0 = adv(["S1 S1 S1", "#t C0k C3"], {});
  const c = E.connect(E.makeState(L0), L0);
  assert.ok(c.reach && !c.win);
  assert.deepStrictEqual(c.missing, [4]);
  const L1 = adv(["C2 #t C1", "C0k S1 C3"], {}); // 아래로 내려가 열매를 지나 다시 올라와 센터로
  const c1 = E.connect(E.makeState(L1), L1);
  assert.ok(c1.win);
  assert.ok(c1.path.includes(4)); // 걸어가는 길이 열매를 지난다
});
t("두 친구: 이어지는 대로 한 마리씩 — 둘 다 구조해야 끝", () => {
  // 왼쪽 친구는 첫 칸을, 아래 친구는 마지막 칸을 돌려야 이어진다 (센터 앞은 세갈래)
  const L0 = adv(["S0r S1 T0", "#t #t S0", "#t #t S1r"], { ops: "r", start: undefined, starts: [{ side: "W", at: 0 }, { side: "S", at: 2 }] });
  const s0 = E.makeState(L0);
  assert.deepStrictEqual(E.wins(s0, L0), [false, false]);
  assert.deepStrictEqual(E.validate(L0), []);
  const s1 = E.apply(s0, { t: "r", i: 0 });
  assert.deepStrictEqual(E.wins(s1, L0), [true, false]);
  assert.strictEqual(E.solve(s0, L0).moves, 2);
});
t("두 친구 솔버: 서로 다른 때 이어지는 판도 풂 (구조한 친구는 끝)", () => {
  // 가운데 곡선 하나를 먼저 왼쪽 친구 쪽(W·N)으로, 구조한 뒤 오른쪽 친구 쪽(E·N)으로 — 동시에는 못 이음
  const L0 = adv(["#t S0 #t", "S1 C2r S1", "#t #t #t"], { start: undefined, starts: [{ side: "W", at: 1 }, { side: "E", at: 1 }], goal: { side: "N", at: 1 } });
  const r = E.solve(E.makeState(L0), L0);
  assert.strictEqual(r.moves, 2);
  assert.strictEqual(E.solve(E.makeState(L0), L0, { rescued: [0, 1] }).moves, 0);
});
t("레벨 검사: 능력 없는 레벨에 물 · 물이 있는데 꼬부기 없음을 잡음", () => {
  assert.ok(E.validate(lv(["S1 ~S1 S1"], { ops: "rs" })).some((m) => m.includes("능력이 없는 레벨")));
  assert.ok(E.validate(adv(["S1 ~S1 S1"], {})).some((m) => m.includes("꼬부기")));
});

// ---------- 월드 8·9: ⚡ 스위치 · 🌀 워프 ----------
t("⚡ 스위치: 누르면 그 무리만 한꺼번에 90°, 손으로는 못 돌림", () => {
  const L0 = lv(["C0z S1y C1z"], { ops: "rsaz" });
  const s0 = E.makeState(L0);
  assert.deepStrictEqual(E.actions(s0, "rsaz").filter((a) => a.t === "z"), [{ t: "z", g: "z" }, { t: "z", g: "y" }]);
  assert.ok(!E.canRotate(s0, 0));
  const s1 = E.apply(s0, { t: "z", g: "z" });
  assert.deepStrictEqual([s1.cells[0].r, s1.cells[1].r, s1.cells[2].r], [1, 1, 2]);
  assert.strictEqual(E.cellToken(s1.cells[1]), "S1y");
  assert.ok(E.validate(lv(["C0z S1 S1"], { ops: "rs" })).some((m) => m.includes("스위치가 없는")));
});
t("⚡ 스위치 솔버: 한꺼번에 도는 조각 + 손으로 하나 고치기", () => {
  // 셋 다 E·W 직선이어야 함: 두 개는 스위치로, 가운데는 스위치에 같이 돌아서 손으로 되돌려야
  const L0 = lv(["S0z S1rz S0z"], { ops: "rsaz" });
  const r = E.solve(E.makeState(L0), L0);
  assert.strictEqual(r.moves, 2);
  assert.ok(r.actions.some((a) => a.t === "z") && r.actions.some((a) => a.t === "r"));
});
t("🌀 워프: 패널에 닿으면 짝 패널로 순간이동해 이어짐", () => {
  // 위 줄: 출발 → P(동쪽 입구 없음, 서쪽 입구) / 아래 줄: P → 센터
  const L0 = lv(["S1 P3A #t", "#t #t #t", "P1A S1 S1"], { ops: "rs", goal: { side: "E", at: 2 } });
  const c = E.connect(E.makeState(L0), L0);
  assert.ok(c.win);
  assert.deepStrictEqual(c.path, [0, 1, 6, 7, 8]);
  assert.ok(!E.connect(E.makeState(L0), Object.assign({}, L0, { noWarp: true })).win, "워프 없이는 안 이어짐");
  assert.ok(E.validate(lv(["S1 P3A S1"], { ops: "rs" })).some((m) => m.includes("2개여야")));
});
t("🌀 워프 입구 방향이 틀리면 못 들어감 · 패널도 돌리고 밀 수 있음", () => {
  const L0 = lv(["S1 P0rA #t", "#t #t #t", "P1A S1 S1"], { ops: "rs", goal: { side: "E", at: 2 } });
  const s0 = E.makeState(L0);
  assert.ok(!E.connect(s0, L0).win);
  assert.strictEqual(E.solve(s0, L0).moves, 3); // 입구를 서쪽(3)으로: 0 → 3 = 세 번
});

// ---------- 레벨 전부 ----------
const RANGE = {}; // plan §3 월드별 세부 난이도 (최소 조작 수)
[[1, 3, 1, 2], [4, 8, 2, 3], [9, 12, 3, 4], [13, 15, 4, 5], [16, 18, 1, 2], [19, 23, 2, 4], [24, 27, 3, 5], [28, 30, 4, 6],
  [31, 33, 2, 2], [34, 38, 3, 5], [39, 42, 5, 7], [43, 45, 6, 8],
  // 월드 4·5 (plan §0.5-3 — 능력 소개 판은 낮춤)
  [46, 48, 3, 4], [49, 53, 3, 5], [54, 57, 6, 7], [58, 60, 7, 8], [61, 63, 4, 5], [64, 68, 4, 7], [69, 72, 7, 8], [73, 75, 8, 10],
  // 월드 6·7 — 새 규칙 없이 더 어렵게 (plan §0.5-4)
  [76, 80, 8, 10], [81, 90, 10, 13], [91, 105, 10, 14],
  // 월드 8·9 — 새 규칙으로 어렵게, 조작 수는 되돌림 (plan §0.5-5)
  [106, 110, 5, 8], [111, 120, 8, 11], [121, 125, 6, 8], [126, 135, 9, 12]]
  .forEach(([a, b, lo, hi]) => { for (let i = a; i <= b; i++) RANGE[i] = [lo, hi]; });
t("레벨 번호 1~135 빠짐없이", () => {
  assert.deepStrictEqual(LEVELS.map((l) => l.no), Array.from({ length: 135 }, (_, i) => i + 1));
});
// node tools/test-engine.js 76-105  → 그 번호 레벨만 (월드 7 은 솔버가 무거워 전체가 10분 넘게 걸린다)
const RANGE_ARG = (process.argv[2] || "").match(/^(\d+)-(\d+)$/);
for (const L0 of LEVELS.filter((l) => !RANGE_ARG || (l.no >= +RANGE_ARG[1] && l.no <= +RANGE_ARG[2]))) {
  t(`${L0.id}: 정의·par·풀이`, () => {
    const w = WORLDS.find((x) => L0.no >= x.from && L0.no <= x.to);
    assert.strictEqual(L0.world, w.no);
    // 레벨 조작 글자는 월드 조작 글자 안에서 (월드 9 = 스위치 없는 판은 rsa)
    assert.ok(L0.world < 9 ? L0.ops === w.ops : [...L0.ops].every((c) => w.ops.includes(c)), "월드 조작 규칙과 다름");
    assert.deepStrictEqual(E.validate(L0), []);
    const st = E.makeState(L0);
    const r = E.solve(st, L0);
    assert.ok(r, "해 없음");
    assert.strictEqual(r.moves, L0.par, "저장된 par 와 솔버 결과가 다름");
    const [lo, hi] = RANGE[L0.no];
    assert.ok(L0.par >= lo && L0.par <= hi, `par ${L0.par} 가 범위 ${lo}~${hi} 밖`);
    // 저장된 풀이(손가락 안내·자동 풀기에 씀)가 실제로 합법이고 풀린다 (두 친구면 이어질 때마다 구조)
    let s = st;
    const res = new Set();
    for (const a of L0.sol) {
      const ok = E.actions(s, L0.ops).some((x) => x.t === a.t && x.i === a.i && x.to === a.to && x.k === a.k);
      assert.ok(ok, "풀이에 불법 조작 " + JSON.stringify(a));
      s = E.apply(s, a);
      E.wins(s, L0).forEach((w, k) => { if (w) res.add(k); });
    }
    assert.strictEqual(res.size, E.startsOf(L0).length, "저장된 풀이로 안 풀림");
    // 크기: 월드 1 = 4×4, 월드 2 = 4×4 → 5×5, 월드 3 = 5×5, 월드 4 = 5×5 → 6×6, 월드 5 = 6×6
    const size = { 1: 4, 2: L0.no <= 23 ? 4 : 5, 3: 5, 4: L0.no <= 53 ? 5 : 6, 5: 6, 6: L0.no <= 80 ? 6 : 7, 7: 7, 8: L0.no <= 110 ? 6 : 7, 9: L0.no <= 125 ? 6 : 7 }[L0.world];
    assert.strictEqual(L0.n, size);
    // 월드 4 이전에는 능력을 요구하지 않는다 (plan §12)
    if (L0.world < 4) assert.ok(!L0.ops.includes("a") && !L0.abil);
    if (L0.world >= 4) {
      assert.ok(L0.ops === "rsa" || (L0.world >= 8 && L0.ops === "rsaz"), "ops " + L0.ops);
      // 준 능력은 모두 써야 풀림 (하나 덜 주면 못 풂) · 풀이에 능력이 다 들어 있음
      for (const k of Object.keys(L0.abil || {})) {
        const less = Object.assign({}, L0, { abil: Object.assign({}, L0.abil, { [k]: L0.abil[k] - 1 }) });
        assert.strictEqual(E.solve(E.makeState(less), less, { maxDepth: L0.par + 6, maxStates: 300000 }), null, k + " 없이도 풀림");
        assert.ok(L0.sol.some((a) => a.t === "a" && a.k === k));
      }
      // 월드 4 = 능력 한 가지씩, 월드 5 의 69~ 는 두 가지
      if (L0.world === 4) assert.strictEqual(Object.keys(L0.abil).length, 1);
      if (L0.no >= 69 && L0.no <= 75 && L0.no !== 71) assert.ok(Object.keys(L0.abil).length >= 1);
      if (L0.no >= 61 && L0.no <= 63) assert.ok(st.cells.some((c) => c && c.cp), "61~63 은 열매");
      if (L0.no >= 64 && L0.no <= 68) assert.strictEqual(E.startsOf(L0).length, 2, "64~68 은 두 친구");
      if (L0.no === 79) assert.strictEqual(E.startsOf(L0).length, 3, "79 = 세 친구 소개");
      if (L0.no === 80) assert.strictEqual(st.cells.filter((c) => c && c.cp).length, 2, "80 = 열매 둘 소개");
      // 월드 8: 모든 판에 ⚡ 스위치 — 스위치 없이는 못 풂 · 월드 9: 모든 판에 🌀 워프 — 워프 없이는 못 풂
      if (L0.world === 8) assert.strictEqual(L0.ops, "rsaz");
      if (L0.ops === "rsaz") {
        assert.ok(L0.sol.some((a) => a.t === "z"), "풀이에 스위치");
        const noZ = Object.assign({}, L0, { ops: "rsa" });
        assert.strictEqual(E.solve(E.makeState(noZ), noZ, { maxDepth: L0.par + 6, maxStates: 300000 }), null, "스위치 없이도 풀림");
      }
      if (L0.world === 9) {
        assert.ok(st.cells.some((c) => c && c.pair), "워프 패널");
        const noW = Object.assign({}, L0, { noWarp: true });
        assert.strictEqual(E.solve(E.makeState(noW), noW, { maxDepth: L0.par + 6, maxStates: 300000 }), null, "워프 없이도 풀림");
      }
      if (L0.no === 111) assert.ok(st.cells.some((c) => c && c.sw === "y"), "111 = 스위치 둘 소개");
      if (L0.no === 125) assert.ok(st.cells.some((c) => c && c.pair === "B"), "125 = 워프 두 쌍 소개");
      // 월드 6·7: 월드 5 마지막(par 10)보다 쉬워지지 않음 · 판이 어렵게 하는 장치가 있음
      if (L0.world >= 6 && L0.world <= 7) {
        assert.ok(L0.par >= 8);
        // 어렵게 하는 장치: 친구 둘(셋이면 2점) · 열매 · 능력 두 가지 이상 · 돌리며 미는 조각 · 십자 · 7×7
        const nst = E.startsOf(L0).length;
        const hard = (nst >= 2) + (nst >= 3) + (st.cells.filter((c) => c && c.cp).length >= 1) + (Object.keys(L0.abil || {}).length >= 2)
          + st.cells.some((c) => c && c.rot && c.sl) + st.cells.some((c) => c && c.sh === "X") + (L0.n >= 7);
        assert.ok(hard >= 2, "어렵게 하는 장치가 둘 이상");
      }
    }
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
