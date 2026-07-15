"use strict";

const PRAISE = ["Super! ⭐", "Great job! 🎉", "Awesome! 🌟", "You rock! 🚀", "Wow! 🦄", "Brilliant! 🏆"];
const MAX_TRIES = 3;

const els = {
  card: document.getElementById("card"),
  slots: document.getElementById("slots"),
  feedback: document.getElementById("feedback"),
  speak: document.getElementById("speak"),
  sentence: document.getElementById("sentence"),
  peek: document.getElementById("peek"),
  right: document.getElementById("right"),
  wrong: document.getElementById("wrong"),
  streak: document.getElementById("streak"),
};

let grade = "k";
let word = "";
let prevWord = "";
let input = "";
let tries = 0;
let locked = false;
let peeking = false;
const score = { right: 0, wrong: 0, streak: 0 };

function rnd(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/* ---------- speech ---------- */
// All grades share pre-generated clips in audio/words/ (<word>.wav +
// <word>_sentence.mp3); missing files fall back to browser TTS.
const HAS_AUDIO = { test: true, k: true, g1: true, g2: true, g3: true, g4: true };

const player = new Audio();
let queue = [];

function playNext() {
  if (!queue.length) {
    els.speak.classList.remove("talking");
    return;
  }
  const item = queue.shift();
  player.src = item.src;
  els.speak.classList.add("talking");
  player.play().catch(() => {
    queue = [];
    els.speak.classList.remove("talking");
    speakFallback(item.fallbackText);
  });
}

// Short breather between clips (word ... sentence).
player.addEventListener("ended", () => setTimeout(playNext, 500));

let voice = null;

function pickVoice() {
  const vs = speechSynthesis.getVoices();
  voice =
    vs.find((v) => v.lang === "en-US" && v.localService) ||
    vs.find((v) => v.lang.startsWith("en") && v.localService) ||
    vs.find((v) => v.lang.startsWith("en")) ||
    null;
}

if ("speechSynthesis" in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

function speakFallback(text) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.75;
  if (voice) u.voice = voice;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  els.speak.classList.add("talking");
  u.onend = () => els.speak.classList.remove("talking");
}

function playMp3s(items) {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  player.pause();
  queue = items;
  playNext();
}

function sayWord() {
  if (HAS_AUDIO[grade]) playMp3s([{ src: `audio/words/${word}.wav`, fallbackText: word }]);
  else speakFallback(word);
}

function saySentence() {
  if (HAS_AUDIO[grade])
    playMp3s([{ src: `audio/words/${word}_sentence.mp3`, fallbackText: SENTENCES[word] }]);
  else if (SENTENCES[word]) speakFallback(SENTENCES[word]);
}

// New word: read the word, pause, then its sentence.
function announceWord() {
  if (HAS_AUDIO[grade]) {
    playMp3s([
      { src: `audio/words/${word}.wav`, fallbackText: word },
      { src: `audio/words/${word}_sentence.mp3`, fallbackText: SENTENCES[word] },
    ]);
  } else {
    speakFallback(word);
  }
}

/* ---------- game ---------- */
function newWord() {
  const list = WORDS[grade];
  let w;
  do {
    w = list[rnd(0, list.length - 1)];
  } while (w === prevWord && list.length > 1);
  prevWord = w;
  word = w;
  input = "";
  tries = 0;
  locked = false;
  peeking = false;
  els.card.classList.remove("right", "wrong");
  els.feedback.textContent = "";
  els.feedback.className = "feedback";
  els.card.style.animation = "none";
  void els.card.offsetWidth; // restart the pop animation
  els.card.style.animation = "";
  render();
  announceWord();
}

function renderSlots(letters, extraClass) {
  els.slots.innerHTML = "";
  // Shrink letter boxes so long words still fit on one line.
  els.slots.style.setProperty("--slot-size", `min(52px, ${(88 / word.length).toFixed(2)}vw)`);
  for (let i = 0; i < word.length; i++) {
    const s = document.createElement("span");
    s.className = "slot" + (letters[i] ? " filled" : "") + (extraClass ? " " + extraClass : "");
    s.textContent = letters[i] || "";
    els.slots.appendChild(s);
  }
}

function render() {
  renderSlots(input);
  els.right.textContent = score.right;
  els.wrong.textContent = score.wrong;
  els.streak.textContent = score.streak;
}

function press(key) {
  if (locked || peeking) return;
  if (key === "back") {
    input = input.slice(0, -1);
  } else if (key === "ok") {
    submit();
    return;
  } else if (input.length < word.length) {
    input += key;
  }
  els.card.classList.remove("wrong");
  render();
}

function submit() {
  if (locked || peeking || input === "") return;
  if (input.length < word.length) {
    els.feedback.textContent = "Fill all the letters! ✏️";
    els.feedback.className = "feedback oops";
    return;
  }
  if (input === word) {
    locked = true;
    score.right++;
    score.streak++;
    els.card.classList.add("right");
    els.feedback.textContent = PRAISE[rnd(0, PRAISE.length - 1)];
    els.feedback.className = "feedback good";
    render();
    renderSlots(input, "good");
    setTimeout(newWord, 1200);
  } else {
    score.wrong++;
    score.streak = 0;
    tries++;
    els.card.classList.add("wrong", "shake");
    setTimeout(() => els.card.classList.remove("shake"), 450);
    if (tries >= MAX_TRIES) {
      locked = true;
      input = word;
      els.feedback.textContent = "It's spelled like this 💡";
      els.feedback.className = "feedback oops";
      render();
      renderSlots(word, "hint");
      setTimeout(newWord, 2500);
    } else {
      input = "";
      els.feedback.textContent = "Try again! 💪";
      els.feedback.className = "feedback oops";
      render();
      sayWord();
    }
  }
}

// Show the word for a moment (look–cover–write–check), then hide it again.
function peek() {
  if (locked || peeking) return;
  peeking = true;
  renderSlots(word, "hint");
  setTimeout(() => {
    peeking = false;
    render();
  }, 1500);
}

els.speak.addEventListener("click", sayWord);
els.sentence.addEventListener("click", saySentence);
els.peek.addEventListener("click", peek);

document.getElementById("keyboard").addEventListener("click", (e) => {
  const key = e.target.closest(".key");
  if (key) press(key.dataset.k);
});

document.getElementById("grades").addEventListener("click", (e) => {
  const btn = e.target.closest(".grade");
  if (!btn) return;
  grade = btn.dataset.grade;
  document.querySelectorAll(".grade").forEach((b) => b.classList.toggle("active", b === btn));
  els.sentence.hidden = !HAS_AUDIO[grade];
  prevWord = "";
  newWord();
});

// Hardware keyboard support (desktop / tablets with keyboards)
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^[a-z]$/i.test(e.key)) press(e.key.toLowerCase());
  else if (e.key === "Backspace") press("back");
  else if (e.key === "Enter") press("ok");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

newWord();
