# Quizzes 0.9.0-rc.9 — verification record

**October 22, 2026 · Test candidate · Not deployed by assistant**

## Included change: wrong-buzz negative marking, chosen per question

Every buzzer question now has a **Wrong buzz penalty** setting, so you decide on the night
what a wrong answer costs:

| Setting | Effect on a 1,000-point buzzer question |
|---|---|
| **No penalty** (default) | nothing is deducted — the host simply moves to the next name |
| **Lose 25%** | −250 points |
| **Lose 50%** | −500 points |
| **Lose 100%** | −1,000 points |

The penalty is a share of **that question's** points, so a small warm-up question costs
less than a final. Only the player who buzzed and answered wrong is charged; everyone else
is untouched.

Per your choice, **penalties can take a total below zero** — a player who buzzes wrong
repeatedly can finish a round on a negative score, and that is what the leaderboard shows.

### Where it appears

- **Editor / Studio** — a *Wrong buzz penalty* dropdown under the expected answer, for
  buzzer questions only.
- **Host screen** — each queue row shows the result: `Wrong −250` or `Correct +850`.
- **Projector** — the same figure next to each name.
- **Phone** — *“Wrong answer — you lost 250 points.”* (or, with no penalty,
  *“Wrong answer — listen for the next name.”*)

### Assigned (self-paced) quizzes

A buzzer question in an assigned quiz is graded as a type-the-answer question with no
host, so **no penalty is ever applied there** — a wrong typed answer simply scores zero.
This is covered by a test.

### Effect on quizzes that are already saved or running

**None.** Existing buzzer questions keep working exactly as before: the new field is
absent, which means *no penalty*. Changing the setting only affects rounds you host
afterwards, and it does not rewrite any stored quiz, publication, attempt or report.

## Executed verification

| Check | Result |
|---|---|
| Node 22 application suite (82 subtests) | **82 passed, 0 failed** |
| New penalty suite (6 subtests) | **6 passed** |
| TLS/CA regression suite | **5 passed, 0 failed** |
| Chromium end-to-end workflow | **1 passed**, about 1.4 minutes |

The penalty suite proves: no penalty leaves the score at 0; 25% costs 250 of 1,000; 50%
costs 500; 100% costs the full 1,000 and accumulates across questions to −2,000 (negative
totals are reported on the leaderboard); a penalty value that is not offered is refused
when saving; and an assigned buzzer question never penalises.

## Files changed since rc.8

`server.js` (validates and applies the penalty, reports it on the queue), `app.js`
(editor dropdown, host queue and phone feedback), `display.js` (projector), `styles.css`
(points styling), `studio-server.js` (draft validation), `tests/buzzer-penalty.test.js`
(new), `package.json`, the three HTML asset version strings, plus this document.

Everything from rc.4 through rc.8 — event-capacity hardening, image optimisation,
participant-disclaimer removal, the buzzer round, Design D on assigned screens, and the
clip Play/Stop buttons — is included in this package.
