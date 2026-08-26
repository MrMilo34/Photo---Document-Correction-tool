'use strict';

const $ = (id) => document.getElementById(id);
const views = { home: $('homeView'), label: $('labelView'), pdf: $('pdfView'), shape: $('shapeView'), result: $('resultView') };
const editCanvas = $('editCanvas'), ectx = editCanvas.getContext('2d', { willReadFrequently: true });
const resultCanvas = $('resultCanvas'), rctx = resultCanvas.getContext('2d', { willReadFrequently: true });
const loupe = $('loupe'), loupeCanvas = $('loupeCanvas'), lctx = loupeCanvas.getContext('2d');
const stageWrap = $('stageWrap'), canvasPan = $('canvasPan'), canvasZoom = $('canvasZoom');
const pointActions = $('pointActions'), movePointBtn = $('movePointBtn'), removePointBtn = $('removePointBtn'), zoomChip = $('zoomChip');
const sourceCanvas = document.createElement('canvas'), sctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
const workingCanvas = document.createElement('canvas'), wctx = workingCanvas.getContext('2d', { willReadFrequently: true });
const homeBgVideo = $('homeBgVideo');
const homeMeshCanvas = $('homeMeshCanvas');
const AI_ENDPOINT = (window.MESHDOCTOR_AI_ENDPOINT || '/api/ai-correct').trim();
let homeBgStream = null;
let homeBgTried = false;
let homeMeshCtx = null, homeMeshNodes = [], homeMeshRaf = 0, homeMeshLast = 0;
let aiServiceState = 'unknown';
let aiDiagnostics={endpoint:'unknown',openai:'unknown',model:'gpt-image-2',quality:'',last:'none',lastStatus:0,lastMessage:'',requestId:''};
let pdfItems = [];
let pdfSelectedId = null;
let pdfEditingId = null;
let pdfUid = 0;
let pdfDrag = null;
let pdfSuppressClickUntil = 0;
const SETTINGS_KEY = 'meshdoctor-settings-v1';
let userSettings = { pdfFilename:'MeshDoctor-created', pdfOutput:'download' };


let points = [];
let draggedIndex = -1;
let pointerMoved = false;
let downPos = null;
let correctedOriginal = null;
let correctedImage = null;
let aiAssistImage = null;
let aiReferenceDataUrl = '';
let aiReferenceName = '';
let adjustedImage = null;
let grayscaleImageCache = null;
let currentMode = 'corrected';
let aiRestoreChoice = null;
let adjustTimer = null;
const adjustments = { brightness:0, contrast:0, saturation:0, black:0, white:0 };
let history = [];
let currentFileBase = 'image';
let selectedIndex = -1;
let editZoom = 1, panX = 0, panY = 0;
let gesture = null, pinchState = null, pinchedUntilClear = false;
const activePointers = new Map();
let precisionMove = null;
const SELECT_RADIUS_CSS = 62;
const EDGE_TAP_RADIUS_CSS = 46;
const MAX_ZOOM = 5;
let shapeUiHideTimer = null;
function hideShapeUiTransient(delay=650){
  clearTimeout(shapeUiHideTimer);
  views.shape.classList.add('interaction-hide');
  shapeUiHideTimer=setTimeout(()=>views.shape.classList.remove('interaction-hide'),delay);
}
let lastSliderShardAt = 0;



function loadSettings(){
  try{
    const raw=localStorage.getItem(SETTINGS_KEY);
    if(!raw) return;
    const saved=JSON.parse(raw)||{};
    userSettings={...userSettings,...saved};
  }catch(err){ console.warn('Could not load settings', err); }
}
function saveSettings(){
  try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(userSettings)); }catch(err){ console.warn('Could not save settings', err); }
}
function syncSettingsUi(){
  const name=$('settingsPdfName'), output=$('settingsPdfOutput');
  if(name) name.value=userSettings.pdfFilename||'MeshDoctor-created';
  if(output) output.value=userSettings.pdfOutput||'download';
}
function openSettingsDialog(){ syncSettingsUi(); renderAiDiagnostics(); $('settingsDialog')?.showModal(); testAiConnection(); }
function closeSettingsDialog(){ if($('settingsDialog')?.open) $('settingsDialog').close(); }
function sanitizeFileName(name,fallback='MeshDoctor-created'){
  const cleaned=String(name||'').replace(/[\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim();
  return cleaned || fallback;
}
function sanitizeDisplayName(name,fallback='reference image'){
  return String(name||fallback).replace(/\s+/g,' ').trim() || fallback;
}
function updateAiReferenceUi(){
  const meta=$('aiReferenceMeta'), clear=$('aiReferenceClearBtn');
  if(meta){
    if(aiReferenceDataUrl){
      meta.textContent=`Using reference: ${aiReferenceName}. The AI will use it only to recover missing or glare-covered detail.`;
      meta.classList.add('ready');
    }else{
      meta.textContent='No reference added.';
      meta.classList.remove('ready');
    }
  }
  if(clear) clear.classList.toggle('hidden',!aiReferenceDataUrl);
}
function clearAiReference(silent=false){
  aiReferenceDataUrl='';
  aiReferenceName='';
  updateAiReferenceUi();
  if(!silent) toast('Reference image removed.');
}
async function fileToUploadDataUrl(file,mode='photo',maxEdge=1536){
  const bmp=await createImageBitmap(file);
  try{
    const scale=Math.min(1,maxEdge/Math.max(bmp.width,bmp.height));
    const out=document.createElement('canvas');
    out.width=Math.max(1,Math.round(bmp.width*scale));
    out.height=Math.max(1,Math.round(bmp.height*scale));
    const ctx=out.getContext('2d');
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';
    ctx.drawImage(bmp,0,0,out.width,out.height);
    const type=mode==='document'?'image/webp':'image/jpeg';
    let data=out.toDataURL(type,mode==='document'?.94:.9);
    if(data.length>3_800_000)data=out.toDataURL(type,mode==='document'?.88:.82);
    return data;
  }finally{ bmp.close?.(); }
}

async function startHomeCameraBg(){
  if(!homeBgVideo || homeBgStream || homeBgTried || !navigator.mediaDevices?.getUserMedia) return;
  homeBgTried = true;
  try{
    const stream = await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1280 }, height:{ ideal:720 } },
      audio:false
    });
    homeBgStream = stream;
    homeBgVideo.srcObject = stream;
    await homeBgVideo.play().catch(()=>{});
  }catch(err){
    console.warn('Home background camera unavailable', err);
  }
}
function stopHomeCameraBg(){
  if(!homeBgStream) return;
  homeBgStream.getTracks().forEach(t=>t.stop());
  homeBgStream = null;
  if(homeBgVideo) homeBgVideo.srcObject = null;
  homeBgTried = false;
}


function initAmbientShards(){
  const field=$('homeShardField');
  if(!field || field.childElementCount) return;
  const count=34;
  for(let i=0;i<count;i++){
    const s=document.createElement('span');
    s.className='ambient-shard';
    const size=6+Math.random()*10;
    s.style.width=s.style.height=`${size}px`;
    s.style.left=`${3+Math.random()*94}%`;
    s.style.top=`${5+Math.random()*90}%`;
    s.style.setProperty('--dur',`${3.2+Math.random()*3.8}s`);
    s.style.setProperty('--delay',`${-Math.random()*5}s`);
    s.style.setProperty('--drift',`${-26+Math.random()*52}px`);
    s.style.setProperty('--rot',`${Math.random()*180}deg`);
    field.appendChild(s);
  }
}

function resizeHomeMesh(){
  if(!homeMeshCanvas) return;
  const rect=homeMeshCanvas.getBoundingClientRect();
  if(rect.width<2||rect.height<2) return;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
  if(homeMeshCanvas.width===w&&homeMeshCanvas.height===h&&homeMeshNodes.length) return;
  homeMeshCanvas.width=w;homeMeshCanvas.height=h;
  homeMeshCtx=homeMeshCanvas.getContext('2d');
  homeMeshCtx.setTransform(dpr,0,0,dpr,0,0);
  const count=clamp(Math.round(rect.width*rect.height/11000),48,84);
  // Keep a healthy amount of mesh near the middle, but start with it spread wider so the screen feels alive immediately.
  homeMeshNodes=Array.from({length:count},(_,i)=>{
    const clustered=Math.random()<.58;
    const rx=clustered ? (0.10 + ((Math.random()+Math.random())/2)*0.80) : Math.random();
    const ry=clustered ? (0.08 + ((Math.random()+Math.random())/2)*0.82) : Math.random();
    return {
      x:rx*rect.width,
      y:ry*rect.height,
      vx:(Math.random()-.5)*10,vy:(Math.random()-.5)*8,
      r:1.1+Math.random()*1.95,phase:Math.random()*Math.PI*2,
      hot:i%8===0
    };
  });
}

function drawHomeMesh(ts=0){
  if(!homeMeshCanvas) return;
  homeMeshRaf=requestAnimationFrame(drawHomeMesh);
  if(document.hidden||!(views.home.classList.contains('active')||views.pdf.classList.contains('active'))){homeMeshLast=ts;return;}
  resizeHomeMesh();
  const ctx=homeMeshCtx;if(!ctx)return;
  const rect=homeMeshCanvas.getBoundingClientRect(),w=rect.width,h=rect.height;
  const dt=Math.min(.033,Math.max(.001,(ts-homeMeshLast)/1000||.016));homeMeshLast=ts;
  ctx.clearRect(0,0,w,h);
  for(const n of homeMeshNodes){
    n.x+=n.vx*dt;n.y+=n.vy*dt;
    if(n.x<-12){n.x=w+12}else if(n.x>w+12){n.x=-12}
    if(n.y<-12){n.y=h+12}else if(n.y>h+12){n.y=-12}
  }
  const maxDist=Math.min(176,Math.max(126,w*.245));
  const cx=w*.5,cy=h*.44,maxR=Math.hypot(w*.47,h*.44);
  const strengthAt=(x,y)=>{
    const r=Math.hypot(x-cx,y-cy)/Math.max(1,maxR);
    // Strongest around the middle, with the outside falling away quickly.
    return .09+1.22*Math.pow(clamp(1-r,0,1),1.82);
  };
  ctx.lineWidth=1.02;
  for(let i=0;i<homeMeshNodes.length;i++)for(let j=i+1;j<homeMeshNodes.length;j++){
    const a=homeMeshNodes[i],b=homeMeshNodes[j],dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);
    if(d>maxDist)continue;
    const midStrength=strengthAt((a.x+b.x)/2,(a.y+b.y)/2);
    const alpha=(1-d/maxDist)*.62*midStrength;
    const hotLine=(a.hot||b.hot)&&midStrength>.52;
    ctx.strokeStyle=hotLine?`rgba(164,89,255,${alpha*.9})`:`rgba(53,207,255,${alpha})`;
    ctx.shadowBlur=midStrength>.7?5:0;ctx.shadowColor=hotLine?'rgba(255,79,227,.42)':'rgba(53,207,255,.40)';
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
  for(const n of homeMeshNodes){
    const pulse=.72+.28*Math.sin(ts*.0013+n.phase),strength=strengthAt(n.x,n.y);
    ctx.shadowBlur=(n.hot?18:11)*strength;ctx.shadowColor=n.hot?'rgba(255,79,227,.95)':'rgba(53,207,255,.88)';
    const alpha=(n.hot?(.68+.26*pulse):(.60+.26*pulse))*strength;
    ctx.fillStyle=n.hot?`rgba(255,79,227,${alpha})`:`rgba(105,135,255,${alpha})`;
    ctx.beginPath();ctx.arc(n.x,n.y,n.r*pulse*(.85+.35*strength),0,Math.PI*2);ctx.fill();
  }
  ctx.shadowBlur=0;
}

function initHomeMesh(){
  if(!homeMeshCanvas||homeMeshRaf)return;
  resizeHomeMesh();homeMeshRaf=requestAnimationFrame(drawHomeMesh);
  window.addEventListener('resize',resizeHomeMesh,{passive:true});
}

function showView(name){
  Object.values(views).forEach(v=>v.classList.remove('active'));
  views[name].classList.add('active');
  document.body.classList.toggle('result-mode', name==='result');
  document.body.classList.toggle('home-mode', name==='home');
  document.body.classList.toggle('pdf-mode', name==='pdf');
  document.body.classList.toggle('ambient-mode', name==='home'||name==='pdf'||name==='label');
  if(name!=='shape') hidePointActions();
  if(name==='home'||name==='pdf'||name==='label') startHomeCameraBg();
  else stopHomeCameraBg();
  if(name==='result') updateResultActions();
  if(name==='pdf') renderPdfBuilder();
  window.scrollTo(0,0);
}
function busy(on, text='Working…'){ $('busyText').textContent=text; $('busy').classList.toggle('hidden', !on); }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),2200); }
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

