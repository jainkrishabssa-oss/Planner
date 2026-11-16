# My Planner

Your own to-do app: works offline, syncs between phone and laptop through your Firebase project.

Upload everything in this folder to your GitHub repository (the `source` folder is optional — it's the
original code, kept so the app can be changed later).

Files:
- index.html, app.js, sw.js, manifest.webmanifest, icons/ — the app (don't edit)
- config.js — paste your Firebase settings here (setup guide, step 5)
- firestore.rules — the security rules to paste into Firebase (setup guide, step 3)

When you upload a changed version of the app later, open sw.js and change `planner-v1`
to `planner-v2` (and so on) so your devices pick up the update.
