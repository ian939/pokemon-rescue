"""게임 목소리를 Microsoft Edge TTS 로 미리 녹음한다. (포켓몬 사다리 대모험 도구를 고쳐 씀)

    pip install edge-tts
    python tools/gen-voice.py          # 새로 생긴 말만 녹음
    python tools/gen-voice.py --list   # 녹음할 말만 보기
    python tools/gen-voice.py --all    # 전부 다시

녹음하는 말 (node 로 js 파일을 읽어 모은다)
  · 한국어: js/voice-lines.js 의 L 문장 · 열린 월드(js/worlds.js open)의 구조 포켓몬 이름
  · 영어: js/voice-lines.js 의 EN_ALL (방향 · Rescued! · 숫자 · 별)
목소리: 한국어 ko-KR-SunHiNeural · "옹" 든 로켓단 말 ko-KR-InJoonNeural · 영어 en-US-AnaNeural
결과: assets/voice/<열쇠 md5 10자>.mp3 + assets/voice/voice.js (window.VOICE = { 열쇠: 파일 })
  열쇠 = app.js 의 Voice.key() 와 똑같이 (소문자, 기호·이모지 빼기)
쓰지 않게 된 mp3 는 지운다. 말을 바꾸면 이 스크립트를 다시 돌릴 것.
"""
import asyncio
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import unicodedata

for s in (sys.stdout, sys.stderr):
    try:
        s.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "voice"
KO, ROCKET, EN = "ko-KR-SunHiNeural", "ko-KR-InJoonNeural", "en-US-AnaNeural"
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️‍]")


def key(s):
    s = EMOJI.sub("", s).strip()
    s = unicodedata.normalize("NFC", "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)))
    s = s.lower()
    s = re.sub("[’‘`]", "'", s)
    s = re.sub("[^a-z0-9'가-힣]+", " ", s)
    return s.strip()


def collect():
    js = r"""
    const V = require('./js/voice-lines.js'), W = require('./js/worlds.js'), P = require('./data/pokemon.js');
    const ko = new Set(Object.values(V.L));
    W.WORLDS.filter(w => w.open).forEach(w => {
      ko.add(w.name); ko.add(w.deco.name);
      P.types.forEach((t, i) => { if (t.split('·').some(x => w.types.includes(x))) ko.add(P.names[i]); });
    });
    const en = new Set(V.EN_ALL);
    console.log(JSON.stringify({ ko: [...ko], en: [...en] }));
    """
    r = subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise SystemExit(r.stderr)
    d = json.loads(r.stdout)
    items = {}
    for t in d["ko"]:
        k = key(t)
        if k:
            items.setdefault(k, (t, ROCKET if "옹" in t else KO, "-5%"))
    for t in d["en"]:
        k = key(t)
        if k:
            items[k] = (t, EN, "-12%")
    return items


async def record(text, voice, rate, dst):
    import edge_tts
    err = None
    for attempt in range(4):
        try:
            await edge_tts.Communicate(EMOJI.sub("", text).strip(), voice, rate=rate).save(str(dst))
            if dst.stat().st_size > 500:
                return True
        except Exception as e:  # 서버가 가끔 끊는다
            err = e
            await asyncio.sleep(1.5 * (attempt + 1))
    print("  ✗", text, str(err)[:80])
    if dst.exists():
        dst.unlink()  # 반쯤 받은 파일은 지운다
    return False


async def main():
    items = collect()
    if "--list" in sys.argv:
        for k, (t, v, _) in sorted(items.items()):
            print(v.split("-")[2][:6], t)
        print(len(items), "개")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*.mp3"):
        if f.stat().st_size < 500:
            f.unlink()  # 예전에 실패한 빈 파일
    index = {}
    todo = []
    for k, (t, v, rate) in items.items():
        f = hashlib.md5((k + "|" + v).encode("utf-8")).hexdigest()[:10] + ".mp3"
        index[k] = f
        if "--all" in sys.argv or not (OUT / f).exists():
            todo.append((t, v, rate, OUT / f))
    print(f"말 {len(items)}개 · 새로 녹음 {len(todo)}개")
    sem = asyncio.Semaphore(6)

    async def one(args):
        async with sem:
            return await record(*args)

    done = await asyncio.gather(*(one(a) for a in todo))
    print(f"녹음 {sum(done)}/{len(todo)}")
    keep = set(index.values())
    for f in OUT.glob("*.mp3"):
        if f.name not in keep:
            f.unlink()
    index = {k: f for k, f in index.items() if (OUT / f).exists()}
    (OUT / "voice.js").write_text("window.VOICE = " + json.dumps(index, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + ";\n", encoding="utf-8")
    size = sum(f.stat().st_size for f in OUT.glob("*.mp3"))
    print(f"assets/voice: {len(index)}개 · {size / 1e6:.1f}MB")


if __name__ == "__main__":
    asyncio.run(main())
