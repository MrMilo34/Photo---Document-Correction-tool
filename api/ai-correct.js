const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'low';

function round16(v){ return Math.max(16, Math.round(v / 16) * 16); }
function outputSize(width, height){
  let w = Number(width) || 1024, h = Number(height) || 1024;
  const ratio = Math.max(1 / 3, Math.min(3, w / Math.max(1, h)));
  const longEdge = 1536;
  if(ratio >= 1){ w = longEdge; h = round16(longEdge / ratio); }
  else { h = longEdge; w = round16(longEdge * ratio); }
  w = Math.min(3840, Math.max(512, round16(w)));
  h = Math.min(3840, Math.max(512, round16(h)));
  return `${w}x${h}`;
}

function promptFor(mode, hasReference=false){
  const common = [
    'MeshDoctor is a restoration and correction tool for user-supplied material. Perform a faithful restoration of the supplied image rather than creating a new scene.',
    'Preserve the original meaning, context, composition, subjects, and content.',
    'Repair visual defects using the source image, surrounding context, and any optional reference image. When parts are obscured by glare, reflections, or washout, make a conservative best-effort reconstruction of the same original content rather than inventing unrelated new content.'
  ];
  const reference = hasReference ? 'A second user-supplied reference image of the same subject or page from another angle is provided. Use it only to recover missing or glare-covered detail while keeping the final result matched to the primary image composition.' : '';
  if(mode === 'label'){
    return common.concat([reference,
      'Restore this flattened or photographed product label / packaging panel for faithful archival or catalog use.',
      'This image may contain packaging artwork, printed logos, bilingual text, ingredients, instructions, warnings, barcodes, codes, measurements, and other product-label details.',
      'Reduce glare, reflections, shadows, haze, fading, stains, blur, noise, compression artifacts, stitching marks, and uneven lighting when possible.',
      'Preserve the exact printed content, wording, spelling, numbers, punctuation, spacing, line breaks, panel shapes, logo shapes, barcode structure, icons, and overall layout.',
      'Keep flat printed fills clean and uniform. Preserve original colors faithfully while making whites neutral and the label easier to read.',
      'Do not hallucinate, rewrite, translate, re-typeset, or redesign packaging text. If a tiny printed region is genuinely unreadable, keep it soft or minimally repaired rather than inventing new wording.',
      'Return a cleaner, more legible version of the same label or packaging panel.'
    ]).join(' ');
  }
  if(mode === 'document'){
    return common.concat([reference,
      'Restore this photographed, scanned, or digital document/page for readability, archival, educational, or professional use.',
      'The page may contain ordinary paperwork, school material, diagrams, scientific or anatomy textbook content, health information, forms, tables, signatures, logos, illustrations, labels, packaging, charts, classroom graphics, or technical material. Treat these as documentary content and preserve them faithfully.',
      'Reduce glare, reflections, shadows, haze, fading, stains, discoloration, folds, blur, noise, compression artifacts, and uneven lighting when possible.',
      'Improve legibility, contrast, sharpness, white balance, and color balance while preserving the exact crop, page geometry, layout, text, numbers, punctuation, line breaks, spacing, borders, tables, diagrams, signatures, logos, and other visible content.',
      'Preserve the source graphic design style. When a region is visibly a flat solid-color fill, such as a form field, spreadsheet cell, label, card, banner, background, or printed panel, keep that region a uniform solid color from edge to edge. Do not introduce gradients, painterly shading, texture, glow, or color variation into flat-color regions.',
      'If an icon, pictogram, illustration, logo, or photograph visibly contains gradients or shading in the source, preserve those gradients only within that element. Keep the surrounding labels, panels, borders, and background fills consistent with the original flat colors.',
      'For computer-generated or professionally printed pages, favor a clean screenshot/desktop-export appearance: crisp edges, consistent fills, neutral whites, even backgrounds, and faithful colors rather than a re-rendered artistic look.',
      'When simple artwork, icons, pictograms, or educational poster illustrations are partially hidden by glare, reconstruct them in the same simple graphic style using nearby repeated patterns and any optional reference angle, while keeping flat-color label bars and backgrounds consistent.',
      'Do not rewrite, correct, infer, replace, remove, move, censor, or hallucinate document content. Do not redesign the page or change its color scheme.',
      'Return a cleaner and more legible version of the same document or page.'
    ]).join(' ');
  }
  return common.concat([reference,
    'Perform optical restoration of this user-supplied personal photograph or scanned printed photo for archival and memory-preservation purposes.',
    'This includes ordinary family, couple, wedding, friendship, and memory-preservation photos where the goal is faithful cleanup of a real photo the user already owns or scanned.',
    'The requested edit is limited to correcting capture, print, and age-related defects such as glare, reflections, haze, washout, fading, color casts, stains, discoloration, dust, scratches, scan artifacts, blur, noise, compression artifacts, and uneven light exposure.',
    'Improve contrast, white balance, color balance, natural saturation, visibility, and fine detail while keeping the result believable and faithful to the original photograph.',
    'Preserve the same subjects, scene, pose, clothing, objects, background, lighting direction, camera angle, crop, composition, text, logos, and context. Treat any people shown as ordinary subjects in an archival photograph.',
    'Do not add, remove, replace, relocate, stylize, beautify, sexualize, intensify, or reinterpret any subject or interaction. Do not change expressions, clothing coverage, relationships, or the meaning of the scene.',
    'If the primary image contains glare or reflections that hide small visual areas, use nearby context and any optional reference image to make a restrained best-effort recovery of the same underlying photo details.',
    'Make only restoration corrections that could reasonably result from better scanning, better lighting, or repair of the original print. Return a faithful restored version of the same photograph.'
  ]).join(' ');
}

