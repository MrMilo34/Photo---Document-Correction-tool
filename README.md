# MeshDoctor v1.6.0

## Label Maker — first working build
Label Maker is now functional rather than a placeholder.

Workflow:
1. Tap **Label Maker** from the home screen.
2. Tap **Add Images** and choose **Camera** or **Photos**.
3. Camera mode stays open so you can capture overlapping photos until you tap **Done**.
4. Imported / captured images appear in the same style of order table used by Create a PDF.
5. Drag the 4-way handle to reorder. Tap a tile for **Replace** or **Remove**.
6. Tap **Continue** and place the four neon points around the visible label region in each image.
7. Use **Apply Area to Remaining** when the label occupies a similar area in the following photos.
8. MeshDoctor flattens each selected section, estimates overlap, stitches the ordered sections, and runs a local document-style polish.
9. The result screen offers an optional **AI polish** for stitched results within the current whole-image aspect limit.
10. Tap **Save PNG**, name the label, and save it to the configured MeshDoctor output folder (or Downloads fallback).

### Output size
The stitched mobile-browser output is capped at 6144 pixels wide in this build to protect memory and stability while retaining useful label / texture detail.

## Create a PDF
**Save PDF** now opens a naming dialog before the PDF is built and saved. The chosen name becomes the next default.

## File output
When a supported browser folder is selected in Settings, MeshDoctor writes to:

```text
<Selected Folder>/MeshDoctor/Images
<Selected Folder>/MeshDoctor/PDFs
```

If folder access is unavailable, MeshDoctor uses normal Downloads.

## AI backend
`api/ai-correct.js` continues to support the optional additional reference image introduced in v1.5.15. Label Maker uses the existing Document restoration path for optional final AI polish.

## Cache/version
PWA cache key: `meshdoctor-v1.6.0`.
