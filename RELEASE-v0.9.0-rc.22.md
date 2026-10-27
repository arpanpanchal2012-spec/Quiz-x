# Quizzes 0.9.0-rc.22 — verification record

**October 27, 2026 · Test candidate · Not deployed by the assistant**

Everything on the "make people love it" list, plus the one thing you asked for
yourself: **players can put their own face on a character.**

## 1. Your face on a character

On the join screen the Characters tab now ends with a dashed tile, **Your face**.

1. Tap it, then **Take or choose a photo** (the phone's camera opens directly on
   a phone).
2. Drag the photo and zoom until the face sits inside the ring — the ring is
   exactly what the room will see.
3. **Use this face.** The figure is built on the phone: the cropped face clipped
   into a circle on a drawn body, with the hat you already chose, then baked
   into one 240 × 400 WebP of about 8–20 KB.

That sprite is uploaded to the room and appears everywhere a character does —
the lobby card, the header while a question runs, the end screen and the podium,
on your screen and on the projector.

- **Which body:** the one picked in the Drawn tab; the hat comes from Accessory.
  Changing either rebuilds the face from the crop you already made, so no
  retaking the photo.
- **Where the photo goes:** nowhere but the room. The full photo never leaves the
  phone; only the finished figure is sent, it is held in the live room's memory,
  it is served with `no-store`, and it disappears when the room ends or the
  player picks a listed character. It is never written into a quiz, an attempt,
  a report or an export, and `LIMITS.md` states the 160 KB cap.
- **If the room restarts** the face is gone and that seat shows its drawn
  character instead of a broken image — no error, no empty box.

## 2. The phone reacts to the answer

At the reveal the phone knows whether the player was right: the title pops and a
confetti burst goes off for a right answer, the title shakes for a wrong one. A
small canvas layer draws the confetti — written here, no library, and it does
nothing when the phone asks for reduced motion.

## 3. Points and streaks

- **+850** floats off the card with the points just won this question.
- A flame pill shows **2 in a row**, **3 in a row** — and only from two, so a
  single right answer is not congratulated twice.

## 4. The podium is a moment

- The winner wears a **gold crown** that drops onto their head, on your screen
  and on the projector.
- Confetti bursts over the pedestals when they land.
- **One or two players** no longer stand off to one side: only the places that
  exist are shown, centred.

## 5. A colour for each round

Round 1 is violet, round 2 green, round 3 gold: the stage edge, the round pill
and the wall's light take the round's colour, so a three-round night reads as
three acts. The six answer colours never change — they belong to the answers.

## 6. The clock is a ring

The timer pill carries a ring that drains with the clock and turns red for the
last five seconds. No clock running, no ring.

## 7. Everything settles in

Question, reveal and the end screen fade in over a quarter second instead of
snapping. Opacity only, so nothing moves under the pointer.

## 8. Character polish

Picture characters now stand on a soft floor shadow instead of floating.

## 9. A first impression

- The join card opens with six of your characters lined up and breathing.
- The placeholder "Q" is replaced by a real mark: a white Q ring with a gold
  spark, on the join page, the sidebar and the join header.

## What did not change

- **No database change.** No migration, no new column. Publications,
  assignments, attempts, reports and leaderboards open exactly as they are.
- Scoring, timers, the two-press start, the delayed participant picture, the
  reveal and every limit are untouched.
- `database-config.js` and `qr-code.js` are byte-identical (checked during
  packaging; `database-config.js` is not in the update zip).

## How it was checked

| Check | Result |
| --- | --- |
| `npm test` | **149 / 149 passed, 0 failed** (new: a face goes into a room, and only there) |
| `npm run test:browser` | **1 passed (1.6 m)** |
| `tools/ui-classroom-check.cjs` | **59 / 59 passed** (new: the face tile) |
| Face walk in a browser | crop → compose (240 × 400) → upload → lobby card → projector podium, all loaded |
| Podium | crown and confetti on the host screen and the wall; one-player podium centred |
