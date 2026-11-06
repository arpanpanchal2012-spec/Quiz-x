# Quizzes rc.27 — installation

Use the update zip for an existing rc.24, rc.25 or rc.26 installation. Unzip it, then upload the extracted files to the same paths in your GitHub repository, replacing files of the same name. Do not upload the zip itself as a single file. Commit, then Render → Manual Deploy → Deploy latest commit. Deploy between games, since restarting the server temporarily disconnects live rooms.

**Do not replace `database-config.js`**; it is not in the update zip. The full deployment zip contains this file for a new installation; preserve your existing copy when updating.

No schema migration; existing saved quizzes, publications, attempts, results and scores are not modified. Take a backup before deployment.

The four stage improvements are visible on the separate Projector screen. The host and phone also get vote badges after reveal, and the host buzzer queue has larger names and times. At a round end, the leaderboard may appear first: the host can hide it to view the question's answer badges.
