# Quizzes — picture uploads no longer stop you (rc.12)

**Build: 0.9.0-rc.12 · Locally tested candidate · Not deployed by the assistant**

## The problem you hit

The server allowed **60 file uploads per hour** per account. Adding a picture to
each of 75 questions used that up around the 57th–60th picture (the soundtrack
and any replaced images counted too), and the screen said only *"Too many
attempts. Please try again later."*

## What this build does

- Allows **400 uploads per hour** — a whole 200-question quiz with pictures, its
  music, and replacements in one sitting.
- If a limit is ever reached, the message now tells you the number, roughly how
  long until it clears, and that **the pictures already added are safe**.
- Nothing else changes: same 10 MB per file, same formats, same in-browser
  compression, same storage.

## Install

1. Upload the files from **`Quizzes-v0.9.0-rc.12-update.zip`** into your GitHub
   repository root, replacing the existing versions. **Skip `database-config.js`**
   — it is not in the zip and must never be replaced.
2. Commit, then **Manual Deploy → Deploy latest commit**.
3. `/healthz` should return `{"ok":true,"version":"0.9.0-rc.12"}`.

No database change of any kind. Your 57 pictures and the quiz they belong to are
untouched and will still be there after the deploy. You can carry on adding the
remaining pictures immediately — the counter also resets on restart.

## If you would rather not deploy right now

The count is kept in memory and clears an hour after your first upload of the
hour. Restarting the service from your hosting dashboard also clears it
immediately. Deploying is the permanent fix.
