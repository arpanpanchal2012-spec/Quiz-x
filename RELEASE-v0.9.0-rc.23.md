# Quizzes 0.9.0-rc.23 — verification record

**October 27, 2026 · Test candidate · Not deployed by the assistant**

The characters now move. This is the reaction pass you asked for — blinking, a
different answer for every outcome, and the podium reacting to the result.

## 1. Real blinking

Every drawn character blinks properly: the **whole eye closes** (the eyeball
folds away and a lid line draws itself across), it is a **double blink**, and
each figure has its own rhythm between 6.5 and 11 seconds — so a crowd never
blinks in unison. One eye also winks now and again.

The faces also gained **eyebrows**, which is what lets a face read as happy,
annoyed or sad without changing the rest of the drawing.

## 2. A different reaction for each outcome

| Moment | Drawn character | Picture / your face |
| --- | --- | --- |
| **Right answer** | crouch, leap, both arms up, brows lift, eyes squeeze shut then pop open, sparkles and a green glow at the feet | three happy hops with a squash and a sparkle |
| **Wrong answer** | shoulders drop, head tips forward and shakes twice ("no"), arms hang, brows furrow, a sweat drop slides down | shrinks and tilts, greys for a beat, a sweat drop |
| **Win (1st)** | crown drops, then a full spin, then waves | spin, crown |
| **2nd / 3rd** | a polite clap, hands meeting six times | a gentle bounce in time |
| **3 in a row or better** | a fist pump, twice, with a flame trail | four quick hops with a flame |
| **Taking the lead** | a jump with a point at the ceiling | hop |
| **Last 5 seconds** | leans in and bounces on the spot | bounces on the spot |
| **Buzzer** | arms up on the buzz; cheer if accepted; head-shake and drop if rejected | same, whole-body |
| **Waiting in the lobby** | an occasional wave, staggered across the room | a slow sway |

**The honest limit:** your 19 picture characters and the "your face" figures are
single flat images — there are no separate arms or eyelids to move. They get the
whole-body half of that table (hop, squash, spin, tilt, shake, glow, and the
sweat drop / sparkle / flame overlays). A blink there would be a squeeze, which
reads as a nod, so they do not pretend to blink.

## 3. Characters in the lobby — your exception, applied

You asked for reactions everywhere, so the **lobby** now shows who is in the
room by character: the host stage's player chips carry each player's own figure
with their name, and so does the projector's participant list, waving now and
again.

**During play nothing changes:** the question, the reveal and the standings still
carry no player figures on the host screen or the wall. The podium is still the
only place they stand during a game. The UI check now proves both: faces appear
in the lobby, and the count is back to zero the moment the question is on screen.

## 4. Nothing was rebuilt to do this

- The reaction vocabulary is CSS on the figure that was already there — no new
  images, no new files, no library.
- Every reaction also re-applies itself after the phone redraws its figure, so
  a roster update mid-reveal does not wipe the expression.
- `prefers-reduced-motion` stops all of it, and the static pose (brows, droop)
  still changes.

## What did not change

- **No database change.** No migration, no new column. Publications,
  assignments, attempts, reports, leaderboards and saved quizzes open exactly as
  they are.
- Scoring, timers, the two-press start, the delayed participant picture, the
  reveal, the podium layout and every limit are untouched.
- `database-config.js` and `qr-code.js` are byte-identical (checked during
  packaging; `database-config.js` is not in the update zip).

## How it was checked

| Check | Result |
| --- | --- |
| `npm test` | **149 / 149 passed, 0 failed** |
| `npm run test:browser` | **1 passed (1.6 m)** |
| `tools/ui-classroom-check.cjs` | **60 / 60 passed** (faces in the lobby, none during play) |
| Blink | the eye really closes — the browser holds `scaleY(0.12)` at the blink frame |
| Reveal reaction | a wrong answer puts `react-wrong` on the phone's figure and it survives the redraw |
| Podium | 1st is `react-win`, 2nd and 3rd are `react-clap`, on the host screen and the wall |