async function loadFile(file, options={}){
  if(!file) return;
  clearAiReference(true);
  pdfEditingId = options.pdfItemId || null;
  currentFileBase = (file.name || 'image').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'_') || 'image';
  busy(true,'Loading photo…');
  try{
    const bmp = await createImageBitmap(file);
    const maxDim = 2400;
    const scale = Math.min(1, maxDim / Math.max(bmp.width,bmp.height));
    sourceCanvas.width = Math.round(bmp.width*scale); sourceCanvas.height = Math.round(bmp.height*scale);
    sctx.clearRect(0,0,sourceCanvas.width,sourceCanvas.height);
    sctx.drawImage(bmp,0,0,sourceCanvas.width,sourceCanvas.height);
    bmp.close?.();
    setupEditCanvas();
    points = autoDetectDocument();
    history=[];
    selectedIndex=-1;
    resetViewport();
    renderEditor();
    showView('shape');
  }catch(err){ console.error(err); toast('Could not open that image.'); }
  finally{ busy(false); }
}

function setupEditCanvas(){
  editCanvas.width=sourceCanvas.width; editCanvas.height=sourceCanvas.height;
}

function defaultQuad(){
  const w=sourceCanvas.width,h=sourceCanvas.height, m=.06;
  return [
    {x:w*m,y:h*m,corner:0},{x:w*(1-m),y:h*m,corner:1},
    {x:w*(1-m),y:h*(1-m),corner:2},{x:w*m,y:h*(1-m),corner:3}
  ];
}

function otsuThreshold(hist,total){
  let sum=0; for(let i=0;i<256;i++) sum += i*hist[i];
  let sumB=0,wB=0,maxVar=-1,thr=128;
  for(let t=0;t<256;t++){
    wB += hist[t]; if(!wB) continue;
    const wF=total-wB; if(!wF) break;
    sumB += t*hist[t];
    const mB=sumB/wB, mF=(sum-sumB)/wF;
    const v=wB*wF*(mB-mF)*(mB-mF);
    if(v>maxVar){maxVar=v;thr=t;}
  }
  return thr;
}

function autoDetectDocument(){
  try{
    const max=360, sc=Math.min(1,max/Math.max(sourceCanvas.width,sourceCanvas.height));
    const w=Math.max(2,Math.round(sourceCanvas.width*sc)), h=Math.max(2,Math.round(sourceCanvas.height*sc));
    const c=document.createElement('canvas'); c.width=w;c.height=h; const cx=c.getContext('2d',{willReadFrequently:true});
    cx.drawImage(sourceCanvas,0,0,w,h);
    const data=cx.getImageData(0,0,w,h).data;
    const gray=new Uint8Array(w*h), hist=new Uint32Array(256);
    let centerSum=0,centerN=0,borderSum=0,borderN=0;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const i=(y*w+x)*4; const g=Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2]); gray[y*w+x]=g;hist[g]++;
      const border=x<w*.12||x>w*.88||y<h*.12||y>h*.88;
      const center=x>w*.25&&x<w*.75&&y>h*.25&&y<h*.75;
      if(border){borderSum+=g;borderN++;} if(center){centerSum+=g;centerN++;}
    }
    let thr=otsuThreshold(hist,w*h);
    const brightForeground=(centerSum/centerN) >= (borderSum/borderN);
    const mask=new Uint8Array(w*h);
    for(let i=0;i<mask.length;i++) mask[i]=brightForeground ? (gray[i]>thr?1:0) : (gray[i]<thr?1:0);
    // Ignore a 1px frame; it often contains camera/background artifacts.
    for(let x=0;x<w;x++){mask[x]=0;mask[(h-1)*w+x]=0;} for(let y=0;y<h;y++){mask[y*w]=0;mask[y*w+w-1]=0;}

    const seen=new Uint8Array(w*h); let best=[];
    const stack=new Int32Array(w*h);
    for(let y=1;y<h-1;y+=2) for(let x=1;x<w-1;x+=2){
      const seed=y*w+x; if(!mask[seed]||seen[seed]) continue;
      let top=0, n=0; stack[top++]=seed; seen[seed]=1; const comp=[];
      while(top){
        const p=stack[--top]; comp.push(p); n++;
        const px=p%w, py=(p/w)|0;
        const neigh=[p-1,p+1,p-w,p+w];
        for(const q of neigh){ if(q<0||q>=mask.length||seen[q]||!mask[q]) continue; const qx=q%w,qy=(q/w)|0; if(qx===0||qx===w-1||qy===0||qy===h-1) continue; seen[q]=1; stack[top++]=q; }
      }
      if(comp.length>best.length) best=comp;
    }
    if(best.length < w*h*.05) return defaultQuad();
    let tl=null,tr=null,br=null,bl=null,minSum=1e9,maxSum=-1e9,maxDiff=-1e9,minDiff=1e9;
    for(const p of best){ const x=p%w,y=(p/w)|0,s=x+y,d=x-y; if(s<minSum){minSum=s;tl={x,y}} if(s>maxSum){maxSum=s;br={x,y}} if(d>maxDiff){maxDiff=d;tr={x,y}} if(d<minDiff){minDiff=d;bl={x,y}} }
    if(!tl||!tr||!br||!bl) return defaultQuad();
    const inv=1/sc;
    const q=[{...tl,corner:0},{...tr,corner:1},{...br,corner:2},{...bl,corner:3}].map(p=>({x:clamp(p.x*inv,0,sourceCanvas.width-1),y:clamp(p.y*inv,0,sourceCanvas.height-1),corner:p.corner}));
    const area=Math.abs(polygonArea(q));
    if(area < sourceCanvas.width*sourceCanvas.height*.12) return defaultQuad();
    return q;
  }catch(e){ console.warn('Auto detect fallback',e); return defaultQuad(); }
}

function polygonArea(ps){let a=0;for(let i=0;i<ps.length;i++){const p=ps[i],q=ps[(i+1)%ps.length];a+=p.x*q.y-q.x*p.y;}return a/2;}

function applyViewport(showChip=false){
  if(editZoom<=1.01)editZoom=1;
  clampPan();
  canvasPan.style.transform=`translate3d(${panX}px,${panY}px,0)`;
  canvasZoom.style.transform=`scale(${editZoom})`;
  views.shape.classList.toggle('focus-edit',editZoom>1.18 || !!precisionMove);
  if(showChip || editZoom>1.02){
    zoomChip.textContent=`${editZoom.toFixed(1)}×`;
    zoomChip.classList.remove('hidden');
    clearTimeout(applyViewport._chipTimer);
    applyViewport._chipTimer=setTimeout(()=>zoomChip.classList.add('hidden'),850);
  }else zoomChip.classList.add('hidden');
  updatePointActions();
}
function resetViewport(){
  editZoom=1;panX=0;panY=0;pinchState=null;gesture=null;pinchedUntilClear=false;activePointers.clear();
  views.shape.classList.remove('interaction-hide');clearTimeout(shapeUiHideTimer);
  applyViewport(false);
}
function clampPan(){
  const r=stageWrap.getBoundingClientRect();
  // Even at 1x, allow roughly 25% of the viewport in every direction so edge points can be pulled away from phone chrome.
  const range=.25 + Math.max(0,editZoom-1)*.72;
  const mx=r.width*Math.min(2.4,range), my=r.height*Math.min(2.4,range);
  panX=clamp(panX,-mx,mx);panY=clamp(panY,-my,my);
}
function hidePointActions(){pointActions.classList.add('hidden');}
function selectPoint(index,show=true){
  if(index<0||index>=points.length){selectedIndex=-1;hidePointActions();return;}
  selectedIndex=index;renderEditor();
  if(show){pointActions.classList.remove('hidden');updatePointActions();}
}
function updatePointActions(){
  if(pointActions.classList.contains('hidden')||selectedIndex<0||!points[selectedIndex]||!views.shape.classList.contains('active'))return;
  const cr=editCanvas.getBoundingClientRect(), sr=stageWrap.getBoundingClientRect(), p=points[selectedIndex];
  if(!cr.width||!cr.height)return;
  let x=cr.left-sr.left+(p.x/editCanvas.width)*cr.width;
  let y=cr.top-sr.top+(p.y/editCanvas.height)*cr.height;
  x=clamp(x,90,sr.width-90);y=clamp(y,28,sr.height-28);
  pointActions.style.left=`${x}px`;pointActions.style.top=`${y}px`;
  removePointBtn.disabled=p.corner!==undefined;
  removePointBtn.title=p.corner!==undefined?'The four corner points cannot be removed.':'Remove this point';
}

function renderEditor(){
  ectx.clearRect(0,0,editCanvas.width,editCanvas.height); ectx.drawImage(sourceCanvas,0,0);
  if(!points.length)return;
  ectx.save();
  ectx.fillStyle='rgba(0,0,0,.42)'; ectx.beginPath(); ectx.rect(0,0,editCanvas.width,editCanvas.height);
  ectx.moveTo(points[0].x,points[0].y); for(let i=1;i<points.length;i++) ectx.lineTo(points[i].x,points[i].y); ectx.closePath();
  ectx.fill('evenodd');
  ectx.lineJoin='round'; ectx.lineCap='round'; ectx.strokeStyle='#48d6ff'; ectx.lineWidth=Math.max(4,editCanvas.width/400);
  ectx.beginPath(); points.forEach((p,i)=>i?ectx.lineTo(p.x,p.y):ectx.moveTo(p.x,p.y)); ectx.closePath(); ectx.stroke();
  const r=Math.max(13,editCanvas.width/90);
  points.forEach((p,i)=>{
    if(i===selectedIndex){
      ectx.beginPath();ectx.arc(p.x,p.y,(p.corner!==undefined?r*1.08:r)+r*.62,0,Math.PI*2);
      ectx.fillStyle='rgba(255,255,255,.15)';ectx.fill();ectx.lineWidth=Math.max(2,editCanvas.width/900);ectx.strokeStyle='rgba(255,255,255,.88)';ectx.stroke();
    }
    ectx.beginPath(); ectx.arc(p.x,p.y,p.corner!==undefined?r*1.08:r,0,Math.PI*2);
    ectx.fillStyle=p.corner!==undefined?'#ff4fe3':'#6987ff'; ectx.fill(); ectx.lineWidth=Math.max(3,editCanvas.width/600); ectx.strokeStyle='#fff'; ectx.stroke();
  });
  ectx.restore();
  updatePointActions();
}

