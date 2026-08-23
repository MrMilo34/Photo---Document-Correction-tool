const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'medium';

function round16(v){ return Math.max(16, Math.round(v / 16) * 16); }
function outputSize(width, height){
  let w = Number(width) || 1024, h = Number(height) || 1024;
  let ratio = Math.max(1/3, Math.min(3, w / Math.max(1, h)));
  const longEdge = 1536;
  if(ratio >= 1){ w = longEdge; h = round16(longEdge / ratio); }
  else { h = longEdge; w = round16(longEdge * ratio); }
  // GPT Image 2 requires a minimum pixel count. 1536 x >=512 satisfies it.
  w = Math.min(3840, Math.max(512, round16(w)));
  h = Math.min(3840, Math.max(512, round16(h)));
  return `${w}x${h}`;
}

function promptFor(mode){
  if(mode === 'document'){
    return [
      'Clean and restore this digital document or screenshot only.',
      'Treat the supplied image as authoritative. Preserve the exact crop, page geometry, layout, text, numbers, punctuation, logos, line breaks, spacing, borders, tables, signatures, and all other content.',
      'Improve readability by correcting dull exposure, color cast, haze, compression artifacts, low contrast, uneven screen lighting, and mild noise. Make whites neutral and text crisp while keeping natural anti-aliasing.',
      'Do not rewrite, correct, infer, replace, invent, remove, move, or hallucinate any text or document content. Do not redesign the document. Do not add decorative elements.',
      'The result must look like the exact same document captured or exported cleanly at higher quality.'
    ].join(' ');
  }
  return [
    'Restore this real-world photograph while keeping it recognizably the exact same photo.',
    'Treat the supplied image as authoritative. Preserve the crop, camera angle, composition, people and their identity, facial features, skin tone, body proportions, clothing, objects, background, text, logos, and scene geometry.',
    'Correct poor lighting intelligently: recover shadow detail, control bright light sources and glare, remove gray haze or faded wash, correct color cast and white balance, reduce noise and compression artifacts, restore natural local contrast, and bring back believable vibrance and fine detail.',
    'Aim for the look of the same moment captured with a better camera and better lighting, not a filter and not a new scene.',
    'Do not add, remove, replace, relocate, stylize, beautify, or invent people or objects. Do not change expressions or identity. Do not fabricate text or missing scene content.'
  ].join(' ');
}

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');
  const allowedOrigin = process.env.MESHDOCTOR_ALLOWED_ORIGIN || '';
  const origin = req.headers?.origin || '';
  if(allowedOrigin){
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
    if(origin && origin !== allowedOrigin) return res.status(403).json({ error: 'Origin not allowed' });
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if(req.method === 'OPTIONS') return res.status(204).end();
  if(req.method === 'GET'){
    return res.status(200).json({ ok: true, configured: Boolean(process.env.OPENAI_API_KEY), model: MODEL });
  }
  if(req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'OPENAI_API_KEY is not configured' });

  try{
    const { image, mode = 'photo', width, height } = req.body || {};
    if(typeof image !== 'string' || !/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image)){
      return res.status(400).json({ error: 'A base64 image data URL is required' });
    }
    if(image.length > 20_000_000) return res.status(413).json({ error: 'Image payload is too large' });

    const resolvedMode = mode === 'document' ? 'document' : 'photo';
    const size = outputSize(width, height);
    const outputFormat = resolvedMode === 'document' ? 'png' : 'jpeg';
    const payload = {
      model: MODEL,
      images: [{ image_url: image }],
      prompt: promptFor(resolvedMode),
      size,
      quality: QUALITY,
      output_format: outputFormat,
      n: 1
    };
    if(outputFormat === 'jpeg') payload.output_compression = 92;

    const aiResponse = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await aiResponse.json().catch(() => ({}));
    if(!aiResponse.ok){
      const message = data?.error?.message || `OpenAI image edit failed (${aiResponse.status})`;
      return res.status(aiResponse.status).json({ error: message });
    }
    const b64 = data?.data?.[0]?.b64_json;
    if(!b64) return res.status(502).json({ error: 'The image service returned no image data' });

    return res.status(200).json({
      image: `data:image/${outputFormat};base64,${b64}`,
      model: MODEL,
      mode: resolvedMode,
      size
    });
  }catch(err){
    console.error('MeshDoctor AI error', err);
    return res.status(500).json({ error: err?.message || 'AI restoration failed' });
  }
}
