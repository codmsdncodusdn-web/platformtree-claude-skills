# 효과음

## 출처
- `sfx/*.mp3` — Mixkit(무료 라이선스, 파일 재배포 금지). `reel.mjs new`가 릴스 폴더를 만들 때 `tools/fetch_assets.mjs`로 각자 컴퓨터에 받는다.
- `sfx/openverse/*.mp3` — Openverse에서 고른 CC0 실제 녹음(마커·고무도장·종이·봉투·쿵). 출처 `sfx/openverse/CREDITS.md`.
- 더 필요하면 Openverse API: `https://api.openverse.org/v1/audio/?q=<검색어>&license=cc0` (가끔 504/500이 나면 잠시 후 다시). 받은 소리는 `build.mjs`의 `HIT` 표에 onset/peak(초)를 추가한다(`node <스킬>/node_modules/hyperframes/bin/hyperframes.mjs audio 파일 --json`의 moments).

## 순간별 매핑 (이름 = timing.json의 name)
| 순간 | 소리 |
|---|---|
| 카드 등장 | paper_slide |
| 빨간 X·밑줄 | scribble, sign_stroke, pencil_stroke, openverse/ov_marker (같은 소리 2번까지) |
| 알약·스티커 등장 | pop_light, pop_bubble, pop_long, pop_message, pop_hard |
| 체크 | click_check, click_modern, click_plastic, click_device (돌려 쓰기) |
| 더블클릭 | click_double |
| 도장 | openverse/ov_stamp |
| 프롬프트 타이핑 | typing_laptop (`"align": "onset", "until": "end"`) + Enter = click_cool |
| 하프톤 전환 | whoosh_air |
| 완료·점수 상승 | confirm, correct |
| DM 전송 | openverse/ov_envelope_n |

## 원칙
- `build.mjs`가 소리의 **가장 센 순간**을 화면 시각에 맞춘다(휙 소리는 앞이 0.5초 차오름).
- 10초에 3~4개. 모든 움직임에 넣으면 과하다.
- 큰 순간(도장·전환)과 작은 순간(체크)의 크기 차이 8dB 이상.
- 목소리와 함께일 때 `timing.json`의 `sfxGain` 0.8, `voiceVol` 0.85 정도.

## 검수 (선택)
Real SFX(github.com/Clipwing/skills, real-sfx)의 `critique.py`로 싱크·다양성·계층을 점수로 볼 수 있다. 목소리 없이 렌더한 뒤:
```
ffmpeg -y -i out/preview.mp4 -vn -ac 2 -ar 48000 out/sfx_track.wav
uv run --no-project --python 3.12 --with numpy python <스킬>/tools/cue_levels.py .   (릴스 폴더에서)
python <real-sfx>/scripts/critique.py out/resolved_cues.json out/sfx_track.wav
```
