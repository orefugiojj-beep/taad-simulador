"use strict";
/* ===================================================================
   Simulador TAAD — lógica da aplicação (versão 2)
   100% offline depois do primeiro carregamento: o banco de perguntas
   vem cifrado (AES-256-GCM, chave derivada do PIN via PBKDF2) no
   ficheiro questions.enc.js e só é decifrado, em memória, depois do
   PIN correto. Nada é guardado em disco/localStorage decifrado.
   =================================================================== */

const PASS_MARK = 9.5; // valores mínimos para aprovação (escala 0-20), igual à prova real

// As 6 legislações de consulta (alíneas a) a f) do Aviso). A ordem é a das alíneas.
// Estes textos têm de ser IGUAIS ao campo "legislacao" do banco de perguntas.
const LEGISLACOES = [
  "DLR n.º 21/2024/M (Carreira TAAD)",
  "Portaria n.º 38/2013 (SAD)",
  "Código do Trabalho",
  "LTFP (Lei n.º 35/2014) e DLR n.º 11/2018/M",
  "Orgânica do ISSM (DLR n.º 34/2012/M)",
  "Estatutos do ISSM (Portaria n.º 17/2017)",
];
const IDX_D = 3; // a alínea d) tem dois textos: a LTFP e o DLR n.º 11/2018/M
const LTFP_NAME = "LTFP (Lei n.º 35/2014)";
const DLR_11_2018 = "DLR n.º 11/2018/M";

const legLetter = (i) => String.fromCharCode(97 + i); // 0 -> "a"
const legFull = (i) => `${legLetter(i)}) ${LEGISLACOES[i]}`;
/** Texto exato onde está a resposta: na alínea d) distingue a LTFP do DLR n.º 11/2018/M. */
function legSource(q) {
  const i = LEGISLACOES.indexOf(q.legislacao);
  if (i === IDX_D) return `${legLetter(i)}) ${q.part ? q.part : LTFP_NAME}`;
  return legFull(i);
}

const MODES = [
  { id: "real", label: "Real", count: 25, minutes: 120, guess: false, featured: true,
    desc: "A simulação mais próxima da prova oficial: 25 perguntas, 2 horas, resultado só no final." },
  { id: "treino20", label: "Treino", count: 20, minutes: 96, guess: true },
  { id: "treino15", label: "Treino", count: 15, minutes: 72, guess: true },
  { id: "treino10", label: "Treino", count: 10, minutes: 48, guess: true },
  { id: "treino5",  label: "Treino", count: 5,  minutes: 24, guess: true },
  // Livre: sem limite de perguntas nem de tempo. O cronómetro conta para cima e o fim é
  // sempre decidido por quem faz o teste (botão «Terminar»).
  { id: "livre", label: "Livre", free: true, guess: true },
];

/** Ritmo de referência da prova real: 120 minutos a dividir pelas 25 perguntas = 288 s (4 min 48 s). */
const PACE_SECONDS = (MODES[0].minutes * 60) / MODES[0].count;

/** @type {{questionBank: Array|null, mode: Object|null, questions: Array, answers: Array,
 *          guesses: Array, current: number, endAt: number, secondsLeft: number,
 *          startAt: number, elapsed: number, stream: Object|null,
 *          timerId: number|null, finished: boolean}} */
const state = {
  questionBank: null,
  mode: null,
  questions: [],
  answers: [],
  guesses: [],   // palpite da legislação (índice 0-5) ou null; só nos Treinos e no Livre
  current: 0,
  endAt: 0,        // modos com limite: hora de fim
  secondsLeft: 0,  // modos com limite: segundos que faltam
  startAt: 0,      // modo Livre: hora de início
  elapsed: 0,      // modo Livre: segundos decorridos
  stream: null,    // modo Livre: fornecedor de perguntas novas (sem repetir)
  timerId: null,
  finished: false,
};

