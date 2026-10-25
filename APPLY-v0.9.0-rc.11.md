# Quizzes — a live quiz now survives a crash (rc.11)

**Build: 0.9.0-rc.11 · Locally tested candidate · Not deployed by the assistant**

## What you get

**If your site dies mid-quiz, the quiz carries on.**

- The room is saved as it plays. Restart, redeploy or crash: the same code, the
  same players, the same scores and the same question come back, and players'
  tabs reconnect by themselves.
- A countdown that was running keeps running; one that ran out while the site was
  down is closed properly instead of giving away free seconds.

**If you want to move the quiz to your second site:**

1. On the host screen, press **Save game copy**. One file downloads.
2. On the other site: **My quizzes → Resume a live game** → choose that file.
3. The room opens there on the **same code**, same question, same scores. Players
   enter the same name and get their score back.

**One permanent link for players:** the `redirect` folder in the package is a free
static page that sends everyone to whichever of your two sites is awake. Setup
steps are in `redirect/README.md` (about three minutes on Cloudflare Pages).

Full runbook, including exactly what to do during an event: **`FAILOVER.md`**.

## Install

1. **Back up first.** Settings → Download a private backup.
2. Upload the files from **`Quizzes-v0.9.0-rc.11-update.zip`** into your GitHub
   repository root, replacing the existing versions. **Skip `database-config.js`**
   — it is not in the zip and must never be replaced.
3. Commit, then **Manual Deploy → Deploy latest commit**.
4. `/healthz` should return `{"ok":true,"version":"0.9.0-rc.11"}`.

Two new tables are created on first start. **No existing quiz, assignment,
attempt, report or account is touched**, and nothing is migrated.

## One behaviour to know about

A **deploy no longer ends a running game** — it pauses it. Before, deploying
mid-event ended every room with "Server stopped". Now the room waits for the host
and players to reconnect (5 minutes by default, adjustable with
`HOST_RECONNECT_MINUTES`).

## Trying it safely

Host a short throwaway quiz, let one person answer a question, then restart the
site from your hosting dashboard. Reopen the host screen: the same code should be
there with the same question and score. Then press **Save game copy**, load it
into your second site, and check it opens on the same code. Delete both.

## Files you should not replace

`database-config.js` holds your connection settings and is never in the update
zip. `qr-code.js` is unchanged in this release.
