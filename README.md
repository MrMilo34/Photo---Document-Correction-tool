# MeshDoctor v1.5.15

## What’s new in v1.5.15
- Added an **optional reference image** inside **AI Assisted**. You can now add a second angle of the same photo or document so the AI has extra visual context when glare or reflections block part of the primary image.
- Strengthened **Document** prompting so printed charts, classroom posters, labels, forms, and other flat-color layouts keep a cleaner screenshot / print style with more consistent solid fills.
- Improved best-effort reconstruction guidance for **glare-covered icons and simple artwork** in document mode.
- Softened **Photo** prompting so ordinary memory-preservation images — including benign couple and family photos — are framed more clearly as faithful optical restoration requests.
- Kept the restore behavior conservative: the extra reference is used only to recover missing detail, while the final result still stays matched to the main image.

## AI Assisted reference image
Inside the AI Assisted panel, tap **Add reference** and choose another photo of the same page / poster / printed photo from a different angle. MeshDoctor sends the main image plus the optional reference to the secure AI endpoint.

Best use cases:
- glare hiding part of a classroom poster or worksheet
- reflections covering a medication label or form
- a printed family photo with washout in one area
- laminated educational charts photographed from different angles

## PDF behavior
The PDF builder remains client-side. You can combine images with selected pages from an imported PDF, reorder them, edit them through MeshDoctor, and create a new PDF.

## AI correction backend
The secure serverless endpoint remains `api/ai-correct.js`. It now accepts:
- `image` — the primary corrected image
- `referenceImage` — optional extra angle / supporting image
- `mode` — `photo` or `document`

Environment variables for Vercel:

```text
OPENAI_API_KEY=your_server_side_key
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_QUALITY=low
```

## Cache/version
PWA cache key: `meshdoctor-v1.5.15`.
