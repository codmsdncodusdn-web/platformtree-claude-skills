"""캐릭터 포즈 이미지 → 영상용으로 정렬 + 립싱크용 입 위치 측정

  python tools/prep_character.py <원본 포즈 폴더> <릴스 폴더>

  - 원본 폴더: 배경이 투명한 PNG, 파일 이름 = 포즈 이름 (neutral.png 필수, 나머지 자유: wave, pointup, present, think, one, two, thumbs, pointdown …)
  - 하는 일: ① 포즈마다 머리 위치가 달라 화면이 튀지 않게 머리카락 윗선·얼굴 중심을 맞춰 960×1260으로 정렬
            ② 입 위치·기울기·폭·피부색을 재서 assets/char/mouths.json에 저장 (영상에서 그려진 입을 덮고 말하는 입을 그림)
  - 결과: <릴스 폴더>/assets/char/<포즈>.png, mouths.json, check.jpg(입 상자 확인용)
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

W, H, SCALE = 1600, 2100, 0.6     # 정렬 캔버스(원본 2k 기준)와 저장 배율 → 960×1260
TARGET_X, TARGET_TOP = 684, 115   # 얼굴 중심 x, 머리카락 윗선 y (원본 px)


def face_anchor(a):
    r, g, b, al = (a[..., k].astype(int) for k in range(4))
    hair = (al > 200) & (r < 45) & (g < 45) & (b < 45) & (abs(r - b) < 12)
    ys, xs = np.where(hair)
    if not ys.size:
        raise SystemExit("머리카락(검정 계열)을 찾지 못했어요. 머리색이 밝으면 face_anchor의 색 조건을 바꿔주세요.")
    top = ys.min(); hx = xs[ys < top + 220]
    skin = (al > 200) & (r > 200) & (g > 150) & (b > 110) & (r - b > 40)
    band = skin[top + 250: top + 450, hx.min(): hx.max()]
    sy, sx = np.where(band)
    cx = sx.mean() + hx.min() if sx.size else (hx.min() + hx.max()) / 2
    return cx, top


def mouth(a):
    r, g, b, al = (a[..., k].astype(float) for k in range(4))
    m = (al > 200) & (r > 110) & (g / np.maximum(r, 1) < 0.66) & (b / np.maximum(r, 1) < 0.66)  # 입술·입안 (눈동자 갈색은 제외됨)
    m[:330, :] = False; m[500:, :] = False; m[:, :380] = False; m[:, 620:] = False             # 코 아래 얼굴 영역만
    ys, xs = np.where(m)
    if not ys.size:
        return None
    cy, cx = np.median(ys), np.median(xs)
    sel = (abs(ys - cy) < 40) & (abs(xs - cx) < 65); ys, xs = ys[sel], xs[sel]
    X0, Y0, X1, Y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    ring = np.zeros(al.shape, bool); ring[Y0 - 24:Y1 + 24, X0 - 30:X1 + 30] = True; ring[Y0 - 4:Y1 + 4, X0 - 6:X1 + 6] = False
    skin = ring & (al > 200) & (g / np.maximum(r, 1) > 0.74) & (r > 200)
    rgb = a[..., :3]
    sc = np.median(rgb[skin], axis=0).astype(int).tolist() if skin.sum() > 20 else [244, 198, 164]
    cov = np.cov(np.vstack([xs - xs.mean(), ys - ys.mean()])); v = np.linalg.eigh(cov)[1][:, 1]
    ang = math.degrees(math.atan2(v[1], v[0])); ang = ang - 180 if ang > 90 else ang + 180 if ang < -90 else ang
    dark = (al > 200) & (r < 120) & (abs(r - g) < 40)
    row = int((Y0 + Y1) / 2); cols = np.where(dark[row - 8:row + 8, X0 - 30:X1 + 30].any(0))[0]
    wfull = int(max(X1 - X0, cols.max() - cols.min() if cols.size else 0))
    return dict(box=[X0, Y0, X1, Y1], cx=(X0 + X1) / 2, cy=(Y0 + Y1) / 2, w=X1 - X0, h=Y1 - Y0, skin=sc, angle=round(ang, 1), wFull=wfull)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    src, reel = Path(sys.argv[1]), Path(sys.argv[2])
    out = reel / "assets" / "char"; out.mkdir(parents=True, exist_ok=True)
    files = sorted(src.glob("*.png"))
    if not any(f.stem == "neutral" for f in files):
        sys.exit("neutral.png(기본 자세)가 필요해요.")
    info, thumbs = {}, []
    for f in files:
        im = Image.open(f).convert("RGBA")
        k = 2048 / im.height  # 원본 크기가 달라도 2048 높이 기준으로 맞춤
        if abs(k - 1) > 0.01:
            im = im.resize((round(im.width * k), 2048), Image.LANCZOS)
        cx, top = face_anchor(np.array(im))
        c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        c.paste(im, (int(120 + TARGET_X - cx), int(40 + TARGET_TOP - top)), im)
        c = c.resize((int(W * SCALE), int(H * SCALE)), Image.LANCZOS)
        c.save(out / f"{f.stem}.png", optimize=True)
        m = mouth(np.array(c))
        if m:
            info[f.stem] = m
            X0, Y0, X1, Y1 = m["box"]
            t = c.crop((X0 - 90, Y0 - 110, X1 + 90, Y1 + 70)); ImageDraw.Draw(t).rectangle((90, 110, 90 + X1 - X0, 110 + Y1 - Y0), outline=(0, 160, 255, 255), width=2)
            bg = Image.new("RGB", t.size, (237, 234, 228)); bg.paste(t, (0, 0), t); thumbs.append(bg.resize((240, 240)))
        print(f"{f.stem:12s} 얼굴중심 x={cx:.0f} 머리윗선 y={top}  입 {'OK ' + str(m['box']) if m else '못 찾음 (립싱크 없이 표시)'}")
    (out / "mouths.json").write_text(json.dumps(info, indent=1), encoding="utf-8")
    if thumbs:
        sheet = Image.new("RGB", (240 * len(thumbs), 240), (237, 234, 228))
        for i, t in enumerate(thumbs): sheet.paste(t, (i * 240, 0))
        sheet.save(out / "check.jpg")
    print(f"✅ {len(files)}개 포즈 → {out}  (입 상자 확인: {out / 'check.jpg'})")


if __name__ == "__main__":
    main()
