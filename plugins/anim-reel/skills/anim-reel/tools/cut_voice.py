"""녹음 원본 → NG·중복 테이크를 빼고 쉼을 조인 voice/voice.m4a

  python tools/cut_voice.py <릴스 폴더> [--drop 50.8-53.8,20.72-20.855] [--max-gap 0.26]

  - 원본: <릴스 폴더>/voice/raw.m4a (mp3·wav도 됨)
  - --drop: 통째로 버릴 구간(원본 기준 초). 중복 테이크, 말실수, 주변 소리(아기·기침 등)
  - 쉼(-35dB 이하 0.18초 이상)은 --max-gap 이하로 줄이고, 앞뒤 무음은 조금만 남긴다
  - 결과: voice/voice.m4a, voice/cut_map.json (다시 받아쓰려면 voice/words.json을 지울 것)
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

LEAD, TAIL, FADE = 0.12, 0.30, 0.008


def silences(path, noise=-35, dmin=0.18):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", f"silencedetect=noise={noise}dB:d={dmin}",
                        "-f", "null", "-"], capture_output=True, text=True, errors="replace")
    st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    return list(zip(st, en))


def probe(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("reel")
    ap.add_argument("--drop", default="")
    ap.add_argument("--max-gap", type=float, default=0.26)
    a = ap.parse_args()
    vdir = Path(a.reel) / "voice"
    src = next((p for p in vdir.glob("raw.*") if p.suffix.lower() in (".m4a", ".mp3", ".wav", ".aac")), None)
    if not src:
        sys.exit(f"❌ {vdir}/raw.m4a 가 없어요. 녹음 원본을 그 이름으로 넣어주세요.")
    drop = [tuple(float(x) for x in d.split("-")) for d in a.drop.split(",") if d.strip()]
    dur = probe(src)

    speech, t = [], 0.0
    for s0, s1 in silences(src):
        if s0 > t: speech.append([t, s0])
        t = s1
    if t < dur: speech.append([t, dur])
    keep = []
    for s0, s1 in speech:
        for d0, d1 in drop:
            if s1 <= d0 or s0 >= d1: continue
            if s0 < d0: keep.append([s0, d0])
            s0 = max(s0, d1)
        if s1 > s0 and not any(d0 <= s0 and s1 <= d1 for d0, d1 in drop): keep.append([s0, s1])
    keep = [k for k in keep if k[1] - k[0] > 0.04]

    segs = []
    for i, (s0, s1) in enumerate(keep):
        pa = LEAD if i == 0 else min(a.max_gap / 2, (s0 - keep[i - 1][1]) / 2)
        pb = TAIL if i == len(keep) - 1 else min(a.max_gap / 2, (keep[i + 1][0] - s1) / 2)
        lo, hi = max(0.0, s0 - pa), min(dur, s1 + pb)
        for d0, d1 in drop:  # 쉼을 붙이다가 버린 구간으로 다시 들어가지 않게
            if d0 < s0 <= d1 + 1e-6: lo = max(lo, d1)
            if d0 - 1e-6 <= s1 < d1: hi = min(hi, d0)
        segs.append((lo, hi))

    parts, labels = [], []
    for k, (s0, s1) in enumerate(segs):
        L = s1 - s0
        parts.append(f"[0:a]atrim={s0:.3f}:{s1:.3f},asetpts=PTS-STARTPTS,afade=t=in:d={FADE},afade=t=out:st={max(0, L - FADE):.3f}:d={FADE}[s{k}]")
        labels.append(f"[s{k}]")
    fc = ";".join(parts) + ";" + "".join(labels) + f"concat=n={len(segs)}:v=0:a=1[out]"
    out = vdir / "voice.m4a"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-filter_complex", fc, "-map", "[out]", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", str(out)], check=True)
    (vdir / "cut_map.json").write_text(json.dumps({"source": src.name, "segments": segs, "drop": drop}, indent=1), encoding="utf-8")
    words = vdir / "words.json"
    if words.exists(): words.unlink()  # 잘린 파일 기준으로 다시 받아써야 함
    print(f"✅ {dur:.2f}s → {probe(out):.2f}s  ({len(segs)}개 구간, 버린 구간 {drop or '없음'}) → {out}")


if __name__ == "__main__":
    main()
