"use strict";
// Carrying a finished quiz to another account. The file must hold the quiz, its
// pictures and its sounds; the receiving account must own fresh copies; and
// nothing about the quiz — answers, timers, points, notes, round order — may
// change on the way across.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
// Fixed, quiet ports: the suite starts two full installations side by side.
const PORT_A = 4160;
const PORT_B = 4161;
const dirs = [];

function start(port, dataDir) {
  const dir = dataDir || fs.mkdtempSync(path.join(root, ".test-quizfile-"));
  if (!dataDir) dirs.push(dir);
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
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
  return { child, ready, dir };
}

function stopped(server) {
  return new Promise((resolve) => {
    if (server.child.exitCode !== null) return resolve();
    server.child.once("exit", resolve);
    server.child.kill("SIGKILL");
  });
}

function session(origin) {
  let cookie = "";
  const request = async (p, method = "GET", body, headers = {}) => {
    const res = await fetch(origin + p, {
      method,
      headers: {
        ...(body && !Buffer.isBuffer(body)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        Origin: origin,
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : Buffer.isBuffer(body)
            ? body
            : JSON.stringify(body),
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
  return { request };
}

// Two-pixel PNG, valid and tiny.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const sampleQuiz = (mediaURL) => ({
  title: "Moved across accounts",
  description: "Two rounds, every question type.",
  rounds: [
    {
      title: "Warm up",
      questions: [
        {
          type: "choice",
          text: "Which colour is the sky?",
          options: ["Blue", "Green", "Red"],
          correct: 0,
          seconds: 20,
          points: 1000,
          notes: "Host note that must survive the trip.",
          media: mediaURL,
        },
        {
          type: "multi",
          text: "Which are vowels?",
          options: ["A", "B", "E"],
          correctAnswers: [0, 2],
          seconds: 30,
          points: 1500,
        },
      ],
    },
    {
      title: "Party round",
      questions: [
        {
          type: "text",
          text: "Fill in the blank: stronger ___.",
          accepted: ["together", "Together"],
          seconds: 25,
          points: 1000,
        },
        {
          type: "boolean",
          text: "Music is allowed.",
          correct: 0,
          seconds: 10,
          points: 500,
        },
        {
          type: "buzzer",
          text: "Name this song",
          accepted: ["Tum Hi Ho"],
          seconds: 20,
          points: 2000,
          buzzPenalty: 50,
        },
      ],
    },
  ],
});

test("a quiz moves between accounts and installations intact", { timeout: 120000 }, async (t) => {
  t.after(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  const originA = `http://localhost:${PORT_A}`;
  const originB = `http://localhost:${PORT_B}`;
  let file = null;

  await t.test("the sending account builds a quiz with a picture", async () => {
    const server = start(PORT_A);
    try {
      await server.ready;
      const a = session(originA);
      const password = crypto.randomBytes(24).toString("base64");
      assert.equal(
        (
          await a.request("/api/setup", "POST", {
            email: "first@example.test",
            password,
            organization: "First account",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await a.request("/api/login", "POST", {
            email: "first@example.test",
            password,
          })
        ).status,
        200,
      );
      const upload = await a.request("/api/media", "POST", PNG, {
        "Content-Type": "application/octet-stream",
        "X-File-Name": "sky.png",
      });
      assert.equal(upload.status, 201);
      const saved = await a.request(
        "/api/quizzes",
        "POST",
        sampleQuiz(upload.value.url),
      );
      assert.equal(saved.status, 201, JSON.stringify(saved.value));

      const exported = await a.request(
        "/api/quizzes/" + saved.value.id + "/export",
      );
      assert.equal(exported.status, 200, JSON.stringify(exported.value));
      file = exported.value;
      assert.equal(file.kind, "quizzes-quiz-file");
      assert.equal(file.quiz.rounds.length, 2);
      assert.equal(file.media.length, 1, "the picture travels inside the file");
      assert.ok(file.media[0].data.length > 20, "and carries its bytes");
      assert.equal(file.missing, 0);

      // Nobody who is not signed in to this account can export it. (A second
      // account on the same site needs an invitation, so the check is simply
      // that the file is never handed out.)
      const stranger = session(originA);
      const stolen = await stranger.request(
        "/api/quizzes/" + saved.value.id + "/export",
      );
      assert.ok(
        [401, 404].includes(stolen.status),
        `another visitor cannot export your quiz (got ${stolen.status})`,
      );
      assert.equal(stolen.value.quiz, undefined);
    } finally {
      await stopped(server);
    }
  });

  await t.test("a second, separate installation accepts the file", async () => {
    const server = start(PORT_B);
    try {
      await server.ready;
      const b = session(originB);
      const password = crypto.randomBytes(24).toString("base64");
      assert.equal(
        (
          await b.request("/api/setup", "POST", {
            email: "second@example.test",
            password,
            organization: "Second account",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await b.request("/api/login", "POST", {
            email: "second@example.test",
            password,
          })
        ).status,
        200,
      );

      const junk = await b.request("/api/quizzes/import", "POST", {
        kind: "not-a-quiz",
      });
      assert.equal(junk.status, 400);

      const imported = await b.request("/api/quizzes/import", "POST", file);
      assert.equal(imported.status, 201, JSON.stringify(imported.value));
      assert.equal(imported.value.media, 1);
      assert.deepEqual(imported.value.warnings, []);
      const quiz = imported.value.quiz;

      // Nothing about the quiz may change on the way across.
      assert.equal(quiz.title, "Moved across accounts");
      assert.equal(quiz.description, "Two rounds, every question type.");
      assert.equal(quiz.rounds.length, 2);
      assert.equal(quiz.rounds[0].title, "Warm up");
      assert.equal(quiz.rounds[1].questions.length, 3);
      const [choice, multi, text, bool, buzzer] = [
        quiz.rounds[0].questions[0],
        quiz.rounds[0].questions[1],
        quiz.rounds[1].questions[0],
        quiz.rounds[1].questions[1],
        quiz.rounds[1].questions[2],
      ];
      assert.equal(choice.text, "Which colour is the sky?");
      assert.deepEqual(choice.options, ["Blue", "Green", "Red"]);
      assert.equal(choice.correct, 0);
      assert.equal(choice.seconds, 20);
      assert.equal(choice.points, 1000);
      assert.equal(
        choice.notes,
        "Host note that must survive the trip.",
        "private host notes travel with the quiz",
      );
      assert.deepEqual(multi.correctAnswers, [0, 2]);
      assert.deepEqual(text.accepted, ["together", "Together"]);
      assert.equal(bool.options[0], "True");
      assert.equal(buzzer.buzzPenalty, 50);
      assert.equal(buzzer.points, 2000);

      // The picture is now a fresh file owned by the receiving account.
      const oldId = file.media[0].id;
      assert.notEqual(quiz.rounds[0].questions[0].media, "/media/" + oldId);
      assert.match(quiz.rounds[0].questions[0].media, /^\/media\/[a-f0-9-]+$/);
      const picture = await b.request(quiz.rounds[0].questions[0].media);
      assert.equal(picture.status, 200, "the picture opens on the new site");

      // It is a normal quiz in every other way.
      const listed = await b.request("/api/quizzes");
      const mine = listed.value.filter((q) => q.title === "Moved across accounts");
      assert.equal(mine.length, 1, "exactly one copy landed in this account");
      assert.equal(mine[0].id, quiz.id);
    } finally {
      await stopped(server);
    }
  });

  await t.test("the same file imports twice as two separate quizzes", async () => {
    const server = start(PORT_B);
    try {
      await server.ready;
      const b = session(originB);
      const password = crypto.randomBytes(24).toString("base64");
      assert.equal(
        (
          await b.request("/api/setup", "POST", {
            email: "copies@example.test",
            password,
            organization: "Copies",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await b.request("/api/login", "POST", {
            email: "copies@example.test",
            password,
          })
        ).status,
        200,
      );
      const first = await b.request("/api/quizzes/import", "POST", file);
      const second = await b.request("/api/quizzes/import", "POST", file);
      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      assert.notEqual(first.value.quiz.id, second.value.quiz.id);
      const listed = await b.request("/api/quizzes");
      assert.equal(
        listed.value.filter((q) => q.title === "Moved across accounts").length,
        2,
        "two separate copies",
      );
    } finally {
      await stopped(server);
    }
  });
});
