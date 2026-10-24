"""화면 검사 (Playwright + Chromium). 로컬 HTTP 서버를 스스로 띄워 실제로 칸을 눌러 퍼즐을 푼다.

    PYTHONIOENCODING=utf-8 PYTHONUTF8=1 python tools/test-ui.py [스크린샷 폴더]

확인하는 것
  1. 처음 → 지도 → 월드 1 (로켓단 등장) → L01: 손가락 안내, 틀린 채 출발(끊긴 곳 ✕), 한 번 돌려 연결 빛 → 출발 → 구조 성공·별 3·도감
  2. 월드 1~5 75레벨을 저장된 풀이대로 실제 탭/드래그/능력 버튼으로 끝까지 — 월드 끝 로켓단·장식, 월드 3~ 기념 그림
     월드 4: 능력 버튼(꼬부기·파이리·이상해씨) 고르기·취소·쓰기·되돌리기 · 월드 5: 열매 · 두 친구 차례로 구조
  3. 되돌리기·다시·처음부터 · 힌트 1→2→3단계(손가락) · 건너뛰기 → 다음 레벨 열림 · 3분 지나면 건너뛰기
  4. 도감 · 센터(구조한 친구·장식) · 잠긴 레벨/곧 열려요
  5. 보호자 화면 잠금(곱셈) · 설정 · '초기화' 글자 입력
  6. 새 버전 감지: 서버 파일의 APP_VERSION 이 다르면 알림
  7. 누르는 것 44×44px 이상 · 가로 스크롤 없음 · 판이 화면 안 (가로 패드 3크기 · 세로 패드 · 폰 가로)
  8. 콘솔 오류 0개
"""
import functools
import http.server
import pathlib
import re
import sys
import threading

from playwright.sync_api import sync_playwright

for s in (sys.stdout, sys.stderr):
    try:
        s.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
_args = [a for a in sys.argv[1:] if not a.startswith("--")]
OUT = pathlib.Path(_args[0]) if _args else ROOT / "art-src" / "shots"
OUT.mkdir(parents=True, exist_ok=True)
fails = []
FAKE_VER = {"on": False}


def check(cond, msg):
    print(("✅ " if cond else "❌ ") + msg)
    if not cond:
        fails.append(msg)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if FAKE_VER["on"] and self.path.split("?")[0] in ("/", "/index.html"):
            body = (ROOT / "index.html").read_text(encoding="utf-8")
            body = re.sub(r'APP_VERSION = "[^"]+"', 'APP_VERSION = "2099-01-01z"', body).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def serve():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def idle(pg, ms=6000):
    pg.wait_for_function("() => window.__T && !window.__T.G.busy", timeout=ms)


def tile_box(pg, i):
    tid = pg.evaluate(f"() => window.__T.G.state.cells[{i}].id")
    return pg.locator(f'.tile[data-id="{tid}"]').bounding_box()


def tap_cell(pg, i):
    b = tile_box(pg, i)
    pg.mouse.click(b["x"] + b["width"] * 0.4, b["y"] + b["height"] * 0.6)
    pg.wait_for_timeout(30)


