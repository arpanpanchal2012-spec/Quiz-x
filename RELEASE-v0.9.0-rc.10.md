# Quizzes 0.9.0-rc.10 — verification record

**October 24, 2026 · Test candidate · Not deployed by assistant**

## Included change: deleted assignments can be reactivated

An assignment that is deleted by mistake is no longer gone. Deleting now moves it to
**Recently deleted**, where it stays for **seven days** with every participant result
intact. Restoring it brings back **the same link**, the same results and the same
leaderboard.

Two situations are covered, because both end the same way — a link that should work
again:

| Situation | What the host does | What comes back |
|---|---|---|
| Deleted by mistake | **Recently deleted → Restore** | same link, same results, still closed |
| Deleted and you want it open again | **Recently deleted → Restore and reopen…** | same link, same results, new deadline |
| Simply passed its closing time | **Reopen** on the published card | same link, same results, new deadline |
| You really meant it | **Delete for good** | removed immediately, nothing recoverable |

The first delete is recoverable; deleting the same assignment a second time removes it
for good. Anything left in Recently deleted is swept automatically seven days after it
was deleted.

### Details

- The penalty-free rule for closing is unchanged: an assignment must be **closed before
  it is deleted**, exactly as before, so nobody is ever cut off mid-attempt.
- Deadlines are still validated: a reopen date must be in the future and no more than
  one year ahead.
- While an assignment sits in Recently deleted its link says *“This assignment is no
  longer available.”* rather than failing oddly.
- The host screen shows, for each deleted assignment, when it was deleted, how many
  attempts are being kept, and the exact date it will be removed for good.

### Effect on data already stored

The database gains one nullable column, `publications.deleted`. **No stored row is
rewritten**, and nothing is migrated or converted — the column is simply added on
startup if it is missing, which was verified against a PostgreSQL database that already
held an assignment from before this change. Assignments that were deleted under rc.9 or
earlier were erased permanently and cannot be recovered by this release.

## Executed verification

| Check | Result |
|---|---|
| Node 22 application suite (92 subtests) | **92 passed, 0 failed** |
| New recovery suite (10 subtests) | **10 passed** |
| Existing workspace suite, extended for two-stage delete | **13 passed** |
| TLS/CA regression suite | **5 passed** |
| Chromium end-to-end workflow | **1 passed**, about 1.5 minutes |
| Hosted PostgreSQL + TLS regression (`tools/verify-hosted.cjs`) | **27/27** |
| Recovery against a pre-existing PostgreSQL database (`tools/verify-recovery-postgres.cjs`) | **13/13** |
| Host interface in a real browser (`tools/ui-recovery-check.cjs`) | **8/8** |

The recovery suite proves: a deleted link is withdrawn and then works again on the same
id; every participant result survives; a restored assignment comes back closed and can
be reopened; an expired one reopens without being deleted; restoring twice is refused; a
second delete is permanent; an open assignment still refuses deletion; the seven-day
sweep removes only what has expired; and a database created before this release gains
the column with its existing row untouched.

## Files changed since rc.9

`storage.js` (column and startup migration), `workspace-features.js` (recoverable
delete, restore, reopen, recovery listing, seven-day sweep, player-side withdrawal),
`server.js` (sweep on startup), `index.html` and `extensions.js` (Recently deleted panel,
Reopen, Restore, Restore and reopen, Delete for good), `styles.css`,
`scripts/restore.js` (restores keep the recovery state),
`tests/publication-recovery.test.js` (new) and `tests/workspace.test.js` (extended),
plus the browser spec, `package.json` and the three HTML asset version strings, plus
this document.

Everything from rc.4 through rc.9 — event-capacity hardening, image optimisation,
the buzzer round, Design D on assigned screens, clip Play/Stop, and wrong-buzz negative
marking — is included in this package.
