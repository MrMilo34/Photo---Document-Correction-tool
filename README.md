# MeshDoctor v1.6.2

## What’s new in v1.6.2
- **Label source mapping is now the place for alignment controls.** Each source image uses a multi-point neon perimeter mesh, pinch zoom, pan, a centered 4-way whole-mesh move control, and a ±10° Straighten slider.
- The Straighten control rotates the source inside the existing frame; it does **not** auto-zoom or crop like some phone photo editors.
- The source mesh uses top / bottom / side guide points to better follow curved containers. Those points are used during flattening with a curved-surface mapping pass rather than treating every label as a simple rectangle.
- **Smarter overlap recognition** compares neighboring flattened sections using image luminance and edge features, searches a much larger overlap range, and also compensates for small vertical offsets before blending.
- After stitching, MeshDoctor opens a separate **final perimeter-mesh check**. The whole-mesh move handle and Straighten bar are intentionally not shown there because they belong to source mapping.
- The normal **Adjust / Grayscale / Corrected / AI Assisted** result editor follows the final mesh correction.
- Extra-wide labels can now use **tiled AI document restoration**: MeshDoctor sends overlapping label sections to AI and blends the restored sections back into the original full-width panorama instead of resizing or cropping the entire label.
- Fixed the **double naming prompt**. The Image name field on the result page is now the label filename; tapping Save PNG saves directly with that name.

## Label Maker workflow
1. Add and reorder source photos.
2. Map each source with the neon mesh, zoom/pan, whole-mesh move, and Straighten.
3. MeshDoctor recognizes neighboring content and stitches the label.
4. Check the stitched panorama with the final perimeter mesh.
5. Correct the mesh and use the normal MeshDoctor Adjust / AI Assisted tools.
6. Enter the Image name and Save PNG.

## AI backend
The secure endpoint remains `api/ai-correct.js`. Wide-label AI polishing is coordinated by the app using overlapping document-restoration tiles, so no new Vercel environment variables are required.

## Cache/version
PWA cache key: `meshdoctor-v1.6.2`.
