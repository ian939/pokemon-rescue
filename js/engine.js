/* 포켓몬 구조대 — 퍼즐 엔진 (화면과 분리, Node 에서도 돈다)
 *
 * 판: n×n 칸, 행 우선. 출발 문(start)과 센터 문(goal)은 판 바깥 테두리에 있다.
 *   { side: "W", at: 1 } = 왼쪽 바깥, 위에서 1번째 줄(0부터) 옆.
 * 칸 하나 = 글자 토큰 (data/levels.js 에 이 모양으로 저장)
 *   "."   빈칸(밀기용 구멍)
 *   "#t" / "#r" / "#b"   나무 / 바위 / 덤불 (고정 장애물)
 *   "C1r" = 모양 C(곡선) · 방향 1 · r(돌릴 수 있음)   s(밀 수 있음)  b(다리 — 고정 길, 그림만 다름)
 *   모양: S 직선(N·S) · C 곡선(N·E) · T 세갈래(E·S·W) · X 십자. 방향 r = 시계방향 90°×r
 * 방향 번호: 0 N(위) · 1 E(오른쪽) · 2 S(아래) · 3 W(왼쪽)
 */
(function (root) {
  "use strict";

  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];
  const SIDE = { N: 0, E: 1, S: 2, W: 3 };
  const SHAPES = { S: [0, 2], C: [0, 1], T: [1, 2, 3], X: [0, 1, 2, 3] };
  const PERIOD = { S: 2, C: 4, T: 4, X: 1 };

  // ---------- 토큰 ↔ 타일 ----------
  function parseCell(tok, id) {
    if (tok === "." || tok == null) return null;
    if (tok[0] === "#") return { id, ob: tok[1] || "t" };
    const m = /^([SCTX])([0-3])([rsb]*)$/.exec(tok);
    if (!m) throw new Error("모르는 칸: " + tok);
    return { id, sh: m[1], r: +m[2], rot: m[3].includes("r"), sl: m[3].includes("s"), br: m[3].includes("b") };
  }
  function cellToken(t) {
    if (!t) return ".";
    if (t.ob) return "#" + t.ob;
    return t.sh + t.r + (t.rot ? "r" : "") + (t.sl ? "s" : "") + (t.br ? "b" : "");
  }
  /** 레벨 → 처음 상태 (레벨 정의는 건드리지 않는다) */
  function makeState(level) {
    return { n: level.n, cells: level.cells.map((tok, i) => parseCell(tok, "t" + i)) };
  }

  const isPath = (t) => !!(t && t.sh);
  function ports(t) { return isPath(t) ? SHAPES[t.sh].map((d) => (d + t.r) % 4) : []; }
  function hasPort(t, d) { return isPath(t) && SHAPES[t.sh].some((p) => (p + t.r) % 4 === d); }
  function neighbor(n, i, d) {
    const x = (i % n) + DX[d], y = Math.floor(i / n) + DY[d];
    return x < 0 || y < 0 || x >= n || y >= n ? -1 : y * n + x;
  }
  /** 문과 맞닿은 칸 번호 */
  function gateCell(n, g) {
    const s = SIDE[g.side];
    if (s === 3) return g.at * n;
    if (s === 1) return g.at * n + n - 1;
    if (s === 0) return g.at;
    return (n - 1) * n + g.at;
  }

  // ---------- 연결 판정 ----------
  /**
   * 출발 문에서 이어진 길을 찾는다.
   *  lit    : 출발 문부터 포트가 서로 맞닿아 이어진 칸들
   *  win    : 센터 문까지 이어졌나
   *  path   : 걸어갈 칸 순서 (이어졌으면 센터까지 가장 짧은 길, 아니면 가장 멀리 간 칸까지)
   *  broken : 걸어간 끝 칸에서 끊긴 포트 [{ i, d }]
   * 분기에서 길이가 같으면 방향 N·E·S·W 순서로 정해 늘 같은 길을 걷는다.
   */
  function connect(state, level) {
    const n = state.n, cells = state.cells;
    const s = gateCell(n, level.start), g = gateCell(n, level.goal);
    const sd = SIDE[level.start.side], gd = SIDE[level.goal.side];
    const dist = new Array(n * n).fill(-1), prev = new Array(n * n).fill(-1);
    const q = [];
    if (hasPort(cells[s], sd)) { dist[s] = 0; q.push(s); }
    for (let k = 0; k < q.length; k++) {
      const i = q[k], t = cells[i];
      for (let d = 0; d < 4; d++) {
        if (!hasPort(t, d)) continue;
        const j = neighbor(n, i, d);
        if (j < 0 || dist[j] >= 0 || !hasPort(cells[j], (d + 2) % 4)) continue;
        dist[j] = dist[i] + 1; prev[j] = i; q.push(j);
      }
    }
    const lit = q.slice();
    const win = dist[g] >= 0 && hasPort(cells[g], gd);
    let end = -1;
    if (win) end = g;
    else for (const i of lit) if (end < 0 || dist[i] > dist[end]) end = i;
    const path = [];
    for (let i = end; i >= 0; i = prev[i]) path.unshift(i);
    const broken = [];
    if (!win && end >= 0) {
      for (const d of ports(cells[end])) {
        if (end === s && d === sd) continue;
        const j = neighbor(n, end, d);
        if (j >= 0 && hasPort(cells[j], (d + 2) % 4)) continue; // 이어진 쪽(왔던 길)
        broken.push({ i: end, d });
      }
    }
    return { lit, win, path, broken, startCell: s, goalCell: g };
  }

  // ---------- 조작 ----------
  /** 지금 할 수 있는 조작. ops = "r"(회전) · "s"(밀기) · "rs" */
  function actions(state, ops) {
    const out = [], n = state.n, cells = state.cells;
    if (ops.includes("r")) cells.forEach((t, i) => { if (isPath(t) && t.rot && PERIOD[t.sh] > 1) out.push({ t: "r", i }); });
    if (ops.includes("s")) cells.forEach((t, e) => {
      if (t) return;
      for (let d = 0; d < 4; d++) {
        const i = neighbor(n, e, d);
        if (i >= 0 && isPath(cells[i]) && cells[i].sl) out.push({ t: "s", i, to: e });
      }
    });
    return out;
  }
  function canRotate(state, i) { const t = state.cells[i]; return isPath(t) && t.rot; }
  /** i 칸 타일이 밀려 들어갈 수 있는 빈칸 (없으면 -1) */
  function slideTarget(state, i) {
    const t = state.cells[i];
    if (!isPath(t) || !t.sl) return -1;
    for (let d = 0; d < 4; d++) {
      const e = neighbor(state.n, i, d);
      if (e >= 0 && state.cells[e] === null) return e;
    }
    return -1;
  }
  /** 조작을 적용한 새 상태 (원래 상태는 그대로) */
  function apply(state, a) {
    const cells = state.cells.slice();
    if (a.t === "r") {
      const t = cells[a.i];
      if (!isPath(t) || !t.rot) throw new Error("돌릴 수 없는 칸 " + a.i);
      cells[a.i] = Object.assign({}, t, { r: (t.r + 1) % 4 });
    } else if (a.t === "s") {
      const t = cells[a.i];
      if (!isPath(t) || !t.sl || cells[a.to] !== null) throw new Error("밀 수 없는 칸 " + a.i);
      let adj = false;
      for (let d = 0; d < 4; d++) if (neighbor(state.n, a.i, d) === a.to) adj = true;
      if (!adj) throw new Error("빈칸과 붙어 있지 않음 " + a.i + "→" + a.to);
      cells[a.to] = t; cells[a.i] = null;
    } else throw new Error("모르는 조작 " + a.t);
    return { n: state.n, cells };
  }

  /** 같은 모양의 판은 같은 열쇠 (직선은 2방향, 십자는 1방향만 구분) */
  function key(state) {
    let s = "";
    for (const t of state.cells) {
      if (!t) s += ".";
      else if (t.ob) s += "#";
      else s += t.sh + (t.r % PERIOD[t.sh]) + (t.rot ? "r" : "") + (t.sl ? "s" : "") + (t.br ? "b" : "");
      s += ",";
    }
    return s;
  }

  // ---------- 솔버 ----------
  /**
   * BFS 로 가장 적은 조작 수를 찾는다.
   * 반환 { moves, actions } (처음부터 풀려 있으면 moves 0) · 못 찾으면 null
   */
  function solve(state, level, opt) {
    opt = opt || {};
    const maxDepth = opt.maxDepth || 16, maxStates = opt.maxStates || 400000;
    const ops = level.ops;
    if (connect(state, level).win) return { moves: 0, actions: [] };
    const seen = new Map();
    const k0 = key(state);
    seen.set(k0, null);
    let frontier = [state], depth = 0;
    while (frontier.length && depth < maxDepth) {
      depth++;
      const next = [];
      for (const st of frontier) {
        const kst = key(st);
        for (const a of actions(st, ops)) {
          const ns = apply(st, a);
          const k = key(ns);
          if (seen.has(k)) continue;
          seen.set(k, [kst, a]);
          if (connect(ns, level).win) {
            const acts = [];
            for (let kk = k; seen.get(kk); kk = seen.get(kk)[0]) acts.unshift(seen.get(kk)[1]);
            return { moves: acts.length, actions: acts };
          }
          next.push(ns);
          if (seen.size > maxStates) return null;
        }
      }
      frontier = next;
    }
    return null;
  }

  /** 레벨 정의 검사 — 문제 목록 (빈 배열이면 통과) */
  function validate(level) {
    const err = [];
    const n = level.n;
    if (!level.cells || level.cells.length !== n * n) err.push("칸 수가 n×n 이 아님");
    for (const g of [level.start, level.goal]) {
      if (!g || !(g.side in SIDE) || g.at < 0 || g.at >= n) err.push("문 위치가 잘못됨");
    }
    if (err.length) return err;
    if (level.start.side === level.goal.side && level.start.at === level.goal.at) err.push("출발과 센터가 같은 자리");
    let st;
    try { st = makeState(level); } catch (e) { return [e.message]; }
    if (!/^[rs]+$/.test(level.ops)) err.push("ops 가 잘못됨");
    st.cells.forEach((t, i) => {
      if (!isPath(t)) return;
      if (t.rot && !level.ops.includes("r")) err.push(`칸 ${i}: 이 레벨은 회전이 없는데 돌릴 수 있게 됨`);
      if (t.sl && !level.ops.includes("s")) err.push(`칸 ${i}: 이 레벨은 밀기가 없는데 밀 수 있게 됨`);
      if (t.br && (t.rot || t.sl)) err.push(`칸 ${i}: 다리는 고정이어야 함`);
    });
    if (level.ops.includes("s") && !st.cells.some((t) => t === null)) err.push("밀기 레벨에 빈칸이 없음");
    if (connect(st, level).win) err.push("처음부터 풀려 있음");
    return err;
  }

  const Engine = {
    DX, DY, SIDE, SHAPES, PERIOD,
    parseCell, cellToken, makeState, isPath, ports, hasPort, neighbor, gateCell,
    connect, actions, canRotate, slideTarget, apply, key, solve, validate,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof window !== "undefined" ? window : globalThis);
