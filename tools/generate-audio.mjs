#!/usr/bin/env node
// Generates audio for ALL words (every grade, deduplicated) via OpenRouter
// TTS (hexgrad/kokoro-82m). Words come from ../words.js, example sentences
// from ../sentences.js.
//
// Output: audio/words/<word>.wav          — just the word, prefix cut off
//         audio/words/<word>_sentence.mp3 — the example sentence
//
// Kokoro is nondeterministic and garbles short inputs (clipped phonemes,
// stutters, inserted syllables), so every clip is verified by transcribing it
// back (Gemini Flash) and regenerated until it passes:
//   1. Pause method: render "Your word is; <word>." — the semicolon inserts a
//      ~700 ms pause that energy analysis can find; cut everything before it.
//      Retries rotate the carrier phrase (some words fail one lead-in
//      systematically).
//   2. Valley fallback: some words garble after ANY pause (e.g. "blue" →
//      "a blue"). Render the fluent no-pause phrase and cut at the natural
//      low-energy valley (stop-closure) right before the word.
// Verification is homophone-tolerant (audio can't distinguish "sea"/"see").
//
// Existing files are skipped, so the run is resumable and re-runnable; delete
// a file to regenerate it. Failures don't abort the run — they're listed at
// the end (rerun to retry just those).
//
// Usage:  OPENROUTER_API_KEY=sk-or-... node tools/generate-audio.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) {
  console.error("Missing OPENROUTER_API_KEY environment variable.");
  process.exit(1);
}

const TTS_MODEL = "hexgrad/kokoro-82m";
const VOICE = "af_heart"; // warm American-English female voice, clear for kids
const SPEED = 0.85;
const TRANSCRIBE_MODEL = "google/gemini-2.5-flash";
const PAUSE_ATTEMPTS = 3;
const SAMPLE_RATE = 24000; // kokoro PCM: 24 kHz, 16-bit, mono
const CONCURRENCY = 4;

const CARRIER_PHRASES = [
  (w) => `Your word is; ${w}.`,
  (w) => `The word is; ${w}.`,
  (w) => `Spell the word; ${w}.`,
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "audio", "words");
mkdirSync(outDir, { recursive: true });

const WORDS = new Function(`${readFileSync(join(root, "words.js"), "utf8")}; return WORDS;`)();
const SENTENCES = new Function(`${readFileSync(join(root, "sentences.js"), "utf8")}; return SENTENCES;`)();
const allWords = [...new Set(Object.values(WORDS).flat())].sort();

/* ---------------- OpenRouter helpers ---------------- */

async function orFetch(url, body) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      await new Promise((r) => setTimeout(r, 5000 * attempt));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 8000 * attempt));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res;
  }
  throw new Error(`gave up after repeated 429/5xx: ${url}`);
}

async function tts(text, format) {
  const res = await orFetch("https://openrouter.ai/api/v1/audio/speech", {
    model: TTS_MODEL,
    input: text,
    voice: VOICE,
    speed: SPEED,
    response_format: format,
  });
  return Buffer.from(await res.arrayBuffer());
}

async function askModel(audioBuf, format, prompt) {
  const res = await orFetch("https://openrouter.ai/api/v1/chat/completions", {
    model: TRANSCRIBE_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "input_audio", input_audio: { data: audioBuf.toString("base64"), format } },
        ],
      },
    ],
  });
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

const transcribe = (buf, format) =>
  askModel(
    buf,
    format,
    "Transcribe this audio exactly as pronounced, including any mispronunciations, stutters, or extra syllables. Write what you literally hear, not what was probably intended. Reply with only the transcription."
  );

// Lowercase, strip punctuation, collapse whitespace, and normalize the
// common "you're/your" transcription confusion.
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/you're/g, "your")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Strict transcription match first; on mismatch, a homophone-tolerant yes/no
// check decides (audio alone can't distinguish "sea" from "see").
async function verifyText(buf, format, text) {
  const heard = await transcribe(buf, format);
  if (normalize(heard) === normalize(text)) return { ok: true, heard };
  const verdict = await askModel(
    buf,
    format,
    `The audio should say: "${text}". Does it say exactly that — every word present and clearly pronounced, no extra words, syllables, or stutters? Words that sound identical (homophones) count as correct. Answer only YES or NO.`
  );
  return { ok: /^yes/i.test(verdict), heard };
}

