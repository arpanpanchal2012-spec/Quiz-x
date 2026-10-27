"use strict";
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const escapeHTML = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const e = escapeHTML;
const participantMode = location.pathname === "/join";
const independentMode = ["/play", "/invite"].includes(location.pathname);
const sound = window.QuizzesSound;
sound.configure((state) => send("set_music", state));
let multiSelection = new Set();
$("#openAppNote").hidden = window.self === window.top;
let account = null,
  setup = false,
  privateSetupRequired = false,
  quizzes = [],
  reports = [],
  draft = null,
  dirty = false,
  uploadCount = 0;
let socket = null,
  game = null,
  liveQuestion = null,
  locked = false,
  answerPending = false,
  buzzes = [],
  buzzOpen = false,
  myPlayerId = null,
  offset = 0,
  reconnectTimer = null,
  manualClose = false,
  clockSent = 0;
let currentView = "dashboard";
const resumeKey = participantMode ? "quizzes-player" : "quizzes-host";
function savedConnection() {
  try {
    return JSON.parse(sessionStorage.getItem(resumeKey));
  } catch {
    return null;
  }
}
function storeConnection(x) {
  sessionStorage.setItem(resumeKey, JSON.stringify(x));
}
function forgetConnection() {
  sessionStorage.removeItem(resumeKey);
}
let toastTimer;
function showToast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 5000);
}
async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.body && typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const value = await res.json();
  if (!res.ok) {
    if (res.status === 401 && !participantMode && url !== "/api/login") {
      account = null;
      $("#authButton").textContent = "Host sign in";
    }
    throw Object.assign(Error(value.error || "Request failed"), {
      status: res.status,
    });
  }
  return value;
}
function showView(id, force = false) {
  if (
    currentView === "editor" &&
    dirty &&
    !force &&
    id !== "editor" &&
    !confirm("Leave without saving your changes?")
  )
    return;
  currentView = id;
  document.body.classList.toggle("editor-mode", id === "editor");
  $$(".view").forEach((v) => v.classList.toggle("active-view", v.id === id));
  $$("[data-view]").forEach((n) =>
    n.classList.toggle("active", n.dataset.view === id),
  );
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$$("[data-view]").forEach((el) =>
  el.addEventListener("click", () => showView(el.dataset.view)),
);
function requireHost() {
  if (account) return true;
  openAuth();
  return false;
}
function openAuth() {
  const enabled = setup;
  $("#authTitle").textContent = enabled
    ? "Make this space yours"
    : "Welcome back";
  $("#orgField").hidden = !enabled;
  $("#organizationInput").required = enabled;
  $("#passwordInput").minLength = enabled ? 12 : 1;
  $("#passwordInput").autocomplete = enabled
    ? "new-password"
    : "current-password";
  $("#submitAuth").textContent = enabled ? "Create host account" : "Sign in";
  $("#authNote").textContent = enabled
    ? "Private preview setup: the first account becomes this workspace’s host. Use a unique password (12+ characters). Do not share this preview until setup is complete."
    : privateSetupRequired
      ? "First create your host account inside the private Quizzes Live App preview in Arena. Then return to this link and sign in with that account."
      : "Sign in to create quizzes and host your community.";
  $("#authStatus").textContent = "";
  $("#authModal").classList.add("open");
  $("#emailInput").focus();
}
$("#closeAuth").onclick = () => $("#authModal").classList.remove("open");
$("#authButton").onclick = async () => {
  if (!account) return openAuth();
  if (
    game &&
    game.status !== "ended" &&
    !confirm("Signing out disconnects you as host. Continue?")
  )
    return;
  try {
    await api("/api/logout", { method: "POST" });
    manualClose = true;
    sound.stop();
    clearHostImages();
    socket?.close();
    forgetConnection();
    game = null;
    window.Studio?.reset();
    draft = null;
    dirty = false;
    account = null;
    quizzes = [];
    reports = [];
    $("#gameModal").classList.remove("open");
    $("#returnToGame").hidden = true;
    $("#authButton").textContent = "Host sign in";
    $("#orgName").textContent = "Your organization";
    renderWorkspace();
    showView("dashboard", true);
    showToast("Signed out");
  } catch (err) {
    showToast(err.message);
  }
};
$("#authForm").onsubmit = async (event) => {
  event.preventDefault();
  $("#submitAuth").disabled = true;
  $("#authStatus").textContent = "";
  try {
    const email = $("#emailInput").value;
    const password = $("#passwordInput").value;
    if (setup) {
      await api("/api/setup", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          organization: $("#organizationInput").value,
        }),
      });
      setup = false;
    }
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    $("#passwordInput").value = "";
    await initializeHost();
    if (!account)
      throw Error(
        "Please open the live preview in a new tab to allow secure sign-in cookies.",
      );
    $("#authModal").classList.remove("open");
    showToast("Welcome to your workspace");
  } catch (err) {
    $("#authStatus").textContent = err.message;
  } finally {
    $("#submitAuth").disabled = false;
  }
};
async function loadWorkspace() {
  const ownerId = account?.id;
  const storage = await api("/api/storage-status");
  $("#storageSummary").textContent = storage.persistentCloud
    ? "PostgreSQL database and private Supabase media. Stored outside the app server."
    : "Local SQLite and media files. Use persistent cloud storage before deploying on a free host.";
  const workspaceData = await Promise.all([
    api("/api/quizzes"),
    api("/api/reports"),
  ]);
  if (account?.id !== ownerId) return;
  [quizzes, reports] = workspaceData;
  renderWorkspace();
  refreshRunningRoom();
}
// A room can outlive the browser tab it was started in. The server tells the
// owning account which rooms are still running, so a host whose laptop died can
// walk up to another machine, sign in and take their room back.
let runningRoom = null;
async function refreshRunningRoom() {
  const strip = $("#liveRoomStrip");
  if (!strip) return;
  if (!account) {
    strip.hidden = true;
    return;
  }
  try {
    const rooms = await api("/api/live/rooms");
    runningRoom = rooms[0] || null;
  } catch {
    runningRoom = null;
  }
  strip.hidden = !runningRoom;
  if (!runningRoom) return;
  const where = runningRoom.index < 0
    ? "in the lobby"
    : `at question ${runningRoom.index + 1} of ${runningRoom.total}`;
  $("#liveRoomText").textContent =
    `“${runningRoom.title}” is still running on code ${runningRoom.code} — ${where}, ${runningRoom.players} player${runningRoom.players === 1 ? "" : "s"}.`;
  $("#rejoinRoom").textContent = runningRoom.hostConnected
    ? "Open the room again"
    : "Rejoin as host";
}
function renderWorkspace() {
  $("#workspacePrivacyNotice").hidden = !account;
  document.dispatchEvent(new Event("quizzes:workspace"));
  const sessions = reports.length,
    players = reports.reduce((n, r) => n + r.players, 0),
    points = reports.reduce(
      (n, r) => n + r.leaderboard.reduce((sum, p) => sum + p.score, 0),
      0,
    );
  $("#stats").innerHTML = [
    ["▤", "Saved quizzes", quizzes.length, "purple"],
    ["◒", "Completed sessions", sessions, "blue"],
    ["♧", "Player participations", players, "yellow"],
    ["✦", "Community points", points, "green"],
  ]
    .map(
      ([icon, label, n, color]) =>
        `<div class="stat-card"><div class="stat-icon ${color}">${icon}</div><span class="stat-label">${label}</span><b>${n.toLocaleString()}</b><small class="muted">${account ? "From your saved workspace" : "Sign in to see your data"}</small></div>`,
    )
    .join("");
  $("#recentQuizzes").innerHTML = quizzes.length
    ? quizzes
        .slice(0, 3)
        .map(
          (q) =>
            `<div class="quiz-row"><div class="quiz-thumb violet">✦</div><div class="quiz-info"><b>${e(q.title)}</b><span>${summary(q)}</span></div><button class="text-btn" data-launch="${q.id}">Host ↗</button></div>`,
        )
        .join("")
    : `<div class="empty-state">${account ? "Your first quiz starts here." : "Your private workspace is one sign-in away."}</div>`;
  $("#library").innerHTML =
    `<button class="create-tile" data-new><span class="new-plus">＋</span><b>Start a new quiz</b><span>Make it your own</span></button>` +
    quizzes
      .map(
        (q) =>
          `<article class="library-card"><div class="quiz-thumb violet">✦</div><b>${e(q.title)}</b><span>${summary(q)}</span><p class="muted quiz-description">${e(q.description || "A new moment for your community.")}</p><div class="button-row"><button class="primary-btn" data-launch="${q.id}">Host game ↗</button><button class="secondary-btn" data-publish="${q.id}">Assign quiz</button><button class="secondary-btn" data-edit="${q.id}">Edit</button><button class="secondary-btn" data-rehearse="${q.id}">Preview &amp; test</button><button class="text-btn" data-quiz-download="${q.id}" title="Save this quiz as a file that can be opened in another account">Download</button><button class="text-btn" data-delete="${q.id}" aria-label="Delete ${e(q.title)}">Delete</button></div></article>`,
      )
      .join("");
  $("#clearReports").disabled = !account || !reports.length;
  $("#reportList").innerHTML = reports.length
    ? reports
        .map(
          (r) =>
            `<details class="panel report-detail"><summary><div><b>${e(r.title)}</b><p class="muted">${e(new Date(r.ended).toLocaleString())} · ${r.players} players · ${r.questionsPlayed}/${r.questionCount} questions</p></div><span class="pill">VIEW RESULTS ↓</span></summary><p class="muted">${e(r.reason)} · Code ${e(r.code)}</p>${leaderboardHTML(r.leaderboard)}<button class="outline-btn" data-export="${r.id}">Download CSV</button> <button class="text-btn" data-delete-report="${r.id}">Delete report</button></details>`,
        )
        .join("")
    : `<div class="panel empty-state"><h2>Every gathering has a story.</h2><p>${account ? "No saved reports. Completed live games appear here." : "Sign in to see your organization’s reports."}</p></div>`;
  $("#organizationSetting").textContent = account
    ? `${account.organization} · ${account.email}`
    : "Sign in to manage your workspace.";
}
function summary(q) {
  return `${q.rounds.length} round${q.rounds.length === 1 ? "" : "s"} · ${q.rounds.reduce((n, r) => n + r.questions.length, 0)} questions`;
}
function leaderboardHTML(rows) {
  return rows.length
    ? `<ol class="leaderboard">${rows.map((p) => `<li><b class="rank">${p.rank}</b><span>${e(p.name)}</span><strong>${p.score.toLocaleString()} <small>pts</small></strong></li>`).join("")}</ol>`
    : '<p class="muted">No participants in this session.</p>';
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.hasAttribute("data-new")) {
    if (requireHost()) newQuiz();
  }
  if (button.dataset.edit) {
    editQuiz(quizzes.find((q) => q.id === button.dataset.edit));
  }
  if (button.dataset.launch) {
    if (requireHost()) launchQuiz(button.dataset.launch);
  }
  if (button.dataset.quizDownload) downloadQuizFile(button.dataset.quizDownload);
  if (
    button.dataset.delete &&
    confirm("Delete this quiz? Completed reports will be kept.")
  ) {
    try {
      await api("/api/quizzes/" + button.dataset.delete, { method: "DELETE" });
      await loadWorkspace();
      showToast("Quiz deleted");
    } catch (err) {
      showToast(err.message);
    }
  }
  if (
    button.dataset.deleteReport &&
    confirm(
      "Permanently delete this saved report? This cannot be undone. Your saved quiz is kept; existing backup files are not changed.",
    )
  ) {
    try {
      await api("/api/reports/" + button.dataset.deleteReport, {
        method: "DELETE",
      });
      await loadWorkspace();
      showToast("Report deleted");
    } catch (err) {
      showToast(err.message);
    }
  }
  if (button.dataset.export)
    exportReport(reports.find((r) => r.id === button.dataset.export));
});
$("#launchBtn").onclick = () => {
  if (requireHost()) showView("quizzes");
};
$("#clearReports").onclick = async () => {
  if (
    !requireHost() ||
    !confirm(
      "Permanently delete ALL saved live reports in your workspace? This cannot be undone. Saved quizzes, self-paced publications and existing backups are kept.",
    )
  )
    return;
  try {
    await api("/api/reports", { method: "DELETE" });
    await loadWorkspace();
    showToast("Saved live reports deleted");
  } catch (err) {
    showToast(err.message);
  }
};
$("#refreshReports").onclick = async () => {
  if (!requireHost()) return;
  try {
    await loadWorkspace();
    showToast("Reports refreshed");
  } catch (err) {
    showToast(err.message);
  }
};
function exportReport(r) {
  const quote = (value) =>
    '"' +
    String(value)
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  const rows = [
    ["Quiz", "Ended", "Rank", "Nickname", "Score"],
    ...r.leaderboard.map((p) => [
      r.title,
      new Date(r.ended).toISOString(),
      p.rank,
      p.name,
      p.score,
    ]),
  ];
  const blob = new Blob(
    ["\ufeff" + rows.map((row) => row.map(quote).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quizzes-${r.code}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function blankQuestion(seconds) {
  return {
    type: "choice",
    text: "",
    options: ["", "", "", ""],
    correct: 0,
    accepted: [""],
    seconds: Number(seconds) || 20,
    points: 1000,
    media: "",
    mediaType: "",
  };
}
function newQuiz() {
  if (
    dirty &&
    currentView === "editor" &&
    !confirm("Discard your unsaved quiz?")
  )
    return;
  draft = {
    title: "",
    description: "",
    music: "",
    rounds: [{ title: "Round 1", questions: [blankQuestion()] }],
  };
  openEditor();
}
function editQuiz(q) {
  if (!requireHost() || !q) return;
  draft = structuredClone(q);
  openEditor();
}
function oversightQuizPath(q = draft) {
  return (
    "/api/oversight/workspaces/" +
    encodeURIComponent(q._oversightOwner) +
    "/quizzes/" +
    encodeURIComponent(q.id)
  );
}
function openEditor() {
  const oversight = !!draft._oversightOwner;
  $("#lastAdminEdit").hidden = !draft._lastAdminEdit;
  $("#lastAdminEdit").textContent = draft._lastAdminEdit
    ? `Last administrator edit: ${draft._lastAdminEdit.email} · ${new Date(draft._lastAdminEdit.at).toLocaleString()}`
    : "";
  $("#oversightEditorNotice").hidden = !oversight;
  $("#oversightEditorLabel").textContent = oversight
    ? "ADMIN EDITING · " +
      draft._oversightLabel +
      " — Save quiz changes their original. New uploads belong to this workspace. Your recovery draft stays private to your admin account."
    : "";
  $("#saveDraftCopy").disabled = oversight;
  $("#editorSaveDescription").textContent = oversight
    ? "You are editing another workspace's saved quiz. Published assignments and active rooms stay unchanged."
    : "Saved to your organization’s database when you select Save.";
  activeEditorQuestion = draft.rounds[0]?.questions[0];
  $("#quizSettings").open = !draft.id;
  dirty = false;
  const report = draft._importReport;
  $("#importReview").hidden = !report;
  $("#importReviewed").disabled = !report;
  $("#importReviewed").required = !!report;
  $("#importReviewed").checked = false;
  if (report) {
    $("#importSummary").textContent =
      `${report.recognized} questions extracted · ${report.needsAnswers} need a correct answer. Review all questions before saving.`;
    $("#importWarnings").innerHTML = report.warnings
      .map((w) => `<li>${e(w)}</li>`)
      .join("");
    $("#importSource").textContent = report.sourceText;
  }
  $("#editorHeading").textContent = oversight
    ? "Admin · Full Quiz Studio"
    : draft.id
      ? "Edit your quiz"
      : "Create your quiz";
  $("#quizTitle").value = draft.title;
  $("#quizDescription").value = draft.description;
  $("#saveStatus").textContent = "";
  renderEditor();
  showView("editor", true);
  window.Studio?.opened();
}
function mediaHTML(url, type, lazy = false) {
  if (!url) return "";
  return type?.startsWith("image/")
    ? `<img class="question-media" ${lazy ? 'loading="lazy"' : 'loading="eager" fetchpriority="high"'} decoding="async" src="${e(url)}" alt="Question image">`
    : `<audio controls preload="metadata" src="${e(url)}" class="question-audio"></audio>`;
}
// Who each player is. They pick a character and an accessory when they join;
// characters.js draws both from plain SVG, so the same player looks the same on
// their phone at every stage of the night — and nothing is downloaded.
// The face never appears on the host screen or the projector: those show names
// and numbers only, so the room watches the quiz, not a wall of cartoons.
const KCHARS = window.QuizzesCharacters || null;
// A look is either one of the nineteen picture characters or one of the drawn
// ones. A picture carries the `photo:` prefix, so one call site serves both: the
// holder gets the same class in both cases and only the contents differ.
function isPhotoLook(id) {
  return !!KCHARS?.isPhoto?.(id);
}
// A player who put their own face on a character. The figure was composited on
// their phone and lives in the room, so every screen loads it as one small
// image — and falls back to a drawing if the room has gone.
function isSelfLook(id) {
  return typeof id === "string" && id.startsWith("self:");
}
function selfLookSrc(player) {
  const id = String(player?.character || "").slice(5);
  return `/live-avatar/${encodeURIComponent(game?.code || "")}/${encodeURIComponent(id)}.webp?r=${Number(player?.faceRev) || 0}`;
}
function figureHTML(player, options = {}) {
  if (!KCHARS) return "";
  if (isSelfLook(player?.character))
    return `<img class="kchar kchar-self" src="${selfLookSrc(player)}" alt="${options.label === false ? "" : "Your character"}" width="240" height="400" decoding="async" draggable="false" />`;
  return KCHARS.render(player?.character, player?.accessory, {
    thumb: !!options.thumb,
    label: options.label !== false,
  });
}
function characterSVG(player, className = "", options = {}) {
  if (!KCHARS) return "";
  const photo = isPhotoLook(player?.character) ? " is-photo" : "";
  return `<span class="kchar-holder ${className}${photo}">${figureHTML(player, { ...options, label: options.label !== false })}</span>`;
}
// The room can forget a face (a restart, or the player changing it). The slot
// then shows that player's drawn character rather than a broken image.
document.addEventListener(
  "error",
  (event) => {
    const img = event.target;
    if (!img || img.tagName !== "IMG" || !img.classList.contains("kchar-self")) return;
    const holder = img.closest(".kchar-holder") || img.parentElement;
    if (!holder || !KCHARS) return;
    holder.innerHTML = KCHARS.render(KCHARS.CHARACTER_IDS[0], "none");
    holder.classList.remove("is-self");
  },
  true,
);
// A tiny copy for headers and lists on the player's own phone. The header chip
// loads the 176 px sprite, not the full one.
function characterChip(player, className = "kchar-chip") {
  return characterSVG(player, className, { thumb: true });
}
let activeEditorQuestion = null;
// One clock per round. A round almost always wants the same time on every
// question, so the choice is made once here and written into each question —
// no schema change, and any single question can still be an exception.
const ROUND_TIMES = [10, 15, 20, 30, 35, 40, 45, 60, 90, 120];
function roundSeconds(round) {
  const values = new Set(round.questions.map((q) => Number(q.seconds)));
  return values.size === 1 ? [...values][0] : null;
}
function roundTimeControl(ri, round) {
  const shared = roundSeconds(round);
  const count = round.questions.length;
  return `<div class="round-time"><span class="round-time-label">Time for every question</span><select data-round-seconds="${ri}" aria-label="Time for every question in round ${ri + 1}"><option value="" ${shared === null ? "selected" : ""}>${shared === null ? "Mixed — choose a time" : "Mixed times"}</option>${ROUND_TIMES.map((v) => `<option value="${v}" ${shared === v ? "selected" : ""}>${v} seconds</option>`).join("")}</select><button type="button" class="text-btn" data-round-time-all="${ri}" title="Use this round's time in every round">Use in all rounds</button></div>`;
}
// Every round in one list, so a quiz can be timed round by round without
// hunting through the questions. It reads and writes the same per-question
// `seconds` as the control inside each round heading.
function roundTimesHTML() {
  if (!draft?.rounds.length) return "";
  const total = draft.rounds.reduce(
    (sum, r) => sum + r.questions.reduce((n, q) => n + (Number(q.seconds) || 0), 0),
    0,
  );
  const readout = $("#roundTimesSummary");
  if (readout)
    readout.textContent = `· ${draft.rounds.length} round${
      draft.rounds.length === 1 ? "" : "s"
    }, ${formatDuration(total)} in total`;
  return (
    draft.rounds
      .map((r, ri) => {
        const shared = roundSeconds(r);
        const count = r.questions.length;
        return `<div class="round-time-row">
          <span class="round-time-name"><b>${ri + 1}</b>${e(roundTitle(ri, r.title))}</span>
          <span class="round-time-count muted">${count} question${count === 1 ? "" : "s"}</span>
          <select data-round-seconds="${ri}" aria-label="Time for every question in ${e(roundTitle(ri, r.title))}">
            <option value="" ${shared === null ? "selected" : ""}>${shared === null ? "Mixed times" : "Mixed — choose a time"}</option>
            ${ROUND_TIMES.map((v) => `<option value="${v}" ${shared === v ? "selected" : ""}>${v} seconds</option>`).join("")}
          </select>
        </div>`;
      })
      .join("") +
    `<div class="round-time-row is-all">
      <span class="round-time-name">Every round</span>
      <span class="round-time-count muted">sets all ${draft.rounds.reduce((n, r) => n + r.questions.length, 0)} questions</span>
      <select data-all-round-seconds aria-label="One time for every question in the quiz">
        <option value="">Same time everywhere…</option>
        ${ROUND_TIMES.map((v) => `<option value="${v}">${v} seconds</option>`).join("")}
      </select>
    </div>`
  );
}
function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60),
    rest = total % 60;
  if (!minutes) return `${rest} second${rest === 1 ? "" : "s"}`;
  if (!rest) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `${minutes} min ${rest} s`;
}
function renderRoundTimes() {
  const box = $("#roundTimes");
  if (!box) return;
  box.innerHTML = roundTimesHTML();
}
function applyRoundTime(ri, value) {
  collectDraft();
  const round = draft.rounds[ri];
  const seconds = Number(value);
  if (!round || !ROUND_TIMES.includes(seconds)) return;
  for (const q of round.questions) q.seconds = seconds;
  round.seconds = seconds;
  dirty = true;
  renderEditor();
  showToast(
    `${roundTitle(ri, round.title)} · all ${round.questions.length} question${round.questions.length === 1 ? "" : "s"} set to ${seconds} seconds.`,
  );
}
function applyTimeToAllRounds(ri) {
  collectDraft();
  const round = draft.rounds[ri];
  const seconds = roundSeconds(round) || Number(round?.seconds);
  if (!seconds) return showToast("Choose a time for this round first.");
  let count = 0;
  for (const r of draft.rounds) {
    r.seconds = seconds;
    for (const q of r.questions) {
      q.seconds = seconds;
      count++;
    }
  }
  dirty = true;
  renderEditor();
  showToast(`Every question in the quiz is now ${seconds} seconds.`);
}
function renderEditor() {
  renderRoundTimes();
  $("#bulkRound").innerHTML =
    draft.rounds
      .map(
        (r, i) => `<option value="${i}">${e(roundTitle(i, r.title))}</option>`,
      )
      .join("") + '<option value="new">＋ New round</option>';
  $("#musicPreview").innerHTML = draft.music
    ? `<audio controls preload="metadata" src="${e(draft.music)}"></audio>`
    : '<span class="muted">♬ Original Quizzes soundtrack · plays by default</span>';
  $("#roundEditor").innerHTML = draft.rounds
    .map(
      (r, ri) =>
        `<section class="round-section" data-round="${ri}"><div class="round-heading"><span class="round-number">${String(ri + 1).padStart(2, "0")}</span><label>Round name · optional<input class="round-title" value="${e(r.title)}" maxlength="100" placeholder="e.g. Easy — leave blank for Round ${ri + 1}"></label>${roundTimeControl(ri, r)}<button type="button" class="text-btn" data-remove-round="${ri}">Remove round</button></div>${r.questions.map((q, qi) => `<article class="panel question-card" data-ri="${ri}" data-qi="${qi}"><div class="question-card-head"><label class="select-question"><input type="checkbox" class="question-select"> Select Q${qi + 1}</label><label class="assign-label">Round<select data-assign-round>${draft.rounds.map((round, index) => `<option value="${index}" ${index === ri ? "selected" : ""}>${e(roundTitle(index, round.title))}</option>`).join("")}<option value="new">＋ New round</option></select></label><div class="button-row"><button type="button" class="text-btn" data-move="-1" ${qi === 0 ? "disabled" : ""}>↑ Move up</button><button type="button" class="text-btn" data-move="1" ${qi === r.questions.length - 1 ? "disabled" : ""}>↓ Move down</button><button type="button" class="text-btn" data-remove-question>Remove</button></div></div><div class="editor-columns"><div><label>Question<input data-field="text" value="${e(q.text)}" maxlength="1000" required placeholder="What would you like to ask?"></label><div class="editor-grid"><label>Answer type<select data-field="type"><option value="choice" ${q.type === "choice" ? "selected" : ""}>Multiple choice</option><option value="multi" ${q.type === "multi" ? "selected" : ""}>Multiple correct answers</option><option value="boolean" ${q.type === "boolean" ? "selected" : ""}>True / false</option><option value="text" ${q.type === "text" ? "selected" : ""}>Fill in the blank</option><option value="buzzer" ${q.type === "buzzer" ? "selected" : ""}>Buzzer · music identification</option></select></label><label>${q.type === "buzzer" ? "Scoring window · seconds · earlier buzzers score more" : "Time · seconds"}<input type="number" data-field="seconds" min="5" max="120" value="${q.seconds}" required></label><label>Maximum points<input type="number" data-field="points" min="100" max="5000" value="${q.points}" required></label></div>${q.type === "buzzer" ? `<label>Expected answer · one per line<textarea data-field="accepted" required placeholder="Tum Hi Ho\nChaiyya Chaiyya">${e((q.accepted || []).join("\n"))}</textarea></label><div class="editor-grid"><label>Wrong buzz penalty<select data-field="buzzPenalty">${[0, 25, 50, 100].map((v) => `<option value="${v}" ${Number(q.buzzPenalty) === v ? "selected" : ""}>${v === 0 ? "No penalty" : `Lose ${v}% of this question’s points`}</option>`).join("")}</select></label></div><p class="muted"><b>Buzzer round:</b> attach the music clip, then the host plays it over the sound system. Players press <b>Buzz</b> on their phones and their names appear on the host screen fastest first. The host asks each player in turn and taps Correct or Wrong. A wrong answer can cost the player a share of this question’s points if you set a penalty above. Only you see this answer; in an assigned quiz it becomes a type-the-answer question and no penalty applies.</p><p class="muted">Add spelling alternatives on separate lines. Ignores capitalization and extra spaces.</p>` : q.type === "text" ? `<label>Accepted answers · one per line<textarea data-field="accepted" required placeholder="stronger\nbetter together">${e((q.accepted || []).join("\n"))}</textarea></label><p class="muted">Ignores capitalization and extra spaces. Add spelling alternatives explicitly.</p>` : q.type === "boolean" ? `<label>Correct answer<select data-field="correct" required><option value="" ${q.correct < 0 ? "selected" : ""}>Select correct answer</option><option value="0" ${q.correct === 0 ? "selected" : ""}>True</option><option value="1" ${q.correct === 1 ? "selected" : ""}>False</option></select></label>` : `<label>Answer choices · one per line (2–6)<textarea data-field="options" rows="4" required>${e((q.options || []).join("\n"))}</textarea></label>${q.type === "multi" ? `<fieldset class="multi-correct"><legend>Correct answers · select all that apply</legend>${(q.options || []).map((option, i) => `<label><input type="checkbox" data-correct-index="${i}" ${(q.correctAnswers || []).includes(i) ? "checked" : ""}> ${e(option || `Option ${i + 1}`)}</label>`).join("")}</fieldset><p class="muted">Partial credit: correct fraction minus wrong fraction, minimum zero.</p>` : `<label>Correct choice number (1 is the first line)<input type="number" data-field="correctChoice" min="1" max="6" required value="${Number(q.correct) >= 0 ? Number(q.correct) + 1 : ""}"></label>`}`}</div><div class="media-editor"><label>Question image or audio · optional<input type="file" class="question-file" accept="image/png,image/jpeg,image/gif,image/webp,audio/mpeg,audio/wav,audio/ogg"></label><p class="muted">PNG, JPEG, GIF, WebP, MP3, WAV, OGG · up to 10 MB</p><div class="media-preview">${mediaHTML(q.media, q.mediaType, true)}</div>${q.media ? '<button class="text-btn" type="button" data-remove-media>Remove media</button>' : '<div class="media-placeholder">A picture, a sound, a new way to ask.</div>'}</div></div></article>`).join("")}<button type="button" class="outline-btn" data-add-question="${ri}">＋ Add question</button></section>`,
    )
    .join("");
  buildStudio();
}
function showStudioSelection() {
  for (const section of $$("#roundEditor .round-section")) {
    const ri = Number(section.dataset.round);
    section.hidden = !draft.rounds[ri].questions.includes(activeEditorQuestion);
    for (const card of $$(".question-card", section))
      card.hidden =
        draft.rounds[ri].questions[Number(card.dataset.qi)] !==
        activeEditorQuestion;
  }
  for (const button of $$("[data-studio-question]")) {
    const [ri, qi] = button.dataset.studioQuestion.split(":").map(Number);
    const selected = draft.rounds[ri].questions[qi] === activeEditorQuestion;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-current", String(selected));
  }
}
function buildStudio() {
  const all = draft.rounds.flatMap((r) => r.questions);
  if (!all.includes(activeEditorQuestion)) activeEditorQuestion = all[0];
  $("#studioCount").textContent = all.length;
  let count = 0;
  $("#questionNavigator").innerHTML = draft.rounds
    .map(
      (r, ri) =>
        `<div class="rail-round">${e(roundTitle(ri, r.title))}</div>${r.questions.map((q, qi) => `<div class="question-thumb" data-key="${ri}:${qi}"><input type="checkbox" data-studio-select="${ri}:${qi}" aria-label="Select question ${++count} for moving"><button type="button" data-studio-question="${ri}:${qi}"><span class="thumb-grip" aria-hidden="true">⠿</span><span class="thumb-meta">${count}. ${q.type === "buzzer" ? "Buzzer" : q.type === "multi" ? "Multiple answers" : q.type === "text" ? "Type an answer" : "Quiz"}</span><span class="thumb-title">${e(q.text || "Your next question")}</span><span class="thumb-preview">${q.media && q.mediaType?.startsWith("image/") ? `<img loading="lazy" src="${e(q.media)}" alt="">` : '<span aria-hidden="true">✦</span>'}</span><span class="thumb-answers"><i></i><i></i><i></i><i></i></span></button></div>`).join("")}`,
    )
    .join("");
  for (const card of $$("#roundEditor .question-card")) {
    const q = draft.rounds[card.dataset.ri].questions[card.dataset.qi];
    const columns = $(".editor-columns", card),
      main = columns.firstElementChild;
    const questionLabel = main.firstElementChild,
      media = $(".media-editor", card),
      head = $(".question-card-head", card);
    const canvas = document.createElement("div");
    canvas.className = "studio-canvas";
    const promptInput = $("[data-field=text]", questionLabel);
    const prompt = document.createElement("textarea");
    for (const attr of promptInput.attributes)
      prompt.setAttribute(attr.name, attr.value);
    prompt.rows = 2;
    prompt.value = q.text;
    prompt.removeAttribute("value");
    promptInput.replaceWith(prompt);
    questionLabel.classList.add("studio-prompt");
    canvas.append(questionLabel, media);
    const tiles = document.createElement("div");
    tiles.className = "studio-answer-tiles";
    if (q.type === "text" || q.type === "buzzer") {
      const accepted = $("[data-field=accepted]", main).closest("label");
      accepted.classList.add("studio-text-answer");
      canvas.append(accepted);
    } else {
      tiles.innerHTML = q.options
        .map(
          (option, i) =>
            `<div class="studio-answer tile-${i}"><span class="studio-shape" aria-hidden="true">${["▲", "◆", "●", "■", "⬟", "★"][i]}</span><textarea aria-label="Answer ${i + 1}" data-studio-option="${i}" rows="2" maxlength="500" ${q.type === "boolean" ? "readonly" : ""} placeholder="Add answer ${i + 1}">${e(option)}</textarea><button type="button" class="correct-toggle" data-studio-correct="${i}" aria-label="Mark answer ${i + 1} correct" aria-pressed="${q.type === "multi" ? (q.correctAnswers || []).includes(i) : q.correct === i}">${q.type === "multi" ? ((q.correctAnswers || []).includes(i) ? "✓" : "") : q.correct === i ? "✓" : ""}</button>${q.type !== "boolean" && q.options.length > 2 ? `<button type="button" class="remove-option" data-studio-remove-option="${i}" aria-label="Remove answer ${i + 1}">×</button>` : ""}</div>`,
        )
        .join("");
      canvas.append(tiles);
      const tip = document.createElement("p");
      tip.className = "studio-answer-tip";
      tip.textContent =
        q.type === "multi"
          ? "Select every correct answer using the circles. Partial credit applies."
          : "Select the circle beside the correct answer.";
      canvas.append(tip);
      if (["choice", "multi"].includes(q.type) && q.options.length < 6) {
        const add = document.createElement("button");
        add.type = "button";
        add.className = "secondary-btn add-answer";
        add.dataset.studioAddOption = "";
        add.textContent = "＋ Add answer";
        canvas.append(add);
      }
    }
    const settings = document.createElement("aside");
    settings.className = "studio-properties";
    settings.innerHTML =
      '<div class="eyebrow">QUESTION SETTINGS</div><h3>Make it your own</h3>';
    settings.append($(".editor-grid", main));
    const details = document.createElement("details");
    details.className = "studio-key";
    details.innerHTML = "<summary>Answer key & bulk editing</summary>";
    while (main.firstChild) details.append(main.firstChild);
    settings.append(details, head);
    const duplicate = document.createElement("button");
    duplicate.type = "button";
    duplicate.className = "secondary-btn";
    duplicate.dataset.duplicateQuestion = "";
    duplicate.textContent = "Duplicate question";
    settings.append(duplicate);
    const notesLabel = document.createElement("label");
    notesLabel.className = "studio-notes";
    notesLabel.innerHTML = `<span>Private host notes</span><textarea data-field="notes" rows="4" maxlength="1000" placeholder="Reminders for you, never shown to players">${e(q.notes || "")}</textarea><small>Private during live play; never shown to participants or the projector.</small>`;
    settings.append(notesLabel);
    columns.replaceWith(canvas, settings);
  }
  showStudioSelection();
  if (dirty) window.Studio?.changed();
}
$("#questionNavigator").onclick = (event) => {
  const b = event.target.closest("[data-studio-question]");
  if (!b) return;
  collectDraft();
  const [ri, qi] = b.dataset.studioQuestion.split(":").map(Number);
  activeEditorQuestion = draft.rounds[ri].questions[qi];
  showStudioSelection();
};
$("#questionNavigator").onchange = (event) => {
  const input = event.target.closest("[data-studio-select]");
  if (!input) return;
  const [ri, qi] = input.dataset.studioSelect.split(":");
  $(
    `.question-card[data-ri="${ri}"][data-qi="${qi}"] .question-select`,
  ).checked = input.checked;
};
$("#studioAddQuestion").onclick = () => {
  const ri = Math.max(
    0,
    draft.rounds.findIndex((r) => r.questions.includes(activeEditorQuestion)),
  );
  $(`#roundEditor [data-add-question="${ri}"]`).click();
};
$("#roundEditor").addEventListener("input", (event) => {
  if (event.target.matches("[data-studio-option]")) {
    const card = event.target.closest(".question-card");
    const input = $("[data-field=options]", card);
    if (input)
      input.value = $$("[data-studio-option]", card)
        .map((el) => el.value.replace(/\n/g, " "))
        .join("\n");
  }
  if (event.target.matches("[data-field=text]")) {
    const card = event.target.closest(".question-card");
    const title = $(
      `[data-studio-question="${card.dataset.ri}:${card.dataset.qi}"] .thumb-title`,
    );
    if (title) title.textContent = event.target.value || "Your next question";
  }
});
function collectDraft() {
  if (!draft) return;
  draft.title = $("#quizTitle").value;
  draft.description = $("#quizDescription").value;
  $$(".round-section").forEach((section) => {
    const r = draft.rounds[Number(section.dataset.round)];
    r.title = $(".round-title", section).value;
    $$(".question-card", section).forEach((card) => {
      const q = r.questions[Number(card.dataset.qi)];
      $$("[data-field]", card).forEach((input) => {
        const f = input.dataset.field;
        if (["options", "accepted"].includes(f))
          q[f] = input.value.split("\n").map((x) => x.trim());
        else if (f === "correctChoice")
          q.correct = input.value === "" ? -1 : Number(input.value) - 1;
        else if (f === "correct")
          q.correct = input.value === "" ? -1 : Number(input.value);
        else
          q[f] = ["seconds", "points", "correct", "buzzPenalty"].includes(f)
            ? Number(input.value)
            : input.value;
      });
      if (q.type === "multi")
        q.correctAnswers = $$("[data-correct-index]:checked", card).map(
          (input) => Number(input.dataset.correctIndex),
        );
    });
  });
}
$("#editorForm").addEventListener("input", () => (dirty = true));
$("#roundEditor").addEventListener("change", (event) => {
  if (event.target.matches("[data-round-seconds]")) {
    if (event.target.value === "") return;
    return applyRoundTime(Number(event.target.dataset.roundSeconds), event.target.value);
  }
  if (event.target.classList.contains("round-title")) {
    collectDraft();
    $$("#bulkRound option, [data-assign-round] option").forEach((option) => {
      if (option.value !== "new")
        option.textContent = roundTitle(
          Number(option.value),
          draft.rounds[Number(option.value)]?.title,
        );
    });
  }
  if (event.target.matches("[data-assign-round]")) {
    const card = event.target.closest(".question-card");
    moveQuestions(
      [{ ri: Number(card.dataset.ri), qi: Number(card.dataset.qi) }],
      event.target.value,
    );
    return;
  }
  if (event.target.dataset.field === "options") {
    collectDraft();
    const card = event.target.closest(".question-card");
    renderEditor();
  }
  if (event.target.dataset.field === "type") {
    collectDraft();
    const card = event.target.closest(".question-card");
    const q = draft.rounds[card.dataset.ri].questions[card.dataset.qi];
    q.options =
      q.type === "boolean"
        ? ["True", "False"]
        : q.options?.length >= 2
          ? q.options
          : ["", "", "", ""];
    q.correctAnswers = q.correctAnswers || [Math.max(0, q.correct || 0)];
    q.correct = 0;
    q.accepted = q.accepted || [""];
    renderEditor();
  }
  if (event.target.classList.contains("question-file"))
    uploadQuestion(event.target);
});
$("#roundEditor").addEventListener("click", (event) => {
  const b = event.target.closest("button");
  if (!b) return;
  collectDraft();
  const card = b.closest(".question-card");
  const ri = Number(card?.dataset.ri),
    qi = Number(card?.dataset.qi);
  if (b.hasAttribute("data-add-question")) {
    if (draft.rounds.flatMap((r) => r.questions).length >= 200)
      return showToast("Maximum 200 questions.");
    const round = draft.rounds[Number(b.dataset.addQuestion)];
    // A new question arrives already on the round's clock.
    activeEditorQuestion = blankQuestion(
      roundSeconds(round) || Number(round?.seconds) || 20,
    );
    round.questions.push(activeEditorQuestion);
  } else if (b.hasAttribute("data-studio-correct")) {
    const q = draft.rounds[ri].questions[qi],
      index = Number(b.dataset.studioCorrect);
    if (q.type === "multi") {
      const keys = new Set(q.correctAnswers || []);
      if (keys.has(index)) keys.delete(index);
      else keys.add(index);
      q.correctAnswers = [...keys].sort((a, b) => a - b);
    } else q.correct = index;
  } else if (b.hasAttribute("data-duplicate-question")) {
    if (draft.rounds.flatMap((r) => r.questions).length >= 200)
      return showToast("Maximum 200 questions.");
    activeEditorQuestion = structuredClone(draft.rounds[ri].questions[qi]);
    draft.rounds[ri].questions.splice(qi + 1, 0, activeEditorQuestion);
  } else if (b.hasAttribute("data-studio-add-option")) {
    const q = draft.rounds[ri].questions[qi];
    if (q.options.length >= 6) return;
    q.options.push("");
  } else if (b.hasAttribute("data-studio-remove-option")) {
    const q = draft.rounds[ri].questions[qi],
      i = Number(b.dataset.studioRemoveOption);
    if (q.options.length <= 2) return;
    q.options.splice(i, 1);
    q.correct =
      q.correct === i ? -1 : q.correct > i ? q.correct - 1 : q.correct;
    q.correctAnswers = (q.correctAnswers || [])
      .filter((k) => k !== i)
      .map((k) => (k > i ? k - 1 : k));
  } else if (b.hasAttribute("data-round-time-all")) {
    applyTimeToAllRounds(Number(b.dataset.roundTimeAll));
    return;
  } else if (b.hasAttribute("data-remove-round")) {
    if (draft.rounds.length === 1) return showToast("Keep at least one round.");
    if (!confirm("Remove this round and its questions?")) return;
    draft.rounds.splice(Number(b.dataset.removeRound), 1);
  } else if (b.hasAttribute("data-remove-question")) {
    if (draft.rounds[ri].questions.length === 1)
      return showToast("Each round needs at least one question.");
    draft.rounds[ri].questions.splice(qi, 1);
  } else if (b.hasAttribute("data-move")) {
    const qs = draft.rounds[ri].questions,
      to = qi + Number(b.dataset.move);
    if (to < 0 || to >= qs.length) return;
    const [moved] = qs.splice(qi, 1);
    qs.splice(to, 0, moved);
    activeEditorQuestion = moved;
  } else if (b.hasAttribute("data-remove-media")) {
    draft.rounds[ri].questions[qi].media = "";
    draft.rounds[ri].questions[qi].mediaType = "";
  } else return;
  dirty = true;
  renderEditor();
});
$("#addRound").onclick = () => {
  collectDraft();
  if (draft.rounds.length >= 20) return showToast("Maximum 20 rounds.");
  draft.rounds.push({
    title: `Round ${draft.rounds.length + 1}`,
    questions: [blankQuestion()],
  });
  activeEditorQuestion = draft.rounds.at(-1).questions[0];
  dirty = true;
  renderEditor();
};
$("#openQuizSettings").onclick = () => {
  $("#quizSettings").open = !$("#quizSettings").open;
  if ($("#quizSettings").open) window.scrollTo({ top: 0, behavior: "smooth" });
};
$("#quizSettings").ontoggle = () =>
  $("#openQuizSettings").setAttribute(
    "aria-expanded",
    String($("#quizSettings").open),
  );
$("#cancelEdit").onclick = () => showView("quizzes");
$("#removeMusic").onclick = () => {
  collectDraft();
  draft.music = "";
  dirty = true;
  renderEditor();
};
// Every participant phone downloads each quiz image when its question starts.
// A single 8 MB camera photo becomes ~800 MB of egress for 100 phones, which is
// the usual reason pictures appear seconds late on a free container. Raster
// photos/diagrams are re-encoded smaller in the browser before upload; GIF and
// SVG are left alone (animation/vector), and the original is kept whenever
// re-encoding would not actually save anything.
const IMAGE_MAX_EDGE = 1600;
const IMAGE_MIN_BYTES = 400 * 1024;
const AUDIO_WARN_BYTES = 3 * 1024 * 1024;
function readableSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
async function decodeImage(file) {
  if (typeof createImageBitmap === "function")
    return await createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(Error("Unreadable image"));
      image.src = url;
    });
    return image;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
async function canvasBlob(canvas, type, quality) {
  if (typeof canvas.toBlob !== "function") return null;
  return await new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob || null), type, quality);
    } catch {
      resolve(null);
    }
  });
}
async function optimizeImage(file) {
  if (file.size <= IMAGE_MIN_BYTES) return file;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const source = await decodeImage(file);
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  if (!width || !height) return file;
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(source, 0, 0, w, h);
  source.close?.();
  let blob = await canvasBlob(canvas, "image/webp", 0.82);
  let type = "image/webp";
  if (!blob || !blob.size) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    blob = await canvasBlob(canvas, "image/jpeg", 0.82);
    type = "image/jpeg";
  }
  if (!blob || !blob.size || blob.size >= file.size) return file;
  const base = String(file.name || "image").replace(/\.[^.]+$/, "");
  const name = `${base}.${type === "image/webp" ? "webp" : "jpg"}`;
  return new File([blob], name, { type });
}
// Surfaces the size saving on the toast that replaces this one, so the host
// still sees why a 6 MB photo no longer reaches 100 phones.
let lastUploadNote = "";
async function upload(file) {
  lastUploadNote = "";
  if (file.size > 10 * 1024 * 1024)
    throw Error("Please choose a file smaller than 10 MB.");
  let chosen = file;
  if (/^image\//.test(file.type))
    try {
      chosen = await optimizeImage(file);
    } catch {
      chosen = file;
    }
  if (chosen !== file)
    lastUploadNote = `Image optimized for large rooms: ${readableSize(
      file.size,
    )} → ${readableSize(chosen.size)}`;
  else if (/^audio\//.test(file.type) && file.size > AUDIO_WARN_BYTES)
    showToast(
      `Soundtrack is ${readableSize(file.size)}. Every phone downloads this — under 3 MB is safer for 100 players.`,
    );
  uploadCount++;
  $("#saveQuiz").disabled = true;
  try {
    return await api(
      draft?._oversightOwner ? oversightQuizPath() + "/media" : "/api/media",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(chosen.name || file.name),
        },
        body: chosen,
      },
    );
  } finally {
    uploadCount--;
    $("#saveQuiz").disabled = uploadCount > 0;
  }
}
async function uploadQuestion(input) {
  const file = input.files[0];
  if (!file) return;
  const card = input.closest(".question-card");
  input.disabled = true;
  try {
    const m = await upload(file);
    if (!card.isConnected)
      return showToast(
        "The editor changed during upload. Please attach the file again.",
      );
    collectDraft();
    const q = draft.rounds[card.dataset.ri].questions[card.dataset.qi];
    q.media = m.url;
    q.mediaType = m.mime;
    dirty = true;
    renderEditor();
    showToast(
      `Media attached${lastUploadNote ? ` · ${lastUploadNote}` : ""} — save the quiz to keep your changes`,
    );
  } catch (err) {
    showToast(err.message);
  } finally {
    input.disabled = false;
  }
}
$("#musicFile").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const editing = draft;
  try {
    const m = await upload(file);
    if (draft !== editing)
      return showToast(
        "The editor changed during upload. Reattach the soundtrack in the intended workspace.",
      );
    if (!m.mime.startsWith("audio/"))
      throw Error("Background music must be an audio file.");
    collectDraft();
    draft.music = m.url;
    dirty = true;
    renderEditor();
    showToast("Custom soundtrack attached");
  } catch (err) {
    showToast(err.message);
  } finally {
    event.target.value = "";
  }
};
$("#editorForm").onsubmit = async (event) => {
  event.preventDefault();
  if (uploadCount) return showToast("Please wait for your uploads to finish.");
  const invalid = $("#editorForm :invalid");
  if (invalid) {
    const card = invalid.closest(".question-card");
    if (card) {
      activeEditorQuestion =
        draft.rounds[card.dataset.ri].questions[card.dataset.qi];
      showStudioSelection();
      const details = invalid.closest("details");
      if (details) details.open = true;
    } else if (invalid.closest("#quizSettings")) $("#quizSettings").open = true;
    invalid.reportValidity();
    return;
  }
  collectDraft();
  if (draft.rounds.some((r) => !r.questions.length)) {
    draft.rounds = draft.rounds.filter((r) => r.questions.length);
    renderEditor();
  }
  if (
    draft.rounds.some((r) =>
      r.questions.some((q) => q.type === "multi" && !q.correctAnswers?.length),
    )
  )
    return showToast("Select correct answers for every multi-answer question.");
  if (
    draft.rounds.some((r) =>
      r.questions.some(
        (q) =>
          (q.type === "text" || q.type === "buzzer") &&
          !(q.accepted || []).filter((a) => String(a || "").trim()).length,
      ),
    )
  )
    return showToast(
      "Enter the answer for every fill-in-the-blank and buzzer question.",
    );
  if (
    draft._oversightOwner &&
    !confirm(
      `Save changes to ${draft._oversightLabel}’s original quiz? Their existing assignments and active rooms will not change.`,
    )
  )
    return;
  $("#saveQuiz").disabled = true;
  $("#saveStatus").textContent = "Saving…";
  $("#editorForm").inert = true;
  try {
    await window.Studio?.beforeSave();
    const oversightOwner = draft._oversightOwner;
    const q = await api(
      oversightOwner
        ? oversightQuizPath()
        : "/api/quizzes" + (draft.id ? "/" + draft.id : ""),
      {
        method: draft.id ? "PUT" : "POST",
        headers: draft.id ? { "If-Match": `"${draft._revision || 0}"` } : {},
        body: JSON.stringify(draft),
      },
    );
    await window.Studio?.saved();
    draft = q;
    dirty = false;
    await loadWorkspace();
    showView(oversightOwner ? "settings" : "quizzes", true);
    if (oversightOwner) await window.AdminStudio?.refresh(oversightOwner);
    showToast(
      oversightOwner
        ? "Saved to the friend’s workspace. Existing assignments and rooms are unchanged."
        : "Quiz saved — ready for your next gathering",
    );
  } catch (err) {
    $("#saveStatus").textContent = err.message;
  } finally {
    $("#saveQuiz").disabled = false;
    $("#editorForm").inert = false;
  }
};
$("#passwordForm").onsubmit = async (event) => {
  event.preventDefault();
  if (!requireHost()) return;
  const form = event.target;
  if (!confirm("Change your password and sign out all host sessions?")) return;
  try {
    await api("/api/password", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    form.reset();
    manualClose = true;
    socket?.close();
    forgetConnection();
    location.reload();
  } catch (err) {
    showToast(err.message);
  }
};
window.addEventListener("beforeunload", (event) => {
  if (dirty && currentView === "editor") {
    event.preventDefault();
    event.returnValue = "";
  }
});
function connectionText(text) {
  $(participantMode ? "#playerConnection" : "#hostConnection").textContent =
    text;
}
function send(type, data = {}) {
  if (socket?.readyState !== WebSocket.OPEN) {
    showToast("Reconnecting — please wait.");
    return false;
  }
  socket.send(JSON.stringify({ type, ...data }));
  return true;
}
let reconnectAttempt = 0;
function openSocket(initial) {
  clearTimeout(reconnectTimer);
  manualClose = false;
  const remembered = savedConnection();
  if (remembered?.playerId) myPlayerId = remembered.playerId;
  if (socket) {
    const old = socket;
    old.onclose = null;
    old.close();
  }
  socket = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live`,
  );
  connectionText("Connecting to the live room…");
  socket.onopen = () => {
    reconnectAttempt = 0;
    connectionText("Connected · answers and timers are synchronized");
    clockSent = Date.now();
    send("ping");
    if (initial) send(initial.type, initial);
  };
  socket.onmessage = (event) => {
    try {
      handleMessage(JSON.parse(event.data));
    } catch (err) {
      console.error("Rendering error", err);
      showToast("Unable to update this screen. Reload to reconnect.");
    }
  };
  socket.onerror = () =>
    connectionText("Connection unavailable. Check your internet connection.");
  socket.onclose = (event) => {
    sound.stop();
    if (manualClose) return;
    connectionText(
      event.code === 4000
        ? "Session moved to another tab."
        : "Disconnected. Reconnecting…",
    );
    if (event.code === 4000) {
      forgetConnection();
      return;
    }
    const saved = savedConnection();
    if (saved && game?.status !== "ended") {
      const attempt = reconnectAttempt++;
      const backoff = Math.min(15000, 800 * 2 ** Math.min(attempt, 5));
      reconnectTimer = setTimeout(
        () =>
          openSocket({
            type: participantMode ? "resume_player" : "resume_host",
            ...saved,
          }),
        backoff + Math.floor(Math.random() * 900),
      );
    } else {
      connectionText("Disconnected. Join or launch a game to try again.");
      $("#joinGameBtn").disabled = false;
      $("#joinConfirm").disabled = false;
    }
  };
}
function launchQuiz(id) {
  sound.enable();
  if (game && game.status !== "ended") {
    showToast("Finish your current game before launching another.");
    $("#gameModal").classList.add("open");
    scheduleLiveFit();
    return;
  }
  forgetConnection();
  clearHostImages();
  game = null;
  $("#gameModal").classList.add("open");
  $("#gameTitle").textContent = "Creating your game…";
  $("#hostQuestion").textContent = "Opening the room…";
  $("#hostOptions").innerHTML = "";
  $("#hostResults").innerHTML = "";
  $("#hostCode").textContent = "—";
  $("#nextQuestion").disabled = true;
  window.ProfessionalHost?.reset();
  openSocket({ type: "create_game", quizId: id });
}
function loadGameMusic(url) {
  const container = $(participantMode ? "#playerMusic" : "#lobbyMusic");
  container.innerHTML = url
    ? `<label class="music-control">Custom soundtrack <audio hidden loop preload="metadata" src="${e(url)}"></audio></label>`
    : "";
  sound.setTrack($("audio", container));
}
let lastMusicRefresh = 0;
window.addEventListener("quiz:refresh-music", () => {
  if (game && Date.now() - lastMusicRefresh > 60000) {
    lastMusicRefresh = Date.now();
    send("refresh_music");
  }
});
// Keep at most the current and next image in host memory. Reattach the decoded
// Image itself: private media deliberately uses no-store, so a new <img> would
// otherwise download it again. Audio and participant loading are unchanged.
const hostImageCache = new Map();
let hostImageGameCode = null,
  currentHostImageKey = null;
function hostImageKey(url) {
  try {
    const u = new URL(url, location.href);
    return u.origin === location.origin &&
      /^\/media\/[a-f0-9-]+$/.test(u.pathname)
      ? u.pathname
      : null;
  } catch {
    return null;
  }
}
function releaseHostImage(entry) {
  entry.disposed = true;
  clearTimeout(entry.timer);
  entry.image.onload = entry.image.onerror = null;
  if (!entry.image.isConnected || entry.state !== "ready")
    entry.image.removeAttribute("src");
}
function clearHostImages() {
  for (const entry of hostImageCache.values()) releaseHostImage(entry);
  hostImageCache.clear();
  currentHostImageKey = hostImageGameCode = null;
  const status = $("#hostImageStatus");
  if (status) {
    status.hidden = true;
    status.replaceChildren();
  }
}
function retryHostImages() {
  if (!send("refresh_images")) showToast("Reconnect to retry the image.");
}
function createHostImage(url, index) {
  const key = hostImageKey(url);
  if (!key) return null;
  const image = new Image();
  image.alt = "Question image";
  image.className = "question-media";
  image.decoding = "async";
  image.loading = "eager";
  image.fetchPriority = index <= Math.max(0, game?.index ?? 0) ? "high" : "low";
  const entry = {
    key,
    image,
    state: "loading",
    indices: [index],
    disposed: false,
  };
  hostImageCache.set(key, entry);
  const changed = () => {
    if (entry.disposed) return;
    if (currentHostImageKey === key) paintHostImage(entry);
    updateHostImageStatus();
    scheduleLiveFit();
  };
  image.onload = async () => {
    try {
      await image.decode();
    } catch {
      /* Some browsers already decoded on load. */
    }
    if (entry.disposed) return;
    clearTimeout(entry.timer);
    entry.state = image.naturalWidth ? "ready" : "error";
    changed();
  };
  image.onerror = () => {
    if (entry.disposed) return;
    clearTimeout(entry.timer);
    entry.state = "error";
    changed();
  };
  entry.timer = setTimeout(() => {
    if (entry.state === "loading") {
      entry.state = "slow";
      changed();
    }
  }, 15000);
  image.src = url;
  return entry;
}
function primeHostImages(message) {
  if (
    participantMode ||
    !game ||
    message.code !== game.code ||
    game.status === "ended"
  )
    return;
  if (hostImageGameCode !== game.code) clearHostImages();
  hostImageGameCode = game.code;
  const wanted = new Map();
  for (const item of (message.images || []).slice(0, 2)) {
    const key = hostImageKey(item.url);
    if (!key || !Number.isInteger(item.index)) continue;
    if (!wanted.has(key)) wanted.set(key, { url: item.url, indices: [] });
    wanted.get(key).indices.push(item.index);
  }
  for (const [key, entry] of hostImageCache) {
    if (
      !wanted.has(key) ||
      (message.retry && ["error", "slow"].includes(entry.state))
    ) {
      releaseHostImage(entry);
      hostImageCache.delete(key);
    }
  }
  for (const [key, item] of wanted) {
    const entry =
      hostImageCache.get(key) || createHostImage(item.url, item.indices[0]);
    entry.indices = item.indices;
    if (currentHostImageKey === key) paintHostImage(entry);
  }
  updateHostImageStatus();
  scheduleLiveFit();
}
function paintHostImage(entry) {
  if (entry.disposed || currentHostImageKey !== entry.key) return;
  const area = $("#hostMedia");
  entry.image.hidden = entry.state !== "ready";
  area.replaceChildren(entry.image);
  if (entry.state !== "ready") {
    const notice = document.createElement("div");
    notice.className = "host-image-notice";
    notice.setAttribute("role", "status");
    notice.textContent =
      entry.state === "error"
        ? "Image could not load. "
        : entry.state === "slow"
          ? "Image is still loading. "
          : "Loading question image…";
    if (["error", "slow"].includes(entry.state)) {
      const retry = document.createElement("button");
      retry.className = "secondary-btn";
      retry.textContent = "Retry image";
      retry.onclick = retryHostImages;
      notice.append(retry);
    }
    area.append(notice);
  }
}
function renderHostImage(q) {
  const key = hostImageKey(q.media);
  if (participantMode || !q.mediaType?.startsWith("image/") || !key) {
    currentHostImageKey = null;
    $("#hostMedia").innerHTML = mediaHTML(q.media, q.mediaType);
    return;
  }
  if (hostImageGameCode !== game.code) clearHostImages();
  hostImageGameCode = game.code;
  currentHostImageKey = key;
  // Also works with a reconnect/current question arriving before the preload message.
  for (const [cachedKey, entry] of hostImageCache) {
    if (cachedKey !== key && !entry.indices.includes(q.index + 1)) {
      releaseHostImage(entry);
      hostImageCache.delete(cachedKey);
    }
  }
  const entry = hostImageCache.get(key) || createHostImage(q.media, q.index);
  entry.image.fetchPriority = "high";
  paintHostImage(entry);
  updateHostImageStatus();
}
function updateHostImageStatus() {
  if (participantMode) return;
  let status = $("#hostImageStatus");
  if (!status) {
    status = document.createElement("span");
    status.id = "hostImageStatus";
    status.setAttribute("role", "status");
    $("#hostSound").append(status);
  }
  const next = game?.index < 0 ? 0 : (game?.index ?? 0) + 1;
  const entry = [...hostImageCache.values()].find((x) =>
    x.indices.includes(next),
  );
  status.hidden = !entry || game?.status === "ended";
  if (status.hidden) {
    status.replaceChildren();
    return;
  }
  status.dataset.state = entry.state;
  const label = game.index < 0 ? "First image" : "Next image";
  status.textContent =
    label +
    (entry.state === "ready"
      ? " ready"
      : entry.state === "error"
        ? " unavailable "
        : entry.state === "slow"
          ? " still loading "
          : " loading…");
  if (["error", "slow"].includes(entry.state)) {
    const retry = document.createElement("button");
    retry.className = "text-btn";
    retry.textContent = "Retry";
    retry.onclick = retryHostImages;
    status.append(retry);
  }
}

function handleMessage(m) {
  window.ProfessionalHost?.message(m);
  if (m.type === "host_images") {
    primeHostImages(m);
    return;
  }
  if (m.serverNow) offset = m.serverNow - Date.now();
  if (m.type === "music_refreshed") {
    loadGameMusic(m.music);
    return;
  }
  if (m.game?.musicState) sound.setRemote(m.game.musicState);
  if (m.type === "music_control") {
    if (game) game.musicState = m.musicState;
    sound.setRemote(m.musicState);
    return;
  }
  if (m.type === "leaderboard_control") {
    if (game) game.leaderboardVisible = m.visible;
    showLiveLeaderboard(m.visible, m.leaderboard);
    return;
  }
  if (["round_intro", "last_question_intro"].includes(m.type)) {
    game = m.game;
    renderRoundIntro();
    return;
  }
  if (m.type === "clock") {
    offset = m.serverNow - (Date.now() + clockSent) / 2;
    return;
  }
  if (m.type === "error") {
    showToast(m.message);
    if (answerPending) {
      answerPending = false;
      locked = false;
      lockAnswers();
      $("#answerStatus").textContent = m.message;
    }
    if (participantMode) {
      $("#joinStatus").textContent = m.message;
      $("#joinGameBtn").disabled = false;
      $("#joinConfirm").disabled = false;
      if (!game) {
        forgetConnection();
        manualClose = true;
        socket?.close();
      }
    } else if (!game) {
      forgetConnection();
      manualClose = true;
      socket?.close();
      $("#gameModal").classList.remove("open");
    }
    return;
  }
  if (["game_created", "host_resumed", "joined"].includes(m.type)) {
    game = m.game;
    liveQuestion = m.question;
    locked = !!m.answered;
    if (m.type === "joined") {
      myPlayerId = m.playerId || myPlayerId;
      storeConnection({
        code: game.code,
        playerToken: m.playerToken,
        playerId: myPlayerId,
      });
      $("#joinPanel").hidden = true;
      $("#playerQuestion").hidden = false;
      resetFeedback();
      if (m.reclaimed)
        showToast("Welcome back — your score and place are restored.");
      // A face made in the picker travels to the room once we are in it.
      if (look.face && look.faceOn) sendFace();
    } else {
      if (m.hostToken)
        storeConnection({ code: game.code, hostToken: m.hostToken });
      $("#gameModal").classList.add("open");
      $("#returnToGame").hidden = false;
      $("#gameTitle").textContent = game.title;
      $("#hostCode").textContent = game.code;
      $("#previewPlayer").href = joinURL();
    }
    loadGameMusic(m.music);
    if (game.status === "buzzer") renderBuzzer();
    else if (game.status === "question") renderQuestion();
    else if (game.status === "results") {
      // Reconstruct the question before applying results after a reconnect/reload.
      if (liveQuestion) renderQuestion();
      renderResults(m.result);
    } else if (game.status === "ended") renderEnded(m.leaderboard);
    else if (["round_intro", "last_question_intro"].includes(game.status))
      renderRoundIntro();
    else renderLobby();
    renderPlayers();
    if (game.leaderboardVisible && game.status !== "ended")
      showLiveLeaderboard(true, m.visibleLeaderboard || []);
    return;
  }
  if (m.type === "participants_updated") {
    game = m.game;
    renderPlayers();
    if (game.leaderboardVisible && game.status !== "ended")
      showLiveLeaderboard(
        true,
        [...game.participants]
          .sort((a, b) => b.score - a.score)
          .map((p, i) => ({ ...p, rank: i + 1 })),
      );
    return;
  }
  if (m.type === "buzzer_started") {
    answerPending = false;
    connectionText("Connected · answers and timers are synchronized");
    game = m.game;
    liveQuestion = m.question;
    locked = false;
    buzzes = m.buzzes || [];
    buzzOpen = m.open !== false;
    renderBuzzer();
    renderPlayers();
    return;
  }
  if (m.type === "buzz_queue") {
    const before =
      (buzzes || []).find((b) => b.playerId === myPlayerId)?.status || "";
    buzzes = m.buzzes || [];
    buzzOpen = m.open !== false;
    const mineNow = buzzes.find((b) => b.playerId === myPlayerId);
    // The host's verdict on this player's buzz, said with the body.
    if (mineNow && mineNow.status !== before) {
      if (mineNow.status === "correct") react("accept", 1200, myFigureHolders().concat($$(".podium-figure")));
      if (mineNow.status === "wrong") react("reject", 1400);
    }
    if (game?.status === "buzzer") renderBuzzQueue();
    return;
  }
  if (m.type === "buzz_received") {
    answerPending = false;
    const button = $("#buzzButton");
    if (button) {
      button.disabled = true;
      button.classList.add("buzzed");
    }
    const note = $("#buzzNote");
    if (note)
      note.textContent = `You buzzed in at #${m.position}. Listen for your name.`;
    react("buzz", 900);
    if ($("#answerStatus"))
      $("#answerStatus").textContent = `Buzzed in #${m.position} · waiting for the host.`;
    return;
  }
  if (m.type === "question_started") {
    hideBuzzer();
    answerPending = false;
    connectionText("Connected · answers and timers are synchronized");
    game = m.game;
    liveQuestion = m.question;
    locked = false;
    renderQuestion();
    renderPlayers();
    return;
  }
  if (m.type === "options_shown") {
    // Step two: the same question, now with its answers and a running clock.
    hideBuzzer();
    answerPending = false;
    game = m.game;
    liveQuestion = m.question;
    locked = false;
    renderQuestion();
    renderPlayers();
    return;
  }
  if (m.type === "answer_received") {
    answerPending = false;
    locked = true;
    lockAnswers();
    $("#answerStatus").textContent =
      "Answer locked in. Results arrive when the timer ends.";
    return;
  }
  if (m.type === "question_ended") {
    hideBuzzer();
    buzzes = [];
    game = m.game;
    renderResults(m);
    renderPlayers();
    return;
  }
  if (m.type === "game_ended") {
    game = m.game;
    renderEnded(m.leaderboard);
    renderPlayers();
    forgetConnection();
    if (!participantMode)
      loadWorkspace().catch((err) => showToast(err.message));
    return;
  }
  if (m.type === "host_offline") connectionText(m.message);
  if (m.type === "host_online")
    connectionText("Host reconnected · ready to continue.");
  // Someone took back a seat they had lost. Visible on purpose, so a host can
  // see at a glance that a name was reclaimed and not silently taken.
  if (m.type === "seat_reclaimed") showToast(m.message);
}
function joinURL() {
  return `${location.origin}/join?code=${encodeURIComponent(game.code)}`;
}
function stopQuestionAudio() {
  $$("#hostMedia audio, #playerMedia audio").forEach((audio) => audio.pause());
  sound.resetDuck();
}
function renderLobby() {
  hideBuzzer();
  hideAnswerChart();
  buzzes = [];
  stopQuestionAudio();
  sound.setPhase("lobby");
  setGameStyle("lobby");
  showLiveLeaderboard(false, []);
  $("#submitMulti").hidden = true;
  if (participantMode) {
    renderIdentity();
    $("#playerRound").textContent = "WELCOME TO " + game.code;
    $("#playerTitle").textContent = "You’re in!";
    $("#playerHint").textContent =
      "See your nickname on the big screen? " +
      game.title +
      " starts as soon as your host is ready.";
    $("#playerOptions").innerHTML = "";
    $("#playerMedia").innerHTML = "";
    $("#playerResults").innerHTML = "";
    $("#textAnswerForm").hidden = true;
    $("#answerStatus").textContent =
      "Get comfortable. Your next question is on its way.";
  } else {
    $("#hostRound").textContent = "LOBBY";
    $("#hostQuestionNumber").textContent = `${game.total} QUESTIONS`;
    $("#hostQuestion").textContent = "Ready when you are.";
    $("#hostHint").textContent =
      "Share the join link, then start the first question.";
    $("#hostMedia").innerHTML = "";
    $("#hostOptions").innerHTML = "";
    $("#hostResults").innerHTML = "";
    $("#nextQuestion").textContent = "Start question →";
    $("#nextQuestion").disabled = false;
  }
}
// The clip plays on the host laptop, over the hall speakers, so it is a local
// playback: Play starts it from the beginning and Stop silences it at once.
function syncClipButtons() {
  const media = $("#hostBuzzerMedia"),
    audio = media?.querySelector("audio"),
    play = $("#playBuzzerClip"),
    stop = $("#stopBuzzerClip"),
    note = $("#clipNote");
  if (!play || !stop) return;
  const playing = !!audio && !audio.paused && !audio.ended,
    stopped = media?.dataset.stopped === "1";
  play.disabled = !audio;
  stop.disabled = !playing;
  play.textContent = playing
    ? "▶ Playing… tap to restart"
    : "▶ Play clip for the room";
  if (note)
    note.textContent = !audio
      ? "No clip attached to this question."
      : playing
        ? "Clip playing over the hall speakers."
        : stopped
          ? "Clip stopped."
          : "";
}
function hideBuzzer() {
  const host = $("#hostBuzzer");
  const player = $("#playerBuzzer");
  if (host) host.hidden = true;
  if (player) player.hidden = true;
  const audio = $("#hostBuzzerMedia audio");
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
  syncClipButtons();
}
function renderBuzzer() {
  hideAnswerChart();
  const q = liveQuestion;
  if (!q) return;
  sound.setPhase("question");
  setGameStyle("question");
  const prefix = participantMode ? "player" : "host";
  $(`#${prefix}Round`).textContent =
    `${q.roundLabel || roundTitle(q.roundIndex, q.round)}${q.lastInRound ? " · Last question of this round" : ""}`;
  $(`#${prefix}${participantMode ? "Title" : "Question"}`).textContent = q.text;
  if (participantMode) {
    $("#playerOptions").innerHTML = "";
    $("#playerMedia").innerHTML = "";
    $("#textAnswerForm").hidden = true;
    $("#submitMulti").hidden = true;
    $("#playerBuzzer").hidden = false;
    renderBuzzQueue();
    return;
  }
  $("#hostOptions").innerHTML = "";
  $("#hostBuzzer").hidden = false;
  const media = $("#hostBuzzerMedia");
  const url = q.media || "";
  if (media && media.dataset.url !== url) {
    media.dataset.url = url;
    media.innerHTML = url
      ? `<audio preload="auto" src="${e(url)}"></audio>`
      : "";
    delete media.dataset.stopped;
    const audio = media.querySelector("audio");
    if (audio)
      for (const event of ["play", "playing", "pause", "ended", "timeupdate"])
        audio.addEventListener(event, syncClipButtons);
  }
  syncClipButtons();
  $("#nextQuestion").disabled = true;
  renderBuzzQueue();
}
function renderBuzzQueue() {
  const list = $("#buzzQueue");
  if (!list) return;
  const queue = buzzes || [];
  list.innerHTML = queue.length
    ? queue
        .map(
          (b) => `<li class="buzz-row buzz-${e(b.status)}">
        <b class="buzz-pos">${b.position}</b>
        <span class="buzz-name">${e(b.name)}</span>
        <span class="buzz-time">${(b.elapsedMs / 1000).toFixed(1)}s</span>
        ${
          !participantMode
            ? `<span class="buzz-actions">${
                b.status === "waiting"
                  ? `<button type="button" class="primary-btn" data-verdict="1" data-player="${e(b.playerId)}">Correct</button><button type="button" class="secondary-btn" data-verdict="0" data-player="${e(b.playerId)}">Wrong</button>`
                  : `<span class="buzz-verdict">${b.status === "correct" ? "Correct" : "Wrong"}${
                      b.points
                        ? ` <b class="buzz-points">${b.points > 0 ? "+" : "−"}${Math.abs(b.points).toLocaleString()}</b>`
                        : ""
                    }</span>`
              }</span>`
            : ""
        }
      </li>`,
        )
        .join("")
    : "";
  const status = $("#buzzerStatus");
  if (status)
    status.textContent = queue.length
      ? `${queue.length} buzzed in · fastest at the top`
      : "Waiting for the first buzz…";
  if ($("#stopBuzzing")) $("#stopBuzzing").disabled = !buzzOpen;
  const mine = queue.find((b) => b.playerId === myPlayerId);
  const button = $("#buzzButton");
  if (button) {
    button.disabled = !!mine || !buzzOpen;
    button.classList.toggle("buzzed", !!mine);
  }
  const note = $("#buzzNote");
  if (note)
    note.textContent = mine
      ? mine.status === "correct"
        ? `Correct — you scored ${(mine.points || 0).toLocaleString()} points.`
        : mine.status === "wrong"
          ? mine.points
            ? `Wrong answer — you lost ${Math.abs(mine.points).toLocaleString()} points.`
            : "Wrong answer — listen for the next name."
          : `You buzzed in at #${mine.position}. Listen for your name.`
      : buzzOpen === false
        ? "Buzzing has closed for this question."
        : "Tap the moment you know it.";
}
function renderQuestion() {
  multiSelection = new Set();
  showLiveLeaderboard(false, []);
  $("#submitMulti").hidden = !participantMode || liveQuestion?.type !== "multi";
  stopQuestionAudio();
  sound.setPhase("question");
  setGameStyle("question");
  const q = liveQuestion;
  if (!q) return;
  const prefix = participantMode ? "player" : "host";
  $(`#${prefix}Round`).textContent =
    `${q.roundLabel || roundTitle(q.roundIndex, q.round)}${q.lastInRound ? " · Last question of this round" : ""}`;
  $(`#${prefix}${participantMode ? "Title" : "Question"}`).textContent = q.text;
  // Step one: the question is on screen on its own and the host reads it out.
  // Step two begins when the host presses again and the options arrive.
  const optionsReady = q.optionsVisible !== false;
  // The phone gets no instructions during a question — the question, the
  // picture and the answers speak for themselves. The host keeps a one-line
  // cue, because the two presses are the host's job.
  $(`#${prefix}Hint`).textContent = participantMode
    ? ""
    : !optionsReady
      ? "Read it out. Press “Show options” when the room is ready."
      : q.type === "multi"
        ? "Tick every correct answer, then submit."
        : "";
  if (participantMode) {
    const began = performance.now();
    $("#playerMedia").innerHTML = mediaHTML(q.media, q.mediaType);
    const image = $("#playerMedia img");
    if (image) {
      let sent = false;
      const report = async (state) => {
        if (sent) return;
        sent = true;
        if (state === "ready") {
          try {
            await image.decode();
          } catch {
            state = "error";
          }
        }
        if (socket?.readyState === WebSocket.OPEN && liveQuestion?.id === q.id)
          send("image_status", {
            questionId: q.id,
            state,
            elapsedMs: Math.min(180000, Math.round(performance.now() - began)),
          });
      };
      image.addEventListener("load", () => report("ready"), { once: true });
      image.addEventListener("error", () => report("error"), { once: true });
      if (image.complete && image.naturalWidth) report("ready");
    }
  } else renderHostImage(q);
  // The layout knows whether a picture is on the page: with one, the answers
  // give up a little height so the picture can be large.
  $(".stage-question")?.classList.toggle(
    "has-media",
    !!q.media && !!q.mediaType?.startsWith("image/"),
  );
  $(`#${prefix}Results`).innerHTML = "";
  const options = $(`#${prefix}Options`);
  options.innerHTML = "";
  // The question lands first, then the answers follow it in — the beat that
  // makes a room lean in. The clock started before any of this, so nothing is
  // lost by watching it.
  options.classList.remove("reveal-answers");
  // The room reads the question first and the answers land a beat later; the
  // phone is already in the player's hand, so its beat is much shorter.
  options.style.setProperty(
    "--reveal-delay",
    participantMode ? "0.15s" : "1.5s",
  );
  if (typeof options.getAnimations === "function") {
    const title = $(
      participantMode ? "#playerTitle" : "#hostQuestion",
    );
    title?.animate?.(
      [
        { opacity: 0, transform: "translateY(-10px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 420, easing: "cubic-bezier(.2,.8,.3,1)" },
    );
  }
  if (!optionsReady) {
    options.innerHTML = participantMode
      ? ""
      : `<div class="readout-note"><span aria-hidden="true">👀</span><p>Question on screen. The options appear the moment you press <b>Show options</b>.</p></div>`;
  } else if (q.type !== "text") {
    q.options.forEach((option, i) => {
      const button = document.createElement(participantMode ? "button" : "div");
      button.className = participantMode
        ? "p-answer"
        : `answer ${["purple", "yellow", "green", "blue"][i % 4]}-answer`;
      button.dataset.answer = i;
      button.setAttribute(
        "aria-label",
        String.fromCharCode(65 + i) + " " + option,
      );
      button.style.setProperty("--i", i);
      button.innerHTML = `<span class="answer-shape" aria-hidden="true">${["▲", "◆", "●", "■", "⬟", "★"][i]}</span><span class="answer-copy">${e(option)}</span>`;
      if (participantMode)
        button.onclick = () => {
          if (q.type !== "multi") return submitAnswer(i, button);
          if (locked) return;
          if (multiSelection.has(i)) multiSelection.delete(i);
          else multiSelection.add(i);
          button.classList.toggle("selected", multiSelection.has(i));
          button.setAttribute("aria-pressed", String(multiSelection.has(i)));
          lockAnswers();
        };
      options.append(button);
    });
  }
  options.classList.add("reveal-answers");
  hideAnswerChart();
  const answerSummary = $(`#${prefix}AnswerSummary`);
  if (answerSummary) {
    answerSummary.hidden = true;
    answerSummary.textContent = "";
  }
  if (participantMode) {
    $("#textAnswerForm").hidden = q.type !== "text" || !optionsReady;
    $("#textAnswer").value = "";
    // Only state, never instruction: silence while the options are still
    // coming, and a plain confirmation once an answer is in.
    $("#answerStatus").textContent = !optionsReady
      ? ""
      : locked
        ? "Your answer is locked in."
        : "";
    lockAnswers();
  } else {
    $("#hostQuestionNumber").textContent =
      `QUESTION ${q.index + 1} OF ${q.total} · UP TO ${q.points} POINTS`;
    // One button, three steps: start the question, show the options, reveal.
    $("#nextQuestion").textContent = optionsReady
      ? "Reveal answers"
      : "Show options  ▶";
    $("#nextQuestion").disabled = false;
  }
}
function lockAnswers() {
  const disabled =
    locked || game?.status !== "question" || game?.optionsVisible === false;
  $("#submitMulti").disabled = disabled || !multiSelection.size;
  $$(
    "#playerOptions button, #textAnswerForm input, #textAnswerForm button",
  ).forEach((b) => (b.disabled = disabled));
}
// ---- reactions -------------------------------------------------------------
// One class on the player's own figure is all a reaction needs: the vocabulary
// (jump, droop, spin, clap, pump…) lives in characters.css, and it already knows
// the difference between a drawn figure with arms and a flat picture.
const REACTIONS = [
  "react-correct", "react-wrong", "react-win", "react-clap", "react-streak",
  "react-lead", "react-rush", "react-wave", "react-buzz", "react-accept",
  "react-reject",
];
function myFigureHolders() {
  return [
    ...$$("#playerAvatar .kchar-holder"),
    ...$$("#playerChip .kchar-holder"),
  ];
}
let reactionTimer = 0;
// A reaction survives the card being redrawn: the phone rebuilds its figure on
// every roster update, and the class has to go back on the new element.
let activeReaction = null;
function react(name, ms = 1700, holders) {
  const nodes = holders || myFigureHolders();
  activeReaction = name ? { name, until: Date.now() + ms } : null;
  for (const node of nodes) {
    node.classList.remove(...REACTIONS);
    if (name) node.classList.add("react-" + name);
  }
  clearTimeout(reactionTimer);
  if (name && ms)
    reactionTimer = setTimeout(() => {
      if (activeReaction?.name === name) activeReaction = null;
      nodes.forEach((n) => n.classList.remove("react-" + name));
    }, ms);
}
// Called right after the figure is redrawn.
function replayReaction() {
  if (!activeReaction) return;
  if (Date.now() > activeReaction.until) {
    activeReaction = null;
    return;
  }
  for (const node of myFigureHolders())
    if (!node.classList.contains("react-" + activeReaction.name))
      node.classList.add("react-" + activeReaction.name);
}
// A wave now and then while the room fills, so the lobby is never a still photo.
setInterval(() => {
  if (game?.status !== "lobby" || !participantMode) return;
  react("wave", 2700);
}, 9000);

// What the player actually sent, so the reveal can react to it. The right
// answer only exists on the client once the reveal arrives.
let lastAnswer = null;
let lastScore = 0;
let streak = 0;
function resetFeedback() {
  lastAnswer = null;
  lastScore = 0;
  streak = 0;
  lastRank = 0;
  react(null, 0);
  const chip = myFigureHolders();
  for (const node of chip) node.classList.remove("react-rush");
  const pill = $("#playerStreak");
  if (pill) pill.hidden = true;
  const float = $("#pointsFloat");
  if (float) float.textContent = "";
}
function wasRight(result) {
  if (lastAnswer === null || lastAnswer === undefined) return false;
  const correct = result?.correctIndices || [];
  if (Array.isArray(lastAnswer))
    return (
      lastAnswer.length === correct.length &&
      lastAnswer.every((i) => correct.includes(Number(i)))
    );
  if (typeof lastAnswer === "string") return false;
  return correct.includes(Number(lastAnswer));
}
function floatPoints(delta) {
  const box = $("#pointsFloat");
  if (!box || !delta) return;
  box.textContent = `+${delta.toLocaleString()}`;
  box.classList.remove("is-on");
  void box.offsetWidth;
  box.classList.add("is-on");
}
function revealFeedback(result) {
  if (!participantMode) return;
  const mine = (result?.leaderboard || []).find((r) => r.id === myPlayerId);
  const score = Number(mine?.score) || 0;
  const delta = Math.max(0, score - lastScore);
  lastScore = score;
  const right = wasRight(result);
  if (right) streak += 1;
  else if (lastAnswer !== null && lastAnswer !== undefined) streak = 0;
  floatPoints(delta);
  const pill = $("#playerStreak");
  const text = $("#playerStreakText");
  if (pill && text) {
    pill.hidden = streak < 2;
    text.textContent = `${streak} in a row`;
  }
  const stage = $("#playerQuestion");
  if (stage) {
    stage.classList.remove("is-right", "is-wrong");
    if (lastAnswer !== null && lastAnswer !== undefined)
      stage.classList.add(right ? "is-right" : "is-wrong");
  }
  // The figure answers back: a leap for a right answer, a droop and a head
  // shake for a wrong one, a fist pump once the run is worth celebrating, and
  // a jump-and-point the moment this player takes first place.
  const rank = Number(mine?.rank) || 0;
  const tookLead = rank === 1 && lastRank !== 1 && Number(mine?.score) > 0;
  lastRank = rank;
  if (right) {
    react("correct", 1500);
    if (streak >= 3)
      setTimeout(() => react("streak", 1400), 1150);
    if (tookLead) setTimeout(() => react("lead", 1300), 2300);
  } else if (lastAnswer !== null && lastAnswer !== undefined) {
    react("wrong", 1800);
  }
  if (right) window.QuizzesCelebrate?.from($("#playerTitle"), 70);
}
let lastRank = 0;
function submitAnswer(answer, button) {
  if (locked || game?.status !== "question" || game?.optionsVisible === false)
    return;
  locked = true;
  answerPending = true;
  lastAnswer = answer;
  lockAnswers();
  button?.classList.add("selected");
  $("#answerStatus").textContent = "Sending your answer…";
  if (!send("submit_answer", { questionId: liveQuestion.id, answer })) {
    answerPending = false;
    locked = false;
    lockAnswers();
    $("#answerStatus").textContent =
      "Not sent. Please wait for the connection and try again.";
  }
}
$("#textAnswerForm").onsubmit = (event) => {
  event.preventDefault();
  submitAnswer($("#textAnswer").value);
};
// The room's answers as columns above the answer tiles — only ever drawn once
// the answers are revealed. Nothing shows while people are still choosing.
// The reveal keeps the question and the answers on screen — the room needs to
// read the question, then the bars, then which row was right. The columns get
// their own strip between the question and the answer rows.
function drawAnswerChart(result, counts, votes) {
  const chart = $("#resultsChart");
  const stage = $("#resultsStage");
  if (!chart || !stage || !liveQuestion) return;
  const options = liveQuestion.options || [];
  const correctIndices = new Set(result?.correctIndices || []);
  const tallest = Math.max(1, ...options.map((_, i) => counts[i] || 0));
  chart.style.setProperty("--columns", String(options.length));
  chart.innerHTML = options
    .map((option, i) => {
      const count = counts[i] || 0;
      const height = Math.round((count / tallest) * 100);
      const share = votes ? Math.round((count / votes) * 100) : 0;
      return `<div class="chart-column${correctIndices.has(i) ? " is-correct" : ""}${count ? " has-votes" : ""}" title="${count} of ${votes} · ${share}%">
        <span class="chart-count">${count}</span>
        <span class="chart-track"><i class="chart-bar tile-${i}" style="--height:${count ? Math.max(6, height) : 0}"></i></span>
        <span class="chart-symbol" aria-hidden="true">${["▲", "◆", "●", "■", "⬟", "★"][i]}</span>
      </div>`;
    })
    .join("");
  stage.hidden = false;
  $("#gameModal").dataset.bars = "on";
  // Let the bars grow from the baseline rather than appear at full height.
  requestAnimationFrame(() => {
    stage.classList.add("is-drawn");
  });
}
function hideAnswerChart() {
  const chart = $("#resultsChart");
  const stage = $("#resultsStage");
  if (stage) {
    stage.hidden = true;
    stage.classList.remove("is-drawn");
  }
  if (chart) chart.innerHTML = "";
  delete $("#gameModal").dataset.bars;
}
function renderResults(result) {
  stopQuestionAudio();
  // The reveal is the answers, not the picture: the image leaves the stage so
  // the question, the bars and the ticked tiles stand on their own.
  $("#hostMedia").innerHTML = "";
  $("#playerMedia").innerHTML = "";
  $(".stage-question")?.classList.remove("has-media");
  sound.setPhase("results");
  setGameStyle("results");
  const prefix = participantMode ? "player" : "host";
  toneFor(liveQuestion);
  $(`#${prefix}Hint`).textContent =
    (result?.roundEnded ? `${result.roundLabel} complete! · ` : "") +
    "Correct answer: " +
    (result?.correct || "—");
  if (liveQuestion?.type !== "text") {
    const counts = {};
    let votes = 0;
    for (const [index, value] of Object.entries(result?.stats || {})) {
      const n = Number(value) || 0;
      counts[index] = n;
      votes += n;
    }
    const correctIndices = result?.correctIndices || [];
    $$(`#${prefix}Options [data-answer]`).forEach((tile) => {
      const index = Number(tile.dataset.answer);
      const correct = correctIndices.includes(index);
      tile.classList.toggle("is-correct", correct);
      // A wrong row is marked as plainly as the right one, exactly like a
      // game show: a tick on the answer that was right, a cross on the rest.
      tile.classList.toggle("is-wrong", !correct && liveQuestion?.type !== "text");
      const marks = [...tile.querySelectorAll(":scope > .answer-mark")];
      marks.slice(1).forEach((extra) => extra.remove());
      let mark = marks[0];
      if (!mark) {
        mark = document.createElement("span");
        mark.className = "answer-mark";
        mark.setAttribute("aria-hidden", "true");
        tile.append(mark);
      }
      mark.textContent = correct ? "✓" : "✗";
      const count = counts[index] || 0;
      const share = votes ? Math.round((count / votes) * 100) : 0;
      // On a phone the count sits under the answer; on the big screen it is
      // drawn as a column above the answer, the way a game show shows the room.
      if (participantMode) {
        tile.classList.add("has-bar");
        const bar = document.createElement("span");
        bar.className = "answer-bar";
        bar.style.setProperty("--share", share + "%");
        bar.innerHTML = `<i aria-hidden="true"${count ? "" : ' class="is-empty"'}></i><b>${count}</b>`;
        tile.append(bar);
      }
      tile.setAttribute(
        "aria-label",
        `${String.fromCharCode(65 + index)} ${liveQuestion.options[index]} · ${count} of ${votes} answers · ${share}%${correct ? " · correct answer" : ""}`,
      );
    });
    if (!participantMode) drawAnswerChart(result, counts, votes);
  }
  const summary = $(`#${prefix}AnswerSummary`);
  if (summary) {
    const stats = result?.stats || {};
    const total = Object.values(stats).reduce(
      (sum, n) => sum + (Number(n) || 0),
      0,
    );
    summary.textContent =
      liveQuestion?.type === "text"
        ? `${game.participants.filter((p) => p.answered).length} of ${game.participants.length} players answered.`
        : total
          ? `${total} answer${total === 1 ? "" : "s"} from ${game.participants.length} player${game.participants.length === 1 ? "" : "s"} — each bar is how many chose that answer.`
          : "No one answered this one.";
    summary.hidden = false;
  }
  $(`#${prefix}Results`).innerHTML = "";
  $("#submitMulti").hidden = true;
  showLiveLeaderboard(!!result?.leaderboardVisible, result?.leaderboard || []);
  if (participantMode) {
    // The reveal is the moment the phone reacts: a burst for a right answer, a
    // shake for a wrong one, the points just won, and the run of rights.
    revealFeedback(result);
    $("#textAnswerForm").hidden = true;
    locked = true;
    lockAnswers();
    $("#answerStatus").textContent =
      "Nice work. Your host will start the next question.";
    if (!liveQuestion) $("#playerTitle").textContent = "Round results";
  } else {
    if (!liveQuestion) {
      $("#hostQuestion").textContent = "Round results";
      $("#hostQuestionNumber").textContent =
        `QUESTION ${game.index + 1} OF ${game.total}`;
    }
    $("#nextQuestion").textContent =
      game.index + 1 >= game.total
        ? "Finish & save results"
        : result?.roundEnded
          ? "Next round →"
          : "Next question →";
    $("#nextQuestion").disabled = false;
  }
}
function renderEnded(rows) {
  hideAnswerChart();
  // The line under the answers belongs to the question that just closed; the
  // final screen is the podium, so it is cleared rather than left hanging.
  for (const id of ["hostAnswerSummary", "playerAnswerSummary"]) {
    const line = $(`#${id}`);
    if (line) {
      line.textContent = "";
      line.hidden = true;
    }
  }
  showLiveLeaderboard(false, []);
  $("#submitMulti").hidden = true;
  stopQuestionAudio();
  sound.setPhase("ended");
  setGameStyle("ended");
  connectionText("Session complete · thank you for playing.");
  const prefix = participantMode ? "player" : "host";
  $(`#${prefix}Round`).textContent = "THAT’S A WRAP";
  $(`#${prefix}${participantMode ? "Title" : "Question"}`).textContent =
    "A moment worth sharing.";
  $(`#${prefix}Hint`).textContent =
    "Thank you for playing. Here are the final results.";
  $(`#${prefix}Options`).innerHTML = "";
  $(`#${prefix}Media`).innerHTML = "";
  // The podium carries the top three; anyone below them is listed under it, so
  // the same names are never printed twice.
  $(`#${prefix}Results`).innerHTML = podiumHTML(rows || []);
  if (!participantMode) {
    // The podium is the moment of the night, so it gets a burst once the
    // pedestals have risen.
    setTimeout(() => {
      if (game?.status === "ended")
        window.QuizzesCelebrate?.from($("#hostResults .podium"), 140);
    }, 900);
    $("#hostQuestion").textContent = "Final leaderboard";
    $("#hostHint").textContent =
      "Announce your winners! Results have been saved in Reports.";
  }
  if (participantMode) {
    $("#textAnswerForm").hidden = true;
    $("#answerStatus").textContent =
      "Your host has saved this session’s results.";
  } else {
    $("#nextQuestion").disabled = true;
    $("#nextQuestion").textContent = "Results saved ✓";
    $("#returnToGame").hidden = true;
  }
}
function renderPlayers() {
  if (!game) return;
  if (participantMode) return renderIdentity();
  window.ProfessionalHost?.connections();
  $("#playerCount").textContent = game.participants.length;
  $("#liveAnswerMeter").textContent = game.participants.filter(
    (p) => p.answered,
  ).length;
  $("#answeredCount").textContent =
    game.status === "question"
      ? `${game.participants.filter((p) => p.answered).length} / ${game.participants.length} answered`
      : `${game.participants.filter((p) => p.connected).length} connected`;
  if (["lobby", "round_intro", "last_question_intro"].includes(game.status))
    renderJoinWall();
}
// Before the first question the stage shows who is in the room, faces first —
// the host can see at a glance that everyone has arrived.
const seenPlayers = new Set();
function renderJoinWall() {
  const wall = $("#hostOptions");
  if (!wall || $("#hostLeaderboard")?.hidden === false) return;
  const seated = game.participants.slice(0, 60);
  const fresh = new Set(
    game.participants.map((p) => p.id).filter((id) => !seenPlayers.has(id)),
  );
  for (const p of game.participants) seenPlayers.add(p.id);
  wall.innerHTML = seated.length
    ? `<div class="join-wall" aria-label="${seated.length} players ready">${seated
        .map(
          (p) =>
            `<div class="join-chip${p.connected ? "" : " is-away"}${fresh.has(p.id) ? " just-joined" : ""}"><span class="join-figure">${characterSVG(p, "is-figure react-wave", { thumb: true, label: false })}</span><span>${e(p.name)}</span></div>`,
        )
        .join("")}</div>${game.participants.length > 60 ? `<p class="muted">and ${game.participants.length - 60} more</p>` : ""}`
    : `<div class="join-wall is-empty"><span class="join-wall-face" aria-hidden="true">🎟️</span><p>Waiting for the first player. Share the join link or the code above.</p></div>`;
  scheduleLiveFit();
}
// The player's own face and name, so a phone always shows which seat it is.
function renderIdentity() {
  const box = $("#playerIdentity");
  const chip = $("#playerChip");
  if (!box || !chip) return;
  const me = game.participants.find((p) => p.id === myPlayerId);
  // The big character belongs to the lobby, where there is room to show it off.
  // While a question is running the phone stays tight: the same character and
  // name ride along in the header line instead.
  const roomy = ["lobby", "round_intro", "last_question_intro", "ended"].includes(
    game.status,
  );
  box.hidden = !me || !roomy;
  chip.hidden = !me || roomy;
  if (!me) return;
  $("#playerAvatar").innerHTML = characterSVG(me, "kchar-hero is-idle");
  $("#playerName").textContent = me.name;
  chip.className = "player-chip";
  chip.innerHTML = `${characterChip(me)}<b>${e(me.name)}</b>`;
  replayReaction();
}
setInterval(() => {
  if (!game) return;
  // While the host is still reading the question out there is no clock yet.
  const counting = game.status === "question" && !!game.deadline;
  const remaining = counting
    ? Math.max(0, Math.ceil((game.deadline - Date.now() - offset) / 1000))
    : 0;
  sound.remaining(remaining);
  const timer = $(participantMode ? "#playerTimer" : "#hostTimer");
  const urgent = counting && remaining <= 5;
  timer.classList.toggle("timer-urgent", urgent);
  // In the last five seconds the player's own figure leans in and bounces.
  if (participantMode) {
    for (const node of myFigureHolders())
      node.classList.toggle("react-rush", urgent && !locked);
  }
  // The pill carries a ring that drains with the clock, so how much time is left
  // is legible from across a room, not just as a number.
  const total = Number(liveQuestion?.seconds) || 0;
  if (counting && total > 0) {
    timer.style.setProperty("--p", String(remaining / total));
    delete timer.dataset.ring;
  } else {
    timer.style.removeProperty("--p");
    // No clock running: no ring, just the pill.
    timer.dataset.ring = "off";
  }
  const text = counting
    ? remaining + "s"
    : ["lobby", "round_intro", "last_question_intro"].includes(game.status) ||
        game.status === "question"
      ? "READY"
      : game.status === "ended"
        ? "FINISHED"
        : "RESULTS";
  const clockEl = $(participantMode ? "#playerTimer" : "#hostTimer");
  clockEl.textContent = text;
  // A word like READY needs a smaller face than "30s": the ticker is a circle.
  clockEl.dataset.clock = /^\d+s$/.test(text) ? "count" : "word";
  if (
    participantMode &&
    game.status === "question" &&
    game.deadline &&
    game.deadline <= Date.now() + offset
  ) {
    locked = true;
    lockAnswers();
  }
}, 150);
$("#nextQuestion").onclick = () => {
  if (!game) return;
  sound.enable();
  if (game.status === "question" && game.optionsVisible === false) {
    // The read-out is over: the options appear and the clock starts.
    send("show_options");
    return;
  }
  if (game.status === "question") {
    if (confirm("End the timer now and reveal the correct answer?"))
      send("reveal_answers");
  } else send("next_question");
};
$("#buzzButton").onclick = () => {
  if (!send("buzz")) return;
  const button = $("#buzzButton");
  button.disabled = true;
  button.classList.add("buzzed");
  if ($("#buzzNote")) $("#buzzNote").textContent = "Buzzed in — good luck!";
};
$("#playBuzzerClip").onclick = () => {
  sound.enable();
  const audio = $("#hostBuzzerMedia audio");
  if (!audio) return showToast("Attach a music clip to this question first.");
  delete $("#hostBuzzerMedia").dataset.stopped;
  audio.currentTime = 0;
  audio.volume = 1;
  audio.play().catch(() =>
    showToast("Tap play again to start the clip on this device."),
  );
  syncClipButtons();
};
$("#stopBuzzerClip").onclick = () => {
  const audio = $("#hostBuzzerMedia audio");
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
  $("#hostBuzzerMedia").dataset.stopped = "1";
  syncClipButtons();
};
$("#stopBuzzing").onclick = () => {
  if (confirm("Close buzzing so no one else can buzz in?")) send("stop_buzzing");
};
$("#revealBuzzer").onclick = () => {
  if (confirm("Reveal the answer with no winner? Nobody scores for this question."))
    send("reveal_answers");
};
$("#buzzQueue").onclick = (event) => {
  const button = event.target.closest("button[data-verdict]");
  if (!button) return;
  send("buzz_verdict", {
    playerId: button.dataset.player,
    correct: button.dataset.verdict === "1",
  });
};
$("#rejoinRoom").onclick = () => {
  if (!runningRoom) return;
  window.QuizzesLive.claim(runningRoom.code);
};
$("#exportLiveGame").onclick = async () => {
  if (!game) return;
  const button = $("#exportLiveGame");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Packing…";
  try {
    const response = await fetch(
      "/api/live/" + encodeURIComponent(game.code) + "/export",
    );
    if (!response.ok) {
      const value = await response.json().catch(() => ({}));
      throw Error(value.error || "Could not save this game.");
    }
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "quizzes-live-" + game.code + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    showToast("Saved a copy. Upload it on your other site to carry on there.");
  } catch (e) {
    showToast(e.message);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
};
$("#endGame").onclick = () => {
  if (game?.status === "ended") {
    minimizeGame();
    return;
  }
  if (game && confirm("End this game and save everyone’s results?"))
    send("end_game");
};
// The published-quizzes panel resumes a room that was saved on another site.
window.QuizzesLive = {
  resume(code, hostToken) {
    storeConnection({ code, hostToken });
    openSocket({ type: "resume_host", code, hostToken });
  },
  // Taking back a room whose tab is gone: the server mints a fresh token.
  claim(code) {
    forgetConnection();
    openSocket({ type: "claim_host", code });
  },
};
function minimizeGame() {
  if (document.fullscreenElement === $("#gameModal"))
    document.exitFullscreen().catch(() => {});
  $("#gameModal").classList.remove("open");
}
$("#closeGame").onclick = minimizeGame;
$("#returnToGame").onclick = () => {
  $("#gameModal").classList.add("open");
  scheduleLiveFit();
};
$("#copyJoin").onclick = async () => {
  if (!game) return;
  try {
    await navigator.clipboard.writeText(joinURL());
    showToast("Join link copied — share it with your players");
  } catch {
    showToast("Copy the link from Open player view.");
  }
};
// --- the character picker on the join screen -----------------------------
// Two grids, one preview. The choice is kept on this device so a player who
// comes back next week is the same animal in the same hat.
const CHARACTER_STORE = "quizzes.player.look";
function storedLook() {
  const fallback = KCHARS?.CHARACTER_IDS[0] || "bear";
  const known = (value) =>
    isPhotoLook(value) || !!KCHARS?.CHARACTER_IDS.includes(value);
  // A player who has never chosen starts on a picture, so the big preview above
  // the grid is already the character they are about to play as.
  const firstPicture = () => {
    const ids = KCHARS?.PHOTO_IDS || [];
    return ids.length
      ? ids[Math.floor(Math.random() * ids.length)]
      : (KCHARS?.pick() || fallback);
  };
  try {
    const saved = JSON.parse(localStorage.getItem(CHARACTER_STORE) || "{}");
    return {
      character: known(saved.character) ? saved.character : firstPicture(),
      accessory: KCHARS?.ACCESSORY_IDS.includes(saved.accessory)
        ? saved.accessory
        : "none",
      // The last drawn character, so an accessory can still be tried on while a
      // picture is the current look — a picture cannot wear a drawn hat.
      drawn: KCHARS?.CHARACTER_IDS.includes(saved.drawn) ? saved.drawn : fallback,
      // Nothing chosen before: the picker opens on the pictures.
      fresh: !known(saved.character),
    };
  } catch {
    return { character: firstPicture(), accessory: "none", drawn: fallback, fresh: true };
  }
}
// A face the player made in this session. It is deliberately NOT in
// localStorage: it lives in sessionStorage only, so closing the tab drops it,
// and on the server it lives in the live room and nowhere else.
const FACE_STORE = "quizzes.face.v1";
function storedFace() {
  try {
    const value = sessionStorage.getItem(FACE_STORE);
    return value && value.startsWith("data:image/") ? value : "";
  } catch {
    return "";
  }
}
let look = storedLook();
look.face = storedFace();
// Whether the face is the look right now, and the crop it was built from, so a
// hat can be added afterwards without asking for the photo again.
look.faceOn = !!look.face;
let faceCrop = "";
if (look.faceOn) lookTab = "photo";
// A returning player lands on the tab of the look they had; a new one starts on
// the pictures, which is what they came to pick from.
let lookTab = look.fresh || isPhotoLook(look.character) ? "photo" : "character";
// Which drawn character the accessory tiles are drawn on.
function accessoryBase() {
  if (!isPhotoLook(look.character)) return look.character;
  return look.drawn || KCHARS?.CHARACTER_IDS[0] || "bear";
}
function saveLook() {
  try {
    localStorage.setItem(CHARACTER_STORE, JSON.stringify(look));
  } catch {
    /* private mode: the picker still works for this game */
  }
}
function renderLookPicker() {
  const photoGrid = $("#photoGrid");
  const grid = $("#charGrid");
  const accessories = $("#accessoryGrid");
  const preview = $("#charPreview");
  if (!photoGrid || !grid || !accessories || !preview || !KCHARS) return;
  preview.innerHTML = look.face && look.faceOn
    ? `<span class="kchar-holder kchar-hero"><img class="kchar kchar-self" src="${look.face}" alt="Your character" width="240" height="400" /></span>`
    : characterSVG(look, "kchar-hero is-idle");
  photoGrid.innerHTML = KCHARS.PHOTO_CHARACTERS.map(
    (c) => {
      const id = "photo:" + c.id;
      return `<button type="button" class="kchar-tile photo-tile" data-character="${id}" aria-pressed="${!look.faceOn && id === look.character}">${KCHARS.render(id, "none", { label: false, thumb: true })}<span>${e(c.label)}</span></button>`;
    },
  ).join("") +
    `<button type="button" class="kchar-tile face-tile" data-face-open aria-pressed="${!!look.faceOn}">
      <span class="face-tile-art" aria-hidden="true">${look.face && look.faceOn ? `<img class="kchar kchar-self" src="${look.face}" alt="" width="240" height="400" />` : '<svg viewBox="0 0 48 48" width="34" height="34"><circle cx="24" cy="18" r="8" fill="none" stroke="currentColor" stroke-width="3"/><path d="M8 42c2-9 8-13 16-13s14 4 16 13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'}</span>
      <span>Your face</span>
    </button>`;
  grid.innerHTML = KCHARS.CHARACTERS.map(
    (c) =>
      `<button type="button" class="kchar-tile" data-character="${c.id}" aria-pressed="${c.id === look.character}">${KCHARS.render(c.id, "none", { label: false })}<span>${e(c.label)}</span></button>`,
  ).join("");
  accessories.innerHTML = KCHARS.ACCESSORIES.map(
    (a) =>
      `<button type="button" class="accessory-tile" data-accessory="${a.id}" aria-pressed="${a.id === look.accessory && !isPhotoLook(look.character)}" aria-label="${e(a.label)}" title="${e(a.label)}">${KCHARS.render(accessoryBase(), a.id, { label: false, head: true })}</button>`,
  ).join("");
  const tabs = [
    ["photo", "#photoGrid", "#charTabPhoto"],
    ["character", "#charGrid", "#charTabCharacter"],
    ["accessory", "#accessoryGrid", "#charTabAccessory"],
  ];
  for (const [name, panel, button] of tabs) {
    $(button)?.setAttribute("aria-selected", String(lookTab === name));
    $(panel).hidden = lookTab !== name;
  }
  const bodyName = $("#faceBodyName");
  if (bodyName) bodyName.textContent = KCHARS.label(accessoryBase());
  $("#charNote").textContent =
    lookTab === "photo"
      ? "Nineteen ready-made characters. Your choice shows on your own phone; the drawn ones can also wear a hat."
      : lookTab === "character"
        ? "The drawn characters. A hat or glasses comes from the Accessory tab."
        : "Tap an accessory to wear it — that makes your character a drawn one. “No accessory” is fine too.";
}
function openLookPicker() {
  const picker = $("#charPicker");
  if (!picker || !KCHARS) return;
  picker.hidden = false;
  $("#joinGameBtn").hidden = true;
  renderLookPicker();
  picker.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function closeLookPicker() {
  const picker = $("#charPicker");
  if (picker) picker.hidden = true;
  $("#joinGameBtn").hidden = false;
}
function joinRoom() {
  sound.enable();
  $("#joinStatus").textContent = "Connecting…";
  $("#joinGameBtn").disabled = true;
  $("#joinConfirm").disabled = true;
  forgetConnection();
  game = null;
  openSocket({
    type: "join_game",
    code: $("#joinCodeInput").value.trim().toUpperCase(),
    name: $("#playerNameInput").value.trim(),
    character: look.character,
    // A picture is whole on its own; the server stores no accessory with it.
    accessory: isPhotoLook(look.character) ? "none" : look.accessory,
  });
}
$("#joinPanel").onsubmit = (event) => {
  event.preventDefault();
  sound.enable();
  // Step one names the player; step two hands them a character.
  const picker = $("#charPicker");
  if (!picker || picker.hidden) {
    if (!$("#playerNameInput").reportValidity()) return;
    openLookPicker();
    return;
  }
  joinRoom();
};
$("#joinConfirm").onclick = () => joinRoom();
$("#charBack").onclick = () => {
  closeLookPicker();
  $("#playerNameInput").focus();
};
document.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-char-tab]");
  if (tab) {
    lookTab = tab.dataset.charTab;
    renderLookPicker();
    return;
  }
  if (event.target.closest("[data-face-open]")) {
    openFaceBuilder();
    return;
  }
  const character = event.target.closest("[data-character]");
  if (character) {
    look.character = character.dataset.character;
    look.faceOn = false;
    if (!isPhotoLook(look.character)) look.drawn = look.character;
    saveLook();
    renderLookPicker();
    return;
  }
  const accessory = event.target.closest("[data-accessory]");
  if (accessory) {
    // Trying on a hat means playing as a drawn character: the tiles are drawn
    // on one, so the look follows the tile the player just pressed.
    look.character = accessoryBase();
    look.drawn = look.character;
    look.accessory = accessory.dataset.accessory;
    saveLook();
    // The hat is part of the composite, so a face is rebuilt with it.
    if (look.faceOn && faceCrop) {
      composeFace(faceCrop).then((sprite) => {
        if (!sprite) return;
        look.face = sprite;
        try {
          sessionStorage.setItem(FACE_STORE, sprite);
        } catch {
          /* private mode */
        }
        renderLookPicker();
        if (game?.code) sendFace();
      });
    }
    renderLookPicker();
  }
});
// ---- your own face ---------------------------------------------------------
// Everything happens on the phone: the photo is cropped, composited onto a
// drawn body with characters.js, and only the finished 240 × 400 figure is sent
// to the room. The raw photo never leaves the device.
function storedConnection() {
  try {
    return JSON.parse(sessionStorage.getItem(resumeKey) || "null") || null;
  } catch {
    return null;
  }
}
async function sendFace() {
  const saved = storedConnection();
  if (!look.face || !game?.code || !saved?.playerToken) return;
  try {
    const res = await fetch("/api/live-avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: game.code,
        token: saved.playerToken,
        image: look.face,
      }),
    });
    if (!res.ok) return;
    const out = await res.json();
    if (out?.character && myPlayerId) {
      const me = game?.participants?.find((p) => p.id === myPlayerId);
      if (me) {
        me.character = out.character;
        me.faceRev = out.faceRev;
      }
    }
  } catch {
    /* the drawn character stands in until the room accepts the picture */
  }
}
const faceState = { img: null, zoom: 1, x: 0, y: 0, drag: null };
function faceCanvas() {
  return $("#faceCanvas");
}
function drawFaceStage() {
  const canvas = faceCanvas();
  const img = faceState.img;
  if (!canvas || !img) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#efe9ff";
  ctx.fillRect(0, 0, w, h);
  const cover = Math.max(w / img.width, h / img.height);
  const scale = cover * faceState.zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const x = (w - dw) / 2 + faceState.x;
  const y = (h - dh) / 2 + faceState.y;
  ctx.drawImage(img, x, y, dw, dh);
}
function openFacePhoto(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    faceState.img = img;
    faceState.zoom = 1;
    faceState.x = 0;
    faceState.y = 0;
    $("#faceStage").hidden = false;
    $("#faceZoom").hidden = false;
    $("#faceUse").hidden = false;
    $("#faceZoom").value = "100";
    drawFaceStage();
  };
  img.src = url;
}
// The crop is what the player sees in the circle: a square from the middle of
// the zoomed photo, cut down to 256 px so the sprite stays small.
function cropFace() {
  const canvas = faceCanvas();
  const img = faceState.img;
  if (!canvas || !img) return "";
  const size = 256;
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d");
  const cover = Math.max(canvas.width / img.width, canvas.height / img.height);
  const scale = (cover * faceState.zoom * size) / canvas.width;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const x = (size - dw) / 2 + (faceState.x * size) / canvas.width;
  const y = (size - dh) / 2 + (faceState.y * size) / canvas.height;
  ctx.drawImage(img, x, y, dw, dh);
  return out.toDataURL("image/webp", 0.9).startsWith("data:image/webp")
    ? out.toDataURL("image/webp", 0.9)
    : out.toDataURL("image/png");
}
// Compose the whole figure — body, own face, chosen hat — into one sprite.
function composeFace(faceData) {
  return new Promise((resolve) => {
    const svg = KCHARS.faceSVG(
      isPhotoLook(look.drawn) ? KCHARS.CHARACTER_IDS[0] : look.drawn,
      look.accessory,
      faceData,
      { width: 240, label: false },
    );
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = 400;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, 240, 400);
      URL.revokeObjectURL(url);
      const webp = canvas.toDataURL("image/webp", 0.86);
      resolve(webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("");
    };
    img.src = url;
  });
}
function useFace() {
  const cropped = cropFace();
  if (!cropped) return;
  faceCrop = cropped;
  composeFace(cropped).then((sprite) => {
    if (!sprite) return;
    look.face = sprite;
    look.faceOn = true;
    try {
      sessionStorage.setItem(FACE_STORE, sprite);
    } catch {
      /* private mode: the face still holds for this game */
    }
    $("#faceBuilder").hidden = true;
    renderLookPicker();
    $("#charNote").textContent =
      "Your face is on the character you picked. Tap Join game to take it in.";
    if (game?.code) sendFace();
  });
}
function openFaceBuilder() {
  $("#faceBuilder").hidden = false;
  $("#charPreview").hidden = true;
  $("#faceBuilder").scrollIntoView({ block: "nearest", behavior: "smooth" });
}
$("#faceInput").onchange = (event) => openFacePhoto(event.target.files?.[0]);
$("#faceZoom").oninput = (event) => {
  faceState.zoom = Number(event.target.value) / 100;
  drawFaceStage();
};
$("#faceUse").onclick = () => useFace();
$("#faceClose").onclick = () => {
  $("#faceBuilder").hidden = true;
  $("#charPreview").hidden = false;
  renderLookPicker();
};
$("#faceStage").addEventListener("pointerdown", (event) => {
  faceState.drag = { x: event.clientX, y: event.clientY, ox: faceState.x, oy: faceState.y };
  event.target.setPointerCapture?.(event.pointerId);
});
$("#faceStage").addEventListener("pointermove", (event) => {
  if (!faceState.drag) return;
  faceState.x = faceState.drag.ox + (event.clientX - faceState.drag.x);
  faceState.y = faceState.drag.oy + (event.clientY - faceState.drag.y);
  drawFaceStage();
});
$("#faceStage").addEventListener("pointerup", () => {
  faceState.drag = null;
});
$("#leavePlayer").onclick = () => {
  if (
    game?.status !== "ended" &&
    !confirm(
      "Leave this game? Your nickname and score will stay in the host’s report.",
    )
  )
    return;
  manualClose = true;
  sound.stop();
  clearTimeout(reconnectTimer);
  forgetConnection();
  socket?.close();
  game = null;
  $("#playerMedia").innerHTML = "";
  $("#playerQuestion").hidden = true;
  delete $("#participantApp").dataset.phase;
  $("#joinPanel").hidden = false;
  $("#joinGameBtn").disabled = false;
  $("#joinConfirm").disabled = false;
  closeLookPicker();
  $("#joinStatus").textContent = "";
  connectionText("Ready for your next game.");
};
async function initializeHost() {
  const session = await api("/api/session");
  account = session.user;
  window.Studio?.authChanged(account);
  privateSetupRequired = !!session.privateSetupRequired;
  setup = session.setupRequired && session.setupEnabled;
  if (account) {
    $("#authButton").textContent = "Sign out";
    $("#orgName").textContent = account.organization;
    await loadWorkspace();
    const saved = savedConnection();
    if (saved && !game) openSocket({ type: "resume_host", ...saved });
  } else {
    renderWorkspace();
    if (session.setupRequired && !session.setupEnabled)
      showToast(
        privateSetupRequired
          ? "First create your host account in the private Arena preview, then sign in here."
          : "Host account setup is required. See README for the private admin setup command.",
      );
  }
}
$("#today").textContent = new Date()
  .toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
  .toUpperCase();
