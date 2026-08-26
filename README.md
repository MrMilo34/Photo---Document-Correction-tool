# MeshDoctor v1.6.1

## What’s new in v1.6.1

### Label Maker post-stitch editor
- After **Stitch Label**, the stitched result now opens in the full MeshDoctor mesh editor instead of the old simple result-only screen.
- The stitched label supports the same **pinch zoom** and **free panning** used by the normal photo/document mesh editor.
- Label results start with a richer perimeter mesh. Individual points can be moved and additional perimeter points can still be added the normal MeshDoctor way.
- A centered **4-way move control** lets the user reposition the entire mesh without moving every point separately.
- Added a **Straighten** slider from -10° to +10° for fine rotation. Rotation keeps the original canvas size and does **not automatically zoom or crop the image**.
- After mesh correction, Label Maker uses the normal result workflow: **Adjust, Grayscale, Corrected, and AI Assisted**.
- Saving a corrected label still opens the naming dialog before the PNG is written to the MeshDoctor Images output folder / Downloads fallback.

### Label source-area workflow
- The four-point label selection used on each source photo now also has a centered **4-way move handle**. This makes it much easier to copy an area to the remaining images and nudge the whole selection left/right/up/down when the next photo is slightly offset.

### Panoramic protection
- Extra-wide stitched labels are preserved at full width. MeshDoctor avoids sending panoramas beyond the current whole-image AI ratio to a process that could resize/crop them; a local full-width polish is used instead.

## Label Maker workflow
1. Add images from Camera or Photos.
2. Reorder / replace / remove images.
3. Select the visible label area on each source image.
4. Stitch the label.
5. Correct the stitched result with the full MeshDoctor mesh editor, optional Straighten rotation, zoom and pan.
6. Continue to normal Adjust / Grayscale / Corrected / AI Assisted options.
7. Name and save the final PNG.

## Cache/version
PWA cache key: `meshdoctor-v1.6.1`.
