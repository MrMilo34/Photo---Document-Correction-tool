# MeshDoctor v1.6.32


## v1.6.32 rollback stabilization
- Restores the v1.6.28 Label Maker recognition and HQ auto-capture decision path.
- Removes the v1.6.29 central heat-map capture gating and v1.6.30 armed-capture experiment.
- Keeps the improved HQ seam blending, loop stopping, and label-safe AI restoration from v1.6.28.
Label Maker now rejects stationary/duplicate frames before they can extend the panorama or trigger an automatic HQ capture. Auto Capture requires real visual change from the previous saved keyframe.

## Panorama-style Label Maker guidance

- The ghost/reference section is now rendered completely outside the capture box instead of covering the live capture area.
- During the normal rightward sweep, the accepted label edge is snapped directly to the left side of the capture box so the user only has to continue the picture visually.
- The visible overlap strip, dashed seam target, center alignment line, and “align here” text have been removed.
- Recognized live frames continue filling the lightweight stitched preview as the item rotates, similar to a phone panorama workflow.
- The ghost reference remains tied to the last committed HQ capture so it stays stable while the live recognizer tracks movement.
- High-quality keyframes are still captured separately in the background for the final morph/blend stitch, preserving the low-latency camera path from v1.6.19.
- User-facing guidance now talks about tracking/confidence rather than overlap percentages.


## v1.6.32
- Adjust opens with original colour/levels after geometry correction only.
- Corrected is the only local automatic colour/lighting cleanup tab.
- Grayscale and AI Assisted start from the geometry-corrected source, not the Corrected result.
- Label Maker HQ panorama now follows the successful live-preview positions when composing final keyframes.


## v1.6.32 Auto Capture tracking repair
- Restores the visible alignment percentage.
- Alignment now represents progress toward the next automatic HQ keyframe.
- Keeps tracking through very small/slow bottle rotations.
- Uses brightness-normalized matching to tolerate reflections.
- Keeps the ghost tied to the last committed capture instead of the current live frame.
- Auto Capture now fires from accumulated recognized new pixels instead of waiting for a fragile confidence-score peak.


## v1.6.32 Adaptive recognition
- Narrow capture boxes now use a denser horizontal tracking grid instead of throwing away lateral detail.
- Narrow selections are sampled more frequently and can match with much smaller remaining overlap, preventing the tracker from getting stuck when a slim label moves quickly through the box.
- Matching now emphasizes printed edges/text structure over raw brightness to tolerate glare and exposure changes on cylindrical packaging.
- The tracker can recover after several bad/glare frames instead of remaining anchored to an obsolete image.
- Auto Capture distance and match thresholds adapt to capture-box width, so narrow labels can trigger HQ keyframes without needing the same travel as a wide label.
- Loop detection now requires a longer sweep plus several consecutive strong returns to the starting image, reducing premature “Loop detected” states.
