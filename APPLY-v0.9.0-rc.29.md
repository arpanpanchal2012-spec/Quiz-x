# Quizzes rc.29 — installation

For an existing rc.27 or rc.28 installation, download the update zip and unzip it. Upload the extracted files to the same paths in GitHub, replacing matching files. Commit, then choose Render → Manual Deploy → Deploy latest commit. Do not upload the zip itself. Schedule deployment between games, because the service restarts.

The update includes all 20 thumbnail references. Never replace `database-config.js` on an existing installation; the update zip deliberately omits it. The full deployment zip includes it for new installations, so preserve your existing copy if using the full zip for an upgrade.

Open a live room, choose **Screen designs**, then choose the host and projector style separately. Start a question with an image to see the image-first layout. These are responsive adaptations inspired by the reference images, not pixel-perfect copies. Long content may scroll; the phone layout is unchanged. The host still controls the music and the projector remains a separate audience window.

There is no schema migration and existing saved quizzes, publications, attempts, reports and scores are not modified. Take a backup before deploying.
