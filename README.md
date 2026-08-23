# DocMesh v1.1

## Changes
- AI Assisted now expands into three simple choices: **Automatic**, **Document**, and **Photo**.
- Automatic analyzes the corrected image and chooses the local Document or Photo restoration path.
- Document restore aims for a clean digital scan-like result.
- Photo restore normalizes lighting and glare while keeping photographic detail natural.
- Renamed **Undo Point** to **Undo**.
- Adjustment controls are now drag-only: tapping the slider rail no longer changes the value.
- Sliders use a purple-blue-to-blue gradient track with a hot-pink control.
- Slider movement creates a short polygon trail that fades within 0.5 seconds.
- Added subtle floating polygon shards to the home screen.

## Cloud AI note
This release keeps the restore modes local so the GitHub Pages app works without exposing an API key. A future cloud restore can plug into these same Automatic / Document / Photo choices through a secure backend.
