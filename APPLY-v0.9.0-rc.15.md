# Quizzes — get back into a running quiz (rc.15)

**Build: 0.9.0-rc.15 · Locally tested candidate · Not deployed by the assistant**

## Why you want this one

If your laptop died, or the host tab was closed, you previously could not get back
into a running game — even though you were signed in to the same account — and the
room closed itself five minutes later. A player whose phone died was locked out of
their own score the same way.

## What changed

- **Rejoin as host.** While a room is running, **My quizzes** shows a strip with
  its code, question and player count, and a **Rejoin as host** button. Sign in on
  any other computer and press it: same room, same question, same scores.
- **Player seats come back.** A returning player enters the same nickname and gets
  their seat, score and answers back. You see a notice each time it happens.
- A seat that is **still connected** can never be taken by someone else typing
  that name.
- `FAILOVER.md` is now a complete runbook: what each failure looks like, what to
  do, and what to say to the room.

## Install

1. Upload the files from **`Quizzes-v0.9.0-rc.15-update.zip`** into your GitHub
   repository root, replacing the existing versions. **Skip `database-config.js`**
   — it is not in the zip and must never be replaced.
2. Commit, then **Manual Deploy → Deploy latest commit**.
3. `/healthz` should return `{"ok":true,"version":"0.9.0-rc.15"}`.

No database change; nothing stored is rewritten. A running game is paused by the
deploy and can be rejoined with **Rejoin as host**, so deploy *before* your event.

## The five-minute rehearsal

Host a throwaway game, then **close the whole browser** (not just the tab). Open a
new browser, sign in, and you should see the strip and be able to rejoin. End the
game and delete it.
