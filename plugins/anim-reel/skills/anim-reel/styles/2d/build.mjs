// timing.json(대본·포즈·효과음 큐) → data.js + index.html(오디오 태그 포함)
// 사용: node build.mjs            → 예상 낭독 속도로 타이밍 추정
//       node build.mjs --voice    → voice/voice.* + voice/words.json(받아쓰기 단어 시간)에 맞춰 재정렬
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const T = JSON.parse(fs.readFileSync(path.join(DIR, 'timing.json'), 'utf8'));
const useVoice = process.argv.includes('--voice');
const r3 = (v) => Math.round(v * 1000) / 1000;

// 효과음이 "들리는 순간"(peak/onset) — hyperframes audio 로 측정한 값
const HIT = {
  click_check: [0.099, 0.102], click_cool: [0, 0], click_double: [0.111, 0.208], click_select: [0, 0.065],
  confirm: [0.004, 0.195], correct: [0, 0.025], paper_quick: [0.204, 0.424], paper_slide: [0.198, 0.358],
  pop_bubble: [0.024, 0.241], pop_hard: [0.004, 0.044], pop_light: [0.016, 0.022], pop_long: [0.031, 0.035],
  positive: [0.05, 0.185], scribble: [0.048, 0.171], shutter: [0.171, 0.194], sweep_short: [0.321, 0.462],
  sweep_small: [0.176, 0.295], swipe_zoom: [0.154, 0.261], tech_slide: [0.017, 0.095], typing_soft: [0.09, 0.09],
  click_device: [0.002, 0.009], click_modern: [0, 0.015], click_plastic: [0.107, 0.11], click_option: [0.104, 0.12], click_close: [0.009, 0.138],
  pop_message: [0.053, 0.056], pop_dry: [0.036, 0.133], pop_cluster: [0.016, 0.821], ui_start: [0.002, 0.133],
  'openverse/ov_marker': [0.014, 0.078], 'openverse/ov_stamp': [0.077, 0.087], 'openverse/ov_thump': [0.175, 0.212],
  'openverse/ov_whoosh1': [0.168, 0.207], 'openverse/ov_wipe2': [0.217, 0.432], 'openverse/ov_paper_slide_n': [0.316, 0.456],
  'openverse/ov_envelope_n': [0.393, 0.491],
  sign_stroke: [0.014, 0.12], pencil_stroke: [0.005, 0.06],
  typing_laptop: [0.005, 0.005], whoosh_air: [0.526, 0.715], whoosh_fast: [0.555, 0.721], wood_hit: [0.054, 0.057],
};