// Yes/no check for sub-second word clips: open transcription hallucinates on
// very short audio, a closed question is far more reliable.
async function soundsLikeWord(wav, word) {
  const verdict = await askModel(
    wav,
    "wav",
    `Does this short audio clip say exactly the single English word "${word}" — the whole word, nothing before or after it, no extra syllables? Answer only YES or NO.`
  );
  return /^yes/i.test(verdict);
}

/* ---------------- audio analysis ---------------- */

function pcmToWav(pcm) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const msToSamples = (ms) => Math.round((ms / 1000) * SAMPLE_RATE);

// RMS profile at `resMs` resolution.
function rmsProfile(samples, resMs) {
  const frame = (SAMPLE_RATE / 1000) * resMs;
  const frames = Math.floor(samples.length / frame);
  const rms = new Array(frames);
  let peak = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += samples[i] * samples[i];
    rms[f] = Math.sqrt(sum / frame);
    peak = Math.max(peak, rms[f]);
  }
  return { rms, peak };
}

// Speech segments (10ms resolution), small dips merged.
function speechSegments(samples) {
  const { rms, peak } = rmsProfile(samples, 10);
  const thr = Math.max(150, peak * 0.06);
  const segs = [];
  let start = -1;
  for (let f = 0; f < rms.length; f++) {
    if (rms[f] > thr && start < 0) start = f;
    if (rms[f] <= thr && start >= 0) {
      segs.push({ startMs: start * 10, endMs: f * 10 });
      start = -1;
    }
  }
  if (start >= 0) segs.push({ startMs: start * 10, endMs: rms.length * 10 });
  const merged = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && s.startMs - last.endMs < 40) last.endMs = s.endMs;
    else merged.push({ ...s });
  }
  return merged.filter((s) => s.endMs - s.startMs >= 40);
}

// The pause between the carrier phrase and the word: widest gap (>=300ms)
// after the prefix region. Stop-consonant closures inside words are ~80-120ms,
// the semicolon pause is ~700ms, so this can't pick the wrong one.
function findWordStartMs(segs) {
  let best = null;
  for (let i = 1; i < segs.length; i++) {
    const gap = segs[i].startMs - segs[i - 1].endMs;
    if (segs[i - 1].endMs >= 500 && (!best || gap > best.gap)) {
      best = { gap, startMs: segs[i].startMs };
    }
  }
  return best && best.gap >= 300 ? best.startMs : null;
}

// Low-energy runs (>=15ms) at 5ms resolution inside a window, longest first.
function findValleys(samples, fromMs, toMs) {
  const { rms, peak } = rmsProfile(samples, 5);
  const thr = Math.max(120, peak * 0.05);
  const valleys = [];
  let start = -1;
  for (let f = Math.floor(fromMs / 5); f < Math.min(rms.length, Math.floor(toMs / 5)); f++) {
    if (rms[f] < thr && start < 0) start = f;
    if (rms[f] >= thr && start >= 0) {
      valleys.push({ startMs: start * 5, len: (f - start) * 5 });
      start = -1;
    }
  }
  return valleys.filter((v) => v.len >= 15).sort((a, b) => b.len - a.len);
}

// Cut from fromMs to the end of speech (+150ms), declicked, as WAV.
function cutClip(samples, fromMs) {
  const { rms } = rmsProfile(samples, 5);
  let lastSpeech = rms.length - 1;
  for (let f = rms.length - 1; f >= 0; f--) {
    if (rms[f] > 200) {
      lastSpeech = f;
      break;
    }
  }
  const to = Math.min(samples.length, msToSamples(lastSpeech * 5 + 150));
  const clip = samples.slice(msToSamples(fromMs), to);
  for (let i = 0; i < 96 && i < clip.length; i++) clip[i] = (clip[i] * i) / 96;
  return pcmToWav(Buffer.from(clip.buffer, clip.byteOffset, clip.length * 2));
}

/* ---------------- clip generation ---------------- */

