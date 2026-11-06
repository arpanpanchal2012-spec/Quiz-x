# Quizzes rc.28 — installation

Unzip the update and upload its extracted contents to the same paths in your GitHub repository, replacing matching files. Commit, then choose Render → Manual Deploy → Deploy latest commit. Deploy between games; the service restarts.

This update can be applied to rc.27 and includes the changes from rc.25 and rc.26. It includes 20 small theme-reference thumbnails under `assets/themes/`.

**Never replace `database-config.js` on an existing installation.** It is absent from the update zip. The full deployment zip includes it for new installations; preserve your existing copy when updating.

In a live game click **Screen designs** beside Projector. Choose one of 12 host styles and one of 8 projector styles independently; the projector changes live and the chosen pair survives room recovery. The current design remains available. The pictures in the picker are design references, not question images. The live design is an adaptation of each reference, not a pixel-identical recreation. The player's existing phone layout and your own question images are retained. New rooms start with the current default style.

No database schema migration. Saved quizzes, publications, attempts, reports and scores are not modified. Take a backup before deploying.
