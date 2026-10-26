"use strict";
// Original, code-drawn characters for players to choose when they join.
//
// Nothing here is copied from any other quiz product: every shape is built from
// plain SVG primitives in this file, so the app carries no third-party artwork
// and no image downloads at all. A player picks a character (the creature) and
// an accessory (what they wear), and the same drawing is used on their own phone
// and in the lobby.
//
// Anatomy, for anyone editing this later:
//   body  — one shared cartoon body: torso, two swinging arms with mitts, legs
//           and shoes. It is tinted by the character's `body` colour.
//   head  — per character: ears, muzzle, eyes, mouth.
//   item  — per accessory, drawn last so it sits on top of the head or face.
(() => {
  const INK = "#3a2f4a";

  // Every character: id, label, fur, body, and a few feature flags.
  const CHARACTERS = [
    { id: "bear", label: "Bear", fur: "#c08a5a", light: "#e8c9a4", body: "#f2a13c" },
    { id: "cat", label: "Cat", fur: "#f6a04d", light: "#ffe0c0", body: "#3fb8a6" },
    { id: "fox", label: "Fox", fur: "#f2723a", light: "#fff2e6", body: "#2f7fd1" },
    { id: "bunny", label: "Bunny", fur: "#d7d3e0", light: "#ffffff", body: "#e5709a" },
    { id: "panda", label: "Panda", fur: "#ffffff", light: "#ffffff", body: "#4b4a63" },
    { id: "frog", label: "Frog", fur: "#79c34a", light: "#d9f2b6", body: "#8a5cf0" },
    { id: "penguin", label: "Penguin", fur: "#3b4a6b", light: "#ffffff", body: "#f2b53a" },
    { id: "owl", label: "Owl", fur: "#b07d52", light: "#f0d9b8", body: "#7c5cff" },
    { id: "tiger", label: "Tiger", fur: "#f5a13a", light: "#fff4e3", body: "#e2643c" },
    { id: "wolf", label: "Wolf", fur: "#9aa3b5", light: "#eef1f7", body: "#4a8fd4" },
    { id: "unicorn", label: "Unicorn", fur: "#fdf3f7", light: "#ffffff", body: "#e46ad0" },
    { id: "monster", label: "Monster", fur: "#a06ad6", light: "#e3c7f7", body: "#59c07b" },
  ];

  // Accessories, drawn on top of the head. Each is a small SVG fragment.
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

  const ids = (list) => list.map((x) => x.id);
  const CHARACTER_IDS = ids(CHARACTERS);
  const ACCESSORY_IDS = ids(ACCESSORIES);
  const byId = (list, id) => list.find((x) => x.id === id) || list[0];

  // --- heads ---------------------------------------------------------------
  // Coordinates live in a 100 × 100 head box; the body is drawn separately.
  function eyes(x1 = 38, x2 = 62, y = 46, r = 7) {
    return `
      <g class="keyes">
        <circle cx="${x1}" cy="${y}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="1.4"/>
        <circle cx="${x2}" cy="${y}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="1.4"/>
        <circle class="kpupil kpupil-a" cx="${x1}" cy="${y + 0.5}" r="${r * 0.5}" fill="${INK}"/>
        <circle class="kpupil kpupil-b" cx="${x2}" cy="${y + 0.5}" r="${r * 0.5}" fill="${INK}"/>
      </g>
      <g class="kblink">
        <rect x="${x1 - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" fill="#fff" opacity="0"/>
      </g>`;
  }
  function lids(x1 = 38, x2 = 62, y = 46, r = 7) {
    return `
      <g class="klids">
        <rect class="klid klid-a" x="${x1 - r}" y="${y - r - 0.6}" width="${r * 2}" height="${r * 2 + 1.2}" rx="${r}" fill="inherit"/>
        <rect class="klid klid-b" x="${x2 - r}" y="${y - r - 0.6}" width="${r * 2}" height="${r * 2 + 1.2}" rx="${r}" fill="inherit"/>
      </g>`;
  }

  const HEADS = {
    bear: (c) => `
      <circle cx="26" cy="26" r="13" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <circle cx="74" cy="26" r="13" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <circle cx="26" cy="26" r="6" fill="${c.light}"/>
      <circle cx="74" cy="26" r="6" fill="${c.light}"/>
      <circle cx="50" cy="52" r="32" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <ellipse cx="50" cy="66" rx="17" ry="12" fill="${c.light}"/>
      <ellipse cx="50" cy="60" rx="5.5" ry="4" fill="${INK}"/>
      <path d="M50 64v4M50 68c-2.5 3-6 3-7.5.5M50 68c2.5 3 6 3 7.5.5" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      ${eyes(39, 61, 48)}`,
    cat: (c) => `
      <path d="M20 30 26 6l16 14z" fill="${c.fur}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M80 30 74 6 58 20z" fill="${c.fur}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M26 22l3-9 7 6z" fill="#ffc6d4"/>
      <path d="M74 22l-3-9-7 6z" fill="#ffc6d4"/>
      <circle cx="50" cy="54" r="31" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <ellipse cx="50" cy="66" rx="15" ry="10" fill="${c.light}"/>
      <path d="M46 60h8l-4 4z" fill="#e2708c"/>
      <path d="M50 64c-2 3-5.5 3-7 1M50 64c2 3 5.5 3 7 1" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M14 56h12M14 62h12M74 56h12M74 62h12" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" opacity=".55"/>
      ${eyes(38, 62, 48, 7)}`,
    fox: (c) => `
      <path d="M18 32 24 4l18 16z" fill="${c.fur}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M82 32 76 4 58 20z" fill="${c.fur}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M24 24l2-11 9 8z" fill="#ffe6d9"/>
      <path d="M76 24l-2-11-9 8z" fill="#ffe6d9"/>
      <circle cx="50" cy="54" r="30" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <path d="M50 44c10 0 20 8 20 18 0 8-9 16-20 16s-20-8-20-16c0-10 10-18 20-18z" fill="${c.light}"/>
      <ellipse cx="50" cy="62" rx="5.5" ry="4" fill="${INK}"/>
      <path d="M50 66v3M50 69c-2.5 3-6 3-7.5.5M50 69c2.5 3 6 3 7.5.5" stroke="${INK}" stroke-width="1.7" fill="none" stroke-linecap="round"/>
      ${eyes(38, 62, 50, 7)}`,
    bunny: (c) => `
      <ellipse cx="36" cy="10" rx="9" ry="22" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <ellipse cx="64" cy="10" rx="9" ry="22" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <ellipse cx="36" cy="10" rx="4.5" ry="16" fill="#ffc9d8"/>
      <ellipse cx="64" cy="10" rx="4.5" ry="16" fill="#ffc9d8"/>
      <circle cx="50" cy="56" r="30" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <ellipse cx="50" cy="66" rx="14" ry="9" fill="${c.light}"/>
      <path d="M47 60h6l-3 4z" fill="#e2708c"/>
      <path d="M50 64v3M50 67c-2 2.5-5 2.5-6.5.5M50 67c2 2.5 5 2.5 6.5.5" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <rect x="42" y="70" width="7" height="7" rx="1" fill="#fff" stroke="${INK}" stroke-width="1.2"/>
      ${eyes(38, 62, 48, 7)}`,
    panda: (c) => `
      <circle cx="24" cy="24" r="12" fill="${INK}"/>
      <circle cx="76" cy="24" r="12" fill="${INK}"/>
      <circle cx="50" cy="52" r="32" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <ellipse cx="36" cy="48" rx="11" ry="13" fill="${INK}" transform="rotate(-14 36 48)"/>
      <ellipse cx="64" cy="48" rx="11" ry="13" fill="${INK}" transform="rotate(14 64 48)"/>
      <circle cx="36" cy="48" r="5" fill="#fff"/>
      <circle cx="64" cy="48" r="5" fill="#fff"/>
      <circle cx="36" cy="48" r="2.6" fill="${INK}"/>
      <circle cx="64" cy="48" r="2.6" fill="${INK}"/>
      <ellipse cx="50" cy="62" rx="5.5" ry="4" fill="${INK}"/>
      <path d="M50 66v3M50 69c-2.5 3-6 3-7.5.5M50 69c2.5 3 6 3 7.5.5" stroke="${INK}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`,
    frog: (c) => `
      <circle cx="30" cy="26" r="14" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <circle cx="70" cy="26" r="14" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <circle cx="30" cy="26" r="8" fill="#fff"/>
      <circle cx="70" cy="26" r="8" fill="#fff"/>
      <circle cx="30" cy="26" r="4" fill="${INK}"/>
      <circle cx="70" cy="26" r="4" fill="${INK}"/>
      <path d="M18 52c0-18 14-28 32-28s32 10 32 28c0 20-14 32-32 32S18 72 18 52z" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <ellipse cx="50" cy="70" rx="20" ry="11" fill="${c.light}"/>
      <path d="M32 64c5 8 31 8 36 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="50" cy="52" r="2" fill="${INK}"/>
      <circle cx="42" cy="49" r="1.6" fill="${INK}"/>
      <circle cx="58" cy="49" r="1.6" fill="${INK}"/>`,
    penguin: (c) => `
      <ellipse cx="50" cy="54" rx="31" ry="32" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <path d="M50 26c14 0 24 12 24 26 0 16-11 28-24 28S26 68 26 52c0-14 10-26 24-26z" fill="${c.light}"/>
      <ellipse cx="50" cy="58" rx="7" ry="5.5" fill="#f6a13a"/>
      ${eyes(39, 61, 44, 6.5)}`,
    owl: (c) => `
      <path d="M22 22l6-14 10 12z" fill="${c.fur}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M78 22l-6-14-10 12z" fill="${c.fur}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M18 54c0-20 14-32 32-32s32 12 32 32c0 20-14 30-32 30S18 74 18 54z" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <circle cx="37" cy="48" r="14" fill="${c.light}" stroke="${INK}" stroke-width="1.4"/>
      <circle cx="63" cy="48" r="14" fill="${c.light}" stroke="${INK}" stroke-width="1.4"/>
      <circle cx="37" cy="48" r="7" fill="#f2b53a"/>
      <circle cx="63" cy="48" r="7" fill="#f2b53a"/>
      <circle cx="37" cy="48" r="3.4" fill="${INK}"/>
      <circle cx="63" cy="48" r="3.4" fill="${INK}"/>
      <path d="M45 62l5-6 5 6-5 5z" fill="#f2b53a" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M30 80q20 8 40 0" stroke="${c.light}" stroke-width="2" fill="none" opacity=".8"/>`,
    tiger: (c) => `
      <circle cx="24" cy="28" r="11" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <circle cx="76" cy="28" r="11" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <circle cx="50" cy="54" r="31" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <path d="M32 28l-6 8M68 28l6 8M26 44l-8 2M74 44l8 2" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="50" cy="64" rx="17" ry="12" fill="${c.light}"/>
      <path d="M46 58h8l-4 4z" fill="#e2708c"/>
      <path d="M50 62c-2 3-5.5 3-7 1M50 62c2 3 5.5 3 7 1" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M18 52h12M18 58h12M70 52h12M70 58h12" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
      ${eyes(38, 62, 48, 7)}`,
    wolf: (c) => `
      <path d="M22 30 24 6l16 14z" fill="${c.fur}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M78 30 76 6 60 20z" fill="${c.fur}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="50" cy="54" r="30" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <path d="M50 46c9 0 16 7 16 15 0 9-7 15-16 15s-16-6-16-15c0-8 7-15 16-15z" fill="${c.light}"/>
      <path d="M38 30c4-4 8-2 8 2M62 30c-4-4-8-2-8 2" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <ellipse cx="50" cy="60" rx="5" ry="3.6" fill="${INK}"/>
      <path d="M50 64v3M50 67c-2 2.5-5 2.5-6.5.5M50 67c2 2.5 5 2.5 6.5.5" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      ${eyes(38, 62, 48, 6.5)}`,
    unicorn: (c) => `
      <path d="M50 0l7 20H43z" fill="#f7c948" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M46 15h8" stroke="${INK}" stroke-width="1.2"/>
      <circle cx="26" cy="30" r="9" fill="${c.fur}" stroke="${INK}" stroke-width="1.5"/>
      <circle cx="74" cy="30" r="9" fill="${c.fur}" stroke="${INK}" stroke-width="1.5"/>
      <circle cx="50" cy="54" r="31" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <path d="M22 42c-8 6-12 18-8 28 2-8 8-12 14-12z" fill="#f279c8"/>
      <path d="M78 42c8 6 12 18 8 28-2-8-8-12-14-12z" fill="#8f7bf0"/>
      <ellipse cx="50" cy="70" rx="15" ry="9" fill="#ffe3f1"/>
      <ellipse cx="46" cy="64" rx="2.6" ry="1.8" fill="${INK}"/>
      <ellipse cx="54" cy="64" rx="2.6" ry="1.8" fill="${INK}"/>
      <path d="M45 72c2.5 3 7.5 3 10 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      ${eyes(36, 64, 48, 7)}`,
    monster: (c) => `
      <path d="M26 26c-6-6-8-14-4-18 6 2 12 6 16 12z" fill="#7b4bb3" stroke="${INK}" stroke-width="1.5"/>
      <path d="M74 26c6-6 8-14 4-18-6 2-12 6-16 12z" fill="#7b4bb3" stroke="${INK}" stroke-width="1.5"/>
      <circle cx="50" cy="54" r="32" fill="${c.fur}" stroke="${INK}" stroke-width="1.6"/>
      <path d="M30 34c6-6 14-6 18 0M70 34c-6-6-14-6-18 0" stroke="#7b4bb3" stroke-width="4" fill="none" stroke-linecap="round"/>
      <ellipse cx="50" cy="70" rx="18" ry="12" fill="#4b2f6b"/>
      <path d="M34 66l4 6 4-6 4 6 4-6 4 6 4-6 4 6" stroke="#fff" stroke-width="0" fill="none"/>
      <path d="M38 68h24" stroke="#fff" stroke-width="3" stroke-dasharray="0" fill="none"/>
      <circle cx="40" cy="46" r="8" fill="#fff"/>
      <circle cx="60" cy="46" r="8" fill="#fff"/>
      <circle cx="41" cy="47" r="3.6" fill="${INK}"/>
      <circle cx="59" cy="47" r="3.6" fill="${INK}"/>`,
  };

  // --- accessories ---------------------------------------------------------
  const ITEMS = {
    none: () => "",
    cap: () => `
      <path d="M24 30c0-14 12-22 26-22s26 8 26 22z" fill="#6c4bd8" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M74 30h16c4 0 6 4 2 6-8 4-14 2-18 2z" fill="#5738b8" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="50" cy="14" r="3" fill="#ffd85e"/>`,
    crown: () => `
      <path d="M26 26 30 6l10 10 10-14 10 14 10-10 4 20z" fill="#f7c948" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
      <rect x="26" y="24" width="48" height="7" rx="3" fill="#e8b02c" stroke="${INK}" stroke-width="1.2"/>
      <circle cx="50" cy="12" r="2.6" fill="#e14b6a"/>`,
    party: () => `
      <path d="M50 0l20 34H30z" fill="#f2708c" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M38 22h24M34 30h32" stroke="#fff" stroke-width="3"/>
      <circle cx="50" cy="2" r="5" fill="#59c07b" stroke="${INK}" stroke-width="1.2"/>`,
    wizard: () => `
      <path d="M52 -2 76 30H28z" fill="#7b4bb3" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M18 30h64c4 0 6 5 1 7-22 8-44 8-66 0-5-2-3-7 1-7z" fill="#6c3fa3" stroke="${INK}" stroke-width="1.4"/>
      <circle cx="44" cy="16" r="2.4" fill="#ffd85e"/>
      <circle cx="58" cy="24" r="1.8" fill="#ffd85e"/>`,
    grad: () => `
      <path d="M50 2 96 20 50 38 4 20z" fill="#3a2f4a" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M26 26v12c0 6 12 10 24 10s24-4 24-10V26" fill="#2c2438"/>
      <path d="M88 22v16" stroke="#f7c948" stroke-width="2.4"/>
      <circle cx="88" cy="40" r="3.4" fill="#f7c948"/>`,
    beanie: () => `
      <path d="M22 30c0-16 12-26 28-26s28 10 28 26z" fill="#2fb8a6" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
      <rect x="20" y="28" width="60" height="10" rx="5" fill="#1f9b8c" stroke="${INK}" stroke-width="1.3"/>
      <circle cx="50" cy="4" r="6" fill="#f7f2ff" stroke="${INK}" stroke-width="1.3"/>`,
    cowboy: () => `
      <path d="M30 28c0-12 8-20 20-20s20 8 20 20z" fill="#c98a4b" stroke="${INK}" stroke-width="1.5"/>
      <path d="M8 28c14 8 70 8 84 0 6 8-4 14-42 14S2 36 8 28z" fill="#b07338" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
      <rect x="28" y="26" width="44" height="5" rx="2.5" fill="#7a4a22"/>`,
    headphones: () => `
      <path d="M18 40c0-20 14-32 32-32s32 12 32 32" fill="none" stroke="#2c2438" stroke-width="6" stroke-linecap="round"/>
      <rect x="6" y="34" width="16" height="24" rx="8" fill="#3a2f4a" stroke="${INK}" stroke-width="1.4"/>
      <rect x="78" y="34" width="16" height="24" rx="8" fill="#3a2f4a" stroke="${INK}" stroke-width="1.4"/>
      <rect x="11" y="40" width="6" height="12" rx="3" fill="#59c07b"/>`,
    shades: () => `
      <path d="M18 42h30c2 0 2 2 2 4 0 8-6 14-14 14s-16-6-16-14c0-2 0-4-2-4z" fill="#2c2438" opacity=".92"/>
      <path d="M52 42h30c-2 0-2 2-2 4 0 8-8 14-16 14s-12-6-12-14c0-2 0-4-2-4z" fill="#2c2438" opacity=".92"/>
      <path d="M28 44h12M60 44h12" stroke="#fff" stroke-width="2" opacity=".45" stroke-linecap="round"/>`,
    goggles: () => `
      <rect x="12" y="34" width="76" height="24" rx="12" fill="#9fd8ff" stroke="#2c2438" stroke-width="3"/>
      <rect x="12" y="34" width="76" height="24" rx="12" fill="#9fd8ff" opacity=".7"/>
      <path d="M50 34v24" stroke="#2c2438" stroke-width="3"/>
      <path d="M20 40h14" stroke="#fff" stroke-width="3" opacity=".7" stroke-linecap="round"/>`,
    helmet: () => `
      <path d="M18 40c0-20 14-34 32-34s32 14 32 34z" fill="#f2a13c" stroke="${INK}" stroke-width="1.6"/>
      <path d="M18 40h64c0 6-4 10-10 10H28c-6 0-10-4-10-10z" fill="#dd8c2a" stroke="${INK}" stroke-width="1.4"/>
      <path d="M38 30c0-10 5-16 12-16s12 6 12 16" fill="none" stroke="${INK}" stroke-width="2" opacity=".4"/>
      <rect x="18" y="46" width="64" height="5" rx="2.5" fill="#c9c3d6" stroke="${INK}" stroke-width="1.2"/>
      <path d="M28 51v12M72 51v12M40 51v14M60 51v14" stroke="#c9c3d6" stroke-width="3" stroke-linecap="round"/>`,
    scarf: () => `
      <path d="M26 84c10 6 38 6 48 0 4 8-2 12-24 12s-28-4-24-12z" fill="#e14b6a" stroke="${INK}" stroke-width="1.4"/>
      <path d="M70 88l10 6-6 8-8-6z" fill="#c93a58" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>`,
    bowtie: () => `
      <path d="M50 84l-16-9v18z" fill="#4a8fd4" stroke="${INK}" stroke-width="1.3"/>
      <path d="M50 84l16-9v18z" fill="#4a8fd4" stroke="${INK}" stroke-width="1.3"/>
      <circle cx="50" cy="84" r="4.4" fill="#2f6fb0" stroke="${INK}" stroke-width="1.2"/>`,
  };

  // --- body ---------------------------------------------------------------
  // One shared cartoon body, so 12 characters cost 12 head drawings, not 12
  // full figures. Shoulders are at y 106; the arms pivot there, the legs are
  // fixed, and the shoes sit on the shadow.
  function body(c) {
    const tint = c.body;
    return `
      <g class="kbody">
        <ellipse cx="50" cy="194" rx="30" ry="5.5" fill="#000" opacity=".13"/>
        <rect x="40" y="150" width="9" height="33" rx="4.5" fill="${INK}"/>
        <rect x="51" y="150" width="9" height="33" rx="4.5" fill="${INK}"/>
        <g class="kfoot kfoot-l">
          <ellipse cx="44" cy="185" rx="13" ry="7" fill="#e14b6a" stroke="${INK}" stroke-width="1.4"/>
        </g>
        <g class="kfoot kfoot-r">
          <ellipse cx="56" cy="185" rx="13" ry="7" fill="#e14b6a" stroke="${INK}" stroke-width="1.4"/>
        </g>
        <path d="M50 96c-13 0-26 8-26 22v26c0 10 6 16 26 16s26-6 26-16v-26c0-14-13-22-26-22z"
              fill="${tint}" stroke="${INK}" stroke-width="1.7"/>
        <ellipse cx="50" cy="137" rx="15" ry="17" fill="${c.light}" opacity=".32"/>
        <g class="karm karm-l">
          <rect x="12" y="104" width="14" height="42" rx="7" fill="${tint}" stroke="${INK}" stroke-width="1.5"/>
          <circle cx="19" cy="150" r="11" fill="#fff" stroke="${INK}" stroke-width="1.5"/>
          <path d="M13.5 147.5h11M13.5 152.5h11" stroke="${INK}" stroke-width="1.1" opacity=".45"/>
        </g>
        <g class="karm karm-r">
          <rect x="74" y="104" width="14" height="42" rx="7" fill="${tint}" stroke="${INK}" stroke-width="1.5"/>
          <circle cx="81" cy="150" r="11" fill="#fff" stroke="${INK}" stroke-width="1.5"/>
          <path d="M75.5 147.5h11M75.5 152.5h11" stroke="${INK}" stroke-width="1.1" opacity=".45"/>
        </g>
      </g>`;
  }

  function render(characterId, accessoryId, options = {}) {
    const c = byId(CHARACTERS, characterId);
    const item = ITEMS[byId(ACCESSORIES, accessoryId).id] || ITEMS.none;
    const title =
      options.label === false
        ? ""
        : `<title>${c.label}${accessoryId && accessoryId !== "none" ? " with " + byId(ACCESSORIES, accessoryId).label.toLowerCase() : ""}</title>`;
    // A single 100 × 200 viewBox holds the head (top) and the body (bottom).
    // The head is scaled up about its own centre and dropped onto the
    // shoulders, so all twelve heads keep their original 100 × 100 geometry.
    // The accessory grid only needs the head, so it can crop the same drawing.
    const box = options.head ? "6 0 88 100" : "0 0 100 200";
    return `<svg class="kchar${options.head ? " is-head" : ""}" viewBox="${box}" role="img" aria-label="${c.label} character" ${options.extra || ""}>
      ${title}
      ${body(c)}
      <g transform="translate(0,10) translate(50,52) scale(1.16) translate(-50,-52)">
        <g class="khead">
          ${HEADS[c.id](c)}
          <g class="kitem">${item()}</g>
        </g>
      </g>
    </svg>`;
  }

  const api = {
    CHARACTERS,
    ACCESSORIES,
    CHARACTER_IDS,
    ACCESSORY_IDS,
    render,
    label: (id) => byId(CHARACTERS, id).label,
    accessoryLabel: (id) => byId(ACCESSORIES, id).label,
    pick: () =>
      CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id,
    pickAccessory: () => {
      const list = ACCESSORIES.slice(1);
      return list[Math.floor(Math.random() * list.length)].id;
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.QuizzesCharacters = api;
})();