const syl = (w) => {
  const s = w.replace(/[*“”"',.!?]/g, '');
  let n = 0;
  for (const ch of s) n += /[가-힣]/.test(ch) ? 1 : /[0-9]/.test(ch) ? 1 : /[A-Za-z]/.test(ch) ? 0.45 : 0;
  return Math.max(1, n);
};
const plain = (w) => w.replace(/[*“”"',.!?]/g, '');

// 1) 문장 → 청크 → 단어
const sentences = T.sentences.map((s) => {
  const chunks = s.text.split(' / ');
  const words = [];
  chunks.forEach((c, ci) => c.split(' ').filter(Boolean).forEach((w) => words.push({ raw: w, chunk: ci })));
  return { ...s, chunks, words };
});

// 2) 단어 시간
if (useVoice) {
  const vdir = path.join(DIR, 'voice');
  // 배속(timing.json의 voiceSpeed): 분석(받아쓰기·쉼)은 원래 속도 녹음 voice_1x.*로 하고 시간만 나눈다. 재생용 voice.m4a는 atempo로 만든다(음높이 유지)
  const SPEED = Number(T.voiceSpeed || 1);
  let asrc = null;
  if (SPEED !== 1) {
    asrc = fs.existsSync(vdir) && fs.readdirSync(vdir).find((f) => /^voice_1x\.(m4a|mp3|wav|aac)$/i.test(f));
    if (!asrc) throw new Error('voiceSpeed를 쓰려면 원래 속도 녹음을 voice/voice_1x.m4a로 두세요.');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(vdir, asrc), '-af', `atempo=${SPEED}`, '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', path.join(vdir, 'voice.m4a')]);
  }
  const vsrc = fs.existsSync(vdir) && fs.readdirSync(vdir).find((f) => /^voice\.(m4a|mp3|wav|aac)$/i.test(f));
  asrc = asrc || vsrc;
  if (!vsrc) throw new Error('voice/voice.m4a (또는 .mp3/.wav)를 넣어주세요.');
  if (!fs.existsSync(path.join(vdir, 'words.json'))) {
    // 스킬 폴더의 tools/transcribe.mjs로 단어별 시간 받아쓰기 (AI 목소리는 words.json을 같이 만들므로 여기 안 옴)
    const skill = process.env.REEL_SKILL || (fs.existsSync(path.join(DIR, 'reel.json')) && JSON.parse(fs.readFileSync(path.join(DIR, 'reel.json'), 'utf8')).skill);
    const tr = skill && path.join(skill, 'tools', 'transcribe.mjs');
    if (!tr || !fs.existsSync(tr)) throw new Error('스킬 폴더를 못 찾았어요. node <스킬>/tools/reel.mjs build <이 폴더> 로 실행하세요.');
    execFileSync(process.execPath, [tr, path.join(vdir, asrc), path.join(vdir, 'words.json'), '--prompt', T.sttPrompt || ''], { stdio: 'inherit' });
  }
  const wj = JSON.parse(fs.readFileSync(path.join(vdir, 'words.json'), 'utf8'));
  const tw = (wj.words || wj).map((w) => ({ t: plain(w.w ?? w.word ?? w.text ?? ''), s: w.s ?? w.start, e: w.e ?? w.end }));
  // 글자 단위 정렬(DP): 받아쓰기 오탈자("릴스"→"리이스")가 있어도 그 자리에서만 어긋나고 뒤로 밀리지 않음
  const tc = []; tw.forEach((w) => { const cs = [...w.t]; const n = cs.length || 1; cs.forEach((ch, k) => tc.push({ ch, s: w.s + ((w.e - w.s) * k) / n, e: w.s + ((w.e - w.s) * (k + 1)) / n })); });
  const all = sentences.flatMap((s) => s.words);
  const sc = []; all.forEach((w, wi) => [...plain(w.raw)].forEach((ch) => sc.push({ ch, wi })));
  const n = sc.length, m = tc.length, G = -1;
  const D = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  for (let i = 1; i <= n; i++) D[i][0] = i * G;
  for (let j = 1; j <= m; j++) D[0][j] = j * G * 0.5; // 받아쓰기 쪽 남는 글자(환각 등)는 덜 아프게
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++)
    D[i][j] = Math.max(D[i - 1][j - 1] + (sc[i - 1].ch === tc[j - 1].ch ? 2 : -1), D[i - 1][j] + G, D[i][j - 1] + G * 0.5);
  const map = new Array(n).fill(-1);
  for (let i = n, j = m; i > 0 && j > 0;) {
    if (D[i][j] === D[i - 1][j - 1] + (sc[i - 1].ch === tc[j - 1].ch ? 2 : -1)) { map[i - 1] = j - 1; i--; j--; }
    else if (D[i][j] === D[i - 1][j] + G) i--; else j--;
  }
  // 짝이 없는 대본 글자는 앞뒤 짝 사이를 보간
  const cs = map.map((j) => (j >= 0 ? tc[j].s : null)), ce = map.map((j) => (j >= 0 ? tc[j].e : null));
  for (const arr of [cs, ce]) for (let i = 0; i < n; i++) if (arr[i] == null) {
    let a = i - 1; while (a >= 0 && arr[a] == null) a--; let b = i + 1; while (b < n && arr[b] == null) b++;
    const va = a >= 0 ? arr[a] : (b < n ? arr[b] : 0), vb = b < n ? arr[b] : va;
    arr[i] = va + ((vb - va) * (i - a)) / Math.max(1, b - a);
  }
  all.forEach((w, wi) => { const idx = sc.map((c, i) => (c.wi === wi ? i : -1)).filter((i) => i >= 0); w.s = r3(cs[idx[0]]); w.e = r3(Math.max(ce[idx.at(-1)], w.s + 0.08)); });
  // 파형으로 보정: 쉼 다음 첫 단어는 실제 말 시작에, 문장 끝 단어는 실제 말 끝에 붙인다
  const log = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path.join(vdir, asrc), '-af', 'silencedetect=noise=-35dB:d=0.12', '-f', 'null', '-'], { encoding: 'utf8' }).stderr || '';
  const onsets = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((x) => +x[1]), offsets = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((x) => +x[1]);
  const near = (arr, t, lim) => { let b = null; for (const v of arr) if (Math.abs(v - t) <= lim && (b == null || Math.abs(v - t) < Math.abs(b - t))) b = v; return b; };
  for (const s of sentences) s.words.forEach((w, k) => {
    if (k > 0 && w.chunk !== s.words[k - 1].chunk) { const o = near(onsets, w.s, 0.2); if (o != null) w.s = r3(o); } // 문장 시작은 아래 경계 단계에서
  });
  // 문장 경계 = 받아쓰기 경계에서 가장 가까운 실제 쉼(±0.45초). 앞 문장 끝은 쉼 시작, 다음 문장 시작은 쉼 끝
  const gaps = offsets.map((o) => [o, onsets.find((x) => x > o) ?? Infinity]).filter(([x, y]) => y !== Infinity);
  const orig = sentences.map((s) => [s.words[0].s, s.words.at(-1).e]);
  const bnd = sentences.map((s) => [s.words[0].s, s.words.at(-1).e]);
  // 문장 경계 12개를 한꺼번에 고른다: 실제 쉼들 중에서 문장마다 말 속도(음절/초)가 가장 고르게 되는 조합 + 받아쓰기 경계와 가까울수록 가산
  {
    const n = sentences.length, start0 = orig[0][0];
    const tail = offsets.filter((o) => o > orig[n - 1][0] + 0.3); const endF = tail.length ? Math.max(...tail) : orig[n - 1][1];
    const sy = sentences.map((s) => s.words.reduce((a, w) => a + syl(w.raw), 0));
    const R = sy.reduce((a, b) => a + b, 0) / orig.reduce((a, [x, y]) => a + Math.max(0.3, y - x), 0);
    const cost = (i, a, b) => { const d = b - a; if (d < 0.25) return 1e9; const q = Math.log((d * R) / sy[i]); return q * q; };
    const bdOf = (i) => (orig[i][1] + orig[i + 1][0]) / 2, near = (i, g) => Math.abs((g[0] + g[1]) / 2 - bdOf(i));
    const G = gaps;
    if (n > 1 && G.length) {
      const dp = Array.from({ length: n - 1 }, () => new Array(G.length).fill(Infinity)), from = dp.map((r) => r.map(() => -1));
      for (let g = 0; g < G.length; g++) if (near(0, G[g]) < 0.8) dp[0][g] = cost(0, start0, G[g][0]) + 0.05 * near(0, G[g]) ** 2;
      for (let i = 1; i < n - 1; i++) for (let g = 0; g < G.length; g++) {
        if (near(i, G[g]) >= 0.8) continue;
        for (let h = 0; h < g; h++) { const c = dp[i - 1][h] + cost(i, G[h][1], G[g][0]) + 0.05 * near(i, G[g]) ** 2; if (c < dp[i][g]) { dp[i][g] = c; from[i][g] = h; } }
      }
      let bg = -1, bc = Infinity;
      for (let g = 0; g < G.length; g++) { const c = dp[n - 2][g] + cost(n - 1, G[g][1], endF); if (c < bc) { bc = c; bg = g; } }
      if (bg >= 0 && bc < 1e8) {
        const pick = new Array(n - 1); for (let i = n - 2, g = bg; i >= 0; i--) { pick[i] = g; g = from[i][g]; }
        pick.forEach((g, i) => { bnd[i][1] = G[g][0]; bnd[i + 1][0] = G[g][1]; });
      } else sentences.forEach((s, i) => { if (i < n - 1) bnd[i][1] = Math.min(bnd[i][1], orig[i + 1][0] - 0.05); });
    }
    bnd[n - 1][1] = endF;
  }
  // 문장 안 단어는 받아쓰기 구간 → 실제 구간으로 비례 이동 (끝부분 시간 밀림 보정)
  sentences.forEach((s, i) => {
    const [oa, ob] = orig[i], [na, nb] = bnd[i], k = (nb - na) / Math.max(0.05, ob - oa);
    s.words.forEach((w) => { w.s = r3(na + (w.s - oa) * k); w.e = r3(na + (w.e - oa) * k); });
    s.words[0].s = r3(na); s.words.at(-1).e = r3(nb);
  });
  const flat = sentences.flatMap((s) => s.words);
  flat.forEach((w, k) => { if (flat[k + 1] && w.e > flat[k + 1].s) w.e = r3(Math.max(w.s + 0.05, flat[k + 1].s)); });
  for (const s of sentences) for (let k = 1; k < s.words.length; k++) if (s.words[k].s < s.words[k - 1].s + 0.05) s.words[k].s = r3(s.words[k - 1].s + 0.05);
} else {
  let t = T.lead;
  for (const s of sentences) {
    for (const w of s.words) {
      w.s = r3(t); w.e = r3(t + Math.max(0.16, syl(w.raw) / T.rate));
      t = w.e + (/[,，]$/.test(w.raw) ? 0.16 : 0.03);
    }
    t = s.words.at(-1).e + T.gap;
  }
}
if (useVoice) { const sp = Number(T.voiceSpeed || 1); if (sp !== 1) for (const s of sentences) for (const w of s.words) { w.s = r3(w.s / sp); w.e = r3(w.e / sp); } }
for (const s of sentences) { s.start = s.words[0].s; s.end = s.words.at(-1).e; }

