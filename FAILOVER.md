# If something goes wrong during a live quiz

The runbook for every failure that can happen mid-event, in the order you are
likely to meet it. Nothing here needs a terminal.

**The short version:** the room is saved as it plays. Reopen the host screen and
carry on. Only if the *site itself* will not come back do you move to your second
deployment, and that takes about a minute.

---

## Before the event — a five-minute check

1. Both sites answer at `/healthz` and report the same version.
2. Host one throwaway game on the site you will use, then press **End game**.
3. Sign in on a *different* browser and open **My quizzes** — you should see no
   "game is still running" strip, because the game ended cleanly.
4. Optional but worth it: open the second site, confirm you can sign in there.
5. Have the permanent player link (`redirect/`) working, so players never need a
   new URL.

---

## What the screen tells you

| What you see | What it means |
|---|---|
| **"Disconnected. Reconnecting…"** on the host screen | The server connection dropped. The browser is retrying by itself, at most every ~15 seconds. |
| Players' phones show the same message | Same thing; their tabs retry on their own too. |
| **"Host reconnected · ready to continue."** | The room is back. Nobody lost their score. |
| **"Host disconnected. They can reconnect to continue."** on player screens | The host's connection dropped — including when their laptop died. The room waits. |
| **"Host reconnected"** appears on players' screens again | Back in business; carry on with the next question. |

---

## Case 1 — the site restarted (crash, deploy, free-tier sleep)

This is the most common failure and it fixes itself.

**What happens by itself:**

- The server crashed, or was redeployed, or Render put the free instance to sleep
  and then woke it.
- On the way back up it rebuilds any unfinished room from the database: same
  code, same players, same scores, same question, and the countdown continues on
  its original clock.
- A countdown that ran out while the site was down is closed immediately, so
  nobody gets free seconds.
- Every browser with the page still open reconnects on its own.

**What you do:**

1. Wait 10–30 seconds. A sleeping free instance can take a minute to wake.
2. Reload the host screen if it does not come back by itself.
3. Confirm the code on screen is the same one players already have.
4. Carry on with **Next question**.

You lose at most the answer that was in flight at the instant of the crash.

> A deliberate **deploy** behaves the same way now. It used to end the room with
> "Server stopped"; it pauses the room instead.

---

## Case 2 — your laptop died, or you closed the host tab

The token that proves you are the host lives in that tab. When the tab goes, the
token goes with it — so this is the case that used to end an event. It no longer
does.

**What happens by itself:**

- Players see *"Host disconnected. They can reconnect to continue."* and their
  scores keep sitting there.
- The room waits **5 minutes** by default (`HOST_RECONNECT_MINUTES`, up to 60) and
  then closes itself with a saved results report — so even a total loss still
  leaves you the leaderboard.

**What you do:**

1. Get to **any other computer or phone** with a browser.
2. Open the site and **sign in as the host** (same account).
3. Go to **My quizzes**. A purple strip says:
   *"▶ A game is still running. “Antakshari night” is still running on code
   QZ123ABC — at question 4 of 12, 8 players."*
4. Press **Rejoin as host**.
5. The host screen opens on the same room, same question, same scores. Press
   **Next question** when ready.

The reconnect changes the room's token, so the old laptop cannot take it back
accidentally if it wakes up later.

**If the strip is not there:** you are signed in to a different account, or the
room has already ended (5 minutes passed), in which case it is in **Reports** with
the full leaderboard.

---

## Case 3 — a player's phone died, or they closed the tab

**What happens by itself:** nothing — their seat is held with their score, waiting.

**What you do:** tell them to open the join link again and **enter the same
nickname**. They get their seat, their score and their place back. You will see a
small notice: *"Rahul rejoined and took back their seat on 2,400 points."*

A seat that is **currently connected** cannot be taken this way — somebody typing
a name that is in use is told *"That nickname is taken. Try another."* So a
returning player only ever reclaims a seat that is genuinely empty.

