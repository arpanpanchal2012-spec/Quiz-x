# Quizzes 0.9.0-rc.18 — verification record

**October 26, 2026 · Test candidate · Not deployed by assistant**

## Two corrections to rc.17

### 1. Nothing shows how the room is answering until the answers are revealed

rc.17 put a running tally on each answer tile of the host screen while a
question was open. That was wrong for a room: a host reading the split can
unconsciously react, and a glance at the big screen tells latecomers which way
the crowd went.

Now, while a question is open, **nobody** is told the split — not the players,
not the projector, and not the host. The count is sent with the correct answer,
at the reveal.

This was not a screen change only: the `live_counts` message the server used to
send the host mid-question has been removed from the protocol. There is nothing
left to read out of the connection.

### 2. The room's answers, drawn as columns — the way a game show shows them

At the reveal, on the host screen and on the projector, each answer gets a
**column** standing directly above its own answer tile:

- the count sits on top of the column, the answer's shape beneath it;
- the tallest column is the answer most people chose, and every other column is
  drawn to scale against it, so the shape of the room is readable at a glance;
- the correct answer's column and count are tinted green, and its tile keeps the
  tick it already had;
- the columns grow from the baseline as the reveal lands;
- a plain-language line underneath: *"3 answers from 3 players — each bar is how
  many chose that answer."*

Players' phones keep the simpler form — a bar and a count inside each answer
button — because a phone has no room for columns.

### 3. Question time, round by round

A new panel above the editor, **Question time by round**, lists every round once:

| Round | Questions | Time |
|---|---|---|
| 1 · Warm up | 2 questions | 45 seconds |
| 2 · Speed | 2 questions | 30 seconds |
| Every round | sets all 4 questions | Same time everywhere… |

Set 45 for round one and 30 for round two and each round's questions follow
individually. The panel also reports the quiz total in words ("2 rounds, 2 min
30 s in total") and offers one time for the whole quiz. It writes the same
`seconds` field as the control in each round's heading, so the two can never
disagree; a round whose questions differ shows **Mixed**.

## Effect on stored data

No schema change, no migration, no row rewritten. Times are still stored per
question in the field that already existed, so the round panel and the per-round
control are two views of one value.

## Executed verification

| Check | Result |
|---|---|
| Node 22 application suite | **144 passed, 0 failed** |
| Chromium end-to-end workflow | **1 passed**, about 1.5 minutes |
| Editor-and-live walkthrough (`tools/ui-classroom-check.cjs`) | **35/35** |

The suite now asserts that **no** `live_counts` message reaches the host while a
question is open, and that the split arrives complete with `question_ended`.
It also proves a quiz can hold 45 seconds in one round and 30 in another, and
that the total is reported in words.

The walkthrough plays a full question in a real browser: sets 45 and 30 in the
overview and checks each round's question fields follow, drags a question,
verifies no chart and no count exists during the question, then reveals and
measures the drawn column heights (150 px vs 75 px for 2 votes vs 1) with the
correct answer's column marked, and does the same on the projector.