// 3) 자막 묶음: 한 문장 안에서 청크를 합쳐 2줄(약 22자) 안쪽으로
for (const s of sentences) {
  const groups = []; let cur = null;
  s.chunks.forEach((c, ci) => {
    const len = [...c.replace(/[*]/g, '')].length;
    if (!cur || cur.len + len > 26) { cur = { chunks: [ci], len }; groups.push(cur); } else { cur.chunks.push(ci); cur.len += len; }
  });
  s.words.forEach((w) => { w.group = groups.findIndex((g) => g.chunks.includes(w.chunk)); });
  s.groups = groups.length;
}

let voiceDur = 0, voiceSrc = null;
if (useVoice) {
  voiceSrc = fs.readdirSync(path.join(DIR, 'voice')).find((f) => /^voice\.(m4a|mp3|wav|aac)$/i.test(f));
  if (voiceSrc) voiceDur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(DIR, 'voice', voiceSrc)]).toString().trim());
}
const DUR = r3(Math.max(sentences.at(-1).end + T.tail, voiceDur + 0.3));

// 내 영상(assets/cam.mp4): 목소리와 같은 구간으로 잘라 둔 영상. 문장마다 cam: "full"(전체 화면) | "pip"(아래 작은 창) | 없음(애니메이션만)
const camFile = path.join(DIR, 'assets', 'cam.mp4');
const hasCam = !!T.cam && fs.existsSync(camFile);
const camDur = hasCam ? Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', camFile]).toString().trim()) : 0;
const camTag = hasCam ? `<video id="camv" class="camv" src="assets/cam.mp4" data-start="0" data-duration="${r3(Math.min(camDur, DUR))}" data-media-start="0" data-track-index="2" muted playsinline></video>` : '';