if (independentMode) {
  $("#hostApp").hidden = true;
  $("#participantApp").hidden = true;
} else if (participantMode) {
  $("#hostApp").hidden = true;
  $("#participantApp").hidden = false;
  $("#joinCodeInput").value =
    new URLSearchParams(location.search).get("code") || "";
  const saved = savedConnection();
  if (
    saved &&
    (!$("#joinCodeInput").value ||
      $("#joinCodeInput").value.toUpperCase() === saved.code)
  ) {
    openSocket({ type: "resume_player", ...saved });
  }
} else {
  renderWorkspace();
  initializeHost().catch((err) => showToast(err.message));
}

// Recovery-code reset and portable backups do not need an email service.
function downloadPrivate(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#openRecovery").onclick = () => {
  $("#authModal").classList.remove("open");
  $("#recoverModal").classList.add("open");
  $("#recoverStatus").textContent = "";
};
$("#closeRecover").onclick = () => {
  $("#recoverModal").classList.remove("open");
  openAuth();
};
$("#recoverForm").onsubmit = async (event) => {
  event.preventDefault();
  const form = event.target;
  const button = $("button[type=submit]", form);
  button.disabled = true;
  $("#recoverStatus").textContent = "Resetting…";
  try {
    await api("/api/recover", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    form.reset();
    $("#recoverModal").classList.remove("open");
    openAuth();
    showToast("Password reset. Sign in, then download a new recovery code.");
  } catch (err) {
    $("#recoverStatus").textContent = err.message;
  } finally {
    button.disabled = false;
  }
};
$("#recoveryCodeForm").onsubmit = async (event) => {
  event.preventDefault();
  if (!requireHost()) return;
  const form = event.target;
  const button = $("button[type=submit]", form);
  button.disabled = true;
  try {
    const result = await api("/api/recovery-code", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    downloadPrivate(
      new Blob(
        [
          `PRIVATE — Quizzes account recovery\nHost email: ${result.email}\nOne-time recovery code: ${result.code}\n\nKeep this in your password manager. Never share it in chat. It can reset your host password. Generating a new code, changing your password, or using this code invalidates it.\n`,
        ],
        { type: "text/plain" },
      ),
      "quizzes-private-recovery.txt",
    );
    form.reset();
    $("#recoveryCodeStatus").textContent =
      "Downloaded. Store it securely; the previous code is now invalid.";
  } catch (err) {
    $("#recoveryCodeStatus").textContent = err.message;
  } finally {
    button.disabled = false;
  }
};
$("#backupForm").onsubmit = async (event) => {
  event.preventDefault();
  if (!requireHost()) return;
  const form = event.target;
  const button = $("button[type=submit]", form);
  button.disabled = true;
  $("#backupStatus").textContent = "Preparing your backup. Keep this tab open…";
  try {
    const response = await fetch("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    if (!response.ok)
      throw Error((await response.json()).error || "Backup failed");
    const blob = await response.blob();
    downloadPrivate(
      blob,
      `quizzes-private-backup-${new Date().toISOString().slice(0, 10)}.zip`,
    );
    form.reset();
    $("#backupStatus").textContent =
      "Downloaded. Keep this ZIP private and test restoring it before relying on it.";
  } catch (err) {
    $("#backupStatus").textContent = "Backup failed: " + err.message;
  } finally {
    button.disabled = false;
  }
};

// Each round gets its own accent so a three-round night reads as three acts.
// It tints the stage edge and the round pill — never the answer colours, which
// belong to the answers and must not move.
function toneFor(question) {
  const tone = String(((Number(question?.roundIndex) || 0) % 3) + 1);
  const modal = $("#gameModal");
  const player = $("#participantApp");
  if (modal) modal.dataset.tone = tone;
  if (player) player.dataset.tone = tone;
}
function setGameStyle(phase) {
  if (["lobby", "round_intro", "last_question_intro", "ended"].includes(phase))
    currentHostImageKey = null;
  if (phase === "ended") clearHostImages();
  else updateHostImageStatus();
  $("#gameModal").dataset.phase = phase;
  $("#participantApp").dataset.phase = phase;
  // Replay the entrance: question, reveal and end each settle in rather than
  // snapping. opacity only, so nothing moves under the pointer.
  for (const node of [$(".stage-question"), $("#playerQuestion")]) {
    if (!node) continue;
    node.classList.remove("stage-in");
    void node.offsetWidth;
    node.classList.add("stage-in");
  }
  scheduleLiveFit();
}
// The end of the night: three pedestals, the players' own characters standing
// on them, and the score underneath. The taller the pedestal, the better the
// night — the winner in the middle, where the whole room can see them.
function podiumPlace(p) {
  if (!p) return "";
  const rank = Number(p.rank) || 0;
  const crown =
    rank === 1
      ? '<span class="podium-crown" aria-hidden="true"><svg viewBox="0 0 48 32" width="34" height="22"><path d="M4 30 2 8l12 8 10-14 10 14 12-8-2 22z" fill="#f6c542" stroke="#b8860b" stroke-width="2" stroke-linejoin="round"/></svg></span>'
      : "";
  // First place throws its arms up and spins; the runners-up applaud.
  const mood = rank === 1 ? " react-win" : rank ? " react-clap" : "";
  const figure = KCHARS
    ? `<span class="podium-figure${mood}">${crown}${figureHTML(p)}</span>`
    : "";
  return `<div class="podium-place place-${rank}">
      ${figure}
      <div class="podium-block">
        <span class="podium-badge" aria-hidden="true">${rank}</span>
        <b class="podium-name">${e(p.name)}</b>
        <span class="podium-score">${Number(p.score).toLocaleString()}<small> pts</small></span>
      </div>
    </div>`;
}
function podiumHTML(rows) {
  if (!rows.length) return "";
  const top = rows.slice(0, 3);
  const others = rows.slice(3);
  // With one or two players there is no empty pedestal to stand on: the places
  // that exist are the places shown, centred.
  const places =
    top.length === 1
      ? podiumPlace(top[0])
      : top.length === 2
        ? `${podiumPlace(top[1])}${podiumPlace(top[0])}`
        : `${podiumPlace(top[1])}${podiumPlace(top[0])}${podiumPlace(top[2])}`;
  return `<div class="podium${top.length < 3 ? " is-few" : ""}" data-count="${top.length}" aria-label="Final podium">
      ${places}
    </div>${
      others.length
        ? `<ol class="podium-rest">${others
            .map(
              (p) =>
                `<li><b class="rank">${Number(p.rank)}</b><span>${e(p.name)}</span><strong>${Number(p.score).toLocaleString()} <small>pts</small></strong></li>`,
            )
            .join("")}</ol>`
        : ""
    }<div class="celebration" aria-hidden="true">✦ · ✧ · ★ · ✦ · ✧</div>`;
}
document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-import]")) return;
  if (!requireHost()) return;
  $("#importStatus").textContent = "";
  $("#importDialog").showModal();
});
$("#closeImport").onclick = () => $("#importDialog").close();
$("#documentFile").onchange = () => {
  if ($("#documentFile").files.length) $("#documentText").value = "";
};
// A quiz can be carried to another account, or another installation, as one
// file. The file holds the quiz and every picture and sound it uses.
async function downloadQuizFile(id) {
  const quiz = quizzes.find((q) => q.id === id);
  const name = quiz ? quiz.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40) : id;
  try {
    const response = await fetch("/api/quizzes/" + encodeURIComponent(id) + "/export");
    if (!response.ok) {
      const value = await response.json().catch(() => ({}));
      throw Error(value.error || "Could not save this quiz.");
    }
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "quizzes-" + (name || "quiz") + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    showToast("Quiz saved as a file. Open it from the other account with Move a quiz.");
  } catch (err) {
    showToast(err.message);
  }
}
async function importQuizFile(file) {
  const status = $("#quizFileStatus");
  status.hidden = false;
  if (file.size > 64 * 1024 * 1024) {
    status.textContent = "That file is too large to be a quiz.";
    return;
  }
  status.textContent = "Reading the quiz and its pictures…";
  try {
    const result = await api("/api/quizzes/import", {
      method: "POST",
      body: await file.text(),
    });
    await loadWorkspace();
    const extra = result.warnings?.length
      ? " " + result.warnings.join(" ")
      : "";
    status.textContent = result.media
      ? `“${result.quiz.title}” is now in this account, with ${result.media} attached file${result.media === 1 ? "" : "s"} (pictures and music) carried across.${extra}`
      : `“${result.quiz.title}” is now in this account. It had no pictures or music.${extra}`;
    showToast("Quiz imported");
  } catch (err) {
    status.textContent = err.message;
  }
}
document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-quiz-file]")) return;
  if (requireHost()) $("#quizFileInput").click();
});
$("#quizFileInput").onchange = () => {
  const file = $("#quizFileInput").files[0];
  $("#quizFileInput").value = "";
  if (file) importQuizFile(file);
};
$("#documentText").oninput = () => {
  $("#documentFile").value = "";
};
$("#importForm").onsubmit = async (event) => {
  event.preventDefault();
  const file = $("#documentFile").files[0];
  const text = $("#documentText").value;
  if (!file && !text.trim()) {
    $("#importStatus").textContent =
      "Choose a document or paste some questions first.";
    return;
  }
  if (file && file.size > 5 * 1024 * 1024) {
    $("#importStatus").textContent = "Maximum file size is 5 MB.";
    return;
  }
  $("#importSubmit").disabled = true;
  $("#importStatus").textContent = "Reading your document…";
  try {
    const result = await api("/api/quiz-import", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-File-Name": encodeURIComponent(file?.name || "Imported quiz.txt"),
        "X-Answer-Style": $("#answerStyle").value,
      },
      body: file || new Blob([text], { type: "text/plain" }),
    });
    if (
      dirty &&
      currentView === "editor" &&
      !confirm("Replace your unsaved draft with the imported quiz?")
    )
      return;
    draft = result.quiz;
    draft._importReport = {
      recognized: result.recognized,
      needsAnswers: result.needsAnswers,
      warnings: result.warnings,
      sourceText: result.sourceText,
    };
    $("#importDialog").close();
    openEditor();
    dirty = true;
    showToast(
      `${result.recognized} questions extracted. Review the draft before saving.`,
    );
  } catch (err) {
    $("#importStatus").textContent = err.message;
  } finally {
    $("#importSubmit").disabled = false;
  }
};

