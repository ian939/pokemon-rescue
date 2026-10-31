/* 레벨 생성기 + 솔버 선별 → data/levels.js
 *
 *   node tools/gen-levels.js                  # 새로 추가한 레벨만 만든다 (data/levels.js 에 있는 레벨은 그대로 둔다)
 *   node tools/gen-levels.js --redo L97,L105  # 그 레벨만 다시 만든다 (설정을 바꿨을 때)
 *   node tools/gen-levels.js --all            # 전부 다시 — 월드 7 은 몇 시간 걸린다 (L105 한 판에 10시간)
 *   node tools/gen-levels.js L61              # 한 레벨만 시험 삼아 만들어 본다 (파일은 안 씀)
 * 이미 배포된 레벨이 바뀌면 아이의 별·기록이 엉뚱한 판에 붙으므로 기본은 "있는 건 그대로".
 *
 * 방법: 정답 길(출발 문 → 센터 문)을 먼저 깔고 → 나머지 칸을 장애물·곁가지로 채우고 →
 *       월드 1은 돌릴 수 있는 칸을 섞고, 월드 2는 빈칸을 무작위로 돌아다니게 해 섞고, 월드 3은 둘 다 →
 *       솔버(BFS)로 잰 최소 조작 수가 그 레벨의 목표(par)와 같은 것만 고른다.
 *       월드 3은 "회전만으로도, 밀기만으로도 안 풀리는" 판만 고른다 (plan §12 두 조작 모두 필요).
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
const W3 = [
  // 월드 3 반짝 동굴 — 회전+밀기, 5×5. kr/ks = 돌릴/밀 정답 길 칸 수, dr/ds = 돌릴/밀 곁가지 수, tee = 세갈래로 바꿀 정답 길 칸 수
  // 돌리는 조각과 미는 조각은 따로 (한 조각이 둘 다 되면 헷갈림). 31~33 = 회전 1 + 밀기 1
  { id: "L32", par: 2, kr: 1, ks: 1, dr: 0, ds: 0, tee: 0, len: [5, 7], gates: WE },
  { id: "L33", par: 2, kr: 1, ks: 1, dr: 1, ds: 0, tee: 1, len: [6, 8], gates: WE },
  { id: "L34", par: 3, kr: 1, ks: 2, dr: 1, ds: 1, tee: 1, len: [6, 8], gates: MIX },
  { id: "L35", par: 3, kr: 2, ks: 1, dr: 1, ds: 1, tee: 1, len: [6, 8], gates: MIX },
  { id: "L36", par: 4, kr: 2, ks: 2, dr: 1, ds: 1, tee: 1, len: [6, 9], gates: MIX },
  { id: "L37", par: 4, kr: 2, ks: 2, dr: 2, ds: 1, tee: 2, len: [6, 9], gates: MIX },
  { id: "L38", par: 5, kr: 2, ks: 2, dr: 2, ds: 1, tee: 2, len: [7, 9], gates: MIX },
  { id: "L39", par: 5, kr: 2, ks: 3, dr: 2, ds: 2, tee: 2, len: [7, 10], gates: MIX },
  { id: "L40", par: 5, kr: 3, ks: 2, dr: 2, ds: 2, tee: 2, len: [7, 10], gates: MIX },
  { id: "L41", par: 6, kr: 3, ks: 2, dr: 2, ds: 2, tee: 2, len: [7, 10], gates: MIX },
  { id: "L42", par: 6, kr: 3, ks: 3, dr: 2, ds: 2, tee: 3, len: [7, 10], gates: MIX },
  { id: "L43", par: 6, kr: 3, ks: 3, dr: 3, ds: 2, tee: 3, len: [8, 11], gates: MIX },
  { id: "L44", par: 7, kr: 3, ks: 3, dr: 3, ds: 2, tee: 3, len: [8, 11], gates: MIX },
  { id: "L45", par: 8, kr: 4, ks: 3, dr: 3, ds: 2, tee: 3, len: [8, 11], gates: MIX },
];
const W4 = [
  // 월드 4 눈꽃 설산 — 회전+밀기+능력 한 가지씩. 46~48 꼬부기(물 다리) · 49~51 파이리(덤불) · 52~53 이상해씨(덩굴) 소개, 54~ 섞어서
  // 능력 1회 = 조작 1번. 능력 소개 판(46·49·52)은 plan §3 보다 낮춤 (새 능력을 익히는 판)
  { id: "L46", n: 5, par: 3, abil: { w: 1 }, kr: 1, ks: 1, len: [5, 7], gates: WE },
  { id: "L47", n: 5, par: 3, abil: { w: 1 }, kr: 1, ks: 1, len: [5, 8], gates: WE },
  { id: "L48", n: 5, par: 4, abil: { w: 1 }, kr: 2, ks: 1, tee: 1, len: [6, 8], gates: MIX },
  { id: "L49", n: 5, par: 3, abil: { f: 1 }, kr: 1, ks: 1, len: [5, 7], gates: WE },
  { id: "L50", n: 5, par: 4, abil: { f: 1 }, kr: 2, ks: 1, dr: 1, len: [6, 8], gates: MIX },
  { id: "L51", n: 5, par: 5, abil: { f: 1 }, kr: 2, ks: 2, ds: 1, tee: 1, len: [6, 9], gates: MIX },
  { id: "L52", n: 5, par: 3, abil: { v: 1 }, kr: 1, ks: 1, len: [6, 8], gates: WE },
  { id: "L53", n: 5, par: 5, abil: { v: 1 }, kr: 2, ks: 1, dr: 1, tee: 1, len: [6, 9], gates: MIX },
  { id: "L54", n: 6, par: 6, abil: { w: 1 }, kr: 2, ks: 2, dr: 1, ds: 1, tee: 1, len: [7, 10], gates: MIX },
  { id: "L55", n: 6, par: 6, abil: { f: 1 }, kr: 2, ks: 2, dr: 1, tee: 1, len: [7, 10], gates: MIX },
  { id: "L56", n: 6, par: 7, abil: { v: 1 }, kr: 3, ks: 2, dr: 1, ds: 1, tee: 2, len: [8, 11], gates: MIX },
  { id: "L57", n: 6, par: 7, abil: { w: 1 }, kr: 3, ks: 2, dr: 1, tee: 2, len: [8, 11], gates: MIX },
  { id: "L58", n: 6, par: 7, abil: { f: 1 }, kr: 2, ks: 2, dr: 2, ds: 1, tee: 2, len: [8, 11], gates: MIX },
  { id: "L59", n: 6, par: 8, abil: { v: 1 }, kr: 3, ks: 2, dr: 1, ds: 1, tee: 2, len: [8, 12], gates: MIX },
  { id: "L60", n: 6, par: 8, abil: { w: 1 }, kr: 3, ks: 2, dr: 2, ds: 1, tee: 2, len: [8, 12], gates: MIX },
];
const W5 = [
  // 월드 5 포켓몬 마을 — 6×6. cp = 열매(체크포인트 — 정답 길 위 고정 칸) · starts 2 = 두 친구 · 69~ 두 능력 조합
  { id: "L61", n: 6, par: 4, cp: 1, kr: 2, ks: 1, len: [7, 10], gates: MIX },
  { id: "L62", n: 6, par: 5, cp: 1, kr: 2, ks: 1, dr: 1, len: [7, 10], gates: MIX },
  { id: "L63", n: 6, par: 5, cp: 1, kr: 2, ks: 2, tee: 1, len: [8, 11], gates: MIX },
  { id: "L64", n: 6, par: 4, starts: 2, kr: 2, ks: 1, len: [6, 9], gates: MIX },
  { id: "L65", n: 6, par: 5, starts: 2, kr: 2, ks: 1, dr: 1, len: [6, 9], gates: MIX },
  { id: "L66", n: 6, par: 6, starts: 2, kr: 2, ks: 2, tee: 1, len: [7, 10], gates: MIX },
  { id: "L67", n: 6, par: 6, starts: 2, cp: 1, kr: 2, ks: 1, len: [7, 10], gates: MIX },
  { id: "L68", n: 6, par: 7, starts: 2, kr: 3, ks: 2, dr: 1, len: [7, 10], gates: MIX },
  { id: "L69", n: 6, par: 7, cp: 1, abil: { w: 1, f: 1 }, kr: 2, ks: 1, len: [8, 11], gates: MIX },
  { id: "L70", n: 6, par: 7, abil: { f: 1, v: 1 }, kr: 2, ks: 1, len: [8, 11], gates: MIX },
  { id: "L71", n: 6, par: 8, starts: 2, abil: { w: 1 }, kr: 3, ks: 2, len: [7, 10], gates: MIX },
  { id: "L72", n: 6, par: 8, cp: 1, abil: { v: 1, w: 1 }, kr: 3, ks: 1, len: [9, 12], gates: MIX },
  { id: "L73", n: 6, par: 8, starts: 2, cp: 1, abil: { w: 1, f: 1 }, kr: 2, ks: 2, len: [8, 11], gates: MIX },
  { id: "L74", n: 6, par: 9, starts: 2, abil: { f: 1, v: 1 }, kr: 3, ks: 2, len: [8, 11], gates: MIX },
  { id: "L75", n: 6, par: 10, starts: 2, cp: 1, abil: { w: 1, v: 1 }, kr: 3, ks: 2, dr: 1, len: [9, 12], gates: MIX },
];
// 월드 6 불꽃 화산 · 7 별빛 하늘성 — 새 규칙 없이 더 어렵게 (사용자 확정 v2026-10-25a):
// 판 6×6 → 7×7, 최소 조작 8~14, 곁가지·세갈래·십자 늘리고, 돌리면서 밀기도 되는 조각(kb), 세 친구, 열매 둘, 능력 셋, 빈칸 둘
const L6 = [10, 15], L7 = [10, 16];
const W6 = [
  { id: "L76", n: 6, par: 8, abil: { w: 1 }, kr: 3, ks: 2, kb: 1, dr: 2, ds: 1, tee: 2, cross: 1, len: [8, 12], gates: MIX },
  { id: "L77", n: 6, par: 8, starts: 2, cp: 1, kr: 3, ks: 2, dr: 1, ds: 1, tee: 2, len: [8, 12], gates: MIX },
  { id: "L78", n: 6, par: 9, abil: { f: 1, v: 1 }, kr: 3, ks: 2, kb: 1, dr: 1, tee: 2, cross: 1, len: [8, 12], gates: MIX },
  { id: "L79", n: 6, par: 9, starts: 3, kr: 3, ks: 1, dr: 1, tee: 1, len: [7, 11], gates: MIX },
  { id: "L80", n: 6, par: 10, cp: 2, abil: { w: 1 }, kr: 3, ks: 2, kb: 1, dr: 2, ds: 1, tee: 2, len: [9, 12], gates: MIX },
  { id: "L81", n: 7, par: 10, abil: { f: 1 }, kr: 4, ks: 2, kb: 1, dr: 2, ds: 2, tee: 2, cross: 1, empty: 2, len: L6, gates: MIX },
  { id: "L82", n: 7, par: 10, starts: 2, cp: 1, abil: { v: 1 }, kr: 3, ks: 2, kb: 1, dr: 2, ds: 1, tee: 2, len: L6, gates: MIX },
  { id: "L83", n: 7, par: 11, starts: 3, abil: { w: 1 }, kr: 4, ks: 2, dr: 2, tee: 2, len: L6, gates: MIX },
  { id: "L84", n: 7, par: 11, cp: 2, abil: { f: 1, v: 1 }, kr: 4, ks: 2, kb: 1, dr: 2, ds: 1, tee: 2, cross: 1, len: L6, gates: MIX },
  { id: "L85", n: 7, par: 11, starts: 2, abil: { w: 1, f: 1, v: 1 }, kr: 3, ks: 2, kb: 1, dr: 2, ds: 1, tee: 2, len: L6, gates: MIX },
  { id: "L86", n: 7, par: 12, starts: 3, cp: 1, kr: 4, ks: 2, kb: 1, dr: 2, tee: 2, len: L6, gates: MIX },
  { id: "L87", n: 7, par: 12, cp: 2, abil: { w: 1, v: 1 }, kr: 4, ks: 2, kb: 2, dr: 2, ds: 2, tee: 3, cross: 1, empty: 2, len: L6, gates: MIX },
  { id: "L88", n: 7, par: 12, starts: 2, abil: { f: 1, v: 1 }, kr: 4, ks: 3, kb: 1, dr: 2, ds: 1, tee: 2, len: L6, gates: MIX },
  { id: "L89", n: 7, par: 13, starts: 3, cp: 1, abil: { w: 1, f: 1 }, kr: 4, ks: 2, kb: 1, dr: 2, ds: 1, tee: 3, len: L6, gates: MIX },
  { id: "L90", n: 7, par: 13, starts: 2, cp: 2, abil: { w: 1, f: 1, v: 1 }, kr: 4, ks: 2, kb: 2, dr: 2, ds: 2, tee: 3, cross: 1, len: L6, gates: MIX },
];
const W7 = [
  { id: "L91", n: 7, par: 10, starts: 2, abil: { w: 1, f: 1 }, kr: 4, ks: 2, kb: 1, dr: 2, ds: 2, tee: 2, cross: 1, len: L7, gates: MIX },
  { id: "L92", n: 7, par: 11, cp: 2, abil: { v: 1 }, kr: 4, ks: 3, kb: 1, dr: 2, ds: 1, tee: 2, len: L7, gates: MIX },
  { id: "L93", n: 7, par: 11, starts: 3, abil: { f: 1 }, kr: 4, ks: 2, kb: 1, dr: 2, tee: 2, len: L7, gates: MIX },
  { id: "L94", n: 7, par: 12, starts: 2, cp: 1, abil: { w: 1, v: 1 }, kr: 4, ks: 2, kb: 2, dr: 2, ds: 2, tee: 3, cross: 1, empty: 2, len: L7, gates: MIX },
  { id: "L95", n: 7, par: 12, abil: { w: 1, f: 1, v: 1 }, kr: 5, ks: 2, kb: 1, dr: 2, ds: 1, tee: 3, len: L7, gates: MIX },
  { id: "L96", n: 7, par: 12, starts: 3, cp: 2, kr: 5, ks: 2, kb: 1, dr: 2, tee: 2, len: L7, gates: MIX },
  { id: "L97", n: 7, par: 13, starts: 2, abil: { f: 1, v: 1 }, kr: 5, ks: 3, kb: 1, dr: 2, ds: 2, tee: 3, cross: 1, len: L7, gates: MIX },
  { id: "L98", n: 7, par: 13, starts: 3, cp: 1, abil: { w: 1 }, kr: 4, ks: 3, kb: 2, dr: 2, ds: 1, tee: 3, len: L7, gates: MIX },
  { id: "L99", n: 7, par: 13, cp: 2, abil: { w: 1, f: 1, v: 1 }, kr: 5, ks: 2, kb: 1, dr: 3, ds: 2, tee: 3, cross: 1, empty: 2, len: L7, gates: MIX },
  { id: "L100", n: 7, par: 14, starts: 2, cp: 1, abil: { w: 1, f: 1 }, kr: 5, ks: 3, kb: 1, dr: 2, ds: 2, tee: 3, len: L7, gates: MIX },
  { id: "L101", n: 7, par: 14, starts: 3, abil: { v: 1, f: 1 }, kr: 5, ks: 2, kb: 2, dr: 2, ds: 1, tee: 3, cross: 1, len: L7, gates: MIX },
  { id: "L102", n: 7, par: 14, starts: 2, cp: 2, abil: { w: 1, v: 1 }, kr: 5, ks: 3, kb: 1, dr: 3, ds: 2, tee: 3, len: L7, gates: MIX },
  { id: "L103", n: 7, par: 14, starts: 3, cp: 1, abil: { w: 1, f: 1, v: 1 }, kr: 5, ks: 2, kb: 2, dr: 2, ds: 2, tee: 3, cross: 1, len: L7, gates: MIX },
  { id: "L104", n: 7, par: 14, starts: 3, cp: 2, abil: { f: 1, v: 1 }, kr: 5, ks: 3, kb: 2, dr: 3, ds: 2, tee: 3, cross: 1, empty: 2, len: L7, gates: MIX },
  { id: "L105", n: 7, par: 14, starts: 3, cp: 2, abil: { w: 1, f: 1, v: 1 }, kr: 5, ks: 3, kb: 2, dr: 3, ds: 2, tee: 3, cross: 1, empty: 2, len: L7, gates: MIX },
];
// 월드 8 번개 발전소 — ⚡ 전기 스위치 (사용자 확정 v2026-10-31a). sw = 노랑 ⚡(피카츄 스위치) 조각 수, sw2 = 파랑 ⚡(라이츄 스위치),
//   swr = 노랑 중 손으로도 돌릴 수 있는 것, dz = 길 밖 노랑 ⚡ 곁가지. 조작 수는 8~11 로 되돌리고 스위치로 생각을 어렵게
const W8 = [
  { id: "L106", n: 6, par: 5, sw: 3, kr: 1, ks: 1, len: [7, 10], gates: WE },
  { id: "L107", n: 6, par: 6, sw: 3, swr: 1, kr: 1, ks: 1, dr: 1, tee: 1, len: [7, 10], gates: MIX },
  { id: "L108", n: 6, par: 6, sw: 4, dz: 1, kr: 2, ks: 1, tee: 1, starts: 2, len: [7, 10], gates: MIX },
  { id: "L109", n: 6, par: 7, sw: 3, swr: 1, kr: 2, ks: 2, dr: 1, cp: 1, tee: 1, len: [8, 11], gates: MIX },
  { id: "L110", n: 6, par: 8, sw: 4, kr: 2, ks: 1, kb: 1, abil: { w: 1 }, tee: 2, cross: 1, len: [8, 11], gates: MIX },
  { id: "L111", n: 7, par: 8, sw: 3, sw2: 2, kr: 2, ks: 1, tee: 1, len: [9, 13], gates: MIX },
  { id: "L112", n: 7, par: 8, sw: 3, sw2: 2, kr: 2, ks: 2, dr: 1, starts: 2, len: [9, 13], gates: MIX },
  { id: "L113", n: 7, par: 9, sw: 4, swr: 1, kr: 2, ks: 2, cp: 1, abil: { f: 1 }, len: [9, 13], gates: MIX },
  { id: "L114", n: 7, par: 9, sw: 3, sw2: 3, kr: 2, ks: 1, kb: 1, dr: 1, tee: 2, cross: 1, len: [9, 13], gates: MIX },
  { id: "L115", n: 7, par: 10, sw: 4, sw2: 2, kr: 3, ks: 2, starts: 3, len: [9, 13], gates: MIX },
  { id: "L116", n: 7, par: 10, sw: 3, swr: 1, sw2: 2, kr: 2, ks: 2, cp: 2, abil: { v: 1 }, len: [10, 14], gates: MIX },
  { id: "L117", n: 7, par: 10, sw: 4, sw2: 3, kr: 3, ks: 2, kb: 1, tee: 2, starts: 2, len: [10, 14], gates: MIX },
  { id: "L118", n: 7, par: 11, sw: 4, swr: 1, sw2: 2, kr: 3, ks: 2, abil: { w: 1, f: 1 }, tee: 2, cross: 1, len: [10, 14], gates: MIX },
  { id: "L119", n: 7, par: 11, sw: 4, sw2: 3, kr: 3, ks: 2, starts: 2, cp: 1, len: [10, 14], gates: MIX },
  { id: "L120", n: 7, par: 11, sw: 4, swr: 1, sw2: 3, kr: 3, ks: 2, kb: 1, starts: 3, abil: { v: 1 }, tee: 2, len: [10, 14], gates: MIX },
];
// 월드 9 무지개 신전 — 🌀 워프 패널 (사용자 확정 v2026-10-31a). warp = 패널 쌍 수(길이 그만큼 끊겨 순간이동), seg = 토막 길이
const S6 = [3, 6], S7 = [4, 7];
const W9 = [
  { id: "L121", n: 6, par: 6, warp: 1, seg: S6, kr: 2, ks: 1, gates: WE },
  { id: "L122", n: 6, par: 6, warp: 1, seg: S6, kr: 2, ks: 1, dr: 1, tee: 1, gates: MIX },
  { id: "L123", n: 6, par: 7, warp: 1, seg: S6, kr: 2, ks: 2, starts: 2, gates: MIX },
  { id: "L124", n: 6, par: 8, warp: 1, seg: S6, kr: 2, ks: 1, kb: 1, cp: 1, tee: 1, gates: MIX },
  { id: "L125", n: 6, par: 7, warp: 2, seg: [3, 5], kr: 3, ks: 1, gates: MIX },
  { id: "L126", n: 7, par: 9, warp: 1, seg: S7, sw: 3, kr: 2, ks: 2, tee: 1, gates: MIX },
  { id: "L127", n: 7, par: 9, warp: 2, seg: [3, 6], kr: 3, ks: 2, abil: { w: 1 }, tee: 2, gates: MIX },
  { id: "L128", n: 7, par: 10, warp: 1, seg: S7, kr: 3, ks: 2, starts: 2, cp: 1, cross: 1, gates: MIX },
  { id: "L129", n: 7, par: 10, warp: 2, seg: [3, 6], sw: 3, kr: 2, ks: 2, starts: 2, gates: MIX },
  { id: "L130", n: 7, par: 10, warp: 1, seg: S7, sw: 3, sw2: 2, kr: 2, ks: 2, abil: { f: 1 }, tee: 2, gates: MIX },
  { id: "L131", n: 7, par: 11, warp: 2, seg: [3, 6], kr: 3, ks: 2, kb: 1, starts: 3, tee: 2, gates: MIX },
  { id: "L132", n: 7, par: 11, warp: 1, seg: S7, sw: 4, kr: 3, ks: 2, cp: 2, abil: { v: 1 }, gates: MIX },
  { id: "L133", n: 7, par: 11, warp: 2, seg: [3, 6], sw: 3, kr: 3, ks: 2, starts: 2, abil: { w: 1, f: 1 }, tee: 2, cross: 1, gates: MIX },
  { id: "L134", n: 7, par: 12, warp: 2, seg: [3, 6], sw: 3, sw2: 2, kr: 3, ks: 2, starts: 3, cp: 1, gates: MIX },
  { id: "L135", n: 7, par: 12, warp: 2, seg: [3, 6], sw: 4, kr: 3, ks: 2, kb: 1, starts: 2, cp: 1, abil: { w: 1, v: 1 }, tee: 2, cross: 1, gates: MIX },
];
const INTRO = { L01: "r", L02: "r", L03: "r", L16: "s", L17: "s", L18: "s", L31: "rs", L32: "rs", L33: "rs",
  L46: "w", L49: "f", L52: "v", L61: "k", L64: "m", L79: "m3", L80: "k2", L106: "z", L111: "z2", L121: "p", L125: "p2" };

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
const OBS_W3 = ["r", "r", "r", "b"];

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

// ---------- 월드 3: 회전 + 밀기 ----------
/** 정답 길 칸 하나를 세갈래(T)로 — 원래 두 포트는 그대로 두고 남은 두 방향 중 하나를 더 연다 (곁길·막힌 길) */
function toTee(R, t) {
  const has = E.ports({ sh: t.sh, r: t.r });
  const miss = pick(R, [0, 1, 2, 3].filter((d) => !has.includes(d))); // T 는 r 방향이 막힘 (r0 = N 막힘)
  return { i: t.i, sh: "T", r: miss };
}
function genMixed(cfg, R) {
  const n = 5;
  const { start, goal } = gatesFor(R, n, pick(R, cfg.gates));
  const s = E.gateCell(n, start), g = E.gateCell(n, goal);
  if (s === g) return null;
  const p = randomPath(R, n, s, g, cfg.len);
  if (!p) return null;
  let pt = shuffle(R, pathTiles(n, p, start, goal));
  pt = pt.map((t, k) => (k < cfg.tee ? toTee(R, t) : t));
  shuffle(R, pt);
  const cells = new Array(n * n).fill(null);
  pt.forEach((t, k) => {
    if (k < cfg.kr) cells[t.i] = tok(t.sh, (t.r + ri(R, 1, E.PERIOD[t.sh] - 1)) % 4, "r");
    else if (k < cfg.kr + cfg.ks) cells[t.i] = tok(t.sh, t.r, "s");
    else cells[t.i] = tok(t.sh, t.r);
  });
  const onPath = new Set(p);
  const rest = shuffle(R, [...Array(n * n).keys()].filter((i) => !onPath.has(i)));
  if (rest.length < 1 + cfg.ds + cfg.dr) return null;
  rest.forEach((i, k) => {
    if (k === 0) cells[i] = ".";
    else if (k <= cfg.ds) cells[i] = tok(pick(R, ["S", "C", "T"]), ri(R, 0, 3), "s");
    else if (k <= cfg.ds + cfg.dr) cells[i] = tok(pick(R, ["S", "C", "T"]), ri(R, 0, 3), "r");
    else cells[i] = "#" + pick(R, OBS_W3);
  });
  const lv = { n, ops: "rs", start, goal, cells };
  let st = E.makeState(lv), last = -1;
  const steps = ri(R, cfg.ks * 2, cfg.ks * 3 + 2);
  for (let k = 0; k < steps; k++) {
    const acts = E.actions(st, "s").filter((a) => a.i !== last);
    if (!acts.length) break;
    const a = pick(R, acts);
    last = a.to;
    st = E.apply(st, a);
  }
  lv.cells = st.cells.map(E.cellToken);
  return lv;
}
/** 회전만으로도, 밀기만으로도 안 풀리면 true (두 조작 모두 필요) */
function needsBoth(lv) {
  const st = E.makeState(lv);
  for (const ops of ["r", "s"]) if (E.solve(st, Object.assign({}, lv, { ops }), { maxDepth: 20 })) return false;
  return true;
}

