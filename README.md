# MeshDoctor v1.5.4

## What’s new in v1.5.4
- The **ⓘ About** button is relocated to the upper-right corner of the splash screen.
- The ambient mesh has more line/node volume again, while staying concentrated around the middle of the display.
- Cyan / purple bloom is reduced further so the live camera background remains easier to see.
- PDF page reorder handles now use a centered **4-way move** icon instead of a horizontal-only arrow.
- The mesh-point **Move** control uses the same centered 4-way move icon.
- **PDF From Images** builder added to the splash screen.
- Add multiple images, tap a page for **Edit / Remove**, and drag the centered **4-way move** handle to reorder pages.
- **Edit** routes the selected PDF page through the existing mesh correction screen and the polish / AI Assisted screen.
- While editing a PDF page, **Save PNG** becomes **Save & Continue** and replaces that page in the PDF builder.
- **Save PDF** creates a local PDF in the chosen page order; each image is fitted to a Letter-size page without cropping.
- Added a visible Back button to the mesh editor.
- The export page keeps the Back arrow and now uses **🏠 Home** in the upper-right to return to the splash screen.
- The **ⓘ About** control moved to the upper-right of the splash screen.
- Four mesh-tool buttons were tightened and restyled so Auto / Undo / 4 Points / Rotate fit across a phone screen.
- Home controls and export controls now use the MeshDoctor neon blue / purple / pink visual language more consistently.
- The animated mesh now covers the full ambient background, uses more nodes and connections, and fades toward the outside so the center reads more strongly.
- User-facing restoration text says **AI** instead of **GPT**.

## PDF behavior
The PDF builder is entirely client-side. Images are converted one-by-one to JPEG for PDF embedding, fitted within a 612 × 792 point Letter page with a small margin, and saved in the order shown in the builder. The builder does not upload pages to a server.

## AI correction backend
The secure serverless endpoint remains `api/ai-correct.js`. Its technical implementation can continue to use the configured OpenAI image model while the app presents the simpler user-facing term **AI**.

Environment variables for Vercel:

```text
OPENAI_API_KEY=your_server_side_key
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_QUALITY=low
```

For a separate frontend such as GitHub Pages, deploy the API separately, set `MESHDOCTOR_ALLOWED_ORIGIN` on the API host, then change `config.js` to the full HTTPS `/api/ai-correct` endpoint.

## Cache/version
PWA cache key: `meshdoctor-v1.5.4`.


## v1.5.4 note

- Repositioned the ℹ️ button so it sits cleanly in the top-right corner on the splash screen.


## v1.5.4 note

- Replaced the diagonal neon line treatment inside the buttons with a polygon-style background effect so you can preview that direction.
