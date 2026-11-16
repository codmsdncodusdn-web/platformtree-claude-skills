#!/usr/bin/env node
// AI 애니메이션 릴스 — 모든 작업을 이 한 파일로 실행 (Windows·Mac 공통)
//
//   node <스킬>/tools/reel.mjs doctor [--fix] [--whisper]     환경 점검 / 설치
//   node <스킬>/tools/reel.mjs new <이름> [--style 2d|3d] [--in <상위 폴더>]   새 릴스 폴더 (기본: 현재 폴더/릴스/<이름>)
//   node <스킬>/tools/reel.mjs voice <릴스> [--voice 현수|여자|남자] [--rate +10%]   AI 목소리 + 단어 시간
//   node <스킬>/tools/reel.mjs record <릴스> <녹음 파일>        내 녹음 넣기 (받아쓰기까지)
//   node <스킬>/tools/reel.mjs cam <릴스> <영상 파일>           내가 찍은 영상 넣기 (소리 분리 + 받아쓰기)
//   node <스킬>/tools/reel.mjs cut <릴스> [--drop 1.2-3.4,...]  NG·쉼 잘라내기 (녹음·영상 모두)
//   node <스킬>/tools/reel.mjs build <릴스>                     장면 데이터 만들기 (목소리가 있으면 자동으로 맞춤)
//   node <스킬>/tools/reel.mjs check <릴스> [--at 1,4,8]        lint + 장면 스냅샷(검수용 사진)
//   node <스킬>/tools/reel.mjs render <릴스> [--draft]          MP4 렌더 + 음량 맞춤 → out/final.mp4
//   node <스킬>/tools/reel.mjs char <포즈 폴더> <릴스>          캐릭터 포즈 정렬 + 입 위치 측정 (선택)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SKILL, STATE, BIN, IS_WIN, FFMPEG, UV, PY, ffmpegPaths, uvPath, whisperPaths, version, pyRun, probeDur,
  WHISPER_MODEL, WHISPER_MODEL_URL, WHISPER_WIN_ZIP } from './env.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (n) => rest.includes(n);
