/* 포켓몬 윷놀이의 데이터(잉글리시몬에서 추출한 1025마리)에서 이름·타입·희귀도만 뽑아 data/pokemon.js 로.
 *
 *   node tools/extract-pokemon.js
 *
 * 희귀도: r 레어 · u 유니크 · l 전설 · 없으면 일반(c)
 */
"use strict";
const fs = require("fs");
const path = require("path");
global.window = {};
require(path.join(__dirname, "..", "..", "윷놀이", "data", "pokemon.js"));
const D = window.YUT_DATA;
const out = { names: D.names, types: D.types, rarity: D.rarity };
fs.writeFileSync(path.join(__dirname, "..", "data", "pokemon.js"),
  `/* 자동 생성 파일 — node tools/extract-pokemon.js. 출처: 포켓몬 윷놀이 data/pokemon.js (${D.source}) */
(function (root) {
  const PKDATA = ${JSON.stringify(out)};
  if (typeof module !== "undefined" && module.exports) module.exports = PKDATA;
  else root.PKDATA = PKDATA;
})(typeof window !== "undefined" ? window : globalThis);
`);
console.log("data/pokemon.js", D.names.length, "마리");
