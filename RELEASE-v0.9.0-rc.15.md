# Quizzes 0.9.0-rc.15 — verification record

**October 25, 2026 · Test candidate · Not deployed by assistant**

## Included change: the two failures that really end an event

rc.11 made a room survive the *server* going away. Two practical failures were
still not covered, and both end an evening rather than inconvenience it.

### A host who loses their browser could not get back in

The proof that you are the host of a room lived in that browser tab. Laptop dies,
tab closed, browser crashes, or you walk to another machine — the token is gone,
and the room would close itself five minutes later with a report.

Now the **account that owns the room** can take it back from any signed-in
browser:

- **My quizzes** shows a strip while a room is still running: *"“Antakshari
  night” is still running on code QZ123ABC — at question 4 of 12, 8 players."*
- **Rejoin as host** puts you back in control: same code, same question, same
  scores, same players.
- A fresh room token is minted and the old one stops working, so a laptop that
  wakes up later cannot silently take the room back.

Only that account can do this. Anyone not signed in gets *"Please sign in as a
host."*; a signed-in account that does not own the room gets *"That game belongs
to another account."*

### A player whose phone died lost their seat

Their score stayed behind on a seat they could no longer reach, and retyping
their name was refused with *"That nickname is taken."*

A returning player now types the **same nickname** and is given their own seat
back — score, place and answers intact. The host sees *"Rahul rejoined and took
back their seat on 2,400 points."* so nothing happens invisibly.

A seat that is **still connected** is never taken over: a second person typing a
live name is refused, exactly as before.

### The runbook

`FAILOVER.md` was rewritten as a full operational guide: six failure cases in the
order you are likely to meet them, what the screen tells you, what to say to the
room, a table of what survives what, and the one thing never to do (start a new
game with a new code).

## Effect on data already stored

No schema change. No row rewritten. Existing rooms, quizzes, assignments and
reports are untouched; a room simply gains a second, account-based way back in.

## Executed verification

| Check | Result |
|---|---|
| Node 22 application suite | **125 passed, 0 failed** (was 116) |
| New reclaim suite | **9 passed** |
| Chromium end-to-end workflow | **1 passed**, about 1.3 minutes |
| Lost-browser walkthrough in a real browser (`tools/ui-host-reclaim-check.cjs`) | **6/6** |

The reclaim suite proves: the owning account finds its room and takes it back on
the same question; the replaced token no longer works; a visitor who is not
signed in can neither list nor claim a room; a player whose tab vanished reclaims
their own seat and answer, and the host is told; a seat in use cannot be taken by
someone typing the same name; the ordinary reload path still works with the same
token; and a finished room is offered to nobody.

The browser walkthrough does it for real: starts a room, destroys the entire
browser profile (so no stored token can survive), signs in again in a fresh
profile, finds the strip naming the same code, and rejoins.

## Files changed since rc.14

`server.js` (claim route, room listing, wider seat reclaim, host notice),
`app.js` (running-room strip, rejoin, notice), `index.html` and `styles.css`
(strip), `tests/live-reclaim.test.js` (new), `FAILOVER.md` (rewritten),
`package.json`, the three HTML asset version strings, and this document.
