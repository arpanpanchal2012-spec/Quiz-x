const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const {
  loadStartupModule,
  checkStartup,
  logStartupFailure,
} = require("./startup-diagnostics");
const {
  db,
  ready: databaseReady,
  passwordHash,
  passwordMatches,
  hash,
  owns,
  migrateOwnership,
} = loadStartupModule("./storage", "DATABASE_CONFIG");
const mediaStore = loadStartupModule("./media-store", "MEDIA_CONFIG");
const { writeBackup } = require("./backup-service");
const { importDocument } = require("./quiz-import");
const rules = require("./quiz-rules");
const live = require("./live-saves");
const features = require("./workspace-features")({
  db,
  user,
  requireUser,
  owns,
  isSiteAdmin,
  hash,
  passwordHash,
  cookie,
  json,
  data,
  fail,
  bounded,
  rate,
  peer,
  saveQuizEdit,
  uploadMedia,
});
const studio = require("./studio-server")({
  db,
  json,
  data,
  fail,
  owns,
  validMedia,
  isSiteAdmin,
  rate,
});
const PORT = Number(process.env.PORT || 4173);
const games = new Map();
const limits = new Map();
// How long a signed-in host stays signed in. The clock runs from the last time
// the host used the app, not from the moment they signed in, so an evening of
// preparation does not turn into a surprise sign-out mid-event.
const SESSION_MS =
  Math.min(30 * 24, Math.max(1, Number(process.env.SESSION_HOURS) || 12)) *
  60 *
  60 *
  1000;
// A hard cap no amount of activity can extend, so a forgotten tab on a shared
// laptop cannot stay signed in forever.
const SESSION_MAX_MS = 30 * 24 * 60 * 60 * 1000;
// Shared NAT venues and sleeping laptops can drop the host mid-event. The
// default grace period is unchanged; operators may extend it up to 60 minutes
// with HOST_RECONNECT_MINUTES before an abandoned room is closed and reported.
const CONNECTS_PER_MINUTE = Math.min(
  10000,
  Math.max(50, Number(process.env.CONNECTS_PER_MINUTE) || 1200),
);
const ORPHAN_MS =
  Math.min(60, Math.max(1, Number(process.env.HOST_RECONNECT_MINUTES) || 5)) *
  60 *
  1000;
const setupEnabled =
  process.env.ALLOW_SETUP === "true" && process.env.NODE_ENV !== "production";
