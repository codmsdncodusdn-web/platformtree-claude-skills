"""faster-whisper로 단어별 시간 받아쓰기 (whisper.cpp가 없는 Mac 등에서 쓰는 대체 경로)

  uv run --with faster-whisper python tools/stt_fw.py <16kHz wav> <출력 json> [--prompt "..."] [--model large-v3-turbo]
출력: whisper.cpp -ojf와 비슷한 {"words": [{"w","s","e"}]}
"""
import argparse
import json
import os
import sys
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("wav")
    ap.add_argument("out")
    ap.add_argument("--prompt", default="")
    ap.add_argument("--model", default=os.environ.get("REEL_FW_MODEL", "large-v3-turbo"))
    a = ap.parse_args()

    from faster_whisper import WhisperModel
    root = Path.home() / ".platformtree-skills" / "faster-whisper"
    root.mkdir(parents=True, exist_ok=True)
    print(f"🎙️  받아쓰기 모델 {a.model} 준비 중… (처음 한 번 내려받아요)", file=sys.stderr)
    m = WhisperModel(a.model, device="cpu", compute_type="int8", download_root=str(root))
    segs, _ = m.transcribe(a.wav, language="ko", word_timestamps=True, vad_filter=False,
                           initial_prompt=a.prompt or None, condition_on_previous_text=False)
    words = []
    for s in segs:
        for w in s.words or []:
            t = w.word.strip()
            if t:
                words.append({"w": t, "s": round(w.start, 3), "e": round(w.end, 3)})
    Path(a.out).write_text(json.dumps({"words": words}, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
