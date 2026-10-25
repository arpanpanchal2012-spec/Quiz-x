# Quizzes 0.9.0-rc.11 — verification record

**October 25, 2026 · Test candidate · Not deployed by assistant**

## Included change: a live quiz survives a crash, and can be carried to the second site

Until now a running game existed only in the server's memory: a restart, a deploy
or a crash erased it, scores included. This release makes a running room
recoverable in two independent ways.

### 1. Same site — automatic

Every room is mirrored into the database while it plays (`live_games`), and every
scored answer is appended to a journal (`live_answers`). On restart the site
rebuilds the unfinished room:

- the same code and the same join link,
- the same players with their scores and their place,
- the same question, with the countdown continuing on the original clock,
- a question whose time ran out during the outage is closed immediately rather
  than paying out free seconds,
- the host reconnects into the same room and remains in control.

Nothing about play changes: same questions, same scoring, same phases. The
journal is written beside the game, not instead of it.

### 2. Second account — one button

**Save game copy** on the host screen writes a single `.json` file containing the
quiz, its pictures, the scores, the answers given so far and the exact question
position. On the other site, **Resume a live game** (under Published quizzes)
loads that file: the room comes back on the same code, at the same question, with
the same scores.

- The file never contains host or projector credentials; the receiving site mints
  its own.
- The quiz is re-validated and re-created in the receiving account, with the
  pictures copied across.
- A returning player enters the same name and takes back their own seat. A seat
  that is currently connected cannot be taken by someone else typing that name.

### 3. One permanent link for players

`redirect/index.html` is a static page (free to host on Cloudflare Pages, Netlify
or GitHub Pages) that checks both deployments and forwards players to whichever
is awake, keeping the path and query string. Setup is in `redirect/README.md`.

### Retention

A room nobody comes back to closes with a results report after
`HOST_RECONNECT_MINUTES` (default 5), and an unfinished room is settled after
`LIVE_RESUME_HOURS` (default 24) instead of being kept forever. Both are optional.

## Effect on data already stored

Two **new** tables are created on first start (`live_games`, `live_answers`). No
existing table, row, publication, attempt or report is touched, and nothing is
migrated or rewritten. A game now finishes by *deleting* its recovery row, so an
ended game leaves nothing behind.

One behaviour changed on purpose: a **graceful restart (a deploy) no longer ends
the running game**. It used to end every room with "Server stopped"; now it
pauses the room so players and host come back to it.

## Executed verification

| Check | Result |
|---|---|
| Node 22 application suite | **103 passed, 0 failed** (was 92) |
| New live-recovery suite | **11 passed** |
| TLS/CA regression suite | **5 passed** |
| Chromium end-to-end workflow | **1 passed**, about 1.4 minutes |
| Hosted regression (`tools/verify-hosted.cjs`) | **27/27** |
| Live recovery on real PostgreSQL 17 + TLS (`tools/verify-live-postgres.cjs`) | **14/14** |
| Two-site rescue in a real browser (`tools/ui-live-rescue-check.cjs`) | **11/11** |
| Permanent-link page (`tools/check-redirect.cjs`) | **3/3** |

The live-recovery suite proves: a room is written to the database while it plays;
after `SIGTERM` and a restart the host resumes the same code at the same question;
players reconnect with their own token and keep their points; the countdown that
was running keeps running and then scores correctly; the saved copy carries the
quiz, the players and the answers but no credentials; a second installation
refuses a file that is not a game; that installation resumes the room on the same
code with the scores intact; a player reclaims their seat by name while a
connected seat is protected; the resumed room plays on and writes a normal
report; and a room aged past the window is closed with a report instead of
lingering.

The PostgreSQL run additionally proves both tables are created inside the private
`quizzes_private` schema, that a room and its answer are stored there, that the
room comes back at the same question after a restart, and that a finished room
leaves no recovery row behind.

## Files changed since rc.10

New: `live-saves.js`, `redirect/` (page, `_redirects`, `404.html`, setup notes),
`tests/live-recovery.test.js`, `FAILOVER.md`.
Changed: `server.js` (save hooks, boot recovery, retirement, export/import
endpoints, seat reclaim, shutdown), `storage.js` (two tables and schema
qualification), `index.html` and `extensions.js` and `app.js` (Save game copy,
Resume a live game, reclaim notice), `styles.css`, `package.json` (test script and
version), the three HTML asset version strings, and this document.

Everything from rc.4 through rc.10 — event-capacity hardening, image
optimisation, the buzzer round, Design D on assigned screens, clip Play/Stop,
wrong-buzz negative marking and recoverable deleted assignments — is included in
this package.
