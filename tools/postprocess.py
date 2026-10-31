"""Codex 원본(art-src/gen/*.png) → 게임 그림(assets/) 다듬기 (Pillow). 사다리게임 도구를 고쳐 씀.

    python tools/postprocess.py

- 바닥 2장(강가·동굴): 2:1 그대로 1200×600 webp
- 지도·처음 화면 배경: 1600 / 1280 폭 webp
- 장애물 묶음(3×2): 나무·바위·덤불·연못·다리·표지판 — 칸마다 잘라 흰 배경 지우고 128px PNG (다리는 칸을 꽉 채움)
- 센터 건물: 흰 배경 지우고 192px PNG
- 센터 장식 묶음(3×2): 화분·분수·수정 등·눈사람·깃발·벤치 — 160px 높이 PNG
- 기념 그림 배경 3장(동굴·설산·마을 잔치): 1280 폭 webp
- 월드 4 바닥 타일 3장(물·낭떠러지·덩굴 다리): 칸을 꽉 채우는 128px PNG
- 월드 6·7: 화산·하늘성 바닥, 잔치 배경, 7지역 지도(worldmap7), 장애물 묶음2(용암·화산 바위·구름·별 수정 + 장식 화로·망원경)
- 앱 아이콘 180·512 (센터 건물 + 하늘색 바탕)
없는 원본은 건너뛴다.
"""
import pathlib
import sys

from PIL import Image, ImageDraw

for s in (sys.stdout, sys.stderr):
    try:
        s.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEN = ROOT / "art-src" / "gen"
A = ROOT / "assets"


def remove_white(im, tol=26):
    """가장자리와 이어진 흰색(근처)만 투명하게 — 그림 안쪽 흰색은 남긴다"""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    stack = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    white = lambda p: p[3] < 20 or (p[0] > 255 - tol and p[1] > 255 - tol and p[2] > 255 - tol)
    while stack:
        x, y = stack.pop()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        p = px[x, y]
        if not white(p):
            continue
        px[x, y] = (255, 255, 255, 0)
        if x > 0: stack.append((x - 1, y))
        if x < w - 1: stack.append((x + 1, y))
        if y > 0: stack.append((x, y - 1))
        if y < h - 1: stack.append((x, y + 1))
    return im


def trim(im):
    b = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    return im.crop(b) if b else im


def fit(im, side):
    im = im.copy()
    im.thumbnail((side, side), Image.LANCZOS)
    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    return out


def save_png(im, dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, optimize=True)
    print(f"→ {dst.relative_to(ROOT)} {im.size[0]}×{im.size[1]} {dst.stat().st_size // 1024}KB")


def webp(src, dst, width, quality=84):
    if not (GEN / src).exists():
        print("· 없음:", src)
        return
    im = Image.open(GEN / src).convert("RGB")
    h = round(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=quality, method=6)
    print(f"{src} → {dst.relative_to(ROOT)} {dst.stat().st_size // 1024}KB")


def cells(src, cols, rows, inset=0.0):
    im = Image.open(GEN / src).convert("RGB")
    cw, ch = im.width / cols, im.height / rows
    for r in range(rows):
        for c in range(cols):
            box = (round(c * cw + cw * inset), round(r * ch + ch * inset), round((c + 1) * cw - cw * inset), round((r + 1) * ch - ch * inset))
            yield im.crop(box)


def sheet(src, names, dst_dir, side=None, height=None, full=()):
    if not (GEN / src).exists():
        print("· 없음:", src)
        return
    for im, name in zip(cells(src, 3, 2, 0.02), names):
        if name in full:
            # 칸을 꽉 채우는 바닥 그림(다리): 흰 배경을 지우고 남은 부분만 정사각형으로 늘린다
            im = trim(remove_white(im)).resize((128, 128), Image.NEAREST if im.width < 128 else Image.LANCZOS)
        else:
            im = trim(remove_white(im))
            if side:
                im = fit(im, side)
            else:
                im = im.resize((round(im.width * height / im.height), height), Image.LANCZOS)
        save_png(im, dst_dir / f"{name}.png")


