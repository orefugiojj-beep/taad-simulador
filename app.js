"use strict";
/* ===================================================================
   Simulador TAAD — lógica da aplicação
   100% offline depois do primeiro carregamento: o banco de perguntas
   vem cifrado (AES-256-GCM, chave derivada do PIN via PBKDF2) no
   ficheiro questions.enc.js e só é decifrado, em memória, depois do
   PIN correto. Nada é guardado em disco/localStorage decifrado.
   =================================================================== */

const PASS_MARK = 9.5; // valores mínimos para aprovação (escala 0-20), igual à prova real

const MODES = [
  { id: "real", label: "Real", count: 25, minutes: 120, featured: true,
    desc: "A simulação mais próxima da prova oficial: 25 perguntas, 2 horas, resultado só no final." },
  { id: "treino20", label: "Treino", count: 20, minutes: 96 },
  { id: "treino15", label: "Treino", count: 15, minutes: 72 },
  { id: "treino10", label: "Treino", count: 10, minutes: 48 },
  { id: "treino5",  label: "Treino", count: 5,  minutes: 24 },
];

/** @type {{questionBank: Array|null, mode: Object|null, questions: Array, answers: Array,
 *          current: number, secondsLeft: number, timerId: number|null, finished: boolean}} */
const state = {
  questionBank: null,
  mode: null,
  questions: [],
  answers: [],
  current: 0,
  secondsLeft: 0,
  timerId: null,
  finished: false,
};

// ---------- small DOM helpers ----------
const $ = (id) => document.getElementById(id);
function show(screenId) {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== screenId));
  window.scrollTo(0, 0);
}
// Escapes text before it's inserted via innerHTML (question/option/explanation
// text comes from our own signed question bank, not user input, but we escape
// defensively anyway so nothing in the text can ever be read as markup).
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ===================================================================
// Confirm modal (replaces native confirm(), which looks out of place
// inside an installed PWA and can't be styled for dark mode)
// ===================================================================
const modalOverlay = $("modal-overlay");
const modalTitle = $("modal-title");
const modalBody = $("modal-body");
const modalConfirmBtn = $("modal-confirm");
const modalCancelBtn = $("modal-cancel");
let modalConfirmHandler = null;

function openModal(title, body, confirmLabel, onConfirm) {
  modalTitle.textContent = title;
  modalBody.textContent = body;
  modalConfirmBtn.textContent = confirmLabel;
  modalConfirmHandler = onConfirm;
  modalOverlay.hidden = false;
}
function closeModal() {
  modalOverlay.hidden = true;
  modalConfirmHandler = null;
}
modalCancelBtn.addEventListener("click", closeModal);
modalConfirmBtn.addEventListener("click", () => {
  const fn = modalConfirmHandler;
  closeModal();
  if (fn) fn();
});
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalOverlay.hidden) closeModal();
});

// ===================================================================
// Crypto: PBKDF2(PIN, salt) -> AES-256-GCM key -> decrypt question bank
// ===================================================================
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function deriveKey(pin) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: hexToBytes(ENC_SALT), iterations: ENC_ITER, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function unlockWithPin(pin) {
  const key = await deriveKey(pin);
  const iv = hexToBytes(ENC_IV);
  const data = hexToBytes(ENC_DATA);
  // Throws (OperationError) if the PIN is wrong — the GCM tag won't verify.
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

// ===================================================================
// PIN screen
// ===================================================================
const pinForm = $("pin-form");
const pinInput = $("pin-input");
const pinError = $("pin-error");
const pinCard = document.querySelector(".pin-card");

pinForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pin = pinInput.value.trim();
  if (!pin) return;
  const submitBtn = pinForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  pinError.textContent = "";
  try {
    const bank = await unlockWithPin(pin);
    if (!Array.isArray(bank) || bank.length === 0) throw new Error("empty");
    state.questionBank = bank;
    pinInput.value = "";
    renderModes();
    show("screen-modes");
  } catch (err) {
    pinError.textContent = "PIN incorreto. Tenta novamente.";
    pinCard.classList.remove("shake");
    // eslint-disable-next-line no-unused-expressions
    void pinCard.offsetWidth; // restart animation
    pinCard.classList.add("shake");
    pinInput.value = "";
    pinInput.focus();
  } finally {
    submitBtn.disabled = false;
  }
});

