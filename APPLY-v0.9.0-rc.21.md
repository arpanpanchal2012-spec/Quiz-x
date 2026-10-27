# Quizzes — your nineteen characters (rc.21)

**Build: 0.9.0-rc.21 · Locally tested candidate · Not deployed by the assistant**

## What you asked for

**The characters I made in Meta AI should be usable in the quiz.** They are, all
nineteen of them. The join screen opens on a **Characters** tab with your
pictures, four to a row on a phone. Pick one and that is who you are for the
night — on your phone's lobby card, in the header while a question runs, on your
end screen, and standing on the podium at the end, on your screen and on the
projector.

**Keep both styles.** The tabs are **Characters · Drawn · Accessory**. Your
nineteen pictures are the first tab; the twelve drawn characters and the
fourteen accessories are still there, unchanged, on the next two. A picture is a
finished figure, so it wears no hat; if you want a hat, pick a drawn character
and the Accessory tab shows it on them.

## Install

1. Upload the files from **`Quizzes-v0.9.0-rc.21-update.zip`** into your GitHub
   repository root, replacing the existing versions. **Never replace
   `database-config.js`** — it is not in the update zip, and the copy already in
   your repository holds your database connection. (The separate *deployment*
   zip is the full install and does contain `database-config.js`.)
2. **Keep the new `characters/` folder.** It holds 38 picture files (19
   characters + 19 small copies). If your upload tool lets you drop folders, drop
   `characters/` whole. If it only takes files, upload them into a folder named
   `characters` in the repository root. They are *new* files — nothing there is
   being replaced.
3. Commit, then **Manual Deploy → Deploy latest commit**.
4. `/healthz` should answer `{"ok":true,"version":"0.9.0-rc.21"}`.

Files that change this time: `app.js`, `server.js`, `styles.css`,
`characters.js`, `characters.css`, `index.html`, `package.json`, `LIMITS.md`,
`display.html`, `rehearsal.html`, the browser proofs and the docs — plus the 38
new files in `characters/`.

If you are coming from rc.20 you can upload just this update zip. From anything
older, upload this update zip and keep every file it contains — `characters.js`
and `characters.css` arrived first in rc.19 and are needed for any character to
draw at all.

## What this does not touch

- **No database change at all.** Publications, assignments, attempts, reports,
  leaderboards, saved quizzes and their per-round times open exactly as they
  are.
- `database-config.js` and `qr-code.js` are byte-identical to rc.20 (hashes
  checked during packaging).
- Scoring, timers, the two-press question start, the delayed participant
  picture, the reveal, the podium and every limit are unchanged. `LIMITS.md`
  now lists 31 looks instead of 12.
- A room saved by an older version still resumes; a seat with no picture keeps
  its drawn character.

## If something looks wrong

- **The Characters tab is empty or shows broken tiles** — the `characters/`
  folder did not arrive. Upload the 38 `.webp` files into a folder called
  `characters` at the repository root, then hard-reload (Ctrl/Cmd + Shift + R).
- **A tile shows a pink or magenta box** — an old sprite is cached; the current
  files have no background at all. Hard-reload.
- **Everyone looks like a drawing, and a name is missing** — that is a browser
  running the previous release (it falls back on purpose). Reload the page.
- **There is no Characters tab** — `index.html` is an older copy; the tab bar has
  three buttons in this build.
- **A picture is tiny in the lobby card** — `styles.css` is stale; the picture
  sizing sits in the last block of that file.
