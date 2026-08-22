# Document Corrector v0.2

A phone-first, installable document correction app. It runs locally in the browser/PWA and does not send document images to a server.

## v0.2 editor changes

- **Pinch to zoom** up to 5× for precise perimeter editing.
- **Drag the image to pan** while zoomed in.
- Taps near an existing point now **select that point first** instead of accidentally adding another point.
- Tapping a point opens contextual controls on either side:
  - **↔ Move** — press and drag for extra-slow precision movement.
  - **✕ Remove** — removes user-added edge points. The four required corner points cannot be deleted.
- Direct point dragging is intentionally slowed slightly for finer placement.
- Tap an empty section of the blue perimeter to add a new point, as before.
- **Undo Point** and **Rotate** remain available.
- The editor controls fade away when zoomed in so the document stays uncluttered while doing precision work.
- Updated blue / purple minimal interface and the new neon document-perimeter app icon.

## Workflow

1. Take a photo or choose one from the phone.
2. The app makes a rough four-corner document guess.
3. Drag the corner points into place.
4. Tap blue edge sections to add perimeter points where the page bows or curves.
5. Pinch to zoom for close work. Tap an existing point to select it, or use **↔ Move** for very fine adjustment.
6. Tap **CORRECT DOCUMENT**.
7. Choose **Corrected**, **Clean**, or **B&W**.
8. Save or share the result.

## Document integrity rule

This app uses geometry and deterministic image processing. It does **not** use generative image reconstruction. Cleanup changes lighting/contrast and maps the original photographed pixels into a flattened page. It does not guess VINs, rebuild text, or invent document content.

## Updating the GitHub Pages copy

Upload the contents of this folder to the **root of the same repository**, replacing the older files with the same names. Keep this structure:

```text
index.html
app.js
styles.css
manifest.webmanifest
sw.js
README.md
icons/
  icon-192.png
  icon-512.png
  icon-source.png
```

GitHub Pages can remain set to:

- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/(root)**

The service worker cache name changed in v0.2, so the new app files should replace the old cached build automatically after GitHub Pages publishes the update. If Chrome still shows the old interface, close the installed app/browser tab completely and reopen it after a minute.
