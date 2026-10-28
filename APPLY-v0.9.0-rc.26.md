# Quizzes rc.26 — update

Download and extract the update zip. Upload its contents over the matching files in the GitHub repository. Do not upload the zip as one file. Then use Render → Manual Deploy → Deploy latest commit. This update includes the rc.25 buzzer fixes and can be applied to rc.24 or rc.25.

Never replace `database-config.js` on an existing installation. It is absent from the update zip. The full deployment zip contains it, so keep the existing file if using that package to update.

No database migration or saved-data changes. Stored quizzes, publications, attempts and results are not modified. Deployment restarts the app: deploy between games and keep a backup.