const opt = (n, d) => { const i = rest.indexOf(n); return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[i + 1] : d; };
const pos = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--') && !['--fix', '--whisper', '--draft'].includes(rest[i - 1])));
const die = (m) => { console.error(m); process.exit(1); };
const node = (args, o = {}) => spawnSync(process.execPath, args, { stdio: 'inherit', ...o });
const HF = path.join(SKILL, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');
const hf = (args, cwd) => { if (!fs.existsSync(HF)) die('❌ 렌더러(HyperFrames)가 없어요 → node tools/reel.mjs doctor --fix'); return node([HF, ...args], { cwd }); };
const reelDir = (p) => {
  if (!p) die('❌ 릴스 폴더를 알려 주세요.');
  const d = path.resolve(p);
  if (!fs.existsSync(path.join(d, 'timing.json'))) die(`❌ 릴스 폴더가 아니에요 (timing.json 없음): ${d}`);
  return d;
};

// ───────────────────────── doctor
async function download(url, dest, label) {
  console.log(`⬇️  ${label} 받는 중…`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`);
  const total = Number(r.headers.get('content-length')) || 0; let got = 0, last = 0;
  const out = fs.createWriteStream(dest + '.part');
  for await (const chunk of r.body) { out.write(chunk); got += chunk.length; if (total && got - last > total / 10) { last = got; console.log(`   ${Math.round((got / total) * 100)}%`); } }
  await new Promise((res) => out.end(res)); fs.renameSync(dest + '.part', dest);
}

async function doctor() {
  const fix = flag('--fix'), wantWhisper = flag('--whisper');
  let bad = 0;
  const ok = (m) => console.log(`✅ ${m}`);
  const no = (m, hint) => { bad++; console.log(`❌ ${m}${hint ? `\n   👉 ${hint}` : ''}`); };
  // 지금 실행 중인 Node 옆의 npm (내 폴더에 받은 Node여도 됨)
  const nd = path.dirname(process.execPath);
  const npmCli = [path.join(nd, 'node_modules', 'npm', 'bin', 'npm-cli.js'), path.join(nd, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')].find((p) => fs.existsSync(p));
  const npm = (args) => npmCli ? spawnSync(process.execPath, [npmCli, ...args], { cwd: SKILL, stdio: 'inherit' })
    : spawnSync(IS_WIN ? 'npm.cmd' : 'npm', args, { cwd: SKILL, stdio: 'inherit', shell: IS_WIN });

  // 1) Node.js 22+
  const nv = Number(process.versions.node.split('.')[0]);
  nv >= 22 ? ok(`Node.js ${process.versions.node}`) : no(`Node.js ${process.versions.node} (22 이상 필요)`, '설치 명령(install-anim-reel)을 다시 실행하면 내 폴더에 Node.js 22를 받아 줘요');

  // 2) 스킬 폴더 npm 패키지: 렌더러 HyperFrames + FFmpeg 정적 빌드 (관리자 권한 불필요)
  const need = ['hyperframes', 'ffmpeg-static', '@ffprobe-installer/ffprobe'].filter((m) => !fs.existsSync(path.join(SKILL, 'node_modules', m, 'package.json')));
  if (need.length && fix) { console.log('📦 렌더러·FFmpeg 설치 중… (1~3분)'); npm(['install', '--no-audit', '--no-fund', '--loglevel=error']); }
  const hfPkg = path.join(SKILL, 'node_modules', 'hyperframes', 'package.json');
  fs.existsSync(hfPkg) ? ok(`영상 렌더링 도구 HyperFrames ${JSON.parse(fs.readFileSync(hfPkg, 'utf8')).version}`) : no('영상 렌더링 도구(HyperFrames) 없음', 'node tools/reel.mjs doctor --fix');

  const { ffmpeg, ffprobe } = ffmpegPaths();
  const fv = ffmpeg && version(ffmpeg); const fm = fv && Number((fv.match(/ffmpeg version n?(\d+)/) || [])[1]);
  ffmpeg && fv ? ok(`FFmpeg ${fm || ''} (${ffmpeg.includes('node_modules') ? '스킬 폴더' : '시스템'})`) : no('FFmpeg 없음', 'node tools/reel.mjs doctor --fix');
  ffprobe ? ok('FFprobe') : no('FFprobe 없음', 'node tools/reel.mjs doctor --fix');

  // 3) 렌더용 Chrome (HyperFrames가 내 폴더에 받음)
  if (fs.existsSync(HF)) {
    const p = spawnSync(process.execPath, [HF, 'browser', 'path'], { encoding: 'utf8' });
    let chrome = p.status === 0 && p.stdout.trim().split(/\r?\n/).pop();
    if ((!chrome || !fs.existsSync(chrome)) && fix) { console.log('⬇️  렌더용 Chrome 받는 중… (약 100MB)'); node([HF, 'browser', 'ensure']); const q = spawnSync(process.execPath, [HF, 'browser', 'path'], { encoding: 'utf8' }); chrome = q.status === 0 && q.stdout.trim().split(/\r?\n/).pop(); }
    chrome && fs.existsSync(chrome) ? ok('렌더용 Chrome') : no('렌더용 Chrome 없음', 'node tools/reel.mjs doctor --fix');
  }

  // 4) uv (파이썬 실행 도구) — 파이썬을 따로 설치하지 않아도 됨
  let uv = uvPath();
  if (!uv && fix) {
    console.log('⬇️  uv(파이썬 실행 도구) 설치 중…');
    fs.mkdirSync(BIN, { recursive: true });
    const env = { ...process.env, UV_INSTALL_DIR: BIN, UV_NO_MODIFY_PATH: '1', INSTALLER_NO_MODIFY_PATH: '1' };
    if (IS_WIN) spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://astral.sh/uv/install.ps1 | iex'], { stdio: 'inherit', env });
    else spawnSync('sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'], { stdio: 'inherit', env });
    uv = uvPath();
  }
  uv ? ok(`uv ${(version(uv, ['--version']) || '').trim().split(' ')[1] || ''}`) : no('uv(파이썬 실행 도구) 없음', 'node tools/reel.mjs doctor --fix');

  // 5) AI 목소리 (edge-tts) — 처음 한 번 파이썬 3.12와 패키지를 받는다
  if (uv) {
    const args = ['run', '--quiet', '--no-project', '--python', PY, '--with', 'edge-tts', 'python', '-c', 'import edge_tts; print(edge_tts.__version__)'];
    let r = spawnSync(uv, args, { encoding: 'utf8' });
    if (r.status !== 0 && fix) { console.log('⬇️  AI 목소리 도구 준비 중…'); r = spawnSync(uv, ['run', '--refresh-package', 'edge-tts', ...args.slice(1)], { encoding: 'utf8' }); }
    if (r.status !== 0 && fix) { // uv가 받아 둔 파이썬이 깨진 경우: 다시 받는다
      console.log(`🔧 파이썬 ${PY} 다시 받는 중…`);
      spawnSync(uv, ['python', 'install', PY, '--reinstall'], { stdio: 'inherit' });
      r = spawnSync(uv, args, { encoding: 'utf8' });
    }
    r.status === 0 ? ok(`AI 목소리 도구 edge-tts ${r.stdout.trim()}`) : no('AI 목소리 도구(edge-tts) 준비 실패', `node tools/reel.mjs doctor --fix\n   ${(r.stderr || '').trim().split('\n').pop() || ''}`);
  }

  // 6) 받아쓰기 (내 녹음·내 영상을 넣을 때만)
  let { cli, model } = whisperPaths();
  if (fix && wantWhisper) {
    if (IS_WIN && !cli) {
      const wdir = path.join(STATE, 'whisper'), zip = path.join(wdir, 'whisper-bin-x64.zip');
      await download(WHISPER_WIN_ZIP, zip, 'whisper.cpp');
      const dest = path.join(wdir, 'bin'); fs.mkdirSync(dest, { recursive: true });
      const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
      if (spawnSync(fs.existsSync(tar) ? tar : 'tar', ['-xf', zip, '-C', dest]).status !== 0)
        spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${dest}'`]);
      ({ cli, model } = whisperPaths());
    }
    if (cli && !model) { await download(WHISPER_MODEL_URL, path.join(STATE, 'whisper', 'models', WHISPER_MODEL), '한국어 받아쓰기 모델(약 570MB)'); ({ cli, model } = whisperPaths()); }
    if (!cli && uv) { // Mac(Homebrew 없음) 등: faster-whisper 모델을 미리 받는다
      console.log('⬇️  받아쓰기 엔진(faster-whisper) + 한국어 모델 준비 중… (약 1.6GB)');
      spawnSync(uv, ['run', '--quiet', '--no-project', '--python', PY, '--with', 'faster-whisper', 'python', '-c',
        `from faster_whisper import WhisperModel; import pathlib; r=pathlib.Path.home()/'.platformtree-skills'/'faster-whisper'; r.mkdir(parents=True, exist_ok=True); WhisperModel('large-v3-turbo', device='cpu', compute_type='int8', download_root=str(r)); print('ok')`], { stdio: 'inherit' });
    }
  }
  const fwDir = path.join(STATE, 'faster-whisper');
  const fwReady = fs.existsSync(fwDir) && fs.readdirSync(fwDir).length > 0;
  if (cli && model) ok('받아쓰기 엔진 whisper.cpp + 한국어 모델');
  else if (fwReady) ok('받아쓰기 엔진 faster-whisper');
  else console.log('⚪ 받아쓰기 엔진 없음 — 내 녹음·내 영상을 넣을 때만 필요\n   👉 node tools/reel.mjs doctor --fix --whisper  (모델 0.6~1.6GB, 받기 전에 사용자에게 물어볼 것)');

  console.log(bad ? `\n❌ ${bad}개 해결 필요` : '\n🎉 준비 완료 — "인스타그램 꿀팁 3가지 릴스로 만들어줘"처럼 한 줄로 말해 보세요');
  process.exit(bad ? 1 : 0);
}

