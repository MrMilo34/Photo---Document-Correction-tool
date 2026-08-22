# Document Corrector v0.3

A phone-first, installable document correction app. It runs locally in the browser/PWA and does not send document images to a server.

## v0.3 changes

- The **Document Corrector header is hidden during capture and shape editing** so the document gets the full screen. It returns on the final polish/export page.
- The export page now has a clear **← Back to Edit** arrow in the top-left.
- Replaced the old **Clean** preset with a proper **Adjust** panel:
  - Brightness
  - Contrast
  - Saturation
  - Black level
  - White level
  - Reset
- Added **✦ AI Assist** as a one-tap non-generative polish pass for broad shadows and uneven illumination.
- **AI Assist never redraws document content.** It estimates lighting across the existing pixels and normalizes it; text, VINs, barcodes, logos and numbers are never reconstructed.
- **B&W** remains available and now uses the shadow-polished image as its source.
- Kept the v0.2 precision editor: pinch zoom, pan, nearby-point selection priority, Move / Remove controls, slow point movement, undo, rotate, and auto detection.
- Kept the locked neon blue/purple perimeter-mesh app icon.

## Workflow

1. Take a photo or choose one from the phone.
2. The app makes a rough four-corner document guess.
3. Drag the corner points into place.
4. Tap edge sections to add perimeter points where the page bows or curves.
5. Pinch to zoom for precision work. Tap an existing point to select it.
6. Tap **CORRECT DOCUMENT**.
7. On the export page choose:
   - **Corrected** — untouched corrected pixels.
   - **Adjust** — manual image-editor controls.
   - **AI Assist** — local shadow/lighting polish.
   - **B&W** — high-contrast document scan.
8. Use the top-left arrow to return to editing at any time.
9. Share or save the current version as PNG.

## Document integrity rule

Document Corrector does not use generative image reconstruction. Geometry, manual adjustments, AI Assist and B&W all operate on the photographed pixel data. If source text is blurry, the app does not guess what it should say.

## Updating the GitHub Pages copy

Upload the contents of this folder to the **root of the same repository**, replacing the older files with the same names:

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

Keep GitHub Pages set to:

- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/(root)**

The service-worker cache changes in each release. After GitHub finishes publishing, completely close the installed app/Chrome tab and reopen it if the old interface is still visible.