function eventToCanvas(ev){
  const rect=editCanvas.getBoundingClientRect(); return {x:(ev.clientX-rect.left)*editCanvas.width/rect.width,y:(ev.clientY-rect.top)*editCanvas.height/rect.height};
}
function nearestPoint(pos,radiusCss=SELECT_RADIUS_CSS){
  let best=-1,bd=Infinity;points.forEach((p,i)=>{const d=Math.hypot(p.x-pos.x,p.y-pos.y);if(d<bd){bd=d;best=i}});
  const rect=editCanvas.getBoundingClientRect();const threshold=radiusCss*editCanvas.width/Math.max(1,rect.width);return bd<threshold?best:-1;
}
function pointSegDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;if(!l2)return {d:Math.hypot(p.x-a.x,p.y-a.y),t:0};let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/l2;t=clamp(t,0,1);const x=a.x+t*dx,y=a.y+t*dy;return {d:Math.hypot(p.x-x,p.y-y),t,x,y};}
function addPointAt(pos){
  const existing=nearestPoint(pos,SELECT_RADIUS_CSS+8);
  if(existing>=0){selectPoint(existing,true);return;}
  let best={d:Infinity,i:-1,x:pos.x,y:pos.y};
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],r=pointSegDistance(pos,a,b);if(r.d<best.d)best={...r,i};}
  const rect=editCanvas.getBoundingClientRect(); const maxD=EDGE_TAP_RADIUS_CSS*editCanvas.width/Math.max(1,rect.width);
  if(best.d>maxD){hidePointActions();toast('Tap the blue perimeter to add a point.');return;}
  const np={x:best.x,y:best.y}; history.push(points.map(p=>({...p}))); points.splice(best.i+1,0,np); selectedIndex=best.i+1; renderEditor();pointActions.classList.remove('hidden');updatePointActions();
}
function showLoupe(p,ev){
  const crop=Math.max(34,105/Math.max(1,Math.sqrt(editZoom))), zoom=3.0; lctx.clearRect(0,0,160,160);
  const sx=clamp(p.x-crop/(2*zoom),0,Math.max(0,sourceCanvas.width-crop/zoom)),sy=clamp(p.y-crop/(2*zoom),0,Math.max(0,sourceCanvas.height-crop/zoom));
  lctx.imageSmoothingEnabled=true; lctx.drawImage(sourceCanvas,sx,sy,crop/zoom,crop/zoom,0,0,160,160);
  const stage=stageWrap.getBoundingClientRect();
  let left=ev.clientX-stage.left-82, top=ev.clientY-stage.top-205; left=clamp(left,4,stage.width-168); if(top<4) top=ev.clientY-stage.top+45;
  loupe.style.left=left+'px'; loupe.style.top=clamp(top,4,stage.height-168)+'px'; loupe.classList.remove('hidden');
}
function screenDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function midpoint(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
function startPinch(){
  const ps=[...activePointers.values()];if(ps.length<2)return;
  const a=ps[0],b=ps[1]; pinchState={distance:Math.max(1,screenDistance(a,b)),zoom:editZoom,panX,panY,mid:midpoint(a,b)};
  pinchedUntilClear=true;gesture=null;hidePointActions();loupe.classList.add('hidden');
}
function handlePinch(){
  hideShapeUiTransient(900);
  if(!pinchState||activePointers.size<2)return;const ps=[...activePointers.values()],a=ps[0],b=ps[1];
  const dist=Math.max(1,screenDistance(a,b)), mid=midpoint(a,b), newZoom=clamp(pinchState.zoom*(dist/pinchState.distance),1,MAX_ZOOM), factor=newZoom/pinchState.zoom;
  const sr=stageWrap.getBoundingClientRect(),cx=sr.left+sr.width/2,cy=sr.top+sr.height/2;
  panX=(mid.x-cx)-factor*(pinchState.mid.x-cx-pinchState.panX);
  panY=(mid.y-cy)-factor*(pinchState.mid.y-cy-pinchState.panY);
  editZoom=newZoom;clampPan();applyViewport(true);
}

editCanvas.addEventListener('pointerdown',ev=>{
  hideShapeUiTransient(900);
  ev.preventDefault();editCanvas.setPointerCapture?.(ev.pointerId);activePointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
  if(activePointers.size>=2){startPinch();return;}
  const p=eventToCanvas(ev),idx=nearestPoint(p);
  if(idx>=0){
    selectedIndex=idx;renderEditor();hidePointActions();
    gesture={type:'point',pointerId:ev.pointerId,startClient:{x:ev.clientX,y:ev.clientY},startCanvas:p,origin:{x:points[idx].x,y:points[idx].y},index:idx,moved:false,historySaved:false};
  }else{
    hidePointActions();
    gesture={type:'blank',pointerId:ev.pointerId,startClient:{x:ev.clientX,y:ev.clientY},downCanvas:p,panStart:{x:panX,y:panY},moved:false};
  }
});
editCanvas.addEventListener('pointermove',ev=>{
  if(activePointers.has(ev.pointerId))hideShapeUiTransient(900);
  if(activePointers.has(ev.pointerId))activePointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
  if(pinchedUntilClear&&activePointers.size>=2){handlePinch();return;}
  if(!gesture||gesture.pointerId!==ev.pointerId||pinchedUntilClear)return;
  ev.preventDefault();const dist=Math.hypot(ev.clientX-gesture.startClient.x,ev.clientY-gesture.startClient.y);
  if(gesture.type==='point'){
    if(dist<5&&!gesture.moved)return;
    if(!gesture.historySaved){history.push(points.map(q=>({...q})));gesture.historySaved=true;}
    gesture.moved=true;hidePointActions();
    const p=eventToCanvas(ev), factor=editZoom>1.05?.62:.78, target=points[gesture.index];
    target.x=clamp(gesture.origin.x+(p.x-gesture.startCanvas.x)*factor,0,editCanvas.width-1);
    target.y=clamp(gesture.origin.y+(p.y-gesture.startCanvas.y)*factor,0,editCanvas.height-1);
    selectedIndex=gesture.index;renderEditor();showLoupe(target,ev);applyViewport(false);
  }else if(gesture.type==='blank'){
    if(dist>7)gesture.moved=true;
    if(gesture.moved){panX=gesture.panStart.x+(ev.clientX-gesture.startClient.x);panY=gesture.panStart.y+(ev.clientY-gesture.startClient.y);clampPan();applyViewport(false);}
  }
});
editCanvas.addEventListener('pointerup',ev=>{
  hideShapeUiTransient(520);
  ev.preventDefault();activePointers.delete(ev.pointerId);loupe.classList.add('hidden');
  if(pinchedUntilClear){if(activePointers.size===0){pinchedUntilClear=false;pinchState=null;gesture=null;applyViewport(true);}return;}
  if(!gesture||gesture.pointerId!==ev.pointerId)return;
  const g=gesture;gesture=null;
  if(g.type==='point'){
    selectedIndex=g.index;renderEditor();pointActions.classList.remove('hidden');updatePointActions();applyViewport(false);
  }else if(!g.moved){addPointAt(g.downCanvas);}else applyViewport(false);
});
editCanvas.addEventListener('pointercancel',ev=>{hideShapeUiTransient(420);activePointers.delete(ev.pointerId);loupe.classList.add('hidden');if(activePointers.size===0){gesture=null;pinchState=null;pinchedUntilClear=false;}applyViewport(false);});

movePointBtn.addEventListener('pointerdown',ev=>{
  hideShapeUiTransient(900);
  ev.preventDefault();ev.stopPropagation();if(selectedIndex<0||!points[selectedIndex])return;
  movePointBtn.setPointerCapture?.(ev.pointerId);
  precisionMove={pointerId:ev.pointerId,index:selectedIndex,startX:ev.clientX,startY:ev.clientY,origin:{x:points[selectedIndex].x,y:points[selectedIndex].y},historySaved:false,moved:false};
  hidePointActions();views.shape.classList.add('focus-edit');showLoupe(points[selectedIndex],ev);
});
movePointBtn.addEventListener('pointermove',ev=>{
  if(precisionMove)hideShapeUiTransient(900);
  if(!precisionMove||precisionMove.pointerId!==ev.pointerId)return;ev.preventDefault();
  const dx=ev.clientX-precisionMove.startX,dy=ev.clientY-precisionMove.startY;if(Math.hypot(dx,dy)<2&&!precisionMove.moved)return;
  if(!precisionMove.historySaved){history.push(points.map(q=>({...q})));precisionMove.historySaved=true;}precisionMove.moved=true;
  const rect=editCanvas.getBoundingClientRect(),factor=.42,cpX=editCanvas.width/Math.max(1,rect.width),cpY=editCanvas.height/Math.max(1,rect.height),p=points[precisionMove.index];
  p.x=clamp(precisionMove.origin.x+dx*cpX*factor,0,editCanvas.width-1);p.y=clamp(precisionMove.origin.y+dy*cpY*factor,0,editCanvas.height-1);
  selectedIndex=precisionMove.index;renderEditor();showLoupe(p,ev);
});
function endPrecisionMove(ev){
  if(!precisionMove||precisionMove.pointerId!==ev.pointerId)return;ev.preventDefault();loupe.classList.add('hidden');
  selectedIndex=precisionMove.index;precisionMove=null;renderEditor();pointActions.classList.remove('hidden');updatePointActions();applyViewport(false);
}
movePointBtn.addEventListener('pointerup',endPrecisionMove);movePointBtn.addEventListener('pointercancel',endPrecisionMove);
removePointBtn.addEventListener('click',ev=>{
  ev.stopPropagation();if(selectedIndex<0||!points[selectedIndex])return;
  if(points[selectedIndex].corner!==undefined){toast('The four corner points cannot be removed.');return;}
  history.push(points.map(q=>({...q})));points.splice(selectedIndex,1);selectedIndex=-1;hidePointActions();renderEditor();
});

function getEdgePoints(cornerA,cornerB){
  const ia=points.findIndex(p=>p.corner===cornerA), ib=points.findIndex(p=>p.corner===cornerB); if(ia<0||ib<0)return [];
  const out=[]; let i=ia; while(true){out.push(points[i]);if(i===ib)break;i=(i+1)%points.length;if(out.length>points.length+1)break;} return out;
}
function polyLength(ps){let s=0;for(let i=1;i<ps.length;i++)s+=Math.hypot(ps[i].x-ps[i-1].x,ps[i].y-ps[i-1].y);return s;}
function samplePolyline(ps,t){
  if(ps.length===1)return ps[0]; const lens=[];let total=0;for(let i=1;i<ps.length;i++){const l=Math.hypot(ps[i].x-ps[i-1].x,ps[i].y-ps[i-1].y);lens.push(l);total+=l;} if(total<1)return ps[0];
  let target=t*total,acc=0;for(let i=0;i<lens.length;i++){if(target<=acc+lens[i]||i===lens.length-1){const f=lens[i]?((target-acc)/lens[i]):0;return{x:ps[i].x+(ps[i+1].x-ps[i].x)*f,y:ps[i].y+(ps[i+1].y-ps[i].y)*f};}acc+=lens[i];}return ps[ps.length-1];
}

function chooseDocumentRatio(rawRatio){
  const portrait=[8.5/11, 1/Math.sqrt(2), 8.5/14, 1.0];
  const candidates = rawRatio >= 1 ? portrait.map(r=>1/r) : portrait;
  let best=rawRatio, bestErr=Infinity;
  for(const r of candidates){
    const err=Math.abs(Math.log(rawRatio/r));
    if(err<bestErr){ bestErr=err; best=r; }
  }
  return bestErr < 0.18 ? best : rawRatio;
}

function makeCorrected(){
  const top=getEdgePoints(0,1), right=getEdgePoints(1,2), bottom=getEdgePoints(2,3), left=getEdgePoints(3,0);
  if([top,right,bottom,left].some(e=>e.length<2)) throw new Error('Invalid perimeter');
  const rawW=(polyLength(top)+polyLength(bottom))/2, rawH=(polyLength(left)+polyLength(right))/2;
  const rawRatio=rawW/Math.max(rawH,1), snappedRatio=chooseDocumentRatio(rawRatio);
  const maxOut=2000, baseScale=Math.min(1,maxOut/Math.max(rawW,rawH));
  const area=Math.max(320*320, rawW*rawH*baseScale*baseScale);
  let W=Math.max(320,Math.round(Math.sqrt(area*snappedRatio))), H=Math.max(320,Math.round(Math.sqrt(area/snappedRatio)));
  const fit=Math.min(1,maxOut/Math.max(W,H));
  W=Math.max(320,Math.round(W*fit)); H=Math.max(320,Math.round(H*fit));
  workingCanvas.width=W;workingCanvas.height=H;
  const src=sctx.getImageData(0,0,sourceCanvas.width,sourceCanvas.height), sd=src.data;
  const out=wctx.createImageData(W,H), od=out.data, sw=sourceCanvas.width,sh=sourceCanvas.height;
  const topX=new Float32Array(W),topY=new Float32Array(W),botX=new Float32Array(W),botY=new Float32Array(W);
  const leftX=new Float32Array(H),leftY=new Float32Array(H),rightX=new Float32Array(H),rightY=new Float32Array(H);
  for(let x=0;x<W;x++){const u=x/(W-1),a=samplePolyline(top,u),b=samplePolyline(bottom,1-u);topX[x]=a.x;topY[x]=a.y;botX[x]=b.x;botY[x]=b.y;}
  for(let y=0;y<H;y++){const v=y/(H-1),l=samplePolyline(left,1-v),r=samplePolyline(right,v);leftX[y]=l.x;leftY[y]=l.y;rightX[y]=r.x;rightY[y]=r.y;}
  const TL=points.find(p=>p.corner===0),TR=points.find(p=>p.corner===1),BR=points.find(p=>p.corner===2),BL=points.find(p=>p.corner===3);
  let oi=0;
  for(let y=0;y<H;y++){
    const v=y/(H-1),lvx=leftX[y],lvy=leftY[y],rvx=rightX[y],rvy=rightY[y];
    for(let x=0;x<W;x++){
      const u=x/(W-1);
      const bilx=(1-u)*(1-v)*TL.x+u*(1-v)*TR.x+(1-u)*v*BL.x+u*v*BR.x;
      const bily=(1-u)*(1-v)*TL.y+u*(1-v)*TR.y+(1-u)*v*BL.y+u*v*BR.y;
      let sx=(1-v)*topX[x]+v*botX[x]+(1-u)*lvx+u*rvx-bilx;
      let sy=(1-v)*topY[x]+v*botY[x]+(1-u)*lvy+u*rvy-bily;
      sx=clamp(sx,0,sw-1.001);sy=clamp(sy,0,sh-1.001);
      const x0=sx|0,y0=sy|0,x1=Math.min(x0+1,sw-1),y1=Math.min(y0+1,sh-1),fx=sx-x0,fy=sy-y0;
      const i00=(y0*sw+x0)*4,i10=(y0*sw+x1)*4,i01=(y1*sw+x0)*4,i11=(y1*sw+x1)*4;
      for(let c=0;c<3;c++){const a=sd[i00+c]*(1-fx)+sd[i10+c]*fx,b=sd[i01+c]*(1-fx)+sd[i11+c]*fx;od[oi+c]=a*(1-fy)+b*fy;}od[oi+3]=255;oi+=4;
    }
  }
  wctx.putImageData(out,0,0); return out;
}

function cleanupImage(img){
  // Stronger local "AI Assist" polish while remaining tied to the original photographed pixels.
  const W=img.width,H=img.height,src=img.data;
  const out=new ImageData(new Uint8ClampedArray(src),W,H),d=out.data;
  const step=Math.max(18,Math.round(Math.max(W,H)/84)), gw=Math.ceil(W/step), gh=Math.ceil(H/step);
  const count=gw*gh;
  const lumGrid=new Float32Array(count), rGrid=new Float32Array(count), gGrid=new Float32Array(count), bGrid=new Float32Array(count), wGrid=new Float32Array(count);
  let globalR=0,globalG=0,globalB=0,globalW=0;
  for(let y=0;y<H;y+=2) for(let x=0;x<W;x+=2){
    const i=(y*W+x)*4;
    const r=src[i], g=src[i+1], b=src[i+2];
    const lum=.299*r+.587*g+.114*b;
    const w=Math.pow(clamp((lum-108)/132,0,1),1.45)+0.04;
    const cell=Math.floor(y/step)*gw+Math.floor(x/step);
    lumGrid[cell]+=lum*w; rGrid[cell]+=r*w; gGrid[cell]+=g*w; bGrid[cell]+=b*w; wGrid[cell]+=w;
    globalR+=r*w; globalG+=g*w; globalB+=b*w; globalW+=w;
  }
  const fallbackR=globalW?globalR/globalW:232, fallbackG=globalW?globalG/globalW:232, fallbackB=globalW?globalB/globalW:232;
  for(let i=0;i<count;i++){
    if(wGrid[i]>.001){lumGrid[i]/=wGrid[i]; rGrid[i]/=wGrid[i]; gGrid[i]/=wGrid[i]; bGrid[i]/=wGrid[i];}
    else{lumGrid[i]=236; rGrid[i]=fallbackR; gGrid[i]=fallbackG; bGrid[i]=fallbackB;}
  }
  for(let pass=0;pass<4;pass++){
    const nLum=new Float32Array(count), nR=new Float32Array(count), nG=new Float32Array(count), nB=new Float32Array(count);
    for(let y=0;y<gh;y++) for(let x=0;x<gw;x++){
      let sLum=0,sR=0,sG=0,sB=0,weight=0;
      for(let yy=Math.max(0,y-2);yy<=Math.min(gh-1,y+2);yy++) for(let xx=Math.max(0,x-2);xx<=Math.min(gw-1,x+2);xx++){
        const dx=xx-x,dy=yy-y, idx=yy*gw+xx, w=(dx===0&&dy===0)?3:((Math.abs(dx)+Math.abs(dy)===1)?2:1);
        sLum+=lumGrid[idx]*w; sR+=rGrid[idx]*w; sG+=gGrid[idx]*w; sB+=bGrid[idx]*w; weight+=w;
      }
      const idx=y*gw+x;
      nLum[idx]=sLum/weight; nR[idx]=sR/weight; nG[idx]=sG/weight; nB[idx]=sB/weight;
    }
    lumGrid.set(nLum); rGrid.set(nR); gGrid.set(nG); bGrid.set(nB);
  }
  const base=new Uint8ClampedArray(src.length);
  let p=0;
  for(let y=0;y<H;y++){
    const gy=y/step, y0=Math.min(gh-1,Math.floor(gy)), y1=Math.min(gh-1,y0+1), fy=gy-y0;
    for(let x=0;x<W;x++,p+=4){
      const gx=x/step, x0=Math.min(gw-1,Math.floor(gx)), x1=Math.min(gw-1,x0+1), fx=gx-x0;
      const i00=y0*gw+x0, i10=y0*gw+x1, i01=y1*gw+x0, i11=y1*gw+x1;
      const interp=(arr)=>{const a=arr[i00]*(1-fx)+arr[i10]*fx, b=arr[i01]*(1-fx)+arr[i11]*fx; return a*(1-fy)+b*fy;};
      const illum=interp(lumGrid), ir=interp(rGrid), ig=interp(gGrid), ib=interp(bGrid);
      const shadowBoost=clamp((228-illum)/140,0,1);
      const gainL=clamp(244/Math.max(illum,62),0.8,1.82);
      const gains=[clamp((242/Math.max(ir,72))*(0.82+shadowBoost*0.28),0.82,1.72),clamp((242/Math.max(ig,72))*(0.82+shadowBoost*0.28),0.82,1.72),clamp((242/Math.max(ib,72))*(0.82+shadowBoost*0.28),0.82,1.72)];
      for(let c=0;c<3;c++){
        const sv=src[p+c];
        let v=sv*(gains[c]*0.6 + gainL*0.4);
        v=(v-128)*(1.05+shadowBoost*0.08)+128;
        if(v>220) v=220+(v-220)*(1.18+shadowBoost*0.08);
        base[p+c]=clamp(v,0,255);
      }
      base[p+3]=255;
    }
  }
  // Mild clarity boost from immediate neighbours.
  p=0;
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++,p+=4){
      for(let c=0;c<3;c++){
        let v=base[p+c];
        if(x>0&&x<W-1&&y>0&&y<H-1){
          const up=((y-1)*W+x)*4+c, dn=((y+1)*W+x)*4+c, lf=(y*W+x-1)*4+c, rt=(y*W+x+1)*4+c;
          const blur=(base[up]+base[dn]+base[lf]+base[rt])*0.25;
          v=v+(v-blur)*0.16;
        }
        d[p+c]=clamp(v,0,255);
      }
      d[p+3]=255;
    }
  }
  return out;
}



