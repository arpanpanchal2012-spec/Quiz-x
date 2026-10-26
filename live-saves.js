// A live game exists only in the server's memory, so a restart, crash or
// deploy would otherwise erase an event in progress. Every room is mirrored
// into two tables as it plays: live_games holds the room itself and
// live_answers is an append-only journal of scored answers, so a room can be
// rebuilt on the same code, with the same scores, after the process returns.
//
// Nothing here decides anything about the quiz. It only records and replays
// state that server.js already holds, so gameplay cannot change because of it.
const { db } = require("./storage");

const FORMAT = "quizzes-live-game";
const VERSION = 2;
// A room nobody comes back to is not kept forever.
const RESUME_HOURS = Math.min(
  168,
  Math.max(1, Number(process.env.LIVE_RESUME_HOURS) || 24),
);
const RESUME_MS = RESUME_HOURS * 60 * 60 * 1000;

function serialize(g) {
  return {
    format: FORMAT,
    version: VERSION,
    saved: Date.now(),
    code: g.code,
    created: g.created,
    adminId: g.adminId,
    organization: g.organization || "",
    quizId: g.quizId || "",
    quiz: g.quiz,
    status: g.status === "ending" ? "results" : g.status,
    index: g.index,
    deadline: g.deadline || null,
    startedAt: g.startedAt || null,
    leaderboardVisible: !!g.leaderboardVisible,
    musicState: g.musicState || { playing: true, volume: 0.3 },
    reportId: g.reportId || null,
    hostToken: g.hostToken,
    displayToken: g.displayToken,
    displaySession: g.displaySession,
    players: [...g.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar || "",
      score: p.score,
      answered: !!p.answered,
      pending: p.pending || 0,
      resumeToken: p.resumeToken,
    })),
    buzzes: (g.buzzes || []).map((b) => ({
      playerId: b.playerId,
      at: b.at,
      status: b.status,
      points: b.points || 0,
    })),
    buzzingOpen: !!g.buzzingOpen,
    stats: g.stats || {},
    imported: !!g.imported,
  };
}

// Rebuilds the plain part of a room. Sockets, timers and telemetry belong to
// the running process and are attached by server.js once the row is loaded.
function restore(doc) {
  if (!doc || doc.format !== FORMAT || !doc.quiz || !doc.code)
    throw Error("This is not a saved live game.");
  if (!Array.isArray(doc.quiz.rounds)) throw Error("The saved quiz is damaged.");
  const questions = doc.quiz.rounds.flatMap((r, i) =>
    r.questions.map((q) => ({
      ...q,
      round: r.title,
      roundIndex: i,
    })),
  );
  if (!questions.length) throw Error("The saved quiz has no questions.");
  const index = Number.isInteger(doc.index) ? doc.index : -1;
  const status = String(doc.status || "lobby");
  return {
    code: doc.code,
    quiz: doc.quiz,
    quizId: doc.quizId || "",
    organization: doc.organization || "",
    adminId: doc.adminId,
    hostToken: doc.hostToken,
    displayToken: doc.displayToken,
    displaySession: doc.displaySession,
    created: doc.created || Date.now(),
    status,
    index,
    deadline: doc.deadline || null,
    startedAt: doc.startedAt || null,
    leaderboardVisible: !!doc.leaderboardVisible,
    musicState: doc.musicState || { playing: true, volume: 0.3 },
    reportId: doc.reportId || null,
    questions,
    players: new Map(
      (doc.players || []).map((p) => [
        p.id,
        {
          id: p.id,
          name: p.name,
          avatar: p.avatar || "",
          score: Number(p.score) || 0,
          answered: !!p.answered,
          pending: Number(p.pending) || 0,
          resumeToken: p.resumeToken,
          ws: null,
        },
      ]),
    ),
    buzzes: (doc.buzzes || []).map((b) => ({ ...b })),
    buzzingOpen: !!doc.buzzingOpen,
    stats: doc.stats || {},
    history: [],
    historySeq: 0,
    imported: !!doc.imported,
    resumedFrom: doc.saved || null,
  };
}

async function save(g) {
  const document = JSON.stringify(serialize(g));
  await db
    .prepare(
      "INSERT INTO live_games (code,admin_id,saved,document) VALUES (?,?,?,?) " +
        "ON CONFLICT (code) DO UPDATE SET admin_id=?, saved=?, document=?",
    )
    .run(g.code, g.adminId, Date.now(), document, g.adminId, Date.now(), document);
}

async function appendAnswer(g, entry) {
  await db
    .prepare("INSERT INTO live_answers (code,seq,document) VALUES (?,?,?)")
    .run(g.code, entry.seq, JSON.stringify(entry));
}

async function loadAnswers(g) {
  const rows = await db
    .prepare("SELECT seq, document FROM live_answers WHERE code=? ORDER BY seq")
    .all(g.code);
  g.history = rows.map((r) => JSON.parse(r.document));
  g.historySeq = rows.length ? Number(rows[rows.length - 1].seq) : 0;
}

async function forget(code) {
  await db.prepare("DELETE FROM live_answers WHERE code=?").run(code);
  await db.prepare("DELETE FROM live_games WHERE code=?").run(code);
}

// Every save is advisory. A database hiccup must never interrupt a game.
async function saveQuietly(g) {
  try {
    await save(g);
    return true;
  } catch (e) {
    console.error("Could not save the live game for recovery.");
    return false;
  }
}

async function appendQuietly(g, entry) {
  try {
    await appendAnswer(g, entry);
    return true;
  } catch (e) {
    console.error("Could not save an answer for recovery.");
    return false;
  }
}

module.exports = {
  FORMAT,
  VERSION,
  RESUME_MS,
  RESUME_HOURS,
  serialize,
  restore,
  save,
  saveQuietly,
  appendAnswer,
  appendQuietly,
  loadAnswers,
  forget,
};
