# MeshDoctor v1.6.13

## What's new in v1.6.13

- Simplifies the Label Maker flow: **Continue** now goes straight to **Stitch Label** instead of forcing per-photo manual flattening first.
- Adds **Continue Last Project** back to the Label Maker so the most recent label capture set can be restored.
- Adds a local **stitchLabelPieces** implementation so stitched label generation can complete instead of failing.
- Simplifies live label camera resizing to the **left handle for width** and the **top handle for height**.
- Reduces label-camera friction by prioritizing the resize handles and trimming the live interaction workload.
- Keeps captured guide-based deformation for the automatic flattening step before stitching.
