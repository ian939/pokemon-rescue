/* 손으로 만든 소개 레벨 — gen-levels.js 가 그대로 data/levels.js 에 넣는다 (솔버로 par 만 잰다).
 * 칸 토큰은 js/engine.js 맨 위 설명 참고. 줄마다 n 칸씩.
 */
module.exports = {
  // L01 회전 소개 — 돌릴 수 있는 곡선 1개, 한 번 누르면 끝
  L01: {
    n: 4, ops: "r",
    start: { side: "W", at: 1 }, goal: { side: "E", at: 2 },
    rows: [
      "#t #t #b #t",
      "S1 S1 C1r #t",
      "#b #t C0 S1",
      "#t #r #t #t",
    ],
  },
  // L16 밀기 소개 — 빈칸 옆 직선 1개를 위로 밀면 끝
  L16: {
    n: 4, ops: "s",
    start: { side: "W", at: 1 }, goal: { side: "E", at: 1 },
    rows: [
      "#t #t #b #t",
      "S1 S1 . S1",
      "#b #t S1s #t",
      "#t #r #t #t",
    ],
  },
  // L31 혼합 소개 — 빈칸에 직선을 밀어 넣고(밀기 1) 곡선을 한 번 돌린다(회전 1). 둘 다 해야 풀린다
  L31: {
    n: 5, ops: "rs",
    start: { side: "W", at: 2 }, goal: { side: "E", at: 3 },
    rows: [
      "#r #r #b #r #r",
      "#r #b #r #r #r",
      "S1 S1 . C1r #r",
      "#r #r S1s C0 S1",
      "#r #b #r #r #r",
    ],
  },
};