// ---------- small DOM helpers ----------
const $ = (id) => document.getElementById(id);
function show(screenId) {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== screenId));
  window.scrollTo(0, 0);
}
// Escapa o texto antes de entrar via innerHTML (o texto vem do nosso banco cifrado,
// não de input do utilizador, mas escapa-se sempre para nada poder ser lido como HTML).
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

/** O banco tem de ter o formato da versão 2 (legislacao, named, page...). Evita misturar
 *  uma app nova com um banco antigo (ou ao contrário) guardados em cache no telemóvel. */
function bankIsCurrent(bank) {
  return Array.isArray(bank) && bank.length > 0 && bank.every((q) =>
    q && typeof q === "object" &&
    LEGISLACOES.includes(q.legislacao) &&
    typeof q.named === "boolean" &&
    Number.isInteger(q.page) && q.page >= 1 &&
    typeof q.id === "string" &&
    typeof q.article === "string" &&
    typeof q.question === "string" &&
    typeof q.explanation === "string" &&
    Array.isArray(q.options) && q.options.length === 4 &&
    Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < 4 &&
    (q.part === undefined || (q.legislacao === LEGISLACOES[IDX_D] && q.part === DLR_11_2018))
  );
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
  let bank = null;
  try {
    bank = await unlockWithPin(pin);
  } catch (err) {
    pinError.textContent = "PIN incorreto. Tenta novamente.";
    pinCard.classList.remove("shake");
    // eslint-disable-next-line no-unused-expressions
    void pinCard.offsetWidth; // restart animation
    pinCard.classList.add("shake");
    pinInput.value = "";
    pinInput.focus();
    submitBtn.disabled = false;
    return;
  }
  submitBtn.disabled = false;
  if (!bankIsCurrent(bank)) {
    pinInput.value = "";
    pinError.textContent = "O banco de perguntas guardado nesta app está desatualizado. Liga-te à internet, fecha a app e abre-a de novo para atualizar.";
    return;
  }
  state.questionBank = bank;
  pinInput.value = "";
  renderModes();
  show("screen-modes");
});

function stopTimer() {
  if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
}

function lockApp() {
  stopTimer();
  state.questionBank = null;
  state.mode = null;
  state.questions = [];
  state.answers = [];
  state.guesses = [];
  state.stream = null;
  state.current = 0;
  state.startAt = 0;
  state.elapsed = 0;
  state.finished = false;
  $("review-list").innerHTML = "";
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
  return `${Math.floor(min / 60)}h\u00a0${min % 60}min`; // espaço sem quebra: "1h 36min" não parte em duas linhas
}

/** Duração em linguagem corrente, com espaços sem quebra: "4 min 48 s", "1 h 05 min 07 s". */
function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const NB = "\u00a0";
  if (h > 0) return `${h}${NB}h ${pad(m)}${NB}min ${pad(sec)}${NB}s`;
  if (m > 0) return `${m}${NB}min ${pad(sec)}${NB}s`;
  return `${sec}${NB}s`;
}

function modeName(mode) {
  if (mode.id === "real") return "Modo Real";
  if (mode.free) return "Modo Livre";
  return `Treino · ${mode.count} perguntas`;
}

