# MeshDoctor v1.6.23

## Panorama-style Label Maker guidance

- The ghost/reference section is now rendered completely outside the capture box instead of covering the live capture area.
- During the normal rightward sweep, the accepted label edge is snapped directly to the left side of the capture box so the user only has to continue the picture visually.
- The visible overlap strip, dashed seam target, center alignment line, and “align here” text have been removed.
- Recognized live frames continue filling the lightweight stitched preview as the item rotates, similar to a phone panorama workflow.
- Every confidently accepted live frame can refresh the ghost reference, so the guide follows the growing panorama rather than remaining fixed on an old seam.
- High-quality keyframes are still captured separately in the background for the final morph/blend stitch, preserving the low-latency camera path from v1.6.19.
- User-facing guidance now talks about tracking/confidence rather than overlap percentages.


## v1.6.23
- Adjust opens with original colour/levels after geometry correction only.
- Corrected is the only local automatic colour/lighting cleanup tab.
- Grayscale and AI Assisted start from the geometry-corrected source, not the Corrected result.
- Label Maker HQ panorama now follows the successful live-preview positions when composing final keyframes.
