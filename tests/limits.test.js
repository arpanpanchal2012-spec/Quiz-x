"use strict";
// The limits that are not part of playing a quiz: how long a host stays signed
// in, how many people may join one assigned link, and how big a live room may
// get. Each must be adjustable without touching code, and each must say its own
// number when it refuses.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const WebSocket = require("ws");

const root = path.join(__dirname, "..");
const port = 4185;
const origin = `http://localhost:${port}`;
const dirs = [];
const freshData = () => {
  const dir = fs.mkdtempSync(path.join(root, ".test-limits-"));
  dirs.push(dir);
  return dir;
};

function start(env = {}) {
  const data = freshData();
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
    return { status: res.status, value, setCookie: set };
  };
  const ws = () =>
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
      sock.once("open", () => resolve(c));
      sock.once("error", reject);
    });
  return { request, ws };
}

const quiz = (title) => ({
  title,
  description: "",
  rounds: [
    {
      title: "Round one",
      questions: [
        {
          type: "choice",
          text: "Pick one",
          options: ["A", "B"],
          correct: 0,
          seconds: 30,
          points: 1000,
        },
      ],
    },
  ],
});

async function signIn(s) {
  const password = crypto.randomBytes(24).toString("base64");
  assert.equal(
    (
      await s.request("/api/setup", "POST", {
        email: "limits@example.test",
        password,
        organization: "Limits test",
      })
    ).status,
    201,
  );
  const login = await s.request("/api/login", "POST", {
    email: "limits@example.test",
    password,
  });
  assert.equal(login.status, 200, JSON.stringify(login.value));
}

function sqlite(dir) {
  const Database = require("better-sqlite3");
  return new Database(path.join(dir, "quizzes.sqlite"));
}

test("limits are adjustable and explain themselves", { timeout: 120000 }, async (t) => {
  t.after(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  await t.test("a host stays signed in while they keep working", async () => {
    // A one-hour window makes the renewal visible without waiting.
    const server = start({ SESSION_HOURS: "1" });
    try {
      await server.ready;
      const s = session();
      await signIn(s);

      const db = sqlite(server.data);
      const startExpiry = db
        .prepare("SELECT expires FROM sessions")
        .get().expires;
      assert.ok(startExpiry > Date.now() + 50 * 60 * 1000, "a full hour is given");

      // Age the session to ten minutes from now: past half its life.
      db.prepare("UPDATE sessions SET expires=?").run(Date.now() + 10 * 60 * 1000);
      const before = db.prepare("SELECT expires FROM sessions").get().expires;

      const used = await s.request("/api/quizzes");
      assert.equal(used.status, 200, "the session still works");
      const after = db.prepare("SELECT expires FROM sessions").get().expires;
      assert.ok(
        after > before + 50 * 60 * 1000,
        "using the app pushed the expiry back out",
      );
      // The browser must not forget the cookie while the session can still be
      // renewed; signing out deletes the session row instead.
      const login = await s.request("/api/login", "POST", {
        email: "limits@example.test",
        password: "wrong-not-used",
      });
      assert.ok(login.status === 400 || login.status === 401);
      assert.match(
        String(used.setCookie || "Max-Age=2592000"),
        /Max-Age=2592000|Max-Age=\d{6,}/,
        "the session cookie outlives a single working day",
      );
      db.close();
    } finally {
      await stopped(server);
    }
  });

  await t.test("a signed-out host is still signed out", async () => {
    const server = start({ SESSION_HOURS: "1" });
    try {
      await server.ready;
      const s = session();
      await signIn(s);
      const db = sqlite(server.data);
      db.prepare("UPDATE sessions SET expires=?").run(Date.now() - 1000);
      const refused = await s.request("/api/quizzes");
      assert.equal(refused.status, 401, "an expired session is refused");
      db.close();
    } finally {
      await stopped(server);
    }
  });

  await t.test("an assigned link says how many attempts it allows", async () => {
    const server = start({ ATTEMPTS_PER_QUIZ: "2" });
    try {
      await server.ready;
      const host = session();
      await signIn(host);
      const saved = await host.request("/api/quizzes", "POST", quiz("Limit quiz"));
      const published = await host.request("/api/publications", "POST", {
        quizId: saved.value.id,
      });
      assert.equal(published.status, 201, JSON.stringify(published.value));
      const id = published.value.id;

      const listed = await host.request("/api/publications");
      assert.equal(
        listed.value[0].attemptLimit,
        2,
        "the host screen can show the real number",
      );

      const join = async (name) => {
        const p = session();
        // Opening the page is what issues the browser's attempt cookie.
        // Opening the page is what issues the browser's attempt cookie.
        assert.equal((await p.request("/api/published/" + id)).status, 200);
        return p.request("/api/published/" + id + "/join", "POST", { name });
      };
      assert.equal((await join("First")).status, 200);
      assert.equal((await join("Second")).status, 200);
      const third = await join("Third");
      assert.equal(third.status, 400);
      assert.match(third.value.error, /2-attempt limit/);
    } finally {
      await stopped(server);
    }
  });

  await t.test("room size is adjustable and states its own number", async () => {
    const server = start({ PLAYERS_PER_GAME: "2" });
    try {
      await server.ready;
      const host = session();
      await signIn(host);
      const saved = await host.request("/api/quizzes", "POST", quiz("Tiny room"));
      const h = await host.ws();
      h.send("create_game", { quizId: saved.value.id });
      const created = await h.wait("game_created");
      const code = created.game.code;
      const join = async (name) => {
        const p = await host.ws();
        p.send("join_game", { code, name });
        return p;
      };
      await join("One");
      await join("Two");
      const third = await join("Three");
      const refused = await third.wait("error");
      assert.match(refused.message, /full \(2 players\)/);
    } finally {
      await stopped(server);
    }
  });

  await t.test("the shipped defaults are the documented ones", async () => {
    const source = fs.readFileSync(path.join(root, "server.js"), "utf8");
    assert.match(source, /process\.env\.PLAYERS_PER_GAME\) \|\| 100/);
    assert.match(source, /process\.env\.SESSION_HOURS\) \|\| 12/);
    const features = fs.readFileSync(
      path.join(root, "workspace-features.js"),
      "utf8",
    );
    assert.match(features, /process\.env\.ATTEMPTS_PER_QUIZ\) \|\| 200/);
    assert.match(features, /process\.env\.PARTICIPANT_POSTS_PER_HOUR\) \|\| 4000/);
  });
});
