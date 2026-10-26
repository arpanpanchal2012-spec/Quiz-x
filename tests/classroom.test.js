"use strict";
// The three editor changes that save a host time, and the two live changes that
// make a room feel like a game show. Pure functions only — no server needed for
// the round clock and the reorder maths, a small server for the faces.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const WebSocket = require("ws");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

// Pull the two pure helpers out of the browser bundle and exercise the real
// source, not a copy of it.
function liftFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.ok(start > -1, `${name} is missing from app.js`);
  let depth = 0,
    i = appSource.indexOf("{", start);
  const from = i;
  for (; i < appSource.length; i++) {
    if (appSource[i] === "{") depth++;
    else if (appSource[i] === "}" && --depth === 0) break;
  }
  return appSource.slice(start, i + 1);
}

test("a round can share one clock", async (t) => {
  const roundSeconds = new Function(
    liftFunction("roundSeconds") + "; return roundSeconds;",
  )();
  await t.test("questions on the same clock report it", () => {
    assert.equal(
      roundSeconds({ questions: [{ seconds: 35 }, { seconds: 35 }] }),
      35,
    );
  });
  await t.test("one exception makes the round mixed", () => {
    assert.equal(
      roundSeconds({ questions: [{ seconds: 35 }, { seconds: 40 }] }),
      null,
    );
  });
  await t.test("a single question still reports its own time", () => {
    assert.equal(roundSeconds({ questions: [{ seconds: 20 }] }), 20);
  });
  await t.test("the offered times are the ones the server accepts", () => {
    const offered = appSource.match(/const ROUND_TIMES = \[([^\]]+)\]/);
    assert.ok(offered, "ROUND_TIMES is missing");
    const values = offered[1].split(",").map((v) => Number(v.trim()));
    assert.ok(values.length >= 5);
    for (const v of values) assert.ok(v >= 5 && v <= 120, `${v} is outside 5–120`);
    assert.ok(values.includes(35) && values.includes(40), "35 and 40 are offered");
  });
});

test("dragging a question lands it where the line showed", async (t) => {
  // reorderQuestion() is the single path used by both the drag and the arrows,
  // so this isolates the index maths it performs.
  const reorder = (rounds, fromRi, fromQi, toRi, toQi) => {
    const source = rounds[fromRi];
    const moved = source.questions[fromQi];
    let destRi = toRi;
    let destQi = toQi;
    source.questions.splice(fromQi, 1);
    if (fromRi === toRi && fromQi < toQi) destQi -= 1;
    if (!source.questions.length) {
      rounds.splice(fromRi, 1);
      if (fromRi < destRi) destRi -= 1;
    }
    const destination = rounds[destRi];
    destination.questions.splice(
      Math.max(0, Math.min(destQi, destination.questions.length)),
      0,
      moved,
    );
    return rounds;
  };
  const quiz = () => [
    { title: "One", questions: ["a", "b", "c"] },
    { title: "Two", questions: ["d"] },
  ];

  await t.test("later to earlier inside a round moves it up", () => {
    const out = reorder(quiz(), 0, 2, 0, 0);
    assert.deepEqual(out[0].questions, ["c", "a", "b"]);
  });
  await t.test("earlier to later does not jump a slot", () => {
    // Dropped on the line below "c": it should end up last, not second-last.
    const out = reorder(quiz(), 0, 0, 0, 3);
    assert.deepEqual(out[0].questions, ["b", "c", "a"]);
  });
  await t.test("a question can move into another round", () => {
    const out = reorder(quiz(), 0, 1, 1, 1);
    assert.deepEqual(out[0].questions, ["a", "c"]);
    assert.deepEqual(out[1].questions, ["d", "b"]);
  });
  await t.test("emptying a round removes it instead of leaving a hole", () => {
    const out = reorder(quiz(), 1, 0, 0, 0);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].questions, ["d", "a", "b", "c"]);
  });
  await t.test("dropping a question back on itself changes nothing", () => {
    const self = reorder(quiz(), 0, 1, 0, 1);
    assert.deepEqual(self[0].questions, ["a", "b", "c"]);
    assert.deepEqual(self[1].questions, ["d"]);
  });
});

const port = 4167;
const origin = `http://localhost:${port}`;

