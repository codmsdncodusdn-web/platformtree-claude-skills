// 도구 위치 찾기 — Windows·Mac 공통. 관리자 권한 없이 설치한 것(스킬 폴더 node_modules, ~/.platformtree-skills)을 먼저 본다.
// 이 파일을 import하면 FFmpeg·uv가 있는 폴더가 PATH 앞에 붙어서, 이후 실행하는 모든 도구(빌드·파이썬·렌더러)가 같은 FFmpeg를 쓴다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const IS_WIN = process.platform === 'win32';
export const IS_MAC = process.platform === 'darwin';
export const HOME = os.homedir();
export const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STATE = path.join(HOME, '.platformtree-skills'); // cut-filler와 같이 씀 (받아쓰기 모델을 한 번만 받도록)
export const BIN = path.join(STATE, 'bin');
export const PY = '3.12'; // uv가 쓸 파이썬 버전 (faster-whisper·edge-tts 휠이 다 있는 버전)

const exists = (p) => !!p && fs.existsSync(p);
const first = (list) => list.find(exists) || null;
const exe = (n) => (IS_WIN ? `${n}.exe` : n);

function which(cmd) {
  const r = spawnSync(IS_WIN ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || null : null;
}
export function version(cmd, args = ['-version']) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || r.stderr || '') : null;
}

// FFmpeg: PATH에 6 이상이 있으면 그것, 없으면 스킬 폴더에 npm으로 받은 정적 빌드
export function ffmpegPaths() {
  const req = createRequire(path.join(SKILL, 'package.json'));
  const fromNpm = (mod, pick) => { try { const v = pick(req(mod)); return exists(v) ? v : null; } catch { return null; } };
  let ffmpeg = which('ffmpeg'), ffprobe = which('ffprobe');
  const major = ffmpeg && Number(((version(ffmpeg) || '').match(/ffmpeg version n?(\d+)/) || [])[1]);
  if (!ffmpeg || (major && major < 6)) ffmpeg = fromNpm('ffmpeg-static', (m) => m) || ffmpeg;
  if (!ffprobe) ffprobe = fromNpm('@ffprobe-installer/ffprobe', (m) => m.path);
  return { ffmpeg, ffprobe };
}

// uv: 파이썬을 따로 설치하지 않아도 필요한 파이썬과 패키지를 받아서 실행해 준다
export function uvPath() {
  return first([process.env.REEL_UV, path.join(BIN, exe('uv')), path.join(HOME, '.local', 'bin', exe('uv')), path.join(HOME, '.cargo', 'bin', exe('uv'))]) || which('uv');
}

// 받아쓰기: whisper.cpp(Windows 실행 파일 또는 Mac Homebrew)가 있으면 그것, 없으면 uv + faster-whisper
export const WHISPER_TAG = 'b5130';
export const WHISPER_MODEL = 'ggml-large-v3-turbo-q5_0.bin';
export const WHISPER_MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL}`;
export const WHISPER_WIN_ZIP = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_TAG}/whisper-bin-x64.zip`;
export function whisperPaths() {
  const roots = [path.join(STATE, 'whisper'), path.join(HOME, '.reel-skills', 'whisper'), path.join(HOME, '.reel-oneline', 'whisper')];
  const cli = first([process.env.REEL_WHISPER_CLI, ...roots.flatMap((r) => [path.join(r, 'bin', 'Release', exe('whisper-cli')), path.join(r, 'bin', exe('whisper-cli'))]),
    ...(IS_WIN ? [] : ['/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli'])]) || (IS_WIN ? null : which('whisper-cli'));
  const model = first([process.env.REEL_WHISPER_MODEL, ...roots.map((r) => path.join(r, 'models', WHISPER_MODEL))]);
  return { cli, model };
}

// PATH 앞에 FFmpeg·uv 폴더를 붙인다 (자식 프로세스까지 적용)
const { ffmpeg, ffprobe } = ffmpegPaths();
const uv = uvPath();
const extra = [ffmpeg, ffprobe, uv].filter(Boolean).map((p) => path.dirname(p));
const SEP = IS_WIN ? ';' : ':';
const key = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
process.env[key] = [...new Set([...extra, ...(process.env[key] || '').split(SEP)])].filter(Boolean).join(SEP);
if (ffmpeg) process.env.HYPERFRAMES_FFMPEG_PATH = ffmpeg;
if (ffprobe) process.env.HYPERFRAMES_FFPROBE_PATH = ffprobe;
process.env.HYPERFRAMES_NO_TELEMETRY = '1';
process.env.HYPERFRAMES_NO_UPDATE_CHECK = '1';
process.env.PYTHONIOENCODING = 'utf-8';
process.env.PYTHONUTF8 = '1';
export const FFMPEG = ffmpeg || 'ffmpeg';
export const FFPROBE = ffprobe || 'ffprobe';
export const UV = uv;

// uv로 파이썬 스크립트 실행: pyRun('tts.py', [...인자], ['edge-tts'])
export function pyRun(script, args = [], withPkgs = [], opts = {}) {
  if (!UV) { console.error('❌ uv(파이썬 실행 도구)가 없어요. node tools/reel.mjs doctor --fix 를 먼저 실행하세요.'); process.exit(1); }
  const pk = withPkgs.flatMap((p) => ['--with', p]);
  return spawnSync(UV, ['run', '--quiet', '--no-project', '--python', PY, ...pk, 'python', path.join(SKILL, 'tools', script), ...args], { stdio: 'inherit', ...opts });
}

export const probeDur = (f) => Number(spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim());
