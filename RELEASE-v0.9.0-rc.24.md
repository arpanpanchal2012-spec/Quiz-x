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

| Moment | Head | Body | Hands |
| --- | --- | --- | --- |
| **Idle, all night** | looks around on its own slow timer | breathes; each figure has its own beat | down, at the sides |
| **Right answer** | nods, four times | two hops with a squash and a stretch | **up** |
| **Wrong answer** | shakes "no" | sinks, tilts, greys for a beat | down |
| **Win (1st)** | cheers, then settles | a full spin with a hop | **up, jumping** |
| **2nd / 3rd** | bobs in time | a polite clap-bounce, endless | **up** |
| **3 in a row or better** | nods on every beat | six quick bounces | **up** |
| **Taking the lead** | looks up | a big jump with a tilt | **up** |
| **Last 5 seconds** | wobbles | vibrates on the spot | down |
| **Buzzer** | shakes | shakes hard | **up** |
| **Lobby / wave** | sways opposite the body | sways side to side | down |

That is more motion than rc.23 for every outcome, and it survives the phone
redrawing its figure mid-reveal. `prefers-reduced-motion` stops all of it.

### The hands

A painted figure holds its upper arm against its body: there is no daylight
between sleeve and torso to cut along, and cutting anyway leaves a slot that has
to be painted back in — which is exactly how the first attempt at this release
came out as a figure that bounced but never moved a hand.

So the hands move a different way. **Each character has a second render** — the
same figure, same lighting, same framing, with both arms up at the shoulders —
and a reaction swaps it in for the length of the beat. The swap is anchored
head-to-head: the head is the one part of a character that does not move between
poses, so the two renders are scaled and placed by matching hair width and hair
top, and the feet land on the same ground line by construction. The cheer canvas
is wider than the idle frame, and it is allowed to overflow it, because a raised
arm reaches outside the box an arm-at-rest figure needs.

`design-lab/twin-3d/pose2.py` does the alignment per character. **All 24
characters have one**; a character without one would simply fall back to the
rc.23 behaviour in the table above with an empty hands column.

**One honest limit.** The painted faces have real eyes, so an eyelid blink would
need a third set of renders — instead the head itself moves, all night, which is
what makes it read as alive.

## 3b. What the cheer is, and what it is not

It is a **pose change**, not a limb rig: the figure does not lift one hand while
the other stays put. Cheering, clapping, taking the lead and buzzing all show
the hands-up figure bouncing; the win spins and jumps with the hands still up;
everything else shows the hands-down figure. There is no per-finger or per-elbow
motion, and none is planned — the source art is a painted figure whose arms are
part of its silhouette, and the two-pose swap is what that art supports.

The swap is instant, on the same beat as the rest of the reaction, and it is
cancelled by `prefers-reduced-motion` along with every other animation.

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
| Payload | 1.8 MB of layers replaces 0.87 MB of sprites — 24 characters instead of 19, at about 75 KB each |
| All 24 cheer poses | each character's `-cheer.webp` present in `assets/3d`, in `manifest.json`, in `characters3d.gen.js` and in the ship list — 24 / 24 |
| The cheer in a live phone | `kcheer` visible, head and body hidden, `kCheerBob` running; no 404s; the header chip stays 20 px and does not overflow |
