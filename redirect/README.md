# One permanent link for players (free static redirect)

Players keep **one** URL — the one you read out at the start — even when a site
goes down. This page checks both of your deployments and forwards to whichever
is awake. It is a single static file with no server and no cost.

## What it does

- Opens in the player's browser and asks each site's `/healthz` whether it is up.
- Sends the player to the first one that answers, keeping the path and the query
  string: `/play?quiz=…`, `/join?code=…`, `/display` all still work.
- Remembers the site that worked last time, so the normal case does not wait.
- If neither answers, says so plainly and offers **Try again**.

## Set it up (Cloudflare Pages — free)

1. Edit `redirect/index.html` and replace the two URLs in `SITES` with your own:
   - first: your primary deployment (for example the Render URL),
   - second: the backup deployment (Northflank, or your second Render service).
   Remove the `https://`-only placeholder line — both entries must be real.
2. Go to <https://dash.cloudflare.com> → **Workers & Pages** → **Create** →
   **Pages** → **Upload assets**.
3. Name the project, for example `quizzes-link`.
4. Drag the **contents** of this `redirect` folder (just `index.html`) into the
   upload box, then **Deploy site**.
5. Cloudflare gives you a URL like `https://quizzes-link.pages.dev`. That is your
   permanent player link. Print it, put it on the projector's join slide, or keep
   using the QR code with it.

Netlify, GitHub Pages, or any static host work the same way: publish this folder.

## Using it

- Players and the projector open the permanent link exactly as before.
- The host opens the same link to reach the host screen; the redirect carries the
  path across, so `…/` still lands on the sign-in page.
- To force a specific site for one session, add `?site=render` or `?site=northflank`
  (any fragment of the URL works).

## Limits worth knowing

- The redirect only helps the **browser**. It cannot move players already playing
  on a site that has died; they reopen the permanent link and the room is waiting
  for them on the other site — see `FAILOVER.md`.
- A site that is awake but unhealthy (for example a database problem) will still
  answer `/healthz`; the redirect cannot detect that. Use the second site's URL
  directly with `?site=` in that case.