def drag_cell(pg, i, to):
    b = tile_box(pg, i)
    n = pg.evaluate("() => window.__T.G.lv.n")
    dx = (to % n) - (i % n)
    dy = (to // n) - (i // n)
    x, y = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
    pg.mouse.move(x, y)
    pg.mouse.down()
    for k in range(1, 9):
        pg.mouse.move(x + dx * b["width"] * 0.8 * k / 8, y + dy * b["height"] * 0.8 * k / 8)
    pg.mouse.up()
    pg.wait_for_timeout(40)


def play_solution(pg, drag_every=0):
    """저장된 풀이대로 실제로 누르거나 끈다. drag_every=2 면 밀기를 하나 걸러 드래그로.
    능력은 버튼을 누르고 칸을 누른다. 두 친구 판은 한 친구가 이어지면 바로 출발(마지막 조작 뒤 출발은 부르는 쪽이)"""
    sol = pg.evaluate("() => window.__T.G.lv.sol")
    for k, a in enumerate(sol):
        if a["t"] == "a":
            pg.click(f'.abil[data-k="{a["k"]}"]')
            tap_cell(pg, a["i"])
        elif a["t"] == "s" and drag_every and k % drag_every == 0:
            drag_cell(pg, a["i"], a["to"])
        else:
            tap_cell(pg, a["i"])
        if k < len(sol) - 1 and pg.locator("#goBtn.ready").count():
            pg.click("#goBtn")
            idle(pg)
    return len(sol)


def close_modal(pg, v):
    pg.locator(f'.layer [data-v="{v}"]').first.click()
    pg.wait_for_timeout(60)


def small_targets(pg):
    return pg.evaluate("""() => [...document.querySelectorAll('button, .tile.path')].filter(b => b.offsetParent || b.closest('.layer'))
      .map(b => { const r = b.getBoundingClientRect(); return { t: (b.textContent || b.className).trim().slice(0, 16), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(r => r.w > 0 && (r.w < 44 || r.h < 44))""")


def main():
    srv, base = serve()
    errors = []
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={"width": 1180, "height": 820}, has_touch=True)
        pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(base + "/?test")
        pg.evaluate("localStorage.clear()")
        pg.goto(base + "/?test")
        pg.wait_for_selector(".title-screen")
        pg.screenshot(path=str(OUT / "01-title.png"))

        # ---- 1. 지도 → 월드 1 → L01
        pg.click("[data-a=play]")
        pg.wait_for_selector(".wnode")
        check(pg.locator(".wnode").count() == 5, "지도: 월드 5개")
        check(pg.locator(".wnode.soon").count() == 0, "지도: 다섯 지역 모두 열림(곧 열려요 없음)")
        check(pg.locator(".wnode.locked").count() == 4, "지도: 처음엔 월드 1만 들어갈 수 있음")
        check(pg.locator('.wnode[data-w="3"].locked').count() == 1, "지도: 월드 3은 아직 잠김")
        check(pg.locator('.wnode[data-w="2"].locked').count() == 1, "지도: 월드 2는 아직 잠김")
        pg.screenshot(path=str(OUT / "02-map.png"))
        pg.click('.wnode[data-w="1"]')
        pg.wait_for_selector(".rocket-box")
        check(True, "월드 1 처음 들어가면 로켓단 연출")
        pg.screenshot(path=str(OUT / "03-rocket.png"))
        close_modal(pg, "ok")
        check(pg.locator(".lvbtn").count() == 15, "레벨 고르기: 15칸")
        check(pg.locator(".lvbtn.locked").count() == 14, "레벨 고르기: 1만 열림")
        pg.locator(".lvbtn.locked").first.click(force=True)
        check(pg.locator(".board").count() == 0, "잠긴 레벨은 안 열림")
        pg.screenshot(path=str(OUT / "04-levels.png"))
        pg.click('.lvbtn[data-no="1"]', force=True)
        pg.wait_for_selector(".board .tile")
        check(pg.locator(".finger.tapme").count() == 1, "L01: 손가락 안내가 돌릴 칸에")
        check(pg.locator(".tile.can-rot").count() == 1, "L01: 돌릴 수 있는 칸(↻) 1개")
        pg.screenshot(path=str(OUT / "05-L01.png"))
        # 틀린 채 출발 → 끊긴 곳 표시, 판은 그대로
        key0 = pg.evaluate("() => window.__T.E.key(window.__T.G.state)")
        pg.click("#goBtn")
        idle(pg)
        check(pg.locator(".xmark").count() >= 1, "틀린 채 출발 → 끊긴 곳 ✕ 표시")
        pg.screenshot(path=str(OUT / "06-broken.png"))
        check(pg.evaluate("() => window.__T.E.key(window.__T.G.state)") == key0, "실패해도 판 상태 유지")
        check(pg.locator(".tile.lit").count() == 2, "출발부터 이어진 2칸이 빛남")
        # 고정 칸을 누르면 흔들림만
        fixed = pg.evaluate("() => window.__T.G.state.cells.findIndex(t => t && t.sh && !t.rot)")
        tap_cell(pg, fixed)
        check(pg.evaluate("() => window.__T.G.moves") == 0, "고정 칸은 안 돌아감")
        play_solution(pg)
        check(pg.locator("#goBtn.ready").count() == 1, "이어지면 출발 버튼 반짝")
        check(pg.locator(".gate.goal.lit").count() == 1, "센터 문까지 빛남")
        check(pg.locator(".xmark").count() == 0, "조작하면 ✕ 사라짐")
        pg.screenshot(path=str(OUT / "07-linked.png"))
        pg.click("#goBtn")
        pg.wait_for_selector(".res", timeout=8000)
        check(pg.locator(".stars .on").count() == 3, "최소 조작 → 별 3개")
        check("새 친구" in pg.locator(".res-dex").inner_text(), "도감에 새 친구")
        pg.screenshot(path=str(OUT / "08-rescued.png"))
        close_modal(pg, "next")
        pg.wait_for_selector(".board .tile")
        check(pg.evaluate("() => window.__T.G.lv.no") == 2, "다음 레벨 L02 로")

        # ---- 3. 되돌리기·다시·처음부터·힌트·건너뛰기 (L02)
        rot = pg.evaluate("() => window.__T.G.state.cells.findIndex(t => t && t.rot)")
        k0 = pg.evaluate("() => window.__T.E.key(window.__T.G.state)")
        tap_cell(pg, rot); tap_cell(pg, rot)
        check(pg.evaluate("() => window.__T.G.moves") == 2, "두 번 돌리면 움직인 횟수 2")
        pg.click("#undoBtn")
        check(pg.evaluate("() => window.__T.G.moves") == 1, "되돌리기 → 1")
        pg.click("#redoBtn")
        check(pg.evaluate("() => window.__T.G.moves") == 2, "다시 → 2")
        pg.click("#resetBtn")
        check(pg.evaluate("() => window.__T.E.key(window.__T.G.state)") == k0 and pg.evaluate("() => window.__T.G.moves") == 0, "처음부터 → 처음 상태")
        pg.click("#undoBtn")
        check(pg.evaluate("() => window.__T.G.moves") == 2, "처음부터도 되돌리기로 복구")
        pg.click("#resetBtn")
        pg.click("#hintBtn")
        check(pg.locator(".tile.hint1").count() >= 1, "힌트 1: 움직일 수 있는 조각 반짝")
        pg.click("#hintBtn")
        check(pg.locator(".tile.hint2").count() >= 1, "힌트 2: 바꿔야 할 조각 표시")
        check(pg.locator("#skipBtn.hidden").count() == 1, "힌트 2까지는 건너뛰기 없음")
        pg.click("#hintBtn")
        check(pg.locator(".finger.tapme").count() == 1, "힌트 3: 다음 한 동작 손가락")
        check(pg.locator("#skipBtn:not(.hidden)").count() == 1, "힌트 3 → 건너뛰기 버튼")
        pg.screenshot(path=str(OUT / "09-hint3.png"))
        # 힌트 3 손가락대로 누르면 한 걸음 가까워짐
        sol = pg.evaluate("() => window.__T.E.solve(window.__T.G.state, window.__T.G.lv)")
        pg.click("#skipBtn")
        pg.wait_for_selector(".board .tile")
        check(pg.evaluate("() => window.__T.G.lv.no") == 3, "건너뛰기 → L03 열림")
        check(pg.evaluate("() => window.__T.Store.data.levels.L02.skipped") is True, "L02 는 건너뜀(❓)으로 저장")
        # 3분 지나면 건너뛰기 버튼
        pg.evaluate("() => { window.__T.G.t0 = Date.now() - 181000; }")
        pg.wait_for_selector("#skipBtn:not(.hidden)", timeout=7000)
        check(True, "3분이 지나면 건너뛰기 버튼")

        # ---- 2. 월드 1 나머지 + 월드 2 를 실제로 풀기
        def solve_level(no, drag_every=0):
            pg.evaluate(f"() => window.__T.startLevel({no})")
            pg.wait_for_selector(".board .tile")
            n = play_solution(pg, drag_every)
            ok = pg.locator("#goBtn.ready").count() == 1
            pg.click("#goBtn")
            pg.wait_for_selector(".res", timeout=10000)
            stars = pg.locator(".stars .on").count()
            return ok, n, stars

        bad = []
        for no in range(2, 16):
            ok, n, stars = solve_level(no)
            if not ok or stars != 3:
                bad.append((no, ok, stars))
            if no < 15:
                close_modal(pg, "map")
        check(not bad, f"월드 1: L02~L15 저장된 풀이로 모두 구조·별 3 {bad or ''}")
        close_modal(pg, "next")
        pg.wait_for_selector(".rocket-box")
        check("장식" in pg.locator(".rocket-box").inner_text(), "월드 1 끝 → 로켓단 + 센터 장식")
        pg.screenshot(path=str(OUT / "10-world-clear.png"))
        close_modal(pg, "ok")
        pg.wait_for_selector(".rocket-box")
        check(True, "월드 2 들어가면 로켓단 연출")
        close_modal(pg, "ok")
        check(pg.locator(".lvbtn").count() == 15 and pg.locator('.lvbtn[data-no="16"]:not(.locked)').count() == 1, "월드 2 레벨 고르기, 16 열림")
        pg.click('.lvbtn[data-no="16"]', force=True)
        pg.wait_for_selector(".board .tile")
        check(pg.locator(".finger.dragme").count() == 1, "L16: 미는 손가락 안내")
        check(pg.locator(".tile.can-slide").count() == 1, "L16: 지금 밀 수 있는 칸 화살표 1개")
        pg.screenshot(path=str(OUT / "11-L16.png"))
        # 빈칸과 안 붙은 칸 누르기 → 그대로
        far = pg.evaluate("""() => { const G = window.__T.G, E = window.__T.E; return G.state.cells.findIndex((t, i) => t && t.sh && E.slideTarget(G.state, i) < 0); }""")
        tap_cell(pg, far)
        check(pg.evaluate("() => window.__T.G.moves") == 0, "빈칸과 안 붙은 칸은 안 움직임")
        # 조금만 끌다 놓으면 제자리
        a = pg.evaluate("() => window.__T.G.lv.sol[0]")
        b = tile_box(pg, a["i"])
        pg.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
        pg.mouse.down()
        pg.mouse.move(b["x"] + b["width"] / 2 + 3, b["y"] + b["height"] / 2 - 20, steps=4)
        pg.mouse.up()
        check(pg.evaluate("() => window.__T.G.moves") == 0, "조금 끌다 놓으면 제자리")
        bad = []
        for no in range(16, 31):
            ok, n, stars = solve_level(no, drag_every=2)
            if not ok or stars != 3:
                bad.append((no, ok, stars))
            if no == 24:
                pg.screenshot(path=str(OUT / "12-L24-5x5.png"))
            if no < 30:
                close_modal(pg, "map")
        check(not bad, f"월드 2: L16~L30 드래그·탭으로 모두 구조·별 3 {bad or ''}")
        close_modal(pg, "next")
        pg.wait_for_selector(".rocket-box")
        check("반짝 동굴 지역이 열렸어요" in pg.locator(".rocket-box").inner_text(), "월드 2 끝 → 분수 + 반짝 동굴 열림")
        close_modal(pg, "ok")
        pg.wait_for_selector(".rocket-box")
        check(True, "월드 3 들어가면 로켓단 연출")
        close_modal(pg, "ok")
        pg.click('.lvbtn[data-no="31"]', force=True)
        pg.wait_for_selector(".board .tile")
        check(pg.locator(".tile .badge.rot").count() == 1 and pg.locator(".tile .badge.sl").count() == 1, "L31: ↻ 돌리는 조각 1 · ✋ 미는 조각 1")
        check(pg.locator(".finger.tapme, .finger.dragme").count() == 1, "L31: 손가락 안내")
        pg.screenshot(path=str(OUT / "16-L31.png"))
        # 돌리기만 해서는 안 이어진다
        rot = pg.evaluate("() => window.__T.G.state.cells.findIndex(t => t && t.rot)")
        tap_cell(pg, rot)
        check(pg.locator("#goBtn.ready").count() == 0, "L31: 돌리기만으로는 안 이어짐")
        pg.click("#resetBtn")
        bad = []
        for no in range(31, 46):
            ok, n, stars = solve_level(no, drag_every=2)
            if not ok or stars != 3:
                bad.append((no, ok, stars))
            if no == 42:
                pg.screenshot(path=str(OUT / "17-L42.png"))
            if no < 45:
                close_modal(pg, "map")
        check(not bad, f"월드 3: L31~L45 탭·드래그로 모두 구조·별 3 {bad or ''}")
        close_modal(pg, "next")
        pg.wait_for_selector(".rocket-box")
        check("눈꽃 설산 지역이 열렸어요" in pg.locator(".rocket-box").inner_text(), "월드 3 끝 → 수정 등 + 눈꽃 설산 열림")
        close_modal(pg, "ok")
        pg.wait_for_selector(".mem-box")
        n_mem = pg.locator(".mem-box .mem-poke").count()
        check(n_mem >= 10, f"월드 3 끝 → 기념 그림: 동굴 잔치에 구조한 친구 {n_mem}마리")
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / "18-memory-cave.png"))
        close_modal(pg, "ok")
        pg.wait_for_selector(".rocket-box")
        check(True, "월드 4 들어가면 로켓단 연출")
        close_modal(pg, "ok")

        # ---- 월드 4: 능력 (L46 꼬부기 소개)
        pg.click('.lvbtn[data-no="46"]', force=True)
        pg.wait_for_selector(".board .tile")
        check(pg.locator('.abil.pulse[data-k="w"]').count() == 1, "L46: 꼬부기 버튼이 반짝(소개)")
        check(pg.locator(".tile.water .road.ghost").count() == 1, "L46: 물 위에 생길 길을 흐리게 미리 보여 줌")
        pg.screenshot(path=str(OUT / "19-L46.png"))
        water = pg.evaluate("() => window.__T.G.state.cells.findIndex(t => t && t.wa)")
        tap_cell(pg, water)
        check(pg.evaluate("() => window.__T.G.moves") == 0 and pg.locator('.abil.hint1[data-k="w"]').count() == 1, "물을 그냥 누르면 → 안 바뀌고 꼬부기 버튼을 알려 줌")
        pg.click('.abil[data-k="w"]')
        check(pg.locator(".tile.aim").count() == 1 and pg.locator('.abil.on[data-k="w"]').count() == 1, "꼬부기 고르면 쓸 수 있는 물만 표시")
        other = pg.evaluate("() => window.__T.G.state.cells.findIndex(t => t && t.sh)")
        tap_cell(pg, other)
        check(pg.locator(".tile.aim").count() == 0 and pg.evaluate("() => window.__T.G.moves") == 0, "다른 칸 누르면 능력 고르기 취소")
        pg.click('.abil[data-k="w"]')
        tap_cell(pg, water)
        check(pg.locator(".tile.water").count() == 0 and pg.evaluate("() => window.__T.G.state.cells[%d].wb" % water) is True, "꼬부기 → 물이 물 다리가 됨")
        check(pg.locator('.abil.used[data-k="w"]').count() == 1, "능력 다 쓰면 버튼이 흐려짐")
        pg.wait_for_timeout(200)
        pg.screenshot(path=str(OUT / "19b-L46-bridge.png"))
        pg.click("#undoBtn")
        check(pg.locator(".tile.water").count() == 1 and pg.locator('.abil.used[data-k="w"]').count() == 0, "되돌리기 → 물·능력 횟수 원래대로")
        # L49 파이리: 태운 덤불은 사라지고 되돌리면 다시 보인다
        pg.evaluate("() => window.__T.startLevel(49)")
        pg.wait_for_selector(".board .tile")
        bush = pg.evaluate("() => window.__T.G.lv.sol.find(a => a.t === 'a').i")
        bid = pg.evaluate(f"() => window.__T.G.state.cells[{bush}].id")
        pg.click('.abil[data-k="f"]')
        tap_cell(pg, bush)
        check(not pg.locator(f'.tile[data-id="{bid}"]').is_visible() and pg.evaluate(f"() => window.__T.G.state.cells[{bush}]") is None, "파이리 → 덤불이 타서 빈칸")
        pg.click("#undoBtn")
        check(pg.locator(f'.tile[data-id="{bid}"]').is_visible(), "되돌리면 덤불이 다시 보임")
        # L52 이상해씨: 낭떠러지 두 칸이 한 번에 덩굴 다리
        pg.evaluate("() => window.__T.startLevel(52)")
        pg.wait_for_selector(".board .tile")
        pits = pg.locator(".tile.pit").count()
        pit = pg.evaluate("() => window.__T.G.lv.sol.find(a => a.t === 'a').i")
        pg.click('.abil[data-k="v"]')
        tap_cell(pg, pit)
        check(pits == 2 and pg.locator(".tile.pit").count() == 0 and pg.locator(".tile.vine").count() == 2, "이상해씨 → 낭떠러지 두 칸이 한 번에 덩굴 다리")
        pg.wait_for_timeout(200)
        pg.screenshot(path=str(OUT / "19c-L52-vine.png"))
        bad = []
        for no in range(46, 61):
            ok, n, stars = solve_level(no, drag_every=2)
            if not ok or stars != 3:
                bad.append((no, ok, stars))
            if no == 58:
                pg.screenshot(path=str(OUT / "19d-L58.png"))
            if no < 60:
                close_modal(pg, "map")
        check(not bad, f"월드 4: L46~L60 능력·탭·드래그로 모두 구조·별 3 {bad or ''}")
        close_modal(pg, "next")
        pg.wait_for_selector(".rocket-box")
        check("포켓몬 마을 지역이 열렸어요" in pg.locator(".rocket-box").inner_text(), "월드 4 끝 → 눈사람 + 포켓몬 마을 열림")
        close_modal(pg, "ok")
        pg.wait_for_selector(".mem-box")
        check(pg.locator(".mem-box .mem-poke").count() >= 10, "월드 4 끝 → 기념 그림(설산)")
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / "18-memory-snow.png"))
        close_modal(pg, "ok")
        pg.wait_for_selector(".rocket-box")
        close_modal(pg, "ok")

        # ---- 월드 5: 열매 · 두 친구
        pg.click('.lvbtn[data-no="61"]', force=True)
        pg.wait_for_selector(".board .tile")
        check(pg.locator(".tile .berry.pulse").count() == 1, "L61: 열매(체크포인트) 소개 — 열매가 반짝")
        pg.screenshot(path=str(OUT / "22-L61.png"))
        pg.evaluate("() => window.__T.startLevel(64)")
        pg.wait_for_selector(".board .tile")
        check(pg.locator(".gate.start").count() == 2 and pg.locator(".who-one").count() == 2, "L64: 길 잃은 친구 둘")
        pg.screenshot(path=str(OUT / "23-L64.png"))
        bad = []
        for no in range(61, 76):
            ok, n, stars = solve_level(no, drag_every=2)
            if not ok or stars != 3:
                bad.append((no, ok, stars))
            if no == 64:
                check(pg.locator(".res .res-poke").count() == 2, "두 친구 판 → 결과에 두 마리")
            if no == 73:
                pg.screenshot(path=str(OUT / "23b-L73.png"))
            if no < 75:
                close_modal(pg, "map")
        check(not bad, f"월드 5: L61~L75 모두 구조·별 3 {bad or ''}")
        close_modal(pg, "next")
        pg.wait_for_selector(".rocket-box")
        check("모든 지역의 포켓몬을 구했어요" in pg.locator(".rocket-box").inner_text(), "월드 5 끝 → 깃발 장식 + 모든 지역 구출")
        close_modal(pg, "ok")
        pg.wait_for_selector(".mem-box")
        check(pg.locator(".mem-box .mem-poke").count() >= 10, "월드 5 끝 → 기념 그림(마을 축제)")
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / "18-memory-town.png"))
        close_modal(pg, "ok")
        pg.wait_for_selector(".wnode")

        # 일부러 많이 움직이면 별이 줄어든다
        pg.evaluate("() => window.__T.startLevel(1)")
        pg.wait_for_selector(".board .tile")
        rot = pg.evaluate("() => window.__T.G.state.cells.findIndex(t => t && t.rot)")
        for _ in range(4):
            tap_cell(pg, rot)
        play_solution(pg)
        pg.click("#goBtn")
        pg.wait_for_selector(".res")
        check(pg.locator(".stars .on").count() == 1, "최소+3 넘으면 → 별 1개 (par 1, 5번)")
        check(pg.evaluate("() => window.__T.Store.data.levels.L01.stars") == 3, "최고 별은 그대로 3")
        close_modal(pg, "map")

        # ---- 4. 도감 · 센터
        pg.evaluate("() => window.__T.renderDex()")
        cnt = pg.evaluate("() => window.__T.Store.data.dexOrder.length")
        check(pg.locator(".dcard").count() == cnt and cnt >= 10, f"도감: 구조한 친구 {cnt}마리 카드")
        check(pg.locator(".mem-card").count() == 3, "도감: 기념 그림 3장 (동굴·설산·마을)")
        pg.screenshot(path=str(OUT / "13-dex.png"))
        pg.locator('.mem-card[data-m="4"]').click()
        check(pg.locator(".mem-box .mem-poke").count() >= 10, "도감에서 기념 그림 다시 보기")
        close_modal(pg, "ok")
        pg.locator(".dcard").first.click()
        check(pg.locator(".dex-card").count() == 1, "도감 카드 자세히")
        close_modal(pg, "ok")
        pg.evaluate("() => window.__T.renderCenter()")
        check(pg.locator(".roam").count() >= 10, "센터: 구조한 친구들이 돌아다님")
        check(pg.locator(".deco").count() == 5, "센터: 장식 5개 (화분·분수·수정 등·눈사람·깃발)")
        pg.screenshot(path=str(OUT / "14-center.png"))

        # ---- 5. 보호자
        pg.evaluate("() => window.__T.renderTitle()")
        pg.click("[data-a=parent]")
        q = pg.locator(".gate-box b").inner_text()
        a_, b_ = [int(x) for x in re.findall(r"\d+", q)]
        for ch in str(a_ * b_):
            pg.click(f'.key[data-v="{ch}"]')
        pg.click('.key[data-v="ok"]')
        pg.wait_for_selector(".parent")
        check(True, "보호자 잠금: 곱셈 맞히면 열림")
        pg.screenshot(path=str(OUT / "15-parent.png"))
        pg.click('[data-t="autoSolve"]')
        check(pg.evaluate("() => window.__T.Store.data.settings.autoSolve") is True, "설정 저장 (풀어 보기)")
        pg.fill("#wipeIn", "초기")
        pg.click("[data-a=wipe]")
        check(pg.evaluate("() => window.__T.Store.data.dexOrder.length") > 0, "'초기' 만 쓰면 안 지워짐")
        pg.fill("#wipeIn", "초기화")
        pg.click("[data-a=wipe]")
        check(pg.evaluate("() => window.__T.Store.data.dexOrder.length") == 0, "'초기화' 쓰면 지워짐")
        # 풀어 보기 버튼
        pg.evaluate("() => window.__T.startLevel(1)")
        pg.wait_for_selector("[data-a=auto]")
        pg.click("[data-a=auto]")
        pg.wait_for_selector(".res", timeout=8000)
        check(True, "🤖 풀어 보기 → 구조 성공")
        close_modal(pg, "map")

        # ---- 7. 화면 크기
        pg.evaluate("() => { window.__T.Store.data.settings.openAll = true; window.__T.Store.save(); }")
        for (w, h, name) in [(1024, 768, "iPad 10.2 가로"), (1180, 820, "iPad 11 가로"), (1366, 1024, "iPad 12.9 가로"), (820, 1180, "iPad 세로"), (844, 390, "폰 가로")]:
            pg.set_viewport_size({"width": w, "height": h})
            for no in (1, 24, 40, 54, 75):
                pg.evaluate(f"() => window.__T.startLevel({no})")
                pg.wait_for_selector(".board .tile")
                pg.wait_for_timeout(80)
                sm = small_targets(pg)
                check(not sm, f"{name} L{no:02d}: 누르는 것 44px 이상 {sm[:3] if sm else ''}")
                ov = pg.evaluate("() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth")
                check(not ov, f"{name} L{no:02d}: 가로 스크롤 없음")
                fit = pg.evaluate("""() => { const b = document.querySelector('#board').getBoundingClientRect(); return b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1; }""")
                check(fit, f"{name} L{no:02d}: 판이 화면 안")
                go = pg.evaluate("""() => ['#goBtn', '#undoBtn', '#redoBtn', '#resetBtn', '#hintBtn', '.abil'].flatMap(s => [...document.querySelectorAll(s)]).filter(el => { const b = el.getBoundingClientRect(); return !(b.bottom <= innerHeight + 1 && b.top >= 0); }).map(el => el.id || el.className)""")
                check(not go, f"{name} L{no:02d}: 출발·도구 버튼이 스크롤 없이 보임 {go or ''}")
            pg.screenshot(path=str(OUT / f"20-size-{w}x{h}.png"))
            pg.evaluate("() => window.__T.renderMap()")
            sm = small_targets(pg)
            check(not sm, f"{name} 지도: 누르는 것 44px 이상 {sm[:3] if sm else ''}")
            inside = pg.evaluate("""() => [...document.querySelectorAll('.wnode')].every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })""")
            check(inside, f"{name} 지도: 월드 버튼이 화면 안")
            pg.screenshot(path=str(OUT / f"21-map-{w}x{h}.png"))
        pg.set_viewport_size({"width": 1180, "height": 820})

        # ---- 6. 새 버전 감지
        FAKE_VER["on"] = True
        pg.evaluate("() => { window.__T.Update.last = 0; window.__T.renderTitle(); }")
        pg.wait_for_selector("text=새 버전으로 바꾸기", timeout=5000)
        check(True, "새 버전 감지 알림")
        FAKE_VER["on"] = False
        close_modal(pg, "later")

        check(not errors, f"콘솔 오류 0개 {errors[:3] if errors else ''}")
        br.close()
    srv.shutdown()
    print(f"\n{'❌ 실패 ' + str(len(fails)) + '개' if fails else '✅ 전부 통과'} · 스크린샷 {OUT}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
