# Quizzes 0.9.0-rc.13 — verification record

**October 25, 2026 · Test candidate · Not deployed by assistant**

## Included change: no hidden ceilings

rc.12 fixed the 60-file upload ceiling. This release finishes the job: every
fixed number in the app is now either documented in the app, adjustable by an
operator, or both.

### Fixed because they could bite a real host

| Was | Now | Why it mattered |
|---|---|---|
| Sessions ended **12 hours after signing in**, with no renewal | **12 hours since your last visit**, renewing as you work; hard ceiling 30 days; adjustable with `SESSION_HOURS` | Preparing a quiz the night before meant being signed out during the event |
| **500 participant requests an hour** | **4,000** (`PARTICIPANT_POSTS_PER_HOUR`) | A long self-paced quiz makes about two requests per question |
| **100 attempts** per assigned link, hard-coded | **200**, adjustable (`ATTEMPTS_PER_QUIZ`), and the host screen now shows the real number instead of a hard-coded `/100` | A group bigger than 100 could not join an assigned quiz at all |
| **100 players** per live room, hard-coded | Still **100** by default, adjustable (`PLAYERS_PER_GAME`, up to 500) | Was invisible; now on the record |
| 20 assignments a day | **100 a day** | Unannounced ceiling on creating links |
| 5 invitations a day | **20 a day** | Unannounced ceiling on sharing the workspace |
| 3 backups an hour | **10 an hour** | Two failed clicks could lock backups for an hour |

### Made visible

**Settings → Amounts and limits** now lists every fixed number in the app, in
six groups: quizzes, files, live games, assigned quizzes, sign-in, and what never
expires on its own. The same list is in `LIMITS.md` in the package, with the
environment variable for each adjustable one.

Nothing about how a quiz plays, scores or looks changed.

## Effect on data already stored

No schema change. No row rewritten. Existing sessions keep working; they simply
stop expiring mid-work.

## Executed verification

| Check | Result |
|---|---|
| Node 22 application suite | **112 passed, 0 failed** (was 106) |
| New limits suite | **6 passed** |
| Chromium end-to-end workflow | **1 passed**, about 1.4 minutes |

The limits suite proves: a session close to expiry is extended when the host uses
the app, and an already-expired session is still refused; an assigned link carries
its real attempt allowance to the host screen and refuses the attempt after it
with a message naming that number; a deliberately small room size refuses the
next player and says the size; and the shipped defaults match what `LIMITS.md`
documents.

## Files changed since rc.12

`server.js` (sliding session with a hard ceiling, adjustable room size),
`workspace-features.js` (adjustable attempts per link and participant request
budget, allowance exposed to the screen, looser daily counters), `extensions.js`
(the host screen shows the real allowance), `index.html` and `styles.css` (the
Amounts and limits panel), `tests/limits.test.js` (new), `LIMITS.md` (new),
`package.json`, the three HTML asset version strings, and this document.
