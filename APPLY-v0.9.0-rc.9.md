# Quizzes — wrong-buzz negative marking (rc.9)

**Build: 0.9.0-rc.9 · Locally tested candidate · Not deployed by the assistant**

## What you get

A **Wrong buzz penalty** dropdown on every buzzer question:

- **No penalty** (default) — nothing is deducted.
- **Lose 25% / 50% / 100% of this question’s points.**

The penalty is a share of that question's own points, so it scales with the question.
Only the player who buzzed and answered wrong pays it. Scores can go negative, and the
leaderboard shows that.

The figure appears on the host queue row, on the projector next to the name, and on the
player's phone (*“Wrong answer — you lost 250 points.”*).

**Assigned (self-paced) quizzes are unchanged:** there is no host to judge the answer, so
a buzzer question there is graded as a typed answer and never penalised.

**Already-saved quizzes are unchanged:** they simply have no penalty until you set one.

## Install

1. **Back up first.** Settings → Download a private backup → confirm your password.
2. Upload the files from **`Quizzes-v0.9.0-rc.9-update.zip`** into your GitHub repository
   root, replacing the existing versions. **Skip `database-config.js`** — it is not in the
   zip and must never be replaced.
3. Commit, then **Manual Deploy → Deploy latest commit**.
4. `/healthz` should return `{"ok":true,"version":"0.9.0-rc.9"}`.
5. Open a buzzer question in the editor: the new dropdown sits under the expected answer.
   Set it, save, and try one round in rehearsal before event day.

## Before you deploy

Finish any **live** game first: an active room lives in the server's memory and does not
survive a restart. Self-paced assignments are unaffected.