// ---------- 월드 4·5: 능력 · 열매 · 두 친구 ----------
/** 둘째 길: 출발 칸에서 첫째 길 어딘가에 합류할 때까지 */
function joinPath(R, n, s, onA, len, avoid) {
  let budget = 20000, found = null;
  const want = ri(R, len[0], len[1]);
  const seen = new Set([s].concat(avoid ? [...avoid] : [])), walk = [s];
  function dfs(i) {
    if (found || --budget < 0) return;
    for (const d of shuffle(R, [0, 1, 2, 3])) {
      const j = E.neighbor(n, i, d);
      if (j < 0 || seen.has(j)) continue;
      if (onA.has(j)) { if (walk.length >= len[0] && Math.abs(walk.length - want) <= 1) { found = walk.concat([j]); return; } continue; }
      if (walk.length >= len[1]) continue;
      seen.add(j); walk.push(j);
      dfs(j);
      walk.pop(); seen.delete(j);
      if (found) return;
    }
  }
  dfs(s);
  return found;
}
/** s → t 길인데 avoid 칸은 밟지 않음 (워프 토막) */
function randomPathAvoid(R, n, s, t, len, avoid) {
  let budget = 30000, found = null;
  const want = ri(R, len[0], len[1]);
  const seen = new Set([s].concat([...avoid].filter((i) => i !== t)));
  const walk = [s];
  function dfs(i) {
    if (found || --budget < 0) return;
    if (i === t) { if (walk.length >= len[0] && walk.length <= len[1] && Math.abs(walk.length - want) <= 1) found = walk.slice(); return; }
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
/** 칸에 필요한 포트 모음 → 모양·방향 */
function shapeOfPorts(set) {
  const p = [...set].sort();
  if (p.length === 1) return { sh: "P", r: p[0] }; // 워프 패널 입구
  if (p.length === 4) return { sh: "X", r: 0 };
  if (p.length === 3) return { sh: "T", r: [0, 1, 2, 3].find((d) => !set.has(d)) };
  return shapeFor(p[0], p[1]);
}
const OBS_ADV = { 4: ["t", "r", "r"], 5: ["t", "t", "r"], 6: ["l", "v", "v"], 7: ["c", "c", "s"], 8: ["g", "g", "d"], 9: ["p", "p", "q"] }; // 8: 발전기·줄무늬 통 · 9: 기둥·무지개 수정 // 6: 용암·화산 바위 · 7: 구름·별 수정
/**
 * 풀린 판을 먼저 만들고 거꾸로 섞는다:
 *   물 다리 → 물(꼬부기) · 덩굴 다리 → 낭떠러지(이상해씨) · 빈칸 → 덤불(파이리) · 돌리기·밀기 섞기
 */
function genAdvanced(cfg, R, world) {
  const n = cfg.n;
  const sides = ["N", "E", "S", "W"];
  const goal = { side: pick(R, sides), at: ri(R, 0, n - 1) };
  const starts = [];
  const other = shuffle(R, sides.filter((x) => x !== goal.side));
  for (let k = 0; k < (cfg.starts || 1); k++) starts.push({ side: other[k], at: ri(R, 0, n - 1) });
  const g = E.gateCell(n, goal);
  const sc = starts.map((st) => E.gateCell(n, st));
  if (new Set(sc.concat([g])).size !== sc.length + 1) return null;
  let A;
  const paths = [];
  const portal = new Map(); // 칸 → 짝 글자
  if (cfg.warp) {
    // 출발 → 패널 X1 ~순간이동~ 패널 Y1 → (X2 ~ Y2 →) 센터. 토막끼리는 겹치지 않는다
    const used = new Set([g].concat(sc));
    let from = sc[0];
    A = [];
    for (let q = 0; q <= cfg.warp; q++) {
      let to = g;
      if (q < cfg.warp) {
        const free = [...Array(n * n).keys()].filter((i) => !used.has(i));
        to = pick(R, free);
      }
      used.delete(to);
      const seg = randomPathAvoid(R, n, from, to, cfg.seg || [3, 6], used);
      if (!seg) return null;
      seg.forEach((i) => used.add(i));
      paths.push(seg);
      A = A.concat(seg);
      if (q < cfg.warp) {
        const free = [...Array(n * n).keys()].filter((i) => !used.has(i));
        if (!free.length) return null;
        const y = pick(R, free);
        used.add(y);
        portal.set(to, "AB"[q]); portal.set(y, "AB"[q]);
        from = y;
      }
    }
  } else {
    A = randomPath(R, n, sc[0], g, cfg.len);
    if (!A) return null;
    paths.push(A);
  }
  const onA = new Set(A);
  for (let k = 1; k < starts.length; k++) {
    const on = new Set(paths.flat().filter((i) => !portal.has(i)));
    if (on.has(sc[k]) || portal.has(sc[k])) return null;
    const B = joinPath(R, n, sc[k], on, cfg.lenB || [2, 5], portal.size ? new Set(portal.keys()) : undefined);
    if (!B) return null;
    paths.push(B);
  }
  const P = new Map();
  const add = (i, d) => { if (!P.has(i)) P.set(i, new Set()); P.get(i).add(d); };
  paths.forEach((p) => { for (let k = 0; k + 1 < p.length; k++) { add(p[k], dirTo(n, p[k], p[k + 1])); add(p[k + 1], dirTo(n, p[k + 1], p[k])); } });
  starts.forEach((st, k) => add(sc[k], E.SIDE[st.side]));
  add(g, E.SIDE[goal.side]);
  const shape = new Map();
  for (const [i, set] of P) shape.set(i, shapeOfPorts(set));
  const pathCells = shuffle(R, [...P.keys()]);
  // 곁길 세갈래
  let tees = cfg.tee || 0;
  for (const i of pathCells) {
    if (!tees) break;
    const t = shape.get(i);
    if (t.sh === "T" || t.sh === "X" || t.sh === "P") continue;
    shape.set(i, toTee(R, Object.assign({ i }, t))); tees--;
  }
  const tile = (i, f) => tok(shape.get(i).sh, shape.get(i).r, f);
  const cells = new Array(n * n).fill(null);
  const role = new Map(); // i → cp · rot · sl · fix · water · pit
  for (let q = 0; q < (cfg.cp || 0); q++) {
    const mid = A.slice(2, -2).filter((i) => !sc.includes(i) && !role.has(i) && !portal.has(i));
    if (!mid.length) return null;
    role.set(pick(R, mid), "cp");
  }
  const free = pathCells.filter((i) => !role.has(i));
  const kb = cfg.kb || 0;
  const sw = cfg.sw || 0, sw2 = cfg.sw2 || 0, swr = cfg.swr || 0;
  const base = cfg.kr + cfg.ks + kb;
  free.forEach((i, k) => role.set(i, k < cfg.kr ? "rot" : k < cfg.kr + cfg.ks ? "sl" : k < base ? "both"
    : k < base + swr ? "swzr" : k < base + sw ? "swz" : k < base + sw + sw2 ? "swy" : "fix"));
  for (const [i, ro] of role) {
    const t = shape.get(i);
    if (ro === "cp") cells[i] = tile(i, "k");
    else if (ro === "rot") cells[i] = tok(t.sh, E.PERIOD[t.sh] > 1 ? (t.r + ri(R, 1, E.PERIOD[t.sh] - 1)) % 4 : t.r, "r");
    else if (ro === "sl") cells[i] = tile(i, "s");
    else if (ro === "both") cells[i] = tok(t.sh, E.PERIOD[t.sh] > 1 ? (t.r + ri(R, 1, E.PERIOD[t.sh] - 1)) % 4 : t.r, "rs");
    else if (ro === "swzr") cells[i] = tok(t.sh, E.PERIOD[t.sh] > 1 ? (t.r + ri(R, 1, E.PERIOD[t.sh] - 1)) % 4 : t.r, "rz");
    else if (ro === "swz") cells[i] = tile(i, "z");
    else if (ro === "swy") cells[i] = tile(i, "y");
    else cells[i] = tile(i, "");
    if (portal.has(i)) cells[i] += portal.get(i);
  }
  const abil = { w: 0, f: 0, v: 0 };
  const fixedOnA = () => A.filter((i) => role.get(i) === "fix" && !sc.includes(i) && i !== g && !portal.has(i));
  // 꼬부기: 고정 길 한 칸 → 물
  for (let k = 0; k < ((cfg.abil && cfg.abil.w) || 0); k++) {
    const c = fixedOnA();
    if (!c.length) return null;
    const i = pick(R, c), t = shape.get(i);
    cells[i] = "~" + t.sh + t.r; role.set(i, "water"); abil.w++;
  }
  // 이상해씨: 첫째 길에서 나란히 붙은 고정 칸 둘 → 낭떠러지 (한 번에 덩굴 다리)
  for (let k = 0; k < ((cfg.abil && cfg.abil.v) || 0); k++) {
    const fx = new Set(fixedOnA());
    const pairs = [];
    for (let q = 0; q + 1 < A.length; q++) if (fx.has(A[q]) && fx.has(A[q + 1]) && dirTo(n, A[q], A[q + 1]) >= 0) pairs.push([A[q], A[q + 1]]);
    if (!pairs.length) return null;
    const gch = "abc"[k];
    for (const i of pick(R, pairs)) { const t = shape.get(i); cells[i] = "^" + t.sh + t.r + gch; role.set(i, "pit"); }
    abil.v++;
  }
  // 길 밖: 빈칸 · 곁가지 · 장애물
  const rest = shuffle(R, [...Array(n * n).keys()].filter((i) => !P.has(i)));
  const empty = cfg.empty || 1, ds = cfg.ds || 0, dr = cfg.dr || 0;
  if (rest.length < empty + ds + dr + (cfg.dz || 0)) return null;
  const obs = OBS_ADV[world];
  const decoy = cfg.cross ? ["S", "C", "T", "X"] : ["S", "C", "T"];
  rest.forEach((i, k) => {
    if (k < empty) cells[i] = ".";
    else if (k < empty + ds) cells[i] = tok(pick(R, decoy), ri(R, 0, 3), "s");
    else if (k < empty + ds + dr) cells[i] = tok(pick(R, decoy), ri(R, 0, 3), "r");
    else if (k < empty + ds + dr + (cfg.dz || 0)) cells[i] = tok(pick(R, decoy), ri(R, 0, 3), "z");
    else cells[i] = "#" + pick(R, obs);
  });
  // ⚡ 스위치 거꾸로 섞기: 무리마다 1~3번 덜 돌려 둔다 (풀려면 스위치를 그만큼 눌러야)
  for (const [grp, cnt] of [["z", sw + (cfg.dz || 0)], ["y", sw2]]) {
    if (!cnt) continue;
    const back = ri(R, 1, 3);
    cells.forEach((c, i) => {
      if (!c || !/^[SCTXP][0-3][a-z]*$/.test(c.replace(/[A-C]$/, "")) || !c.slice(2).includes(grp)) return;
      cells[i] = c[0] + ((+c[1] + 4 - back) % 4) + c.slice(2);
    });
  }
  const lv = { n, ops: sw ? "rsaz" : "rsa", goal, cells, abil };
  if (starts.length > 1) lv.starts = starts; else lv.start = starts[0];
  // 빈칸을 돌아다니게 해서 섞기 (방금 민 타일은 다시 안 민다)
  let st = E.makeState(lv), last = -1;
  const ksAll = cfg.ks + kb;
  const steps = ri(R, ksAll * 2, ksAll * 3 + 2);
  for (let k = 0; k < steps; k++) {
    const acts = E.actions(st, "s").filter((a) => a.i !== last);
    if (!acts.length) break;
    const a = pick(R, acts);
    last = a.to;
    st = E.apply(st, a);
  }
  lv.cells = st.cells.map(E.cellToken);
  // 파이리: 지금 빈칸(길 자리면 더 좋음) → 덤불. 태우면 다시 밀어 넣을 수 있다
  for (let k = 0; k < ((cfg.abil && cfg.abil.f) || 0); k++) {
    const em = lv.cells.map((c, i) => (c === "." ? i : -1)).filter((i) => i >= 0);
    if (!em.length) return null;
    const onPathEm = em.filter((i) => P.has(i));
    lv.cells[pick(R, onPathEm.length ? onPathEm : em)] = "#b"; abil.f++;
  }
  for (const k of E.ABIL) if (!abil[k]) delete abil[k];
  return lv;
}
/** 준 능력은 하나도 빠짐없이 써야 풀리나 (한 번씩 덜 주면 못 풀어야 함) */
function needsAllAbilities(lv) {
  for (const k of Object.keys(lv.abil || {})) {
    const less = Object.assign({}, lv, { abil: Object.assign({}, lv.abil, { [k]: lv.abil[k] - 1 }) });
    if (E.solve(E.makeState(less), less, { maxDepth: lv.par + 6, maxStates: 300000 })) return false;
  }
  return true;
}
// ---------- 고르기 ----------
function finish(id, lv, maxDepth) {
  const err = E.validate(lv);
  if (err.length) return { err };
  // 목표 par 까지만 찾는다 — 그보다 깊은 판은 어차피 버리므로 (BFS 라 결과는 같고 훨씬 빠르다)
  const sol = E.solve(E.makeState(lv), lv, { maxDepth: maxDepth || 14 });
  if (!sol) return { err: ["해 없음"] };
  return { sol };
}
function hashId(id) { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

const ARGS = process.argv.slice(2);
const ALL = ARGS.includes("--all");
const REDO = new Set(((ARGS[ARGS.indexOf("--redo") + 1] || "")).split(",").filter((x) => ARGS.includes("--redo") && x));
let OLD = {};
try { for (const l of require("../data/levels.js")) OLD[l.id] = l; } catch (e) { OLD = {}; }
function build(cfg, world) {
  if (!ALL && !REDO.has(cfg.id) && OLD[cfg.id] && !process.argv[2]?.startsWith("L")) {
    const o = Object.assign({}, OLD[cfg.id]);
    for (const k of ["id", "no", "world", "intro"]) delete o[k];
    return Object.assign(o, { kept: true });
  }
  const t0 = Date.now();
  const WHY = {}; const why = (k) => { WHY[k] = (WHY[k] || 0) + 1; }; // DBG=1 이면 못 찾았을 때 버린 이유를 센다
  for (let tries = 0; tries < 20000; tries++) {
    const R = mulberry(hashId(cfg.id) * 7919 + tries);
    const lv = world === 1 ? genRotate(cfg, R) : world === 2 ? genSlide(cfg, R) : world === 3 ? genMixed(cfg, R) : genAdvanced(cfg, R, world);
    if (!lv) { why('판 못 만듦'); continue; }
    const { err, sol } = finish(cfg.id, lv, cfg.par);
    if (err) { why(err[0]); continue; }
    if (sol.moves !== cfg.par) { why('par ' + sol.moves); continue; }
    if (world === 3) {
      // 회전만 잔뜩 + 밀기 한 번이 되지 않게: par 5 이상은 밀기 2번 이상, 회전도 2번 이상
      const ns = sol.actions.filter((a) => a.t === "s").length, nr = sol.moves - ns;
      if (cfg.par >= 5 && (ns < 2 || nr < 2)) continue;
      if (!needsBoth(lv)) continue;
    }
    if (world >= 4) {
      lv.par = sol.moves;
      if (cfg.kr && !sol.actions.some((a) => a.t === "r")) { why('돌리기가 하나도 없는 풀이는 버림'); continue; } // 돌리기가 하나도 없는 풀이는 버림
      if (cfg.ks && !sol.actions.some((a) => a.t === "s")) { why('미는 조각이 있으면 밀기도 꼭 쓰게'); continue; } // 미는 조각이 있으면 밀기도 꼭 쓰게
      if (!needsAllAbilities(lv)) { why('능력 덜 줘도 풀림'); continue; }
      if (cfg.sw) {
        if (!sol.actions.some((a) => a.t === "z")) continue;
        const noZ = Object.assign({}, lv, { ops: "rsa" });
        if (E.solve(E.makeState(noZ), noZ, { maxDepth: lv.par + 6, maxStates: 300000 })) { why('스위치 없이도 풀림'); continue; } // 스위치 없이도 풀림
      }
      if (cfg.warp) {
        const noW = Object.assign({}, lv, { noWarp: true });
        if (E.solve(E.makeState(noW), noW, { maxDepth: lv.par + 6, maxStates: 300000 })) { why('워프 없이도 풀림'); continue; } // 워프 없이도 풀림
      }
    }
    // 정답 길에서 돌리거나 미는 칸이 실제로 쓰이는지 (곁가지만 만지는 풀이는 버림)
    return Object.assign(lv, { par: sol.moves, sol: sol.actions, tries, t: ((Date.now() - t0) / 1000).toFixed(1) });
  }
  if (process.env.DBG) console.log(WHY);
  throw new Error(cfg.id + ": 조건에 맞는 판을 못 찾음");
}

function fromHand(id, h) {
  const cells = h.rows.join(" ").trim().split(/\s+/);
  const lv = { n: h.n, ops: h.ops, start: h.start, goal: h.goal, cells };
  const { err, sol } = finish(id, lv);
  if (err) throw new Error(id + ": " + err.join(", "));
  if (lv.ops === "rs" && !needsBoth(lv)) throw new Error(id + ": 한 가지 조작만으로 풀림");
  return Object.assign(lv, { par: sol.moves, sol: sol.actions, hand: true });
}

function main() {
  const all = [];
  const t0 = Date.now();
  const add = (id, world, lv) => {
    all.push(Object.assign({ id, no: +id.slice(1), world }, lv, INTRO[id] ? { intro: INTRO[id] } : {}));
    if (lv.t) console.log(`  (${lv.t}초)`);
    console.log(`${id} 월드${world} ${lv.n}×${lv.n} ${lv.ops} par ${lv.par}${lv.hand ? " (손)" : lv.kept ? " (그대로)" : ` (시도 ${lv.tries + 1})`}`);
  };
  add("L01", 1, fromHand("L01", HAND.L01));
  for (const c of W1) add(c.id, 1, build(c, 1));
  add("L16", 2, fromHand("L16", HAND.L16));
  for (const c of W2) add(c.id, 2, build(c, 2));
  add("L31", 3, fromHand("L31", HAND.L31));
  for (const c of W3) add(c.id, 3, build(c, 3));
  const only = process.argv[2]; // node tools/gen-levels.js L61  → 그 레벨만 시험 삼아 만들어 본다 (파일은 안 씀)
  if (only) {
    const WS = { 4: W4, 5: W5, 6: W6, 7: W7, 8: W8, 9: W9 };
    const wn = +Object.keys(WS).find((k) => WS[k].some((x) => x.id === only));
    const c = WS[wn].find((x) => x.id === only);
    const t1 = Date.now();
    const lv = build(c, wn);
    console.log(only, "시도", lv.tries + 1, ((Date.now() - t1) / 1000).toFixed(1) + "초", JSON.stringify(lv.sol));
    return;
  }
  for (const c of W4) add(c.id, 4, build(c, 4));
  for (const c of W5) add(c.id, 5, build(c, 5));
  for (const c of W6) add(c.id, 6, build(c, 6));
  for (const c of W7) add(c.id, 7, build(c, 7));
  for (const c of W8) add(c.id, 8, build(c, 8));
  for (const c of W9) add(c.id, 9, build(c, 9));
  for (const lv of all) { delete lv.tries; delete lv.hand; delete lv.t; delete lv.kept; } // t = 만드는 데 걸린 초 (기록에만)
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