function aggressiveCleanupImage(img){
  // Strongest restoration mode aimed at a clean digital / print-screen style document.
  // Still uses only the photographed pixels, but pushes illumination normalization harder.
  const base = cleanupImage(img);
  const W=base.width,H=base.height, src=base.data;
  const step=Math.max(18,Math.round(Math.max(W,H)/92)), gw=Math.ceil(W/step), gh=Math.ceil(H/step), count=gw*gh;
  const bgR=new Float32Array(count), bgG=new Float32Array(count), bgB=new Float32Array(count), bgL=new Float32Array(count), bgW=new Float32Array(count);

  for(let y=0;y<H;y+=2) for(let x=0;x<W;x+=2){
    const i=(y*W+x)*4, r=src[i], g=src[i+1], b=src[i+2];
    const maxv=Math.max(r,g,b), minv=Math.min(r,g,b);
    const lum=.299*r+.587*g+.114*b;
    const sat=(maxv-minv)/Math.max(1,maxv);
    const paperWeight=(Math.pow(clamp((lum-96)/148,0,1),1.25) * (1.15 - Math.min(.72,sat*1.05))) + 0.05;
    const cell=Math.floor(y/step)*gw+Math.floor(x/step);
    bgR[cell]+=r*paperWeight; bgG[cell]+=g*paperWeight; bgB[cell]+=b*paperWeight; bgL[cell]+=lum*paperWeight; bgW[cell]+=paperWeight;
  }
  let meanR=246,meanG=246,meanB=246,meanL=246,sumW=0,sumR=0,sumG=0,sumB=0,sumL=0;
  for(let i=0;i<count;i++){
    if(bgW[i]>.001){ bgR[i]/=bgW[i]; bgG[i]/=bgW[i]; bgB[i]/=bgW[i]; bgL[i]/=bgW[i]; }
    else { bgR[i]=246; bgG[i]=246; bgB[i]=246; bgL[i]=246; }
    sumR+=bgR[i]; sumG+=bgG[i]; sumB+=bgB[i]; sumL+=bgL[i]; sumW++;
  }
  meanR=sumR/sumW; meanG=sumG/sumW; meanB=sumB/sumW; meanL=sumL/sumW;
  for(let pass=0; pass<4; pass++){
    const nR=new Float32Array(count), nG=new Float32Array(count), nB=new Float32Array(count), nL=new Float32Array(count);
    for(let y=0;y<gh;y++) for(let x=0;x<gw;x++){
      let sr=0,sg=0,sb=0,sl=0,w=0;
      for(let yy=Math.max(0,y-2); yy<=Math.min(gh-1,y+2); yy++) for(let xx=Math.max(0,x-2); xx<=Math.min(gw-1,x+2); xx++){
        const dx=xx-x, dy=yy-y, idx=yy*gw+xx, wt=(dx===0&&dy===0)?6:((Math.abs(dx)+Math.abs(dy)===1)?3:1);
        sr+=bgR[idx]*wt; sg+=bgG[idx]*wt; sb+=bgB[idx]*wt; sl+=bgL[idx]*wt; w+=wt;
      }
      const idx=y*gw+x; nR[idx]=sr/w; nG[idx]=sg/w; nB[idx]=sb/w; nL[idx]=sl/w;
    }
    bgR.set(nR); bgG.set(nG); bgB.set(nB); bgL.set(nL);
  }

  const normalized=new Uint8ClampedArray(src.length);
  const lumBuf=new Float32Array(W*H);
  let p=0, li=0;
  for(let y=0;y<H;y++){
    const gy=y/step, y0=Math.min(gh-1,Math.floor(gy)), y1=Math.min(gh-1,y0+1), fy=gy-y0;
    for(let x=0;x<W;x++,p+=4,li++){
      const gx=x/step, x0=Math.min(gw-1,Math.floor(gx)), x1=Math.min(gw-1,x0+1), fx=gx-x0;
      const i00=y0*gw+x0, i10=y0*gw+x1, i01=y1*gw+x0, i11=y1*gw+x1;
      const interp=(arr)=>{const a=arr[i00]*(1-fx)+arr[i10]*fx, b=arr[i01]*(1-fx)+arr[i11]*fx; return a*(1-fy)+b*fy;};
      const pr=interp(bgR), pg=interp(bgG), pb=interp(bgB), pl=interp(bgL);
      const or=src[p], og=src[p+1], ob=src[p+2];
      const origLum=.299*or+.587*og+.114*ob;
      const paperLum=Math.max(110,pl);
      const globalLift=clamp(248/Math.max(140,paperLum),0.96,1.28);
      let r=or * globalLift * clamp(248/Math.max(120,pr),0.92,1.28);
      let g=og * globalLift * clamp(248/Math.max(120,pg),0.92,1.28);
      let b=ob * globalLift * clamp(248/Math.max(120,pb),0.92,1.28);
      let lum=.299*r+.587*g+.114*b;
      const maxv=Math.max(r,g,b), minv=Math.min(r,g,b);
      const sat=(maxv-minv)/Math.max(1,maxv);
      const paperMask=clamp((lum-164)/72,0,1) * (1-clamp((sat-0.16)/0.32,0,1));
      const shadowLift=clamp((236-paperLum)/118,0,1);
      const highlightMask=clamp((origLum-232)/20,0,1) * (1-clamp((sat-0.12)/0.26,0,1));
      const whitePull=clamp(paperMask*(0.28+shadowLift*0.34) + highlightMask*0.55, 0, 0.82);
      r = r*(1-whitePull) + 252*whitePull;
      g = g*(1-whitePull) + 252*whitePull;
      b = b*(1-whitePull) + 252*whitePull;
      const inkMask=clamp((182-lum)/110,0,1);
      const contrastBoost=1.03 + inkMask*0.08;
      r=(r-128)*contrastBoost+128; g=(g-128)*contrastBoost+128; b=(b-128)*contrastBoost+128;
      // Preserve true accents but prevent neon blow-outs.
      const avg=(r+g+b)/3;
      const colorKeep=clamp((sat-0.08)/0.26,0,1);
      const satBoost=1.01 - highlightMask*0.03;
      r=avg + (r-avg)*(1 + colorKeep*(satBoost-1));
      g=avg + (g-avg)*(1 + colorKeep*(satBoost-1));
      b=avg + (b-avg)*(1 + colorKeep*(satBoost-1));
      // Clamp glare-prone colours so bright packaging doesn't blow out.
      r=Math.min(r, 252); g=Math.min(g, 252); b=Math.min(b, 252);
      normalized[p]=clamp(r,0,255); normalized[p+1]=clamp(g,0,255); normalized[p+2]=clamp(b,0,255); normalized[p+3]=255;
      lumBuf[li]=.299*normalized[p]+.587*normalized[p+1]+.114*normalized[p+2];
    }
  }

  const out=new ImageData(W,H), d=out.data;
  p=0; li=0;
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++,p+=4,li++){
      let r=normalized[p], g=normalized[p+1], b=normalized[p+2];
      const l=lumBuf[li];
      if(x>0&&x<W-1&&y>0&&y<H-1){
        for(const c of [0,1,2]){
          const up=normalized[((y-1)*W+x)*4+c], dn=normalized[((y+1)*W+x)*4+c], lf=normalized[(y*W+x-1)*4+c], rt=normalized[(y*W+x+1)*4+c];
          const blur=(up+dn+lf+rt)*0.25;
          let v=(c===0?r:(c===1?g:b));
          const edge=Math.abs(v-blur);
          const sharpen=(0.09 + Math.min(0.08, edge/255*0.2));
          v = v + (v-blur) * sharpen;
          if(c===0) r=v; else if(c===1) g=v; else b=v;
        }
      }
      const maxv=Math.max(r,g,b), minv=Math.min(r,g,b), sat=(maxv-minv)/Math.max(1,maxv);
      const paperish=l>188 && sat<0.16;
      if(paperish){
        const pull=clamp((l-176)/88,0,1)*0.34;
        r=r*(1-pull)+253*pull; g=g*(1-pull)+253*pull; b=b*(1-pull)+253*pull;
      }
      d[p]=clamp(r,0,255); d[p+1]=clamp(g,0,255); d[p+2]=clamp(b,0,255); d[p+3]=255;
    }
  }
  return out;
}


