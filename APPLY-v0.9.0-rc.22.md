# Quizzes — your face, and a bit more show (rc.22)

**Build: 0.9.0-rc.22 · Locally tested candidate · Not deployed by the assistant**

## What you asked for

**"Can a player put their own face on a character?"** Yes — as of this build, on
the join screen, last tile in the Characters tab: **Your face**. Take a photo or
choose one, line the face up in the ring, and you play as that face on a drawn
body, wearing the hat you picked. It shows on the lobby card, the header, the
end screen and the podium — your screen and the projector.

The one thing it does **not** do is redraw your photo in the cartoon style: that
needs an image model running on a server, which is the paid hosting you told me
to avoid. What it does instead is put your actual face, cropped to a clean
circle, on the character — the same figure everywhere, about 15 KB.

**Everything else on the list is in too:**

- the phone celebrates a right answer (burst) and shakes on a wrong one;
- **+250** floats off the card, and a flame shows your run of right answers;
- the winner gets a crown and the podium gets confetti;
- each round has its own colour;
- the clock is a ring that drains and turns red;
- question, reveal and end fade in instead of snapping;
- picture characters stand on a floor shadow;
- the join card opens with six characters, and the app has a real mark instead
  of the letter Q.

## Install

1. Upload the files from **`Quizzes-v0.9.0-rc.22-update.zip`** into your GitHub
   repository root, replacing the existing versions. **Never replace
   `database-config.js`** — it is not in the update zip; the copy in your
   repository holds your database connection. (The *deployment* zip is the full
   install and does contain it.)
2. **Keep** the `characters/` folder from rc.21 (38 pictures) — it is unchanged
   this time, and without it the character grid is empty.
3. One new file arrives: **`celebrate.js`** (the confetti). Put it in the
   repository root next to `app.js`.
4. Commit, then **Manual Deploy → Deploy latest commit**.
5. `/healthz` should answer `{"ok":true,"version":"0.9.0-rc.22"}`.

Files that change this time: `app.js`, `server.js`, `display.js`,
`characters.js`, `styles.css`, `index.html`, `display.html`, `rehearsal.html`,
`package.json`, `LIMITS.md`, the browser proofs, the packaging tool and the docs
— plus the new `celebrate.js`.

## About the face photos

- The full photo **never leaves the phone**. The phone crops it, builds the
  figure and uploads only that small picture.
- The figure lives **in the live room only** — memory, not the database — and is
  served with `no-store`. It goes when the room ends, or when the player picks a
  listed character instead.
- It is never written into a quiz, an attempt, a report or an export.
- If the server restarts mid-night, faces are gone and those players show their
  drawn character. Nothing breaks.

## What this does not touch

- **No database change at all.** Publications, assignments, attempts, reports,
  leaderboards and saved quizzes open exactly as they are.
- `database-config.js` and `qr-code.js` are byte-identical to rc.21.
- Scoring, timers, the two-press question start, the delayed participant
  picture, the reveal, the podium layout and every limit are unchanged.

## If something looks wrong

- **The face tile is missing** — `index.html` is an older copy; the tile is the
  last one in the Characters grid.
- **A face shows as a drawn character** — the room restarted, or that player
  changed their look; picking the face again fixes it.
- **No confetti, no crown, no ring** — `app.js`/`styles.css` are older copies, or
  the phone has "reduce motion" on (then it is deliberate).
- **The join page has no characters on top** — `styles.css` or `index.html` is
  stale, and the six pictures come from the `characters/` folder.
