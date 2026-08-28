# MeshDoctor v1.6.17

## What's new in v1.6.17

- **Live label-camera preview stays lightweight** for smoother phone performance.
- **Captured label photos now save at higher quality** for better stitching and a sharper final output.
- When available, MeshDoctor now uses the browser/device **high-resolution still capture path** during photo capture, while keeping the on-screen preview lower resolution.
- Fallback behavior is preserved for devices that do not support the high-resolution capture API.


- Label Maker camera mode now behaves more like a guided panorama workflow with a live stitched preview strip.
- Camera mode stitches directly to the result, while Photos mode stays manual for table reordering and mesh correction.
- The live camera preview stays lightweight while captured sections remain high quality for final output.


### v1.6.17 camera performance pass
- Live panorama preview now paints only newly matched low-resolution pixels instead of re-stitching the whole preview after every capture.
- Automatic HQ keyframes require actual new label content, preventing repeated captures while the object is stationary.
- High-resolution stills are stored with crop metadata and decoded/cropped only after Done, keeping the live camera responsive.
- Camera options were moved above Cancel / shutter / Done and good-overlap feedback now uses the MeshDoctor neon pink-to-electric-blue gradient.
