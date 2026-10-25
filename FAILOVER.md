# If a site dies during a quiz — what happens, and what to do

Two things protect a live quiz: the room is saved as it plays, so the **same
site** can bring it straight back; and a running room can be **saved to a file**
and carried to your **second site**. This page is the runbook for both.

---

## 1. Same site (automatic, nothing to do)

A live game lives in the server's memory. As it plays, the room is also written
to your database about once a second — players, scores, which question is
showing, how long is left, buzz order, leaderboard — with every scored answer
journalled separately.

When the site restarts (a crash, a deploy, Render putting it to sleep, the
host's laptop waking up), it rebuilds the room on boot:

- **Same code, same link.** Players' tabs retry by themselves and land back in
  their own seat with their score.
- **Same question, same clock.** A countdown that was running keeps running;
  one that ran out while the site was down is closed immediately instead of
  handing out free seconds.
- **The host is back in control** as soon as their browser reconnects, usually
  within a few seconds.
- If nobody comes back, the room is closed with a results report after
  **`HOST_RECONNECT_MINUTES`** (default 5, up to 60). Rooms that are never
  resumed at all are settled after **24 hours** (`LIVE_RESUME_HOURS`).

What it cannot save: the last fraction of a second before the crash (at worst a
single answer arriving mid-crash), and nothing at all if the database itself is
down.

**Nothing to do during an event.** Reopen the host screen with the same link.

---

## 2. Second account / second site (manual, about a minute)

Two separate deployments with two separate databases share nothing, so the room
has to be carried across. That is what **Save game copy** is for.

### Before the event, once

1. Confirm both sites run this version (`/healthz` shows `0.9.0-rc.11`).
2. Put the permanent player link in place — see `redirect/README.md`. Players
   then always open one URL and land on whichever site is awake.
3. Host one throwaway game, press **Save game copy**, load it into the second
   site, delete it. Two minutes, and you will know it works.

### During an event, if the host site dies

1. **Host screen → Save game copy.** A file named `quizzes-live-QZ123ABC.json`
   downloads. (If the site is already dead you cannot export — in that case use
   step 1 of the next section.)
2. Open the **second site**, sign in, go to **My quizzes**.
3. Press **Resume a live game**, choose that file.
4. The host screen opens on the other site with the **same code**, the same
   question and the same scores.
5. Tell players to reopen the permanent link (or read out the second site's URL)
   and enter the same code and the same name.
6. A returning player typing their old name takes back **their own seat** —
   score and place restored. Somebody already connected to that seat cannot be
   displaced by someone else typing their name.

The file contains the quiz, the pictures, the scores and the answers given so
far. It never contains host or projector credentials, and the receiving site
mints its own.

### If the first site is already dead

The room kept playing into the database until the moment it died, and the
restart path above normally brings it back when the site returns. To move it
without waiting for that site:

1. Wait for the first site to come back **at all** (Render free instances wake in
   under a minute; the room resumes where it stopped).
2. Then press **Save game copy** and follow the steps above.

There is deliberately no automatic cross-site handoff: the two sites have
separate databases by design, and copying without a host pressing a button would
mean one site holding credentials for the other.

---

## What players see

| Situation | Player's screen |
|---|---|
| Site restarts, player's tab still open | Reconnects by itself, same seat |
| Site restarts, player closed the tab | Opens the link, joins with the same name |
| Room moved to the other site | Sees "Unable to open quiz" until they open the permanent link, then joins with the same name and gets their score back |
| Room ended by the host | Leaderboard, as usual |

---

## Limits, stated plainly

- **One room at a time per site is what this is tested for.** A host may have
  three open rooms; each is saved independently.
- **The maximum you can lose** is about one second of the most recent answers
  and one answer landing at the instant of a crash.
- **Players on the dead site do not move by themselves.** Their browser has to
  open the other site; the permanent link is what makes that one step.
- **The music file stays on the host laptop.** It plays from the host's audio
  output, so it is never part of the rescue file.
- **A sleeping free instance is not a failure.** The first visit may take 30-60
  seconds to wake; the room is still there.

---

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `HOST_RECONNECT_MINUTES` | 5 (max 60) | How long a room waits for its host before closing with a report |
| `LIVE_RESUME_HOURS` | 24 (max 168) | How long an unfinished room is kept for a resume before it is closed and reported |

Both are optional. Nothing needs to be set for the feature to work.
