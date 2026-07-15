#!/usr/bin/env node
// Generates ONE audio clip per word (all grades, deduplicated):
//
//   audio/words/<word>.mp3  —  "<word>. <sentence>. <word>."
//
// The sentence between the two readings gives the word natural context on
// both ends, so no cutting or trimming is needed. Each clip is checked by
// transcribing it back (Gemini Flash); a bad take is regenerated up to
// 3 times, then the last take is kept anyway (a file must always exist).
//
// Words come from ../words.js, sentences from ../sentences.js.
// Existing files are skipped — the run is resumable; delete a file to
// regenerate it.
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
const MAX_ATTEMPTS = 3;
const CONCURRENCY = 4;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "audio", "words");
mkdirSync(outDir, { recursive: true });

const WORDS = new Function(`${readFileSync(join(root, "words.js"), "utf8")}; return WORDS;`)();
const SENTENCES = new Function(`${readFileSync(join(root, "sentences.js"), "utf8")}; return SENTENCES;`)();
const allWords = [...new Set(Object.values(WORDS).flat())].sort();

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

async function tts(text) {
  const res = await orFetch("https://openrouter.ai/api/v1/audio/speech", {
    model: TTS_MODEL,
    input: text,
    voice: VOICE,
    speed: SPEED,
    response_format: "mp3",
  });
  return Buffer.from(await res.arrayBuffer());
}

async function askModel(buf, prompt) {
  const res = await orFetch("https://openrouter.ai/api/v1/chat/completions", {
    model: TRANSCRIBE_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "input_audio", input_audio: { data: buf.toString("base64"), format: "mp3" } },
        ],
      },
    ],
  });
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

const normalize = (t) =>
  t.toLowerCase().replace(/you're/g, "your").replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();

// Strict transcription match first; on mismatch a homophone-tolerant yes/no
// check decides (audio alone can't distinguish "sea" from "see").
async function soundsRight(buf, text) {
  const heard = await askModel(
    buf,
    "Transcribe this audio exactly as pronounced, including any mispronunciations, stutters, or extra syllables. Reply with only the transcription."
  );
  if (normalize(heard) === normalize(text)) return { ok: true, heard };
  const verdict = await askModel(
    buf,
    `The audio should say: "${text}". Does it say exactly that — every word present and clearly pronounced, no extra words, syllables, or stutters? Words that sound identical (homophones) count as correct. Answer only YES or NO.`
  );
  return { ok: /^yes/i.test(verdict), heard };
}

async function makeClip(word) {
  const file = join(outDir, `${word}.mp3`);
  if (existsSync(file)) {
    console.log(`skip   ${word} (exists)`);
    return;
  }
  const sentence = SENTENCES[word];
  if (!sentence) throw new Error(`no sentence for "${word}" in sentences.js`);
  const text = `${word}. ${sentence.replace(/[.!?]$/, "")}. ${word}.`;
  let last = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const buf = await tts(text);
    last = buf;
    const check = await soundsRight(buf, text);
    if (check.ok) {
      writeFileSync(file, buf);
      console.log(`ok     ${word} (attempt ${attempt}, ${buf.length} bytes)`);
      return;
    }
    console.log(`retry  ${word} (attempt ${attempt}) — heard "${check.heard}"`);
  }
  writeFileSync(file, last);
  console.log(`ok?    ${word} — best-effort take kept (failed verification)`);
}

const failures = [];
let done = 0;
const queue = [...allWords];

async function worker() {
  while (queue.length) {
    const word = queue.shift();
    try {
      await makeClip(word);
    } catch (e) {
      failures.push(`${word}: ${e.message}`);
      console.log(`FAIL   ${word} — ${e.message}`);
    }
    done++;
    if (done % 25 === 0) console.log(`=== progress: ${done}/${allWords.length} ===`);
  }
}

console.log(`${allWords.length} unique words across all grades`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\nDone. ${allWords.length - failures.length}/${allWords.length} ok.`);
if (failures.length) {
  console.log(`Failures (rerun to retry):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
