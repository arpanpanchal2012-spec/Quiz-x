# Quizzes — right-sized answers at the reveal, and time per round (rc.18)

**Build: 0.9.0-rc.18 · Locally tested candidate · Not deployed by the assistant**

## What you asked for

**No counts while people are answering.** The running tally is gone from the host
screen, and the server no longer sends it at all. Nobody — not you, not the
projector, not the players — can see how the room is leaning until the answers
are revealed.

**Bars like the picture.** At the reveal, each answer gets a **column standing on
top of its own tile**, with the count above it and the correct answer's column in
green. That is on your screen and on the projector. The height is to scale, so
"everyone picked this one" is obvious from the back of the room. Phones keep the
simple in-button bar.

**Time per round.** A new panel above the editor lists every round once:

```
1 · Warm up   2 questions   45 seconds
2 · Speed     2 questions   30 seconds
Every round   all 4         Same time everywhere…
```

Set 45 for round one, 30 for round two. Each round's questions follow. It also
shows the quiz total ("2 rounds, 2 min 30 s").

## Install

1. Upload the files from **`Quizzes-v0.9.0-rc.18-update.zip`** into your GitHub
   repository root, replacing the existing versions. **Skip `database-config.js`**
   — it is not in the zip and must never be replaced.
2. Commit, then **Manual Deploy → Deploy latest commit**.
3. `/healthz` should return `{"ok":true,"version":"0.9.0-rc.18"}`.

No database change; nothing stored is rewritten. Times are still saved per
question in the field that already existed, so quizzes you have already written
open with their own times intact.
