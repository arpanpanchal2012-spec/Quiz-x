# Quizzes 0.9.0-rc.17 — verification record

**October 26, 2026 · Test candidate · Not deployed by assistant**

## Two changes

### 1. The faces move

Every player's animal face is now animated, so a lobby is alive rather than a row
of still pictures:

- each face **sways or bobs** to its own slow rhythm, at a different speed and
  starting point per player, so no two move together;
- a face that **has just arrived** hops twice and its chip grows in, so a join is
  noticed without anyone looking for it;
- the player's own face becomes the **hero of their phone** while waiting — 96 px,
  alive, unmistakably theirs;
- hovering a face in the lobby or the standings makes it hop;
- the podium faces hop on the winners' screen.

Only `transform` is animated (no layout, no repaint of the page), the animation
uses the compositor, and stopping is instant. Anyone whose device asks for reduced
motion (`prefers-reduced-motion`) gets the faces perfectly still.

### 2. The question comes first, the options on the second press

**Start question** now does exactly what the host expects:

| Press | What the room sees |
|---|---|
| **Start question** | The question, on its own. No answers, no clock. Read it out as slowly as you like. |
| **Show options ▶** | The answer tiles fly in and **the countdown starts**. |
| **Reveal answers** | The correct answer, the tally of what everyone chose, then the leaderboard where the round ends. |

Why the clock waits: a timer that starts while the host is still reading punishes
the room for listening. Starting it on the second press gives every player the
full time to answer.

Nothing can be answered before the second press. The options are **not sent to a
phone** until the host shows them — `options: []` with `optionsVisible: false` —
so a player cannot read them in the browser either, and a submitted answer is
refused with "The options are not on screen yet. Watch the big screen."

A **buzzer** question skips the two steps, because the clip and the Buzz button
are the question itself.

The projector follows the same two steps, showing the question large with "The
answers appear next" until the host presses again.

## Effect on stored data

No schema change, no migration, no row rewritten. Quizzes are untouched. A room
already running when this deploys comes back with its options shown, exactly as
it was, because the saved document's `optionsVisible` defaults to true when it is
missing.

## Executed verification

| Check | Result |
|---|---|
| Node 22 application suite | **142 passed, 0 failed** |
| Chromium end-to-end workflow | **1 passed**, about 1.4 minutes |
| Editor-and-live walkthrough (`tools/ui-classroom-check.cjs`) | **31/31** |

The suite was updated at every point where a live question starts, and now proves
the new rules directly: the first press carries `deadline: null` and
`options: []`; an answer attempted then is refused with the reason; the second
press produces `options_shown` with a live deadline and the tiles; the same holds
for 100 players at once and for the projector.

The walkthrough checks the movement itself — that the computed transform of a face
changes over time, and that different players carry different animation names and
delays — and then plays a question through all three presses, asserting the host
button's label, the tile count on both screens, and that the clock reads READY and
then counts.