function renderModes() {
  $("bank-info").textContent = `Banco com ${state.questionBank.length} perguntas verificadas, sobre as 6 legislações de consulta.`;

  const real = MODES[0];
  $("mode-real-slot").innerHTML = `
    <button class="mode-real" data-mode="${real.id}">
      <div class="mode-real-label">${real.label}</div>
      <div class="mode-real-desc">${real.desc}</div>
      <div class="mode-real-meta"><span><b>${real.count}</b> perguntas</span><span><b>${fmtMinutes(real.minutes)}</b> no máximo</span></div>
    </button>`;

  const tiles = MODES.filter((m) => !m.featured && !m.free).map(
    (m) => `
    <button class="mode-tile" data-mode="${m.id}">
      <div class="mode-tile-label">${m.label} · ${m.count}</div>
      <div class="mode-tile-meta">${m.count} perguntas · ${fmtMinutes(m.minutes)}</div>
    </button>`
  ).join("");
  $("modes-grid").innerHTML = tiles;

  const livre = MODES.find((m) => m.free);
  $("mode-livre-slot").innerHTML = `
    <button class="mode-livre" data-mode="${livre.id}">
      <div class="mode-tile-label">${livre.label}</div>
      <div class="mode-livre-desc">Sem limite de perguntas. Respondes ao teu ritmo, com o palpite da legislação, e carregas em «Terminar» quando quiseres.</div>
      <div class="mode-tile-meta">Cronómetro a contar para cima · no fim, comparação com ${fmtDuration(PACE_SECONDS)} por pergunta</div>
    </button>`;

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

/** Sorteio equilibrado pelas 6 legislações: cada teste tem perguntas de todas elas
 *  (as que sobram, quando N não é múltiplo de 6, vão para legislações sorteadas). */
function pickBalanced(bank, n) {
  const pools = LEGISLACOES.map((name) => shuffled(bank.filter((q) => q.legislacao === name)));
  const order = shuffled(pools.map((_, i) => i).filter((i) => pools[i].length > 0));
  const picked = [];
  let k = 0;
  while (picked.length < n && pools.some((p) => p.length > 0)) {
    const pool = pools[order[k % order.length]];
    if (pool.length > 0) picked.push(pool.pop());
    k++;
  }
  return shuffled(picked);
}

/** O palpite da legislação só existe nos Treinos e no modo Livre, e só nas perguntas que não
 *  nomeiam a legislação. */
function guessEnabled(q) {
  return state.mode !== null && state.mode.guess === true && !q.named;
}

/** Cópia da pergunta para o teste, com as opções por ordem aleatória (a chave acompanha). */
function prepareQuestion(q) {
  const order = shuffled(q.options.map((_, i) => i));
  return {
    id: q.id,
    legislacao: q.legislacao,
    part: q.part || null,
    article: q.article,
    page: q.page,
    named: q.named,
    question: q.question,
    explanation: q.explanation,
    options: order.map((i) => q.options[i]),
    correctIndex: order.indexOf(q.correctIndex),
  };
}

/** Modo Livre: fornece perguntas novas, uma de cada vez, sem repetir. Cada pergunta sai de uma
 *  legislação escolhida ao acaso, com a mesma probabilidade para todas as que ainda têm perguntas
 *  por mostrar (não há ordem previsível que ajude a adivinhar o palpite). */
function makeStream(bank) {
  const pools = LEGISLACOES.map((name) => shuffled(bank.filter((q) => q.legislacao === name)));
  return {
    remaining: () => pools.reduce((n, p) => n + p.length, 0),
    next() {
      const open = [];
      pools.forEach((p, i) => { if (p.length > 0) open.push(i); });
      if (open.length === 0) return null;
      const pick = open[Math.floor(Math.random() * open.length)];
      return pools[pick].pop();
    },
  };
}

/** Modo Livre: acrescenta a próxima pergunta ao teste. Devolve false se já não há perguntas novas. */
function appendNext() {
  const q = state.stream ? state.stream.next() : null;
  if (!q) return false;
  state.questions.push(prepareQuestion(q));
  state.answers.push(null);
  state.guesses.push(null);
  return true;
}

function startQuiz(mode) {
  state.mode = mode;
  state.current = 0;
  state.finished = false;
  state.stream = null;

  if (mode.free) {
    state.questions = [];
    state.answers = [];
    state.guesses = [];
    state.stream = makeStream(state.questionBank);
    appendNext(); // a primeira pergunta; as seguintes vêm uma a uma
  } else {
    const count = Math.min(mode.count, state.questionBank.length);
    state.questions = pickBalanced(state.questionBank, count).map(prepareQuestion);
    state.answers = new Array(state.questions.length).fill(null);
    state.guesses = new Array(state.questions.length).fill(null);
  }

  $("screen-quiz").classList.toggle("is-free", mode.free === true);
  $("btn-finish").textContent = mode.free ? "Terminar" : "Terminar teste";
  $("quiz-mode-name").textContent = modeName(mode);
  renderPalette();
  renderQuestion();
  startTimer();
  show("screen-quiz");
}

// Os modos com limite calculam o tempo que falta a partir de uma hora de fim fixa; o modo Livre
// calcula o tempo decorrido a partir de uma hora de início fixa. Em ambos o relógio continua certo
// mesmo que o telemóvel bloqueie o ecrã ou a app fique em segundo plano.
function startTimer() {
  stopTimer();
  if (state.mode.free) {
    state.startAt = Date.now();
    state.elapsed = 0;
  } else {
    state.endAt = Date.now() + state.mode.minutes * 60 * 1000;
  }
  tick();
  state.timerId = setInterval(tick, 1000);
}

function tick() {
  if (state.finished) return;
  if (state.mode.free) {
    state.elapsed = Math.max(0, Math.floor((Date.now() - state.startAt) / 1000));
    renderTimer();
    return; // no modo Livre o tempo nunca acaba: quem decide é o botão «Terminar»
  }
  state.secondsLeft = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
  renderTimer();
  if (state.secondsLeft <= 0) {
    stopTimer();
    finishQuiz("tempo");
  }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.timerId) tick();
});

