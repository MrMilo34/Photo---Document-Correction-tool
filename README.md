# DocMesh v0.7

## What changed
- Uses the approved new splash screen art.
- Keeps the result order: **Adjust, Greyscale, Corrected, AI Assisted**.
- Further tunes **AI Assisted** into the strongest experimental restoration mode.
- AI Assisted is now better suited to harder handheld document images with shadows, glare, fingers, or uneven lighting.
- Adds a small in-app tip explaining when to use AI Assisted.
- Updates cache-busting to help GitHub Pages show the new build more reliably.

## Notes
- **Corrected** remains the safer balanced cleanup mode.
- **AI Assisted** is the least restrictive mode and may lightly rebuild the restored look of the image while aiming to keep visible text the same.

## Upload
Replace the current repository files with the contents of this package, including the `assets` folder.
After deployment, open the site and confirm you can see **release v0.7** below the splash screen.
