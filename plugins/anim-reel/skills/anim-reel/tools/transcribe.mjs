// 녹음 파일 → 단어별 시간(words.json). 로컬·무료.
// whisper.cpp가 있으면 그것(Windows·Homebrew), 없으면 uv + faster-whisper (Windows·Mac 공통)
// 사용: node tools/transcribe.mjs <음성 파일> <출력 words.json> [--prompt "고유명사, 툴 이름"]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FFMPEG, whisperPaths, pyRun, probeDur } from './env.mjs';

const [src, out] = process.argv.slice(2);
const pi = process.argv.indexOf('--prompt');
const prompt = pi > 0 ? process.argv[pi + 1] || '' : '';
if (!src || !out) { console.error('사용: node tools/transcribe.mjs <음성 파일> <출력 words.json> [--prompt "..."]'); process.exit(1); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-stt-'));
const wav = path.join(tmp, 'audio.wav');
if (spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '16000', wav], { stdio: 'inherit' }).status !== 0) process.exit(1);
const dur = probeDur(src);

let raw = [];
const { cli, model } = whisperPaths();
console.log('🎙️  받아쓰는 중… (1분 녹음 기준 약 1~2분)');
if (cli && model) {
  const base = path.join(tmp, 'out');
  const threads = String(Math.max(4, Math.min(8, os.cpus().length - 2)));
  const args = ['-m', model, '-l', 'ko', '-f', wav, '-ojf', '-of', base, '-ml', '1', '-sow', '-t', threads, '-np'];
  if (/large-v3-turbo/.test(model)) args.push('-dtw', 'large.v3.turbo');
  if (prompt) args.push('--prompt', prompt);
  const r = spawnSync(cli, args, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(base + '.json')) { console.error('❌ 받아쓰기 실패\n' + (r.stderr || '').slice(-800)); process.exit(1); }
  raw = JSON.parse(fs.readFileSync(base + '.json', 'utf8')).transcription.map((t) => ({ w: t.text.trim(), s: t.offsets.from / 1000, e: t.offsets.to / 1000 }));
} else {
  const j = path.join(tmp, 'fw.json');
  const r = pyRun('stt_fw.py', [wav, j, '--prompt', prompt], ['faster-whisper']);
  if (r.status !== 0 || !fs.existsSync(j)) { console.error('❌ 받아쓰기 실패 (faster-whisper)'); process.exit(1); }
  raw = JSON.parse(fs.readFileSync(j, 'utf8')).words;
}

const words = raw
  .filter((t) => t.w && !/^\[_/.test(t.w) && t.s < dur) // 파일 끝 뒤의 환각("감사합니다" 등) 제거
  .map((t, i) => ({ i, w: t.w, s: Math.round(t.s * 1000) / 1000, e: Math.round(Math.min(t.e, dur) * 1000) / 1000 }));
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ engine: cli && model ? 'whisper.cpp' : 'faster-whisper', lang: 'ko', dur, words }, null, 1), 'utf8');
fs.rmSync(tmp, { recursive: true, force: true });

// 사람이 읽는 줄 단위 요약 (NG·중복 테이크 찾기용)
const lines = []; let cur = [];
words.forEach((w, k) => { cur.push(w); const nx = words[k + 1]; if (!nx || /[.?!]$/.test(w.w) || nx.s - w.e > 0.5 || cur.length >= 14) { lines.push(cur); cur = []; } });
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const txt = lines.map((l, n) => `L${String(n + 1).padStart(2, '0')} [${l[0].i}-${l.at(-1).i}] ${fmt(l[0].s)}–${fmt(l.at(-1).e)}  ${l.map((w) => w.w).join(' ')}`).join('\n');
fs.writeFileSync(out.replace(/\.json$/, '') + '.txt', txt + '\n', 'utf8');
console.log(`✅ 단어 ${words.length}개 → ${out}\n${txt}`);
