/* 월드 7개 — 이름 · 바닥 그림 · 구조 포켓몬 타입 · 레벨 범위 · 끝내면 받는 센터 장식
 * open: false 인 월드는 지도에서 "곧 열려요" (레벨 데이터가 아직 없음)
 */
(function (root) {
  "use strict";
  const WORLDS = [
    { no: 1, name: "초록 숲", en: "Green Forest", bg: "forest", types: ["풀", "벌레"], from: 1, to: 15, ops: "r", deco: { id: "pot", name: "꽃 화분" }, open: true },
    { no: 2, name: "물결 강가", en: "River Side", bg: "river", types: ["물"], from: 16, to: 30, ops: "s", deco: { id: "fountain", name: "분수" }, open: true },
    { no: 3, name: "반짝 동굴", en: "Crystal Cave", bg: "cave", types: ["바위", "땅"], from: 31, to: 45, ops: "rs", deco: { id: "crystal", name: "수정 등" }, open: true },
    { no: 4, name: "눈꽃 설산", en: "Snow Mountain", bg: "ice", types: ["얼음"], from: 46, to: 60, ops: "rsa", deco: { id: "snowman", name: "눈사람" }, open: true },
    { no: 5, name: "포켓몬 마을", en: "Pokemon Town", bg: "town", types: ["노말", "페어리"], from: 61, to: 75, ops: "rsa", deco: { id: "bunting", name: "깃발 장식" }, open: true },
    // 6·7 = 새 규칙 없이 더 어렵게 (v2026-10-25a 사용자 확정) — 7×7, 세 친구, 열매 둘, 능력 셋
    { no: 6, name: "불꽃 화산", en: "Fire Volcano", bg: "volcano", types: ["불꽃", "격투", "강철"], from: 76, to: 90, ops: "rsa", deco: { id: "brazier", name: "불꽃 화로" }, open: true },
    { no: 7, name: "별빛 하늘성", en: "Starry Sky Castle", bg: "sky", types: ["드래곤", "에스퍼", "비행", "고스트"], from: 91, to: 105, ops: "rsa", deco: { id: "telescope", name: "별 망원경" }, open: true },
  ];
  /** 희귀도 비율 (plan §0.5) — 월드 마지막 레벨은 유니크·전설 확정 */
  const RARITY_ODDS = { c: 70, r: 20, u: 8, l: 2 };
  const RARITY_NAME = { c: "일반", r: "레어", u: "유니크", l: "전설" };
  const api = { WORLDS, RARITY_ODDS, RARITY_NAME };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== "undefined" ? window : globalThis);
