# Quizzes 0.9.0-rc.20 — verification record

**October 26, 2026 · Test candidate · Not deployed by the assistant**

This is the round you asked for: the characters are drawn as toys, and the
reveal shows the question, the bars and the answers together, on the Spotlight
stage you picked.

## What changed for the room

### 1. The characters are toys, not flat shapes (your choice: **B · Toy render**)

Every figure is now built out of shaded volumes instead of flat silhouettes:

- a **sphere gradient** on the head and a **cylinder gradient** on the body,
  arms and legs, with a warm side and cool side;
- a **specular highlight** on every rounded surface (forehead, cheeks, shoulder,
  the top of each boot) so the light reads as coming from one direction;
- a **cast shadow** on the ground under each figure, squashed and soft;
- chunky mascot proportions — the head is about **46 % of the whole figure**,
  with short legs and small paws;
- big glossy eyes (white sclera, dark iris, a highlight in each pupil) that blink
  and wink.

All twelve characters and all fourteen accessories were redrawn this way. The
file names, the ids and the API did not change, so everything that already used
a character keeps working: the picker, the phone lobby card, the header chip, the
end screen, saved looks and resumed seats.

### 2. The reveal shows everything at once — with ✓ and ✗

Your words, with the screenshot you sent: the question stays, the bars arrive
under it, and the four answer rows sit at the bottom marked **✓** on the right
answer and **✗** on the rest. That is what the screen does now:

- **Host screen, top to bottom:** the question plate, then the strip of bars with
  per-option counts, then the answer tiles — ticked and crossed, still coloured
  so the room can find the option it chose.
- **Projector:** the same three bands, full width, with the counts and the
  percentage under each column.
- **Phone:** unchanged layout — count and mark inside each answer button.

The question **picture** is the one thing that steps aside at the reveal, exactly
as you asked ("just not attached image"). Everything else stays.

The rc.19 "bars-only" screen is gone from the code, not just switched off.

### 3. The whole live game is one stage (your choice: **1 · Spotlight**)

- Deep indigo stage with a lit pool of light behind the question.
- The question is a bright plate with a soft drop shadow.
- Each answer is a chunky tile with a colour lip under it and a cast shadow, in
  the same six colours on the host screen, the projector and the phone.
- The clock and the "answers" meter are white discs with a purple lip.
- The lobby names arrive as bright pills; the standings are dark rows with a gold
  first place.
- The projector wears the same stage, so the wall and your laptop match.

### 4. Small things fixed on the way

- A toast message ("Welcome to your workspace") used to sit exactly on top of the
  **Next question** button for a few seconds and swallow the click. Toasts no
  longer take clicks, and they move up while a game is open.
- A round typed as "Round 1 · Warm up" no longer reads "Round 1: · Warm up".
- The correct answer used to show **two** ticks (one drawn by CSS, one by the new
  reveal mark). Now there is one.
- With six answers and a picture on a 1366×768 laptop the tiles stayed visible:
  the picture shrinks first, the answer text never goes below 28 px and the
  question never below 36 px.

## What did not change

- **No stored data is touched.** No schema change, no migration. Publications,
  assignments, attempts, reports, leaderboards, saved quizzes and their times all
  open exactly as they were.
- **`database-config.js` and `qr-code.js` are byte-identical** (checked against
  their hashes during packaging). Your database connection cannot be affected.
- The look a player chose is stored exactly as in rc.19 (`character`,
  `accessory`); a seat resumed from an older room is still given a stable
  character.
- No player faces on the host screen or the projector — still names and points
  only.
- No answer counts while a question is open — still only at the reveal.
- Every limit is unchanged and still listed in `LIMITS.md`.

## Checks run

| Check | Result |
|---|---|
| `npm test` (Node 22) | **146 / 146 pass** |
| `npm run test:browser` (Playwright) | **1 passed** (~1.4 min) |
| `tools/ui-classroom-check.cjs` | **55 / 55 pass** |
| Host reveal order | question above bars above answers (`146 < 362 < 638`) |
| Host reveal marks | **1 tick, 3 crosses**, visible at opacity 1 |
| Phone reveal marks | ✗ ✗ ✗ ✓ with the same counts as the host |
| Projector reveal | 1 question, 4 options, ✓ and ✗ on every row, picture hidden |
| Question still hidden counts? | 0 bars, chart hidden while the question is open |
| Six-option layout at 1366×768 / 1280×720 / 1920×1080 / 1024×768 | no overflow, answer text ≥ 28 px, question ≥ 36 px |
| Player faces on host / projector | **0** |

Screenshots after this build: `host-answer-bars.png` (host reveal: question, bars,
✓/✗), `projector-answer-bars.png` (projector reveal), `player-reveal.png` (phone
reveal), `host-lobby-faces.png` (lobby pills), `player-characters.png` and
`player-character-grid.png` (toy-render picker), `player-face.png` (phone lobby
card), `player-inplay.png` (header chip).

## Packages

Described in `APPLY-v0.9.0-rc.20.md`. Sizes and sha256 checksums are quoted in the
delivery message, because writing them into this file would change the zips.
Both zips are verified file by file against their own `SHA256SUMS.txt`.

`database-config.js` sha256 is unchanged (`ddee8cdd…c6f1495`), and so is
`qr-code.js` (`79ec86f8…f791c`).