function applyAdjustments(img, a=adjustments){
  const W=img.width,H=img.height,s=img.data,out=new ImageData(W,H),d=out.data;
  const brightness=a.brightness*1.25;
  const contrast=Math.pow(1.012, a.contrast);
  const saturation=Math.max(0,1+a.saturation/100);
  const blackInput=a.black>0 ? a.black*.70 : 0;
  const blackOutput=a.black<0 ? (-a.black)*.55 : 0;
  const whiteInput=a.white>0 ? 255-a.white*.70 : 255;
  const whiteOutput=a.white<0 ? 255+a.white*.55 : 255;
  const inputSpan=Math.max(24,whiteInput-blackInput), outputSpan=Math.max(24,whiteOutput-blackOutput);
  for(let p=0;p<s.length;p+=4){
    let r=s[p],g=s[p+1],b=s[p+2];
    const lum=.299*r+.587*g+.114*b;
    r=lum+(r-lum)*saturation;g=lum+(g-lum)*saturation;b=lum+(b-lum)*saturation;
    r=(r-128)*contrast+128+brightness;g=(g-128)*contrast+128+brightness;b=(b-128)*contrast+128+brightness;
    r=blackOutput+((r-blackInput)/inputSpan)*outputSpan;
    g=blackOutput+((g-blackInput)/inputSpan)*outputSpan;
    b=blackOutput+((b-blackInput)/inputSpan)*outputSpan;
    d[p]=clamp(r,0,255);d[p+1]=clamp(g,0,255);d[p+2]=clamp(b,0,255);d[p+3]=255;
  }
  return out;
}

function grayscaleImage(img){
  // True tonal grayscale: preserve the full range of light and dark values instead of thresholding to black/white.
  const W=img.width,H=img.height,s=img.data,out=new ImageData(W,H),d=out.data;
  for(let p=0;p<s.length;p+=4){
    let g=.2126*s[p]+.7152*s[p+1]+.0722*s[p+2];
    // A very small contrast lift keeps text readable without turning the page into a photocopy.
    g=(g-128)*1.035+128;
    g=clamp(g,0,255);
    d[p]=d[p+1]=d[p+2]=g;
    d[p+3]=255;
  }
  return out;
}

function detectRestoreIntent(img){
  const W=img.width,H=img.height,s=img.data,step=Math.max(3,Math.round(Math.max(W,H)/420));
  let n=0,brightNeutral=0,satSum=0,edgeN=0,edgeSum=0;
  for(let y=step;y<H-step;y+=step){
    for(let x=step;x<W-step;x+=step){
      const p=(y*W+x)*4,r=s[p],g=s[p+1],b=s[p+2],maxv=Math.max(r,g,b),minv=Math.min(r,g,b);
      const lum=.299*r+.587*g+.114*b,sat=(maxv-minv)/Math.max(1,maxv);
      if(lum>178&&sat<.16) brightNeutral++;
      satSum+=sat;n++;
      const q=(y*W+x+step)*4;
      if(q<s.length){const l2=.299*s[q]+.587*s[q+1]+.114*s[q+2];edgeSum+=Math.abs(lum-l2);edgeN++;}
    }
  }
  const paperRatio=n?brightNeutral/n:0, meanSat=n?satSum/n:0, edge=edgeN?edgeSum/edgeN:0;
  // v1.4 is intentionally conservative: photographed paperwork is still a Photo.
  // Only very neutral, page-filling, high-structure content is auto-routed to Document.
  return (paperRatio>.68 && meanSat<.13 && edge>8.5) ? 'document' : 'photo';
}

function photoRestoreImage(img){
  // Local photo restoration: compress broad lighting/reflection veils while preserving natural colour and detail.
  const W=img.width,H=img.height,src=img.data,out=new ImageData(W,H),d=out.data;
  const step=Math.max(18,Math.round(Math.max(W,H)/82)),gw=Math.ceil(W/step),gh=Math.ceil(H/step),count=gw*gh;
  const grid=new Float32Array(count),weights=new Float32Array(count),hist=new Uint32Array(256);
  let globalLum=0,globalN=0;
  for(let y=0;y<H;y+=3)for(let x=0;x<W;x+=3){
    const p=(y*W+x)*4,r=src[p],g=src[p+1],b=src[p+2],lum=.299*r+.587*g+.114*b;
    const c=Math.floor(y/step)*gw+Math.floor(x/step),w=.45+clamp(lum/255,.12,1);
    grid[c]+=lum*w;weights[c]+=w;globalLum+=lum;globalN++;hist[Math.round(clamp(lum,0,255))]++;
  }
  const mean=globalLum/Math.max(1,globalN);
  let total=globalN,acc=0,p50=mean,p88=Math.min(245,mean+60);
  for(let i=0;i<256;i++){acc+=hist[i];if(acc>=total*.50&&p50===mean)p50=i;if(acc>=total*.88){p88=i;break;}}
  for(let i=0;i<count;i++)grid[i]=weights[i]?grid[i]/weights[i]:mean;
  for(let pass=0;pass<5;pass++){
    const next=new Float32Array(count);
    for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){let sum=0,w=0;for(let yy=Math.max(0,y-2);yy<=Math.min(gh-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(gw-1,x+2);xx++){const idx=yy*gw+xx,wt=(xx===x&&yy===y)?5:((Math.abs(xx-x)+Math.abs(yy-y)===1)?2:1);sum+=grid[idx]*wt;w+=wt;}next[y*gw+x]=sum/w;}
    grid.set(next);
  }
  // Preserve the overall scene mood while strongly compressing broad glare/shadow variation.
  const target=clamp(p50+22,112,178);
  const tmp=new Uint8ClampedArray(src.length);
  let p=0;
  for(let y=0;y<H;y++){
    const gy=y/step,y0=Math.min(gh-1,Math.floor(gy)),y1=Math.min(gh-1,y0+1),fy=gy-y0;
    for(let x=0;x<W;x++,p+=4){
      const gx=x/step,x0=Math.min(gw-1,Math.floor(gx)),x1=Math.min(gw-1,x0+1),fx=gx-x0;
      const a=grid[y0*gw+x0]*(1-fx)+grid[y0*gw+x1]*fx,bg=grid[y1*gw+x0]*(1-fx)+grid[y1*gw+x1]*fx,local=a*(1-fy)+bg*fy;
      const broadTarget=target+(local-target)*.24;
      const gain=clamp(broadTarget/Math.max(42,local),.62,1.48);
      let r=src[p]*gain,g=src[p+1]*gain,b=src[p+2]*gain;
      const origLum=.299*src[p]+.587*src[p+1]+.114*src[p+2];
      const maxv=Math.max(r,g,b),minv=Math.min(r,g,b),sat=(maxv-minv)/Math.max(1,maxv);
      // Reflection veil tends to be unusually bright and low-saturation; pull it back instead of blowing it out.
      const glare=clamp((origLum-p88+22)/48,0,1)*(1-clamp((sat-.18)/.35,0,1));
      if(glare>0){
        const lum=.299*r+.587*g+.114*b, desired=target+(lum-target)*.50;
        const ratio=desired/Math.max(1,lum);r*=ratio;g*=ratio;b*=ratio;
      }
      // Lift genuine shadows more gently and keep colour intact.
      const shadow=clamp((104-(.299*r+.587*g+.114*b))/88,0,1);
      r+=shadow*18;g+=shadow*18;b+=shadow*18;
      const avg=(r+g+b)/3;
      const vibrance=1.07 + clamp((.22-sat)/.22,0,1)*.08;
      r=avg+(r-avg)*vibrance;g=avg+(g-avg)*vibrance;b=avg+(b-avg)*vibrance;
      tmp[p]=clamp(r,0,250);tmp[p+1]=clamp(g,0,250);tmp[p+2]=clamp(b,0,250);tmp[p+3]=255;
    }
  }
  // Restore local contrast lost to haze/reflection, but don't create a crunchy photocopy look.
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const p=(y*W+x)*4;
    for(let c=0;c<3;c++){
      let v=tmp[p+c];
      if(x>0&&x<W-1&&y>0&&y<H-1){
        const blur=(tmp[((y-1)*W+x)*4+c]+tmp[((y+1)*W+x)*4+c]+tmp[(y*W+x-1)*4+c]+tmp[(y*W+x+1)*4+c])*.25;
        const edge=Math.abs(v-blur);
        v+= (v-blur) * (.16 + Math.min(.10,edge/180));
      }
      // soft highlight rolloff keeps lamp reflections and glossy spots controlled
      if(v>220)v=220+(v-220)*.58;
      d[p+c]=clamp(v,0,250);
    }
    d[p+3]=255;
  }
  return out;
}

