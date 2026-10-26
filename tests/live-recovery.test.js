"use strict";
// A live game must survive the server going away. Two cases are proven here:
// the same site coming back after a restart, and a second, completely separate
// installation picking the room up from a saved copy. Neither may change how a
// game plays: same code, same players, same scores, same question.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const WebSocket = require("ws");

const root = path.join(__dirname, "..");
const dataA = fs.mkdtempSync(path.join(root, ".test-live-a-"));
const dataB = fs.mkdtempSync(path.join(root, ".test-live-b-"));
const portA = 4191;
const portB = 4192;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launch(dataDir, port) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      ALLOW_SETUP: "true",
      NODE_ENV: "test",
      DATABASE_URL: "",
      RENDER: "",
      INITIAL_ADMIN_EMAIL: "",
      INITIAL_ADMIN_PASSWORD: "",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_KEY: "",
      HOST_RECONNECT_MINUTES: "30",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (d) => process.stderr.write(d));
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Server startup timed out")),
      20000,
    );
    child.stdout.on("data", (d) => {
      if (d.toString().includes("listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  return { child, ready };
}

function stopped(server) {
  return new Promise((resolve) => {
    server.child.once("exit", resolve);
    server.child.kill("SIGTERM");
  });
}

function session(origin) {
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
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const text = await res.text();
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      value = text;
    }
    return { res, value };
  };
  const client = () => {
    const ws = new WebSocket(origin.replace("http", "ws") + "/live", {
      origin,
      headers: cookie ? { Cookie: cookie } : {},
    });
    const c = {
      ws,
      inbox: [],
      listeners: [],
      send(type, data = {}) {
        ws.send(JSON.stringify({ type, ...data }));
      },
      wait(type, predicate = () => true) {
        const i = c.inbox.findIndex((x) => x.type === type && predicate(x));
        if (i >= 0) return Promise.resolve(c.inbox.splice(i, 1)[0]);
        return new Promise((resolve, reject) => {
          const entry = {
            type,
            predicate,
            resolve: (m) => {
              clearTimeout(timer);
              resolve(m);
            },
          };
          const timer = setTimeout(() => {
            c.listeners = c.listeners.filter((x) => x !== entry);
            reject(Error("Timed out: " + type));
          }, 10000);
          c.listeners.push(entry);
        });
      },
      close() {
        ws.close();
      },
    };
    ws.on("message", (d) => {
      const m = JSON.parse(d);
      const i = c.listeners.findIndex(
        (x) => x.type === m.type && x.predicate(m),
      );
      if (i >= 0) c.listeners.splice(i, 1)[0].resolve(m);
      else c.inbox.push(m);
    });
    return new Promise((resolve, reject) => {
      ws.once("open", () => resolve(c));
      ws.once("error", reject);
    });
  };
  return { request, client, get cookie() { return cookie; } };
}

const quiz = {
  title: "Recovery night",
  description: "Two quick questions.",
  rounds: [
    {
      title: "Opening round",
      questions: [
        {
          type: "choice",
          text: "Which colour is the sky?",
          options: ["Blue", "Green"],
          correct: 0,
          seconds: 5,
          points: 1000,
        },
        {
          type: "choice",
          text: "Two plus two?",
          options: ["4", "5"],
          correct: 0,
          seconds: 60,
          points: 1000,
        },
      ],
    },
  ],
};

test(
  "a live game resumes on the same site and can be carried to a second site",
  { timeout: 180000 },
  async (t) => {
    const originA = `http://localhost:${portA}`;
    const originB = `http://localhost:${portB}`;
    const A = session(originA);
    const B = session(originB);
    let serverA = launch(dataA, portA);
    let serverB;
    let code;
    let hostToken;
    const players = [];
    const names = ["Anita", "Rahul"];

    try {
      await serverA.ready;
      const password = crypto.randomBytes(24).toString("base64");
      assert.equal(
        (
          await A.request("/api/setup", "POST", {
            email: "live@example.test",
            password,
            organization: "Live test",
          })
        ).res.status,
        201,
      );
      assert.equal(
        (await A.request("/api/login", "POST", { email: "live@example.test", password }))
          .res.status,
        200,
      );
      const saved = await A.request("/api/quizzes", "POST", quiz);
      assert.equal(saved.res.status, 201, JSON.stringify(saved.value));

      await t.test("a room starts and two players answer", async () => {
        const host = await A.client();
        host.send("create_game", { quizId: saved.value.id });
        const created = await host.wait("game_created");
        code = created.game.code;
        hostToken = created.hostToken;
        assert.match(code, /^QZ[A-Z0-9]{6}$/);
        for (const name of names) {
          const p = await A.client();
          p.send("join_game", { code, name });
          const joined = await p.wait("joined");
          p.token = joined.playerToken;
          p.name = name;
          players.push(p);
        }
        host.send("next_question");
        for (const p of players) await p.wait("question_started");
        host.send("show_options");
        const shown = await players[0].wait("options_shown");
        assert.ok(shown.game.deadline > Date.now(), "the clock starts with the options");
        const questionId = shown.question.id;
        for (const p of players) {
          p.send("submit_answer", {
            questionId,
            answer: 0,
          });
          await p.wait("answer_received");
        }
        const roster = await host.wait(
          "participants_updated",
          (m) => m.game.participants.every((x) => x.answered),
        );
        assert.equal(roster.game.participants.length, 2);
        host.close();
        // The room mirror is written once per second; give it that second.
        await sleep(1600);
      });

      await t.test("the server is stopped and comes back on the same code", async () => {
        await stopped(serverA);
        serverA = launch(dataA, portA);
        await serverA.ready;
        await sleep(600);
      });

      await t.test("the host resumes and finds the room as it was", async () => {
        const host = await A.client();
        host.send("resume_host", { code, hostToken });
        const resumed = await host.wait("host_resumed");
        assert.equal(resumed.game.code, code);
        assert.equal(resumed.game.status, "question");
        assert.equal(resumed.game.index, 0);
        assert.equal(resumed.game.participants.length, 2);
        assert.ok(
          resumed.game.participants.every((p) => p.answered),
          "both answers survived the restart",
        );
        // The countdown that was running is still running, on the same clock.
        const ended = await host.wait("question_ended");
        assert.equal(ended.game.status, "results");
        assert.equal(ended.game.participants.filter((p) => p.score > 0).length, 2);
        host.close();
      });

      await t.test("players reconnect with their own token and keep their score", async () => {
        for (const old of players) {
          const again = await A.client();
          again.send("resume_player", { code, playerToken: old.token });
          const joined = await again.wait("joined");
          assert.equal(joined.playerId, old.id || joined.playerId);
          assert.equal(
            joined.game.participants.find((p) => p.name === old.name).score > 0,
            true,
            `${old.name} kept the points earned before the restart`,
          );
          old.reconnected = again;
        }
      });

      await t.test("the saved copy carries the quiz, the players and the scores", async () => {
        const exported = await A.request(`/api/live/${code}/export`);
        assert.equal(exported.res.status, 200, JSON.stringify(exported.value));
        const bundle = exported.value;
        assert.equal(bundle.format, "quizzes-live-export");
        assert.equal(bundle.game.code, code);
        assert.equal(bundle.game.players.length, 2);
        assert.equal(bundle.answers.length, 2);
        assert.equal(bundle.game.hostToken, undefined, "tokens never travel");
        assert.equal(bundle.game.displayToken, undefined);
        A.bundle = bundle;
      });

      await t.test("a second installation refuses a file that is not a game", async () => {
        serverB = launch(dataB, portB);
        await serverB.ready;
        const password = crypto.randomBytes(24).toString("base64");
        assert.equal(
          (
            await B.request("/api/setup", "POST", {
              email: "second@example.test",
              password,
              organization: "Second site",
            })
          ).res.status,
          201,
        );
        assert.equal(
          (
            await B.request("/api/login", "POST", {
              email: "second@example.test",
              password,
            })
          ).res.status,
          200,
        );
        const bad = await B.request("/api/live/import", "POST", {
          format: "something-else",
        });
        assert.equal(bad.res.status, 400);
      });

      await t.test("the other site resumes the room under the same code", async () => {
        const imported = await B.request("/api/live/import", "POST", A.bundle);
        assert.equal(imported.res.status, 201, JSON.stringify(imported.value));
        assert.equal(imported.value.code, code);
        assert.equal(imported.value.players, 2);
        assert.ok(imported.value.hostToken);
        B.hostToken = imported.value.hostToken;

        const quizzesOnB = await B.request("/api/quizzes");
        assert.ok(
          quizzesOnB.value.some((q) => q.title === quiz.title),
          "the quiz travelled with the room",
        );

        const host = await B.client();
        host.send("resume_host", { code, hostToken: B.hostToken });
        const resumed = await host.wait("host_resumed");
        assert.equal(resumed.game.code, code);
        assert.equal(resumed.game.participants.length, 2);
        assert.ok(
          resumed.game.participants.every((p) => p.score > 0),
          "scores crossed to the second site",
        );
        host.close();
      });

      await t.test("a player takes back their own seat by name", async () => {
        const p = await B.client();
        p.send("join_game", { code, name: "Anita" });
        const joined = await p.wait("joined");
        assert.equal(joined.reclaimed, true);
        assert.ok(
          joined.game.participants.find((x) => x.name === "Anita").score > 0,
        );
        // Somebody else cannot take a seat that is already connected.
        const thief = await B.client();
        thief.send("join_game", { code, name: "Anita" });
        const refused = await thief.wait("error");
        assert.match(refused.message, /nickname is taken/i);
        p.close();
        thief.close();
      });

      await t.test("nothing about the room was changed by resuming it", async () => {
        // Playing on from a resumed room works exactly as a normal one.
        const host = await B.client();
        host.send("resume_host", { code, hostToken: B.hostToken });
        await host.wait("host_resumed");
        // Moving to the final question of a round passes through its intro.
        host.send("next_question");
        await host.wait("last_question_intro");
        host.send("next_question");
        const next = await host.wait("question_started");
        assert.equal(next.game.index, 1);
        assert.equal(next.question.text, "Two plus two?");
        host.send("end_game");
        const ended = await host.wait("game_ended");
        assert.ok(ended.reportId, "the finished game still writes a report");
        host.close();
      });

      await t.test("a room nobody comes back to is closed and reported", async () => {
        const Database = require("better-sqlite3");
        await stopped(serverA);
        // While the site is down, age the room by two days: this is what an
        // event that was never resumed looks like when the site returns.
        const db = new Database(path.join(dataA, "quizzes.sqlite"));
        db.prepare("UPDATE live_games SET saved=? WHERE code=?").run(
          Date.now() - 48 * 60 * 60 * 1000,
          code,
        );
        db.close();
        serverA = launch(dataA, portA);
        await serverA.ready;
        await sleep(800);
        const reports = await A.request("/api/reports");
        assert.ok(
          reports.value.some((r) => r.code === code),
          "the abandoned room kept its results as a report",
        );
        const exported = await A.request(`/api/live/${code}/export`);
        assert.equal(exported.res.status, 404, "and it is no longer resumable");
      });
    } finally {
      for (const p of players) p.close?.();
      await stopped(serverA).catch(() => {});
      if (serverB) await stopped(serverB).catch(() => {});
      fs.rmSync(dataA, { recursive: true, force: true });
      fs.rmSync(dataB, { recursive: true, force: true });
    }
  },
);
