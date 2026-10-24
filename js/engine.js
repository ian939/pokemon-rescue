/* 포켓몬 구조대 — 퍼즐 엔진 (화면과 분리, Node 에서도 돈다)
 *
 * 판: n×n 칸, 행 우선. 출발 문과 센터 문(goal)은 판 바깥 테두리에 있다.
 *   { side: "W", at: 1 } = 왼쪽 바깥, 위에서 1번째 줄(0부터) 옆.
 *   출발 문이 둘이면 level.starts = [문, 문] (월드 5 두 친구 구조 — 이어지는 대로 한 마리씩 구조)
 * 칸 하나 = 글자 토큰 (data/levels.js 에 이 모양으로 저장)
 *   "."   빈칸(밀기용 구멍)
 *   "#t" / "#r" / "#b"   나무 / 바위 / 덤불 (고정 장애물 — 덤불은 파이리가 태우면 빈칸)
 *   "C1r" = 모양 C(곡선) · 방향 1 · r(돌릴 수 있음)   s(밀 수 있음)  b(다리 — 고정 길, 그림만 다름)
 *         k(체크포인트 열매 — 길이 꼭 지나가야 함)  w(꼬부기가 놓은 물 다리)  v(이상해씨 덩굴 다리)
 *   "~S1"  물 — 꼬부기가 쓰면 그 자리가 S1 물 다리(고정 길)가 된다
 *   "^S0a" 낭떠러지 — 이상해씨가 쓰면 같은 글자(a) 낭떠러지가 한꺼번에 덩굴 다리가 된다
 *   모양: S 직선(N·S) · C 곡선(N·E) · T 세갈래(E·S·W) · X 십자. 방향 r = 시계방향 90°×r
 * 능력 횟수: level.abil = { w: 꼬부기, f: 파이리, v: 이상해씨 } (월드 4~)
 * 방향 번호: 0 N(위) · 1 E(오른쪽) · 2 S(아래) · 3 W(왼쪽)
 */
