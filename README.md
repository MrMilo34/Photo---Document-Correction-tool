# MeshDoctor v1.6.39

## v1.6.39 hybrid 1.6.27 performance pass
- Restores live-map-authoritative HQ placement and continuous live tracking across HQ shutter events.
- Retains two-pass map/coverage, HQ ghost, loop detection, and repeated-text jump protection.
- Adds purple asymmetric right/bottom resize handles; pink left/top handles remain symmetric.
- Adds repeated camera overlay layout refresh to eliminate the cyan initial sizing state.


## v1.6.38 first-lap loop detection
- Uses the first accepted HQ capture as the rotation fingerprint.
- Shift-tolerant correlation recognizes the same label area even if the return position is slightly offset.
- Requires repeated confirmation after meaningful sweep/capture progress, reducing false loop matches on repetitive text.
- Stops Auto Capture on the first genuine completed revolution instead of drifting into a second pass.

## v1.6.35 HQ-authoritative tracking fix
- Ghost/reference image is now created only from the last accepted HQ capture. Live frames never temporarily replace or advance it.
- Live tracking pauses while the HQ shutter is active so the preview map cannot creep ahead during a still capture.
- The accepted HQ frame becomes the new reference for duplicate checks and the next tracking segment.
- Repetitive instruction/ingredient text is protected by ambiguity detection, per-frame travel limits, and motion-continuity checks. Uncertain matches are held/relocked without painting invented distance into the panorama.
- Final panoramic placement is now HQ-authoritative: pairwise HQ overlaps drive placement, while live positions are only a sanity-checked hint.
- Low-resolution live-preview pixels are no longer painted into the exported label; the final image is built from accepted HQ keyframes only.

## v1.6.34 full-rotation closure
- Keeps v1.6.33 recognition, central capture default, HQ watchdog, and hybrid live/HQ rendering.
- Detects the return of the starting label view after enough circumference has been scanned.
- Saves the first repeat boundary, confirms it on the next matching frame, stops further auto-capture, and trims the final panorama to exactly one loop.


## v1.6.34 rollback stabilization
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


## v1.6.34
- Adjust opens with original colour/levels after geometry correction only.
- Corrected is the only local automatic colour/lighting cleanup tab.
- Grayscale and AI Assisted start from the geometry-corrected source, not the Corrected result.
- Label Maker HQ panorama now follows the successful live-preview positions when composing final keyframes.


## v1.6.34 Auto Capture tracking repair
- Restores the visible alignment percentage.
- Alignment now represents progress toward the next automatic HQ keyframe.
- Keeps tracking through very small/slow bottle rotations.
- Uses brightness-normalized matching to tolerate reflections.
- Keeps the ghost tied to the last committed capture instead of the current live frame.
- Auto Capture now fires from accumulated recognized new pixels instead of waiting for a fragile confidence-score peak.


## v1.6.34 Adaptive recognition
- Narrow capture boxes now use a denser horizontal tracking grid instead of throwing away lateral detail.
- Narrow selections are sampled more frequently and can match with much smaller remaining overlap, preventing the tracker from getting stuck when a slim label moves quickly through the box.
- Matching now emphasizes printed edges/text structure over raw brightness to tolerate glare and exposure changes on cylindrical packaging.
- The tracker can recover after several bad/glare frames instead of remaining anchored to an obsolete image.
- Auto Capture distance and match thresholds adapt to capture-box width, so narrow labels can trigger HQ keyframes without needing the same travel as a wide label.
- Loop detection now requires a longer sweep plus several consecutive strong returns to the starting image, reducing premature “Loop detected” states.
