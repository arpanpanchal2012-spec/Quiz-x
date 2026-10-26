# Quizzes — move a quiz to another account (rc.14)

**Build: 0.9.0-rc.14 · Locally tested candidate · Not deployed by the assistant**

## What you can now do

**Copy a finished quiz into a second account — or a second installation — with one
file.**

1. In the account that has the quiz: **My quizzes** → on the quiz's card press
   **Download**. One `.json` file saves to your computer.
2. In the other account: **My quizzes** → **⇄ Move a quiz** → choose that file.
3. The quiz appears there, complete: questions, answers, timers, points, private
   notes, buzzer answers, and every picture and sound.

The receiving account owns its own copies of the pictures, so you can delete the
quiz in the original account afterwards without breaking anything.

**What travels:** the quiz and its media.
**What stays behind:** assigned links and their results, live session reports, and
the deleted-assignments bin. Those belong to the account that created them.

## Install

1. Upload the files from **`Quizzes-v0.9.0-rc.14-update.zip`** into your GitHub
   repository root, replacing the existing versions. **Skip `database-config.js`**
   — it is not in the zip and must never be replaced.
2. Commit, then **Manual Deploy → Deploy latest commit**.
3. `/healthz` should return `{"ok":true,"version":"0.9.0-rc.14"}`.

No database change of any kind; nothing stored is rewritten.

## Notes

- Do this on **both** sites if you want to move between them: the version that
  receives the file must be rc.14 or later, so it knows the format.
- One file can carry up to 64 MB and 400 pictures or sounds — more than the
  largest quiz the editor allows.
- If a picture fails to cross, the import says so instead of quietly dropping it.
