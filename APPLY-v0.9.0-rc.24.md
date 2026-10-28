# Quizzes — the new 3D cast (rc.24)

**Build: 0.9.0-rc.24 · Locally tested candidate · Not deployed by the assistant**

## What you asked for

**Everything replaced.** All nineteen old characters are deleted from the app.
The picker now opens on **24 painted 3D characters** — the nineteen you already
saw, plus the five new ones: **Max**, **Ace**, **Professor**, **Riff** and
**Grandpa**.

**And they really move.** Each one is cut into a head and a body with its own
neck pivot, and each one has a second **arms-up pose**, so:

- the **head turns** on its own — looking around all night, nodding on a right
  answer, shaking "no" on a wrong one, cheering a win;
- the **body** breathes, hops, leans, spins, bounces and shakes;
- the **hands go up** — on a right answer, a win, a clap, a streak, taking the
  lead and on a buzzer, the whole figure changes to its cheer pose and bounces.
  All 24 characters have it.

Right answer: two hops with a nod. Wrong: the figure sinks and the head shakes.
Win: a full spin and a cheer. Second and third: a bouncing clap. Three in a row:
six quick bounces. Taking the lead: a big jump. Last five seconds: it vibrates
on the spot. Lobby: it sways.

The picker is now **one grid** — the Drawn and Accessory tabs are gone, because
every character arrives already dressed. The **"Your face"** tile is still
there.

## Install — three steps, and one file to delete

1. **Upload `Quizzes-v0.9.0-rc.24-update.zip`** into your GitHub repository root
   and let it replace the files. It adds `characters3d.gen.js` and the
   `assets/3d/` folder (96 character layers, including a cheer pose for every
   character) and updates `characters.js`,
   `characters.css`, `styles.css`, `app.js`, `server.js`, `index.html`,
   `display.html`, `rehearsal.html`, `package.json`, `LIMITS.md`.
   **Never replace `database-config.js`** — it is not in the update zip.
2. **Delete the old `characters/` folder** from the repository. The update zip
   cannot remove files, and those 38 sprites are no longer used. If you skip
   this step nothing breaks — the folder is simply dead weight.
3. Commit, then **Manual Deploy → Deploy latest commit**.

`/healthz` should answer `{"ok":true,"version":"0.9.0-rc.24"}`. A full-install
alternative is `Quizzes-v0.9.0-rc.24-deployment.zip` — it contains everything,
including `database-config.js`, and needs no cleanup step.

## What this does not touch

- **No database change at all.** Publications, assignments, attempts, reports,
  leaderboards and saved quizzes open exactly as they are.
- A look saved on a player's phone (or sitting in a live room) still names a
  character that exists — the ids did not change, only the artwork.
- Scoring, timers, the two-press question start, the delayed participant
  picture, the reveal, the podium layout and every limit are unchanged.
- `database-config.js` and `qr-code.js` are byte-identical to rc.23.

## If something looks wrong

- **A character is missing its head, or two halves pull apart** —
  `assets/3d/` did not upload completely, or `characters3d.gen.js` is missing.
  Both are in the update zip; upload it again.
- **The old photos are still in the picker** — `characters.js` is stale.
- **A figure stands still** — the phone has "reduce motion" turned on; the
  movement is deliberately off in that case, and the reactions still change
  pose.
- **A square, half-transparent character in the lobby wall** — an old
  `characters/ph-*.webp` request. Delete the `characters/` folder (step 2).
- **"Your face" tile is gone** — you are running a partial upload; the tile
  lives in `app.js`, which changed this time.