// 4) 효과음 태그
const probeDur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
let track = 10;
const tags = [];
const KIND = { paper_slide: 'paper', scribble: 'paper', swipe_zoom: 'whoosh', pop_light: 'pop', click_select: 'click', sweep_small: 'whoosh',
  pop_bubble: 'pop', whoosh_fast: 'wipe', click_double: 'click', click_check: 'tick', wood_hit: 'hit', typing_soft: 'key', typing_laptop: 'key', click_cool: 'click',
  click_plastic: 'tick', click_modern: 'tick', click_device: 'tick', click_close: 'tick', pop_dry: 'pop', pop_message: 'pop', pop_long: 'pop', sweep_short: 'whoosh',
  'openverse/ov_marker': 'paper', 'openverse/ov_stamp': 'hit', 'openverse/ov_thump': 'thump', 'openverse/ov_whoosh1': 'whoosh', 'openverse/ov_wipe2': 'wipe',
  'openverse/ov_paper_slide_n': 'paper', 'openverse/ov_envelope_n': 'paper',
  sign_stroke: 'paper', pencil_stroke: 'paper',
  confirm: 'success', whoosh_air: 'wipe', pop_hard: 'pop', tech_slide: 'whoosh', correct: 'success', positive: 'chime' };
const events = []; // Real SFX(from_cues.py)용 이벤트 목록: 소리가 들려야 하는 순간
const resolved = []; // Real SFX(critique.py)가 읽는 형식으로 쓴 '지금 실제로 깔린' 효과음
const ROLE = { tick: 'click', wipe: 'whoosh', key: 'click', success: 'ui', chime: 'ui' };
if (voiceSrc) tags.push(`<audio id="voice" data-start="0" data-duration="${r3(voiceDur)}" data-track-index="${track++}" data-volume="${T.voiceVol ?? 1}" src="voice/${voiceSrc}"></audio>`);
T.sfx.forEach((c, k) => {
  const s = sentences[c.s];
  const w = c.w < 0 ? s.words.at(c.w) : s.words[c.w];
  const at = (c.w < 0 ? w.e : w.s) + (c.off || 0);
  const hit = HIT[c.name]?.[c.align === 'onset' ? 0 : 1] ?? 0;
  const start = Math.max(0, at - hit);
  const file = path.join(DIR, 'sfx', `${c.name}.mp3`);
  let len = probeDur(file);
  if (c.until === 'end') len = Math.min(len, s.end - start + 0.1);
  len = Math.min(len, DUR - start);
  const ev = { t: r3(at), type: KIND[c.name] || 'pop', g: r3(Math.min(1.2, c.vol / 0.5)) };
  if (ev.type === 'key') Object.assign(ev, { len: r3(s.end - at), n: [...s.words.map((x) => x.raw).join('')].length });
  events.push(ev);
  resolved.push({ t: r3(at), label: `${c.name} x${c.vol}`, file, source_file: file, role: ROLE[ev.type] || ev.type, anchor: c.align === 'onset' ? 'onset' : 'peak',
    peak_time: r3(start + (HIT[c.name]?.[1] ?? 0)), arrive_time: null, start: r3(start), seg: r3(len), source: 'library', library: c.name.startsWith('openverse/') ? 'openverse' : 'mixkit', tier: 'main',
    gain_db: 0, gain_applied_db: r3(20 * Math.log10(c.vol)), fx: '', _layer: false, pitch: 0, slice: null, slice_of: null, same_source: false, texture: false, bed: false });
  tags.push(`<audio id="sfx${k}" data-start="${r3(start)}" data-duration="${r3(len)}" data-track-index="${track++}" data-volume="${r3(c.vol * (T.sfxGain ?? 1))}" src="sfx/${c.name}.mp3"></audio>`);
});

