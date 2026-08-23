# MeshDoctor v1.4

## A — v1.4 feature update
- New `home-splash.png` supplied for MeshDoctor.
- Main-screen dark camera overlay reduced by another ~10% and camera background brightened.
- Animated neon point-and-line mesh now drifts around and behind the splash card, with the existing shard effects retained.
- AI Assisted keeps only the three top-level choices: **Automatic**, **Document**, **Photo**.
- Automatic is intentionally conservative: uncertain real-world camera captures route to Photo; Document is reserved for strongly digital/page-like content.
- Photo local fallback is stronger in shadows and vibrance so the app still improves images when cloud AI is unavailable.

## B — user-facing mode meaning
- **Automatic** — choose the restoration path automatically.
- **Photo** — real-world camera images: people, rooms, vehicles, faded/washed photos, low-light scenes, and photographed paperwork.
- **Document** — digital documents, screenshots, PDF-like pages, forms, and computer-captured document content where exact readability/layout are the priority.

The AI panel now shows whether **GPT Image 2** is ready or whether the app is using the local fallback, so there is no ambiguity about which engine produced the result.

## C — GPT image correction implementation
v1.4 includes a real server-side GPT image-edit path in `api/ai-correct.js`.

- Model default: `gpt-image-2`
- Endpoint used by the app: `/api/ai-correct`
- API key stays server-side in `OPENAI_API_KEY` and is never embedded in the browser bundle.
- Photo prompt preserves composition/identity while asking for lighting recovery, haze removal, natural vibrance, shadow recovery, highlight control, noise cleanup, and detail restoration.
- Document prompt strongly preserves exact text/layout/content while cleaning exposure, cast, haze, compression, and readability.
- Output resolution follows the input aspect ratio using GPT Image 2 flexible sizing.
- If the endpoint or key is unavailable, MeshDoctor automatically uses the upgraded local restore instead of failing.

### Enable GPT restoration
This package is ready for a Vercel-style deployment because it includes `api/ai-correct.js`, `package.json`, and `vercel.json`.

Set these server environment variables:

```text
OPENAI_API_KEY=your_server_side_key
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_QUALITY=medium
```

For a separate frontend such as GitHub Pages, deploy the API separately, set `MESHDOCTOR_ALLOWED_ORIGIN` on the API host, then change `config.js` to the full HTTPS `/api/ai-correct` endpoint.

## Files added in v1.4
- `api/ai-correct.js`
- `config.js`
- `.env.example`
- `package.json`
- `vercel.json`

## Cache/version
PWA cache key is now `meshdoctor-v1.4.0`.
