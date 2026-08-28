# MeshDoctor v1.6.19

## Camera latency pass

- The live Label Maker camera remains a lightweight 480×270 feed, but the full-screen overlay is now rendered at display resolution instead of phone pixel density.
- Expensive backdrop-blur effects over the moving video have been removed in camera mode.
- Live motion/overlap sensing now reuses tiny analysis canvases instead of allocating new large canvases every scan.
- The progress panorama paints new pixels into a fixed lightweight working canvas instead of rebuilding/copying the entire panorama on every addition.
- High-quality still capture is limited to a medium-resolution still target (up to about 1600 px wide when supported), which is still far sharper than the live preview but avoids requesting the phone's full sensor image for every keyframe.
- Auto-capture keyframes are spaced farther apart so the camera pipeline is not repeatedly interrupted while the item is rotating.
- High-quality ghost replacement is deferred slightly so the live video gets priority immediately after a capture.
