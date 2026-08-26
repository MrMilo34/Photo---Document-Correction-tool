# MeshDoctor v1.6.3

## What’s new in v1.6.3

- Label Maker per-image mapping now starts with the same **4-point base mesh** as the regular photo mesh tool.
- You can **tap the blue perimeter to add extra points** only where you need them for curved labels.
- The mapping stage still keeps **pinch zoom, pan, the center move handle, and Straighten** in the same place.
- Added **Undo** and **Remove Point** controls during label mapping so accidental point placement is easier to fix.
- Each mapped label section now flattens through the **flexible perimeter mesh**, so extra points actually influence the cylindrical unwrap instead of using a fixed 12-point template.
- The final stitched-label editor still keeps the **final perimeter mesh check only**, without the whole-mesh move handle in the last stage.

## Notes

This update is focused on making the first label-mapping stage feel more like the normal MeshDoctor document/photo mesh workflow while keeping the label-specific stitching pipeline.

PWA cache key: `meshdoctor-v1.6.3`.