// 5) 립싱크: 프레임마다 입 벌림(o)·폭(w)·오므림(r). 음절의 모음으로 모양을, 목소리 크기로 벌림을 정한다
const FPS = T.fps || 30, NF = Math.ceil(DUR * FPS) + 1;
const VIS = (ch) => {
  if (/[0-9]/.test(ch)) return { o: 0.3, w: 1.12, r: 0, cho: -1, jong: 0 }; // 2 → "이"
  const c = ch.charCodeAt(0) - 0xac00; if (c < 0 || c > 11171) return null;
  const cho = Math.floor(c / 588), jung = Math.floor((c % 588) / 28), jong = c % 28;
  const v = [0, 2, 9].includes(jung) ? { o: 1, w: 1, r: 0 } : [1, 3, 5, 7, 10, 15].includes(jung) ? { o: 0.62, w: 1.1, r: 0 }
    : [4, 6, 14].includes(jung) ? { o: 0.75, w: 0.92, r: 0.2 } : [8, 12, 11].includes(jung) ? { o: 0.55, w: 0.68, r: 0.9 }
    : [13, 17, 16].includes(jung) ? { o: 0.35, w: 0.6, r: 1 } : { o: 0.28, w: 1.15, r: 0 };
  return { ...v, cho, jong };
};
const env = new Float32Array(NF).fill(useVoice ? 0 : 0.8);
if (voiceSrc) {
  const pcm = spawnSync('ffmpeg', ['-v', 'error', '-i', path.join(DIR, 'voice', voiceSrc), '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 }).stdout;
  const x = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 4));
  for (let f = 0; f < NF; f++) {
    const c = Math.round((f / FPS) * 16000), a = Math.max(0, c - 400), b = Math.min(x.length, c + 400);
    let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i];
    const db = 10 * Math.log10(s / Math.max(1, b - a) + 1e-12);
    env[f] = Math.min(1, Math.max(0, (db + 46) / 26)); // -46dB → 0, -20dB → 1
  }
}
const tgt = Array.from({ length: NF }, () => ({ o: 0, w: 1, r: 0 }));
for (const s of sentences) for (const w of s.words) {
  const syl = [...plain(w.raw)].map(VIS).filter(Boolean); if (!syl.length) continue;
  const d = (w.e - w.s) / syl.length;
  syl.forEach((v, k) => {
    const a = w.s + k * d, b = a + d;
    for (let f = Math.floor(a * FPS); f <= Math.ceil(b * FPS) && f < NF; f++) {
      const p = (f / FPS - a) / d; if (p < 0 || p > 1) continue;
      const shut = ([6, 7, 8, 17].includes(v.cho) && p < 0.3) || ([16, 17, 26].includes(v.jong) && p > 0.72); // ㅁㅂㅃㅍ 입술 닫힘
      tgt[f] = shut ? { o: 0, w: 0.95, r: 0.1 } : { o: v.o, w: v.w, r: v.r };
    }
  });
}
const mouth = { o: [], w: [], r: [] };
let so = 0, sw = 1, sr = 0;
for (let f = 0; f < NF; f++) {
  const e = env[f], g = e < 0.1 ? 0 : Math.min(1.05, 0.3 + 0.85 * e);
  const t = tgt[f], o = t.o * g, w = g ? t.w : 1, r = g ? t.r : 0;
  so += (o - so) * (o > so ? 0.75 : 0.5); sw += (w - sw) * 0.6; sr += (r - sr) * 0.6;
  mouth.o.push(+so.toFixed(2)); mouth.w.push(+sw.toFixed(2)); mouth.r.push(+sr.toFixed(2));
}

