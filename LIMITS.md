# Every fixed limit in Quizzes

One page, so nothing surprises you mid-way through writing a quiz. All of these
are also shown in **Settings → Amounts and limits** inside the app.

The last column says whether an operator can change it with an environment
variable on the hosting dashboard, without touching code.

## Quizzes

| Limit | Value | Adjustable |
|---|---|---|
| Questions per quiz | 200 | no |
| Rounds per quiz | 20 | no |
| Answer choices per question | 2–6 | no |
| Accepted answers (fill-in / buzzer) | 20, up to 200 characters each | no |
| Question text | 1,000 characters | no |
| Private host notes | 1,000 characters | no |
| Quiz title | 120 characters | no |
| Description | 1,000 characters | no |
| Round name | 100 characters | no |
| Timer per question | 5–120 seconds | no |
| Timer, round buttons | 10, 15, 20, 30, 35, 40, 45, 60, 90, 120 seconds | no |
| Player faces | 24 in the set; repeats only past 24 players in one room | no |
| Answer reveal | 1.5 s after the question on host/projector, 0.15 s on a phone | no |
| Answer split | Shown **only** once the answers are revealed · nothing is shown while the question is open, to anyone | no |
| Question start | Two presses: the question, then the options. **No clock runs between them** — the countdown starts with the options | no |
| Points per question | 100–5,000 | no |
| Saved editor draft | 500,000 characters | no |

## Files

| Limit | Value | Adjustable |
|---|---|---|
| Picture or sound per question | 10 MB | no |
| Image before upload | resized to 1,600 px and re-compressed in the browser | no |
| **Files added per hour, per account** | **400** | `UPLOAD_PER_HOUR` (20–2000) |
| Word / PDF / text import | 5 MB or 200,000 characters | no |
| Backups generated | 10 per hour | no |
| Media carried in one live-game rescue file | 80 files, 25 MB each | no |

## Live games

| Limit | Value | Adjustable |
|---|---|---|
| Players in one room | 100 | `PLAYERS_PER_GAME` (2–500) |
| Nickname | 30 characters, unique in the room | no |
| Open rooms per host at once | 3 | no |
| Projector screens per room | 4 | no |
| Host reconnect before the room closes | 5 minutes | `HOST_RECONNECT_MINUTES` (1–60) |
| Unfinished room kept after a restart | 24 hours | `LIVE_RESUME_HOURS` (1–168) |
| WebSocket connects per minute per address | 1,200 | `CONNECTS_PER_MINUTE` (50–10000) |

## Assigned quizzes

| Limit | Value | Adjustable |
|---|---|---|
| Attempts per assigned link | 200 | `ATTEMPTS_PER_QUIZ` (1–5000) |
| Attempts per browser | 1, remembered 180 days | no |
| Assignments created per day | 100 | no |
| Assignments deleted, recoverable | 7 days | no |
| Closing time | future, at most one year ahead | no |
| Participant requests per hour | 4,000 | `PARTICIPANT_POSTS_PER_HOUR` (100–20000) |

## Sign in and accounts

| Limit | Value | Adjustable |
|---|---|---|
| Stay signed in | 12 hours since your **last visit** (it renews as you work) | `SESSION_HOURS` (1–30) |
| Absolute session ceiling | 30 days | no |
| Password length | 8–128 characters | no |
| Invitations | 20 per day, each valid 24 hours | no |
| Sign-in attempts | 12 per 15 minutes per address | no |
| First-run host account creation | 5 per 15 minutes, once per site | no |
| Password resets with a recovery code | 8 per 15 minutes per address | no |
| Administrator oversight edits | 120 per minute | no |

## What never expires on its own

Saved quizzes, question pictures and soundtracks, session reports, assigned-quiz
results and deleted assignments' results — all kept until you delete them. The
only automatic removal anywhere is the 7-day sweep of **already-deleted**
assignments.

---

## If you need more

Set the variable on your hosting dashboard (Render → your service → Environment),
then redeploy. Nothing in the database changes.

- **A bigger live room:** `PLAYERS_PER_GAME=150`. Free containers have little
  memory and bandwidth; 100 was measured at about 81 MB of memory with 100
  players answering. Raise it with an eye on your plan.
- **More than 200 people on one assigned link:** `ATTEMPTS_PER_QUIZ=400`.
- **A longer working day without signing in again:** `SESSION_HOURS=24`.
- **More pictures in one sitting:** `UPLOAD_PER_HOUR=800`.
