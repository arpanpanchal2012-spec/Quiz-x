"use strict";
// The two ways a live event is actually lost in practice: the host's laptop
// dies with the tab that held the room's token, or a player's phone dies with
// theirs. Both must be recoverable without ending the event.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const WebSocket = require("ws");

const root = path.join(__dirname, "..");
const port = 4165;
const origin = `http://localhost:${port}`;
const dirs = [];
const freshData = () => {
  const dir = fs.mkdtempSync(path.join(root, ".test-reclaim-"));
  dirs.push(dir);
  return dir;
};

function start(env = {}) {
  const data = env.DATA_DIR || freshData();
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
      HOST_RECONNECT_MINUTES: "30",
      ...env,
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
  return { child, ready, data };
}

function stopped(server) {
  return new Promise((resolve) => {
    if (server.child.exitCode !== null) return resolve();
    server.child.once("exit", resolve);
    server.child.kill("SIGKILL");
  });
}

function session() {
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
      const sock = new WebSocket(`ws://localhost:${port}/live`, {
        origin,
        headers: cookie ? { Cookie: cookie } : {},
      });
      const c = { ws: sock, inbox: [], waiting: [] };
      sock.on("message", (d) => {
        const m = JSON.parse(d);
        const i = c.waiting.findIndex((w) => w.type === m.type);
        if (i >= 0) c.waiting.splice(i, 1)[0].resolve(m);
        else c.inbox.push(m);
      });
      c.send = (type, data = {}) => sock.send(JSON.stringify({ type, ...data }));
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
      c.close = () => sock.close();
      sock.once("open", () => resolve(c));
      sock.once("error", reject);
    });
  return { request, socket };
}

const quiz = {
  title: "Reclaim room",
  description: "",
  rounds: [
    {
      title: "Round one",
      questions: [
        {
          type: "choice",
          text: "First question",
          options: ["A", "B"],
          correct: 0,
          seconds: 60,
          points: 1000,
        },
        {
          type: "choice",
          text: "Second question",
          options: ["A", "B"],
          correct: 0,
          seconds: 60,
          points: 1000,
        },
      ],
    },
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("a lost tab never ends a live event", { timeout: 120000 }, async (t) => {
  t.after(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  const server = start();
  const host = session();
  const other = session();
  let code, hostToken, seatToken;

  try {
    await server.ready;

    await t.test("a room is under way with one answered question", async () => {
      const password = crypto.randomBytes(24).toString("base64");
      assert.equal(
        (
          await host.request("/api/setup", "POST", {
            email: "reclaim@example.test",
            password,
            organization: "Reclaim test",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await host.request("/api/login", "POST", {
            email: "reclaim@example.test",
            password,
          })
        ).status,
        200,
      );
      const saved = await host.request("/api/quizzes", "POST", quiz);
      const h = await host.socket();
      h.send("create_game", { quizId: saved.value.id });
      const created = await h.wait("game_created");
      code = created.game.code;
      hostToken = created.hostToken;

      const p = await host.socket();
      p.send("join_game", { code, name: "Rahul" });
      const joined = await p.wait("joined");
      seatToken = joined.playerToken;
      p.send("join_game", { code, name: "Meera" });
      // (the same socket cannot join twice) — use a second one
      const p2 = await host.socket();
      p2.send("join_game", { code, name: "Meera" });
      await p2.wait("joined");

      h.send("next_question");
      const started = await p.wait("question_started");
      p.send("submit_answer", { questionId: started.question.id, answer: 0 });
      await p.wait("answer_received");
      // Close every browser tab: the tokens that lived in them are gone.
      h.close();
      p.close();
      p2.close();
      await sleep(300);
    });

    await t.test("the host finds and takes back their own room", async () => {
      const rooms = await host.request("/api/live/rooms");
      assert.equal(rooms.status, 200);
      assert.equal(rooms.value.length, 1, "the room is listed for its owner");
      const [room] = rooms.value;
      assert.equal(room.code, code);
      assert.equal(room.status, "question");
      assert.equal(room.players, 2);

      const fresh = await host.socket();
      fresh.send("claim_host", { code });
      const back = await fresh.wait("host_resumed");
      assert.equal(back.game.code, code);
      assert.equal(back.game.status, "question", "still on the same question");
      assert.equal(back.game.index, 0);
      assert.ok(back.hostToken, "a fresh token is minted");
      assert.notEqual(back.hostToken, hostToken, "and the old one is replaced");
      fresh.close();
    });

    await t.test("the replaced token no longer opens the room", async () => {
      const stale = await host.socket();
      stale.send("resume_host", { code, hostToken });
      const refused = await stale.wait("error");
      assert.match(refused.message, /Unable to resume/);
      stale.close();
    });

    await t.test("a visitor who is not signed in cannot claim it", async () => {
      // There is no public signup: anyone who is not signed in has no account
      // at all, and must not be able to reach or take a room.
      const rooms = await other.request("/api/live/rooms");
      assert.equal(rooms.status, 401, "the room list needs a signed-in host");
      const thief = await other.socket();
      thief.send("claim_host", { code });
      const refused = await thief.wait("error");
      assert.match(refused.message, /sign in/i);
      thief.close();
    });

    await t.test("a player whose phone died gets their seat back", async () => {
      const h = await host.socket();
      h.send("claim_host", { code });
      await h.wait("host_resumed");

      const again = await host.socket();
      again.send("join_game", { code, name: "Rahul" });
      const joined = await again.wait("joined");
      assert.equal(joined.reclaimed, true, "the seat was reclaimed, not recreated");
      // The question is still open, so the earned points are pending rather
      // than banked; either way they belong to the seat that was reclaimed.
      const seat = joined.game.participants.find((p) => p.name === "Rahul");
      assert.equal(seat.answered, true, "their answer is still recorded");
      assert.ok(
        seat.id === joined.playerId && seat.id.length > 0,
        "and it is the same seat, not a new player",
      );
      const told = await h.wait("seat_reclaimed");
      assert.match(told.message, /Rahul rejoined/);
      again.close();
      h.close();
    });

    await t.test("a seat in use is never taken from under someone", async () => {
      const seating = await host.socket();
      seating.send("join_game", { code, name: "Anita" });
      await seating.wait("joined");
      const thief = await host.socket();
      thief.send("join_game", { code, name: "Anita" });
      const refused = await thief.wait("error");
      assert.match(refused.message, /nickname is taken/i);
      thief.close();
      seating.close();
    });

    await t.test("the original browser token still works after a normal reload", async () => {
      const h = await host.socket();
      h.send("claim_host", { code });
      const claimed = await h.wait("host_resumed");
      h.close();
      // A reload keeps the token in the tab; that path must keep working.
      const reload = await host.socket();
      reload.send("resume_host", { code, hostToken: claimed.hostToken });
      const resumed = await reload.wait("host_resumed");
      assert.equal(resumed.game.code, code);
      reload.send("end_game");
      await reload.wait("game_ended");
      reload.close();
    });

    await t.test("a finished room is offered to nobody", async () => {
      const rooms = await host.request("/api/live/rooms");
      assert.equal(rooms.value.length, 0, "no strip once the game has ended");
      const late = await host.socket();
      late.send("claim_host", { code });
      const refused = await late.wait("error");
      assert.match(refused.message, /not running|already finished/i);
      late.close();
      void seatToken;
    });
  } finally {
    await stopped(server);
  }
});
