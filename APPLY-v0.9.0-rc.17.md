# Quizzes — moving faces, and a question that waits for you (rc.17)

**Build: 0.9.0-rc.17 · Locally tested candidate · Not deployed by the assistant**

## The two things you asked for

**The faces move.** Every player's animal now sways or bobs on its own rhythm —
different speed per player, so a lobby looks alive instead of arranged. A new
arrival hops twice. Your own face is the biggest thing on your phone while you
wait. They stop completely on any device that asks for reduced motion.

**The question comes first, the options second.** Press **Start question**: the
question appears alone, with no answers and **no clock**, so you can read it out.
Press again — **Show options ▶** — and the answer tiles fly in and the countdown
starts. Press a third time to reveal.

That order is enforced on the server, not just on screen: a phone is never sent
the options before you show them, and an early answer is refused.

## Install

1. Upload the files from **`Quizzes-v0.9.0-rc.17-update.zip`** into your GitHub
   repository root, replacing the existing versions. **Skip `database-config.js`**
   — it is not in the zip and must never be replaced.
2. Commit, then **Manual Deploy → Deploy latest commit**.
3. `/healthz` should return `{"ok":true,"version":"0.9.0-rc.17"}`.

No database change; nothing stored is rewritten. A game already running when you
deploy comes back with its options shown, as before.

## What changed for you at the podium

Nothing you have to relearn — only the button you already press now takes two
presses to get a question started. The button renames itself each time:
**Start question → Show options ▶ → Reveal answers**.
