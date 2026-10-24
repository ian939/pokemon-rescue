# 포켓몬 구조대: 포켓몬센터를 찾아라!

길을 잃은 포켓몬을 포켓몬센터까지 데려가는 길 잇기 퍼즐. 길 조각을 **돌리고(월드 1)** **밀어서(월드 2)** **둘 다(월드 3)**, 꼬부기·파이리·이상해씨 **능력**(월드 4), 열매·두 친구(월드 5)로
출발점에서 센터까지 길을 이은 뒤 `출발!`을 누르면 포켓몬이 걸어간다. 6~8세, 아이패드 가로 화면 기준.

▶ 플레이: https://ian939.github.io/pokemon-rescue/

- 이어진 길은 조작할 때마다 바로 빛난다. 끊긴 채 출발하면 끊긴 곳까지 걸어가서 ✕로 알려 준다.
- 힌트 3단계(움직일 수 있는 조각 → 바꿔야 할 조각 → 다음 한 동작), 되돌리기·다시·처음부터, 막히면 건너뛰기.
- 구조한 포켓몬은 도감과 센터에 모이고, 월드를 끝낼 때마다 센터 장식이 생긴다. 월드 3~5를 끝내면 친구들이 행복해하는 기념 그림이 도감에 들어간다.
- 짧은 영어 한마디: Let's go! · Rescued! · Three stars!

## 구성

| 파일 | 하는 일 |
|---|---|
| `index.html` | 화면 틀 · `APP_VERSION` (배포할 때마다 올리고 `?v=` 도 같이) |
| `js/engine.js` | 퍼즐 규칙 (타일·포트·회전·밀기·능력·열매·두 친구·연결 판정·BFS 솔버). 화면과 분리, Node 에서도 돈다 |
| `data/levels.js` | 레벨 75개 (월드 1~5) (자동 생성 — 손으로 고치지 않는다) |
| `js/worlds.js` | 월드 5개 (이름·바닥·구조 포켓몬 타입·장식) |
| `data/pokemon.js` | 포켓몬 1025마리 이름·타입·희귀도 (포켓몬 윷놀이 데이터에서 추출) |
| `js/app.js` | 지도·레벨·보드·연출·도감·센터·보호자 화면·새 버전 감지 |
| `js/voice-lines.js` | 게임이 읽어 주는 한국어·영어 말 전부 |
| `js/lock.js`, `css/lock.css` | 패드 확대·복사 잠금 |
| `plan.md` | 기획서 (§0 = 구현 확정 사항) |

## 도구

```bash
node tools/gen-levels.js        # 레벨 생성 + 솔버 선별 → data/levels.js (소개 레벨 L01·L16·L31 은 tools/levels-hand.js)
node tools/test-engine.js       # 엔진·솔버 단위 테스트 + 레벨 75개 검증
PYTHONUTF8=1 python tools/test-ui.py        # 화면 (Playwright, 75레벨을 실제로 눌러 푼다)
python tools/gen-voice.py       # 목소리 녹음 (말을 바꾸면 다시)
python tools/gen-art.py && python tools/postprocess.py   # Codex 도트 그림 → assets/
node tools/extract-pokemon.js   # 포켓몬 데이터 다시 뽑기
```

그림: 포켓몬은 PokeAPI 도트, 지형·센터·장식·배경은 Codex(GPT 이미지) 도트, 숲·설산·마을 바닥과 나무 블록은
포켓몬 사다리 대모험, 센터 실내는 포켓몬 윷놀이에서 가져왔다. 개인 비상업용 팬 게임.
