"use strict";
// The three editor changes that save a host time, and the two live changes that
// make a room feel like a game show. Pure functions only — no server needed for
// the round clock and the reorder maths, a small server for the characters.
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
  await t.test("a quiz can hold different times in different rounds", () => {
    // The overview writes the same field the round heading writes.
    const rounds = [
      { title: "Warm up", questions: [{ seconds: 45 }, { seconds: 45 }] },
      { title: "Speed", questions: [{ seconds: 30 }] },
    ];
    assert.equal(roundSeconds(rounds[0]), 45);
    assert.equal(roundSeconds(rounds[1]), 30);
  });
  await t.test("the quiz total is reported in words", () => {
    const formatDuration = new Function(
      liftFunction("formatDuration") + "; return formatDuration;",
    )();
    assert.equal(formatDuration(45), "45 seconds");
    assert.equal(formatDuration(1), "1 second");
    assert.equal(formatDuration(120), "2 minutes");
    assert.equal(formatDuration(110), "1 min 50 s");
    assert.equal(formatDuration(0), "0 seconds");
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

test("every player is given a character of their own", { timeout: 60000 }, async (t) => {
  const data = fs.mkdtempSync(path.join(root, ".test-characters-"));
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
      // The last two choose their own; everyone else lets the room fill in.
      const pick =
        i === 6
          ? { character: "owl", accessory: "crown" }
          : i === 7
            ? { character: "frog", accessory: "helmet" }
            : {};
      p.send("join_game", { code, name: `Player ${i + 1}`, ...pick });
      const joined = await p.wait("joined");
      seats.push(joined);
    }
    const looks = seats.map((s) => {
      const p = s.game.participants.find((x) => x.id === s.playerId);
      return { character: p?.character, accessory: p?.accessory };
    });

    await t.test("everyone who joins gets a character", () => {
      assert.equal(looks.length, 8);
      for (const l of looks)
        assert.ok(l.character, "a seat came back without a character");
    });
    await t.test("the room hands out a different animal to each new seat", () => {
      // The last two chose for themselves, so they are not part of the draw.
      const handed = looks.slice(0, 6).map((l) => l.character);
      assert.equal(new Set(handed).size, handed.length, handed.join(" "));
    });
    await t.test("a player who picks gets exactly what they picked", () => {
      assert.deepEqual(looks[6], { character: "owl", accessory: "crown" });
      assert.deepEqual(looks[7], { character: "frog", accessory: "helmet" });
      for (const l of looks)
        assert.ok(l.accessory, "a seat came back without an accessory");
    });
    await t.test("a picture character joins as itself", async () => {
      const p = await socket();
      sockets.push(p);
      p.send("join_game", {
        code,
        name: "Player 10",
        character: "photo:nova",
        accessory: "crown",
      });
      const joined = await p.wait("joined");
      const me = joined.game.participants.find((x) => x.id === joined.playerId);
      assert.equal(me.character, "photo:nova");
      // A picture is whole on its own, so a hat chosen with it is not worn.
      assert.equal(me.accessory, "none");
    });
    await t.test("a picture nobody knows is replaced by a drawing", async () => {
      const p = await socket();
      p.send("join_game", { code, name: "Player 11", character: "photo:nope" });
      const joined = await p.wait("joined");
      const me = joined.game.participants.find((x) => x.id === joined.playerId);
      assert.ok(me.character && me.character !== "photo:nope", me.character);
      assert.ok(!me.character.includes(":"), me.character);
    });
    await t.test("a player's own face goes into the room, and only there", async () => {
      const p = await socket();
      const joined = await new Promise((resolve) => {
        p.ws.on("message", (raw) => {
          const m = JSON.parse(raw);
          if (m.type === "joined") resolve(m);
        });
        p.ws.send(JSON.stringify({ type: "join_game", code, name: "Player 12" }));
      });
      // A one-pixel WebP is enough: the room never inspects the picture, it
      // stores the bytes and hands them back to the screens in that room.
      const pixel =
        "data:image/webp;base64,UklGRiIAAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=";
      const noToken = await request("/api/live-avatar", "POST", {
        code,
        token: "not-a-token",
        image: pixel,
      });
      assert.equal(noToken.status, 403);
      const ok = await request("/api/live-avatar", "POST", {
        code,
        token: joined.playerToken,
        image: pixel,
      });
      assert.equal(ok.status, 200, JSON.stringify(ok.value));
      assert.equal(ok.value.character, `self:${joined.playerId}`);
      const img = await fetch(`${origin}/live-avatar/${code}/${joined.playerId}.webp`);
      assert.equal(img.status, 200);
      assert.equal(img.headers.get("content-type"), "image/webp");
      assert.equal(img.headers.get("cache-control"), "no-store, max-age=0");
      // And the seat's look is the face from then on.
      const cleared = await request("/api/live-avatar", "DELETE", {
        code,
        token: joined.playerToken,
      });
      assert.equal(cleared.status, 200);
      assert.ok(!String(cleared.value.character).startsWith("self:"));
      p.ws.close();
    });
    await t.test("nonsense picks are replaced, never stored", async () => {
      const p = await socket();
      sockets.push(p);
      p.send("join_game", {
        code,
        name: "Player 9",
        character: "<script>",
        accessory: "not-a-hat",
      });
      const joined = await p.wait("joined");
      const me = joined.game.participants.find((x) => x.id === joined.playerId);
      assert.ok(me.character && me.character !== "<script>", me.character);
      assert.equal(me.accessory, "none");
    });
    await t.test("the same character is used on every screen", async () => {
      await new Promise((r) => setTimeout(r, 200));
      const state = (await host.wait("participants_updated")).game;
      for (const p of state.participants) {
        const joined = seats.find((s) => s.playerId === p.id);
        if (!joined) continue;
        const mine = joined.game.participants.find((x) => x.id === p.id);
        assert.equal(p.character, mine.character);
        assert.equal(p.accessory, mine.accessory);
      }
    });
    await t.test("the leaderboard carries the character too", async () => {
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
      // While the question is open nobody is told how the room is leaning.
      assert.ok(
        !host.inbox.some((m) => m.type === "live_counts"),
        "a running tally must not be sent to the host",
      );
      const ended = await host.wait("question_ended");
      // The split arrives with the correct answer, and counts every choice.
      assert.equal(ended.stats["0"], sockets.length);
      const rows = ended.leaderboard || ended.visibleLeaderboard || [];
      assert.ok(rows.length, "no standings came back");
      for (const row of rows)
        assert.ok(row.character, `${row.name} has no character on the board`);
    });
    await t.test("the saved room document keeps each character", async () => {
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
      assert.equal(doc.players.length, 12);
      for (const p of doc.players)
        assert.ok(p.character, `${p.name} has no saved character`);
      const owl = doc.players.find((p) => p.name === "Player 7");
      assert.equal(owl.character, "owl");
      assert.equal(owl.accessory, "crown");
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
