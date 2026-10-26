# Quizzes 0.9.0-rc.16 — verification record

**October 26, 2026 · Test candidate · Not deployed by assistant**

## Five changes to the studio and the room

### 1. Questions can be dragged into a new order

In the rail on the left of the studio, press a question card and drag it. A
purple line shows exactly where it will land; it can move within its round or
into another round, and a round emptied that way is removed rather than left
behind. Works with a mouse, a finger or a stylus, and the rail scrolls if you
drag to its edge.

`↑ Move up` now has a matching `↓ Move down`, so the same thing can be done
without a drag (keyboard and screen readers).

### 2. One clock for a whole round

Each round heading has **Time for every question**. Choose 35 seconds and every
question in that round becomes 35 seconds in one action, with a confirmation
saying how many questions changed. **Use in all rounds** applies the same time
across the whole quiz. A new question added to a round arrives already on that
round's clock.

The round shows *Mixed — choose a time* when its questions differ, so a
deliberate exception stays visible instead of being silently overwritten. The
per-question time field still exists for that exception.

### 3. Every player is given a face

When a player joins they are given an animal face — different from everyone
else in that room — and it follows them everywhere:

- the host's lobby, as a wall of chips showing who has arrived,
- the player's own phone ("See your nickname on the big screen?"),
- the live leaderboard and the final podium,
- the projector.

Faces are plain emoji from a set of 24, so they need no download, work on every
phone and carry no one else's artwork. With more than 24 players the set repeats,
in a different order for each room. A room saved before this release is given
faces when it is restored, and keeps them on every later restore.

### 4. The question arrives first, the answers follow

When a question starts, the question is on screen alone and the answer tiles
animate in a beat later — 1.5 s on the host screen and the projector, a fifth of
a second on a phone. **The clock is unaffected**: it starts the moment the
question is sent, so the reveal costs nobody a second of thinking time. The
animation is skipped entirely for anyone whose device asks for reduced motion.

### 5. The room's answers, drawn under each option

While a question is open, the host sees a quiet running tally on each answer
tile. On reveal, every option gets a bar and a number showing how many players
chose it, plus a plain-language total ("11 answers from 14 players — each bar is
how many chose that answer"). The same bars appear on the projector, large enough
to read from the back of a room, and on players' phones.

Players and the projector see **nothing** until the answers are revealed — the
tally is sent to the host's connection only, so a player cannot read the room
and copy.

## Effect on stored data

No schema change, no migration, no row rewritten. Quizzes gain no new field: a
round's time is written into each question's existing `seconds`. A running room
keeps playing; the faces are added to the saved document the next time it is
snapshotted (about a second), and older rooms are filled in when restored.

## Executed verification

| Check | Result |
|---|---|
| Node 22 application suite | **142 passed, 0 failed** (was 125) |
| New classroom suite | **17 passed** |
| Chromium end-to-end workflow | **1 passed**, about 1.4 minutes |
| Editor-and-live walkthrough (`tools/ui-classroom-check.cjs`) | **23/23** |

The classroom suite proves the round clock (including the deliberate-exception
case and that only offered times inside 5–120 s are used), the reorder maths used
by both the drag and the arrows (same round, across rounds, emptied round
removed, drop-on-itself is a no-op), and for faces: everyone gets one, no two
players in a room share one, the same face appears on every screen, standings
carry it, and the saved room document keeps it.

The walkthrough does it in a real browser: sets 35 seconds on round one and
checks each question field, adds a question and checks it inherits 35, drags the
second question above the first and checks the rail order changed, joins a phone
and two simulated players, checks three different faces on the host lobby, checks
the answers are invisible before the reveal and visible after, checks the tallies,
the counts and the bars on the host screen and on the projector.

## Files changed since rc.15

`app.js` (round clock, drag and arrows, faces, reveal, bars, tallies),
`server.js` (faces, host-only live tally), `live-saves.js` (face in the saved
room), `display.js` (reveal and bars), `index.html`, `styles.css`,
`tests/classroom.test.js` (new), `package.json`, the three asset version strings,
`LIMITS.md` and the Settings → Amounts and limits panel (the new numbers are
listed there too), and this document.
