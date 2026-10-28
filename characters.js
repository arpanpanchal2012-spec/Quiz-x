"use strict";
// Original, code-drawn characters for players to choose when they join.
//
// Nothing here is copied from any other quiz product: every shape is built from
// plain SVG primitives in this file, so the app carries no third-party artwork
// and no image downloads at all.
//
// The finish is "toy render": no outline, a spherical gradient on every round
// surface, a specular highlight on the upper left of each one, a cast shadow
// under the figure. That is what makes the drawing read as a solid object rather
// than a flat sticker — the light, not the line.
//
// Anatomy (viewBox 0 0 120 200, so a head that is nearly half the figure):
//   body   y  92…158   x 25…95      arms hang from y 98, mitts at y 152
//   legs   y 148…180                feet ellipses at y 178
//   head   centre (60,58) r ≈ 46    hats sit on y ≈ 12, the top of the head
//   item   the accessory, drawn last so it sits over the head
//
// Animation hooks, used by characters.css:
//   .kchar .kbody .karm-l/.karm-r .kfoot-l/.kfoot-r .khead .kitem .kpupil
(() => {
  const INK = "#3b2b52"; // mouths, whiskers — there is no outline on the shapes

  // id, label, fur (hi / mid / low), body, shoes, face variant
  const CHARACTERS = [
    { id: "bear", label: "Bear", furHi: "#efc490", fur: "#c98b4f", furLo: "#94592a", muzzle: "#f7e3c9", bodyHi: "#ffcb7d", body: "#f2a33c", bodyLo: "#bf6f16", shoe: "#ef5b7e", shoeLo: "#ab2744" },
    { id: "cat", label: "Cat", furHi: "#ffd39a", fur: "#f6a24b", furLo: "#c26a1e", muzzle: "#ffeedd", bodyHi: "#7ce9d2", body: "#33bda0", bodyLo: "#15806d", shoe: "#e9536b", shoeLo: "#a72b41" },
    { id: "fox", label: "Fox", furHi: "#ffb877", fur: "#f2723a", furLo: "#b8451a", muzzle: "#fff3e8", bodyHi: "#8fc2ff", body: "#2f7fd1", bodyLo: "#1a5295", shoe: "#3b3350", shoeLo: "#1e1830" },
    { id: "bunny", label: "Bunny", furHi: "#f4effa", fur: "#d7d3e0", furLo: "#a49cb8", muzzle: "#ffffff", bodyHi: "#ffa8c4", body: "#e5709a", bodyLo: "#b0416b", shoe: "#7c5cff", shoeLo: "#4529b0" },
    { id: "panda", label: "Panda", furHi: "#ffffff", fur: "#f2eef8", furLo: "#cfc7dd", muzzle: "#ffffff", bodyHi: "#6e6a8e", body: "#4b4a63", bodyLo: "#2b2a3d", shoe: "#ef5b7e", shoeLo: "#ab2744" },
    { id: "frog", label: "Frog", furHi: "#c2f890", fur: "#7ec84a", furLo: "#4a8a20", muzzle: "#e6ffc4", bodyHi: "#bda2ff", body: "#8a5cf0", bodyLo: "#5a31c0", shoe: "#ef5b7e", shoeLo: "#ab2744" },
    { id: "penguin", label: "Penguin", furHi: "#5c6f96", fur: "#3b4a6b", furLo: "#222c45", muzzle: "#ffffff", bodyHi: "#ffd980", body: "#f2b53a", bodyLo: "#b87c0a", shoe: "#f2703a", shoeLo: "#b0451a" },
    { id: "owl", label: "Owl", furHi: "#dcb283", fur: "#b07d52", furLo: "#7d5230", muzzle: "#f6e3c6", bodyHi: "#a48cff", body: "#7c5cff", bodyLo: "#4b2fc4", shoe: "#f2b53a", shoeLo: "#b87c0a" },
    { id: "tiger", label: "Tiger", furHi: "#ffd08a", fur: "#f5a13a", furLo: "#bb6a12", muzzle: "#fff6e9", bodyHi: "#ff9a76", body: "#e2643c", bodyLo: "#a83c1c", shoe: "#3b3350", shoeLo: "#1e1830" },
    { id: "wolf", label: "Wolf", furHi: "#ccd4e4", fur: "#9aa3b5", furLo: "#656d80", muzzle: "#f2f5fb", bodyHi: "#8cc4ff", body: "#4a8fd4", bodyLo: "#23618f", shoe: "#3b3350", shoeLo: "#1e1830" },
    { id: "unicorn", label: "Unicorn", furHi: "#ffffff", fur: "#fdf3f8", furLo: "#d3b7cb", muzzle: "#ffffff", bodyHi: "#ffa6e6", body: "#e465c7", bodyLo: "#a83291", shoe: "#7c5cff", shoeLo: "#4529b0" },
    { id: "monster", label: "Monster", furHi: "#d5a6ff", fur: "#a86ee0", furLo: "#6f3ea6", muzzle: "#e8d0fa", bodyHi: "#96edb6", body: "#4cc47c", bodyLo: "#228a4c", shoe: "#f2b53a", shoeLo: "#b87c0a" },
  ];

  const ACCESSORIES = [
    { id: "none", label: "No accessory" },
    { id: "cap", label: "Cap" },
    { id: "crown", label: "Crown" },
    { id: "party", label: "Party hat" },
    { id: "wizard", label: "Wizard hat" },
    { id: "grad", label: "Graduation cap" },
    { id: "beanie", label: "Beanie" },
    { id: "cowboy", label: "Cowboy hat" },
    { id: "headphones", label: "Headphones" },
    { id: "shades", label: "Sunglasses" },
    { id: "goggles", label: "Goggles" },
    { id: "helmet", label: "Helmet" },
    { id: "scarf", label: "Scarf" },
    { id: "bowtie", label: "Bow tie" },
  ];

  // The ready-made characters: glossy 3D renders, not drawings. Each one is
  // cut into a head and a body in design-lab/twin-3d/build-rig.py, so the head
  // can turn at the neck and the figure can hop, lean and sway. The sprite ids
  // are the same as the old picture cast, so a look saved on a phone last week
  // still names a character the app knows.
  const PHOTO_CHARACTERS = [
    { id: "sparkle", label: "Sparkle" },
    { id: "nova", label: "Nova" },
    { id: "pixel", label: "Pixel" },
    { id: "ruby", label: "Ruby" },
    { id: "royal", label: "Royal" },
    { id: "rocky", label: "Rocky" },
    { id: "kitty", label: "Kitty" },
    { id: "dino", label: "Dino" },
    { id: "unicorn", label: "Unicorn" },
    { id: "wizard", label: "Wizard" },
    { id: "hero", label: "Hero" },
    { id: "samurai", label: "Samurai" },
    { id: "chef", label: "Chef" },
    { id: "alien", label: "Alien" },
    { id: "viking", label: "Viking" },
    { id: "pirate", label: "Pirate" },
    { id: "grove", label: "Grove" },
    { id: "blossom", label: "Blossom" },
    { id: "sprout", label: "Sprout" },
    { id: "max", label: "Max" },
    { id: "ace", label: "Ace" },
    { id: "scientist", label: "Professor" },
    { id: "rockstar", label: "Riff" },
    { id: "grandpa", label: "Grandpa" },
  ];
  const PHOTO_PREFIX = "photo:";
  const PHOTO_IDS = PHOTO_CHARACTERS.map((c) => PHOTO_PREFIX + c.id);
  const photoOf = (id) =>
    typeof id === "string" && id.startsWith(PHOTO_PREFIX)
      ? PHOTO_CHARACTERS.find((p) => p.id === id.slice(PHOTO_PREFIX.length)) || null
      : null;

  // --------------------------------------------------------------- 3D rigs
  // characters3d.gen.js carries the numbers: canvas size, the neck point the
  // head turns about, and the box each trimmed layer occupies on that canvas.
  const RIGS = (typeof window !== "undefined" && window.QUIZZES_RIGS) || {};

  // A rig is one <svg> with two <image> layers, so it scales into any slot the
  // way a drawing does — no letterboxing, no fixed pixel size. The body layer
  // keeps the jaw, so a turned head never uncovers a hole in the neck.
  function rigSVG(photo, options) {
    const r = RIGS[photo.id];
    const label = options.label === false ? "" : `${photo.label} character`;
    if (!r)
      return `<img class="kchar kchar-photo" src="/assets/3d/${photo.id}-thumb.webp" alt="${label}" decoding="async" draggable="false" />`;
    const [nx, ny] = r.neck;
    const [hx, hy, hw, hh] = r.head;
    const [bx, by, bw, bh] = r.body;
    // Every figure breathes on its own clock, so a lobby never moves in unison.
    const beat = `${(Math.random() * 2.4).toFixed(2)}s`;
    const look = `${(Math.random() * 4).toFixed(2)}s`;
    return `<span class="kchar kchar-rig" style="--beat:${beat};--lookBeat:${look}">
      <svg class="krig" viewBox="0 0 ${r.w} ${r.h}" preserveAspectRatio="xMidYMax meet" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">
        <image class="krig-body" href="/assets/3d/${photo.id}-body.webp" x="${bx}" y="${by}" width="${bw}" height="${bh}" preserveAspectRatio="none" ${options.extra || ""} />
        <g class="khead krig-head" style="transform-origin:${(nx * r.w).toFixed(1)}px ${(ny * r.h).toFixed(1)}px">
          <image class="krig-face" href="/assets/3d/${photo.id}-head.webp" x="${hx}" y="${hy}" width="${hw}" height="${hh}" preserveAspectRatio="none" />
        </g>
      </svg>
    </span>`;
  }

  const CHARACTER_IDS = CHARACTERS.map((c) => c.id);
  const ACCESSORY_IDS = ACCESSORIES.map((a) => a.id);
  const byId = (list, id) => list.find((x) => x.id === id) || list[0];

  // ------------------------------------------------------------- gradients
  const sphere = (id, hi, mid, lo, cx = 0.36, cy = 0.26, r = 0.84) =>
    `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"><stop offset="0" stop-color="${hi}"/><stop offset="0.52" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></radialGradient>`;
  const cyl = (id, hi, mid, lo) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0.05" stop-color="${hi}"/><stop offset="0.42" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient>`;

  function defsFor(id, c) {
    return [
      sphere(`${id}-head`, c.furHi, c.fur, c.furLo),
      sphere(`${id}-earL`, c.furHi, c.fur, c.furLo, 0.4, 0.28, 0.86),
      sphere(`${id}-earR`, c.furHi, c.fur, c.furLo, 0.4, 0.28, 0.86),
      sphere(`${id}-bumpL`, c.furHi, c.fur, c.furLo),
      sphere(`${id}-bumpR`, c.furHi, c.fur, c.furLo),
      sphere(`${id}-hornL`, c.furHi, c.fur, c.furLo),
      sphere(`${id}-hornR`, c.furHi, c.fur, c.furLo),
      sphere(`${id}-muzzle`, "#ffffff", c.muzzle, "#d9c4e8", 0.5, 0.32, 0.82),
      cyl(`${id}-body`, c.bodyHi, c.body, c.bodyLo),
      cyl(`${id}-armL`, c.bodyHi, c.body, c.bodyLo),
      cyl(`${id}-armR`, c.bodyLo, c.body, c.bodyHi),
      sphere(`${id}-mitt`, "#ffffff", "#f8f4fd", "#ccbee6", 0.34, 0.26, 0.82),
      sphere(`${id}-shoe`, c.shoe, c.shoe, c.shoeLo, 0.36, 0.28, 0.86),
      sphere(`${id}-beak`, "#ffd77e", "#f5a623", "#c2720a", 0.38, 0.3, 0.85),
      cyl(`${id}-hatA`, "#9a86ff", "#6a56e8", "#4330b4"),
      cyl(`${id}-hatB`, "#ffd777", "#f5a623", "#bf7207"),
      `<linearGradient id="${id}-gold" x1="0" y1="0" x2="0.2" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset="0.45" stop-color="#f9c534"/><stop offset="1" stop-color="#c98a08"/></linearGradient>`,
      `<linearGradient id="${id}-party" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#ffa3c0"/><stop offset="0.5" stop-color="#f4557f"/><stop offset="1" stop-color="#b52c55"/></linearGradient>`,
      `<linearGradient id="${id}-horn" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#fff6c9"/><stop offset="1" stop-color="#eab13c"/></linearGradient>`,
      `<linearGradient id="${id}-mane" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3a4ff"/><stop offset="1" stop-color="#6f45d8"/></linearGradient>`,
      `<linearGradient id="${id}-helmet" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="0.5" stop-color="#f6a923"/><stop offset="1" stop-color="#c2760a"/></linearGradient>`,
      `<linearGradient id="${id}-helmetB" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd475"/><stop offset="1" stop-color="#bf7207"/></linearGradient>`,
      `<linearGradient id="${id}-wool" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9d2ea"/></linearGradient>`,
      `<linearGradient id="${id}-leather" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#c98f52"/><stop offset="1" stop-color="#8a5524"/></linearGradient>`,
      `<linearGradient id="${id}-glass" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="#cdeeff" stop-opacity=".95"/><stop offset="1" stop-color="#7cc7f5" stop-opacity=".85"/></linearGradient>`,
      `<radialGradient id="${id}-sclera" cx="0.4" cy="0.26" r="0.86"><stop offset="0" stop-color="#ffffff"/><stop offset="0.76" stop-color="#f4f0fc"/><stop offset="1" stop-color="#d5cae9"/></radialGradient>`,
      `<radialGradient id="${id}-blush"><stop offset="0" stop-color="#ff5f86" stop-opacity=".8"/><stop offset="1" stop-color="#ff5f86" stop-opacity="0"/></radialGradient>`,
      `<linearGradient id="${id}-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1230" stop-opacity=".26"/><stop offset="1" stop-color="#1b1230" stop-opacity="0"/></linearGradient>`,
    ].join("");
  }

  // ------------------------------------------------------------------ eyes
  // The wet highlight in the eye does more for depth than any gradient.
  // The pair of eyes. Each is wrapped so it can close as a whole (a real
  // blink, not a squashed highlight), carries a brow that can lift or furrow,
  // and has a lid line that draws itself as the eye shuts.
  function eyes(id, y = 50, dx = 18, r = 13.5) {
    const one = (x, n) => `
      <g class="keye keye-${n}">
        <ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.98}" fill="url(#${id}-sclera)"/>
        <g class="keyeball">
          <ellipse cx="${x}" cy="${y + r * 0.1}" rx="${r * 0.6}" ry="${r * 0.62}" fill="#2b2040"/>
          <ellipse cx="${x}" cy="${y + r * 0.16}" rx="${r * 0.4}" ry="${r * 0.42}" fill="#120c1c"/>
          <circle class="kpupil kpupil-${n}" cx="${x - r * 0.22}" cy="${y - r * 0.24}" r="${r * 0.26}" fill="#fff" opacity=".95"/>
          <circle cx="${x + r * 0.2}" cy="${y + r * 0.3}" r="${r * 0.11}" fill="#fff" opacity=".6"/>
        </g>
      </g>
      <path class="klid klid-${n}" d="M${x - r * 1.02} ${y} q${r * 1.02} ${r * 0.55} ${r * 2.04} 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" opacity="0"/>
      <path class="kbrow kbrow-${n}" d="M${x - r * 0.85} ${y - r * 1.55} q${r * 0.85} ${-r * 0.42} ${r * 1.7} 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>`;
    return one(60 - dx, "a") + one(60 + dx, "b");
  }
  const blush = (id, y) => `
      <ellipse cx="24" cy="${y}" rx="9" ry="5.5" fill="url(#${id}-blush)" opacity=".55"/>
      <ellipse cx="96" cy="${y}" rx="9" ry="5.5" fill="url(#${id}-blush)" opacity=".55"/>`;

  // ----------------------------------------------------------------- heads
  const G = (id, k) => `url(#${id}-${k})`;
  const HEADS = {
    bear: (id, c) => `
      <circle cx="24" cy="22" r="15" fill="${G(id, "earL")}"/>
      <circle cx="96" cy="22" r="15" fill="${G(id, "earR")}"/>
      <circle cx="24" cy="21" r="7.5" fill="${c.muzzle}" opacity=".9"/>
      <circle cx="96" cy="21" r="7.5" fill="${c.muzzle}" opacity=".9"/>
      <ellipse cx="60" cy="58" rx="47" ry="44" fill="${G(id, "head")}"/>
      <ellipse cx="34" cy="26" rx="17" ry="10" fill="#fff" opacity=".3" transform="rotate(-24 34 26)"/>
      <ellipse cx="60" cy="74" rx="24" ry="17" fill="${G(id, "muzzle")}" opacity=".92"/>
      <ellipse cx="60" cy="66" rx="7.5" ry="5.6" fill="#3b2b52"/>
      <ellipse cx="57.8" cy="64" rx="2.6" ry="1.7" fill="#fff" opacity=".65"/>
      <path d="M60 71v4.5M60 75.5c-3.4 4-8 3-9-.6M60 75.5c3.4 4 8 3 9-.6" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
      ${eyes(id, 50, 18, 13.5)}${blush(id, 74)}`,
    cat: (id, c) => `
      <path d="M22 44 L24 2 L52 26 Z" fill="${G(id, "earL")}"/>
      <path d="M98 44 L96 2 L68 26 Z" fill="${G(id, "earR")}"/>
      <path d="M30 34 L31 14 L45 27 Z" fill="#ffb3c9"/>
      <path d="M90 34 L89 14 L75 27 Z" fill="#ffb3c9"/>
      <ellipse cx="60" cy="58" rx="46" ry="43" fill="${G(id, "head")}"/>
      <ellipse cx="37" cy="28" rx="17" ry="10" fill="#fff" opacity=".28" transform="rotate(-24 37 28)"/>
      <ellipse cx="60" cy="74" rx="21" ry="14" fill="${G(id, "muzzle")}" opacity=".95"/>
      <path d="M54.5 68h11l-5.5 5z" fill="#e2708c"/>
      <path d="M60 73c-2.8 3.8-7 3.4-8.6.6M60 73c2.8 3.8 7 3.4 8.6.6" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
      <path d="M14 64h12M14 71h12M94 64h12M94 71h12" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" opacity=".4"/>
      ${eyes(id, 50, 18, 13)}${blush(id, 72)}`,
    fox: (id, c) => `
      <path d="M20 46 L22 0 L54 26 Z" fill="${G(id, "earL")}"/>
      <path d="M100 46 L98 0 L66 26 Z" fill="${G(id, "earR")}"/>
      <path d="M28 34 L30 12 L46 26 Z" fill="#3a2a30" opacity=".55"/>
      <path d="M92 34 L90 12 L74 26 Z" fill="#3a2a30" opacity=".55"/>
      <ellipse cx="60" cy="58" rx="46" ry="43" fill="${G(id, "head")}"/>
      <ellipse cx="37" cy="28" rx="17" ry="10" fill="#fff" opacity=".3" transform="rotate(-24 37 28)"/>
      <path d="M60 40c16 0 30 14 30 30 0 8-6 12-14 12H44c-8 0-14-4-14-12 0-16 14-30 30-30z" fill="${G(id, "muzzle")}" opacity=".95"/>
      <ellipse cx="60" cy="66" rx="7" ry="5.2" fill="#33242c"/>
      <ellipse cx="57.9" cy="64.2" rx="2.4" ry="1.6" fill="#fff" opacity=".6"/>
      <path d="M60 71v4M60 75c-3 3.6-7 2.8-8-.5M60 75c3 3.6 7 2.8 8-.5" fill="none" stroke="${INK}" stroke-width="2.1" stroke-linecap="round"/>
      ${eyes(id, 48, 18, 13)}${blush(id, 72)}`,
    bunny: (id, c) => `
      <ellipse cx="38" cy="-6" rx="13" ry="34" fill="${G(id, "earL")}" transform="rotate(-8 38 -6)"/>
      <ellipse cx="82" cy="-6" rx="13" ry="34" fill="${G(id, "earR")}" transform="rotate(8 82 -6)"/>
      <ellipse cx="38" cy="-4" rx="6" ry="24" fill="#ffc6d8" opacity=".85" transform="rotate(-8 38 -4)"/>
      <ellipse cx="82" cy="-4" rx="6" ry="24" fill="#ffc6d8" opacity=".85" transform="rotate(8 82 -4)"/>
      <ellipse cx="60" cy="60" rx="44" ry="42" fill="${G(id, "head")}"/>
      <ellipse cx="37" cy="32" rx="16" ry="9" fill="#fff" opacity=".55" transform="rotate(-24 37 32)"/>
      <ellipse cx="60" cy="74" rx="19" ry="13" fill="${G(id, "muzzle")}" opacity=".95"/>
      <path d="M54.5 68h11l-5.5 5z" fill="#e2708c"/>
      <path d="M55 78h4v6h-4zM61 78h4v6h-4z" fill="#fff" stroke="#d7cfe6" stroke-width="1"/>
      ${eyes(id, 52, 17, 12.5)}${blush(id, 72)}`,
    panda: (id, c) => `
      <circle cx="26" cy="20" r="16" fill="#2b2a3d"/>
      <circle cx="94" cy="20" r="16" fill="#2b2a3d"/>
      <ellipse cx="60" cy="58" rx="46" ry="44" fill="${G(id, "head")}"/>
      <ellipse cx="38" cy="28" rx="16" ry="9" fill="#fff" opacity=".6" transform="rotate(-24 38 28)"/>
      <ellipse cx="40" cy="52" rx="15" ry="17" fill="#2b2a3d" transform="rotate(-12 40 52)"/>
      <ellipse cx="80" cy="52" rx="15" ry="17" fill="#2b2a3d" transform="rotate(12 80 52)"/>
      <ellipse cx="60" cy="76" rx="20" ry="14" fill="#ffffff" opacity=".9"/>
      <ellipse cx="60" cy="70" rx="6.4" ry="4.8" fill="#2b2a3d"/>
      <path d="M60 74v3.5M60 77.5c-2.8 3.4-6.6 2.6-7.6-.5M60 77.5c2.8 3.4 6.6 2.6 7.6-.5" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
      ${eyes(id, 52, 20, 11.5)}`,
    frog: (id, c) => `
      <circle cx="30" cy="26" r="19" fill="${G(id, "bumpL")}"/>
      <circle cx="90" cy="26" r="19" fill="${G(id, "bumpR")}"/>
      <ellipse cx="60" cy="66" rx="48" ry="38" fill="${G(id, "head")}"/>
      <ellipse cx="34" cy="46" rx="18" ry="9" fill="#fff" opacity=".28" transform="rotate(-14 34 46)"/>
      <ellipse cx="60" cy="72" rx="26" ry="15" fill="${c.muzzle}" opacity=".45"/>
      <path d="M36 70q24 20 48 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
      ${eyes(id, 24, 30, 13)}${blush(id, 74)}`,
    penguin: (id, c) => `
      <ellipse cx="60" cy="58" rx="46" ry="44" fill="${G(id, "head")}"/>
      <ellipse cx="60" cy="64" rx="33" ry="34" fill="#ffffff" opacity=".95"/>
      <ellipse cx="36" cy="26" rx="15" ry="8" fill="#fff" opacity=".22" transform="rotate(-24 36 26)"/>
      <path d="M48 62c0-7 5-11 12-11s12 4 12 11-5 12-12 12-12-5-12-12z" fill="${G(id, "beak")}"/>
      <path d="M52 62h16" stroke="#c2720a" stroke-width="1.6" opacity=".6"/>
      ${eyes(id, 46, 18, 12)}${blush(id, 70)}`,
    owl: (id, c) => `
      <path d="M20 30 L16 0 L44 20 Z" fill="${G(id, "earL")}"/>
      <path d="M100 30 L104 0 L76 20 Z" fill="${G(id, "earR")}"/>
      <ellipse cx="60" cy="58" rx="47" ry="44" fill="${G(id, "head")}"/>
      <ellipse cx="36" cy="56" rx="27" ry="26" fill="${c.muzzle}" opacity=".6"/>
      <ellipse cx="84" cy="56" rx="27" ry="26" fill="${c.muzzle}" opacity=".6"/>
      <ellipse cx="36" cy="26" rx="16" ry="9" fill="#fff" opacity=".28" transform="rotate(-24 36 26)"/>
      <path d="M60 62l-8 10h16z" fill="${G(id, "beak")}"/>
      ${eyes(id, 56, 24, 18)}`,
    tiger: (id, c) => `
      <circle cx="24" cy="24" r="15" fill="${G(id, "earL")}"/>
      <circle cx="96" cy="24" r="15" fill="${G(id, "earR")}"/>
      <circle cx="24" cy="23" r="7" fill="#ffd9b8"/>
      <circle cx="96" cy="23" r="7" fill="#ffd9b8"/>
      <ellipse cx="60" cy="58" rx="46" ry="43" fill="${G(id, "head")}"/>
      <path d="M60 12c-4 6-4 12 0 18 4-6 4-12 0-18z" fill="#3b2b31" opacity=".75"/>
      <path d="M34 24c-3 5-2 10 2 14M86 24c3 5 2 10-2 14" stroke="#3b2b31" stroke-width="4" fill="none" opacity=".7" stroke-linecap="round"/>
      <path d="M12 54c6 2 10 6 12 11M108 54c-6 2-10 6-12 11" stroke="#3b2b31" stroke-width="4" fill="none" opacity=".55" stroke-linecap="round"/>
      <ellipse cx="60" cy="74" rx="24" ry="16" fill="${G(id, "muzzle")}" opacity=".95"/>
      <path d="M54 68h12l-6 5z" fill="#e2708c"/>
      <path d="M60 73c-2.8 3.6-6.8 3.2-8.4.6M60 73c2.8 3.6 6.8 3.2 8.4.6" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
      ${eyes(id, 50, 18, 13)}${blush(id, 72)}`,
    wolf: (id, c) => `
      <path d="M20 44 L22 2 L52 24 Z" fill="${G(id, "earL")}"/>
      <path d="M100 44 L98 2 L68 24 Z" fill="${G(id, "earR")}"/>
      <path d="M29 33 L31 13 L45 25 Z" fill="#5e6678" opacity=".7"/>
      <path d="M91 33 L89 13 L75 25 Z" fill="#5e6678" opacity=".7"/>
      <ellipse cx="60" cy="58" rx="46" ry="43" fill="${G(id, "head")}"/>
      <ellipse cx="37" cy="28" rx="17" ry="10" fill="#fff" opacity=".35" transform="rotate(-24 37 28)"/>
      <path d="M60 44c14 0 26 12 26 26 0 7-6 11-13 11H47c-7 0-13-4-13-11 0-14 12-26 26-26z" fill="${G(id, "muzzle")}" opacity=".95"/>
      <ellipse cx="60" cy="64" rx="6.6" ry="5" fill="#3a3f4d"/>
      <path d="M60 69v3.5M60 72.5c-2.8 3.4-6.6 2.6-7.6-.5M60 72.5c2.8 3.4 6.6 2.6 7.6-.5" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
      ${eyes(id, 50, 18, 13)}${blush(id, 70)}`,
    unicorn: (id, c) => `
      <path d="M60 -8 L70 26 L50 26 Z" fill="${G(id, "horn")}"/>
      <path d="M53 18h14M56 8h8" stroke="#d19a3c" stroke-width="1.6" opacity=".5"/>
      <ellipse cx="60" cy="58" rx="45" ry="43" fill="${G(id, "head")}"/>
      <path d="M18 48q-12 20-2 36 12-8 10-28z" fill="${G(id, "mane")}"/>
      <path d="M102 48q12 20 2 36-12-8-10-28z" fill="${G(id, "mane")}"/>
      <ellipse cx="37" cy="28" rx="17" ry="10" fill="#fff" opacity=".6" transform="rotate(-24 37 28)"/>
      <ellipse cx="60" cy="76" rx="19" ry="12" fill="${G(id, "muzzle")}" opacity=".92"/>
      <path d="M55.5 71h9l-4.5 4z" fill="#d98ac9"/>
      <path d="M56 78q4 4.5 8 0" fill="none" stroke="#c874b8" stroke-width="2" stroke-linecap="round"/>
      ${eyes(id, 54, 17, 12)}${blush(id, 72)}`,
    monster: (id, c) => `
      <path d="M24 34 L20 6 L44 24 Z" fill="${G(id, "hornL")}"/>
      <path d="M96 34 L100 6 L76 24 Z" fill="${G(id, "hornR")}"/>
      <path d="M60 14c26 0 42 16 42 38s-16 38-42 38-42-16-42-38 16-38 42-38z" fill="${G(id, "head")}"/>
      <ellipse cx="36" cy="32" rx="18" ry="10" fill="#fff" opacity=".28" transform="rotate(-20 36 32)"/>
      <ellipse cx="60" cy="84" rx="19" ry="12" fill="#33224f" opacity=".92"/>
      <path d="M48 82q12 13 24 0" fill="#ff6f91"/>
      <path d="M51 86h18" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".95"/>
      ${eyes(id, 52, 18, 14)}`,
  };

  // ------------------------------------------------------------ accessories
  // Anchored to the top of the head (y ≈ 12) and to the head's width, so they
  // sit the same way on every one of the twelve.
  const ITEMS = {
    none: () => "",
    cap: (id) => `
      <path d="M20 26q40-32 80 0v6H20z" fill="${G(id, "hatA")}"/>
      <path d="M20 26h80q3 10-7 10H27q-10 0-7-10z" fill="${G(id, "hatA")}" opacity=".9"/>
      <path d="M90 16q28 6 25 18-18 4-28-6z" fill="${G(id, "hatB")}"/>
      <circle cx="60" cy="2" r="4.6" fill="#ffe27a"/>`,
    crown: (id) => `
      <path d="M26 28 L22 -6 L47 14 L60 -12 L73 14 L98 -6 L94 28 Z" fill="${G(id, "gold")}"/>
      <circle cx="60" cy="4" r="4.2" fill="#fff8c8"/>
      <circle cx="31" cy="5" r="3" fill="#fff8c8"/>
      <circle cx="89" cy="5" r="3" fill="#fff8c8"/>`,
    party: (id) => `
      <path d="M60 -16 L84 26 H36 Z" fill="${G(id, "party")}"/>
      <path d="M47 8h26M42 19h36" stroke="#fff" stroke-width="4.2" opacity=".9"/>
      <circle cx="60" cy="-16" r="5.4" fill="#ffd66b"/>`,
    wizard: (id) => `
      <path d="M60 -30 L74 24 H46 Z" fill="${G(id, "hatA")}"/>
      <ellipse cx="60" cy="26" rx="40" ry="10" fill="${G(id, "hatA")}"/>
      <path d="M56 0l4-6 4 6-4 6z" fill="#ffe27a"/>`,
    grad: (id) => `
      <path d="M60 -14 L104 8 L60 30 L16 8 Z" fill="#3a3352"/>
      <path d="M60 -14 L104 8 L98 12 L60 -8 Z" fill="#4b4368"/>
      <path d="M60 4c-14 0-26 6-26 6s12 6 26 6 26-6 26-6-12-6-26-6z" fill="#241f3a"/>
      <path d="M96 14v20" stroke="#f5c542" stroke-width="3" stroke-linecap="round"/>
      <circle cx="96" cy="36" r="4" fill="${G(id, "gold")}"/>`,
    beanie: (id) => `
      <path d="M20 30q0-40 40-40t40 40z" fill="${G(id, "hatA")}"/>
      <rect x="16" y="26" width="88" height="15" rx="7.5" fill="${G(id, "hatB")}"/>
      <circle cx="60" cy="-10" r="7" fill="#ffe27a"/>`,
    cowboy: (id) => `
      <path d="M26 22q0-26 34-26t34 26z" fill="${G(id, "leather")}"/>
      <path d="M26 22h68q2 10-6 12H32q-8-2-6-12z" fill="#8a5524" opacity=".7"/>
      <ellipse cx="60" cy="34" rx="52" ry="12" fill="${G(id, "leather")}"/>
      <ellipse cx="60" cy="30" rx="52" ry="10" fill="${G(id, "leather")}"/>
      <path d="M20 30q40 12 80 0" fill="none" stroke="#6d4118" stroke-width="2" opacity=".6"/>`,
    headphones: (id) => `
      <path d="M6 58q0-56 54-56t54 56" fill="none" stroke="#2b2440" stroke-width="9" stroke-linecap="round"/>
      <path d="M6 58q0-56 54-56t54 56" fill="none" stroke="#f6f2ff" stroke-width="3.4" stroke-linecap="round" opacity=".4"/>
      <rect x="-4" y="50" width="22" height="38" rx="11" fill="${G(id, "hatA")}"/>
      <rect x="102" y="50" width="22" height="38" rx="11" fill="${G(id, "hatA")}"/>
      <ellipse cx="3" cy="62" rx="4.6" ry="10" fill="#fff" opacity=".3"/>`,
    shades: (id) => `
      <path d="M18 46h32q7 0 7 7v3q-1 13-19 13T19 56q-1-3-1-10z" fill="#231a32"/>
      <path d="M102 46H70q-7 0-7 7v3q1 13 19 13t19-13q1-3 1-10z" fill="#231a32"/>
      <path d="M57 50h6" stroke="#231a32" stroke-width="5"/>
      <path d="M28 52l9-4M88 52l9-4" stroke="#fff" stroke-width="2.4" opacity=".55" stroke-linecap="round"/>`,
    goggles: (id) => `
      <rect x="12" y="40" width="96" height="26" rx="13" fill="${G(id, "glass")}"/>
      <rect x="12" y="40" width="96" height="26" rx="13" fill="none" stroke="#2b2440" stroke-width="4"/>
      <path d="M60 40v26" stroke="#2b2440" stroke-width="4"/>
      <path d="M22 48h16" stroke="#fff" stroke-width="4" opacity=".7" stroke-linecap="round"/>`,
    helmet: (id) => `
      <path d="M16 32q0-44 44-44t44 44z" fill="${G(id, "helmet")}"/>
      <path d="M16 32h88q0 9-9 9H25q-9 0-9-9z" fill="${G(id, "helmetB")}"/>
      <circle cx="60" cy="-1" r="6.4" fill="#fff" opacity=".5"/>
      <rect x="8" y="38" width="104" height="4.6" rx="2.3" fill="#e6e7ef"/>`,
    scarf: (id) => `
      <path d="M22 88q38 14 76 0 5 12-9 16-29 7-58 0-14-4-9-16z" fill="${G(id, "hatA")}"/>
      <path d="M80 100l14 6-7 12-11-8z" fill="${G(id, "hatA")}"/>`,
    bowtie: (id) => `
      <path d="M60 96l-18-10v20z" fill="#4a8fd4"/>
      <path d="M60 96l18-10v20z" fill="#4a8fd4"/>
      <circle cx="60" cy="96" r="5" fill="#2f6fb0"/>`,
  };

  // ------------------------------------------------------------------ body
  function body(c, id) {
    const f = (k, col) => `url(#${id}-${k})` || c[col];
    return `
      <g class="kbody">
        <ellipse cx="60" cy="190" rx="36" ry="9" fill="url(#${id}-ground)"/>
        <rect x="49" y="148" width="12" height="32" rx="6" fill="#2f2545"/>
        <rect x="63" y="148" width="12" height="32" rx="6" fill="#2f2545"/>
        <g class="kfoot kfoot-l">
          <ellipse cx="48" cy="178" rx="16" ry="10" fill="${f("shoe", "shoe")}"/>
          <ellipse cx="47" cy="174" rx="8" ry="4" fill="#fff" opacity=".3"/>
        </g>
        <g class="kfoot kfoot-r">
          <ellipse cx="74" cy="178" rx="16" ry="10" fill="${f("shoe", "shoe")}"/>
          <ellipse cx="73" cy="174" rx="8" ry="4" fill="#fff" opacity=".3"/>
        </g>
        <path d="M60 92c-20 0-35 12-35 30 0 9 2 19 4 26 2 8 13 12 31 12s29-4 31-12c2-7 4-17 4-26 0-18-15-30-35-30z" fill="${f("body", "body")}"/>
        <ellipse cx="60" cy="124" rx="16" ry="17" fill="#fff" opacity=".13"/>
        <ellipse cx="42" cy="112" rx="7" ry="14" fill="#fff" opacity=".1" transform="rotate(-12 42 112)"/>
        <g class="karm karm-l">
          <rect x="10" y="98" width="21" height="50" rx="10.5" fill="${f("armL", "body")}"/>
          <circle cx="20" cy="152" r="16" fill="${f("mitt", "muzzle")}"/>
          <path d="M13 147h14M13 155h14" stroke="${INK}" stroke-width="1.6" opacity=".35" stroke-linecap="round"/>
        </g>
        <g class="karm karm-r">
          <rect x="89" y="98" width="21" height="50" rx="10.5" fill="${f("armR", "body")}"/>
          <circle cx="100" cy="152" r="16" fill="${f("mitt", "muzzle")}"/>
          <path d="M93 147h14M93 155h14" stroke="${INK}" stroke-width="1.6" opacity=".35" stroke-linecap="round"/>
        </g>
      </g>`;
  }

  // A player's own face on one of the drawn bodies. The photo is clipped to a
  // circle where the head would be, so the figure keeps its arms, legs, bounce
  // and hat — only the face is theirs. The phone rasterises this to a sprite and
  // uploads that, so every other screen only ever handles a small image.
  function faceSVG(characterId, accessoryId, faceUrl, options = {}) {
    const c = byId(CHARACTERS, characterId);
    const item = ITEMS[byId(ACCESSORIES, accessoryId).id] || ITEMS.none;
    const id = `kf${++uid}`;
    const clip = `kfc${++uid}`;
    const label =
      options.label === false
        ? ""
        : `${c.label} character wearing a player's face`;
    const width = options.width || 240;
    const height = Math.round((width * 200) / 120);
    return `<svg class="kchar kchar-self" width="${width}" height="${height}" viewBox="0 0 120 200" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">
      <defs>${defsFor(id, c)}<clipPath id="${clip}"><circle cx="60" cy="58" r="46"/></clipPath></defs>
      ${body(c, id)}
      <g class="khead">
        <circle cx="60" cy="58" r="47.5" fill="${c.fur}" />
        <image href="${faceUrl}" x="14" y="12" width="92" height="92" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})" />
        <circle cx="60" cy="58" r="46" fill="none" stroke="#ffffff" stroke-width="2.6" opacity=".7" />
        <g class="kitem">${item(id)}</g>
      </g>
    </svg>`;
  }

  function render(characterId, accessoryId, options = {}) {
    // A picture character: the sprite is the whole figure, so the accessory is
    // ignored and the same markup shape (a single .kchar element) comes back —
    // every screen that positions a figure keeps working untouched.
    const photo = photoOf(characterId);
    if (photo) {
      // A tile in the picker is 60 pixels tall; the rig there would be two
      // images for no gain, so the tile takes the single flat thumbnail.
      if (options.thumb && RIGS[photo.id])
        return `<img class="kchar kchar-photo is-thumb" src="/assets/3d/${photo.id}-thumb.webp" alt="${options.label === false ? "" : `${photo.label} character`}" decoding="async" draggable="false" ${options.extra || ""} />`;
      return rigSVG(photo, options);
    }
    const c = byId(CHARACTERS, characterId);
    const item = ITEMS[byId(ACCESSORIES, accessoryId).id] || ITEMS.none;
    const id = `kc${++uid}`;
    const title =
      options.label === false
        ? ""
        : `<title>${c.label}${accessoryId && accessoryId !== "none" ? " with " + byId(ACCESSORIES, accessoryId).label.toLowerCase() : ""}</title>`;
    // The accessory picker only needs the head, so it crops the same drawing.
    // The head crop leaves room above the head for the tall hats (the wizard
    // hat starts at y = -30) and stops below the chin, so an accessory tile
    // shows the hat rather than the whole figure.
    const box = options.head ? "-10 -38 140 118" : "0 0 120 200";
    // Every figure blinks on its own slow rhythm, so a crowd never blinks in
    // unison; the delays and the cycle are decided once, per instance.
    const blink = `${(2 + Math.random() * 4.5).toFixed(2)}s`;
    const cycle = `${(6.5 + Math.random() * 4).toFixed(2)}s`;
    return `<svg class="kchar${options.head ? " is-head" : ""}" style="--blink:${blink};--blinkCycle:${cycle}" viewBox="${box}" role="img" aria-label="${c.label} character" ${options.extra || ""} xmlns="http://www.w3.org/2000/svg">
      ${title}
      <defs>${defsFor(id, c)}</defs>
      ${body(c, id)}
      <g class="khead">${HEADS[c.id](id, c)}<g class="kitem">${item(id)}</g></g>
    </svg>`;
  }

  let seq = 0;
  const api = {
    CHARACTERS,
    ACCESSORIES,
    PHOTO_CHARACTERS,
    CHARACTER_IDS,
    ACCESSORY_IDS,
    PHOTO_IDS,
    photoOf,
    isPhoto: (id) => !!photoOf(id),
    rigOf: (id) => {
      const photo = photoOf(id);
      return photo ? RIGS[photo.id] || null : null;
    },
    render,
    faceSVG,
    // A picture id has no accessory of its own, so it reports its own name.
    label: (id) => (photoOf(id) || byId(CHARACTERS, id)).label,
    // Every id a join may carry: twelve drawings and the 3D cast.
    lookIds: () => [...PHOTO_IDS, ...CHARACTER_IDS],
    accessoryLabel: (id) => byId(ACCESSORIES, id).label,
    // The room hands out the next unused character, so a lobby is a crowd. The
    // 3D cast comes first: it is the only one the picker offers now.
    pick: (used = []) => {
      const freePhoto = PHOTO_IDS.filter((c) => !used.includes(c));
      if (freePhoto.length) return freePhoto[Math.floor(Math.random() * freePhoto.length)];
      const free = CHARACTER_IDS.filter((c) => !used.includes(c));
      const pool = free.length ? free : CHARACTER_IDS;
      return pool[Math.floor(Math.random() * pool.length)];
    },
    pickAccessory: () => {
      const list = ACCESSORY_IDS.slice(1);
      return list[Math.floor(Math.random() * list.length)];
    },
  };

  let uid = 0;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.QuizzesCharacters = api;
})();