function displayImage(img){resultCanvas.width=img.width;resultCanvas.height=img.height;rctx.putImageData(img,0,0);}
function resetAdjustments(render=false){
  Object.keys(adjustments).forEach(k=>adjustments[k]=0);
  document.querySelectorAll('.mesh-slider').forEach(el=>setSliderValue(el,0,false));
  adjustedImage=null;
  if(render&&currentMode==='adjust'&&correctedOriginal){adjustedImage=applyAdjustments(correctedOriginal);displayImage(adjustedImage);}
}
async function runCorrection(){
  if(points.length<4)return;busy(true,'Correcting image…');await new Promise(r=>setTimeout(r,40));
  try{correctedOriginal=makeCorrected();correctedImage=cleanupImage(correctedOriginal);aiAssistImage=null;adjustedImage=null;grayscaleImageCache=null;aiRestoreChoice=null;currentMode='corrected';resetAdjustments(false);displayImage(correctedImage);setModeButtons();showView('result');}
  catch(e){console.error(e);toast('Could not correct this shape. Try moving the perimeter points.');}
  finally{busy(false);}
}
async function setMode(mode){
  currentMode=mode;
  $('adjustPanel').classList.toggle('hidden',mode!=='adjust');
  $('aiAssistPanel').classList.toggle('hidden',mode!=='assist');
  if(mode==='bw'&&!grayscaleImageCache){busy(true,'Making grayscale image…');await new Promise(r=>setTimeout(r,30));}
  try{
    if(mode==='corrected'){correctedImage ||= cleanupImage(correctedOriginal);displayImage(correctedImage);}
    else if(mode==='adjust'){adjustedImage=applyAdjustments(correctedOriginal);displayImage(adjustedImage);}
    else if(mode==='bw'){correctedImage ||= cleanupImage(correctedOriginal);grayscaleImageCache ||= grayscaleImage(correctedImage);displayImage(grayscaleImageCache);}
    else if(mode==='assist'){correctedImage ||= cleanupImage(correctedOriginal);displayImage(aiAssistImage||correctedImage);}
    setModeButtons();
  }finally{busy(false);}
}
function setModeButtons(){
  const map={adjust:'adjustModeBtn',bw:'bwModeBtn',corrected:'correctedModeBtn',assist:'aiAssistModeBtn'};
  Object.values(map).forEach(id=>$(id).classList.remove('active'));
  $(map[currentMode]||map.corrected).classList.add('active');
  $('adjustPanel').classList.toggle('hidden',currentMode!=='adjust');
  $('aiAssistPanel').classList.toggle('hidden',currentMode!=='assist');
}
function shortAiMessage(message,max=86){
  const clean=String(message||'').replace(/\s+/g,' ').trim();
  return clean.length>max?clean.slice(0,max-1)+'…':clean;
}
function setSettingsStatus(id,state,text){
  const el=$(id);if(!el)return;
  el.classList.remove('ready','problem','checking','unknown');el.classList.add(state||'unknown');
  const b=el.querySelector('b');if(b)b.textContent=text;
}
function renderAiDiagnostics(){
  setSettingsStatus('settingsAiEndpoint',aiDiagnostics.endpoint==='ready'?'ready':aiDiagnostics.endpoint==='problem'?'problem':aiDiagnostics.endpoint==='checking'?'checking':'unknown',
    aiDiagnostics.endpoint==='ready'?'Connected':aiDiagnostics.endpoint==='problem'?'Connection problem':aiDiagnostics.endpoint==='checking'?'Checking…':'Not tested');
  setSettingsStatus('settingsAiOpenAI',aiDiagnostics.openai==='ready'?'ready':aiDiagnostics.openai==='problem'?'problem':aiDiagnostics.openai==='checking'?'checking':'unknown',
    aiDiagnostics.openai==='ready'?'Connected':aiDiagnostics.openai==='problem'?'Needs attention':aiDiagnostics.openai==='checking'?'Checking…':'Not tested');
  const model=$('settingsAiModel');if(model)model.textContent=[aiDiagnostics.model,aiDiagnostics.quality].filter(Boolean).join(' · ');
  const lastState=aiDiagnostics.last==='success'?'ready':aiDiagnostics.last==='error'?'problem':'unknown';
  const lastText=aiDiagnostics.last==='success'?'Successful':aiDiagnostics.last==='error'?`Error ${aiDiagnostics.lastStatus||''}`.trim():'No request yet';
  setSettingsStatus('settingsAiLast',lastState,lastText);
  const detail=$('settingsAiDetail');if(detail){
    detail.classList.remove('ready','problem');
    if(aiDiagnostics.last==='error'){detail.classList.add('problem');detail.textContent=aiDiagnostics.lastMessage||'The last AI restore failed.';}
    else if(aiDiagnostics.endpoint==='ready'&&aiDiagnostics.openai==='ready'){detail.classList.add('ready');detail.textContent='AI connection is ready. The next AI Assisted restore should use the secure AI service.';}
    else if(aiDiagnostics.openai==='problem'){detail.classList.add('problem');detail.textContent=shortAiMessage(aiDiagnostics.lastMessage||'OpenAI could not be verified.');}
    else detail.textContent='Test the connection to check Vercel, your API key, and GPT Image access without generating an image.';
  }
}
async function testAiConnection(){
  aiDiagnostics.endpoint='checking';aiDiagnostics.openai='checking';renderAiDiagnostics();
  const btn=$('testAiConnectionBtn');if(btn){btn.disabled=true;btn.textContent='Testing…';}
  try{
    const join=AI_ENDPOINT.includes('?')?'&':'?';
    const res=await fetch(`${AI_ENDPOINT}${join}diagnostics=1`,{method:'GET',cache:'no-store',headers:{Accept:'application/json'}});
    let data={};try{data=await res.json();}catch{}
    if(!res.ok)throw new Error(data?.error||`Endpoint ${res.status}`);
    aiDiagnostics.endpoint='ready';
    aiDiagnostics.model=data?.model||aiDiagnostics.model;aiDiagnostics.quality=data?.quality||aiDiagnostics.quality;
    if(!data?.configured){
      aiDiagnostics.openai='problem';aiDiagnostics.lastMessage='OpenAI API key is not configured in Vercel.';aiServiceState='fallback';
    }else if(data?.openai?.ok){
      aiDiagnostics.openai='ready';aiDiagnostics.model=data.openai.model||data.model||aiDiagnostics.model;aiDiagnostics.requestId=data.openai.requestId||'';aiServiceState='ready';
    }else{
      aiDiagnostics.openai='problem';aiDiagnostics.lastMessage=data?.openai?.message||'OpenAI model access could not be verified.';aiDiagnostics.lastStatus=data?.openai?.status||0;aiServiceState='fallback';
    }
  }catch(err){
    aiDiagnostics.endpoint='problem';aiDiagnostics.openai='problem';aiDiagnostics.lastMessage=err?.message||'Connection test failed';aiServiceState='fallback';
  }finally{
    renderAiDiagnostics();if(btn){btn.disabled=false;btn.textContent='Test Connection';}
  }
}
async function openAiAssist(){
  currentMode='assist';
  $('adjustPanel').classList.add('hidden');
  $('aiAssistPanel').classList.remove('hidden');
  correctedImage ||= cleanupImage(correctedOriginal);
  displayImage(aiAssistImage||correctedImage);
  setModeButtons();
  checkAiService();
}
function setAiEngineStatus(state,text){
  const el=$('aiEngineStatus');if(!el)return;
  el.classList.remove('ready','fallback');
  if(state)el.classList.add(state);
  const span=el.querySelector('span');if(span){span.textContent=text;span.title=text;}
}

async function checkAiService(force=false){
  if(aiServiceState!=='unknown'&&!force)return aiServiceState;
  try{
    const res=await fetch(AI_ENDPOINT,{method:'GET',cache:'no-store',headers:{'Accept':'application/json'}});
    if(!res.ok)throw new Error(`AI endpoint ${res.status}`);
    const data=await res.json();
    aiDiagnostics.endpoint='ready';aiDiagnostics.model=data?.model||aiDiagnostics.model;aiDiagnostics.quality=data?.quality||aiDiagnostics.quality;
    if(data?.configured){aiServiceState='ready';setAiEngineStatus('ready',`AI Image · ${data.quality||'low'} ready`);}
    else{aiServiceState='fallback';aiDiagnostics.openai='problem';aiDiagnostics.lastMessage='OpenAI API key is not configured in Vercel.';setAiEngineStatus('fallback','Local restore · AI key not configured');}
  }catch(err){
    aiServiceState='fallback';aiDiagnostics.endpoint='problem';aiDiagnostics.openai='problem';aiDiagnostics.lastMessage=err?.message||'AI endpoint unavailable';setAiEngineStatus('fallback','Local restore · AI endpoint unavailable');
  }
  renderAiDiagnostics();
  return aiServiceState;
}

function imageDataToUploadDataUrl(img,mode='photo',maxEdge=1536){
  const src=document.createElement('canvas');src.width=img.width;src.height=img.height;src.getContext('2d').putImageData(img,0,0);
  const scale=Math.min(1,maxEdge/Math.max(img.width,img.height));
  const out=document.createElement('canvas');out.width=Math.max(1,Math.round(img.width*scale));out.height=Math.max(1,Math.round(img.height*scale));
  const ctx=out.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(src,0,0,out.width,out.height);
  const type=mode==='document'?'image/webp':'image/jpeg';
  let data=out.toDataURL(type,mode==='document'?.96:.92);
  if(data.length>3_800_000)data=out.toDataURL(type,mode==='document'?.88:.82);
  return data;
}

async function dataUrlToImageData(dataUrl){
  const blob=await fetch(dataUrl).then(r=>r.blob());
  const bmp=await createImageBitmap(blob);
  const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;
  const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(bmp,0,0);bmp.close?.();
  return cx.getImageData(0,0,c.width,c.height);
}

async function gptRestoreImage(img,mode){
  const payload={image:imageDataToUploadDataUrl(img,mode),mode,width:img.width,height:img.height};
  if(aiReferenceDataUrl) payload.referenceImage = aiReferenceDataUrl;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),120000);
  try{
    const res=await fetch(AI_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
    let data={};try{data=await res.json();}catch{}
    if(!res.ok||!data?.image){
      const err=new Error(data?.error||`AI restore failed (${res.status})`);
      err.status=res.status;err.diagnostic=data?.diagnostic||{};throw err;
    }
    aiServiceState='ready';aiDiagnostics.endpoint='ready';aiDiagnostics.openai='ready';aiDiagnostics.last='success';aiDiagnostics.lastStatus=200;aiDiagnostics.lastMessage='';aiDiagnostics.requestId=data?.requestId||'';aiDiagnostics.model=data?.model||aiDiagnostics.model;aiDiagnostics.quality=data?.quality||aiDiagnostics.quality;renderAiDiagnostics();
    setAiEngineStatus('ready',`AI Image · ${data.quality||'low'} restore complete`);
    return await dataUrlToImageData(data.image);
  }finally{clearTimeout(timer);}
}

async function runAiRestoreChoice(choice){
  aiRestoreChoice=choice;
  document.querySelectorAll('.ai-choice').forEach(b=>b.classList.toggle('active',b.dataset.aiChoice===choice));
  const resolved=choice==='automatic'?detectRestoreIntent(correctedOriginal):choice;
  $('aiChoiceStatus').textContent=choice==='automatic'?`Automatic selected ${resolved === 'document' ? 'Document' : 'Photo'}.`:`${choice === 'document' ? 'Document' : 'Photo'} restore selected.`;
  if(aiReferenceDataUrl) $('aiChoiceStatus').textContent += ' Optional reference added.';
  busy(true, resolved==='document'?'AI cleaning document…':'AI restoring photo…');
  await new Promise(r=>setTimeout(r,20));
  try{
    const state=await checkAiService();
    if(state==='ready'){
      try{
        aiAssistImage=await gptRestoreImage(correctedOriginal,resolved);
        $('aiChoiceStatus').textContent=`AI ${resolved === 'document' ? 'Document' : 'Photo'} restore complete.`;
      }catch(err){
        console.warn('AI restore unavailable, using local fallback',err);
        const reason=String(err?.diagnostic?.reason||'');
        const status=err?.status||err?.diagnostic?.status||0;
        const isSafety=reason==='safety'||/safety|moderation|policy|rejected by the safety system/i.test(err?.message||'');
        aiDiagnostics.endpoint='ready';
        aiDiagnostics.last='error';aiDiagnostics.lastStatus=status;aiDiagnostics.lastMessage=err?.message||'AI request failed';aiDiagnostics.requestId=err?.diagnostic?.requestId||'';
        if(isSafety){
          // A content-specific decline does not mean the AI service is disconnected. Keep future images eligible for AI.
          aiServiceState='ready';aiDiagnostics.openai='ready';
          setAiEngineStatus('fallback',`AI safety check declined this image. Local ${resolved === 'document' ? 'Document' : 'Photo'} restoration used.`);
        }else{
          aiServiceState='fallback';aiDiagnostics.openai='problem';
          const code=status?` ${status}`:'';
          setAiEngineStatus('fallback',`AI error${code} · ${shortAiMessage(aiDiagnostics.lastMessage,132)}`);
        }
        renderAiDiagnostics();
        aiAssistImage=resolved==='document'?aggressiveCleanupImage(correctedOriginal):photoRestoreImage(correctedOriginal);
        $('aiChoiceStatus').textContent=isSafety?'Technical details are available in Settings.':`Local ${resolved === 'document' ? 'Document' : 'Photo'} fallback used.`;
      }
    }else{
      aiAssistImage=resolved==='document'?aggressiveCleanupImage(correctedOriginal):photoRestoreImage(correctedOriginal);
      $('aiChoiceStatus').textContent=`Local ${resolved === 'document' ? 'Document' : 'Photo'} fallback used.`;
    }
    displayImage(aiAssistImage);
    currentMode='assist';
    setModeButtons();
  }finally{busy(false);}
}

function setSliderValue(el,value,render=true){
  const v=clamp(Math.round(value),-100,100),pct=(v+100)/200*100;
  el.dataset.value=String(v);
  el.setAttribute('aria-valuenow',String(v));
  el.querySelector('.mesh-slider-thumb').style.left=`${pct}%`;
  el.querySelector('.mesh-slider-fill').style.width=`${pct}%`;
  const key=el.dataset.adjust;adjustments[key]=v;
  const output=$(key+'Value');if(output)output.value=(v>0?'+':'')+v;
  if(render) scheduleAdjustmentRender();
}
function emitSliderShard(el,pct){
  const now=performance.now();if(now-lastSliderShardAt<24)return;lastSliderShardAt=now;
  const trail=el.querySelector('.mesh-slider-trail');if(!trail)return;
  for(let i=0;i<2;i++){const s=document.createElement('span');s.className='slider-shard';s.style.left=`${pct}%`;s.style.setProperty('--dx',`${-14+Math.random()*28}px`);s.style.setProperty('--dy',`${-18+Math.random()*30}px`);s.style.setProperty('--r',`${Math.random()*180}deg`);trail.appendChild(s);setTimeout(()=>s.remove(),520);}
}
function initMeshSliders(){
  document.querySelectorAll('.mesh-slider').forEach(el=>{
    setSliderValue(el,Number(el.dataset.value)||0,false);
    let dragging=false;
    const updateFromPointer=(ev)=>{const rect=el.getBoundingClientRect(),pct=clamp((ev.clientX-rect.left)/rect.width,0,1);setSliderValue(el,-100+pct*200,true);emitSliderShard(el,pct*100);};
    el.addEventListener('pointerdown',ev=>{if(!ev.target.classList.contains('mesh-slider-thumb'))return;dragging=true;el.classList.add('dragging');el.setPointerCapture(ev.pointerId);ev.preventDefault();});
    el.addEventListener('pointermove',ev=>{if(!dragging)return;updateFromPointer(ev);ev.preventDefault();});
    const stop=ev=>{if(!dragging)return;dragging=false;el.classList.remove('dragging');try{el.releasePointerCapture(ev.pointerId);}catch{}};
    el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);
    el.addEventListener('keydown',ev=>{let delta=0;if(ev.key==='ArrowLeft'||ev.key==='ArrowDown')delta=-1;if(ev.key==='ArrowRight'||ev.key==='ArrowUp')delta=1;if(ev.key==='PageDown')delta=-10;if(ev.key==='PageUp')delta=10;if(!delta)return;ev.preventDefault();setSliderValue(el,(Number(el.dataset.value)||0)+delta,true);});
  });
}
function scheduleAdjustmentRender(){
  clearTimeout(adjustTimer);
  adjustTimer=setTimeout(()=>{if(currentMode!=='adjust'||!correctedOriginal)return;adjustedImage=applyAdjustments(correctedOriginal);displayImage(adjustedImage);},55);
}

