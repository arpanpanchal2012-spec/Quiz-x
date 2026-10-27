# Quizzes 0.9.0-rc.21 — verification record

**October 27, 2026 · Test candidate · Not deployed by the assistant**

This is the round where the nineteen characters you made in Meta AI become the
characters people play as.

## What changed for the room

### 1. Your nineteen pictures are the characters

All nineteen pictures you attached are in the game, background removed and
trimmed to the figure, each at two sizes:

- **512 × 512 WebP** for the phone lobby card and the podium (24–57 KB each),
- **176 × 176 WebP** for the small header chip and the picker tiles (5–11 KB).

The join screen now opens on a **Characters** tab with all nineteen, four to a
row on a phone and five on anything wider. Their names — Sparkle, Nova, Pixel,
Ruby, Royal, Rocky, Kitty, Dino, Unicorn, Wizard, Hero, Samurai, Chef, Alien,
Viking, Pirate, Grove, Blossom, Sprout — are the ones printed under each tile.
Two of your pictures arrived on a magenta background; those were keyed out, the
edges pulled in by a pixel so no pink fringe survives, and the colour spill
pulled back down. The other seventeen already had a clean transparent
background and were used as they came, only trimmed and squared.

### 2. Both styles are kept

Tabs, left to right: **Characters · Drawn · Accessory**.

- **Characters** — your nineteen pictures.
- **Drawn** — the twelve drawn toy characters, unchanged.
- **Accessory** — the fourteen hats, headphones, glasses and scarves, drawn on
  a character so you can see them before you wear them.

A picture is a finished figure, so a picture look wears **no accessory**. If you
are on a picture and open the Accessory tab, the tiles are drawn on your last
drawn character; tapping one switches you to that drawn character with the hat
on. Your picture choice is remembered for next time, separately, so nothing is
lost by looking.

### 3. The same character everywhere it already appeared

Nothing about where a look shows up has changed — only what is drawn in it:

- the phone lobby card (big, now square for a picture),
- the header chip while a question is running (the 176 px sprite),
- the phone's end screen,
- the **podium**, on your screen and on the projector.

Host and projector still show **no player faces during the game** — names and
numbers only, exactly as before. The podium remains the one exception.

### 4. A picture moves like a picture

A drawing swings its arms, taps its feet, tilts its head and blinks. A
photograph cannot. So a picture character **breathes**: a slow lift, a small
tilt and a soft shadow, on the same beat as the drawn ones, faster in the lobby
and stopped entirely when the phone asks for reduced motion.

### 5. The last question's line no longer follows you to the podium

The phone used to keep the reveal's line under the answers — "4 answers from 4
players", or "No one answered this one." — and it was still there under the
podium on the final screen. It is cleared when the night ends, on the phone and
on your screen. Nothing else on the end screen moved.

### 6. Old phones and old rooms keep working

A picture character travels as `photo:<id>` — a name no drawn character can
have. A browser still running rc.20 or earlier does not understand it and falls
back to a drawing rather than showing an empty box. A room saved before this
release resumes; any seat without a picture keeps its drawn character.

## What did not change

- **No database change.** No migration, no new column. Publications,
  assignments, attempts, reports, leaderboards and saved quizzes open exactly as
  they are.
- `database-config.js` and `qr-code.js` are byte-identical (hashes checked
  during packaging; `database-config.js` is not in the update zip).
- Scoring, timers, the two-press question start, the delayed participant
  picture, the reveal, the podium layout and every limit are untouched.
  `LIMITS.md` now reads **31 looks** instead of 12.
- Phone layout is unchanged: the count and the mark still sit inside each
  answer button, and a picture look does not push the answers down.

## How it was checked

| Check | Result |
| --- | --- |
| `npm test` (unit, integration, limits, recovery) | **148 / 148 passed, 0 failed** |
| `npm run test:browser` (host + real mobile player) | **1 passed (1.5 m)** |
| `tools/ui-classroom-check.cjs` (edit → host → phone → reveal) | **58 / 58 passed** |
| Picture sprites | 19 full + 19 thumbs, every one a valid WebP, every one loaded in the browser |
| Picker on a 390 px phone | 19 tiles, 4 per row, all loaded; a picture chosen and confirmed |
| Phone lobby | picture drawn at 512 px in the card |
| Header chip mid-question | picture thumb at 28 px next to the nickname |
| Host + projector podium | three pictures on the pedestals, correct order, all loaded |

## Files that arrive this time

Thirty-eight new files in `characters/` (19 sprites + 19 thumbs), plus the
changed `characters.js`, `characters.css`, `app.js`, `server.js`, `index.html`,
`package.json`, `LIMITS.md`, the two browser proofs and the packaging tool.
