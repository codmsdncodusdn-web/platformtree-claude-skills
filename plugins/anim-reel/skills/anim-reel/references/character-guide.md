# 나를 닮은 캐릭터 만들기

사진 한 장 + 이미지 생성 모델(참고 이미지를 넣을 수 있는 모델, 예: GPT Image)로 만든다. 한 번에 원하는 그림이 안 나오므로 3단계로 나눈다. **크레딧을 쓰는 작업이니 사용자에게 비용을 먼저 알리고 진행한다.**

## 1단계 — 화풍 잡기
사진만 넣으면 실사처럼 나온다. 원하는 화풍의 캐릭터 이미지를 두 번째 참고로 넣는다(플랫 2D 벡터 화풍 추천).
```
Draw the man from the FIRST reference photo as a flat 2D vector cartoon character,
using exactly the art style of the SECOND reference image: flat fills with one soft
shade tone, thin dark outlines on the face, simple eyes, big rounded head.
Do NOT copy the second image's hair, clothes or accessories; only its drawing style.
Likeness from the photo: [나이대, 얼굴형, 눈매, 눈썹, 코, 입, 머리 스타일].
Outfit from the photo: [옷].
Waist-up framing, front-facing, centered, arms relaxed, looking at the camera.
Transparent background, no text.
```

## 2단계 — 닮게 다듬기
1단계 결과를 첫 번째, 사진을 두 번째 참고로.
```
Edit the FIRST image. Keep the same art style, outfit, colors and framing,
but make the face resemble the man in the SECOND photo more closely: [다른 점].
Make the head about 1.25x bigger relative to the body. Transparent background.
```

## 3단계 — 포즈
확정한 캐릭터 한 장만 참고로. 파일 이름 = 포즈 이름(`neutral.png` 필수).
```
Exactly the same cartoon character as the reference image: identical face, hair,
outfit, art style, line weight, colors, proportions and waist-up framing at the
same size. New pose: [포즈]. Transparent background, no text, no extra objects.
```
| 파일 | 포즈 | 쓰는 문장 |
|---|---|---|
| neutral | 팔 내린 기본 자세, 입 다문 미소 | 쉬어가는 문장 |
| wave | 손바닥 펴서 인사 | 첫 인사·마지막 |
| pointup | 검지로 위를 가리킴 | 화면 위 그래픽을 짚을 때 |
| present | 양손 펴서 설명 | 설명 |
| think | 손을 턱에 | 예시·점검 |
| one / two | 손가락 1개 / 2개 | 첫 번째 / 두 번째 |
| thumbs | 엄지척 | 결과 |
| pointdown | 오른쪽 아래를 가리킴 | 댓글 유도 |

## 영상에 넣기
```
node "<스킬 폴더>/tools/reel.mjs" char <포즈 폴더> <릴스 폴더>
```
머리 위치를 맞춰 포즈를 바꿔도 화면이 튀지 않게 하고, 입 위치·기울기·피부색을 재서 립싱크 입을 그린다. `assets/char/check.jpg`에서 파란 상자가 입을 감싸는지 확인. 머리가 검정이 아니면 `face_anchor`의 색 조건을 바꾼다.
