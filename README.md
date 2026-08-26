MeshDoctor v1.6.5

- Added the live Label Maker camera guide requested for panoramic photo mode.
- Camera mode now shows mirrored curved guide points directly on the live camera screen with a Mirror Points toggle.
- Added previous-section ghost overlap guidance and optional auto-capture based on overlap matching.
- Kept the post-capture 4-point → add-points label mapping stage and sequential default label filenames.

# MeshDoctor v1.6.5 (previous v1.6.4 notes below)

## What’s new in v1.6.4

- Label saves now use an automatic sequential default name: **MeshDoctor-label 01**, **MeshDoctor-label 02**, and so on.
- The next default label name is remembered and advances after each successful label PNG save.
- The stitched-label editor now picks up the next sequential default name automatically when a rebuilt label enters the final correction stage.
- Keeps the label-mapping workflow from v1.6.3, including the **4-point then add-points** editing approach in the per-image mapping stage.

## Notes

This update focuses on making saved label outputs easier to manage so each result gets a unique default filename without repeated manual renaming.

PWA cache key: `meshdoctor-v1.6.5`.
