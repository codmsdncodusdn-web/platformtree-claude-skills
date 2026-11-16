// 폰트·효과음을 내 컴퓨터로 받는다 (재배포 라이선스 때문에 스킬 폴더에 넣지 않은 것들)
// 사용: node tools/fetch_assets.mjs <릴스 폴더>   (이미 있는 파일은 건너뜀)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const reel = path.resolve(process.argv[2] || 'project');
const fontsDir = path.join(reel, 'assets', 'fonts'), sfxDir = path.join(reel, 'sfx');
fs.mkdirSync(fontsDir, { recursive: true }); fs.mkdirSync(sfxDir, { recursive: true });

// 폰트: Pretendard(OFL), 나눔명조 ExtraBold(OFL), JetBrains Mono(OFL)
const FONTS = Object.fromEntries(['Medium', 'SemiBold', 'Bold', 'ExtraBold'].map((w) => [`Pretendard-${w}.woff2`, `https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/Pretendard-${w}.woff2`]));
const GFONTS = { 'NanumMyeongjo-ExtraBold.ttf': 'Nanum+Myeongjo:wght@800', 'JetBrainsMono-Medium.ttf': 'JetBrains+Mono:wght@500' };

// 효과음: Mixkit 무료 라이선스(파일 재배포 금지) → 각자 받아 쓴다. 이름 = timing.json의 sfx name
const MIXKIT = {
  paper_slide: 1530, scribble: 2369, pop_light: 3005, pop_bubble: 2357, pop_long: 2358, pop_hard: 2364, pop_message: 2354, pop_dry: 2356,
  click_double: 275, click_cool: 2568, click_check: 1120, click_modern: 3124, click_select: 1109, click_plastic: 1124, click_device: 2577, click_close: 1113,
  typing_laptop: 2531, confirm: 2867, correct: 2870, positive: 951, whoosh_air: 1489, whoosh_fast: 1490, sweep_small: 166, sweep_short: 175,
  swipe_zoom: 2627, tech_slide: 3120, wood_hit: 2182, paper_quick: 2380, shutter: 1133, sign_paper: 2368, pencil_write: 3194,
};
// 긴 녹음에서 한 획 길이만 잘라 쓰는 소리
const CUTS = { sign_stroke: ['sign_paper', 0.02, 0.5], pencil_stroke: ['pencil_write', 0, 0.5] };

async function get(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return 'skip';
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  return 'ok';
}

let ok = 0, skip = 0, bad = 0;
const tally = (r) => (r === 'skip' ? skip++ : ok++);
for (const [f, u] of Object.entries(FONTS)) { try { tally(await get(u, path.join(fontsDir, f))); } catch (e) { bad++; console.log('❌', f, e.message); } }
for (const [f, fam] of Object.entries(GFONTS)) {
  try {
    const dest = path.join(fontsDir, f);
    if (fs.existsSync(dest)) { skip++; continue; }
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${fam}`)).text(); // UA 없이 요청하면 전체 TTF 주소가 옴
    const url = css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
    if (!url) throw new Error('TTF 주소를 못 찾음');
    tally(await get(url, dest));
  } catch (e) { bad++; console.log('❌', f, e.message); }
}
for (const [n, id] of Object.entries(MIXKIT)) {
  try { tally(await get(`https://assets.mixkit.co/active_storage/sfx/${id}/${id}-preview.mp3`, path.join(sfxDir, `${n}.mp3`))); } catch (e) { bad++; console.log('❌', n, e.message); }
}
for (const [n, [src, ss, t]] of Object.entries(CUTS)) {
  const out = path.join(sfxDir, `${n}.mp3`), inp = path.join(sfxDir, `${src}.mp3`);
  if (fs.existsSync(out)) { skip++; continue; }
  if (!fs.existsSync(inp)) { bad++; continue; }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(ss), '-i', inp, '-t', String(t), '-af', `afade=t=out:st=${t - 0.14}:d=0.14`, '-ar', '44100', out]);
  r.status === 0 ? ok++ : bad++;
}
console.log(`${bad ? '⚠️' : '✅'} 받음 ${ok} · 이미 있음 ${skip} · 실패 ${bad}  → ${path.relative(process.cwd(), fontsDir)}, ${path.relative(process.cwd(), sfxDir)}`);
if (bad) process.exit(1);