(function (root) {
  "use strict";

  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];
  const SIDE = { N: 0, E: 1, S: 2, W: 3 };
  const SHAPES = { S: [0, 2], C: [0, 1], T: [1, 2, 3], X: [0, 1, 2, 3] };
  const PERIOD = { S: 2, C: 4, T: 4, X: 1 };
  const ABIL = ["w", "f", "v"];

  // ---------- 토큰 ↔ 타일 ----------
  function parseCell(tok, id) {
    if (tok === "." || tok == null) return null;
    if (tok[0] === "#") return { id, ob: tok[1] || "t" };
    let m = /^~([SCTX])([0-3])$/.exec(tok);
    if (m) return { id, wa: { sh: m[1], r: +m[2] } };
    m = /^\^([SCTX])([0-3])([a-z])$/.exec(tok);
    if (m) return { id, pit: { sh: m[1], r: +m[2], g: m[3] } };
    m = /^([SCTX])([0-3])([rsbkwv]*)$/.exec(tok);
    if (!m) throw new Error("모르는 칸: " + tok);
    const f = m[3];
    const t = { id, sh: m[1], r: +m[2], rot: f.includes("r"), sl: f.includes("s"), br: f.includes("b") };
    if (f.includes("k")) t.cp = true;
    if (f.includes("w")) t.wb = true;
    if (f.includes("v")) t.vb = true;
    return t;
  }
  function cellToken(t) {
    if (!t) return ".";
    if (t.ob) return "#" + t.ob;
    if (t.wa) return "~" + t.wa.sh + t.wa.r;
    if (t.pit) return "^" + t.pit.sh + t.pit.r + t.pit.g;
    return t.sh + t.r + (t.rot ? "r" : "") + (t.sl ? "s" : "") + (t.br ? "b" : "") + (t.cp ? "k" : "") + (t.wb ? "w" : "") + (t.vb ? "v" : "");
  }
  /** 레벨 → 처음 상태 (레벨 정의는 건드리지 않는다) */
  function makeState(level) {
    const ab = {};
    for (const k of ABIL) ab[k] = (level.abil && level.abil[k]) || 0;
    return { n: level.n, cells: level.cells.map((tok, i) => parseCell(tok, "t" + i)), ab };
  }
  const startsOf = (level) => level.starts || [level.start];

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
  /** 칸 a 에서 이어진 길을 따라 BFS (거리·직전 칸) */
  function bfsFrom(state, a) {
    const n = state.n, cells = state.cells;
    const dist = new Array(n * n).fill(-1), prev = new Array(n * n).fill(-1);
    const q = [a];
    dist[a] = 0;
    for (let k = 0; k < q.length; k++) {
      const i = q[k], t = cells[i];
      for (let d = 0; d < 4; d++) {
        if (!hasPort(t, d)) continue;
        const j = neighbor(n, i, d);
        if (j < 0 || dist[j] >= 0 || !hasPort(cells[j], (d + 2) % 4)) continue;
        dist[j] = dist[i] + 1; prev[j] = i; q.push(j);
      }
    }
    return { dist, prev, order: q };
  }
  function pathTo(prev, end) { const p = []; for (let i = end; i >= 0; i = prev[i]) p.unshift(i); return p; }

  /**
   * 출발 문(gi 번째)에서 이어진 길을 찾는다.
   *  lit     : 출발 문부터 포트가 서로 맞닿아 이어진 칸들
   *  reach   : 센터 문까지 이어졌나 (열매 무시)
   *  win     : 센터까지 이어졌고 열매(체크포인트)도 모두 길 위에 있나
   *  missing : 길에 안 들어온 열매 칸
   *  path    : 걸어갈 칸 순서 — 이어졌으면 출발 → 열매(가까운 순) → 센터, 아니면 가장 멀리 간 칸까지
   *  broken  : 걸어간 끝 칸에서 끊긴 포트 [{ i, d }]
   * 분기에서 길이가 같으면 방향 N·E·S·W 순서로 정해 늘 같은 길을 걷는다.
   */
  function connect(state, level, gi) {
    const n = state.n, cells = state.cells;
    const st = startsOf(level)[gi || 0];
    const s = gateCell(n, st), g = gateCell(n, level.goal);
    const sd = SIDE[st.side], gd = SIDE[level.goal.side];
    let lit = [], dist = null, prev = null;
    if (hasPort(cells[s], sd)) ({ dist, prev, order: lit } = bfsFrom(state, s));
    const litSet = new Set(lit);
    const reach = litSet.has(g) && hasPort(cells[g], gd);
    const cps = [];
    cells.forEach((t, i) => { if (t && t.cp) cps.push(i); });
    const missing = cps.filter((i) => !litSet.has(i));
    const win = reach && missing.length === 0;
    let path = [];
    if (reach) {
      // 출발 → 열매들(가까운 순) → 센터. 열매를 주우러 갔다가 돌아 나올 수도 있다
      let cur = s, todo = cps.filter((i) => litSet.has(i));
      path = [s];
      let b = { dist, prev };
      while (todo.length) {
        todo.sort((x, y) => b.dist[x] - b.dist[y] || x - y);
        const nx = todo.shift();
        path = path.concat(pathTo(b.prev, nx).slice(1));
        cur = nx;
        b = bfsFrom(state, cur);
      }
      path = path.concat(pathTo(b.prev, g).slice(1));
    } else if (lit.length) {
      let end = -1;
      for (const i of lit) if (end < 0 || dist[i] > dist[end]) end = i;
      path = pathTo(prev, end);
    }
    const broken = [];
    if (!reach && path.length) {
      const end = path[path.length - 1];
      for (const d of ports(cells[end])) {
        if (end === s && d === sd) continue;
        const j = neighbor(n, end, d);
        if (j >= 0 && hasPort(cells[j], (d + 2) % 4)) continue; // 이어진 쪽(왔던 길)
        broken.push({ i: end, d });
      }
    }
    return { lit, reach, win, missing, path, broken, startCell: s, goalCell: g };
  }
  /** 출발 문마다 지금 구조할 수 있나 (true/false 배열) */
  function wins(state, level) { return startsOf(level).map((_, k) => connect(state, level, k).win); }

  // ---------- 조작 ----------
  /** 지금 할 수 있는 조작. ops = "r"(회전) · "s"(밀기) · "a"(능력) 를 섞어 쓴 글자 */
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
    if (ops.includes("a") && state.ab) {
      const seenG = new Set();
      cells.forEach((t, i) => {
        if (!t) return;
        if (t.wa && state.ab.w > 0) out.push({ t: "a", k: "w", i });
        if (t.ob === "b" && state.ab.f > 0) out.push({ t: "a", k: "f", i });
        if (t.pit && state.ab.v > 0 && !seenG.has(t.pit.g)) { seenG.add(t.pit.g); out.push({ t: "a", k: "v", i }); }
      });
    }
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
  /** 능력 k 를 i 칸에 쓸 수 있나 */
  function canUse(state, k, i) {
    const t = state.cells[i];
    if (!t || !state.ab || !(state.ab[k] > 0)) return false;
    return (k === "w" && !!t.wa) || (k === "f" && t.ob === "b") || (k === "v" && !!t.pit);
  }
  /** 조작을 적용한 새 상태 (원래 상태는 그대로) */
  function apply(state, a) {
    const cells = state.cells.slice();
    let ab = state.ab;
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
    } else if (a.t === "a") {
      if (!canUse(state, a.k, a.i)) throw new Error("능력을 쓸 수 없음 " + a.k + "@" + a.i);
      const t = cells[a.i];
      if (a.k === "w") cells[a.i] = { id: t.id, sh: t.wa.sh, r: t.wa.r, rot: false, sl: false, br: false, wb: true };
      else if (a.k === "f") cells[a.i] = null;
      else cells.forEach((c, j) => {
        if (c && c.pit && c.pit.g === t.pit.g) cells[j] = { id: c.id, sh: c.pit.sh, r: c.pit.r, rot: false, sl: false, br: false, vb: true };
      });
      ab = Object.assign({}, ab, { [a.k]: ab[a.k] - 1 });
    } else throw new Error("모르는 조작 " + a.t);
    return { n: state.n, cells, ab };
  }

  /** 같은 모양의 판은 같은 열쇠 (직선은 2방향, 십자는 1방향만 구분) */
  function key(state) {
    let s = "";
    for (const t of state.cells) {
      if (!t) s += ".";
      else if (t.ob) s += "#" + t.ob;
      else if (t.wa) s += "~";
      else if (t.pit) s += "^";
      else s += t.sh + (t.r % PERIOD[t.sh]) + (t.rot ? "r" : "") + (t.sl ? "s" : "") + (t.cp ? "k" : "");
      s += ",";
    }
    if (state.ab) s += state.ab.w + "" + state.ab.f + state.ab.v;
    return s;
  }

  // ---------- 솔버 ----------
  /**
   * BFS 로 가장 적은 조작 수를 찾는다. 출발 문이 여럿이면 이어지는 대로 한 마리씩 구조(구조된 문은 끝)한다고 본다.
   * opt.rescued = 이미 구조한 문 번호 배열 (화면에서 중간부터 힌트를 볼 때)
   * 반환 { moves, actions } (처음부터 다 풀려 있으면 moves 0) · 못 찾으면 null
   */
  function solve(state, level, opt) {
    opt = opt || {};
    const maxDepth = opt.maxDepth || 16, maxStates = opt.maxStates || 400000;
    const ops = level.ops;
    const G = startsOf(level).length, ALL = (1 << G) - 1;
    const mark = (st, res) => {
      for (let k = 0; k < G; k++) if (!(res & (1 << k)) && connect(st, level, k).win) res |= 1 << k;
      return res;
    };
    let res0 = 0;
    for (const k of opt.rescued || []) res0 |= 1 << k;
    res0 = mark(state, res0);
    if (res0 === ALL) return { moves: 0, actions: [] };
    const seen = new Map();
    const k0 = key(state) + "|" + res0;
    seen.set(k0, null);
    let frontier = [[state, res0, k0]], depth = 0;
    while (frontier.length && depth < maxDepth) {
      depth++;
      const next = [];
      for (const [st, res, kst] of frontier) {
        for (const a of actions(st, ops)) {
          const ns = apply(st, a);
          const nres = mark(ns, res);
          const k = key(ns) + "|" + nres;
          if (seen.has(k)) continue;
          seen.set(k, [kst, a]);
          if (nres === ALL) {
            const acts = [];
            for (let kk = k; seen.get(kk); kk = seen.get(kk)[0]) acts.unshift(seen.get(kk)[1]);
            return { moves: acts.length, actions: acts };
          }
          next.push([ns, nres, k]);
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
    const gates = startsOf(level).concat([level.goal]);
    for (const g of gates) {
      if (!g || !(g.side in SIDE) || g.at < 0 || g.at >= n) err.push("문 위치가 잘못됨");
    }
    if (err.length) return err;
    const gk = gates.map((g) => g.side + g.at);
    if (new Set(gk).size !== gk.length) err.push("문끼리 같은 자리");
    let st;
    try { st = makeState(level); } catch (e) { return [e.message]; }
    if (!/^[rsa]+$/.test(level.ops)) err.push("ops 가 잘못됨");
    st.cells.forEach((t, i) => {
      if (!t) return;
      if (isPath(t)) {
        if (t.rot && !level.ops.includes("r")) err.push(`칸 ${i}: 이 레벨은 회전이 없는데 돌릴 수 있게 됨`);
        if (t.sl && !level.ops.includes("s")) err.push(`칸 ${i}: 이 레벨은 밀기가 없는데 밀 수 있게 됨`);
        if ((t.br || t.cp || t.wb || t.vb) && (t.rot || t.sl)) err.push(`칸 ${i}: 다리·열매 칸은 고정이어야 함`);
      }
      if ((t.wa || t.pit) && !level.ops.includes("a")) err.push(`칸 ${i}: 능력이 없는 레벨에 물·낭떠러지`);
    });
    const ab = st.ab;
    if (st.cells.some((t) => t && t.wa) && !ab.w) err.push("물이 있는데 꼬부기 능력이 없음");
    if (st.cells.some((t) => t && t.pit) && !ab.v) err.push("낭떠러지가 있는데 이상해씨 능력이 없음");
    if ((ab.w || ab.f || ab.v) && !level.ops.includes("a")) err.push("능력 횟수가 있는데 ops 에 a 가 없음");
    if (level.ops.includes("s") && !st.cells.some((t) => t === null) && !ab.f) err.push("밀기 레벨에 빈칸이 없음");
    if (wins(st, level).some(Boolean)) err.push("처음부터 풀려 있음");
    return err;
  }

  const Engine = {
    DX, DY, SIDE, SHAPES, PERIOD, ABIL,
    parseCell, cellToken, makeState, startsOf, isPath, ports, hasPort, neighbor, gateCell,
    connect, wins, actions, canRotate, slideTarget, canUse, apply, key, solve, validate,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof window !== "undefined" ? window : globalThis);