function roundTitle(index, title) {
  // The same clean-up the server does, so a title typed as "Round 1 · Warm up"
  // never becomes "Round 1: · Warm up" on any screen.
  const clean = String(title || "")
    .replace(/^round\s*\d+\s*[:.\-–—]?\s*/i, "")
    .replace(/^[·•:–—\-\s]+/, "")
    .trim();
  return `Round ${index + 1}${clean ? ": " + clean : ""}`;
}
function moveQuestions(selection, target) {
  collectDraft();
  if (!selection.length)
    return showToast("Select one or more questions first.");
  if (target === "new") {
    if (draft.rounds.length >= 20) return showToast("Maximum 20 rounds.");
    draft.rounds.push({ title: "", questions: [] });
    target = draft.rounds.length - 1;
  }
  target = Number(target);
  const destination = draft.rounds[target];
  if (!destination) return;
  const moving = selection
    .filter((s) => s.ri !== target)
    .map((s) => ({ ...s, q: draft.rounds[s.ri]?.questions[s.qi] }))
    .filter((s) => s.q);
  if (!moving.length) return;
  if (
    destination.questions.length === 1 &&
    !destination.questions[0].text &&
    !destination.questions[0].media
  )
    destination.questions = [];
  for (const item of [...moving].sort((a, b) => b.ri - a.ri || b.qi - a.qi))
    draft.rounds[item.ri].questions.splice(item.qi, 1);
  destination.questions.push(...moving.map((s) => s.q));
  activeEditorQuestion = moving.at(-1).q;
  dirty = true;
  renderEditor();
}
// --- Drag a question to reorder it -----------------------------------------
// Works with a mouse, a finger or a stylus: press a question in the rail and
// move it up or down — including into another round. The arrow buttons stay
// for keyboard users, and both paths end in the same reorderQuestion().
function reorderQuestion(fromRi, fromQi, toRi, toQi) {
  collectDraft();
  const source = draft.rounds[fromRi];
  const moved = source?.questions[fromQi];
  const destinationRound = draft.rounds[toRi];
  if (!moved || !destinationRound) return;
  source.questions.splice(fromQi, 1);
  let destRi = toRi,
    destQi = toQi;
  // Pulling the question out of the same list shifts every index after it.
  if (fromRi === toRi && fromQi < toQi) destQi -= 1;
  // A round may not be left with nothing in it.
  if (!source.questions.length) {
    draft.rounds.splice(fromRi, 1);
    if (fromRi < destRi) destRi -= 1;
  }
  const destination = draft.rounds[destRi];
  if (!destination) return;
  destination.questions.splice(
    Math.max(0, Math.min(destQi, destination.questions.length)),
    0,
    moved,
  );
  activeEditorQuestion = moved;
  dirty = true;
  renderEditor();
  showToast(
    `Moved to ${roundTitle(destRi, destination.title)} · question ${destination.questions.indexOf(moved) + 1}.`,
  );
}
let thumbDrag = null;
function endThumbDrag() {
  const drag = thumbDrag;
  thumbDrag = null;
  if (!drag) return;
  drag.ghost?.remove();
  drag.line?.remove();
  drag.thumb.classList.remove("thumb-lifted");
  document.body.classList.remove("reordering");
  if (!drag.active) return;
  const drop = drag.drop;
  // A drop back onto itself, or immediately below itself, changes nothing.
  if (!drop) return;
  if (drop.ri === drag.ri && (drop.qi === drag.qi || drop.qi === drag.qi + 1))
    return;
  reorderQuestion(drag.ri, drag.qi, drop.ri, drop.qi);
}
$("#questionNavigator").addEventListener("pointerdown", (event) => {
  if (event.target.closest("input")) return; // the checkbox keeps its click
  const thumb = event.target.closest(".question-thumb");
  if (!thumb || !thumb.dataset.key) return;
  const [ri, qi] = thumb.dataset.key.split(":").map(Number);
  thumbDrag = {
    ri,
    qi,
    thumb,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    drop: null,
  };
});
window.addEventListener(
  "pointermove",
  (event) => {
    const drag = thumbDrag;
    if (!drag) return;
    const dx = event.clientX - drag.startX,
      dy = event.clientY - drag.startY;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < 7) return;
      drag.active = true;
      const rect = drag.thumb.getBoundingClientRect();
      drag.ghost = drag.thumb.cloneNode(true);
      drag.ghost.className = "thumb-ghost";
      drag.ghost.removeAttribute("data-key");
      drag.ghost.style.width = rect.width + "px";
      drag.ghost.style.left = rect.left + "px";
      drag.ghost.style.top = rect.top + "px";
      drag.line = document.createElement("div");
      drag.line.className = "thumb-drop-line";
      drag.line.style.display = "none";
      document.body.append(drag.ghost, drag.line);
      drag.thumb.classList.add("thumb-lifted");
      document.body.classList.add("reordering");
    }
    event.preventDefault();
    drag.ghost.style.transform = `translate(${dx}px, ${dy}px)`;
    // The rail scrolls; holding near an edge keeps a long quiz reachable.
    const rail = $("#questionNavigator").getBoundingClientRect();
    if (event.clientY < rail.top + 36) $("#questionNavigator").scrollTop -= 12;
    else if (event.clientY > rail.bottom - 36)
      $("#questionNavigator").scrollTop += 12;
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const target = under?.closest?.(".question-thumb");
    if (!target || target === drag.thumb || !target.dataset.key) {
      drag.drop = null;
      drag.line.style.display = "none";
      return;
    }
    const rect = target.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    const [ri, qi] = target.dataset.key.split(":").map(Number);
    drag.drop = { ri, qi: qi + (before ? 0 : 1) };
    drag.line.style.display = "block";
    drag.line.style.left = rect.left + "px";
    drag.line.style.width = rect.width + "px";
    drag.line.style.top = (before ? rect.top : rect.bottom) + "px";
  },
  { passive: false },
);
window.addEventListener("pointerup", endThumbDrag);
window.addEventListener("pointercancel", endThumbDrag);
$("#roundTimes")?.addEventListener("change", (event) => {
  const all = event.target.closest("[data-all-round-seconds]");
  if (all) {
    if (!all.value) return;
    collectDraft();
    const seconds = Number(all.value);
    if (!ROUND_TIMES.includes(seconds)) return;
    let count = 0;
    for (const round of draft.rounds) {
      round.seconds = seconds;
      for (const q of round.questions) {
        q.seconds = seconds;
        count++;
      }
    }
    dirty = true;
    renderEditor();
    showToast(`Every question is now ${seconds} seconds — ${count} in all.`);
    return;
  }
  const pick = event.target.closest("[data-round-seconds]");
  if (pick && pick.value) applyRoundTime(Number(pick.dataset.roundSeconds), pick.value);
});
$("#moveSelected").onclick = () =>
  moveQuestions(
    $$(".question-select:checked").map((input) => {
      const card = input.closest(".question-card");
      return { ri: Number(card.dataset.ri), qi: Number(card.dataset.qi) };
    }),
    $("#bulkRound").value,
  );
