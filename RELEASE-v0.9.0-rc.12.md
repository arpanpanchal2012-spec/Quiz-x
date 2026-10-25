# Quizzes 0.9.0-rc.12 — verification record

**October 25, 2026 · Test candidate · Not deployed by assistant**

## Included change: writing a full quiz is no longer interrupted

Adding a picture to each question is normal work, but the server allowed only
**60 file uploads per hour per account**. A host writing a 75-question quiz with
one picture per question ran into the ceiling part way through and saw
*"Too many attempts. Please try again later."* — with no indication of what the
limit was, or that the pictures already added were safe.

### What changed

- The allowance is now **400 files per hour**, which covers a full 200-question
  quiz, its soundtrack, and replacements in a single sitting.
- The refusal, if it is ever reached, says what happened and when it clears:
  *"You have added 400 files in the last hour. You can add images again in about
  N minutes; quizzes and their pictures already added are safe."*
- Operators can adjust it with **`UPLOAD_PER_HOUR`** (20–2000) without a code
  change.

Nothing else about uploads changed: same 10 MB limit, same format checks, same
in-browser re-encoding before the file is sent, same per-account ownership.

## Why it happened at around 57 pictures

The allowance counted **every** file the account sent in a rolling hour — the
question pictures themselves, the soundtrack, and any picture that was replaced
or re-sent. The counter starts at the account's first upload and expires an hour
later. It was also held in memory, which is why restarting the site cleared it.

## Effect on data already stored

None. No schema change, no migration, no stored row touched. Pictures already
uploaded stay exactly where they are; this release only changes how many more may
be added in an hour.

## Executed verification

| Check | Result |
|---|---|
| Node 22 application suite | **106 passed, 0 failed** (was 103) |
| New upload-allowance suite | **3 passed** |
| TLS/CA regression suite | passed |

The new suite proves the shipped allowance covers one picture per question for
the largest quiz the editor offers, that a deliberately small allowance still
refuses the next upload, and that the refusal names the limit, says roughly when
it clears, and reassures the host that saved pictures are safe. It also uploads
**75 pictures and then five more** against the shipped default — the exact
sequence that failed — and all 80 succeed.

## Files changed since rc.11

`server.js` (named upload allowance, adjustable ceiling, specific refusal
message), `tests/upload-limit.test.js` (new), `package.json`, the three HTML asset
version strings, and this document.
