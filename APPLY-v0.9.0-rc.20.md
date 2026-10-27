# Quizzes — toy characters, and a reveal that shows everything (rc.20)

**Build: 0.9.0-rc.20 · Locally tested candidate · Not deployed by the assistant**

## What you asked for

**The characters should look 3D.** You picked **B · Toy render**. All twelve
characters and all fourteen accessories are redrawn as shaded toys: a sphere
gradient on every head, a cylinder gradient on every body and limb, a specular
highlight on each rounded surface, a soft cast shadow on the ground, and chunky
mascot proportions with the head nearly half the figure. Big glossy eyes blink and
wink, the body bounces, the arms swing.

**The reveal should show the question and the answers, with the bars.** You picked
**1 · Spotlight** and sent the screenshot: question on top, the per-option bars in
the middle, the four answer rows at the bottom with **✓** on the right one and
**✗** on the others. That is the reveal now — on your screen and on the
projector. The only thing that steps off the page is the question's picture.

**The night should end on a podium.** The top three stand on gold, silver and
bronze pedestals **in the character each player chose**, with the number, the name
and the points on the pedestal, and everyone below third place in a plain row
underneath. Same result on your screen and on the projector; the characters rise
into place one after another.

**Nothing on the big screen or the phone should tell people what to do.** At the
question and the options the projector shows the question, the picture and the
answers; the phone shows the same. Round announcements stay.

**The picture should be big.** The answer picture now takes the stage: full width
on the projector, a full-width band across the host screen, no cropping (it is
letterboxed, never cut), and the answers still fit in two rows even with six
options.

**The whole app should look professional.** The live game — lobby, question,
reveal, standings, end — now sits on the deep indigo Spotlight stage, with the
question as a bright plate, chunky answer tiles with a colour lip and a cast
shadow, white clock discs and gold first place. The projector wears the same
stage, so the wall matches your laptop. The editor and the library keep their
light studio look, because that is where you write, not where the room looks.

## Install

1. Upload the files from **`Quizzes-v0.9.0-rc.20-update.zip`** into your GitHub
   repository root, replacing the existing versions. **Never replace
   `database-config.js`** — it is not in the update zip, and the copy already in
   your repository is the one holding your database connection. (The separate
   *deployment* zip is the full install and does contain `database-config.js`.)
2. Commit, then **Manual Deploy → Deploy latest commit**.
3. `/healthz` should answer `{"ok":true,"version":"0.9.0-rc.20"}`.

Files that change this time: `app.js`, `display.js`, `styles.css`,
`characters.js`, `characters.css`, `quiz-rules.js`, `index.html`, `package.json`,
`display.html`, `rehearsal.html`, `LIMITS.md`, the browser proof
(`tests/browser.spec.js`, `tests/professional-browser.js`) and the docs. No new
files — the two character files already arrived with rc.19.

If you are coming from rc.19 you can upload just this update zip. If you are
coming from an older version than rc.19, upload this update zip **and** keep the
`characters.js` / `characters.css` it contains, or the join screen will show empty
tiles.

## What this does not touch

- **No database change at all.** No migration, no new column. Publications,
  assignments, attempts, reports, leaderboards, saved quizzes and their per-round
  times open exactly as they are.
- `database-config.js` and `qr-code.js` are byte-identical to rc.19 (hashes
  checked during packaging).
- Players' saved looks (`character`, `accessory`) are read the same way. A room
  saved by an older version still resumes, and a seat with no character is given
  a stable one.
- Limits are unchanged: 400 uploads an hour, 200 attempts a link, 100 players,
  3 live rooms, 1–20 rounds, 200 questions, 5–120 s, 100–5000 points, 2–6 options,
  penalties 0/25/50/100 %. `LIMITS.md` lists them all.
- Phone layout is unchanged: the count and the mark still sit inside each answer
  button.

## If something looks wrong

- **A character looks like the old flat drawing** — `characters.js` did not
  arrive. Re-upload it and hard-reload (Ctrl/Cmd + Shift + R).
- **Hat floats above the head, or a tile looks cropped** — `characters.css` is an
  old copy; the current file sets the size and the crop.
- **The reveal shows only the bars** — that is the rc.19 build; check `/healthz`
  says `0.9.0-rc.20`.
- **The end screen is a plain list, not a podium** — `app.js` or `styles.css` is
  an older copy; the podium block is at the end of `styles.css`.
- **The picture still looks like a small box** — `styles.css` is stale; the
  picture band sits in the last block of the file.
- **A toast covers the Next question button** — that is fixed in this build; a
  toast never takes a click and sits higher while a game is open.
- **The stage looks light instead of indigo** — `styles.css` is stale; the
  Spotlight block is at the end of that file.
