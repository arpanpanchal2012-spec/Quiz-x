# Quizzes — every limit now on the record (rc.13)

**Build: 0.9.0-rc.13 · Locally tested candidate · Not deployed by the assistant**

## What this build fixes

After the upload ceiling (rc.12), every remaining fixed number was audited.
These changed because they could disrupt real use:

- **Sign-in no longer expires mid-work.** It was 12 hours from signing in; it is
  now 12 hours from your **last visit**, renewing as you go, with a 30-day hard
  ceiling.
- **200 attempts per assigned link** (was 100), and the host screen shows the
  real figure instead of a fixed “/100”.
- **4,000 participant requests an hour** (was 500) — enough for the longest
  self-paced quiz.
- **100 assignments a day** (was 20), **20 invitations a day** (was 5),
  **10 backups an hour** (was 3).
- **Room size stays 100** but is now adjustable if you ever need it.

## What you can now see

**Settings → Amounts and limits** lists every fixed number in the app — quizzes,
files, live games, assigned quizzes, sign-in, and what never expires. `LIMITS.md`
in the package has the same list plus the environment variable to change each
adjustable one.

## Install

1. Upload the files from **`Quizzes-v0.9.0-rc.13-update.zip`** into your GitHub
   repository root, replacing the existing versions. **Skip `database-config.js`**
   — it is not in the zip and must never be replaced.
2. Commit, then **Manual Deploy → Deploy latest commit**.
3. `/healthz` should return `{"ok":true,"version":"0.9.0-rc.13"}`.

No database change of any kind. Nothing stored is rewritten.

## Optional settings

Set on your hosting dashboard, then redeploy — none are required:

| Variable | Default | Meaning |
|---|---|---|
| `PLAYERS_PER_GAME` | 100 | Players in one live room (2–500) |
| `ATTEMPTS_PER_QUIZ` | 200 | People who may join one assigned link |
| `SESSION_HOURS` | 12 | Hours of inactivity before sign-in expires |
| `UPLOAD_PER_HOUR` | 400 | Files that may be added per hour |
| `PARTICIPANT_POSTS_PER_HOUR` | 4000 | Requests from one participant per hour |