// ───────────────────────── new
function newReel() {
  const name = (pos[0] || '').trim().replace(/[\\/:*?"<>|]/g, '-');
  if (!name) die('사용: node tools/reel.mjs new <이름> [--style 2d|3d] [--in <상위 폴더>]');
  const style = opt('--style', '2d');
  const src = path.join(SKILL, 'styles', style);
  if (!fs.existsSync(src)) die(`❌ 없는 스타일: ${style} (2d, 3d 중 하나)`);
  const parent = path.resolve(opt('--in', path.join(process.cwd(), '릴스')));
  const dest = path.join(parent, name);
  if (fs.existsSync(dest)) die(`❌ 이미 있어요: ${dest}`);
  fs.mkdirSync(parent, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  fs.mkdirSync(path.join(dest, 'voice'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'reel.json'), JSON.stringify({ skill: SKILL, style, created: new Date().toISOString() }, null, 1), 'utf8');
  console.log(`📁 ${dest}`);
  const r = node([path.join(SKILL, 'tools', 'fetch_assets.mjs'), dest]);
  if (r.status !== 0) console.log('⚠️  일부 폰트·효과음을 못 받았어요. 인터넷 연결 확인 후: node tools/fetch_assets.mjs "' + dest + '"');
  console.log(`✅ 새 릴스 (${style}) → ${dest}`);
}

// ───────────────────────── voice (AI 목소리)
function voice() {
  const d = reelDir(pos[0]);
  const args = [d, '--voice', opt('--voice', '현수'), '--rate', opt('--rate', '+10%'), '--pitch', opt('--pitch', '+0Hz')];
  let r = pyRun('tts.py', args, ['edge-tts']);
  if (r.status !== 0 && UV) { // 서비스 쪽 변경으로 옛 버전이 막힌 경우: 최신 edge-tts로 한 번 더
    console.log('🔄 edge-tts 최신 버전으로 다시 시도…');
    r = spawnSync(UV, ['run', '--quiet', '--no-project', '--refresh-package', 'edge-tts', '--python', PY, '--with', 'edge-tts', 'python', path.join(SKILL, 'tools', 'tts.py'), ...args], { stdio: 'inherit' });
  }
  process.exit(r.status ?? 1);
}

// ───────────────────────── record / cam (내 녹음 · 내 영상)
function transcribeRaw(d, src) {
  const T = JSON.parse(fs.readFileSync(path.join(d, 'timing.json'), 'utf8'));
  return node([path.join(SKILL, 'tools', 'transcribe.mjs'), src, path.join(d, 'voice', 'raw_words.json'), '--prompt', T.sttPrompt || '']);
}
function clearVoice(d) {
  const v = path.join(d, 'voice'); fs.mkdirSync(v, { recursive: true });
  for (const f of fs.readdirSync(v)) if (/^(voice(_1x)?\.|raw\.|words\.json|cut_map\.json|raw_words)/.test(f)) fs.rmSync(path.join(v, f));
  return v;
}
function record() {
  const d = reelDir(pos[0]); const src = pos[1] && path.resolve(pos[1]);
  if (!src || !fs.existsSync(src)) die('사용: node tools/reel.mjs record <릴스> <녹음 파일>');
  const v = clearVoice(d);
  const raw = path.join(v, 'raw' + (path.extname(src).toLowerCase() || '.m4a'));
  fs.copyFileSync(src, raw);
  const T = JSON.parse(fs.readFileSync(path.join(d, 'timing.json'), 'utf8')); delete T.tts; delete T.cam;
  fs.writeFileSync(path.join(d, 'timing.json'), JSON.stringify(T, null, 1), 'utf8');
  process.exit(transcribeRaw(d, raw).status ?? 1);
}
function cam() {
  const d = reelDir(pos[0]); const src = pos[1] && path.resolve(pos[1]);
  if (!src || !fs.existsSync(src)) die('사용: node tools/reel.mjs cam <릴스> <영상 파일>');
  const v = clearVoice(d);
  const a = path.join(d, 'assets'); fs.mkdirSync(a, { recursive: true });
  const rawV = path.join(a, 'cam_raw' + (path.extname(src).toLowerCase() || '.mp4'));
  fs.copyFileSync(src, rawV);
  const raw = path.join(v, 'raw.m4a');
  if (spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', rawV, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', raw], { stdio: 'inherit' }).status !== 0) die('❌ 영상에서 소리를 못 뽑았어요');
  const T = JSON.parse(fs.readFileSync(path.join(d, 'timing.json'), 'utf8')); delete T.tts; T.cam = true;
  fs.writeFileSync(path.join(d, 'timing.json'), JSON.stringify(T, null, 1), 'utf8');
  process.exit(transcribeRaw(d, raw).status ?? 1);
}
function cut() {
  const d = reelDir(pos[0]);
  const r = pyRun('cut_voice.py', [d, '--drop', opt('--drop', ''), '--max-gap', opt('--max-gap', '0.26')]);
  if (r.status !== 0) process.exit(r.status ?? 1);
  // 내 영상이면 같은 구간으로 영상도 자른다 (세로 1080×1920으로 맞춤)
  const a = path.join(d, 'assets');
  const rawV = fs.existsSync(a) && fs.readdirSync(a).find((f) => /^cam_raw\./i.test(f));
  if (rawV) {
    const { segments } = JSON.parse(fs.readFileSync(path.join(d, 'voice', 'cut_map.json'), 'utf8'));
    const parts = segments.map(([s0, s1], k) => `[0:v]trim=${s0.toFixed(3)}:${s1.toFixed(3)},setpts=PTS-STARTPTS[v${k}]`);
    const fc = parts.join(';') + ';' + segments.map((_, k) => `[v${k}]`).join('') + `concat=n=${segments.length}:v=1:a=0,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p[out]`;
    console.log('🎬 영상도 같은 구간으로 자르는 중…');
    const fcFile = path.join(d, 'voice', 'cam_filter.txt'); fs.writeFileSync(fcFile, fc, 'utf8');
    const rr = spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', path.join(a, rawV), '-filter_complex_script', fcFile, '-map', '[out]', '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-g', '15', path.join(a, 'cam.mp4')], { stdio: 'inherit' });
    if (rr.status !== 0) die('❌ 영상 자르기 실패');
    console.log(`✅ 영상 ${probeDur(path.join(a, 'cam.mp4')).toFixed(2)}초 → assets/cam.mp4`);
  }
}

// ───────────────────────── build / check / render
function build() {
  const d = reelDir(pos[0]);
  const v = path.join(d, 'voice');
  const hasVoice = fs.existsSync(v) && fs.readdirSync(v).some((f) => /^voice(_1x)?\.(m4a|mp3|wav|aac)$/i.test(f));
  const args = [path.join(d, 'build.mjs')]; if (hasVoice && !flag('--estimate')) args.push('--voice');
  const r = node(args, { cwd: d, env: { ...process.env, REEL_SKILL: SKILL } });
  process.exit(r.status ?? 1);
}
function check() {
  const d = reelDir(pos[0]);
  let r = hf(['lint', '.'], d);
  const at = opt('--at', null) || (() => { // 장면마다 한 장: 문장 가운데 시각
    try { const R = JSON.parse(fs.readFileSync(path.join(d, 'data.js'), 'utf8').replace(/^window\.REEL = /, '').replace(/;\s*$/, '')); return R.sentences.map((s) => ((s.start + s.end) / 2).toFixed(2)).join(','); } catch { return '1,4,8'; }
  })();
  fs.rmSync(path.join(d, 'out', 'snaps'), { recursive: true, force: true });
  r = hf(['snapshot', '.', '-o', 'out/snaps', '--at', at], d);
  const snaps = path.join(d, 'out', 'snaps');
  if (fs.existsSync(snaps)) console.log(`🖼️  검수용 사진: ${snaps}\n   ${fs.readdirSync(snaps).filter((f) => /contact/.test(f)).map((f) => path.join(snaps, f)).join('\n   ')}`);
  process.exit(r.status ?? 1);
}
function render() {
  const d = reelDir(pos[0]); const draft = flag('--draft');
  fs.mkdirSync(path.join(d, 'out'), { recursive: true });
  const raw = path.join(d, 'out', draft ? 'preview_raw.mp4' : 'final_raw.mp4');
  const r = hf(['render', '.', '-o', path.relative(d, raw), '--quality', draft ? 'draft' : 'delivery'], d);
  if (r.status !== 0) die('❌ 렌더 실패');
  const out = path.join(d, 'out', draft ? 'preview.mp4' : 'final.mp4');
  // 인스타그램 기준 음량(-14 LUFS)으로 맞추고 어디서나 재생되는 형식으로
  const rr = spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', raw, '-c:v', 'libx264', '-crf', draft ? '23' : '18', '-preset', draft ? 'veryfast' : 'medium', '-pix_fmt', 'yuv420p',
    '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], { stdio: 'inherit' });
  if (rr.status !== 0) die('❌ 음량 맞춤 실패');
  fs.rmSync(raw, { force: true });
  console.log(`✅ ${out}  (${probeDur(out).toFixed(1)}초)`);
}

// ───────────────────────── char (캐릭터 포즈 준비)
function char() {
  const [poses, reel] = pos;
  if (!poses || !reel) die('사용: node tools/reel.mjs char <포즈 PNG 폴더> <릴스>');
  process.exit(pyRun('prep_character.py', [path.resolve(poses), reelDir(reel)], ['pillow', 'numpy']).status ?? 1);
}

const CMDS = { doctor, new: newReel, voice, record, cam, cut, build, check, render, char };
if (!CMDS[cmd]) die('사용: node tools/reel.mjs <doctor|new|voice|record|cam|cut|build|check|render|char> …  (파일 맨 위 설명 참고)');
await CMDS[cmd]();