function decodeDataUrl(dataUrl){
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([\s\S]+)$/i.exec(dataUrl || '');
  if(!match) return null;
  const subtype = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
  return {
    bytes: Buffer.from(match[2], 'base64'),
    mime: `image/${subtype}`,
    ext: subtype === 'jpeg' ? 'jpg' : subtype
  };
}

function safeOpenAIError(data, status, requestId=''){
  return {
    status,
    code: data?.error?.code || '',
    type: data?.error?.type || '',
    param: data?.error?.param || '',
    message: data?.error?.message || `OpenAI request failed (${status})`,
    requestId: requestId || ''
  };
}
function classifyOpenAIError(error){
  const code=String(error?.code||'').toLowerCase();
  const type=String(error?.type||'').toLowerCase();
  const message=String(error?.message||'').toLowerCase();
  if(/safety|moderation|policy|rejected by the safety system/.test(`${code} ${type} ${message}`)) return 'safety';
  if(error?.status===401||error?.status===403) return 'authentication';
  if(error?.status===429) return 'rate_or_quota';
  if(error?.status>=500) return 'service';
  if(error?.status===400) return 'request';
  return 'unknown';
}
function shouldRetryMinimal(error){
  if(error?.status !== 400) return false;
  const param=String(error?.param||'').toLowerCase();
  const message=String(error?.message||'').toLowerCase();
  return ['size','output_format','output_compression','n','quality'].includes(param) ||
    /invalid.*(size|format|compression|quality)|unsupported.*(size|format|compression|quality)|unknown parameter/.test(message);
}
async function probeOpenAI(){
  if(!process.env.OPENAI_API_KEY) return { ok:false, status:503, message:'API key is not configured', model:MODEL };
  try{
    const response=await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(MODEL)}`,{
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}
    });
    const data=await response.json().catch(()=>({}));
    const requestId=response.headers.get('x-request-id')||'';
    if(!response.ok){
      const error=safeOpenAIError(data,response.status,requestId);
      console.error('MeshDoctor AI probe failed', {status:error.status,code:error.code,type:error.type,param:error.param,message:error.message,requestId:error.requestId,model:MODEL});
      return {ok:false,...error,model:MODEL};
    }
    return {ok:true,status:response.status,model:data?.id||MODEL,requestId};
  }catch(err){
    console.error('MeshDoctor AI probe exception',{message:err?.message||String(err),model:MODEL});
    return {ok:false,status:0,message:err?.message||'OpenAI probe failed',model:MODEL};
  }
}
function makeEditForm(decoded,resolvedMode,size,{minimal=false,referenceDecoded=null}={}){
  const form=new FormData();
  form.append('model',MODEL);
  form.append('image[]',new Blob([decoded.bytes],{type:decoded.mime}),`meshdoctor-input.${decoded.ext}`);
  if(referenceDecoded) form.append('image[]',new Blob([referenceDecoded.bytes],{type:referenceDecoded.mime}),`meshdoctor-reference.${referenceDecoded.ext}`);
  form.append('prompt',promptFor(resolvedMode, Boolean(referenceDecoded)));
  form.append('quality',QUALITY);
  if(!minimal){
    const outputFormat=(resolvedMode==='document'||resolvedMode==='label')?'png':'jpeg';
    form.append('size',size);
    form.append('output_format',outputFormat);
    form.append('n','1');
    if(outputFormat==='jpeg') form.append('output_compression','92');
  }
  return form;
}
async function callImageEdit(form){
  const response=await fetch('https://api.openai.com/v1/images/edits',{
    method:'POST',
    headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
    body:form
  });
  const data=await response.json().catch(()=>({}));
  return {response,data,requestId:response.headers.get('x-request-id')||''};
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
    const diagnostics = String(req.query?.diagnostics || '') === '1';
    if(!diagnostics){
      return res.status(200).json({
        ok: true,
        configured: Boolean(process.env.OPENAI_API_KEY),
        model: MODEL,
        quality: QUALITY
      });
    }
    const probe=await probeOpenAI();
    return res.status(200).json({
      ok:true,
      configured:Boolean(process.env.OPENAI_API_KEY),
      endpoint:true,
      model:MODEL,
      quality:QUALITY,
      openai:probe
    });
  }
  if(req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'OPENAI_API_KEY is not configured' });

  try{
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { image, referenceImage, mode = 'photo', width, height } = body;
    if(typeof image !== 'string') return res.status(400).json({ error: 'A base64 image data URL is required' });
    if(image.length > 20_000_000) return res.status(413).json({ error: 'Image payload is too large' });

    const decoded = decodeDataUrl(image);
    if(!decoded) return res.status(400).json({ error: 'Unsupported image data URL' });
    const referenceDecoded = referenceImage ? decodeDataUrl(referenceImage) : null;
    if(referenceImage && !referenceDecoded) return res.status(400).json({ error: 'Unsupported reference image data URL' });

    const resolvedMode = mode === 'label' ? 'label' : (mode === 'document' ? 'document' : 'photo');
    const size = outputSize(width, height);
    let outputFormat = (resolvedMode === 'document' || resolvedMode === 'label') ? 'png' : 'jpeg';
    let retriedMinimal=false;

    let {response:aiResponse,data,requestId}=await callImageEdit(makeEditForm(decoded,resolvedMode,size,{referenceDecoded}));
    if(!aiResponse.ok){
      const firstError=safeOpenAIError(data,aiResponse.status,requestId);
      console.error('MeshDoctor OpenAI image edit failed',{stage:'primary',status:firstError.status,code:firstError.code,type:firstError.type,param:firstError.param,message:firstError.message,requestId:firstError.requestId,model:MODEL,quality:QUALITY,size,mode:resolvedMode,outputFormat});
      if(shouldRetryMinimal(firstError)){
        retriedMinimal=true;
        ({response:aiResponse,data,requestId}=await callImageEdit(makeEditForm(decoded,resolvedMode,size,{minimal:true,referenceDecoded})));
        outputFormat='png';
      }
    }
    if(!aiResponse.ok){
      const error=safeOpenAIError(data,aiResponse.status,requestId);
      const reason=classifyOpenAIError(error);
      console.error('MeshDoctor OpenAI image edit failed',{stage:retriedMinimal?'minimal-retry':'primary',reason,status:error.status,code:error.code,type:error.type,param:error.param,message:error.message,requestId:error.requestId,model:MODEL,quality:QUALITY,size,mode:resolvedMode});
      return res.status(aiResponse.status).json({
        error:error.message,
        diagnostic:{stage:'openai',reason,status:error.status,code:error.code,type:error.type,param:error.param,requestId:error.requestId,model:MODEL,quality:QUALITY,size,mode:resolvedMode,retriedMinimal,usedReference:Boolean(referenceDecoded)}
      });
    }

    const b64 = data?.data?.[0]?.b64_json;
    if(!b64){
      console.error('MeshDoctor image service returned no data',{requestId,model:MODEL,quality:QUALITY,size,mode:resolvedMode});
      return res.status(502).json({ error: 'The image service returned no image data', diagnostic:{stage:'openai',status:502,requestId,model:MODEL,quality:QUALITY,size,mode:resolvedMode,retriedMinimal} });
    }

    return res.status(200).json({
      image: `data:image/${outputFormat};base64,${b64}`,
      model: MODEL,
      quality: QUALITY,
      mode: resolvedMode,
      size,
      requestId,
      retriedMinimal,
      usedReference: Boolean(referenceDecoded)
    });
  }catch(err){
    console.error('MeshDoctor AI error', err);
    return res.status(500).json({ error: err?.message || 'AI restoration failed' });
  }
}
