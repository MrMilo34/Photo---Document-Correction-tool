# MeshDoctor v1.6.3

## What’s new in v1.6.3
- **Save + resume Label Maker projects.** The mapping screen now has a Save button beside Undo. A saved project keeps the source images, image order, mesh points, Straighten rotation, zoom/pan view, current image, and recent mesh undo history in IndexedDB.
- The Label Maker start screen now shows **Continue Saved Project** under Add Images whenever a saved project exists.
- **Precision point movement is back.** Dragging a label mesh point moves at reduced speed and opens the circular magnifier so you can place the point without your finger covering the edge.
- **True 4-corner start.** Each source now begins with only the four pink corner points. Tap an edge to add a blue point only where the label actually curves; optional points can be selected and removed.
- **Stitching is more resilient.** Overlap matching now uses normalized image-detail correlation plus edge comparison, searches vertical offset and a wider overlap range, and falls back to a safe overlap stitch if recognition itself fails.
- **Lower mobile memory pressure.** Source flattening and panorama allocation are capped before the large canvas is created, which avoids a common Android canvas/memory failure that could previously end with “Could not stitch these label images.”
- The final stitched-label perimeter check, Adjust / Grayscale / Corrected / AI Assisted workflow, tiled wide-label AI polish, and single filename save remain intact.

## Label Maker workflow
1. Add and reorder source photos, or continue the last saved Label Maker project.
2. Start each source with 4 corners; add blue edge points only where the container curves.
3. Use the magnifier/reduced-speed drag, zoom/pan, whole-mesh move, and Straighten to map each source.
4. Save the project at any time from the mapping screen.
5. MeshDoctor recognizes neighboring content and stitches the label, with a safe fallback path if recognition is weak or fails.
6. Check the stitched panorama with the final perimeter mesh.
7. Correct the mesh and use the normal MeshDoctor Adjust / AI Assisted tools.
8. Enter the Image name and Save PNG.

## AI backend
The secure endpoint remains `api/ai-correct.js`. Wide-label AI polishing is coordinated by the app using overlapping document-restoration tiles, so no new Vercel environment variables are required.

## Cache/version
PWA cache key: `meshdoctor-v1.6.3`.