async function makeWordClip(word, file) {
  // Tier 1: pause method
  for (let attempt = 1; attempt <= PAUSE_ATTEMPTS; attempt++) {
    const phrase = CARRIER_PHRASES[(attempt - 1) % CARRIER_PHRASES.length](word);
    const pcm = await tts(phrase, "pcm");
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
    const phraseCheck = await verifyText(pcmToWav(pcm), "wav", phrase);
    if (!phraseCheck.ok) {
      console.log(`retry  ${word} (pause ${attempt}) — heard "${phraseCheck.heard}"`);
      continue;
    }
    const startMs = findWordStartMs(speechSegments(samples));
    if (startMs === null) {
      console.log(`retry  ${word} (pause ${attempt}) — no pause found`);
      continue;
    }
    const wav = cutClip(samples, Math.max(0, startMs - 40));
    if (await soundsLikeWord(wav, word)) {
      writeFileSync(file, wav);
      console.log(`ok     ${word} (pause ${attempt}, cut ${startMs - 40} ms)`);
      return;
    }
    console.log(`retry  ${word} (pause ${attempt}) — trimmed clip rejected`);
  }
  // Tier 2: valley fallback
  for (let take = 1; take <= 3; take++) {
    const phrase = `Your word is ${word}.`;
    const pcm = await tts(phrase, "pcm");
    const phraseCheck = await verifyText(pcmToWav(pcm), "wav", phrase);
    if (!phraseCheck.ok) {
      console.log(`retry  ${word} (valley ${take}) — heard "${phraseCheck.heard}"`);
      continue;
    }
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
    const totalMs = (samples.length / SAMPLE_RATE) * 1000;
    for (const v of findValleys(samples, 700, totalMs - 350).slice(0, 4)) {
      const wav = cutClip(samples, v.startMs + 5);
      if (await soundsLikeWord(wav, word)) {
        writeFileSync(file, wav);
        console.log(`ok     ${word} (valley ${take}, cut ${v.startMs + 5} ms)`);
        return;
      }
      console.log(`retry  ${word} (valley ${take}) — cut @${v.startMs + 5}ms rejected`);
    }
  }
  throw new Error(`no clean take for word "${word}"`);
}

async function makeSentenceClip(word, sentence, file) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const buf = await tts(sentence, "mp3");
    const check = await verifyText(buf, "mp3", sentence);
    if (check.ok) {
      writeFileSync(file, buf);
      console.log(`ok     ${word}_sentence (attempt ${attempt})`);
      return;
    }
    console.log(`retry  ${word}_sentence (attempt ${attempt}) — heard "${check.heard}"`);
  }
  throw new Error(`no clean take for sentence of "${word}"`);
}

/* ---------------- worker pool ---------------- */

const failures = [];
let done = 0;
const queue = [...allWords];

async function worker() {
  while (queue.length) {
    const word = queue.shift();
    const wordFile = join(outDir, `${word}.wav`);
    const sentFile = join(outDir, `${word}_sentence.mp3`);
    try {
      if (existsSync(wordFile)) console.log(`skip   ${word} (exists)`);
      else await makeWordClip(word, wordFile);
    } catch (e) {
      failures.push(`${word}: ${e.message}`);
      console.log(`FAIL   ${word} — ${e.message}`);
    }
    try {
      if (!SENTENCES[word]) {
        failures.push(`${word}: no sentence in sentences.js`);
        console.log(`FAIL   ${word} — no sentence in sentences.js`);
      } else if (existsSync(sentFile)) console.log(`skip   ${word}_sentence (exists)`);
      else await makeSentenceClip(word, SENTENCES[word], sentFile);
    } catch (e) {
      failures.push(`${word} sentence: ${e.message}`);
      console.log(`FAIL   ${word}_sentence — ${e.message}`);
    }
    done++;
    if (done % 25 === 0) console.log(`=== progress: ${done}/${allWords.length} words ===`);
  }
}

console.log(`${allWords.length} unique words across all grades`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\nDone. ${allWords.length - failures.length}/${allWords.length} ok.`);
if (failures.length) {
  console.log(`Failures (rerun to retry):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
