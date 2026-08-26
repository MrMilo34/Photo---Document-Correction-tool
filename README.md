# MeshDoctor v1.5.17

## What’s new
- The correction result now opens on **Adjust** by default, with the adjustment panel immediately visible.
- The old helper text below the correction modes is replaced by an **Image name** field. That name is used when saving PNG/JPG images.
- Settings now has one output destination for both images and PDFs.
- **Select Folder** uses the browser File System Access API when available. MeshDoctor creates `MeshDoctor/Images` and `MeshDoctor/PDFs` inside the selected folder and saves into those subfolders.
- If no folder is selected, or the browser does not support writable folder picking, output continues to use **Downloads**.
- The AI reference control is now a larger blue/purple button and is renamed **+ Add additional Reference Image**.

## Output-folder note
Web browsers only allow direct folder writing after the user grants permission. On browsers/devices without `showDirectoryPicker`, MeshDoctor safely falls back to the normal Downloads behavior.

## Cache/version
PWA cache key: `meshdoctor-v1.5.17`.
