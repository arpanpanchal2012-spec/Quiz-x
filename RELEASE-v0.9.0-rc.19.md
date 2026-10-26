# Quizzes 0.9.0-rc.19 — verification record

**October 26, 2026 · Test candidate · Not deployed by assistant**

## What changed for the room

### 1. Every player picks who they play as

Joining is now two steps. First the game code and nickname, then a **character
screen** with two tabs, exactly the shape of the reference screenshot you sent:

- **Character** — twelve animals and creatures, five to a row: Bear, Cat, Fox,
  Bunny, Panda, Frog, Penguin, Owl, Tiger, Wolf, Unicorn, Monster.
- **Accessory** — fourteen things to wear, also five to a row: cap, crown, party
  hat, wizard hat, graduation cap, beanie, cowboy hat, headphones, sunglasses,
  goggles, helmet, scarf, bow tie, or nothing at all.
- A live preview of the chosen pair sits above the grids, and **Join game →**
  takes the player in.

The choice travels with the seat: if a phone drops and rejoins, the same animal
in the same hat comes back. If two players sit down, the room hands each new
player an animal nobody else has yet. A player who comes back next week on the
same phone gets their last look pre-selected.

All the artwork is drawn in code (`characters.js`, `characters.css`) — no images,
no downloads, no third-party artwork, nothing that can 404 on a slow phone.

### 2. The character is alive

Not a small bobbing emoji. The whole figure moves, the way the reference clip
does:

- the body bounces and squashes and stretches on every beat;
- the two arms swing out of phase, so it looks like it is waving along;
- the feet tap, the head tilts, the eyes blink and wink;
- each player's figure runs at its own offset, so a lobby of ten phones is a
  crowd, not a chorus line.

Only transforms are animated, so a hundred phones stay smooth. Anyone with
**reduce motion** turned on in their operating system gets a still figure.

### 3. No player faces on the host screen or the projector

This reverses rc.16/rc.17. The lobby wall, the leaderboard, the podium and the
projector now show **nicknames and points only**. The character belongs to the
player's own phone: lobby card, in-question header chip, and the end screen.

The emoji set and every `.avatar-badge` on those screens are gone from the code,
not just hidden.

### 4. The answer bars get their own screen

Your words: *"the option answers bar is on the same question page … when answer
bar it's only there nothing else is there."* That is now literal.

At the reveal:

- **Host** — the stage holds the four columns and their counts. No question
  text, no answer tiles, no picture, no "Correct answer:" line, no round pill, no
  music bar. The header, the "Show leaderboard" / "Next question" buttons stay,
  because they are the host's controls, not the question page.
- **Projector** — the same columns, full screen, with the header and footer
  hidden too. Nothing but the bars.
- **Phones** — unchanged: the bar and count sit under each answer, because that
  is a private screen and it reads better small.

For a fill-in question, which has no bars, the screen stays as it was.

## What did not change

- No stored publication, attempt, assignment, report or leaderboard is touched.
  The schema is unchanged.
- **`database-config.js` and `qr-code.js` are byte-identical** (checked against
  their hashes during packaging). Your database connection cannot be affected by
  this update.
- A room saved by an older version still resumes: a player with no character is
  given a stable one from their seat id, and keeps it on every later restore.

## Checks run

| Check | Result |
|---|---|
| `npm test` (Node 22) | **146 / 146 pass** |
| `npm run test:browser` (Playwright) | **1 passed** (~1.6 min) |
| `tools/ui-classroom-check.cjs` | **48 / 48 pass** |
| Character motion measured in a real browser | body `kBounce`, arms `kSwing`, transforms change frame to frame |
| Host / projector face count at every stage | **0** |
| Reveal screen contents (host) | question, options, hint, media, timer all hidden |
| Reveal screen contents (projector) | 0 questions, 0 options, header and footer hidden |

Screenshots: `picker-character.png` and `picker-accessory.png` (the two tabs of
the join screen), `player-characters.png` (a choice made), `player-face.png`
(lobby card), `player-inplay.png` (header chip during a question),
`player-reveal.png` (phone bars), `host-answer-bars.png` (host reveal screen),
`projector-answer-bars.png` (projector reveal screen), `host-lobby-faces.png`
(the lobby: nicknames only, no faces).

## Packages

The two zips are described in `APPLY-v0.9.0-rc.19.md`; their sizes and sha256
checksums are quoted in the delivery message, because writing them into this file
would change the zips themselves. Both are verified file by file against their
own `SHA256SUMS.txt`.

`database-config.js` sha256 is unchanged (`ddee8cdd…c6f1495`), and so is
`qr-code.js` (`79ec86f8…f791c`).
