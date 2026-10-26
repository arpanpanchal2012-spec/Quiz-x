# Quizzes — faster editing, faces, and the answer bars (rc.16)

**Build: 0.9.0-rc.16 · Locally tested candidate · Not deployed by the assistant**

## What you asked for

| You asked | What it does now |
|---|---|
| Move a question up or down by dragging it | Press a question in the left rail and drag; a line shows where it lands. `↓ Move down` sits beside `↑ Move up` for anyone not dragging. |
| Set 35 or 40 seconds once for a whole round | Each round has **Time for every question**. Pick a time, every question in the round changes, and new questions arrive on that clock. **Use in all rounds** covers the whole quiz. |
| An emoji for each player when they join | Everyone gets a different animal face — on the lobby wall, on their own phone, in the standings, on the projector. |
| Question first, then the options | The question lands alone; the answer tiles follow 1.5 s later on the big screen. The timer is untouched. |
| A bar per option after players answer | On reveal, each option shows a bar and the number who chose it — on your screen, the projector and every phone. While the question is open, only you see the tally building. |

## Install

1. Upload the files from **`Quizzes-v0.9.0-rc.16-update.zip`** into your GitHub
   repository root, replacing the existing versions. **Skip `database-config.js`**
   — it is not in the zip and must never be replaced.
2. Commit, then **Manual Deploy → Deploy latest commit**.
3. `/healthz` should return `{"ok":true,"version":"0.9.0-rc.16"}`.

No database change; nothing stored is rewritten. Deploy before an event rather
than during one — a deploy pauses a running room, and you would rejoin it with
**Rejoin as host** on **My quizzes**.

## A two-minute look

1. Open a quiz and try dragging a question in the left rail.
2. Set the round's time to 35 seconds and watch every question follow.
3. Host it, join from your phone, and check that your face is on both screens.
4. Answer, let the host reveal, and look at the bars.

## One thing worth knowing

The faces are a set of 24. A room with more than 24 players starts repeating
them (in a different order per room). Names still tell everyone apart.
