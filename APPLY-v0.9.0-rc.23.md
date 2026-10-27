# Quizzes — characters that move (rc.23)

**Build: 0.9.0-rc.23 · Locally tested candidate · Not deployed by the assistant**

## What you asked for

**Blinking.** Every drawn character now has real eyelids: the whole eye closes,
it blinks twice, and each figure keeps its own rhythm (6.5–11 s), so a room full
of them never blinks together. One eye winks now and then. The faces also gained
eyebrows, which is what makes the rest of the reactions readable.

**A different reaction for each moment.**

- **Right answer:** crouch, leap, arms up, eyes squeeze with joy, sparkles and a
  green glow. Picture characters do three happy hops.
- **Wrong answer:** shoulders drop, head shakes "no", brows furrow, a sweat drop
  slides down. Picture characters shrink, tilt and grey out for a beat.
- **Winning:** crown, then a full spin, then a wave.
- **Second and third:** a polite clap.
- **3 in a row:** a fist pump with a flame trail.
- **Taking the lead:** a jump with a point at the ceiling.
- **Last five seconds:** the figure leans in and bounces on the clock.
- **Buzzer:** arms up on the buzz, a cheer if accepted, a head-shake if rejected.
- **Lobby:** an occasional wave.

The honest limit: your 19 picture characters and the "your face" figures are one
flat image each — no arms and no eyelids to move. They get the whole-body
reactions (hop, squash, spin, tilt, shake, glow) and the overlays (sparkles,
sweat, flame, crown), but a "blink" there would only read as a nod, so they do
not pretend to.

**Reactions everywhere — with one line kept.** As you chose, the characters now
show in the **lobby** on your screen and on the projector, beside each name. The
moment a question starts they are gone again: the question, the reveal and the
standings still carry no player figures on your screen or the wall, and the
podium is still the only place they stand during a game.

## Install

1. Upload the files from **`Quizzes-v0.9.0-rc.23-update.zip`** into your GitHub
   repository root, replacing the existing versions. **Never replace
   `database-config.js`** — it is not in the update zip. (The *deployment* zip is
   the full install and does contain it.)
2. Keep the `characters/` folder from rc.21 and `celebrate.js` from rc.22 — both
   are unchanged this time.
3. Commit, then **Manual Deploy → Deploy latest commit**.
4. `/healthz` should answer `{"ok":true,"version":"0.9.0-rc.23"}`.

Everything that changes is in files you already have: `characters.js`,
`characters.css`, `app.js`, `display.js`, `styles.css`, `index.html`,
`display.html`, `rehearsal.html`, `package.json`, `LIMITS.md`, the checks and the
docs. **No new files this time.**

## What this does not touch

- **No database change at all.** Publications, assignments, attempts, reports,
  leaderboards and saved quizzes open exactly as they are.
- `database-config.js` and `qr-code.js` are byte-identical to rc.22.
- Scoring, timers, the two-press question start, the delayed participant
  picture, the reveal, the podium layout and every limit are unchanged.

## If something looks wrong

- **Nobody blinks** — `characters.js` and `characters.css` are older copies; both
  changed this time.
- **No reaction after an answer** — `app.js` is stale, or the phone has "reduce
  motion" turned on, in which case the reactions are deliberately still.
- **Characters in the lobby but also during the question** — `app.js` is stale;
  the question stage clears them in this build.
- **A crown sits wrong on the winner** — that is `styles.css`; the crown block is
  at the end of the file.