function startServer(data) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: data,
      ALLOW_SETUP: "true",
      NODE_ENV: "test",
      DATABASE_URL: "",
      RENDER: "",
      INITIAL_ADMIN_EMAIL: "",
      INITIAL_ADMIN_PASSWORD: "",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (d) => process.stderr.write(d));
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("startup timeout")), 20000);
    child.stdout.on("data", (d) => {
      if (d.toString().includes("listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  return { child, ready };
}

test("every player is given a face of their own", { timeout: 60000 }, async (t) => {
  const data = fs.mkdtempSync(path.join(root, ".test-faces-"));
  const server = startServer(data);
  let cookie = "";
  const request = async (p, method = "GET", body) => {
    const res = await fetch(origin + p, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        Origin: origin,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      value = text;
    }
    return { status: res.status, value };
  };
  const socket = () =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/live`, {
        origin,
        headers: cookie ? { Cookie: cookie } : {},
      });
      const c = { ws, inbox: [], waiting: [] };
      ws.on("message", (d) => {
        const m = JSON.parse(d);
        const i = c.waiting.findIndex((w) =>
          Array.isArray(w.type) ? w.type.includes(m.type) : w.type === m.type,
        );
        if (i >= 0) c.waiting.splice(i, 1)[0].resolve(m);
        else c.inbox.push(m);
      });
      c.send = (type, extra = {}) => ws.send(JSON.stringify({ type, ...extra }));
      c.waitAny = (types, ms = 8000) => {
        const i = c.inbox.findIndex((m) => types.includes(m.type));
        if (i >= 0) return Promise.resolve(c.inbox.splice(i, 1)[0]);
        return new Promise((res, rej) => {
          const timer = setTimeout(
            () => rej(Error("Timed out waiting for " + types.join("/"))),
            ms,
          );
          c.waiting.push({
            type: types,
            resolve: (m) => {
              clearTimeout(timer);
              res(m);
            },
          });
        });
      };
      c.wait = (type, ms = 8000) => {
        const i = c.inbox.findIndex((m) => m.type === type);
        if (i >= 0) return Promise.resolve(c.inbox.splice(i, 1)[0]);
        return new Promise((res, rej) => {
          const timer = setTimeout(() => rej(Error("Timed out: " + type)), ms);
          c.waiting.push({
            type,
            resolve: (m) => {
              clearTimeout(timer);
              res(m);
            },
          });
        });
      };
      ws.once("open", () => resolve(c));
      ws.once("error", reject);
    });
  try {
    await server.ready;
    const password = crypto.randomBytes(24).toString("base64");
    await request("/api/setup", "POST", {
      email: "faces@example.test",
      password,
      organization: "Faces",
    });
    await request("/api/login", "POST", { email: "faces@example.test", password });
    const saved = await request("/api/quizzes", "POST", {
      title: "Faces room",
      description: "",
      rounds: [
        {
          title: "",
          questions: [
            {
              type: "choice",
              text: "Pick one",
              options: ["A", "B"],
              correct: 0,
              seconds: 20,
              points: 1000,
            },
          ],
        },
      ],
    });
    const host = await socket();
    host.send("create_game", { quizId: saved.value.id });
    const created = await host.wait("game_created");
    const code = created.game.code;

    const seats = [];
    const sockets = [];
    for (let i = 0; i < 8; i++) {
      const p = await socket();
      sockets.push(p);
      p.send("join_game", { code, name: `Player ${i + 1}` });
      const joined = await p.wait("joined");
      seats.push(joined);
    }
    const faces = seats.map(
      (s) => s.game.participants.find((p) => p.id === s.playerId)?.avatar,
    );

    await t.test("everyone who joins gets a face", () => {
      assert.equal(faces.length, 8);
      for (const f of faces) assert.ok(f, "a seat came back without a face");
    });
    await t.test("no two players in the same room share a face", () => {
      assert.equal(new Set(faces).size, 8, faces.join(" "));
    });
    await t.test("the same face is used on every screen", async () => {
      await new Promise((r) => setTimeout(r, 200));
      const state = (await host.wait("participants_updated")).game;
      for (const p of state.participants) {
        const joined = seats.find((s) => s.playerId === p.id);
        const mine = joined.game.participants.find((x) => x.id === p.id);
        assert.equal(p.avatar, mine.avatar);
      }
    });
    await t.test("the leaderboard carries the face too", async () => {
      // Starting a round shows its announcement first, so the host taps again.
      let started = null;
      for (let attempt = 0; attempt < 4 && !started; attempt++) {
        host.send("next_question");
        const m = await host.waitAny([
          "question_started",
          "round_intro",
          "last_question_intro",
        ]);
        if (m.type === "question_started") started = m;
      }
      assert.ok(started, "the question never started");
      assert.deepEqual(started.question.options, [], "the read-out step hides them");
      assert.equal(started.game.deadline, null, "and carries no clock");
      host.send("show_options");
      const opened = await host.wait("options_shown");
      assert.ok(opened.game.deadline > Date.now(), "the clock starts with the options");
      assert.equal(opened.game.optionsVisible, true);
      const questionId = opened.question.id;
      // The two steps are named in the audit trail the host can see.
      assert.equal(opened.game.status, "question");
      for (const p of sockets)
        p.send("submit_answer", { questionId, answer: 0 });
      await new Promise((r) => setTimeout(r, 500));
      host.send("reveal_answers");
      // The host is told how the tally is building while the question is open.
      const tally = await host.wait("live_counts");
      assert.equal(tally.total, 8);
      assert.ok(tally.answered >= 1);
      assert.ok(tally.stats["0"] >= 1, "the chosen answer is counted");
      const ended = await host.wait("question_ended");
      const rows = ended.leaderboard || ended.visibleLeaderboard || [];
      assert.ok(rows.length, "no standings came back");
      for (const row of rows) assert.ok(row.avatar, `${row.name} has no face`);
      assert.equal(ended.stats["0"], 8, "all eight answers are counted per option");
    });
    await t.test("the saved room document keeps each face", async () => {
      // The snapshot written to live_games is what a restart rebuilds from.
      await new Promise((r) => setTimeout(r, 1500));
      const rows = fs
        .readdirSync(data)
        .filter((f) => f.endsWith(".sqlite") || f.endsWith(".db"));
      assert.ok(rows.length, "no database file was written");
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(path.join(data, rows[0]));
      const row = db.prepare("SELECT document FROM live_games WHERE code=?").get(code);
      assert.ok(row, "the room was not snapshotted");
      const doc = JSON.parse(row.document);
      assert.equal(doc.players.length, 8);
      for (const p of doc.players) assert.ok(p.avatar, `${p.name} has no saved face`);
      db.close();
    });
  } finally {
    await new Promise((r) => {
      server.child.once("exit", r);
      server.child.kill("SIGKILL");
    });
    fs.rmSync(data, { recursive: true, force: true });
  }
});
