/* 게임이 읽어 주는 말 — 전부 여기 모은다.
 * tools/gen-voice.py 가 이 파일 + 구조 포켓몬 이름(열린 월드)을 Edge TTS 로 미리 녹음한다.
 * 말을 바꾸거나 새로 넣으면 python tools/gen-voice.py 를 다시 돌릴 것 (안 돌리면 그 말만 기기 목소리).
 * 이름은 조각으로 따로 읽는다: say(name, L.lost)  — 조사가 필요 없게 문장을 만든다.
 * "옹" 이 든 말은 로켓단 목소리로 녹음된다.
 */
(function (root) {
  "use strict";
  const L = {
    title: "포켓몬 구조대! 포켓몬센터를 찾아라!",
    lost: "길을 잃었어요. 센터까지 길을 이어 주세요!",
    introR: "길 조각을 눌러서 돌려 보세요!",
    introS: "빈칸 옆 길 조각을 밀어서 옮겨 보세요!",
    introRS: "돌리고 밀어서 길을 이어 보세요!",
    introW: "물이 있으면 꼬부기를 누르고, 물을 눌러 다리를 놓아요!",
    introF: "덤불이 길을 막으면 파이리를 누르고, 덤불을 눌러 태워요!",
    introV: "낭떠러지에는 이상해씨를 누르고, 낭떠러지를 눌러 덩굴 다리를 만들어요!",
    introK: "열매가 있는 길을 꼭 지나서 센터로 가야 해요!",
    introM: "길 잃은 친구가 둘이에요! 둘 다 센터로 데려가요!",
    needItem: "열매를 꼭 들러서 가야 해요!",
    abilFirst: "버튼을 먼저 눌러 보세요!",
    abilNo: "여기에는 쓸 수 없어요.",
    abilEmpty: "능력을 다 썼어요.",
    abilPickW: "물을 눌러 보세요!",
    abilPickF: "덤불을 눌러 보세요!",
    abilPickV: "낭떠러지를 눌러 보세요!",
    abilDoneW: "꼬부기가 물 위에 다리를 놓았어요!",
    abilDoneF: "파이리가 덤불을 태웠어요!",
    abilDoneV: "이상해씨가 덩굴 다리를 만들었어요!",
    oneMore: "한 친구 구조! 다른 친구도 데려가요!",
    allClear: "모든 지역의 포켓몬을 구했어요! 고마워요!",
    memory: "기념 그림이 생겼어요! 친구들이 정말 행복해해요!",
    connected: "길이 이어졌어요! 출발 버튼을 눌러요!",
    broken: "여기서 길이 끊겼어요. 다시 해 봐요!",
    noStart: "첫 칸부터 길을 이어 주세요!",
    saved: "구조 성공!",
    cantRotate: "이 조각은 돌릴 수 없어요.",
    cantMove: "이건 움직일 수 없어요.",
    notNext: "빈칸 옆에 있는 조각만 움직일 수 있어요.",
    hint1: "움직일 수 있는 조각이에요.",
    hint2: "반짝이는 조각을 바꿔 보세요.",
    hint3: "이렇게 해 볼까요?",
    hintReset: "처음부터 다시 해 볼까요?",
    alreadyOk: "벌써 이어졌어요! 출발을 눌러 봐요!",
    skip: "괜찮아요! 다음에 다시 도전해요.",
    dexNew: "도감에 새 친구가 들어왔어요!",
    rocketIntro: "로켓단이 포켓몬들을 흩어 놓았다옹!",
    rocketIntro2: "길을 이어서 포켓몬을 포켓몬센터로 데려가요!",
    rocketOut: "로켓단은 또 당했다옹~!",
    newDeco: "센터에 새 장식이 생겼어요!",
    newWorld: "새 지역이 열렸어요!",
    soon: "다음 지역은 곧 열려요!",
    center: "구조한 친구들이 센터에서 놀고 있어요!",
    emptyCenter: "아직 구조한 친구가 없어요. 구조하러 가 볼까요?",
    locked: "앞 레벨을 먼저 해 봐요!",
    updateNew: "새 버전이 나왔어요!",
  };
  // 영어 한마디 (en-US) — 출발, 성공, 숫자, 별. 걸을 때 방향(Up!·Right!)은 걸음이 빨라 끊겨서 뺐다
  const EN = {
    go: "Let's go!",
    rescued: "Rescued!",
    nums: ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"],
    stars: ["", "One star!", "Two stars!", "Three stars!"],
    great: "Great job!",
  };
  const EN_ALL = [].concat(EN.go, EN.rescued, EN.nums.slice(1), EN.stars.slice(1), EN.great);
  // 능력 버튼 포켓몬 이름 (파이리는 구조 포켓몬 풀에 없어서 따로 녹음)
  const NAMES = ["꼬부기", "파이리", "이상해씨"];
  const api = { L, EN, EN_ALL, NAMES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VoiceLines = api;
})(typeof window !== "undefined" ? window : globalThis);