$("#submitMulti").onclick = () =>
  submitAnswer([...multiSelection].sort((a, b) => a - b));
function showLiveLeaderboard(visible, rows) {
  // One focused standings screen on both devices; never a score sidebar beside a question.
  const panel = $(participantMode ? "#playerLeaderboard" : "#hostLeaderboard");
  const wasVisible = !panel.hidden;
  const show = !!visible && game?.status !== "ended";
  panel.hidden = !show;
  const questionArea = $(
    participantMode ? "#playerQuestion" : "#gameModal .stage-question",
  );
  questionArea.classList.toggle("leaderboard-only", show);
  // The standings take the stage; hiding them puts the question back exactly
  // as it was, bars and marks included.
  if (!participantMode && !show) {
    const stage = $("#resultsStage");
    if (stage && !stage.hidden) $("#gameModal").dataset.bars = "on";
    else delete $("#gameModal").dataset.bars;
  }
  panel.innerHTML = show
    ? '<div class="eyebrow">LIVE STANDINGS</div><h2 tabindex="-1">Leaderboard</h2><p class="muted">' +
      (participantMode
        ? "Total points · Your host will continue shortly."
        : "Total points · Announce the standings, then continue the quiz.") +
      "</p>" +
      leaderboardHTML(rows || [])
    : "";
  if (show) {
    stopQuestionAudio();
    if (participantMode && !wasVisible)
      $("h2", panel).focus({ preventScroll: true });
  }
  $("#toggleLeaderboard").textContent =
    game?.status === "ended"
      ? "Final leaderboard shown"
      : show
        ? "Hide leaderboard"
        : "Show leaderboard";
  $("#toggleLeaderboard").disabled = game?.status === "ended";
  $("#toggleLeaderboard").setAttribute(
    "aria-pressed",
    String(show || game?.status === "ended"),
  );
  scheduleLiveFit();
}
$("#toggleLeaderboard").onclick = () => {
  if (game) send("set_leaderboard", { visible: !game.leaderboardVisible });
};
function renderRoundIntro() {
  hideBuzzer();
  hideAnswerChart();
  const last = game.status === "last_question_intro";
  stopQuestionAudio();
  sound.setPhase("lobby");
  setGameStyle(game.status);
  showLiveLeaderboard(false, []);
  $("#submitMulti").hidden = true;
  const prefix = participantMode ? "player" : "host";
  $(`#${prefix}Round`).textContent = last ? "LAST QUESTION" : "NEXT ROUND";
  $(`#${prefix}${participantMode ? "Title" : "Question"}`).textContent = last
    ? `Last question of ${game.upcomingRound}`
    : game.upcomingRound;
  $(`#${prefix}Hint`).textContent = last
    ? "Make this one count! The host will start the last question."
    : "Get ready! The host will start the first question.";
  for (const id of ["Options", "Media", "Results"])
    $(`#${prefix}${id}`).innerHTML = "";
  $("#textAnswerForm").hidden = true;
  $("#hostQuestionNumber").textContent = last ? "ROUND FINALE" : "ROUND BREAK";
  renderPlayers();
  if (participantMode)
    $("#answerStatus").textContent = last
      ? "Get ready for the last question of this round."
      : "A fresh round. A new chance to climb.";
  else {
    $("#nextQuestion").textContent = last
      ? "Start last question →"
      : "Start this round →";
    $("#nextQuestion").disabled = false;
  }
}

