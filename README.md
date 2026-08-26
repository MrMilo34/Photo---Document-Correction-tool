# MeshDoctor v1.6.4

## Label Maker reliability update

This build focuses on the two problems seen in the latest cylindrical-label test: incorrect/repeated stitch regions and a wide AI-polished export that could contain only the first tile while the rest of the canvas became black.

### Changes

- **Distance-aware label de-warping** — added mesh points are now interpolated by their real distance along the curved label edge instead of assuming every point is evenly spaced. This reduces horizontal stretching/compression of text, logos and boxes.
- **Structure-aware overlap recognition** — stitching compares grayscale content plus signed horizontal/vertical edge structure, giving text, borders, logos and barcodes more influence than blank or repetitive packaging backgrounds.
- **Safer overlap bounds and confidence fallback** — ambiguous matches no longer get to choose extreme overlap values as easily.
- **360° wrap closure detection** — when the final photograph clearly returns into the first photograph, the repeated closing section is trimmed instead of exported twice.
- **Wide-label AI tile safety** — the corrected source is drawn underneath every AI tile first. A failed or unusable AI tile therefore falls back to the source/local cleanup instead of leaving a black half.
- **AI tile validation** — near-empty/black model tiles are rejected automatically.
- **Print-detail preservation** — AI polish is blended more conservatively around text, barcodes, borders and other high-frequency printed detail while still allowing stronger cleanup in glare-heavy flat areas.
- Keeps the v1.6.3 **Save Project**, **Continue Last Project**, **precision magnifier**, reduced-speed point movement, 4-corner start, added blue mesh points, center move handle and Straighten controls.

PWA cache key: `meshdoctor-v1.6.4`.
