# Quizzes 0.9.0-rc.14 — verification record

**October 25, 2026 · Test candidate · Not deployed by assistant**

## Included change: a saved quiz can be moved to another account

Until now a quiz belonged to the account that made it. Copying one to a second
account — or to a second installation — meant rebuilding it by hand, pictures and
all. Now it is one file.

### Download

Every card in **My quizzes** gains a small **Download** action. It writes a single
`.json` file containing:

- the quiz exactly as saved — rounds, questions, answer choices, correct answers,
  timers, points, private host notes, buzzer alternatives and penalties,
- every picture and sound the quiz uses, embedded in the file,
- nothing about the account it came from: no logins, no links, no results.

### Move a quiz

**My quizzes → ⇄ Move a quiz** opens a file picker. Choose the downloaded file and
the quiz is rebuilt in the current account:

- the pictures are stored as fresh files owned by the receiving account, so the
  original account can delete its copy without breaking anything,
- the quiz is re-validated exactly as if it had been typed in by hand,
- the host is told what arrived and how many attachments came with it,
- a file that is not a quiz is refused, and a picture that fails to cross is
  reported rather than silently dropped.

It works the same way **between two accounts on one site** and **between two
separate installations** — the second Render deployment with its own Supabase, for
example. Nothing is shared between the two: the file is the only thing that moves.

### What does not travel

Assigned-quiz links and their attempts, live session reports, and the recovery
bin all stay with the original account. The file carries the quiz itself, which is
what you would otherwise retype.

### Limits

One file may carry up to 64 MB and 400 attachments, which covers the largest quiz
the editor allows (200 questions) with room to spare.

## Effect on data already stored

No schema change. No row rewritten. A download reads a quiz and its media without
modifying anything; an import creates new rows owned by the receiving account and
touches nothing that already exists.

## Executed verification

| Check | Result |
|---|---|
| Node 22 application suite | **116 passed, 0 failed** (was 112) |
| New quiz-file suite | **4 passed** |
| Two-installation interface walkthrough (`tools/ui-quiz-move-check.cjs`) | **8/8** |
| Permanent-link page | **3/3** |

The new suite proves: the bundle carries the quiz and its picture, and reports
nothing missing; an unsigned-in visitor cannot export another account's quiz; a
second, separate installation imports it and every detail survives — round order,
options, correct answers, accepted alternatives, timers, points, private notes and
buzzer penalty; the picture becomes a new file that opens on the receiving site;
and importing the same file twice produces two independent quizzes.

The interface walkthrough does the same through the real screens: Download on a
card, then Move a quiz in a second installation, ending with the quiz listed in the
receiving account and no browser errors.

## Files changed since rc.13

`server.js` (quiz bundle, media adoption, export and import routes), `app.js`
(Download, Move a quiz, import handling), `index.html` (Move a quiz control and
file input), `tests/quiz-file.test.js` (new), `package.json`, the three HTML asset
version strings, and this document.