---

## Case 4 — the site will not come back at all

Render is down, or a deploy broke, or the database is unreachable. You have a
second deployment; move the room to it.

**Step 1 — get the room out of the dying site, if you still can.**

On the host screen press **Save game copy**. One file downloads:
`quizzes-live-QZ123ABC.json`. It holds the quiz, the pictures, the music, every
score, every answer given so far and the exact question position. It never
contains host or projector credentials.

**Step 2 — load it into the second site.**

1. Open the second deployment and **sign in** there.
2. **My quizzes → Resume a live game →** choose the file.
3. The host screen opens on the **same code**, the same question and the same
   scores.

**Step 3 — bring the players across.**

The players' tabs point at the dead site, so they must open the working one:

- If you set up the permanent link (`redirect/`), tell them: *"Everyone open the
  usual link and enter the same code and your name."* It sends them to whichever
  site is awake.
- Otherwise read out the second site's address.

They enter the **same nickname** and each is given their own seat back — score
and place included. This is the one case where a returning player's seat is
reclaimed on a room that arrived from elsewhere; the connected-seat rule still
protects anyone already in.

**If the site is already dead and you cannot press Save game copy:** wait for it
to come back *at all* — Render free instances wake in under a minute and the room
resumes where it stopped — then save the file and move it.

---

## Case 5 — the database is down but the site is up

Symptoms: sign-in fails, the workspace does not load, or answers are refused
while the room still shows.

- The room in memory keeps running, but nothing new is being saved.
- Do **not** redeploy hoping to fix it. Wait, or check the Supabase status page.
- Self-paced assignments already stored are safe; they are only unreadable while
  the database is unreachable.
- If the site must be restarted while the database is down, the room cannot be
  rebuilt afterwards — that is the one failure the last save protects you from,
  and the last save is at most a second old.

---

## Case 6 — only your own connection is broken

Your wifi dropped, or the venue network is saturated, but the site is fine and
players are still answering.

- Your browser retries by itself: *"Disconnected. Reconnecting…"*.
- Do not refresh in a panic — a refresh is safe, but it is not needed.
- If you switched networks or the laptop slept: the tab keeps its token, so it
  reconnects with the same identity. Nothing to do.

---

## What survives, and what does not

| | Survives a restart | Survives a laptop death | Survives moving to the second site |
|---|---|---|---|
| Quiz, questions, pictures, music | yes | yes | yes — inside the file |
| Player names and scores | yes | yes | yes — inside the file |
| Answers already given | yes | yes | yes — inside the file |
| Current question and countdown | yes, on the original clock | yes | yes, position kept; the countdown restarts for that question |
| Buzz queue order | yes | yes | yes |
| Host control of the room | yes, automatic | yes — **Rejoin as host** | yes, on the second site |
| Players' open tabs | reconnect by themselves | reconnect when the host returns | must open the working site |
| A live screen recording on the projector | no — reopen `/display` with the new link | no | no |

---

## Timings and settings

| Setting | Default | What it controls |
|---|---|---|
| `HOST_RECONNECT_MINUTES` | 5 (max 60) | How long a room waits for its host before closing with a saved report |
| `LIVE_RESUME_HOURS` | 24 (max 168) | How long an unfinished room is kept for a resume after a restart before it is settled |

Set them on the hosting dashboard and redeploy. Neither is required.

---

## What to say to the room

Keep this next to you; it turns a panic into a pause.

> *"Small pause — the screen is reconnecting. Your scores are safe. When I'm back,
> carry on where you are."*

and, if you move sites:

> *"Everyone open the usual link again, put in the same code and the same name you
> used. You'll be back on your own score."*

---

## The one thing never to do

**Do not start a fresh game with a new code.** The room waiting for you holds
every score. A new code means players rejoin with nothing, and the old room
closes itself with a report you then have to reconcile by hand.