// Fit typical live questions to the available viewport without clipping content.
// At the readable minimum, exceptionally long content may scroll rather than become unreadable.
let liveFitFrame = 0;
function scheduleLiveFit() {
  cancelAnimationFrame(liveFitFrame);
  liveFitFrame = requestAnimationFrame(fitLiveScreen);
}
function fitLiveScreen() {
  const root = participantMode ? $("#participantApp") : $("#gameModal");
  if (!game || (!participantMode && !root.classList.contains("open"))) return;
  const surface = participantMode ? $(".participant-card") : $(".game-stage");
  // Preserve the established phone/tablet fit. On PC, reclaim image space first,
  // then make only a modest text reduction; never squeeze to the old 20/16px floor.
  const desktop = innerWidth >= 1000;
  const questionSize = desktop ? (innerWidth >= 1600 ? 56 : 48) : 40;
  const optionSize = desktop ? (innerWidth >= 1600 ? 34 : 32) : 24;
  root.style.setProperty("--live-question", `${questionSize}px`);
  root.style.setProperty("--live-option", `${optionSize}px`);
  // A picture starts generous and is only given up if the stage overflows — a
  // wide drawing should reach the edges of the screen, not sit in the middle.
  const mediaSize = participantMode
    ? 240
    : Math.min(580, Math.max(220, innerHeight * 0.56));
  root.style.setProperty("--live-media", `${mediaSize}px`);
  root.style.setProperty("--live-gap", "14px");
  if (
    game.status === "ended" ||
    !$(participantMode ? "#playerLeaderboard" : "#hostLeaderboard").hidden
  )
    return;
  if (desktop) {
    for (let step = 0; step <= 14; step++) {
      root.style.setProperty(
        "--live-media",
        `${Math.max(120, mediaSize - step * 24)}px`,
      );
      root.style.setProperty("--live-gap", `${Math.max(6, 14 - step)}px`);
      if (surface.scrollHeight <= surface.clientHeight + 2) return;
    }
    for (let step = 1; step <= 10; step++) {
      root.style.setProperty(
        "--live-question",
        `${Math.max(36, questionSize - step * 2)}px`,
      );
      root.style.setProperty(
        "--live-option",
        `${Math.max(28, optionSize - step)}px`,
      );
      if (surface.scrollHeight <= surface.clientHeight + 2) return;
    }
    return; // Very long questions remain scrollable at readable sizes.
  }
  for (let step = 0; step <= 12; step++) {
    root.style.setProperty(
      "--live-question",
      `${Math.max(20, 40 - step * 2)}px`,
    );
    root.style.setProperty("--live-option", `${Math.max(16, 24 - step)}px`);
    root.style.setProperty(
      "--live-media",
      `${Math.max(72, mediaSize - step * 24)}px`,
    );
    root.style.setProperty("--live-gap", `${Math.max(6, 14 - step)}px`);
    if (surface.scrollHeight <= surface.clientHeight + 2) break;
  }
}
window.addEventListener("resize", scheduleLiveFit);
document.addEventListener("fullscreenchange", () => {
  $("#fullscreenGame").textContent = document.fullscreenElement
    ? "Exit full screen"
    : "Full screen";
  scheduleLiveFit();
});
document.addEventListener(
  "load",
  (event) => {
    if (event.target.matches?.("#hostMedia img, #playerMedia img"))
      scheduleLiveFit();
  },
  true,
);
$("#fullscreenGame").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $("#gameModal").requestFullscreen();
  } catch {
    showToast(
      "Full screen is unavailable here. You can use your browser's full-screen mode.",
    );
  }
};
// Font loading can change Gujarati line wrapping; refit without clipping the question.
if (document.fonts) {
  document.fonts.ready.then(scheduleLiveFit);
  document.fonts.addEventListener("loadingdone", scheduleLiveFit);
}