function rotateSource(){
  const c=document.createElement('canvas');c.width=sourceCanvas.height;c.height=sourceCanvas.width;const cx=c.getContext('2d');cx.translate(c.width,0);cx.rotate(Math.PI/2);cx.drawImage(sourceCanvas,0,0);
  sourceCanvas.width=c.width;sourceCanvas.height=c.height;sctx.drawImage(c,0,0);setupEditCanvas();points=autoDetectDocument();history=[];selectedIndex=-1;hidePointActions();resetViewport();renderEditor();
}


function updateResultActions(){
  const save=$('savePngBtn');
  if(!save)return;
  save.textContent=pdfEditingId?'Save & Continue':'Save PNG';
  save.setAttribute('aria-label',pdfEditingId?'Save edited page and return to PDF builder':'Save PNG');
}

function pdfItemById(id){ return pdfItems.find(x=>x.id===id); }
function makePdfItem(file){
  return {id:`PDF-${Date.now().toString(36)}-${(++pdfUid).toString(36)}`,name:file.name||`Page-${pdfUid}.jpg`,blob:file,url:URL.createObjectURL(file)};
}
function revokePdfItem(item){ if(item?.url)try{URL.revokeObjectURL(item.url);}catch{} }
function movePdfItem(from,to){
  if(from===to||from<0||to<0||from>=pdfItems.length||to>=pdfItems.length)return;
  const [item]=pdfItems.splice(from,1);pdfItems.splice(to,0,item);
}
function clearPdfDropTargets(){ document.querySelectorAll('.pdf-item.drop-target').forEach(el=>el.classList.remove('drop-target')); }

function bindPdfDrag(handle,tile,itemId){
  handle.addEventListener('click',e=>e.stopPropagation());
  handle.addEventListener('pointerdown',ev=>{
    if(ev.button!=null&&ev.button!==0)return;
    const from=pdfItems.findIndex(x=>x.id===itemId);
    if(from<0)return;
    pdfDrag={itemId,from,targetId:itemId,startX:ev.clientX,startY:ev.clientY,moved:false,pointerId:ev.pointerId};
    tile.classList.add('dragging');
    try{handle.setPointerCapture(ev.pointerId);}catch{}
    ev.preventDefault();ev.stopPropagation();
  });
  handle.addEventListener('pointermove',ev=>{
    if(!pdfDrag||pdfDrag.pointerId!==ev.pointerId)return;
    if(Math.hypot(ev.clientX-pdfDrag.startX,ev.clientY-pdfDrag.startY)>5)pdfDrag.moved=true;
    if(!pdfDrag.moved)return;
    const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest?.('.pdf-item');
    clearPdfDropTargets();
    if(target&&target.dataset.id!==itemId){target.classList.add('drop-target');pdfDrag.targetId=target.dataset.id;}
    else pdfDrag.targetId=itemId;
    ev.preventDefault();
  });
  const end=ev=>{
    if(!pdfDrag||pdfDrag.pointerId!==ev.pointerId)return;
    const drag=pdfDrag;pdfDrag=null;
    try{handle.releasePointerCapture(ev.pointerId);}catch{}
    clearPdfDropTargets();tile.classList.remove('dragging');
    if(drag.moved){
      const to=pdfItems.findIndex(x=>x.id===drag.targetId);
      if(to>=0&&to!==drag.from)movePdfItem(drag.from,to);
      pdfSuppressClickUntil=Date.now()+320;
      renderPdfBuilder();
    }
    ev.preventDefault();ev.stopPropagation();
  };
  handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
}

function renderPdfBuilder(){
  const list=$('pdfImageList'),empty=$('pdfEmpty');
  if(!list||!empty)return;
  list.innerHTML='';
  empty.classList.toggle('hidden',pdfItems.length>0);
  list.classList.toggle('hidden',pdfItems.length===0);
  if(pdfSelectedId&&!pdfItemById(pdfSelectedId))pdfSelectedId=null;
  pdfItems.forEach((item,index)=>{
    const tile=document.createElement('div');tile.className='pdf-item'+(pdfSelectedId===item.id?' selected':'');tile.dataset.id=item.id;
    const thumb=document.createElement('div');thumb.className='pdf-thumb';
    const img=document.createElement('img');img.src=item.url;img.alt=`PDF page ${index+1}`;thumb.appendChild(img);
    const pageNo=document.createElement('span');pageNo.className='pdf-page-no';pageNo.textContent=String(index+1);thumb.appendChild(pageNo);
    const handle=document.createElement('button');handle.type='button';handle.className='pdf-drag-handle';handle.innerHTML='<svg class="move-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';handle.setAttribute('aria-label',`Move page ${index+1}`);thumb.appendChild(handle);
    const actions=document.createElement('div');actions.className='pdf-tile-actions';
    const edit=document.createElement('button');edit.type='button';edit.className='pdf-edit-item';edit.textContent='✦ Edit';
    const remove=document.createElement('button');remove.type='button';remove.className='pdf-remove-item';remove.textContent='✕ Remove';
    actions.append(edit,remove);thumb.appendChild(actions);tile.appendChild(thumb);
    const name=document.createElement('div');name.className='pdf-name';name.textContent=item.name;tile.appendChild(name);
    tile.addEventListener('click',()=>{if(Date.now()<pdfSuppressClickUntil)return;pdfSelectedId=pdfSelectedId===item.id?null:item.id;renderPdfBuilder();});
    edit.addEventListener('click',ev=>{ev.stopPropagation();editPdfItem(item.id);});
    remove.addEventListener('click',ev=>{ev.stopPropagation();removePdfItem(item.id);});
    bindPdfDrag(handle,tile,item.id);list.appendChild(tile);
  });
  $('savePdfBtn').disabled=pdfItems.length===0;
}


let pdfImportResolve = null;
let pdfImportDoc = null;
let pdfImportFile = null;
let pdfImportSelected = new Set();

function ensurePdfJs(){
  const lib=window.pdfjsLib;
  if(!lib) throw new Error('PDF page importer did not load. Check your internet connection and try again.');
  if(lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  return lib;
}
function updatePdfImportCount(){
  const count=pdfImportSelected.size;
  const el=$('pdfImportCount'); if(el) el.textContent=`${count} selected`;
  const add=$('pdfImportAdd'); if(add) add.disabled=count===0;
  document.querySelectorAll('.pdf-import-page').forEach(tile=>tile.classList.toggle('selected',pdfImportSelected.has(+tile.dataset.page)));
}
function closePdfImport(result=[]){
  const dlg=$('pdfImportDialog');
  if(dlg?.open) dlg.close();
  const resolve=pdfImportResolve; pdfImportResolve=null;
  if(resolve) resolve(result);
}
async function renderPdfImportThumb(pdf,pageNo,canvas){
  const page=await pdf.getPage(pageNo);
  const base=page.getViewport({scale:1});
  const scale=Math.min(.42,150/Math.max(1,base.width));
  const dpr=Math.min(1.5,window.devicePixelRatio||1);
  const viewport=page.getViewport({scale:scale*dpr});
  canvas.width=Math.max(1,Math.round(viewport.width));canvas.height=Math.max(1,Math.round(viewport.height));
  const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  await page.render({canvasContext:ctx,viewport}).promise;
}
async function choosePdfPages(file){
  const dlg=$('pdfImportDialog'),pagesEl=$('pdfImportPages'),status=$('pdfImportStatus');
  if(!dlg||!pagesEl) return [];
  const lib=ensurePdfJs();
  const data=new Uint8Array(await file.arrayBuffer());
  const pdf=await lib.getDocument({data}).promise;
  pdfImportDoc=pdf;pdfImportFile=file;pdfImportSelected=new Set(Array.from({length:pdf.numPages},(_,i)=>i+1));
  $('pdfImportName').textContent=`${file.name} · ${pdf.numPages} page${pdf.numPages===1?'':'s'}`;
  pagesEl.innerHTML='';status.textContent='Preparing page previews…';
  for(let i=1;i<=pdf.numPages;i++){
    const tile=document.createElement('label');tile.className='pdf-import-page selected';tile.dataset.page=String(i);
    const check=document.createElement('input');check.type='checkbox';check.checked=true;check.setAttribute('aria-label',`Include page ${i}`);
    const canvas=document.createElement('canvas');const badge=document.createElement('span');badge.textContent=String(i);
    tile.append(check,canvas,badge);pagesEl.appendChild(tile);
    check.addEventListener('change',()=>{if(check.checked)pdfImportSelected.add(i);else pdfImportSelected.delete(i);updatePdfImportCount();});
    try{await renderPdfImportThumb(pdf,i,canvas);}catch(err){console.warn('PDF thumbnail failed',i,err);}
    status.textContent=`Preparing page previews · ${i}/${pdf.numPages}`;
    if(i%3===0) await new Promise(r=>setTimeout(r,0));
  }
  status.textContent='Tap pages to include or omit them.';updatePdfImportCount();
  dlg.showModal();
  return new Promise(resolve=>{pdfImportResolve=resolve;});
}
async function selectedPdfPagesToItems(pageNumbers){
  if(!pdfImportDoc||!pdfImportFile||!pageNumbers.length)return[];
  const out=[];
  for(let idx=0;idx<pageNumbers.length;idx++){
    const pageNo=pageNumbers[idx];
    $('busyText').textContent=`Importing PDF page · ${idx+1}/${pageNumbers.length}`;
    const page=await pdfImportDoc.getPage(pageNo);
    const base=page.getViewport({scale:1});
    const maxEdge=2100;
    const scale=Math.min(2.4,maxEdge/Math.max(base.width,base.height));
    const viewport=page.getViewport({scale});
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(viewport.width));c.height=Math.max(1,Math.round(viewport.height));
    const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
    await page.render({canvasContext:ctx,viewport}).promise;
    const blob=await canvasBlob(c,'image/png');
    if(blob){
      const baseName=(pdfImportFile.name||'document.pdf').replace(/\.pdf$/i,'');
      const pseudo=new File([blob],`${baseName} - Page ${pageNo}.png`,{type:'image/png'});
      const item=makePdfItem(pseudo);item.sourceType='pdf';item.sourcePdfName=pdfImportFile.name;item.sourcePage=pageNo;out.push(item);
    }
    await new Promise(r=>setTimeout(r,0));
  }
  return out;
}
async function addPdfSources(files){
  const chosen=[...files]; if(!chosen.length)return;
  const images=chosen.filter(f=>f.type?.startsWith('image/'));
  if(images.length) pdfItems.push(...images.map(makePdfItem));
  const pdfs=chosen.filter(f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name||''));
  for(const file of pdfs){
    try{
      const selected=await choosePdfPages(file);
      if(!selected.length){try{await pdfImportDoc?.destroy?.();}catch{} pdfImportDoc=null;pdfImportFile=null;continue;}
      busy(true,`Importing PDF page · 1/${selected.length}`);
      const items=await selectedPdfPagesToItems(selected);
      pdfItems.push(...items);
      try{await pdfImportDoc?.destroy?.();}catch{} pdfImportDoc=null;pdfImportFile=null;
      busy(false);
      toast(`${items.length} PDF page${items.length===1?'':'s'} added.`);
    }catch(err){console.error(err);busy(false);try{await pdfImportDoc?.destroy?.();}catch{} pdfImportDoc=null;pdfImportFile=null;toast(err?.message||'Could not import that PDF.');}
  }
  if(!images.length&&!pdfs.length)toast('Choose images or a PDF.');
  pdfSelectedId=null;renderPdfBuilder();
}

function addPdfImages(files){
  const images=[...files].filter(f=>f.type?.startsWith('image/'));
  if(!images.length){toast('Choose one or more images.');return;}
  pdfItems.push(...images.map(makePdfItem));
  pdfSelectedId=null;renderPdfBuilder();
}
function removePdfItem(id){
  const i=pdfItems.findIndex(x=>x.id===id);if(i<0)return;
  revokePdfItem(pdfItems[i]);pdfItems.splice(i,1);if(pdfSelectedId===id)pdfSelectedId=null;renderPdfBuilder();
}
async function editPdfItem(id){
  const item=pdfItemById(id);if(!item)return;
  pdfSelectedId=null;
  const file=new File([item.blob],item.name,{type:item.blob.type||'image/png'});
  await loadFile(file,{pdfItemId:id});
}
function canvasBlob(canvas,type='image/png',quality){
  return new Promise(resolve=>canvas.toBlob(resolve,type,quality));
}
async function savePdfEditedPage(){
  const item=pdfItemById(pdfEditingId);if(!item){pdfEditingId=null;showView('pdf');return;}
  busy(true,'Saving page…');
  try{
    const blob=await canvasBlob(resultCanvas,'image/png');
    if(!blob)throw new Error('Canvas export failed');
    revokePdfItem(item);item.blob=blob;item.url=URL.createObjectURL(blob);
    item.name=(item.name||'page').replace(/\.[^.]+$/,'')+'-edited.png';
    pdfEditingId=null;pdfSelectedId=null;showView('pdf');toast('PDF page updated.');
  }catch(err){console.error(err);toast('Could not save that edited page.');}
  finally{busy(false);}
}

