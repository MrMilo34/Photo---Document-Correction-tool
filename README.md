# MeshDoctor v1.6.49

## v1.6.49 Text-tracking + loop-bank stability update
- Loop recognition uses a tight frozen bank of live frames captured around the true start, preventing later HQ locations from contaminating loop identity.
- Full-frame 10/20/40/20/10 loop comparison is shift-tolerant before zone scoring, so small hand/camera repositioning does not destroy a genuine return match.
- Dense/repeated text is allowed to advance the live map at a lower score when travel is still physically sane; large jumps remain rejected.
- Central-40% HQ sampling stride and auto-capture gates are moderately more aggressive for additional keyframes.

## v1.6.49 Guided confidence pass
- Uses a 10% context / 20% positioning / 40% HQ detail / 20% positioning / 10% context model across the blue tracking frame.
- Full-frame zoned recognition drives map location and loop recognition; only the flatter central 40% is used as final HQ detail.
- Pass 2 keeps Pass 1 as a fixed visible map and uses circular seam-aware matching instead of extending a second panorama.
- Live Stitch Preview adds a red/orange/yellow/lime/green confidence rail after Pass 1 and a moving current-position marker during Pass 2.
- Confidence is initially based on true HQ coverage; Pass 2 captures turn verified areas green.
- Physical loop recognition is independent from HQ coverage, so an incomplete first lap can still hand off to the quality pass.
- Narrower 40% detail sampling naturally increases HQ capture density.

## v1.6.46 Central-detail capture
- Wide frame retained for tracking; central portion prioritized for flatter HQ slices.

## v1.6.45 Focused label-camera + icon update
- Updated Android app icon, exact prior-HQ ghost, stronger loop checks, and dense-text capture starvation protection.

## v1.6.44 Folder-aware naming
- Custom base-name families scan the selected output folder for the next safe numbered filename.
- Create a PDF uses a Camera / Gallery / PDF chooser.

## v1.6.43 Output naming standard
- Adds independent PDF, Image, and Label default/next-name settings.
- Defaults: MeshDR-PDF 01, MeshDR-Image 01, MeshDR-Label 01.
- Each output family automatically advances its own counter after saving.
- Normal Correct Image and Side by Side outputs now use the Image counter instead of the source filename.


## v1.6.43 Correct Image action chooser

- **Correct Image** now opens a dedicated two-action chooser: **Camera** or **Gallery**.
- **Camera** launches the existing direct camera capture flow.
- **Gallery** launches the existing image picker flow.
- **Side by Side**, Label Maker, PDF creation, and the existing image correction pipeline are unchanged.

## v1.6.41 home refinement + Side by Side

- Home screen now starts with **Correct Image** instead of separate Take Photo / Choose Photo buttons. On Android, the single image input hands source selection to the system Camera/Gallery chooser.
- Added **Side by Side** as the second main option.
- Side by Side accepts multiple gallery images, supports drag reordering, and lets the user choose **Horizontal** or **Vertical** assembly.
- Assembly is deliberately non-stitched: no overlap matching, seam blur, or morphing. Images are normalized on the cross-axis, preserve aspect ratio, and are placed edge-to-edge in the chosen order.
- The assembled composite continues through the normal MeshDoctor correction page and final image naming/save flow.


## v1.6.40 text tracking, Pass 2 and wide AI fix

- Dense/repetitive printed text no longer gets rejected merely because several overlap matches are plausible; physical-motion continuity now decides whether the match is safe.
- Full-loop recognition combines shift correlation, full-frame identity and raw similarity over repeated frames, allowing Pass 1 to transition reliably into Pass 2 despite glare and slight bottle-position changes.
- Pass 2 keeps the live-map/HQ-gap-fill architecture introduced in the current branch.
- Wide-label AI tiling now starts from a full-width source canvas and blends every restored tile across its full mask. Later tiles can no longer erase the non-overlap portion of the panorama.
- Pink symmetric and purple asymmetric camera handles from v1.6.39 are retained.

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