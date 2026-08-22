# Document Corrector v0.1

A phone-first, installable document correction app. It runs locally in the browser/PWA and does not send document images to a server.

## Current workflow

1. Take a photo or choose one from the phone.
2. The app makes a rough four-corner document guess.
3. Drag any orange corner.
4. Tap a blue edge to insert an extra perimeter point; drag it to match bowed/curved paper edges.
5. Tap **CORRECT DOCUMENT**.
6. Choose **Corrected**, **Clean**, or **B&W**.
7. Save or share the result.

## Integrity rule

This version uses geometry and deterministic image processing. It does **not** use generative image reconstruction. Cleanup changes lighting/contrast and maps the original photographed pixels into a flattened page.

## Install on Android as an app

The easiest test route is GitHub Pages:

1. Upload the contents of this folder to a GitHub repository.
2. Enable GitHub Pages for the repository.
3. Open the Pages address in Chrome on Android.
4. Chrome menu → **Add to Home screen** / **Install app**.

After the first successful load, the service worker caches the app shell for offline use.

## Notes for v0.1

- Output is capped at about 2000 px on the longest corrected dimension so the curved-edge remap stays practical on a phone.
- Automatic corner detection is intentionally conservative and is only the starting suggestion; the user-controlled perimeter is authoritative.
- Curved-edge correction uses a Coons-patch style mapping from the four user-defined boundary curves.
- The cleanup filter estimates uneven illumination and normalizes it. It does not invent missing characters.
