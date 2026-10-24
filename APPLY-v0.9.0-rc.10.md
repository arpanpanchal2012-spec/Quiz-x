# Quizzes — reactivate a deleted assignment (rc.10)

**Build: 0.9.0-rc.10 · Locally tested candidate · Not deployed by the assistant**

## What you get

Delete an assignment by mistake and you can bring it back.

- **Recently deleted** appears under Published quizzes and holds every deleted
  assignment for **seven days**, results included.
- **Restore** brings back the **same link**, the same results and the same leaderboard.
- **Restore and reopen…** does that and gives it a new deadline in one step.
- **Reopen** on a published assignment that has simply passed its deadline puts the same
  link back to work with a new deadline.
- **Delete for good** removes it immediately when you really mean it.

Nothing else changes: an assignment must still be closed before it can be deleted, and
deadlines must still be in the future and no more than a year ahead.

## Install

1. **Back up first.** Settings → Download a private backup → confirm your password.
2. Upload the files from **`Quizzes-v0.9.0-rc.10-update.zip`** into your GitHub
   repository root, replacing the existing versions. **Skip `database-config.js`** — it
   is not in the zip and must never be replaced.
3. Commit, then **Manual Deploy → Deploy latest commit**.
4. `/healthz` should return `{"ok":true,"version":"0.9.0-rc.10"}`.
5. The first start adds one column to your existing database. It does not rewrite or
   migrate any stored data; assignments deleted before this release were erased
   permanently and cannot come back.

## Before you deploy

Finish any **live** game first: an active room lives in the server's memory and does not
survive a restart. Self-paced assignments in progress are unaffected — they are stored
in the database and resume where each participant left off.

## Trying it safely

Assign a quiz you do not need, close it, delete it, then press **Restore**. The link
should be the same one you started with. Delete it twice when you want it gone.
