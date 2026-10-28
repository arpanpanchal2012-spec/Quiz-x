# Quizzes 0.9.0-rc.24 — verification record

**October 27, 2026 · Test candidate · Not deployed by the assistant**

The cast is replaced. The nineteen photos are gone, the twenty-four painted 3D
characters are in, and they are **rigged**: the head turns on its own neck and
the body hops, leans, spins and shakes. Not a flat image that shifts — two real
layers, cut and pivoted per figure.

## 1. The new cast — and the old one deleted

| | rc.23 | rc.24 |
| --- | --- | --- |
| Who is offered | 12 drawn + 14 accessories + 19 photos + your face | **24 painted 3D characters** + your face |
| Where they live | `characters/ph-*.webp` (38 files) | `assets/3d/*-{head,body,thumb}.webp` (72 files) + `characters3d.gen.js` |
| The `characters/` folder | shipped | **deleted — remove it on your server** |
| Picker tabs | Characters / Drawn / Accessory | one grid, no tabs |

The roster: Sparkle, Nova, Pixel, Ruby, Royal, Rocky, Kitty, Dino, Unicorn,
Wizard, Hero, Samurai, Chef, Alien, Viking, Pirate, Grove, Blossom, Sprout, and
the five new ones — **Max** (ginger, hoodie, backpack), **Ace** (curly hair,
backwards cap, bomber jacket, skateboard), **Professor** (lab coat, glowing test
tube), **Riff** (magenta mohawk, leather jacket, guitar) and **Grandpa** (cane,
cardigan, moustache).

The sprite ids did not change, so a look saved on a phone last week — or in a
live room a player is sitting in — resolves to the same character, now in 3D.

## 2. How the movement is made

`design-lab/twin-3d/build-rig.py` keys the magenta background off each render,
finds the neck on the silhouette (searching only the 40–57 % band of the figure
and offsetting to the jaw), and writes three WebP files per character:

- **head** — everything above the neck cut, trimmed to its own box;
- **body** — everything from a little **above** the cut, so the jaw pixels stay
  on the body and a turned head can never uncover a hole;
- **thumb** — the whole figure at 128 px for the picker and the lobby wall.

`characters3d.gen.js` carries the numbers: canvas size, the neck point, and each
layer's box. No fetch, no flash of an unpositioned head.

Each figure is one `<svg>` with two `<image>` children. The body is animated
(breath, hop, lean, spin), the head is rotated about `transform-origin` **at its
own neck** — Max's is `150px 303px`, Chef's `150px 207px`. Every character moves
about its own neck, not a shared guess.

## 3. What moves

| Moment | Head | Body |
| --- | --- | --- |
| **Idle, all night** | looks around on its own slow timer | breathes; each figure has its own beat |
| **Right answer** | nods, four times | two hops with a squash and a stretch |
| **Wrong answer** | shakes "no" | sinks, tilts, greys for a beat |
| **Win (1st)** | cheers, then settles | a full spin with a hop |
| **2nd / 3rd** | bobs in time | a polite clap-bounce, endless |
| **3 in a row or better** | nods on every beat | six quick bounces |
| **Taking the lead** | looks up | a big jump with a tilt |
| **Last 5 seconds** | wobbles | vibrates on the spot |
| **Buzzer** | shakes | shakes hard |
| **Lobby / wave** | sways opposite the body | sways side to side |

That is more motion than rc.23 for every outcome, and it survives the phone
redrawing its figure mid-reveal. `prefers-reduced-motion` stops all of it.

**Two honest limits.** (1) The painted faces have real eyes, so an eyelid blink
would need a second set of 24 head renders — instead the head itself moves, all
night, which is what makes it read as alive. (2) Arms travel with the body: a
cut arm on a painted figure leaves the sleeve behind, so the arms swing as part
of the hop, lean and spin rather than on their own.

## 4. The picker, after the deletion

One grid: 24 characters, tap one, it appears above the grid at full size and
moves while you look at it. The **Drawn** and **Accessory** tabs are gone — every
3D character arrives already dressed (that is where the hats and outfits went),
so there is nothing left to wear.

**What stayed:** the **"Your face"** tile. It still puts your own photo on a
drawn body and uploads one small sprite into the room; it is the only place the
drawn figures are still used, and it is invisible unless you tap it.

## 5. What did not change

- **No database change.** No migration, no new column. Publications,
  assignments, attempts, reports, leaderboards and saved quizzes open exactly as
  they are. Every stored `photo:<id>` look still names a character that exists.
- Scoring, timers, the two-press question start, the delayed participant
  picture, the reveal, the podium and every limit are untouched.
- `database-config.js` and `qr-code.js` are byte-identical (checked during
  packaging; `database-config.js` is not in the update zip).
- No player figure appears during a question, a reveal or a live leaderboard —
  the lobby and the podium remain the only places besides the player's own
  phone.

## How it was checked

| Check | Result |
| --- | --- |
| `npm test` | **155 / 155 passed, 0 failed** (6 new: rig files, neck pivots, jaw overlap, public route, folder not browsable, sprites retired) |
| `npm run test:browser` | **1 passed (1.5 m)** |
| `tools/ui-classroom-check.cjs` | **57 / 57 passed** |
| Picker | 25 tiles (24 characters + your face), both retired tabs hidden, every thumbnail loaded |
| The rig on a real figure | preview is `max-head.webp` + `max-body.webp` in one SVG; head origin `150px 303px`; `kRigIdle` on the body and `kRigLook` on the head, both clocks running |
| The neck, at 3× zoom | heads turned −14°…+14° on Max, Grandpa, Viking, Chef and Royal: no seam, no hole, no bar across the face |
| The room | reveal reaction `react-wrong` on the phone, podium `react-win` + 2 × `react-clap` |
| Payload | 1.3 MB of layers replaces 0.87 MB of sprites — 24 characters instead of 19, at about 55 KB each |
