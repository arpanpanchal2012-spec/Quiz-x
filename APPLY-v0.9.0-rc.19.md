# Quizzes — pick a character, and a reveal screen that is only the bars (rc.19)

**Build: 0.9.0-rc.19 · Locally tested candidate · Not deployed by the assistant**

## What you asked for

**Choose who you play as.** After the game code and nickname, the join screen
now asks for a **character** and an **accessory** — two tabs, five tiles to a
row, a live preview between them and the grid. Twelve characters, fourteen
accessories. The choice stays with the player's seat and with their phone, so
they come back as the same animal in the same hat.

**Move like the clip.** The character is a full figure, not a face in a circle:
body bounce with squash and stretch, arms swinging out of phase, tapping feet, a
tilting head, blinking and a wink. Each player runs on their own beat, so a lobby
looks like a crowd.

**No faces on the big screen.** The host lobby, the leaderboard, the podium and
the projector now show **nicknames and points only**. The character appears on
the player's own phone: lobby card, header chip while a question runs, and the
end screen.

**The answer bars get their own page.** When the answers are revealed, the
question page leaves: no question text, no answer tiles, no image, no "correct
answer" caption, no clock. What is left is the columns and their counts, drawn to
scale, with the correct answer marked.

- On **your screen** the stage becomes the bars; the header and the buttons
  (Show leaderboard / Next question) stay, because those are your controls.
- On the **projector** even the header and footer step aside: bars, full screen.
- On a **phone** nothing changes — the bar and count still sit inside each answer
  button, where a small screen can read them.

## Install

1. Upload the files from **`Quizzes-v0.9.0-rc.19-update.zip`** into your GitHub
   repository root, replacing the existing versions. **Never replace
   `database-config.js`** — it is not in the update zip, and the copy already in
   your repository is the one holding your database connection. (The separate
   *deployment* zip is the full install; it does contain `database-config.js`.)
2. Commit, then **Manual Deploy → Deploy latest commit**.
3. `/healthz` should return `{"ok":true,"version":"0.9.0-rc.19"}`.

Two files are **new** this time — `characters.js` and `characters.css`. They are
in the update zip; if you ever upload files one by one, remember to take them
too, or the join screen will show empty tiles.

## What this does not touch

- No database change. Publications, attempts, assignments, reports and
  leaderboards are untouched.
- Your saved quizzes and their times open exactly as they are.
- `database-config.js` and `qr-code.js` are byte-identical to rc.18.
- A room saved by an older version still resumes: a seat with no character is
  given a fixed one and keeps it, so nobody appears as a different animal after a
  restart.

## If something looks wrong

- **Empty character tiles** — `characters.js` or `characters.css` did not reach
  the repository; re-upload both.
- **A player shows as a plain animal with no hat** — that seat was created before
  rc.19 (a saved room). They can change it by rejoining with the same nickname
  while their seat is free.
- **Bars on the projector but the header is missing** — that is this release, not
  a bug: the reveal is deliberately the bars alone.
