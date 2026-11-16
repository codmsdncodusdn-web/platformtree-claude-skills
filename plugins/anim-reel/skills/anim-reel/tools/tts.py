"""대본(timing.json의 sentences) → AI 목소리 voice/voice.mp3 + 단어별 시간 voice/words.json

  node tools/reel.mjs voice <릴스 폴더> [--voice 여자|남자|현수|<음성 이름>] [--rate +10%] [--pitch +0Hz]
  (직접 실행할 때: uv run --with edge-tts python tools/tts.py <릴스 폴더> ...)

- 무료 Microsoft Edge 낭독 음성(edge-tts)을 쓴다. API 키가 필요 없다.
- 단어 경계 시간을 같이 받아서 받아쓰기 없이 자막·장면·입모양을 목소리에 맞춘다.
- 403 오류가 나면 edge-tts가 오래된 것: uv가 매번 최신을 받도록 --refresh-package edge-tts 로 다시 실행한다.
"""
import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

VOICES = {
    "여자": "ko-KR-SunHiNeural", "여": "ko-KR-SunHiNeural", "female": "ko-KR-SunHiNeural", "선희": "ko-KR-SunHiNeural",
    "남자": "ko-KR-InJoonNeural", "남": "ko-KR-InJoonNeural", "male": "ko-KR-InJoonNeural", "인준": "ko-KR-InJoonNeural",
    "현수": "ko-KR-HyunsuMultilingualNeural", "hyunsu": "ko-KR-HyunsuMultilingualNeural",
}


def clean(text: str) -> str:
    t = text.replace(" / ", " ").replace("*", "")
    return re.sub(r"\s+", " ", t).strip()


async def synth(text, voice, rate, pitch, out_mp3):
    import edge_tts
    com = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary="WordBoundary")
    words = []
    with open(out_mp3, "wb") as f:
        async for ch in com.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                s = ch["offset"] / 1e7
                words.append({"w": ch["text"], "s": round(s, 3), "e": round(s + ch["duration"] / 1e7, 3)})
    return words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("reel")
    ap.add_argument("--voice", default="현수")
    ap.add_argument("--rate", default="+10%")
    ap.add_argument("--pitch", default="+0Hz")
    a = ap.parse_args()

    reel = Path(a.reel).resolve()
    T = json.loads((reel / "timing.json").read_text(encoding="utf-8"))
    sents = [clean(s["text"]) for s in T["sentences"]]
    # 문장마다 끝맺음 부호가 있어야 자연스럽게 쉰다
    sents = [s if re.search(r"[.!?…]$", s) else s + "." for s in sents if s]
    text = " ".join(sents)
    voice = VOICES.get(a.voice, a.voice)

    vdir = reel / "voice"
    vdir.mkdir(exist_ok=True)
    for old in list(vdir.glob("voice.*")) + list(vdir.glob("voice_1x.*")) + [vdir / "words.json"]:
        if old.exists():
            old.unlink()
    out = vdir / "voice.mp3"
    last = None
    for attempt in range(3):
        try:
            words = asyncio.run(synth(text, voice, a.rate, a.pitch, out))
            if words and out.stat().st_size > 1000:
                break
            last = RuntimeError("음성이 비어 있어요")
        except Exception as e:  # 네트워크·서비스 오류
            last = e
    else:
        print(f"❌ 목소리 생성 실패: {last}", file=sys.stderr)
        print("👉 인터넷 연결을 확인하고 다시 시도하세요. 계속 실패하면 직접 녹음한 파일을 주세요(녹음 모드).", file=sys.stderr)
        sys.exit(1)

    (vdir / "words.json").write_text(json.dumps({"engine": "edge-tts", "voice": voice, "rate": a.rate, "words": words}, ensure_ascii=False, indent=1), encoding="utf-8")
    # 설정을 timing.json에 남겨 두면 다음에 다시 만들 때 같은 목소리
    T["tts"] = {"voice": voice, "rate": a.rate, "pitch": a.pitch}
    (reel / "timing.json").write_text(json.dumps(T, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✅ 목소리 {voice} ({a.rate}) → {out.relative_to(reel)} · 단어 {len(words)}개 → voice/words.json")


if __name__ == "__main__":
    main()