def house():
    if not (GEN / "center-house.png").exists():
        print("· 없음: center-house.png")
        return None
    im = trim(remove_white(Image.open(GEN / "center-house.png")))
    save_png(fit(im, 192), A / "ui" / "center-house.png")
    return im


def icons(h):
    if h is None:
        return
    for side in (512, 180):
        bg = Image.new("RGBA", (side, side), (159, 216, 255, 255))
        d = ImageDraw.Draw(bg)
        d.rectangle((0, side * 0.72, side, side), fill=(111, 190, 74, 255))
        bg.alpha_composite(fit(h, round(side * 0.82)), (round(side * 0.09), round(side * 0.08)))
        save_png(bg.convert("RGB"), A / "ui" / f"icon-{side}.png")


def square(src, dst, side=128):
    if not (GEN / src).exists():
        print("· 없음:", src)
        return
    save_png(Image.open(GEN / src).convert("RGB").resize((side, side), Image.LANCZOS), dst)


def main():
    webp("region-river.png", A / "board" / "region-river.webp", 1200)
    webp("region-cave.png", A / "board" / "region-cave.webp", 1200)
    # (예전 5지역 지도 worldmap.png 는 worldmap7 로 바뀌어 안 씀)
    webp("title-bg.png", A / "ui" / "title-bg.webp", 1280)
    sheet("obstacles.png", ["ob-tree", "ob-rock", "ob-bush", "pond", "bridge", "sign"], A / "board", side=128, full=("bridge",))
    sheet("decor.png", ["deco-pot", "deco-fountain", "deco-crystal", "deco-snowman", "deco-bunting", "deco-bench"], A / "ui", height=160)
    for k in ("cave", "snow", "town", "volcano", "sky", "power", "temple"):
        webp(f"party-{k}.png", A / "ui" / f"party-{k}.webp", 1280)
    # 월드 6·7
    webp("region-volcano.png", A / "board" / "region-volcano.webp", 1200)
    webp("region-sky.png", A / "board" / "region-sky.webp", 1200)
    webp("worldmap7.png", A / "ui" / "worldmap7.webp", 1600)  # 7지역 지도 (새 이름 — 패드가 옛 지도를 붙들지 않게)
    # 월드 8·9
    webp("region-power.png", A / "board" / "region-power.webp", 1200)
    webp("region-temple.png", A / "board" / "region-temple.webp", 1200)
    webp("worldmap9.png", A / "ui" / "worldmap9.webp", 1600)  # 9지역 지도
    square("portal-tile.png", A / "board" / "portal-tile.png")
    if (GEN / "obstacles3.png").exists():
        names = ["ob-gen", "ob-drum", "ob-pillar", "ob-rainbow", "deco-tesla", "deco-trophy"]
        for im, name in zip(cells("obstacles3.png", 3, 2, 0.02), names):
            im = trim(remove_white(im))
            if name.startswith("ob-"):
                save_png(fit(im, 128), A / "board" / f"{name}.png")
            else:
                save_png(im.resize((round(im.width * 160 / im.height), 160), Image.LANCZOS), A / "ui" / f"{name}.png")
    if (GEN / "obstacles2.png").exists():
        names = ["ob-lava", "ob-basalt", "ob-cloud", "ob-star", "deco-brazier", "deco-telescope"]
        for im, name in zip(cells("obstacles2.png", 3, 2, 0.02), names):
            im = trim(remove_white(im))
            if name.startswith("ob-"):
                save_png(fit(im, 128), A / "board" / f"{name}.png")
            else:
                save_png(im.resize((round(im.width * 160 / im.height), 160), Image.LANCZOS), A / "ui" / f"{name}.png")
    for k in ("water", "pit", "vine"):
        square(f"{k}-tile.png", A / "board" / f"{k}-tile.png")
    icons(house())


if __name__ == "__main__":
    main()
