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
function makeEditForm(decoded,resolvedMode,size,{minimal=false}={}){
  const form=new FormData();
  form.append('model',MODEL);
  form.append('image[]',new Blob([decoded.bytes],{type:decoded.mime}),`meshdoctor-input.${decoded.ext}`);
  form.append('prompt',promptFor(resolvedMode));
  form.append('quality',QUALITY);
  if(!minimal){
    const outputFormat=resolvedMode==='document'?'png':'jpeg';
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
    const { image, mode = 'photo', width, height } = body;
    if(typeof image !== 'string') return res.status(400).json({ error: 'A base64 image data URL is required' });
    if(image.length > 20_000_000) return res.status(413).json({ error: 'Image payload is too large' });

    const decoded = decodeDataUrl(image);
    if(!decoded) return res.status(400).json({ error: 'Unsupported image data URL' });

    const resolvedMode = mode === 'document' ? 'document' : 'photo';
    const size = outputSize(width, height);
    let outputFormat = resolvedMode === 'document' ? 'png' : 'jpeg';
    let retriedMinimal=false;

    let {response:aiResponse,data,requestId}=await callImageEdit(makeEditForm(decoded,resolvedMode,size));
    if(!aiResponse.ok){
      const firstError=safeOpenAIError(data,aiResponse.status,requestId);
      console.error('MeshDoctor OpenAI image edit failed',{stage:'primary',status:firstError.status,code:firstError.code,type:firstError.type,param:firstError.param,message:firstError.message,requestId:firstError.requestId,model:MODEL,quality:QUALITY,size,mode:resolvedMode,outputFormat});
      if(shouldRetryMinimal(firstError)){
        retriedMinimal=true;
        ({response:aiResponse,data,requestId}=await callImageEdit(makeEditForm(decoded,resolvedMode,size,{minimal:true})));
        outputFormat='png';
      }
    }
    if(!aiResponse.ok){
      const error=safeOpenAIError(data,aiResponse.status,requestId);
      console.error('MeshDoctor OpenAI image edit failed',{stage:retriedMinimal?'minimal-retry':'primary',status:error.status,code:error.code,type:error.type,param:error.param,message:error.message,requestId:error.requestId,model:MODEL,quality:QUALITY,size,mode:resolvedMode});
      return res.status(aiResponse.status).json({
        error:error.message,
        diagnostic:{stage:'openai',status:error.status,code:error.code,type:error.type,param:error.param,requestId:error.requestId,model:MODEL,quality:QUALITY,size,mode:resolvedMode,retriedMinimal}
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
      retriedMinimal
    });
  }catch(err){
    console.error('MeshDoctor AI error', err);
    return res.status(500).json({ error: err?.message || 'AI restoration failed' });
  }
}
