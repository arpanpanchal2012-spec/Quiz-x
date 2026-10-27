# Quizzes 0.9.0-rc.20 — verification record

**October 26, 2026 · Test candidate · Not deployed by the assistant**

This is the round you asked for: the characters are drawn as toys, the reveal
shows the question, the bars and the answers together, the night ends on a
podium, and nothing on the big screen or the phone tells people what to do.

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

### 4. The night ends on a podium

The last screen is the one everybody photographs. The top three now stand on
gold, silver and bronze pedestals, **in the character each player chose**, with
the number, the nickname and the points on the pedestal itself:

- **Host screen:** the same podium, scaled for a laptop; everyone below third
  place sits in a plain row underneath it.
- **Projector:** the podium fills the wall, the names and points large enough to
  read from the back row.
- The three characters **rise into place** one after another (second, third,
  winner) instead of all appearing at once.
- The plate above them still says **Final leaderboard**, and the line under it
  still asks you to announce your winners.

This is the one place player characters appear off the phone — because you asked
for the characters themselves on the winners' podium.

### 5. Nothing to read but the game

At the question and at the options there is now **no instruction text**:

- the projector shows the question, the picture and the answers — nothing else;
- the phone shows the same three things, with the round name and the clock, and
  no line telling anyone what to press;
- the host screen keeps its own one-line prompt for you (it is your console, not
  the room's screen), and that line is hidden while a picture question is open.

The round announcements you asked for are unchanged: "Round 2 · Colors" still
fills the screen between rounds.

### 6. A picture that spans the stage

A question picture is no longer a small centred box:

- **Projector:** the picture runs the full width of the screen, the question
  plate above it and the answers below it.
- **Host screen:** the picture sits in a full-width band across the middle of the
  stage, with the answers in a compact grid underneath. The band takes every
  pixel of height the question and the answers can spare, so a wide picture runs
  almost edge to edge (≈950 px of 1450 at 1500×1000 for a 8:3 picture). Six
  answers still fit in two rows at 1366×768 and 1280×720.
- **No cropping** — the picture keeps its own shape. A picture that is taller
  than the band's shape is letterboxed inside it rather than stretched or cut.
- The **phone** already showed the picture full width; it now uses the same six
  answer colours as the screen, so "the green one" means the same tile everywhere.

### 7. Small things fixed on the way

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
- No player faces on the host screen or the projector during the game — names
  and points only. The one exception is the end-of-game podium you asked for.
- No answer counts while a question is open — still only at the reveal.
- Every limit is unchanged and still listed in `LIMITS.md`.

## Checks run

| Check | Result |
|---|---|
| `npm test` (Node 22) | **146 / 146 pass** |
| `npm run test:browser` (Playwright) | **1 passed** (~1.4 min) |
| `tools/ui-classroom-check.cjs` | **55 / 55 pass** |
| Host reveal order | question above bars above answers (`197 < 345 < 619`) |
| Host reveal marks | **1 tick, 3 crosses**, visible at opacity 1 |
| Phone reveal marks | ✗ ✗ ✗ ✓ with the same counts as the host |
| Projector reveal | 1 question, 4 options, ✓ and ✗ on every row, picture hidden |
| Question still hidden counts? | 0 bars, chart hidden while the question is open |
| Six-option layout at 1366×768 / 1280×720 / 1920×1080 / 1024×768 | no overflow, answer text ≥ 28 px, question ≥ 36 px |
| Player faces on host / projector during the game | **0** (podium only, as asked) |
| Podium, host and projector | three characters on gold/silver/bronze pedestals, 4th place in a plain row |
| Host ended screen at 1280×720 | no scroll (`498 = 498`) |
| Picture question at 1500×1000 | picture band 1454 px wide, question ≥ 36 px, answers ≥ 28 px |

Screenshots after this build: `host-podium.png` and `projector-podium.png` (the
end-of-game podium), `host-podium-laptop.png` (1280×720), `host-image-question.png`
(picture band), `projector-question.png` (no instructions), `player-question.png`
(phone, same colours as the screen), `host-answer-bars.png` (host reveal: question,
bars, ✓/✗), `projector-answer-bars.png` (projector reveal), `player-reveal.png`
(phone reveal), `host-lobby-faces.png` (lobby pills), `player-characters.png` and
`player-character-grid.png` (toy-render picker), `player-face.png` (phone lobby
card), `player-inplay.png` (header chip).

## Packages

Described in `APPLY-v0.9.0-rc.20.md`. Sizes and sha256 checksums are quoted in the
delivery message, because writing them into this file would change the zips.
Both zips are verified file by file against their own `SHA256SUMS.txt`.

`database-config.js` sha256 is unchanged (`ddee8cdd…c6f1495`), and so is
`qr-code.js` (`79ec86f8…f791c`).
