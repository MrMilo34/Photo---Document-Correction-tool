# DocMesh v0.5.1

This is a cache-reliability hotfix for v0.5.

## Included app changes
- Result order: **Adjust, Greyscale, Corrected, AI Assisted**
- **Corrected** uses the balanced cleanup pass.
- **AI Assisted** uses the stronger cleanup pass.
- New DocMesh splash screen.
- Neon pink corner points and purple-blue edge points.

## v0.5.1 cache fix
GitHub Pages + the previous offline service worker could continue serving the older app after a normal refresh.

This build:
- uses versioned app asset URLs,
- forces the service worker update check,
- uses a network-first strategy when online,
- removes older DocMesh caches after activation.

## Upload
Replace the existing repository files with the contents of this package, including the `assets` folder.

After GitHub Pages finishes deploying, open the normal site once. If the old app is still visible on that first load, close the tab/app and reopen it once more so the new service worker takes control.