const data = {
  dur: DUR,
  fps: FPS,
  mouth,
  cam: hasCam ? { dur: r3(camDur) } : null,
  character: T.character !== false && fs.existsSync(path.join(DIR, 'assets', 'char', 'neutral.png')),
  poses: fs.existsSync(path.join(DIR, 'assets', 'char')) ? fs.readdirSync(path.join(DIR, 'assets', 'char')).filter((f) => /\.png$/.test(f)).map((f) => f.replace(/\.png$/, '')) : [],
  mouths: fs.existsSync(path.join(DIR, 'assets', 'char', 'mouths.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'assets', 'char', 'mouths.json'), 'utf8')) : {},
  sentences: sentences.map((s) => ({ id: s.id, chap: s.chap, step: s.step, start: s.start, end: s.end, groups: s.groups, poses: s.poses || [], cam: hasCam ? (s.cam || null) : null,
    words: s.words.map((w) => ({ raw: w.raw, s: w.s, e: w.e, g: w.group, chunk: w.chunk })) })),
};
fs.mkdirSync(path.join(DIR, 'out'), { recursive: true });
fs.writeFileSync(path.join(DIR, 'out', 'events.json'), JSON.stringify(events, null, 1), 'utf8');
fs.writeFileSync(path.join(DIR, 'out', 'resolved_cues.json'), JSON.stringify({ video: path.join(DIR, 'out', 'preview.mp4'), duration: DUR, keep_audio: false, flags: {}, loudness: {}, cues: resolved }, null, 1), 'utf8');
fs.writeFileSync(path.join(DIR, 'data.js'), `window.REEL = ${JSON.stringify(data)};\n`, 'utf8');
let html = fs.readFileSync(path.join(DIR, 'src', 'template.html'), 'utf8');
html = html.replaceAll('{{DUR}}', DUR).replace('<!--AUDIO-->', tags.join('\n    ')).replace('<!--CAM-->', camTag);
fs.writeFileSync(path.join(DIR, 'index.html'), html, 'utf8');
console.log(`built: ${DUR}s, ${sentences.length} sentences, ${tags.length} audio tags${voiceSrc ? ' (voice: ' + voiceSrc + ')' : ' (estimated timing)'}${hasCam ? `, 내 영상 ${r3(camDur)}s` : ''}`);
for (const s of sentences) console.log(`  ${s.id} ${s.start.toFixed(2)}–${s.end.toFixed(2)}  ${s.text.replace(/[*]/g, '').replace(/ \/ /g, ' ')}`);
