"use strict";
// Writing a 200-question quiz means 200 pictures, so the upload allowance must
// cover honest work while still bounding a runaway account. This checks both
// halves of that: a full-size sitting is allowed, and the ceiling that remains
// explains itself instead of saying "too many attempts".
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const port = 4186;
const origin = `http://localhost:${port}`;
const made = [];
const freshData = () => {
  const dir = fs.mkdtempSync(path.join(root, ".test-upload-"));
  made.push(dir);
  return dir;
};

// A tiny valid PNG: one pixel, PNG signature and chunk layout intact.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function start(env = {}) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      DATA_DIR: env.DATA_DIR || freshData(),
      ALLOW_SETUP: "true",
      NODE_ENV: "test",
      DATABASE_URL: "",
      RENDER: "",
      INITIAL_ADMIN_EMAIL: "",
      INITIAL_ADMIN_PASSWORD: "",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_KEY: "",
      ...env,
      PORT: String(port),
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

// These runs are throwaways: no graceful shutdown is needed, and SIGTERM would
// wait for pooled HTTP connections to go idle before exiting.
function stopped(server) {
  return new Promise((resolve) => {
    if (server.child.exitCode !== null) return resolve();
    server.child.once("exit", resolve);
    server.child.kill("SIGKILL");
  });
}

function session() {
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
    return { status: res.status, value, headers: res.headers };
  };
  const upload = () =>
    request("/api/media", "POST", PNG, {
      "Content-Type": "application/octet-stream",
      "X-File-Name": "picture.png",
    });
  return { request, upload };
}

test(
  "a whole quiz of pictures can be added in one sitting",
  { timeout: 120000 },
  async (t) => {
    t.after(() => {
      for (const dir of made)
        fs.rmSync(dir, { recursive: true, force: true });
    });
    // The shipped allowance must cover the largest quiz the editor offers.
    const source = fs.readFileSync(path.join(root, "server.js"), "utf8");
    const match = source.match(
      /const UPLOAD_PER_HOUR = Math\.min\(\s*2000,\s*Math\.max\(20, Number\(process\.env\.UPLOAD_PER_HOUR\) \|\| (\d+)\)/,
    );
    assert.ok(match, "the upload allowance should be a named constant");
    const allowance = Number(match[1]);
    assert.ok(
      allowance >= 200,
      `the allowance (${allowance}) must cover one picture per question of a full quiz`,
    );

    await t.test("the ceiling is enforced and explains itself", async () => {
      // A deliberately tiny ceiling proves the limit still works.
      const server = start({ UPLOAD_PER_HOUR: "20" });
      try {
        await server.ready;
        const password = crypto.randomBytes(24).toString("base64");
        const s = session();
        assert.equal(
          (
            await s.request("/api/setup", "POST", {
              email: "upload@example.test",
              password,
              organization: "Upload test",
            })
          ).status,
          201,
        );
        assert.equal(
          (
            await s.request("/api/login", "POST", {
              email: "upload@example.test",
              password,
            })
          ).status,
          200,
        );
        for (let i = 0; i < 20; i++)
          assert.equal((await s.upload()).status, 201, `upload ${i + 1}`);
        const refused = await s.upload();
        assert.equal(refused.status, 429);
        assert.match(refused.value.error, /20 files in the last hour/);
        assert.match(refused.value.error, /again in about \d+ minutes?/);
        assert.match(
          refused.value.error,
          /already added are safe/,
          "the host must be told their work is not lost",
        );
      } finally {
        await stopped(server);
      }
    });

    await t.test("the shipped allowance admits a 75-question quiz and more", async () => {
      const server = start();
      try {
        await server.ready;
        const password = crypto.randomBytes(24).toString("base64");
        const s = session();
        assert.equal(
          (
            await s.request("/api/setup", "POST", {
              email: "bulk@example.test",
              password,
              organization: "Bulk upload test",
            })
          ).status,
          201,
        );
        assert.equal(
          (
            await s.request("/api/login", "POST", {
              email: "bulk@example.test",
              password,
            })
          ).status,
          200,
        );
        // The report that started this: 75 pictures, then a few more.
        for (let i = 0; i < 75; i++) {
          const done = await s.upload();
          assert.equal(done.status, 201, `upload ${i + 1} of 75`);
        }
        for (let i = 0; i < 5; i++)
          assert.equal((await s.upload()).status, 201, "spare upload");
      } finally {
        await stopped(server);
      }
    });
  },
);
