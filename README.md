# DocMesh v0.5.2 — Cache Reset Release

This release keeps the v0.5 changes but removes stale browser/service-worker caching as a variable.

## Upload
Replace ALL files and folders in the ROOT of the same GitHub repository with the contents of this package.

The repository root must directly contain:
- index.html
- app.js
- styles.css
- manifest.webmanifest
- sw.js
- README.md
- assets/
- icons/

After GitHub Pages finishes deploying, open the site once with `?reset=052` added to the end.
You should see `release v0.5.2` under the splash screen.

If that still shows the old build, the repository or Pages deployment is serving old files rather than this being a phone cache issue.