async function pdfPageImage(item){
  const bmp=await createImageBitmap(item.blob);
  const maxEdge=2200,scale=Math.min(1,maxEdge/Math.max(bmp.width,bmp.height));
  const w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale));
  const c=document.createElement('canvas');c.width=w;c.height=h;const cx=c.getContext('2d');
  cx.fillStyle='#fff';cx.fillRect(0,0,w,h);cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality='high';cx.drawImage(bmp,0,0,w,h);bmp.close?.();
  const blob=await canvasBlob(c,'image/jpeg',.92);if(!blob)throw new Error('JPEG conversion failed');
  return {bytes:new Uint8Array(await blob.arrayBuffer()),width:w,height:h};
}
function asciiBytes(text){return new TextEncoder().encode(text);}
function joinBytes(parts){let len=0;parts.forEach(p=>len+=p.length);const out=new Uint8Array(len);let o=0;parts.forEach(p=>{out.set(p,o);o+=p.length;});return out;}
function pdfStreamObject(id,dict,streamBytes){return joinBytes([asciiBytes(`${id} 0 obj\n<< ${dict} /Length ${streamBytes.length} >>\nstream\n`),streamBytes,asciiBytes(`\nendstream\nendobj\n`)]);}
function buildImagePdf(pages){
  const count=pages.length,maxId=2+count*3,objs=new Array(maxId+1);
  const kids=[];
  for(let i=0;i<count;i++)kids.push(`${3+i*3} 0 R`);
  objs[1]=asciiBytes(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objs[2]=asciiBytes(`2 0 obj\n<< /Type /Pages /Count ${count} /Kids [${kids.join(' ')}] >>\nendobj\n`);
  const PW=612,PH=792,M=18;
  pages.forEach((page,i)=>{
    const pageId=3+i*3,contentId=4+i*3,imageId=5+i*3;
    const scale=Math.min((PW-M*2)/page.width,(PH-M*2)/page.height),dw=page.width*scale,dh=page.height*scale,x=(PW-dw)/2,y=(PH-dh)/2;
    const content=asciiBytes(`q\n${dw.toFixed(3)} 0 0 ${dh.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm\n/Im0 Do\nQ\n`);
    objs[pageId]=asciiBytes(`${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
    objs[contentId]=pdfStreamObject(contentId,'',content);
    objs[imageId]=pdfStreamObject(imageId,`/Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,page.bytes);
  });
  const header=asciiBytes('%PDF-1.4\n%MeshDoctor\n');let total=header.length;const offsets=new Array(maxId+1).fill(0),parts=[header];
  for(let id=1;id<=maxId;id++){offsets[id]=total;parts.push(objs[id]);total+=objs[id].length;}
  const xrefStart=total;let xref=`xref\n0 ${maxId+1}\n0000000000 65535 f \n`;
  for(let id=1;id<=maxId;id++)xref+=`${String(offsets[id]).padStart(10,'0')} 00000 n \n`;
  xref+=`trailer\n<< /Size ${maxId+1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  parts.push(asciiBytes(xref));return new Blob(parts,{type:'application/pdf'});
}
async function savePdf(){
  if(!pdfItems.length){toast('Add pages first.');return;}
  busy(true,`Building PDF · 1/${pdfItems.length}`);
  try{
    const pages=[];
    for(let i=0;i<pdfItems.length;i++){$('busyText').textContent=`Building PDF · ${i+1}/${pdfItems.length}`;pages.push(await pdfPageImage(pdfItems[i]));await new Promise(r=>setTimeout(r,0));}
    const pdf=buildImagePdf(pages);
    const fileName=`${sanitizeFileName(userSettings.pdfFilename,'MeshDoctor-created')}.pdf`;
    const file=new File([pdf],fileName,{type:'application/pdf'});
    if(userSettings.pdfOutput==='share' && navigator.canShare?.({files:[file]})){
      try{
        await navigator.share({files:[file], title:fileName.replace(/\.pdf$/,'')});
        toast('PDF ready to share.');
      }catch(err){
        if(err?.name==='AbortError') toast('Share cancelled.');
        else throw err;
      }
    }else{
      const url=URL.createObjectURL(pdf),a=document.createElement('a');
      a.href=url;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
      toast('PDF saved to your downloads.');
    }
  }catch(err){console.error(err);toast('Could not build the PDF.');}
  finally{busy(false);}
}

function downloadCanvas(type='image/png'){
  resultCanvas.toBlob(blob=>{if(!blob)return;const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${currentFileBase}-corrected.${type==='image/png'?'png':'jpg'}`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Saved to your downloads.');},type,type==='image/jpeg'?.94:undefined);
}
async function shareCanvas(){
  resultCanvas.toBlob(async blob=>{if(!blob)return;const file=new File([blob],`${currentFileBase}-corrected.png`,{type:'image/png'});try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'MeshDoctor corrected image'});}else{downloadCanvas('image/png');}}catch(e){if(e.name!=='AbortError')toast('Share was not available.');}},'image/png');
}

$('homeSettingsBtn')?.addEventListener('click',openSettingsDialog);
$('testAiConnectionBtn')?.addEventListener('click',testAiConnection);
$('settingsCloseBtn')?.addEventListener('click',closeSettingsDialog);
$('settingsCancelBtn')?.addEventListener('click',closeSettingsDialog);
$('settingsSaveBtn')?.addEventListener('click',()=>{
  userSettings.pdfFilename=sanitizeFileName($('settingsPdfName')?.value,'MeshDoctor-created');
  userSettings.pdfOutput=$('settingsPdfOutput')?.value==='share'?'share':'download';
  saveSettings();
  syncSettingsUi();
  closeSettingsDialog();
  toast('Settings saved.');
});
$('settingsDialog')?.addEventListener('cancel',ev=>{ev.preventDefault();closeSettingsDialog();});

$('cameraInput').addEventListener('change',e=>{loadFile(e.target.files[0]);e.target.value='';});
$('galleryInput').addEventListener('change',e=>{loadFile(e.target.files[0]);e.target.value='';});
$('aiReferenceInput')?.addEventListener('change',async e=>{
  const file=e.target.files?.[0];
  e.target.value='';
  if(!file) return;
  const inferredMode=aiRestoreChoice==='document'||aiRestoreChoice==='photo' ? aiRestoreChoice : (correctedOriginal ? detectRestoreIntent(correctedOriginal) : 'photo');
  busy(true,'Adding reference…');
  try{
    aiReferenceDataUrl=await fileToUploadDataUrl(file,inferredMode==='document'?'document':'photo');
    aiReferenceName=sanitizeDisplayName(file.name);
    updateAiReferenceUi();
    $('aiChoiceStatus').textContent='Reference image added. AI can use the second angle during the next restore.';
    toast('Reference image added.');
  }catch(err){
    console.error(err);
    clearAiReference(true);
    toast('Could not add that reference image.');
  }finally{busy(false);}
});
$('aiReferenceClearBtn')?.addEventListener('click',()=>clearAiReference());
$('pdfBuilderBtn').addEventListener('click',()=>{pdfEditingId=null;showView('pdf');});
$('labelMakerBtn').addEventListener('click',()=>showView('label'));
$('labelBackBtn').addEventListener('click',()=>showView('home'));
$('pdfBackBtn').addEventListener('click',()=>{pdfEditingId=null;showView('home');});
$('pdfAddBtn').addEventListener('click',()=>$('pdfImageInput').click());
$('pdfEmptyAddBtn').addEventListener('click',()=>$('pdfImageInput').click());
$('pdfImageInput').addEventListener('change',async e=>{const files=[...e.target.files];e.target.value='';await addPdfSources(files);});
$('savePdfBtn').addEventListener('pointerdown',burstCorrectButton);
$('savePdfBtn').addEventListener('click',savePdf);
$('autoBtn').addEventListener('click',()=>{history.push(points.map(p=>({...p})));points=autoDetectDocument();selectedIndex=-1;hidePointActions();renderEditor();toast('Image boundary re-detected.');});
$('resetBtn').addEventListener('click',()=>{history.push(points.map(p=>({...p})));points=defaultQuad();selectedIndex=-1;hidePointActions();renderEditor();});
$('undoPointBtn').addEventListener('click',()=>{if(history.length){points=history.pop();selectedIndex=-1;hidePointActions();renderEditor();}else toast('Nothing to undo yet.');});
$('rotateBtn').addEventListener('click',()=>rotateSource());
function burstCorrectButton(ev){
  const btn=ev?.currentTarget||$('correctBtn'),r=btn.getBoundingClientRect();
  for(let i=0;i<8;i++){
    const s=document.createElement('span');s.className='correct-shard';
    s.style.left=`${r.left+r.width*(.16+Math.random()*.68)}px`;s.style.top=`${r.top+r.height*(.28+Math.random()*.44)}px`;
    s.style.setProperty('--dx',`${-32+Math.random()*64}px`);s.style.setProperty('--dy',`${-26+Math.random()*52}px`);s.style.setProperty('--rot',`${Math.random()*180}deg`);
    document.body.appendChild(s);setTimeout(()=>s.remove(),580);
  }
}
$('correctBtn').addEventListener('pointerdown',burstCorrectButton);$('correctBtn').addEventListener('click',runCorrection);
$('shapeBackBtn').addEventListener('click',()=>{if(pdfEditingId){pdfEditingId=null;showView('pdf');}else showView('home');});
$('headerBackBtn').addEventListener('click',()=>{showView('shape');renderEditor();});
$('resultHomeBtn').addEventListener('click',()=>{pdfEditingId=null;showView('home');});
$('adjustModeBtn').addEventListener('click',()=>setMode('adjust'));
$('bwModeBtn').addEventListener('click',()=>setMode('bw'));
$('correctedModeBtn').addEventListener('click',()=>setMode('corrected'));
$('aiAssistModeBtn').addEventListener('click',openAiAssist);
document.querySelectorAll('.ai-choice').forEach(btn=>btn.addEventListener('click',()=>runAiRestoreChoice(btn.dataset.aiChoice)));
$('resetAdjustBtn').addEventListener('click',()=>resetAdjustments(true));
$('savePngBtn').addEventListener('click',()=>pdfEditingId?savePdfEditedPage():downloadCanvas('image/png'));
$('shareBtn').addEventListener('click',shareCanvas);
const homeAboutBtn=$('homeAboutBtn'), aboutDialog=$('aboutDialog'), closeAboutBtn=$('closeAboutBtn');
if(homeAboutBtn&&aboutDialog) homeAboutBtn.addEventListener('click',()=>aboutDialog.showModal());
if(closeAboutBtn&&aboutDialog) closeAboutBtn.addEventListener('click',()=>aboutDialog.close());

if($('pdfSelectAll')) $('pdfSelectAll').addEventListener('click',()=>{if(!pdfImportDoc)return;pdfImportSelected=new Set(Array.from({length:pdfImportDoc.numPages},(_,i)=>i+1));document.querySelectorAll('.pdf-import-page input').forEach(c=>c.checked=true);updatePdfImportCount();});
if($('pdfSelectNone')) $('pdfSelectNone').addEventListener('click',()=>{pdfImportSelected.clear();document.querySelectorAll('.pdf-import-page input').forEach(c=>c.checked=false);updatePdfImportCount();});
if($('pdfImportCancel')) $('pdfImportCancel').addEventListener('click',()=>closePdfImport([]));
if($('pdfImportClose')) $('pdfImportClose').addEventListener('click',()=>closePdfImport([]));
if($('pdfImportAdd')) $('pdfImportAdd').addEventListener('click',()=>closePdfImport([...pdfImportSelected].sort((a,b)=>a-b)));
if($('pdfImportDialog')) $('pdfImportDialog').addEventListener('cancel',ev=>{ev.preventDefault();closePdfImport([]);});

loadSettings();
window.addEventListener('load',()=>{ syncSettingsUi(); updateAiReferenceUi(); initAmbientShards();initHomeMesh();initMeshSliders();renderPdfBuilder();if(views.home.classList.contains('active')||views.pdf.classList.contains('active')) startHomeCameraBg(); });
window.addEventListener('pagehide', stopHomeCameraBg);
document.addEventListener('visibilitychange',()=>{ if(document.hidden) stopHomeCameraBg(); else if(views.home.classList.contains('active')||views.pdf.classList.contains('active')) startHomeCameraBg(); });

if('serviceWorker' in navigator) { window.addEventListener('load', async ()=>{ try { const reg = await navigator.serviceWorker.register('./sw.js?v=1.5.16', {updateViaCache:'none'}); await reg.update(); } catch(err){ console.warn(err); } }); }