function fmtClock(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function renderTimer() {
  const el = $("timer");
  if (state.mode.free) {
    el.textContent = fmtClock(Math.max(0, state.elapsed));
    el.title = "Tempo decorrido";
    el.setAttribute("aria-label", `Tempo decorrido ${fmtClock(Math.max(0, state.elapsed))}`);
    el.classList.remove("timer-warn", "timer-danger");
    el.classList.add("timer-up");
    return;
  }
  const s = Math.max(0, state.secondsLeft);
  el.textContent = fmtClock(s);
  el.title = "Tempo restante";
  el.setAttribute("aria-label", `Tempo restante ${fmtClock(s)}`);
  el.classList.remove("timer-up");
  const frac = s / (state.mode.minutes * 60);
  el.classList.toggle("timer-warn", frac <= 0.2 && frac > 0.08);
  el.classList.toggle("timer-danger", frac <= 0.08);
}

function renderPalette() {
  const html = state.questions
    .map((_, i) => `<button class="palette-item" data-idx="${i}" aria-label="Ir para a pergunta ${i + 1}">${i + 1}</button>`)
    .join("");
  $("palette").innerHTML = html;
  updatePaletteState();
}
$("palette").addEventListener("click", (e) => {
  const btn = e.target.closest(".palette-item");
  if (btn) goTo(Number(btn.dataset.idx));
});

function updatePaletteState() {
  const items = document.querySelectorAll(".palette-item");
  items.forEach((btn, i) => {
    btn.classList.toggle("answered", state.answers[i] !== null);
    btn.classList.toggle("current", i === state.current);
  });
  const cur = items[state.current];
  const pal = $("palette");
  if (cur && pal.scrollWidth > pal.clientWidth) {
    pal.scrollLeft = cur.offsetLeft - pal.clientWidth / 2 + cur.clientWidth / 2;
  }
}

function goTo(i) {
  if (i < 0 || i >= state.questions.length) return;
  state.current = i;
  renderQuestion();
  window.scrollTo(0, 0);
}

function renderGuess(q, guess) {
  const box = $("guess-box");
  const chips = $("guess-chips");
  const verdict = $("guess-verdict");
  const correct = LEGISLACOES.indexOf(q.legislacao);
  if (guess === null) {
    box.classList.remove("done");
    chips.hidden = false;
    chips.innerHTML = LEGISLACOES.map((name, i) => `
      <button type="button" class="guess-chip" data-g="${i}">
        <span class="guess-letter">${legLetter(i)})</span><span>${escapeHtml(name)}</span>
      </button>`).join("");
    verdict.hidden = true;
    verdict.textContent = "";
    verdict.className = "guess-verdict";
  } else {
    const right = guess === correct;
    box.classList.add("done");
    chips.hidden = true;
    chips.innerHTML = "";
    verdict.hidden = false;
    verdict.className = "guess-verdict " + (right ? "ok" : "bad");
    verdict.textContent = right
      ? `Palpite certo: a resposta está em ${legSource(q)}.`
      : `Palpite errado: escolheste ${legFull(guess)}. A resposta está em ${legSource(q)}.`;
  }
}

/** No modo Livre: ainda há perguntas novas para mostrar depois da última? */
function hasMoreQuestions() {
  return state.mode.free === true && state.stream !== null && state.stream.remaining() > 0;
}

function renderQuestion() {
  const idx = state.current;
  const q = state.questions[idx];
  if (state.mode.free) {
    const answered = state.answers.filter((a) => a !== null).length;
    $("quiz-progress-text").textContent =
      `Pergunta ${idx + 1} · ${answered} respondida${answered === 1 ? "" : "s"} · sem limite de perguntas`;
  } else {
    $("quiz-progress-text").textContent = `Pergunta ${idx + 1} de ${state.questions.length}`;
  }
  $("question-text").textContent = q.question;

  const needGuess = guessEnabled(q);
  const guess = state.guesses[idx];
  $("guess-box").hidden = !needGuess;
  if (needGuess) renderGuess(q, guess);

  // Nos Treinos, as opções só aparecem depois do palpite (nas perguntas em que há palpite).
  const optionsEl = $("options");
  const showOptions = !needGuess || guess !== null;
  optionsEl.hidden = !showOptions;
  optionsEl.innerHTML = showOptions
    ? q.options.map((opt, i) => {
        const letter = String.fromCharCode(65 + i);
        const selected = state.answers[idx] === i;
        return `<button type="button" class="option${selected ? " selected" : ""}" data-idx="${i}" aria-pressed="${selected}">
          <span class="option-marker">${letter}</span><span>${escapeHtml(opt)}</span>
        </button>`;
      }).join("")
    : "";

  $("btn-prev").disabled = idx === 0;
  const isLast = idx === state.questions.length - 1;
  // No modo Livre a última pergunta mostrada leva sempre a uma pergunta nova («Seguinte»);
  // só quando o banco inteiro já foi mostrado é que passa a «Terminar».
  $("btn-next").textContent = isLast && !hasMoreQuestions() ? "Terminar" : "Seguinte";
  updatePaletteState();
}

// Cliques nas opções e nos palpites (delegação: os elementos são recriados a cada pergunta)
$("options").addEventListener("click", (e) => {
  const btn = e.target.closest(".option");
  if (!btn || state.finished) return;
  state.answers[state.current] = Number(btn.dataset.idx);
  renderQuestion();
});
$("guess-chips").addEventListener("click", (e) => {
  const btn = e.target.closest(".guess-chip");
  if (!btn || state.finished) return;
  const idx = state.current;
  if (state.guesses[idx] !== null) return; // escolha fechada
  state.guesses[idx] = Number(btn.dataset.g);
  renderQuestion();
  window.scrollTo(0, 0);
});

$("btn-prev").addEventListener("click", () => goTo(state.current - 1));
$("btn-next").addEventListener("click", () => {
  if (state.current < state.questions.length - 1) {
    goTo(state.current + 1);
  } else if (state.mode.free && appendNext()) {
    renderPalette();                       // a paleta cresce com a pergunta nova
    goTo(state.questions.length - 1);
  } else {
    attemptFinish();
  }
});
$("btn-finish").addEventListener("click", attemptFinish);

const plural = (n, one, many) => (n === 1 ? one : many);

function attemptFinish() {
  if (state.mode.free) {
    // O tempo conta até ao momento em que se carrega em «Terminar», não até se confirmar.
    const pressedAt = Date.now();
    const answered = state.answers.filter((a) => a !== null).length;
    const skipped = state.questions.length - answered;
    let body;
    if (answered === 0) {
      body = "Ainda não respondeste a nenhuma pergunta, por isso não há nada para corrigir. Não vais poder voltar a este teste depois de terminares.";
    } else {
      body = (answered === 1
        ? "Vais ver a correção da pergunta que respondeste e o tempo total. "
        : `Vais ver a correção das ${answered} perguntas que respondeste e o tempo total. `) +
        (skipped > 0
          ? `${skipped} ${plural(skipped, "pergunta sem resposta não entra", "perguntas sem resposta não entram")} na correção. `
          : "") +
        "Não vais poder voltar a este teste depois de terminares.";
    }
    openModal("Terminar o teste livre?", body, "Terminar", () => finishQuiz("manual", pressedAt));
    return;
  }
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
/** Modo Livre: compara o tempo total com o ritmo da prova real (120 min ÷ 25 perguntas = 4 min 48 s
 *  por pergunta). O ritmo mede-se sobre as perguntas respondidas (as que aparecem na correção);
 *  o tempo gasto nas que ficaram sem resposta conta no total, como contaria na prova. */
function renderPace(usedSeconds, answered, skipped) {
  const verdict = $("pace-verdict");
  $("pace-used").textContent = fmtDuration(usedSeconds);
  const hasAnswers = answered > 0;
  $("pace-expected-row").hidden = !hasAnswers;
  $("pace-avg-row").hidden = !hasAnswers;

  let detail;
  if (!hasAnswers) {
    verdict.textContent = "Sem respostas para avaliar o ritmo";
    verdict.className = "pace-verdict neutral";
    detail = "";
  } else {
    const expected = answered * PACE_SECONDS;
    const diff = usedSeconds - expected;
    const within = diff <= 0;
    verdict.textContent = within ? "Dentro do tempo esperado" : "Acima do tempo esperado";
    verdict.className = "pace-verdict " + (within ? "ok" : "bad");
    $("pace-expected-label").textContent = `${answered}\u00a0×\u00a0${fmtDuration(PACE_SECONDS)}`;
    $("pace-expected").textContent = fmtDuration(expected);
    $("pace-avg").textContent = fmtDuration(usedSeconds / answered);
    detail = diff === 0
      ? "Usaste exatamente o tempo esperado. "
      : within
        ? `Sobraram ${fmtDuration(-diff)}. `
        : `Passaste ${fmtDuration(diff)} do tempo esperado. `;
  }
  $("pace-note").textContent =
    `${detail}Na prova real há ${fmtMinutes(MODES[0].minutes)} para ${MODES[0].count} perguntas, ou seja, ${fmtDuration(PACE_SECONDS)} por pergunta.` +
    (skipped === 0
      ? ""
      : skipped === 1
        ? " O tempo total inclui o gasto na pergunta que ficou sem resposta."
        : ` O tempo total inclui o gasto nas ${skipped} perguntas que ficaram sem resposta.`);
}

function finishQuiz(reason, endMs) {
  if (state.finished) return;
  state.finished = true;
  stopTimer();

  const free = state.mode.free === true;
  const endedAt = endMs || Date.now();

  // Perguntas que entram na correção: todas, exceto no modo Livre, onde só contam as respondidas.
  const items = state.questions
    .map((q, i) => ({ q, given: state.answers[i], guess: state.guesses[i] }))
    .filter((it) => !free || it.given !== null);
  const total = items.length;
  const skipped = state.questions.length - total; // só pode ser > 0 no modo Livre
  const correctCount = items.filter((it) => it.given === it.q.correctIndex).length;
  const fmt2 = (n) => n.toFixed(2).replace(".", ",");

  $("result-mode").textContent = modeName(state.mode);
  $("result-score").textContent = `${correctCount}/${total}`;
  const statusEl = $("result-status");
  const metaEl = $("result-meta");
  $("result-pace").hidden = !free;

  if (total === 0) {
    // Só acontece no modo Livre, se se terminar sem responder a nenhuma pergunta.
    $("result-scale").textContent = "Sem perguntas respondidas";
    statusEl.textContent = "Nada para corrigir";
    statusEl.className = "result-status neutral";
    metaEl.textContent = "O modo Livre só corrige as perguntas que respondes.";
  } else {
    // Em branco ou errada vale 0; a nota é proporcional ao número de perguntas do teste.
    const scale20 = Math.round((correctCount / total) * 20 * 100) / 100;
    const pass = scale20 >= PASS_MARK;
    $("result-scale").textContent = `${fmt2(scale20)} valores`;
    statusEl.textContent = pass ? "Acima da nota mínima" : "Abaixo da nota mínima";
    statusEl.className = "result-status " + (pass ? "pass" : "fail");
    if (free) {
      metaEl.textContent =
        `Equivalente na escala 0–20, calculado só sobre ${total === 1 ? "a pergunta respondida" : `as ${total} perguntas respondidas`}` +
        ` · Mínimo para aprovação: ${fmt2(PASS_MARK)} valores`;
    } else {
      const usedSeconds = state.mode.minutes * 60 - Math.max(0, state.secondsLeft);
      const usedH = Math.floor(usedSeconds / 3600);
      const usedM = Math.floor((usedSeconds % 3600) / 60);
      const usedText = usedH > 0 ? `${usedH}h ${usedM}min` : `${usedM}min`;
      metaEl.textContent =
        (reason === "tempo" ? "Tempo esgotado · " : "") +
        `Tempo usado: ${usedText} de ${fmtMinutes(state.mode.minutes)} · Mínimo para aprovação: ${fmt2(PASS_MARK)} valores`;
    }
  }
  if (free) {
    renderPace(Math.max(0, Math.floor((endedAt - state.startAt) / 1000)), total, skipped);
  }

  // Estatística do palpite da legislação (à parte: nunca entra na nota). No modo Livre conta
  // só nas perguntas respondidas, as mesmas que aparecem na correção.
  let guessTotal = 0;
  let guessRight = 0;
  items.forEach((it) => {
    if (!guessEnabled(it.q) || it.guess === null) return;
    guessTotal++;
    if (LEGISLACOES[it.guess] === it.q.legislacao) guessRight++;
  });
  const guessEl = $("result-guess");
  if (guessTotal > 0) {
    guessEl.hidden = false;
    guessEl.textContent = `Palpite da legislação: certo em ${guessRight}/${guessTotal} (não conta para a nota).`;
  } else {
    guessEl.hidden = true;
    guessEl.textContent = "";
  }

  const introEl = $("review-intro");
  if (!introEl.dataset.base) introEl.dataset.base = introEl.textContent;
  introEl.textContent = introEl.dataset.base +
    (free ? " No modo Livre aparecem só as perguntas que respondeste, numeradas pela ordem em que as vês aqui." : "");

  $("review-list").innerHTML = total === 0
    ? `<p class="review-empty">Não respondeste a nenhuma pergunta, por isso não há nada para rever.</p>`
    : items
    .map((it, n) => {
      const { q, given, guess: g } = it;
      const ok = given === q.correctIndex;
      const letter = (idx) => (idx === null || idx === undefined ? "—" : String.fromCharCode(65 + idx));
      let guessLine = "";
      if (guessEnabled(q)) {
        if (g === null) {
          guessLine = `<p class="review-guess none">Palpite da legislação: não fizeste palpite.</p>`;
        } else if (LEGISLACOES[g] === q.legislacao) {
          guessLine = `<p class="review-guess ok">Palpite da legislação: certo.</p>`;
        } else {
          guessLine = `<p class="review-guess bad">Palpite da legislação: errado (escolheste ${escapeHtml(legFull(g))}).</p>`;
        }
      }
      return `
      <div class="review-item">
        <div class="review-item-head">
          <span class="review-tag">${escapeHtml(legSource(q))} · ${escapeHtml(q.article)} · pág. ${escapeHtml(String(q.page))}</span>
          <span class="review-flag ${ok ? "ok" : "bad"}">${ok ? "Certo" : (given === null ? "Em branco" : "Errado")}</span>
        </div>
        <p class="review-q">${n + 1}. ${escapeHtml(q.question)}</p>
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
        ${guessLine}
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