function lockApp() {
  if (state.timerId) clearInterval(state.timerId);
  state.questionBank = null;
  state.mode = null;
  state.questions = [];
  state.answers = [];
  state.current = 0;
  state.finished = false;
  show("screen-pin");
  pinInput.focus();
}
$("btn-lock-modes").addEventListener("click", lockApp);
$("btn-lock-quiz").addEventListener("click", () => {
  openModal(
    "Bloquear a aplicação?",
    "Tens um teste em curso. Bloquear agora perde todo o progresso deste teste.",
    "Bloquear e perder progresso",
    lockApp
  );
});

// ===================================================================
// Mode-select screen
// ===================================================================
function fmtMinutes(min) {
  if (min % 60 === 0) return `${min / 60}h`;
  if (min < 60) return `${min}min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

function renderModes() {
  $("bank-info").textContent = `Banco com ${state.questionBank.length} perguntas verificadas, sobre os 6 diplomas de consulta.`;

  const real = MODES[0];
  $("mode-real-slot").innerHTML = `
    <button class="mode-real" data-mode="${real.id}">
      <div class="mode-real-label">${real.label}</div>
      <div class="mode-real-desc">${real.desc}</div>
      <div class="mode-real-meta"><span><b>${real.count}</b> perguntas</span><span><b>${fmtMinutes(real.minutes)}</b> no máximo</span></div>
    </button>`;

  const tiles = MODES.slice(1).map(
    (m) => `
    <button class="mode-tile" data-mode="${m.id}">
      <div class="mode-tile-label">${m.label} · ${m.count}</div>
      <div class="mode-tile-meta">${m.count} perguntas · ${fmtMinutes(m.minutes)}</div>
    </button>`
  ).join("");
  $("modes-grid").innerHTML = tiles;

  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => startQuiz(MODES.find((m) => m.id === btn.dataset.mode)));
  });
}

// ===================================================================
// Quiz
// ===================================================================
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startQuiz(mode) {
  const count = Math.min(mode.count, state.questionBank.length);
  const picked = shuffled(state.questionBank).slice(0, count);

  state.mode = mode;
  state.questions = picked.map((q) => {
    const order = shuffled(q.options.map((_, i) => i));
    return {
      id: q.id,
      diploma: q.diploma,
      article: q.article,
      page: q.page,
      question: q.question,
      explanation: q.explanation,
      options: order.map((i) => q.options[i]),
      correctIndex: order.indexOf(q.correctIndex),
    };
  });
  state.answers = new Array(state.questions.length).fill(null);
  state.current = 0;
  state.finished = false;
  state.secondsLeft = mode.minutes * 60;

  $("quiz-mode-name").textContent = mode.count === 25 && mode.minutes === 120 ? "Modo Real" : `Treino · ${mode.count} perguntas`;
  renderPalette();
  renderQuestion();
  startTimer();
  show("screen-quiz");
}

function startTimer() {
  if (state.timerId) clearInterval(state.timerId);
  renderTimer();
  state.timerId = setInterval(() => {
    state.secondsLeft--;
    renderTimer();
    if (state.secondsLeft <= 0) {
      clearInterval(state.timerId);
      state.timerId = null;
      finishQuiz("tempo");
    }
  }, 1000);
}

function renderTimer() {
  const s = Math.max(0, state.secondsLeft);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const text = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
  const el = $("timer");
  el.textContent = text;
  const frac = s / (state.mode.minutes * 60);
  el.classList.toggle("timer-warn", frac <= 0.2 && frac > 0.08);
  el.classList.toggle("timer-danger", frac <= 0.08);
}

function renderPalette() {
  const html = state.questions
    .map((_, i) => `<button class="palette-item" data-idx="${i}">${i + 1}</button>`)
    .join("");
  $("palette").innerHTML = html;
  document.querySelectorAll(".palette-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.current = Number(btn.dataset.idx);
      renderQuestion();
    });
  });
  updatePaletteState();
}

function updatePaletteState() {
  document.querySelectorAll(".palette-item").forEach((btn, i) => {
    btn.classList.toggle("answered", state.answers[i] !== null);
    btn.classList.toggle("current", i === state.current);
  });
}

function renderQuestion() {
  const q = state.questions[state.current];
  $("quiz-progress-text").textContent = `Pergunta ${state.current + 1} de ${state.questions.length}`;
  $("question-tag").textContent = q.diploma;
  $("question-text").textContent = q.question;

  $("options").innerHTML = q.options
    .map((opt, i) => {
      const letter = String.fromCharCode(65 + i);
      const selected = state.answers[state.current] === i;
      return `<button class="option${selected ? " selected" : ""}" data-idx="${i}">
        <span class="option-marker">${letter}</span><span>${escapeHtml(opt)}</span>
      </button>`;
    })
    .join("");
  document.querySelectorAll(".option").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.answers[state.current] = Number(btn.dataset.idx);
      renderQuestion();
      updatePaletteState();
    });
  });

  $("btn-prev").disabled = state.current === 0;
  $("btn-next").textContent = state.current === state.questions.length - 1 ? "Terminar" : "Seguinte";
  updatePaletteState();
}

$("btn-prev").addEventListener("click", () => {
  if (state.current > 0) { state.current--; renderQuestion(); }
});
$("btn-next").addEventListener("click", () => {
  if (state.current < state.questions.length - 1) {
    state.current++;
    renderQuestion();
  } else {
    attemptFinish();
  }
});
$("btn-finish").addEventListener("click", attemptFinish);

function attemptFinish() {
  const unanswered = state.answers.filter((a) => a === null).length;
  if (unanswered > 0) {
    openModal(
      "Terminar o teste?",
      `Tens ${unanswered} pergunta${unanswered === 1 ? "" : "s"} por responder. Não vais poder voltar a este teste depois de terminares.`,
      "Terminar mesmo assim",
      () => finishQuiz("manual")
    );
    return;
  }
  finishQuiz("manual");
}

window.addEventListener("beforeunload", (e) => {
  const quizVisible = !$("screen-quiz").hidden;
  if (quizVisible && !state.finished) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ===================================================================
// Result screen
// ===================================================================
function finishQuiz(reason) {
  state.finished = true;
  if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }

  const total = state.questions.length;
  const correctCount = state.questions.reduce(
    (acc, q, i) => acc + (state.answers[i] === q.correctIndex ? 1 : 0), 0
  );
  const scale20 = Math.round((correctCount / total) * 20 * 100) / 100;
  const pass = scale20 >= PASS_MARK;

  const usedSeconds = state.mode.minutes * 60 - Math.max(0, state.secondsLeft);
  const usedH = Math.floor(usedSeconds / 3600);
  const usedM = Math.floor((usedSeconds % 3600) / 60);
  const usedText = usedH > 0 ? `${usedH}h ${usedM}min` : `${usedM}min`;

  $("result-mode").textContent = state.mode.count === 25 && state.mode.minutes === 120 ? "Modo Real" : `Treino · ${state.mode.count} perguntas`;
  $("result-score").textContent = `${correctCount}/${total}`;
  $("result-scale").textContent = `${scale20.toFixed(2).replace(".", ",")} valores`;
  const statusEl = $("result-status");
  statusEl.textContent = pass ? "Acima da nota mínima" : "Abaixo da nota mínima";
  statusEl.className = "result-status " + (pass ? "pass" : "fail");
  $("result-meta").textContent =
    (reason === "tempo" ? "Tempo esgotado · " : "") +
    `Tempo usado: ${usedText} de ${fmtMinutes(state.mode.minutes)} · Mínimo para aprovação: ${PASS_MARK.toFixed(2).replace(".", ",")} valores`;

  $("review-list").innerHTML = state.questions
    .map((q, i) => {
      const given = state.answers[i];
      const ok = given === q.correctIndex;
      const letter = (idx) => (idx === null || idx === undefined ? "—" : String.fromCharCode(65 + idx));
      return `
      <div class="review-item">
        <div class="review-item-head">
          <span class="review-tag">${escapeHtml(q.diploma)} · ${escapeHtml(q.article)} · pág. ${escapeHtml(String(q.page))}</span>
          <span class="review-flag ${ok ? "ok" : "bad"}">${ok ? "Certo" : (given === null ? "Em branco" : "Errado")}</span>
        </div>
        <p class="review-q">${i + 1}. ${escapeHtml(q.question)}</p>
        <div class="review-answers">
          <div class="review-answer-row ${ok ? "correct" : "incorrect"}">
            <span class="lab">A tua resposta:</span>
            <span class="val">${letter(given)}${given !== null ? " — " + escapeHtml(q.options[given]) : ""}</span>
          </div>
          ${!ok ? `<div class="review-answer-row correct">
            <span class="lab">Resposta certa:</span>
            <span class="val">${letter(q.correctIndex)} — ${escapeHtml(q.options[q.correctIndex])}</span>
          </div>` : ""}
        </div>
        <p class="review-explanation">${escapeHtml(q.explanation)}</p>
      </div>`;
    })
    .join("");

  show("screen-result");
}

$("btn-new-test").addEventListener("click", () => {
  renderModes();
  show("screen-modes");
});

// ===================================================================
// Service worker (offline / installable)
// ===================================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* offline-first still works without SW registration succeeding */
    });
  });
}
