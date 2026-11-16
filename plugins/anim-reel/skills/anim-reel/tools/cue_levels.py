"""렌더된 효과음 트랙에서 큐마다 실제 레벨을 재서 out/resolved_cues.json에 적는다 (Real SFX critique.py가 읽는 값).

  python tools/cue_levels.py <릴스 폴더> [효과음 트랙 wav]
  (효과음 트랙: 목소리 없이 렌더한 out/preview.mp4에서 ffmpeg -vn 으로 뽑은 out/sfx_track.wav)
"""
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 48000


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def db(v):
    return 20 * math.log10(max(float(v), 1e-9))


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    track = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "out" / "sfx_track.wav"
    cues_path = root / "out" / "resolved_cues.json"
    x = decode(track)
    data = json.loads(cues_path.read_text(encoding="utf-8"))
    for c in data["cues"]:
        # 소리가 가장 센 순간 앞뒤 60ms 피크, 그 순간 -0.12s~+0.2s RMS (휙 소리는 앞부분이 길게 차오르므로 시작점 기준은 안 됨)
        p = int(c["peak_time"] * SR)
        win = x[max(0, p - int(0.06 * SR)): p + int(0.06 * SR)]
        body = x[max(0, p - int(0.12 * SR)): p + int(0.2 * SR)]
        c["peak_after_db"] = round(db(np.abs(win).max() if win.size else 0), 1)
        c["loud_after_db"] = round(db(np.sqrt(np.mean(body ** 2)) if body.size else 0) - 0.7, 1)
    cues_path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    vals = sorted(c["loud_after_db"] for c in data["cues"])
    print(f"{len(vals)} cues measured; loudness 10th–90th pct: {vals[len(vals) // 10]:.1f} .. {vals[int(0.9 * (len(vals) - 1))]:.1f} dB")


if __name__ == "__main__":
    main()