function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
function bounded(value, max, label, required = true) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail(`Invalid ${label}`);
  return value.trim();
}
function rate(key, max, windowMs, message) {
  const now = Date.now();
  let entry = limits.get(key);
  if (!entry || entry.until < now) {
    entry = {
      n: 0,
      until: now + windowMs,
    };
    limits.set(key, entry);
  }
  if (++entry.n > max) {
    const minutes = Math.max(1, Math.ceil((entry.until - now) / 60000));
    fail(
      typeof message === "function"
        ? message(minutes)
        : "Too many attempts. Please try again later.",
      429,
    );
  }
}
// Building one real quiz means one picture per question, and the editor allows
// 200 questions. The old ceiling of 60 files an hour stopped honest work part
// way through a quiz, so the allowance now covers a whole quiz being written in
// a single sitting. It still bounds a compromised account, and every upload is
// re-encoded down before it is stored.
const UPLOAD_PER_HOUR = Math.min(
  2000,
  Math.max(20, Number(process.env.UPLOAD_PER_HOUR) || 400),
);
function peer(req) {
  return process.env.TRUST_PROXY === "1"
    ? String(req.headers["x-forwarded-for"] || req.socket.remoteAddress)
        .split(",")
        .at(-1)
        .trim()
    : req.socket.remoteAddress;
}
function sameOrigin(req) {
  if (!req.headers.origin) return false;
  try {
    return new URL(req.headers.origin).host === req.headers.host;
  } catch {
    return false;
  }
}
function token(req) {
  return (
    (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("quizzes_session="))
      ?.slice(16) || ""
  );
}
function isSiteAdmin(host) {
  const email = (process.env.SITE_ADMIN_EMAIL || "").trim().toLowerCase();
  return !!email && !!host && host.email.toLowerCase() === email;
}
async function user(req) {
  const t = token(req);
  if (!t) return null;
  const now = Date.now();
  const host = await db
    .prepare(
      "SELECT a.id,a.email,a.organization,s.expires AS expires FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token=? AND s.expires>?",
    )
    .get(hash(t), now);
  if (!host) return null;
  // Sliding session: once half the window has gone, push it back out. The
  // update is best-effort and never delays or fails the request.
  const { expires, ...rest } = host;
  const remaining = Number(expires) - now;
  if (remaining < SESSION_MS / 2 && remaining < SESSION_MAX_MS) {
    const next = Math.min(now + SESSION_MS, now + SESSION_MAX_MS);
    db.prepare("UPDATE sessions SET expires=? WHERE token=? AND expires<?")
      .run(next, hash(t), next)
      .catch(() => {});
  }
  return { ...rest, isSiteAdmin: isSiteAdmin(rest) };
}
async function requireUser(req) {
  const u = await user(req);
  if (!u) fail("Please sign in as a host.", 401);
  return u;
}
function cookie(req, value, maxAge) {
  const secure =
    req.socket.encrypted ||
    (process.env.TRUST_PROXY === "1" &&
      req.headers["x-forwarded-proto"] === "https") ||
    process.env.NODE_ENV === "production";
  return `quizzes_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
function json(res, status, data, extra = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...extra,
  });
  res.end(JSON.stringify(data));
}
async function body(req, max = 1024 * 1024) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > max) fail("File or request is too large.", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function data(req, max) {
  try {
    return JSON.parse((await body(req, max)).toString());
  } catch (e) {
    if (e.status) throw e;
    fail("Invalid JSON");
  }
}
// Explicitly scoped edits; oversight routes never impersonate another login.
async function saveQuizEdit(req, res, ownerId, id, actor, oversight = false) {
  if (oversight && req.headers["if-match"] === undefined)
    fail(
      "Reload this quiz before saving; a revision precondition is required.",
      428,
    );
  const input = await data(req);
  const before = await db
    .prepare("SELECT document FROM quizzes WHERE id=?")
    .get(id);
  if (!before) fail("Quiz not found.", 404);
  const revision = JSON.parse(before.document)._revision || 0;
  if (
    req.headers["if-match"] !== undefined &&
    req.headers["if-match"] !== `"${revision}"`
  )
    fail(
      "This quiz was saved in another tab. Your draft is kept; reload the saved quiz or save a separate copy.",
      409,
    );
  const q = await validateQuiz(input, ownerId, id);
  const original = JSON.parse(before.document);
  if (original._lastAdminEdit) q._lastAdminEdit = original._lastAdminEdit;
  if (oversight) q._lastAdminEdit = { email: actor.email, at: Date.now() };
  q._revision = revision + 1;
  const changed = await db
    .prepare(
      "UPDATE quizzes SET document=?,updated=? WHERE id=? AND document=?",
    )
    .run(JSON.stringify(q), Date.now(), q.id, before.document);
  if (!changed.changes)
    fail(
      "This quiz changed while saving. Your draft is kept; try a separate copy.",
      409,
    );
  return json(res, 200, q);
}
async function uploadMedia(req, res, ownerId, actorId) {
  rate(
    "upload:" + actorId,
    UPLOAD_PER_HOUR,
    60 * 60 * 1000,
    (minutes) =>
      `You have added ${UPLOAD_PER_HOUR} files in the last hour. You can add images again in about ${minutes} minute${minutes === 1 ? "" : "s"}; quizzes and their pictures already added are safe.`,
  );
  const b = await body(req, 10 * 1024 * 1024);
  const mime = sniff(b);
  if (!mime) fail("Upload PNG, JPEG, GIF, WebP, MP3, WAV, or OGG.");
  const id = crypto.randomUUID();
  const name = String(req.headers["x-file-name"] || "Media").slice(0, 240);
  await mediaStore.write(id, b, mime);
  await db.withTransaction(async (tx) => {
    await tx.prepare("INSERT INTO media VALUES (?,?,?)").run(id, mime, name);
    await tx
      .prepare("INSERT INTO ownership VALUES (?,?,?)")
      .run("media", id, ownerId);
  });
  return json(res, 201, {
    url: "/media/" + id,
    mime,
  });
}
async function validMedia(value, kind, ownerId) {
  if (!value) return "";
  if (typeof value !== "string" || !/^\/media\/[a-f0-9-]+$/.test(value))
    fail("Invalid media reference");
  const m = await db
    .prepare("SELECT * FROM media WHERE id=?")
    .get(value.split("/").pop());
  if (
    !m ||
    !(await owns("media", m.id, ownerId)) ||
    (kind && !m.mime.startsWith(kind + "/"))
  )
    fail("Media not found or wrong type");
  return value;
}
async function validateQuiz(input, ownerId, id = crypto.randomUUID()) {
  const q = {
    id,
    title: bounded(input.title, 120, "quiz title"),
    description: bounded(input.description || "", 1000, "description", false),
    music: await validMedia(input.music, "audio", ownerId),
    _revision: 1,
    rounds: [],
  };
  if (
    !Array.isArray(input.rounds) ||
    input.rounds.length < 1 ||
    input.rounds.length > 20
  )
    fail("Use 1–20 rounds.");
  let count = 0;
  for (const r of input.rounds) {
    const round = {
      title: bounded(r.title || "", 100, "round title", false),
      questions: [],
    };
    if (!Array.isArray(r.questions) || !r.questions.length)
      fail("Each round needs at least one question.");
    for (const x of r.questions) {
      if (++count > 200) fail("Maximum 200 questions per quiz.");
      if (!["choice", "multi", "boolean", "text", "buzzer"].includes(x.type))
        fail("Invalid question type");
      const question = {
        type: x.type,
        text: bounded(x.text, 1000, "question"),
        notes: bounded(x.notes || "", 1000, "private notes", false),
        seconds: Number(x.seconds),
        points: Number(x.points),
        media: await validMedia(x.media, undefined, ownerId),
      };
      question.mediaType = question.media
        ? (
            await db
              .prepare("SELECT mime FROM media WHERE id=?")
              .get(question.media.split("/").pop())
          ).mime
        : "";
      if (
        !Number.isInteger(question.seconds) ||
        question.seconds < 5 ||
        question.seconds > 120
      )
        fail("Timer must be 5–120 seconds.");
      if (
        !Number.isInteger(question.points) ||
        question.points < 100 ||
        question.points > 5000
      )
        fail("Points must be 100–5000.");
      if (x.type === "text" || x.type === "buzzer") {
        if (
          !Array.isArray(x.accepted) ||
          !x.accepted.length ||
          x.accepted.length > 20
        )
          fail(x.type === "buzzer" ? "Add the expected answer." : "Add 1–20 accepted answers.");
        question.accepted = x.accepted.map((a) =>
          bounded(a, 200, "accepted answer"),
        );
      }
      // Negative marking is a host choice for live buzzer rounds only. In an
      // assigned quiz the same question is graded as a typed answer, so no
      // penalty can apply there.
      if (x.type === "buzzer") {
        if (x.buzzPenalty === undefined || x.buzzPenalty === null)
          question.buzzPenalty = 0;
        else if (!BUZZ_PENALTIES.includes(Number(x.buzzPenalty)))
          fail("Choose a wrong-buzz penalty of none, 25%, 50% or 100%.");
        else question.buzzPenalty = Number(x.buzzPenalty);
      } else if (x.buzzPenalty !== undefined) question.buzzPenalty = 0;
      if (x.type !== "text" && x.type !== "buzzer") {
        question.options = x.type === "boolean" ? ["True", "False"] : x.options;
        if (
          !Array.isArray(question.options) ||
          question.options.length < 2 ||
          question.options.length > 6
        )
          fail("Use 2–6 answer choices.");
        question.options = question.options.map((a) =>
          bounded(a, 200, "answer choice"),
        );
        if (x.type === "multi") {
          if (
            !Array.isArray(x.correctAnswers) ||
            !x.correctAnswers.length ||
            x.correctAnswers.length > question.options.length ||
            new Set(x.correctAnswers).size !== x.correctAnswers.length ||
            x.correctAnswers.some(
              (i) =>
                !Number.isInteger(i) || i < 0 || i >= question.options.length,
            )
          )
            fail("Select the correct options for this multi-answer question.");
          question.correctAnswers = [...x.correctAnswers].sort((a, b) => a - b);
        } else {
          question.correct =
            x.correct === null || x.correct === undefined || x.correct === ""
              ? -1
              : Number(x.correct);
          if (
            !Number.isInteger(question.correct) ||
            question.correct < 0 ||
            question.correct >= question.options.length
          )
            fail("Select a correct answer.");
        }
      }
      round.questions.push(question);
    }
    q.rounds.push(round);
  }
  return q;
}
function sniff(b) {
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString()))
    return "image/gif";
  if (b.subarray(0, 4).toString() === "RIFF") {
    if (b.subarray(8, 12).toString() === "WEBP") return "image/webp";
    if (b.subarray(8, 12).toString() === "WAVE") return "audio/wav";
  }
  if (b.subarray(0, 4).toString() === "OggS") return "audio/ogg";
  if (
    b.subarray(0, 3).toString() === "ID3" ||
    (b[0] === 255 && (b[1] & 224) === 224)
  )
    return "audio/mpeg";
  return null;
}
let setupBusy = false;
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'",
  );
  try {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    if (!["GET", "HEAD"].includes(req.method) && !sameOrigin(req))
      fail("Request origin not allowed.", 403);
    if (p === "/healthz" && req.method === "GET") {
      await db.prepare("SELECT 1 AS ok").get();
      return json(res, 200, {
        ok: true,
        version: require("./package.json").version,
      });
    }
    if (p === "/api/session" && req.method === "GET")
      return json(res, 200, {
        user: (await user(req)) || null,
        setupRequired: !(await db
          .prepare("SELECT id FROM admins LIMIT 1")
          .get()),
        setupEnabled,
      });
    if (p === "/api/setup" && req.method === "POST") {
      if (!setupEnabled || setupBusy) fail("Web setup is not available.", 403);
      rate("setup:" + peer(req), 5, 15 * 60 * 1000);
      setupBusy = true;
      try {
        if (await db.prepare("SELECT id FROM admins LIMIT 1").get())
          fail("Web setup is not available.", 403);
        const x = await data(req);
        const email = bounded(x.email, 254, "email").toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          fail("Enter a valid email.");
        if (
          typeof x.password !== "string" ||
          x.password.length < 12 ||
          x.password.length > 128
        )
          fail("Use a password with 12–128 characters.");
        const organization = bounded(x.organization, 120, "organization name");
        const password = await passwordHash(x.password);
        const ownerId = crypto.randomUUID();
        await db
          .prepare("INSERT INTO admins VALUES (?,?,?,?)")
          .run(ownerId, email, password, organization);
        await migrateOwnership(ownerId);
        return json(res, 201, {
          ok: true,
        });
      } finally {
        setupBusy = false;
      }
    }
    if (p === "/api/recover" && req.method === "POST") {
      rate("recover:" + peer(req), 8, 15 * 60 * 1000);
      const x = await data(req);
      const email = bounded(x.email, 254, "email").toLowerCase();
      const code = bounded(x.code, 100, "recovery code");
      if (
        typeof x.password !== "string" ||
        x.password.length < 12 ||
        x.password.length > 128
      )
        fail("Use a password with 12–128 characters.");
      const encoded = await passwordHash(x.password);
      const adminId = await db.withTransaction(async (tx) => {
        const row = await tx
          .prepare(
            "SELECT r.admin_id FROM recovery_codes r JOIN admins a ON a.id=r.admin_id WHERE r.digest=? AND a.email=?",
          )
          .get(hash(code), email);
        if (!row)
          fail(
            "Email or recovery code is invalid or has already been used.",
            401,
          );
        const used = await tx
          .prepare("DELETE FROM recovery_codes WHERE digest=? AND admin_id=?")
          .run(hash(code), row.admin_id);
        if (!used.changes)
          fail(
            "Email or recovery code is invalid or has already been used.",
            401,
          );
        await tx
          .prepare("UPDATE admins SET password=? WHERE id=?")
          .run(encoded, row.admin_id);
        await tx
          .prepare("DELETE FROM sessions WHERE admin_id=?")
          .run(row.admin_id);
        return row.admin_id;
      });
      for (const ws of wss.clients)
        if (ws.adminId === adminId) ws.close(1000, "Account recovered");
      return json(res, 200, { ok: true }, { "Set-Cookie": cookie(req, "", 0) });
    }
    if (p === "/api/login" && req.method === "POST") {
      rate("login:" + peer(req), 12, 15 * 60 * 1000);
      const x = await data(req);
      const email = bounded(x.email, 254, "email").toLowerCase();
      if (
        typeof x.password !== "string" ||
        !x.password ||
        x.password.length > 128
      )
        fail("Invalid password");
      const password = x.password;
      const admin = await db
        .prepare("SELECT * FROM admins WHERE email=?")
        .get(email);
      const fallback = "00".repeat(16) + ":" + "00".repeat(64);
      const matches = await passwordMatches(
        password,
        admin?.password || fallback,
      );
      if (!admin || !matches) fail("Email or password is incorrect.", 401);
      const t = crypto.randomBytes(32).toString("hex");
      await db
        .prepare("INSERT INTO sessions VALUES (?,?,?)")
        .run(hash(t), admin.id, Date.now() + SESSION_MS);
      return json(
        res,
        200,
        {
          ok: true,
        },
        {
          // The browser keeps the cookie as long as any session could live; the
          // database expiry is what actually ends a session, and it slides with
          // use. Signing out deletes the row immediately.
          "Set-Cookie": cookie(req, t, SESSION_MAX_MS / 1000),
        },
      );
    }
    if (p === "/api/logout" && req.method === "POST") {
      const t = hash(token(req));
      await db.prepare("DELETE FROM sessions WHERE token=?").run(t);
      for (const ws of wss.clients)
        if (ws.sessionHash === t) ws.close(1000, "Signed out");
      return json(
        res,
        200,
        {
          ok: true,
        },
        {
          "Set-Cookie": cookie(req, "", 0),
        },
      );
    }
    if (await features.handle(req, res, p)) return;
    // ---- a player's own face, for this room only ------------------------
    // The phone composites the figure and uploads one small WebP. It is kept in
    // the live room's memory — never in quizzes, attempts, reports or exports —
    // and goes away with the room or when the player picks a listed character.
    if (p === "/api/live-avatar" && req.method === "POST") {
      const x = await data(req, 400 * 1024);
      const g = games.get(String(x.code || "").toUpperCase());
      if (!g) fail("Game not found. Check the code.", 404);
      const seat = [...g.players.values()].find((q) => q.resumeToken === x.token);
      if (!seat) fail("This player session has expired. Please join again.", 403);
      const match = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(
        String(x.image || ""),
      );
      if (!match) fail("That picture could not be read.");
      const buf = Buffer.from(match[2], "base64");
      if (!buf.length || buf.length > 160 * 1024)
        fail("That picture is too large. Try a smaller one.");
      const rev = (seat.face?.rev || 0) + 1;
      seat.face = { buf, type: "image/" + match[1], rev };
      seat.character = `self:${seat.id}`;
      seat.accessory = ACCESSORY_IDS.includes(seat.accessory) ? seat.accessory : "none";
      broadcastRoster(g);
      return json(res, 200, {
        ok: true,
        playerId: seat.id,
        character: seat.character,
        faceRev: rev,
      });
    }
    if (p === "/api/live-avatar" && req.method === "DELETE") {
      const x = await data(req, 4096);
      const g = games.get(String(x.code || "").toUpperCase());
      if (!g) fail("Game not found. Check the code.", 404);
      const seat = [...g.players.values()].find((q) => q.resumeToken === x.token);
      if (!seat) fail("This player session has expired. Please join again.", 403);
      seat.face = null;
      if (isSelfLook(seat.character, seat))
        seat.character = characterFor({ ...seat, character: "" });
      broadcastRoster(g);
      return json(res, 200, { ok: true, character: seat.character });
    }
    const avatarPath = p.match(/^\/live-avatar\/([A-Z0-9]{4,12})\/([a-f0-9-]{8,40})\.webp$/i);
    if (avatarPath && ["GET", "HEAD"].includes(req.method)) {
      const g = games.get(avatarPath[1].toUpperCase());
      const seat = g?.players.get(avatarPath[2]);
      if (!seat?.face) return fail("Not found", 404);
      res.writeHead(200, {
        "Content-Type": seat.face.type,
        // A face belongs to the room in progress, so no cache anywhere.
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      });
      return res.end(seat.face.buf);
    }
    if (p.startsWith("/api/")) {
      const admin = await requireUser(req);
      if (await studio(req, res, p, admin)) return;
      if (p === "/api/recovery-code" && req.method === "POST") {
        rate("recovery-code:" + admin.id, 5, 15 * 60 * 1000);
        const x = await data(req);
        const stored = await db
          .prepare("SELECT password FROM admins WHERE id=?")
          .get(admin.id);
        if (
          typeof x.password !== "string" ||
          x.password.length > 128 ||
          !(await passwordMatches(x.password, stored.password))
        )
          fail("Current password is incorrect.", 401);
        const code = crypto.randomBytes(24).toString("base64url");
        await db.withTransaction(async (tx) => {
          await tx
            .prepare("DELETE FROM recovery_codes WHERE admin_id=?")
            .run(admin.id);
          await tx
            .prepare("INSERT INTO recovery_codes VALUES (?,?,?)")
            .run(hash(code), admin.id, Date.now());
        });
        return json(res, 200, { code, email: admin.email });
      }
      if (p === "/api/backup" && req.method === "POST") {
        rate("backup:" + admin.id, 3, 60 * 60 * 1000);
        const x = await data(req);
        const stored = await db
          .prepare("SELECT password FROM admins WHERE id=?")
          .get(admin.id);
        if (
          typeof x.password !== "string" ||
          x.password.length > 128 ||
          !(await passwordMatches(x.password, stored.password))
        )
          fail("Current password is incorrect.", 401);
        res.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Disposition": "attachment; filename=quizzes-backup.zip",
          "Cache-Control": "no-store",
        });
        return await writeBackup(res, admin.id);
      }
      if (p === "/api/storage-status" && req.method === "GET")
        return json(res, 200, {
          database: db.kind,
          media: mediaStore.remote ? "supabase" : "local",
          persistentCloud: db.kind === "postgres" && mediaStore.remote,
        });
      if (p === "/api/password" && req.method === "POST") {
        rate("password:" + admin.id, 6, 15 * 60 * 1000);
        const x = await data(req);
        const stored = await db
          .prepare("SELECT password FROM admins WHERE id=?")
          .get(admin.id);
        if (
          typeof x.oldPassword !== "string" ||
          x.oldPassword.length > 128 ||
          !(await passwordMatches(x.oldPassword, stored.password))
        )
          fail("Current password is incorrect.", 401);
        if (
          typeof x.password !== "string" ||
          x.password.length < 12 ||
          x.password.length > 128
        )
          fail("Use a password with 12–128 characters.");
        const password = await passwordHash(x.password);
        await db.withTransaction(async (tx) => {
          await tx
            .prepare("UPDATE admins SET password=? WHERE id=?")
            .run(password, admin.id);
          await tx
            .prepare("DELETE FROM sessions WHERE admin_id=?")
            .run(admin.id);
          await tx
            .prepare("DELETE FROM recovery_codes WHERE admin_id=?")
            .run(admin.id);
        });
        for (const ws of wss.clients)
          if (ws.adminId === admin.id) ws.close(1000, "Password changed");
        return json(
          res,
          200,
          {
            ok: true,
          },
          {
            "Set-Cookie": cookie(req, "", 0),
          },
        );
      }
      if (p === "/api/quiz-import" && req.method === "POST") {
        rate("document-import:" + admin.id, 30, 60 * 60 * 1000);
        let filename;
        try {
          filename = decodeURIComponent(
            String(req.headers["x-file-name"] || "questions.txt"),
          );
        } catch {
          fail("Invalid document filename.");
        }
        const extension = filename.split(".").at(-1).toLowerCase();
        const result = await importDocument(
          await body(req, 5 * 1024 * 1024),
          extension,
          filename.replace(/\.[^.]+$/, "").slice(0, 120),
          ["auto", "marks", "bold", "color", "highlight"].includes(
            req.headers["x-answer-style"],
          )
            ? req.headers["x-answer-style"]
            : "auto",
        );
        return json(res, 200, result);
      }
      const quizExport = p.match(/^\/api\/quizzes\/([a-f0-9-]+)\/export$/);
      if (quizExport && req.method === "GET") {
        if (!(await owns("quizzes", quizExport[1], admin.id)))
          fail("Quiz not found.", 404);
        const row = await db
          .prepare("SELECT document FROM quizzes WHERE id=?")
          .get(quizExport[1]);
        if (!row) fail("Quiz not found.", 404);
        const file = await buildQuizFile(JSON.parse(row.document));
        return json(res, 200, file, {
          "Content-Disposition": `attachment; filename="quizzes-quiz-${quizExport[1].slice(0, 8)}.json"`,
        });
      }
      if (p === "/api/quizzes/import" && req.method === "POST") {
        rate("quiz-import:" + admin.id, 60, 60 * 60 * 1000);
        return json(res, 201, await importQuizFile(await data(req, 64 * 1024 * 1024), admin));
      }
      const liveExport = p.match(/^\/api\/live\/(QZ[A-Z0-9]{6})\/export$/);
      if (liveExport && req.method === "GET") {
        const g = games.get(liveExport[1]);
        if (!g || g.adminId !== admin.id)
          fail("That game is not running on this site.", 404);
        const bundle = await buildLiveExport(g);
        return json(res, 200, bundle, {
          "Content-Disposition": `attachment; filename="quizzes-live-${g.code}.json"`,
        });
      }
      if (p === "/api/live/rooms" && req.method === "GET") {
        return json(
          res,
          200,
          [...games.values()]
            .filter((g) => g.adminId === admin.id && g.status !== "ended")
            .sort((a, b) => b.created - a.created)
            .map((g) => ({
              code: g.code,
              title: g.quiz.title,
              status: g.status,
              index: g.index,
              total: g.questions.length,
              players: g.players.size,
              hostConnected: !!g.host,
              created: g.created,
            })),
        );
      }
      if (p === "/api/live/import" && req.method === "POST") {
        rate("live-import:" + admin.id, 10, 60 * 60 * 1000);
        return json(res, 201, await importLiveGame(await data(req, 32 * 1024 * 1024), admin));
      }
      if (p === "/api/quizzes" && req.method === "GET")
        return json(
          res,
          200,
          (
            await db
              .prepare(
                "SELECT document FROM quizzes WHERE id IN (SELECT item_id FROM ownership WHERE kind='quizzes' AND owner_id=?) ORDER BY updated DESC",
              )
              .all(admin.id)
          ).map((r) => JSON.parse(r.document)),
        );
      if (p === "/api/quizzes" && req.method === "POST") {
        const q = await validateQuiz(await data(req), admin.id);
        await db.withTransaction(async (tx) => {
          await tx
            .prepare("INSERT INTO quizzes VALUES (?,?,?)")
            .run(q.id, JSON.stringify(q), Date.now());
          await tx
            .prepare("INSERT INTO ownership VALUES (?,?,?)")
            .run("quizzes", q.id, admin.id);
        });
        return json(res, 201, q);
      }
      const match = p.match(/^\/api\/quizzes\/([a-f0-9-]+)$/);
      if (match) {
        if (!(await owns("quizzes", match[1], admin.id)))
          fail("Quiz not found.", 404);
        if (req.method === "PUT") {
          return await saveQuizEdit(req, res, admin.id, match[1], admin);
        }
        if (req.method === "DELETE") {
          await db.prepare("DELETE FROM quizzes WHERE id=?").run(match[1]);
          return json(res, 200, {
            ok: true,
          });
        }
      }
      if (p === "/api/media" && req.method === "POST") {
        return await uploadMedia(req, res, admin.id, admin.id);
      }
      if (p === "/api/reports" && req.method === "DELETE") {
        await db.withTransaction(async (tx) => {
          await tx
            .prepare(
              "DELETE FROM reports WHERE id IN (SELECT item_id FROM ownership WHERE kind='reports' AND owner_id=?)",
            )
            .run(admin.id);
          await tx
            .prepare(
              "DELETE FROM ownership WHERE kind=? AND owner_id=? AND item_id NOT IN (SELECT id FROM reports)",
            )
            .run("reports", admin.id);
        });
        return json(res, 200, { ok: true });
      }
      const reportDelete = p.match(/^\/api\/reports\/([a-f0-9-]+)$/);
      if (reportDelete && req.method === "DELETE") {
        await db.withTransaction(async (tx) => {
          const owner = await tx
            .prepare(
              "SELECT owner_id FROM ownership WHERE kind=? AND item_id=?",
            )
            .get("reports", reportDelete[1]);
          if (!owner || owner.owner_id !== admin.id)
            fail("Report not found.", 404);
          await tx
            .prepare("DELETE FROM reports WHERE id=?")
            .run(reportDelete[1]);
          await tx
            .prepare("DELETE FROM ownership WHERE kind=? AND item_id=?")
            .run("reports", reportDelete[1]);
        });
        return json(res, 200, { ok: true });
      }
      if (p === "/api/reports" && req.method === "GET")
        return json(
          res,
          200,
          (
            await db
              .prepare(
                "SELECT document FROM reports WHERE id IN (SELECT item_id FROM ownership WHERE kind='reports' AND owner_id=?) ORDER BY ended DESC",
              )
              .all(admin.id)
          ).map((r) => JSON.parse(r.document)),
        );
      fail("API endpoint not found.", 404);
    }
    if (p.startsWith("/media/")) {
      const id = p.slice(7);
      const m = await db.prepare("SELECT * FROM media WHERE id=?").get(id);
      if (!m || !(await features.mediaAccess(req, id))) fail("Not found", 404);
      return await mediaStore.serve(req, res, id, m.mime);
    }
    // The 3D characters. Two layers per figure plus a flat thumbnail, all named
    // after the character. A fixed name pattern and a directory join that cannot
    // climb out of assets/3d — nothing else is reachable here.
    if (p.startsWith("/assets/3d/")) {
      const sprite = p.slice(11);
      if (!/^[a-z]+-(head|body|thumb|arm-l|arm-r|cheer)\.webp$/.test(sprite)) return fail("Not found", 404);
      const file = path.join(__dirname, "assets", "3d", sprite);
      if (!fs.existsSync(file)) return fail("Not found", 404);
      res.writeHead(200, {
        "Content-Type": "image/webp",
        // The layer for a character never changes name, so a long cache is safe
        // and the picker is instant on the second visit.
        "Cache-Control": "public, max-age=604800",
        "X-Content-Type-Options": "nosniff",
      });
      return fs.createReadStream(file).pipe(res);
    }
    const files = {
      "/": "index.html",
      "/join": "index.html",
      "/play": "index.html",
      "/invite": "index.html",
      "/extensions.js": "extensions.js",
      "/professional.js": "professional.js",
      "/display": "display.html",
      "/display.js": "display.js",
      "/rehearsal": "rehearsal.html",
      "/rehearsal.js": "rehearsal.js",
      "/quiz-rules.js": "quiz-rules.js",
      "/qr-code.js": "qr-code.js",
      "/index.html": "index.html",
      "/styles.css": "styles.css",
      "/characters.css": "characters.css",
      "/characters.js": "characters.js",
      "/characters3d.gen.js": "characters3d.gen.js",
      "/celebrate.js": "celebrate.js",
      "/app.js": "app.js",
      "/quiz-sound.js": "quiz-sound.js",
    };
    if (!files[p] || !["GET", "HEAD"].includes(req.method))
      fail("Not found", 404);
    const type = p.endsWith(".css")
      ? "text/css"
      : p.endsWith(".js")
        ? "text/javascript"
        : "text/html";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(path.join(__dirname, files[p])).pipe(res);
  } catch (e) {
    if (!res.headersSent)
      json(res, e.status || 500, {
        error: e.status ? e.message : "Something went wrong. Please try again.",
      });
    else res.end();
    if (!e.status)
      console.error("A request failed. Check database/media availability.");
  }
});
function send(ws, type, data = {}) {
  if (ws?.readyState === 1)
    ws.send(
      JSON.stringify({
        type,
        ...data,
      }),
    );
}
function broadcast(g, type, data = {}) {
  g.clients.forEach((ws) => send(ws, type, data));
  markLiveDirty(g);
}
// Recovery mirror. Coalesced to at most one write per second per room, so a
// 100-player event adds about one small row rewrite per second rather than one
// per answer. Room state is a few kilobytes; answers are journalled separately.
const liveSaveTimers = new Map();
function markLiveDirty(g) {
  if (!g || g.status === "ended" || liveSaveTimers.has(g.code)) return;
  const timer = setTimeout(() => {
    liveSaveTimers.delete(g.code);
    live.saveQuietly(g);
  }, 1000);
  timer.unref?.();
  liveSaveTimers.set(g.code, timer);
}
function recordAnswer(g, entry) {
  entry.seq = (g.historySeq = (g.historySeq || 0) + 1);
  g.history.push(entry);
  live.appendQuietly(g, entry);
  markLiveDirty(g);
}
// Event capacity. A full room sends one roster update per join, leave and answer.
// With 100 players that is ~100 messages of ~10 KB each fanned out to ~101
// sockets, roughly 100 MB of egress per question on a shared free container.
// Coalescing caps it at about two updates per interval. Scoring, timers and
// results are untouched: only the cosmetic "who has answered / who is online"
// list is throttled, and every phase broadcast still carries a fresh roster.
const ROSTER_THROTTLE_MS = 700;
// Room size. Free containers get little memory and bandwidth per event, so the
// default stays at 100. An operator with a larger plan can raise it without a
// code change: PLAYERS_PER_GAME=120.
const PLAYERS_PER_GAME = Math.min(
  500,
  Math.max(2, Number(process.env.PLAYERS_PER_GAME) || 100),
);
// Percentage of the question's points lost by a wrong buzz, chosen per question.
const BUZZ_PENALTIES = [0, 25, 50, 100];
// Each player picks who they play as: one of twelve original characters and one
// accessory. The drawings themselves live in characters.js; these two lists are
// the server's copy of the ids, used to accept, reject and restore a choice.
// Keep them in step with CHARACTER_IDS / ACCESSORY_IDS in characters.js.
const CHARACTER_IDS = [
  "bear", "cat", "fox", "bunny", "panda", "frog",
  "penguin", "owl", "tiger", "wolf", "unicorn", "monster",
];
// The 3D cast. They travel as `photo:<id>`, which no drawn id can ever be, so a
// phone on an older release keeps drawing a figure instead of showing nothing.
// A render arrives fully dressed, so it never wears a drawn accessory.
const PHOTO_CHARACTER_IDS = [
  "photo:sparkle", "photo:nova", "photo:pixel", "photo:ruby", "photo:royal",
  "photo:rocky", "photo:kitty", "photo:dino", "photo:unicorn", "photo:wizard",
  "photo:hero", "photo:samurai", "photo:chef", "photo:alien", "photo:viking",
  "photo:pirate", "photo:grove", "photo:blossom", "photo:sprout",
  "photo:max", "photo:ace", "photo:scientist", "photo:rockstar", "photo:grandpa",
];
const LOOK_IDS = [...CHARACTER_IDS, ...PHOTO_CHARACTER_IDS];
const isPhoto = (id) => PHOTO_CHARACTER_IDS.includes(id);
const characterOk = (id) => LOOK_IDS.includes(id);
const ACCESSORY_IDS = [
  "none", "cap", "crown", "party", "wizard", "grad", "beanie",
  "cowboy", "headphones", "shades", "goggles", "helmet", "scarf", "bowtie",
];
// A joining player takes a character nobody else in that room is using yet, so
// a full lobby is a crowd of different animals rather than a dozen bears. The
// drawn characters are the default: the pictures are chosen on purpose, by the
// player, from the picker.
function pickCharacter(g) {
  const used = new Set([...(g?.players?.values() || [])].map((p) => p.character));
  // The 3D cast is what the picker offers, so it is what a seat falls back to.
  const freePhoto = PHOTO_CHARACTER_IDS.filter((c) => !used.has(c));
  if (freePhoto.length) return freePhoto[crypto.randomInt(freePhoto.length)];
  const free = CHARACTER_IDS.filter((c) => !used.has(c));
  const pool = free.length ? free : CHARACTER_IDS;
  return pool[crypto.randomInt(pool.length)];
}
// Rooms saved before characters existed still come back with one per player,
// and it stays the same character on every later restore.
function isSelfLook(id, p) {
  return typeof id === "string" && id === `self:${p?.id}`;
}
function characterFor(p) {
  // A player's own face: only valid for that seat, and only while the face is
  // still in this room's memory.
  if (isSelfLook(p?.character, p) && p.face) return p.character;
  if (characterOk(p?.character)) return p.character;
  let hash = 0;
  for (const c of String(p?.id || "")) hash = (hash * 31 + c.codePointAt(0)) % 1e6;
  return CHARACTER_IDS[hash % CHARACTER_IDS.length];
}
function accessoryFor(p) {
  // A picture look is complete as it is; a stored accessory from the drawn
  // characters is simply not worn while a picture is chosen.
  if (isPhoto(p?.character)) return "none";
  return ACCESSORY_IDS.includes(p?.accessory) ? p.accessory : "none";
}
const rosterPending = new Map();
function clearRoster(g) {
  const entry = rosterPending.get(g.code);
  if (!entry) return;
  rosterPending.delete(g.code);
  clearTimeout(entry.timer);
}
function broadcastRoster(g) {
  let entry = rosterPending.get(g.code);
  if (!entry) {
    entry = { timer: null, dirty: false };
    broadcast(g, "participants_updated", { game: state(g) });
    entry.timer = setTimeout(() => {
      rosterPending.delete(g.code);
      if (entry.dirty && games.get(g.code) === g)
        broadcast(g, "participants_updated", { game: state(g) });
    }, ROSTER_THROTTLE_MS);
    entry.timer.unref?.();
    rosterPending.set(g.code, entry);
    return;
  }
  entry.dirty = true;
}
function current(g) {
  return g.questions[g.index];
}
function ranking(g) {
  return [...g.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({
      id: p.id,
      rank: i + 1,
      name: p.name,
      character: characterFor(p),
      accessory: accessoryFor(p),
      faceRev: p.face?.rev || 0,
      score: p.score,
    }));
}
function state(g) {
  return {
    code: g.code,
    title: g.quiz.title,
    status: g.status,
    optionsVisible: g.status === "question" ? !!g.optionsVisible : null,
    index: g.index,
    total: g.questions.length,
    deadline: g.deadline,
    musicState: g.musicState,
    leaderboardVisible: g.leaderboardVisible,
    buzzer:
      g.status === "buzzer"
        ? { open: !!g.buzzingOpen, count: (g.buzzes || []).length }
        : null,
    upcomingRound: ["round_intro", "last_question_intro"].includes(g.status)
      ? rules.roundLabel(
          g.questions[g.index + 1].roundIndex,
          g.questions[g.index + 1].round,
        )
      : null,
    participants: [...g.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      character: characterFor(p),
      accessory: accessoryFor(p),
      score: p.score,
      answered: p.answered,
      faceRev: p.face?.rev || 0,
      connected: !!p.ws && p.ws.readyState === 1,
    })),
  };
}
function question(g, reveal = g.optionsVisible !== false) {
  const q = current(g);
  if (!q) return null;
  return {
    id: `${g.code}:${g.index}`,
    text: q.text,
    type: q.type,
    // Until the host shows them, the options are not sent at all — a player
    // cannot peek at them in the browser, because they are not there.
    options: reveal ? q.options : [],
    optionsVisible: reveal,
    media: features.mediaURL(q.media),
    mediaType: q.mediaType,
    seconds: q.seconds,
    points: q.points,
    round: q.round,
    roundLabel: rules.roundLabel(q.roundIndex, q.round),
    lastInRound:
      !g.questions[g.index + 1] ||
      g.questions[g.index + 1].roundIndex !== q.roundIndex,
    roundIndex: q.roundIndex,
    roundCount: g.quiz.rounds.length,
    index: g.index,
    total: g.questions.length,
  };
}
function result(g) {
  const q = current(g);
  return {
    correct: rules.solution(q),
    correctIndices: q.type === "text" ? [] : rules.correctIndices(q),
    roundEnded:
      !g.questions[g.index + 1] ||
      g.questions[g.index + 1].roundIndex !== q.roundIndex,
    roundLabel: rules.roundLabel(q.roundIndex, q.round),
    leaderboardVisible: g.leaderboardVisible,
    leaderboard: ranking(g),
    stats: g.stats,
  };
}
// Buzzer round: players buzz from their phones, the server orders them by its
// own clock (never the phone's), and the host accepts or rejects each answer
// out loud before anyone is scored.
function buzzQueue(g) {
  return (g.buzzes || []).map((b, i) => ({
    position: i + 1,
    playerId: b.playerId,
    name: g.players.get(b.playerId)?.name || "Player",
    status: b.status,
    elapsedMs: b.at - (g.startedAt || b.at),
    points: b.points || 0,
    connected: !!g.players.get(b.playerId)?.ws,
  }));
}
function broadcastBuzzes(g) {
  broadcast(g, "buzz_queue", {
    buzzes: buzzQueue(g),
    open: !!g.buzzingOpen,
  });
}
function finishBuzzer(g, won) {
  if (g.status !== "buzzer") return;
  clearTimeout(g.timer);
  g.buzzingOpen = false;
  g.status = "results";
  g.leaderboardVisible =
    !g.questions[g.index + 1] ||
    g.questions[g.index + 1].roundIndex !== current(g).roundIndex;
  for (const p of g.players.values()) {
    p.score += p.pending || 0;
    p.pending = 0;
  }
  broadcast(g, "question_ended", {
    game: state(g),
    ...result(g),
    buzzes: buzzQueue(g),
    buzzerWon: won,
  });
}
function finishQuestion(g) {
  if (g.status !== "question") return;
  clearTimeout(g.timer);
  g.optionsVisible = true;
  g.status = "results";
  g.leaderboardVisible =
    !g.questions[g.index + 1] ||
    g.questions[g.index + 1].roundIndex !== current(g).roundIndex;
  for (const p of g.players.values()) {
    p.score += p.pending || 0;
    p.pending = 0;
  }
  broadcast(g, "question_ended", {
    game: state(g),
    ...result(g),
  });
}
async function endGame(g, reason = "Host ended the game") {
  if (["ended", "ending"].includes(g.status)) return;
  if (g.status === "buzzer") finishBuzzer(g, false);
  if (g.status === "question") finishQuestion(g);
  clearTimeout(g.timer);
  clearTimeout(g.orphanTimer);
  clearRoster(g);
  const previousStatus = g.status;
  g.status = "ending";
  const report = {
    id: g.reportId || (g.reportId = crypto.randomUUID()),
    title: g.quiz.title,
    code: g.code,
    quizSnapshot: g.quiz,
    started: g.created,
    ended: Date.now(),
    reason,
    questionsPlayed: g.index + 1,
    questionCount: g.questions.length,
    players: g.players.size,
    leaderboard: ranking(g),
    answers: g.history,
  };
  try {
    await db.withTransaction(async (tx) => {
      await tx
        .prepare(
          "INSERT INTO reports VALUES (?,?,?) ON CONFLICT (id) DO NOTHING",
        )
        .run(report.id, JSON.stringify(report), report.ended);
      await tx
        .prepare(
          "INSERT INTO ownership VALUES (?,?,?) ON CONFLICT(kind,item_id) DO NOTHING",
        )
        .run("reports", report.id, g.adminId);
    });
  } catch (e) {
    g.status = previousStatus;
    throw e;
  }
  g.status = "ended";
  live.forget(g.code).catch(() =>
    console.error("Could not clear the saved copy of a finished game."),
  );
  broadcast(g, "game_ended", {
    game: state(g),
    leaderboard: ranking(g),
    reportId: report.id,
  });
  g.expiry = setTimeout(
    () => {
      for (const ws of g.clients) ws.close(1000, "Session finished");
      clearRoster(g);
      games.delete(g.code);
    },
    10 * 60 * 1000,
  );
}
// Private console data is NEVER included in state(), question(), sync payloads
// for other roles, or a broadcast. Display tokens permit only the public room.
function sendHostPreview(g) {
  const q = current(g),
    next = g.questions[g.index + 1];
  const observations = [...(g.imageTelemetry || new Map()).values()];
  send(g.host, "host_console", {
    displayToken: g.displayToken,
    currentNotes: q?.notes || "",
    next: next
      ? {
          text: next.text,
          round: rules.roundLabel(next.roundIndex, next.round),
        }
      : null,
    image: q?.mediaType?.startsWith("image/")
      ? {
          ready: observations.filter((x) => x.state === "ready").length,
          failed: observations.filter((x) => x.state === "error").length,
          slow: observations.filter(
            (x) => x.state === "ready" && x.elapsedMs > 3000,
          ).length,
          reported: observations.length,
        }
      : null,
  });
}
// Only the authenticated room host receives future image grants. Never put these
// in state(), question(), or broadcast payloads. Use the immutable room snapshot.
function sendHostImages(ws, g, retry = false) {
  if (ws !== g.host || ws?.role !== "host") return;
  const indices =
    g.status === "ended" ? [] : g.index < 0 ? [0] : [g.index, g.index + 1];
  const images = indices.flatMap((index) => {
    const q = g.questions[index];
    return q?.media && q.mediaType?.startsWith("image/")
      ? [{ index, url: features.mediaURL(q.media) }]
      : [];
  });
  send(ws, "host_images", { code: g.code, images, retry });
}
async function startQuestion(g) {
  // Pressed again while the question is still on its own: show the options.
  if (g.status === "question" && !g.optionsVisible) return showOptions(g);
  if (
    !["lobby", "results", "round_intro", "last_question_intro"].includes(
      g.status,
    )
  )
    fail("Wait for the current question to finish.");
  if (g.index + 1 >= g.questions.length)
    return await endGame(g, "Quiz completed");
  if (
    !["round_intro", "last_question_intro"].includes(g.status) &&
    g.index >= 0 &&
    g.questions[g.index + 1].roundIndex !== current(g).roundIndex
  ) {
    g.status = "round_intro";
    g.deadline = null;
    g.leaderboardVisible = false;
    broadcast(g, "round_intro", { game: state(g) });
    return;
  }
  const next = g.questions[g.index + 1];
  const afterNext = g.questions[g.index + 2];
  if (
    g.status !== "last_question_intro" &&
    (!afterNext || afterNext.roundIndex !== next.roundIndex)
  ) {
    g.status = "last_question_intro";
    g.deadline = null;
    g.leaderboardVisible = false;
    broadcast(g, "last_question_intro", { game: state(g) });
    return;
  }
  g.index++;
  g.imageTelemetry = new Map();
  g.leaderboardVisible = false;
  // The question lands on every screen alone. The clock — and the answer tiles —
  // wait for the host to press again, so they can read the question out first.
  g.optionsVisible = current(g).type === "buzzer";
  g.startedAt = null;
  g.stats = {};
  for (const p of g.players.values()) {
    p.answered = false;
    p.pending = 0;
  }
  // A buzzer question has no countdown: the host plays the clip over the hall
  // speakers and closes buzzing when the room is ready. `seconds` is used only
  // as the scoring window, so earlier buzzers earn more.
  if (current(g).type === "buzzer") {
    g.status = "buzzer";
    g.deadline = null;
    g.buzzes = [];
    g.buzzingOpen = true;
    sendHostImages(g.host, g);
    sendHostPreview(g);
    return broadcast(g, "buzzer_started", {
      game: state(g),
      question: question(g),
      buzzes: buzzQueue(g),
      open: true,
    });
  }
  g.status = "question";
  g.deadline = null;
  sendHostImages(g.host, g);
  sendHostPreview(g);
  broadcast(g, "question_started", {
    game: state(g),
    question: question(g),
  });
}
// Second press: the options appear and the countdown starts. Starting the clock
// here is deliberate — nobody loses thinking time to the read-out before it.
function showOptions(g) {
  if (g.status !== "question") fail("This question is not waiting for options.");
  if (g.optionsVisible) return;
  const q = current(g);
  if (!q) fail("There is no question to show.");
  g.optionsVisible = true;
  g.startedAt = Date.now();
  g.deadline = g.startedAt + q.seconds * 1000;
  clearTimeout(g.timer);
  broadcast(g, "options_shown", { game: state(g), question: question(g) });
  markLiveDirty(g);
  g.timer = setTimeout(() => finishQuestion(g), q.seconds * 1000);
}
function sync(ws, g, type, extra = {}) {
  send(ws, type, {
    game: state(g),
    question: ["question", "results", "buzzer"].includes(g.status)
      ? question(g)
      : null,
    result: g.status === "results" ? result(g) : null,
    leaderboard: g.status === "ended" ? ranking(g) : null,
    serverNow: Date.now(),
    visibleLeaderboard: g.leaderboardVisible ? ranking(g) : [],
    ...extra,
  });
  markLiveDirty(g);
  sendHostImages(ws, g);
  if (ws === g.host) sendHostPreview(g);
}
function normalize(s) {
  return s
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 16384,
});
server.on("upgrade", (req, socket, head) => {
  try {
    if (
      new URL(req.url, "http://localhost").pathname !== "/live" ||
      !sameOrigin(req)
    )
      throw Error();
    // One venue Wi-Fi usually NATs all phones behind a single public address,
    // so this budget is shared by the whole room. Keep generous headroom for
    // reconnect storms; abuse is still bounded by the per-socket limits below.
    rate("connect:" + peer(req), CONNECTS_PER_MINUTE, 60000);
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  } catch {
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
  }
});
wss.on("connection", (ws, req) => {
  ws.alive = true;
  ws.on("pong", () => (ws.alive = true));
  const handleMessage = async (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (!msg || typeof msg.type !== "string") fail("Invalid message.");
      const now = Date.now();
      if (!ws.rate || ws.rate.until < now)
        ws.rate = {
          n: 0,
          until: now + 60000,
        };
      if (++ws.rate.n > 120) fail("Too many messages.", 429);
      if (msg.type === "ping")
        return send(ws, "clock", {
          serverNow: Date.now(),
        });
      if (msg.type === "create_game") {
        const admin = await requireUser(req);
        if (ws.readyState !== 1) return;
        if (ws.game) fail("Already in a game.");
        if (
          [...games.values()].filter(
            (g) => g.adminId === admin.id && g.status !== "ended",
          ).length >= 3
        )
          fail("End an existing game first (maximum 3).");
        if (!(await owns("quizzes", String(msg.quizId || ""), admin.id)))
          fail("Choose a saved quiz.");
        const row = await db
          .prepare("SELECT document FROM quizzes WHERE id=?")
          .get(String(msg.quizId || ""));
        if (ws.readyState !== 1) return;
        if (!row) fail("Choose a saved quiz.");
        const quiz = JSON.parse(row.document);
        let code;
        do {
          code =
            "QZ" +
            crypto.randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
        } while (games.has(code));
        const hostToken = crypto.randomBytes(32).toString("hex");
        const g = {
          code,
          quiz,
          quizId: String(msg.quizId || ""),
          organization: admin.organization || "",
          adminId: admin.id,
          hostToken,
          displayToken: crypto.randomBytes(32).toString("hex"),
          displaySession: hash(token(req)),
          imageTelemetry: new Map(),
          host: ws,
          created: Date.now(),
          status: "lobby",
          musicState: { playing: true, volume: 0.3 },
          leaderboardVisible: false,
          index: -1,
          deadline: null,
          questions: quiz.rounds.flatMap((r, i) =>
            r.questions.map((q) => ({
              ...q,
              round: r.title,
              roundIndex: i,
            })),
          ),
          clients: new Set([ws]),
          players: new Map(),
          history: [],
          historySeq: 0,
          stats: {},
        };
        games.set(code, g);
        ws.game = g;
        ws.role = "host";
        ws.adminId = admin.id;
        ws.sessionHash = hash(token(req));
        live.saveQuietly(g);
        return sync(ws, g, "game_created", {
          hostToken,
          music: features.mediaURL(quiz.music),
        });
      }
      if (msg.type === "claim_host") {
        // The host's laptop died, or the tab was closed, and with it the token
        // that lived in that tab. The account that owns the room may take the
        // room back from any signed-in browser: a fresh token is minted, the
        // abandoned connection is dropped, and the room carries on untouched.
        const admin = await requireUser(req);
        if (ws.readyState !== 1) return;
        const g = games.get(String(msg.code || "").toUpperCase());
        if (!g) fail("That game is not running on this site.", 404);
        if (g.adminId !== admin.id)
          fail("That game belongs to another account.", 403);
        if (g.status === "ended") fail("That game has already finished.");
        g.hostToken = crypto.randomBytes(32).toString("hex");
        if (g.host && g.host !== ws)
          g.host.close(4000, "Host moved to another connection");
        clearTimeout(g.orphanTimer);
        g.host = ws;
        if (g.displaySession !== hash(token(req)))
          for (const client of g.clients)
            if (client.role === "display")
              client.close(4000, "Host session changed; reconnect");
        g.displaySession = hash(token(req));
        g.clients.add(ws);
        ws.game = g;
        ws.role = "host";
        ws.adminId = admin.id;
        ws.sessionHash = hash(token(req));
        live.saveQuietly(g);
        broadcast(g, "host_online", {});
        return sync(ws, g, "host_resumed", {
          hostToken: g.hostToken,
          music: features.mediaURL(g.quiz.music),
        });
      }
      if (msg.type === "resume_host") {
        const admin = await requireUser(req);
        if (ws.readyState !== 1) return;
        const g = games.get(msg.code);
        if (!g || g.adminId !== admin.id || msg.hostToken !== g.hostToken)
          fail("Unable to resume this game.");
        if (g.host && g.host !== ws)
          g.host.close(4000, "Host moved to another connection");
        clearTimeout(g.orphanTimer);
        g.host = ws;
        if (g.displaySession !== hash(token(req)))
          for (const client of g.clients)
            if (client.role === "display")
              client.close(4000, "Host session changed; reconnect");
        g.displaySession = hash(token(req));
        g.clients.add(ws);
        ws.game = g;
        ws.role = "host";
        ws.adminId = admin.id;
        ws.sessionHash = hash(token(req));
        broadcast(g, "host_online", {});
        return sync(ws, g, "host_resumed", {
          music: features.mediaURL(g.quiz.music),
        });
      }
      if (msg.type === "join_display") {
        if (ws.game) fail("Already in a room.");
        const g = games.get(String(msg.code || ""));
        const access =
          g &&
          msg.displayToken === g.displayToken &&
          (await db
            .prepare(
              "SELECT expires FROM sessions WHERE token=? AND admin_id=? AND expires>?",
            )
            .get(g.displaySession, g.adminId, Date.now()));
        if (!access)
          fail(
            "Display link unavailable. Ask the host to open the projector again.",
            403,
          );
        ws.sessionExpiryTimer = setTimeout(
          () => ws.close(4001, "Host session expired"),
          Math.max(1, Number(access.expires) - Date.now()),
        );
        if ([...g.clients].filter((c) => c.role === "display").length >= 4)
          fail("Maximum four projector connections.");
        ws.game = g;
        ws.role = "display";
        ws.adminId = g.adminId;
        ws.sessionHash = g.displaySession;
        g.clients.add(ws);
        return sync(ws, g, "display_joined");
      }
      if (msg.type === "join_game" || msg.type === "resume_player") {
        if (ws.game) fail("Already in a game.");
        const g = games.get(
          String(msg.code || "")
            .trim()
            .toUpperCase(),
        );
        if (!g) fail("Game not found. Check the code.");
        let p;
        let reclaimed = false;
        if (msg.type === "resume_player") {
          p = [...g.players.values()].find(
            (p) => p.resumeToken === msg.playerToken,
          );
          if (!p) fail("This player session has expired. Please join again.");
          if (p.ws && p.ws !== ws)
            p.ws.close(4000, "Player moved to another connection");
        } else {
          if (g.status === "ended") fail("This game has ended.");
          if (g.players.size >= PLAYERS_PER_GAME)
            fail(`This game is full (${PLAYERS_PER_GAME} players).`);
          const name = bounded(msg.name, 30, "nickname");
          const seat = [...g.players.values()].find(
            (p) => normalize(p.name) === normalize(name),
          );
          if (seat) {
            // A player whose phone died, whose tab was swiped away, or who is on
            // a room rescued from another site has no browser token left. They
            // take back their own seat by name while that seat is empty. A seat
            // that is still connected is never taken over, and the host is told
            // whenever this happens so it can be seen.
            if (seat.ws) fail("That nickname is taken. Try another.");
            seat.resumeToken = crypto.randomBytes(32).toString("hex");
            seat.ws = null;
            // Coming back is also a chance to change who you play as.
            if (characterOk(msg.character)) seat.character = msg.character;
            if (ACCESSORY_IDS.includes(msg.accessory))
              seat.accessory = msg.accessory;
            seat.accessory = accessoryFor(seat);
            p = seat;
            reclaimed = true;
          } else {
            p = {
              id: crypto.randomUUID(),
              name,
              character: characterOk(msg.character)
                ? msg.character
                : pickCharacter(g),
              accessory: ACCESSORY_IDS.includes(msg.accessory)
                ? msg.accessory
                : "none",
              score: 0,
              answered: false,
              pending: 0,
              resumeToken: crypto.randomBytes(32).toString("hex"),
            };
            g.players.set(p.id, p);
          }
        }
        p.ws = ws;
        ws.game = g;
        ws.role = "player";
        ws.playerId = p.id;
        g.clients.add(ws);
        if (reclaimed)
          send(g.host, "seat_reclaimed", {
            name: p.name,
            score: p.score,
            message: `${p.name} rejoined and took back their seat on ${p.score} points.`,
          });
        sync(ws, g, "joined", {
          music: features.mediaURL(g.quiz.music),
          playerId: p.id,
          playerToken: p.resumeToken,
          answered: p.answered,
          reclaimed,
        });
        return broadcastRoster(g);
      }
      const g = ws.game;
      if (!g) fail("Join a game first.");
      if (ws.role === "display") fail("Projector is read-only.", 403);
      if (msg.type === "refresh_music")
        return send(ws, "music_refreshed", {
          music: features.mediaURL(g.quiz.music),
        });
      if (ws.role === "player" && msg.type === "image_status") {
        if (
          msg.questionId !== question(g)?.id ||
          !current(g)?.mediaType?.startsWith("image/") ||
          !["ready", "error"].includes(msg.state)
        )
          return;
        if (
          !Number.isFinite(msg.elapsedMs) ||
          msg.elapsedMs < 0 ||
          msg.elapsedMs > 180000
        )
          return;
        g.imageTelemetry.set(ws.playerId, {
          state: msg.state,
          elapsedMs: Math.round(msg.elapsedMs),
        });
        sendHostPreview(g);
        return;
      }
      if (ws.role === "player" && msg.type === "buzz") {
        if (g.status !== "buzzer") fail("There is nothing to buzz in on.");
        if (!g.buzzingOpen) fail("Buzzing has closed for this question.");
        if (!g.players.has(ws.playerId)) fail("Rejoin the game to buzz in.");
        if ((g.buzzes || []).some((b) => b.playerId === ws.playerId))
          fail("You have already buzzed in.");
        g.buzzes.push({
          playerId: ws.playerId,
          at: Date.now(),
          status: "waiting",
        });
        send(ws, "buzz_received", { position: g.buzzes.length });
        broadcastBuzzes(g);
        return sendHostPreview(g);
      }
      if (ws.role === "host") {
        const admin = await requireUser(req);
        if (ws.readyState !== 1) return;
        if (admin.id !== g.adminId || g.host !== ws)
          fail("Not authorized.", 403);
        if (msg.type === "refresh_images") return sendHostImages(ws, g, true);
        if (msg.type === "set_music") {
          if (
            typeof msg.playing !== "boolean" ||
            typeof msg.volume !== "number" ||
            !Number.isFinite(msg.volume) ||
            msg.volume < 0 ||
            msg.volume > 1
          )
            fail("Invalid music control.");
          g.musicState = { playing: msg.playing, volume: msg.volume };
          broadcast(g, "music_control", { musicState: g.musicState });
          return;
        }
        if (msg.type === "set_leaderboard") {
          if (typeof msg.visible !== "boolean")
            fail("Invalid leaderboard control.");
          g.leaderboardVisible = msg.visible;
          broadcast(g, "leaderboard_control", {
            visible: msg.visible,
            leaderboard: msg.visible ? ranking(g) : [],
          });
          return;
        }
        if (msg.type === "start_question" || msg.type === "next_question")
          return await startQuestion(g);
        if (msg.type === "show_options") return showOptions(g);
        if (msg.type === "reveal_answers")
          return g.status === "buzzer" ? finishBuzzer(g, false) : finishQuestion(g);
        if (msg.type === "stop_buzzing") {
          if (g.status !== "buzzer") fail("This is not a buzzer question.");
          g.buzzingOpen = false;
          return broadcastBuzzes(g);
        }
        if (msg.type === "buzz_verdict") {
          if (g.status !== "buzzer") fail("This is not a buzzer question.");
          if (typeof msg.correct !== "boolean")
            fail("Mark the answer correct or wrong.");
          const entry = (g.buzzes || []).find(
            (b) => b.playerId === msg.playerId,
          );
          if (!entry) fail("That player has not buzzed in yet.");
          if (entry.status !== "waiting")
            fail("That player has already answered.");
          const p = g.players.get(msg.playerId);
          if (!p) fail("That player is no longer in this game.");
          const elapsed = Math.max(0, entry.at - g.startedAt);
          entry.status = msg.correct ? "correct" : "wrong";
          if (msg.correct) {
            const window = current(g).seconds * 1000;
            const points = Math.round(
              Math.max(
                100,
                current(g).points *
                  (1 - (0.5 * Math.min(window, elapsed)) / window),
              ),
            );
            p.answered = true;
            p.pending = points;
            entry.points = points;
            recordAnswer(g, {
              playerId: p.id,
              questionIndex: g.index,
              answer: null,
              correct: true,
              credit: 1,
              points,
              elapsedMs: elapsed,
            });
            g.buzzingOpen = false;
            return finishBuzzer(g, true);
          }
          const penalty = Math.round(
            current(g).points * ((Number(current(g).buzzPenalty) || 0) / 100),
          );
          entry.points = -penalty;
          p.pending = (p.pending || 0) - penalty;
          recordAnswer(g, {
            playerId: p.id,
            questionIndex: g.index,
            answer: null,
            correct: false,
            credit: 0,
            points: -penalty,
            elapsedMs: elapsed,
          });
          return broadcastBuzzes(g);
        }
        if (msg.type === "end_game") return await endGame(g);
      }
      if (msg.type === "submit_answer" && ws.role === "player") {
        const p = g.players.get(ws.playerId);
        if (g.status !== "question") fail("The answer window has closed.");
        if (!g.optionsVisible)
          fail("The options are not on screen yet. Watch the big screen.");
        if (Date.now() >= g.deadline) fail("The answer window has closed.");
        if (msg.questionId !== question(g).id)
          fail("This answer belongs to an older question.");
        if (p.answered) fail("Your answer is already locked in.");
        const q = current(g);
        let answer = msg.answer;
        const credit = rules.grade(q, answer);
        const correct = credit === 1;
        const elapsed = Date.now() - g.startedAt;
        const points = Math.round(
          Math.max(
            100,
            Math.round(q.points * (1 - (0.5 * elapsed) / (q.seconds * 1000))),
          ) * credit,
        );
        p.answered = true;
        p.pending = points;
        recordAnswer(g, {
          playerId: p.id,
          questionIndex: g.index,
          answer,
          correct,
          credit,
          points,
          elapsedMs: elapsed,
        });
        if (q.type !== "text")
          for (const selected of q.type === "multi" ? answer : [answer])
            g.stats[selected] = (g.stats[selected] || 0) + 1;
        // Nobody is shown the split while the question is open — not the
        // players, not the projector, and not the host. Picking one answer
        // should not be swayed by seeing how the room is leaning. How the
        // room answered arrives with the correct answer, at the reveal.
        send(ws, "answer_received", {
          accepted: true,
        });
        return broadcastRoster(g);
      }
      fail("Action is not available.");
    } catch (e) {
      send(ws, "error", {
        message:
          e.status || e instanceof SyntaxError
            ? e.message
            : "Unable to complete that action.",
      });
    }
  };
  let messages = Promise.resolve();
  let pending = 0;
  ws.on("message", (raw) => {
    if (++pending > 12) {
      pending--;
      return ws.close(1008, "Too many pending actions");
    }
    messages = messages
      .then(() => handleMessage(raw))
      .catch(() => send(ws, "error", { message: "Unable to process action." }))
      .finally(() => pending--);
  });
  ws.on("close", () => {
    clearTimeout(ws.sessionExpiryTimer);
    const g = ws.game;
    if (!g) return;
    g.clients.delete(ws);
    if (ws.role === "player") {
      const p = g.players.get(ws.playerId);
      if (p.ws === ws) p.ws = null;
      broadcastRoster(g);
    }
    if (ws.role === "host" && g.host === ws) {
      g.host = null;
      if (g.status !== "ended") {
        broadcast(g, "host_offline", {
          message: "Host disconnected. They can reconnect to continue.",
        });
        g.orphanTimer = setTimeout(
          () =>
            endGame(
              g,
              `Host disconnected for ${Math.round(ORPHAN_MS / 60000)} minutes`,
            ).catch(() =>
              console.error("Could not save a disconnected game report."),
            ),
          ORPHAN_MS,
        );
      }
    }
  });
});
const heartbeat = setInterval(async () => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
  try {
    await db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    const active = new Set(
      (
        await db
          .prepare("SELECT token FROM sessions WHERE expires>?")
          .all(Date.now())
      ).map((s) => s.token),
    );
    for (const ws of wss.clients)
      if (ws.sessionHash && !active.has(ws.sessionHash))
        ws.close(4001, "Session expired");
  } catch {
    console.error("Session cleanup deferred: database unavailable.");
  }
  for (const [k, v] of limits) if (v.until < Date.now()) limits.delete(k);
}, 30000);
console.log(
  "Quizzes startup diagnostics v1 (credential values are never logged)",
);
checkStartup([
  { stage: "DATABASE_SCHEMA", promise: databaseReady },
  { stage: "MEDIA_BUCKET_VALIDATE", promise: mediaStore.ready },
])
  .then((healthy) => {
    if (!healthy) {
      console.error(
        "Startup stopped. Resolve the failed check(s) above and redeploy; no credentials were logged.",
      );
      process.exit(1);
    }
    server.listen(PORT, "0.0.0.0", async () => {
      console.log(
        `Quizzes listening on 0.0.0.0:${PORT} · ${db.kind} · ${mediaStore.remote ? "persistent cloud media" : "local media"}${setupEnabled ? " · private-preview first-run setup enabled" : ""}`,
      );
      // Sweep assignments whose seven-day recovery window has passed.
      const swept = await features
        .purgeDeletedPublications()
        .catch((error) => (console.error("Recovery sweep failed.", error), 0));
      if (swept)
        console.log(
          `Removed ${swept} deleted assignment(s) older than seven days.`,
        );
      // Pick up any live game that was running when this process last stopped.
      const recovered = await restoreLiveGames();
      if (recovered.resumed)
        console.log(
          `Recovered ${recovered.resumed} unfinished live game(s); players and hosts reconnect to the same code.`,
        );
      if (recovered.retired)
        console.log(
          `Closed ${recovered.retired} unfinished live game(s) that were not resumed within ${live.RESUME_HOURS} hours.`,
        );
    });
  })
  .catch((error) => {
    logStartupFailure("SERVER_STARTUP", error);
    process.exit(1);
  });
server.on("error", (error) => {
  logStartupFailure("SERVER_LISTEN", error);
  process.exit(1);
});

let stopping = false;
// Moving a running event to a second site. The bundle carries everything the
// other site needs to stand the room up on its own: the quiz, the pictures, the
// scores, the answer journal and the exact question position. Host and display
// tokens are deliberately left out and minted fresh by the receiving site.
async function buildLiveExport(g) {
  const ids = new Set();
  for (const q of g.questions) if (q.media) ids.add(q.media.split("/").pop());
  if (g.quiz.music) ids.add(g.quiz.music.split("/").pop());
  const media = [];
  for (const id of ids) {
    const row = await db.prepare("SELECT * FROM media WHERE id=?").get(id);
    if (!row) continue;
    try {
      const bytes = await mediaStore.read(id);
      media.push({
        id,
        mime: row.mime,
        name: row.name,
        data: bytes.toString("base64"),
      });
    } catch {
      // A missing picture must never stop the host from rescuing the room.
      console.error("A media file could not be packed for the game copy.");
    }
  }
  const game = live.serialize(g);
  delete game.hostToken;
  delete game.displayToken;
  delete game.displaySession;
  return {
    format: "quizzes-live-export",
    version: 1,
    created: Date.now(),
    source: { organization: g.organization || "", title: g.quiz.title },
    game,
    answers: g.history,
    media,
  };
}

async function journalAnswers(code, entries) {
  await db.prepare("DELETE FROM live_answers WHERE code=?").run(code);
  for (let i = 0; i < entries.length; i += 200) {
    const chunk = entries.slice(i, i + 200);
    const values = chunk.map(() => "(?,?,?)").join(",");
    const args = [];
    for (const entry of chunk) args.push(code, entry.seq, JSON.stringify(entry));
    await db
      .prepare(
        "INSERT INTO live_answers (code,seq,document) VALUES " + values,
      )
      .run(...args);
  }
}

async function importLiveGame(bundle, admin) {
  if (!bundle || bundle.format !== "quizzes-live-export")
    fail("That file is not a saved live game.");
  const saved = bundle.game;
  if (!saved || saved.format !== "quizzes-live-game" || !saved.quiz)
    fail("The saved game is incomplete.");
  const code = String(saved.code || "");
  if (!/^QZ[A-Z0-9]{6}$/.test(code)) fail("The saved game has an invalid code.");
  if (
    games.has(code) ||
    (await db.prepare("SELECT code FROM live_games WHERE code=?").get(code))
  )
    fail(`The code ${code} is already in use on this site.`);
  if (
    [...games.values()].filter(
      (g) => g.adminId === admin.id && g.status !== "ended",
    ).length >= 3
  )
    fail("End an existing game first (maximum 3).");

  // Bring the pictures and the music across, owned by whoever is resuming.
  const remapped = new Map();
  const items = Array.isArray(bundle.media) ? bundle.media.slice(0, 80) : [];
  for (const item of items) {
    const id = String((item && item.id) || "");
    if (!/^[a-f0-9-]{8,64}$/.test(id)) continue;
    let bytes;
    try {
      bytes = Buffer.from(String(item.data || ""), "base64");
    } catch {
      continue;
    }
    if (!bytes.length || bytes.length > 25 * 1024 * 1024) continue;
    const mime = /^[a-z]+\/[a-z0-9.+-]+$/i.test(String(item.mime || ""))
      ? String(item.mime)
      : "application/octet-stream";
    const fresh = crypto.randomUUID();
    await mediaStore.write(fresh, bytes, mime);
    await db.withTransaction(async (tx) => {
      await tx
        .prepare("INSERT INTO media (id,mime,name) VALUES (?,?,?)")
        .run(fresh, mime, String(item.name || "media").slice(0, 120));
      await tx
        .prepare("INSERT INTO ownership (kind,item_id,owner_id) VALUES (?,?,?)")
        .run("media", fresh, admin.id);
    });
    remapped.set(id, "/media/" + fresh);
  }
  const rewrite = (url) => remapped.get(String(url || "").split("/").pop()) || "";

  const source = saved.quiz;
  const quiz = await validateQuiz(
    {
      title: source.title,
      description: source.description || "",
      music: rewrite(source.music),
      rounds: (source.rounds || []).map((r) => ({
        title: r.title,
        questions: (r.questions || []).map((q) => ({
          ...q,
          media: rewrite(q.media),
        })),
      })),
    },
    admin.id,
  );
  await db.withTransaction(async (tx) => {
    await tx
      .prepare("INSERT INTO quizzes (id,document,updated) VALUES (?,?,?)")
      .run(quiz.id, JSON.stringify(quiz), Date.now());
    await tx
      .prepare("INSERT INTO ownership (kind,item_id,owner_id) VALUES (?,?,?)")
      .run("quizzes", quiz.id, admin.id);
  });

  const doc = {
    ...saved,
    adminId: admin.id,
    organization: admin.organization || "",
    quiz,
    quizId: quiz.id,
    imported: true,
    hostToken: crypto.randomBytes(32).toString("hex"),
    displayToken: crypto.randomBytes(32).toString("hex"),
    displaySession: null,
  };
  const g = buildRoom(doc);
  g.history = Array.isArray(bundle.answers) ? bundle.answers : [];
  g.historySeq = 0;
  for (const entry of g.history) g.historySeq = entry.seq = g.historySeq + 1;
  await journalAnswers(code, g.history);
  games.set(code, g);
  armRestoredRoom(g);
  await live.save(g);
  return {
    ok: true,
    code,
    status: g.status,
    index: g.index,
    players: g.players.size,
    hostToken: g.hostToken,
    quizId: quiz.id,
  };
}

// Moving a saved quiz between accounts or between installations. The bundle is
// self-contained: the quiz document plus every picture and sound it uses, so the
// receiving account needs nothing from the sender's database or storage.
const QUIZ_FILE = "quizzes-quiz-file";

function mediaIdsOf(quiz) {
  const ids = new Set();
  if (quiz.music) ids.add(quiz.music.split("/").pop());
  for (const round of quiz.rounds || [])
    for (const q of round.questions || [])
      if (q.media) ids.add(q.media.split("/").pop());
  return ids;
}

async function buildQuizFile(quiz) {
  const media = [];
  let missing = 0;
  for (const id of mediaIdsOf(quiz)) {
    const row = await db.prepare("SELECT * FROM media WHERE id=?").get(id);
    if (!row) {
      missing++;
      continue;
    }
    try {
      const bytes = await mediaStore.read(id);
      media.push({
        id,
        mime: row.mime,
        name: row.name,
        data: bytes.toString("base64"),
      });
    } catch {
      missing++;
    }
  }
  return {
    kind: QUIZ_FILE,
    version: 1,
    created: Date.now(),
    quiz,
    media,
    missing,
  };
}

// The receiving account owns fresh copies of every picture and sound, exactly
// as if they had uploaded them. Anything that fails to cross is reported rather
// than silently dropped, and a question keeps working without its picture.
async function adoptMedia(bundle, ownerId) {
  const remapped = new Map();
  const warnings = [];
  const items = Array.isArray(bundle.media) ? bundle.media : [];
  if (items.length > 400) fail("That file carries too many attachments.");
  for (const item of items) {
    const id = String((item && item.id) || "");
    if (!/^[a-f0-9-]{8,64}$/.test(id)) continue;
    let bytes;
    try {
      bytes = Buffer.from(String(item.data || ""), "base64");
    } catch {
      warnings.push("An attachment could not be read.");
      continue;
    }
    if (!bytes.length || bytes.length > 25 * 1024 * 1024) {
      warnings.push("An attachment was too large and was skipped.");
      continue;
    }
    const mime = /^[a-z]+\/[a-z0-9.+-]+$/i.test(String(item.mime || ""))
      ? String(item.mime)
      : "application/octet-stream";
    const fresh = crypto.randomUUID();
    await mediaStore.write(fresh, bytes, mime);
    await db.withTransaction(async (tx) => {
      await tx
        .prepare("INSERT INTO media (id,mime,name) VALUES (?,?,?)")
        .run(fresh, mime, String(item.name || "media").slice(0, 120));
      await tx
        .prepare("INSERT INTO ownership (kind,item_id,owner_id) VALUES (?,?,?)")
        .run("media", fresh, ownerId);
    });
    remapped.set(id, "/media/" + fresh);
  }
  return { remapped, warnings };
}

async function importQuizFile(bundle, admin) {
  if (!bundle || bundle.kind !== QUIZ_FILE)
    fail("That file is not a saved quiz.");
  const source = bundle.quiz;
  if (!source || !Array.isArray(source.rounds) || !source.rounds.length)
    fail("The saved quiz has no questions.");
  if (source.rounds.length > 20) fail("That quiz has more than 20 rounds.");

  const { remapped, warnings } = await adoptMedia(bundle, admin.id);
  const rewrite = (url) => {
    if (!url) return "";
    const fresh = remapped.get(String(url).split("/").pop());
    if (!fresh) warnings.push("A question picture was not in the file.");
    return fresh || "";
  };

  const quiz = await validateQuiz(
    {
      title: source.title,
      description: source.description || "",
      music: rewrite(source.music),
      rounds: source.rounds.map((r) => ({
        title: r.title || "",
        questions: (r.questions || []).map((q) => {
          const next = {
            type: q.type,
            text: q.text,
            notes: q.notes || "",
            seconds: q.seconds,
            points: q.points,
            media: rewrite(q.media),
          };
          if (q.accepted) next.accepted = q.accepted;
          if (q.buzzPenalty !== undefined) next.buzzPenalty = q.buzzPenalty;
          if (q.options) next.options = q.options;
          if (q.correct !== undefined && q.type !== "multi") next.correct = q.correct;
          if (q.correctAnswers) next.correctAnswers = q.correctAnswers;
          return next;
        }),
      })),
    },
    admin.id,
  );
  await db.withTransaction(async (tx) => {
    await tx
      .prepare("INSERT INTO quizzes (id,document,updated) VALUES (?,?,?)")
      .run(quiz.id, JSON.stringify(quiz), Date.now());
    await tx
      .prepare("INSERT INTO ownership (kind,item_id,owner_id) VALUES (?,?,?)")
      .run("quizzes", quiz.id, admin.id);
  });
  return {
    ok: true,
    quiz,
    media: remapped.size,
    warnings: [...new Set(warnings)],
  };
}

// A room is kept only as long as someone might come back to it. This adopts a
// saved room into the running process without touching a single rule of play.
function armRestoredRoom(g) {
  if (g.status === "question" && g.deadline) {
    const left = g.deadline - Date.now();
    if (left > 0) g.timer = setTimeout(() => finishQuestion(g), left);
    // The question ran out while the site was down: close it now rather than
    // handing out free seconds to whoever reconnects first.
    else finishQuestion(g);
  }
  if (g.status !== "ended")
    g.orphanTimer = setTimeout(
      () =>
        endGame(
          g,
          `No host reconnected within ${Math.round(ORPHAN_MS / 60000)} minutes of a restart`,
        ).catch(() =>
          console.error("Could not save the report of an abandoned game."),
        ),
      ORPHAN_MS,
    );
}
function buildRoom(doc) {
  const g = live.restore(doc);
  // A room saved before characters existed still comes back with one per player.
  for (const p of g.players.values()) {
    p.character = characterFor(p);
    p.accessory = accessoryFor(p);
  }
  g.clients = new Set();
  g.imageTelemetry = new Map();
  g.host = null;
  g.timer = null;
  g.orphanTimer = null;
  g.expiry = null;
  return g;
}
async function restoreLiveGames() {
  let rows;
  try {
    rows = await db.prepare("SELECT saved, document FROM live_games").all();
  } catch {
    console.error("Could not read saved live games.");
    return { resumed: 0, retired: 0 };
  }
  let resumed = 0;
  let retired = 0;
  for (const row of rows) {
    let doc;
    try {
      doc = JSON.parse(row.document);
    } catch {
      continue;
    }
    if (games.has(doc.code)) continue;
    let g;
    try {
      g = buildRoom(doc);
    } catch {
      await live.forget(doc.code).catch(() => {});
      continue;
    }
    // Past its keep-by date: settle it with a report so nothing is lost.
    const lastSeen = Number(row.saved) || Number(doc.saved) || 0;
    if (!lastSeen || Date.now() - lastSeen > live.RESUME_MS) {
      try {
        await endGame(g, "This game was never resumed after a restart");
        retired++;
      } catch {
        await live.forget(g.code).catch(() => {});
      }
      continue;
    }
    try {
      await live.loadAnswers(g);
    } catch {
      console.error("Could not read the saved answers of an interrupted game.");
    }
    games.set(g.code, g);
    armRestoredRoom(g);
    resumed++;
  }
  return { resumed, retired };
}
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(heartbeat);
  for (const [code, g] of games) {
    clearTimeout(liveSaveTimers.get(code));
    liveSaveTimers.delete(code);
    clearTimeout(g.expiry);
    clearTimeout(g.orphanTimer);
    clearTimeout(g.timer);
    // A controlled restart is a pause, not an ending: keep the room so the
    // same code, scores and question position come back when the site does.
    if (g.status === "ended") continue;
    try {
      await live.save(g);
    } catch {
      console.error("Could not save an interrupted game.");
    }
  }
  for (const ws of wss.clients) ws.terminate();
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
