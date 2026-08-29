'use strict';

const $ = (id) => document.getElementById(id);
const views = { home: $('homeView'), label: $('labelView'), labelArea: $('labelAreaView'), labelResult: $('labelResultView'), pdf: $('pdfView'), shape: $('shapeView'), result: $('resultView') };
const editCanvas = $('editCanvas'), ectx = editCanvas.getContext('2d', { willReadFrequently: true });
const resultCanvas = $('resultCanvas'), rctx = resultCanvas.getContext('2d', { willReadFrequently: true });
const loupe = $('loupe'), loupeCanvas = $('loupeCanvas'), lctx = loupeCanvas.getContext('2d');
const stageWrap = $('stageWrap'), canvasPan = $('canvasPan'), canvasZoom = $('canvasZoom');
const pointActions = $('pointActions'), movePointBtn = $('movePointBtn'), removePointBtn = $('removePointBtn'), meshMoveAllBtn = $('meshMoveAllBtn'), zoomChip = $('zoomChip');
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
const LABEL_NAME_COUNTER_KEY = 'meshdoctor-label-counter-v1';
const LABEL_PROJECT_META_KEY = 'meshdoctor-last-label-project-meta-v1';
const LABEL_PROJECT_DB = 'meshdoctor-label-projects';
const LABEL_PROJECT_STORE = 'projects';
let userSettings = { pdfFilename:'MeshDoctor-created', outputFolderName:'Downloads' };
let labelNameCounter = 1;
let outputDirHandle = null;

// Label Maker state
let labelItems=[];
let labelUid=0;
let labelSelectedId=null;
let labelDrag=null;
let labelSuppressClickUntil=0;
let labelReplaceTargetId=null;
let labelAreaIndex=0;
let labelAreaBitmap=null;
let labelAreaDragIndex=-1;
let labelAreaDragStart=null;
let labelAreaSelectedIndex=-1;
let labelAreaHistory=[];
let labelAreaZoom=1,labelAreaPanX=0,labelAreaPanY=0;
let labelAreaGesture=null,labelAreaPinch=null,labelAreaPinched=false;
const labelAreaPointers=new Map();
const LABEL_AREA_MAX_ZOOM=5;
let labelResultImage=null;
let labelEditorMode=false;
let meshMoveAllDrag=null;
let shapeRotationDegrees=0;
const shapeRotationBase=document.createElement('canvas');
const shapeRotationBaseCtx=shapeRotationBase.getContext('2d');
let labelCameraStream=null;
let labelCameraSessionCount=0;
let labelCameraGuideState=null;
let labelCameraRaf=0;
let labelCameraWorking=false;
let labelCameraCaptures=[];
let labelCameraImageCapture=null;
let labelCameraPhotoSettings=null;
let fileNameResolve=null;
let labelProjectSaveTimer=0;
let labelProjectRestoreAvailable=false;
const LABEL_CAMERA_PREVIEW_MAX_W = 1600;
const LABEL_CAMERA_PREVIEW_H = 120;
const LABEL_CAMERA_ASSIST_X = .18;
const LABEL_CAMERA_ASSIST_Y = .025;
const LABEL_CAMERA_GHOST_RATIO = .24;


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
let currentMode = 'adjust';
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
function loadLabelNameCounter(){
  try{
    const saved=Number(localStorage.getItem(LABEL_NAME_COUNTER_KEY)||'1');
    labelNameCounter=Number.isFinite(saved)&&saved>0?Math.floor(saved):1;
  }catch(err){ console.warn('Could not load label counter', err); }
}
function saveLabelNameCounter(){
  try{ localStorage.setItem(LABEL_NAME_COUNTER_KEY, String(labelNameCounter)); }catch(err){ console.warn('Could not save label counter', err); }
}
function getDefaultLabelName(){
  return `MeshDoctor-label ${String(labelNameCounter).padStart(2,'0')}`;
}
function advanceLabelNameCounter(){
  labelNameCounter += 1;
  saveLabelNameCounter();
  if(labelEditorMode){
    currentFileBase=getDefaultLabelName();
    syncImageOutputName();
  }
}
function syncSettingsUi(){
  const name=$('settingsPdfName');
  if(name) name.value=userSettings.pdfFilename||'MeshDoctor-created';
  updateOutputFolderUi();
}
function openLabelProjectDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)) return resolve(null);
    const req=indexedDB.open(LABEL_PROJECT_DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(LABEL_PROJECT_STORE))req.result.createObjectStore(LABEL_PROJECT_STORE);};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Label project database unavailable'));
  });
}
function updateLabelRestoreUi(){
  const btn=$('labelRestoreBtn');
  if(!btn) return;
  btn.classList.toggle('hidden',!labelProjectRestoreAvailable);
}
function loadLabelProjectMeta(){
  try{
    const raw=localStorage.getItem(LABEL_PROJECT_META_KEY);
    const meta=raw?JSON.parse(raw):null;
    labelProjectRestoreAvailable=!!(meta&&meta.count>0);
  }catch(err){labelProjectRestoreAvailable=false;}
  updateLabelRestoreUi();
}
function setLabelProjectMeta(count){
  try{
    if(count>0){
      localStorage.setItem(LABEL_PROJECT_META_KEY,JSON.stringify({count,savedAt:Date.now()}));
      labelProjectRestoreAvailable=true;
    }else{
      localStorage.removeItem(LABEL_PROJECT_META_KEY);
      labelProjectRestoreAvailable=false;
    }
  }catch(err){ console.warn('Could not save label project metadata', err); }
  updateLabelRestoreUi();
}
function scheduleLabelProjectSave(delay=280){
  clearTimeout(labelProjectSaveTimer);
  labelProjectSaveTimer=setTimeout(()=>{saveLabelProject().catch(err=>console.warn('Could not save label project',err));},delay);
}
async function saveLabelProject(){
  clearTimeout(labelProjectSaveTimer);
  const db=await openLabelProjectDb();
  if(!db){ setLabelProjectMeta(labelItems.length); return; }
  const items=labelItems.map(item=>({name:item.name,blob:item.blob,quad:item.quad?cloneLabelMesh(item.quad):null,rotation:item.rotation||0,mapView:item.mapView||{zoom:1,panX:0,panY:0}}));
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(LABEL_PROJECT_STORE,'readwrite');
    tx.objectStore(LABEL_PROJECT_STORE).put({savedAt:Date.now(),items},'last');
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('Could not save label project'));
    tx.onabort=()=>reject(tx.error||new Error('Could not save label project'));
  });
  setLabelProjectMeta(items.length);
}
async function restoreLastLabelProject(){
  const db=await openLabelProjectDb();
  if(!db){toast('Saved label projects are not available on this device.');return;}
  const record=await new Promise((resolve,reject)=>{
    const tx=db.transaction(LABEL_PROJECT_STORE,'readonly');
    const req=tx.objectStore(LABEL_PROJECT_STORE).get('last');
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error||new Error('Could not load saved label project'));
  });
  if(!record?.items?.length){
    setLabelProjectMeta(0);
    toast('No saved label project was found.');
    return;
  }
  labelItems.forEach(revokeLabelItem);
  labelItems=[];
  for(const saved of record.items){
    const blob=saved.blob instanceof Blob ? saved.blob : new Blob([saved.blob],{type:'image/jpeg'});
    const file=(blob instanceof File) ? blob : new File([blob], saved.name||`Label-${Date.now()}.jpg`, {type: blob.type||'image/jpeg'});
    labelItems.push(makeLabelItem(file,{quad:saved.quad||defaultLabelMesh(),rotation:saved.rotation||0,mapView:saved.mapView||{zoom:1,panX:0,panY:0}}));
  }
  labelSelectedId=null;
  renderLabelBuilder();
  showView('label');
  toast('Last label project restored.');
}
const OUTPUT_DB_NAME='meshdoctor-file-output';
const OUTPUT_DB_STORE='handles';
function openOutputDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)) return resolve(null);
    const req=indexedDB.open(OUTPUT_DB_NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(OUTPUT_DB_STORE))req.result.createObjectStore(OUTPUT_DB_STORE);};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function rememberOutputHandle(handle){
  try{const db=await openOutputDb();if(!db)return;await new Promise((resolve,reject)=>{const tx=db.transaction(OUTPUT_DB_STORE,'readwrite');tx.objectStore(OUTPUT_DB_STORE).put(handle,'root');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}catch(err){console.warn('Could not remember output folder',err);}
}
async function restoreOutputHandle(){
  try{const db=await openOutputDb();if(!db)return;const handle=await new Promise((resolve,reject)=>{const tx=db.transaction(OUTPUT_DB_STORE,'readonly');const req=tx.objectStore(OUTPUT_DB_STORE).get('root');req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});db.close();if(handle){outputDirHandle=handle;userSettings.outputFolderName=handle.name||'Selected folder';updateOutputFolderUi();}}catch(err){console.warn('Could not restore output folder',err);}
}
async function ensureDirectoryPermission(handle,ask=false){
  if(!handle)return false;
  const opts={mode:'readwrite'};
  try{if((await handle.queryPermission?.(opts))==='granted')return true;if(ask&&(await handle.requestPermission?.(opts))==='granted')return true;}catch(err){console.warn('Folder permission check failed',err);}return false;
}
function updateOutputFolderUi(){
  const status=$('outputFolderStatus');if(!status)return;
  if(outputDirHandle){status.textContent=`${outputDirHandle.name || 'Selected folder'} / MeshDoctor / Images + PDFs`;status.classList.add('ready');}
  else{status.textContent='Downloads (default)';status.classList.remove('ready');}
}
async function chooseOutputFolder(){
  if(typeof window.showDirectoryPicker!=='function'){toast('Folder selection is not available in this browser. Using Downloads.');return;}
  try{
    const handle=await window.showDirectoryPicker({mode:'readwrite'});
    if(!(await ensureDirectoryPermission(handle,true)))throw new Error('Folder permission was not granted');
    const md=await handle.getDirectoryHandle('MeshDoctor',{create:true});
    await md.getDirectoryHandle('Images',{create:true});
    await md.getDirectoryHandle('PDFs',{create:true});
    outputDirHandle=handle;userSettings.outputFolderName=handle.name||'Selected folder';saveSettings();await rememberOutputHandle(handle);updateOutputFolderUi();toast('MeshDoctor output folders are ready.');
  }catch(err){if(err?.name!=='AbortError'){console.warn(err);toast('Could not use that output folder.');}}
}
async function getOutputSubdirectory(kind,ask=false){
  if(!outputDirHandle)return null;
  if(!(await ensureDirectoryPermission(outputDirHandle,ask)))return null;
  const md=await outputDirHandle.getDirectoryHandle('MeshDoctor',{create:true});
  return await md.getDirectoryHandle(kind,{create:true});
}
function browserDownloadBlob(blob,fileName){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function saveBlobToOutput(blob,fileName,kind){
  try{
    const dir=await getOutputSubdirectory(kind,true);
    if(dir){const fh=await dir.getFileHandle(fileName,{create:true});const writable=await fh.createWritable();await writable.write(blob);await writable.close();toast(`Saved to MeshDoctor/${kind}.`);return true;}
  }catch(err){console.warn('Folder save failed; falling back to Downloads',err);}
  browserDownloadBlob(blob,fileName);toast('Saved to your downloads.');return false;
}
function getImageOutputBase(){
  const input=$('imageOutputName');
  return sanitizeFileName(input?.value||currentFileBase||'image','image');
}
function syncImageOutputName(){const input=$('imageOutputName');if(input)input.value=sanitizeFileName(currentFileBase||'image','image');}

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
  views.shape.classList.toggle('label-mesh-mode', false);
  if(name!=='shape') hidePointActions();
  if(name==='home'||name==='pdf'||name==='label') startHomeCameraBg();
  else stopHomeCameraBg();
  if(name==='result') updateResultActions();
  if(name==='pdf') renderPdfBuilder();
  if(name==='label') renderLabelBuilder();
  if(name==='shape') updateMeshMoveAllPosition();
  window.scrollTo(0,0);
}
function busy(on, text='Working…'){ $('busyText').textContent=text; $('busy').classList.toggle('hidden', !on); }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),2200); }
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

async function loadFile(file, options={}){
  if(!file) return;
  if(!options.preserveLabelEditor) labelEditorMode=false;
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

function defaultLabelEditMesh(){
  const w=sourceCanvas.width,h=sourceCanvas.height,mx=.015,my=.055;
  const L=w*mx,R=w*(1-mx),T=h*my,B=h*(1-my);
  return [
    {x:L,y:T,corner:0},{x:L+(R-L)*.25,y:T},{x:L+(R-L)*.50,y:T},{x:L+(R-L)*.75,y:T},{x:R,y:T,corner:1},
    {x:R,y:T+(B-T)*.50},
    {x:R,y:B,corner:2},{x:L+(R-L)*.75,y:B},{x:L+(R-L)*.50,y:B},{x:L+(R-L)*.25,y:B},{x:L,y:B,corner:3},
    {x:L,y:T+(B-T)*.50}
  ];
}
function setShapeRotationBaseFromSource(){
  shapeRotationBase.width=sourceCanvas.width;shapeRotationBase.height=sourceCanvas.height;
  shapeRotationBaseCtx.clearRect(0,0,shapeRotationBase.width,shapeRotationBase.height);
  shapeRotationBaseCtx.drawImage(sourceCanvas,0,0);
  shapeRotationDegrees=0;
  const slider=$('labelRotationSlider'),out=$('labelRotationValue');if(slider)slider.value='0';if(out)out.textContent='0.0°';
}
function renderShapeRotation(degrees){
  if(!labelEditorMode||!shapeRotationBase.width)return;
  shapeRotationDegrees=clamp(Number(degrees)||0,-10,10);
  sourceCanvas.width=shapeRotationBase.width;sourceCanvas.height=shapeRotationBase.height;
  sctx.save();sctx.clearRect(0,0,sourceCanvas.width,sourceCanvas.height);sctx.fillStyle='#05070a';sctx.fillRect(0,0,sourceCanvas.width,sourceCanvas.height);
  sctx.translate(sourceCanvas.width/2,sourceCanvas.height/2);sctx.rotate(shapeRotationDegrees*Math.PI/180);sctx.drawImage(shapeRotationBase,-shapeRotationBase.width/2,-shapeRotationBase.height/2);sctx.restore();
  setupEditCanvas();renderEditor();
  const out=$('labelRotationValue');if(out)out.textContent=`${shapeRotationDegrees.toFixed(1)}°`;
}
function meshCenter(){
  if(!points.length)return null;let x=0,y=0;for(const p of points){x+=p.x;y+=p.y;}return{x:x/points.length,y:y/points.length};
}
function updateMeshMoveAllPosition(){
  if(!meshMoveAllBtn)return;
  // Whole-mesh movement belongs to the per-image mapping stage, not the final stitched-label mesh.
  meshMoveAllBtn.classList.add('hidden');return;
  const c=meshCenter(),cr=editCanvas.getBoundingClientRect(),sr=stageWrap.getBoundingClientRect();
  if(!c||!cr.width||!cr.height){meshMoveAllBtn.classList.add('hidden');return;}
  const x=cr.left-sr.left+(c.x/editCanvas.width)*cr.width,y=cr.top-sr.top+(c.y/editCanvas.height)*cr.height;
  meshMoveAllBtn.style.left=`${clamp(x,32,sr.width-32)}px`;meshMoveAllBtn.style.top=`${clamp(y,32,sr.height-32)}px`;meshMoveAllBtn.classList.remove('hidden');
}
function translateWholeMesh(dx,dy,origin){
  if(!origin?.length)return;
  const minX=Math.min(...origin.map(p=>p.x)),maxX=Math.max(...origin.map(p=>p.x)),minY=Math.min(...origin.map(p=>p.y)),maxY=Math.max(...origin.map(p=>p.y));
  dx=clamp(dx,-minX,editCanvas.width-1-maxX);dy=clamp(dy,-minY,editCanvas.height-1-maxY);
  points=origin.map(p=>({...p,x:p.x+dx,y:p.y+dy}));selectedIndex=-1;hidePointActions();renderEditor();
}
function startLabelPostStitchEditor(img){
  labelEditorMode=true;pdfEditingId=null;clearAiReference(true);currentFileBase=getDefaultLabelName();
  sourceCanvas.width=img.width;sourceCanvas.height=img.height;sctx.putImageData(img,0,0);setupEditCanvas();
  points=defaultLabelEditMesh();history=[];selectedIndex=-1;correctedOriginal=null;correctedImage=null;aiAssistImage=null;adjustedImage=null;grayscaleImageCache=null;aiRestoreChoice=null;currentMode='adjust';resetAdjustments(false);resetViewport();renderEditor();showView('shape');
  toast('Stitch complete. Adjust the final perimeter mesh, then correct the label.');
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
  updateMeshMoveAllPosition();
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
  updateMeshMoveAllPosition();
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
  const maxOut=labelEditorMode?6144:2000, baseScale=Math.min(1,maxOut/Math.max(rawW,rawH));
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
  if(render&&currentMode==='adjust'&&correctedOriginal){correctedImage ||= cleanupImage(correctedOriginal);adjustedImage=applyAdjustments(correctedImage);displayImage(adjustedImage);}
}
async function runCorrection(){
  if(points.length<4)return;busy(true,'Correcting image…');await new Promise(r=>setTimeout(r,40));
  try{correctedOriginal=makeCorrected();correctedImage=cleanupImage(correctedOriginal);aiAssistImage=null;adjustedImage=null;grayscaleImageCache=null;aiRestoreChoice=null;currentMode='adjust';resetAdjustments(false);adjustedImage=applyAdjustments(correctedImage);displayImage(adjustedImage);syncImageOutputName();setModeButtons();showView('result');}
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
    else if(mode==='adjust'){correctedImage ||= cleanupImage(correctedOriginal);adjustedImage=applyAdjustments(correctedImage);displayImage(adjustedImage);}
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

async function gptRestorePanoramaTiled(img,mode='document'){
  const src=document.createElement('canvas');src.width=img.width;src.height=img.height;src.getContext('2d').putImageData(img,0,0);
  const maxTileW=Math.max(640,Math.min(img.width,Math.floor(img.height*2.55))),overlap=Math.max(80,Math.round(maxTileW*.16)),step=Math.max(320,maxTileW-overlap),positions=[];
  for(let x=0;x<img.width;x+=step){let w=Math.min(maxTileW,img.width-x);if(img.width-(x+w)>0&&img.width-(x+w)<overlap){w=img.width-x;}positions.push({x,w});if(x+w>=img.width)break;}
  const out=document.createElement('canvas');out.width=img.width;out.height=img.height;const ox=out.getContext('2d');
  for(let i=0;i<positions.length;i++){
    const {x,w}=positions[i];$('busyText').textContent=`AI polishing label section · ${i+1}/${positions.length}`;
    const tc=document.createElement('canvas');tc.width=w;tc.height=img.height;tc.getContext('2d').drawImage(src,x,0,w,img.height,0,0,w,img.height);let tile=tc.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,img.height),restored;
    try{restored=await gptRestoreImage(tile,mode);}catch(err){console.warn('AI tile restore fallback',i,err);restored=cleanupImage(tile);}
    const rc=document.createElement('canvas');rc.width=restored.width;rc.height=restored.height;rc.getContext('2d').putImageData(restored,0,0);const normalized=document.createElement('canvas');normalized.width=w;normalized.height=img.height;normalized.getContext('2d').drawImage(rc,0,0,w,img.height);
    if(i===0){ox.drawImage(normalized,x,0);}else{const tmp=document.createElement('canvas');tmp.width=w;tmp.height=img.height;const tx=tmp.getContext('2d');tx.drawImage(normalized,0,0);tx.globalCompositeOperation='destination-in';const leftOverlap=Math.min(overlap,w),g=tx.createLinearGradient(0,0,leftOverlap,0);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,1)');tx.fillStyle=g;tx.fillRect(0,0,leftOverlap,img.height);tx.globalCompositeOperation='source-over';ox.drawImage(tmp,x,0);}
    await new Promise(r=>setTimeout(r,0));
  }
  setAiEngineStatus('ready',`AI Image · tiled ${mode} restore complete`);return out.getContext('2d',{willReadFrequently:true}).getImageData(0,0,out.width,out.height);
}

async function runAiRestoreChoice(choice){
  aiRestoreChoice=choice;
  document.querySelectorAll('.ai-choice').forEach(b=>b.classList.toggle('active',b.dataset.aiChoice===choice));
  const resolved=choice==='automatic'?(labelEditorMode?'document':detectRestoreIntent(correctedOriginal)):choice;
  $('aiChoiceStatus').textContent=choice==='automatic'?`Automatic selected ${resolved === 'document' ? 'Document' : 'Photo'}.`:`${choice === 'document' ? 'Document' : 'Photo'} restore selected.`;
  if(aiReferenceDataUrl) $('aiChoiceStatus').textContent += ' Optional reference added.';
  const labelPanoramaRatio=labelEditorMode&&correctedOriginal?Math.max(correctedOriginal.width/correctedOriginal.height,correctedOriginal.height/correctedOriginal.width):1;
  if(labelEditorMode&&labelPanoramaRatio>3){
    busy(true,'Preparing tiled AI label polish…');await new Promise(r=>setTimeout(r,20));
    try{
      const state=await checkAiService();
      if(state==='ready'){aiAssistImage=await gptRestorePanoramaTiled(correctedOriginal,'document');$('aiChoiceStatus').textContent='Wide label restored in overlapping AI sections and blended back together.';}
      else{aiAssistImage=aggressiveCleanupImage(correctedOriginal);$('aiChoiceStatus').textContent='AI unavailable. Local Document fallback used.';}
      displayImage(aiAssistImage);currentMode='assist';setModeButtons();
    }catch(err){console.error(err);aiAssistImage=aggressiveCleanupImage(correctedOriginal);displayImage(aiAssistImage);currentMode='assist';setModeButtons();setAiEngineStatus('fallback','Wide-label AI polish failed · local restoration used');$('aiChoiceStatus').textContent='Local Document fallback used.';}
    finally{busy(false);}return;
  }
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
  adjustTimer=setTimeout(()=>{if(currentMode!=='adjust'||!correctedOriginal)return;correctedImage ||= cleanupImage(correctedOriginal);adjustedImage=applyAdjustments(correctedImage);displayImage(adjustedImage);},55);
}

function rotateSource(){
  const c=document.createElement('canvas');c.width=sourceCanvas.height;c.height=sourceCanvas.width;const cx=c.getContext('2d');cx.translate(c.width,0);cx.rotate(Math.PI/2);cx.drawImage(sourceCanvas,0,0);
  sourceCanvas.width=c.width;sourceCanvas.height=c.height;sctx.drawImage(c,0,0);setupEditCanvas();points=labelEditorMode?defaultLabelEditMesh():autoDetectDocument();history=[];selectedIndex=-1;hidePointActions();if(labelEditorMode)setShapeRotationBaseFromSource();resetViewport();renderEditor();
}


function updateResultActions(){
  const save=$('savePngBtn');
  if(!save)return;
  save.textContent=pdfEditingId?'Save & Continue':'Save PNG';
  save.setAttribute('aria-label',pdfEditingId?'Save edited page and return to PDF builder':(labelEditorMode?'Save stitched label PNG':'Save PNG'));
  if(labelEditorMode){const name=$('imageOutputName');if(name&&!name.value)name.value=getDefaultLabelName();}
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

function makeLabelItem(file,opts={}){
  const item={id:`LBL-${Date.now().toString(36)}-${(++labelUid).toString(36)}`,name:file.name||`Label-${labelUid}.jpg`,blob:file,url:URL.createObjectURL(file),quad:cloneLabelMesh(defaultLabelMesh()),rotation:0,mapView:{zoom:1,panX:0,panY:0}};
  if(opts.quad)item.quad=cloneLabelMesh(opts.quad);
  if(Number.isFinite(opts.rotation))item.rotation=Number(opts.rotation)||0;
  if(opts.mapView)item.mapView={zoom:1,panX:0,panY:0,...opts.mapView};
  return item;
}
function labelItemById(id){return labelItems.find(x=>x.id===id);}
function revokeLabelItem(item){if(item?.url)try{URL.revokeObjectURL(item.url);}catch{}}
function moveLabelItem(from,to){if(from===to||from<0||to<0||from>=labelItems.length||to>=labelItems.length)return;const [item]=labelItems.splice(from,1);labelItems.splice(to,0,item);scheduleLabelProjectSave();}
function clearLabelDropTargets(){document.querySelectorAll('.label-image-list .pdf-item.drop-target').forEach(el=>el.classList.remove('drop-target'));}
function bindLabelDrag(handle,tile,itemId){
  handle.addEventListener('click',e=>e.stopPropagation());
  handle.addEventListener('pointerdown',ev=>{
    if(ev.button!=null&&ev.button!==0)return;const from=labelItems.findIndex(x=>x.id===itemId);if(from<0)return;
    labelDrag={itemId,from,targetId:itemId,startX:ev.clientX,startY:ev.clientY,moved:false,pointerId:ev.pointerId};tile.classList.add('dragging');
    try{handle.setPointerCapture(ev.pointerId);}catch{} ev.preventDefault();ev.stopPropagation();
  });
  handle.addEventListener('pointermove',ev=>{
    if(!labelDrag||labelDrag.pointerId!==ev.pointerId)return;if(Math.hypot(ev.clientX-labelDrag.startX,ev.clientY-labelDrag.startY)>5)labelDrag.moved=true;if(!labelDrag.moved)return;
    const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest?.('.label-image-list .pdf-item');clearLabelDropTargets();
    if(target&&target.dataset.id!==itemId){target.classList.add('drop-target');labelDrag.targetId=target.dataset.id;}else labelDrag.targetId=itemId;ev.preventDefault();
  });
  const end=ev=>{if(!labelDrag||labelDrag.pointerId!==ev.pointerId)return;const drag=labelDrag;labelDrag=null;try{handle.releasePointerCapture(ev.pointerId);}catch{}clearLabelDropTargets();tile.classList.remove('dragging');if(drag.moved){const to=labelItems.findIndex(x=>x.id===drag.targetId);if(to>=0&&to!==drag.from)moveLabelItem(drag.from,to);labelSuppressClickUntil=Date.now()+320;renderLabelBuilder();}ev.preventDefault();ev.stopPropagation();};
  handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
}
function renderLabelBuilder(){
  const list=$('labelImageList'),empty=$('labelEmpty');if(!list||!empty)return;list.innerHTML='';empty.classList.toggle('hidden',labelItems.length>0);list.classList.toggle('hidden',labelItems.length===0);
  if(labelSelectedId&&!labelItemById(labelSelectedId))labelSelectedId=null;
  labelItems.forEach((item,index)=>{
    const tile=document.createElement('div');tile.className='pdf-item'+(labelSelectedId===item.id?' selected':'');tile.dataset.id=item.id;
    const thumb=document.createElement('div');thumb.className='pdf-thumb';const img=document.createElement('img');img.src=item.url;img.alt=`Label image ${index+1}`;thumb.appendChild(img);
    const pageNo=document.createElement('span');pageNo.className='pdf-page-no';pageNo.textContent=String(index+1);thumb.appendChild(pageNo);
    const handle=document.createElement('button');handle.type='button';handle.className='pdf-drag-handle';handle.innerHTML='<svg class="move-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';thumb.appendChild(handle);
    const actions=document.createElement('div');actions.className='pdf-tile-actions';
    const replace=document.createElement('button');replace.type='button';replace.className='pdf-replace-item';replace.textContent='↻ Replace';
    const remove=document.createElement('button');remove.type='button';remove.className='pdf-remove-item';remove.textContent='✕ Remove';actions.append(replace,remove);thumb.appendChild(actions);tile.appendChild(thumb);
    const name=document.createElement('div');name.className='pdf-name';name.textContent=item.name;tile.appendChild(name);
    tile.addEventListener('click',()=>{if(Date.now()<labelSuppressClickUntil)return;labelSelectedId=labelSelectedId===item.id?null:item.id;renderLabelBuilder();});
    replace.addEventListener('click',ev=>{ev.stopPropagation();labelReplaceTargetId=item.id;$('labelReplaceInput').click();});
    remove.addEventListener('click',ev=>{ev.stopPropagation();const i=labelItems.findIndex(x=>x.id===item.id);if(i>=0){revokeLabelItem(labelItems[i]);labelItems.splice(i,1);if(labelSelectedId===item.id)labelSelectedId=null;renderLabelBuilder();scheduleLabelProjectSave();}});
    bindLabelDrag(handle,tile,item.id);list.appendChild(tile);
  });
  $('labelContinueBtn').disabled=labelItems.length===0;
  updateLabelRestoreUi();
}
function addLabelFiles(files){const images=[...files].filter(f=>f.type?.startsWith('image/'));if(!images.length){toast('Choose one or more images.');return;}labelItems.push(...images.map(file=>makeLabelItem(file,{quad:defaultLabelMesh()})));labelSelectedId=null;renderLabelBuilder();scheduleLabelProjectSave();}

function openLabelAddDialog(){const dlg=$('labelAddDialog');if(dlg&&!dlg.open)dlg.showModal();}
function closeLabelAddDialog(){if($('labelAddDialog')?.open)$('labelAddDialog').close();}
function defaultLabelCameraGuideState(){
  return {
    mirror:true,
    auto:true,
    points:{
      top:[{x:0,y:.18},{x:.25,y:.18},{x:.5,y:.18},{x:.75,y:.18},{x:1,y:.18}],
      bottom:[{x:0,y:.82},{x:.25,y:.82},{x:.5,y:.82},{x:.75,y:.82},{x:1,y:.82}]
    },
    prevStrip:null,
    currentStrip:null,
    alignScore:0,
    matchFrames:0,
    lastCaptureAt:0,
    lastSampleAt:0,
    dragging:null,
    sampleCanvas:null,
    previewPanorama:null,
    previewFrameCount:0,
    previewAnchor:null,
    firstPreviewFrame:null,
    previewDirection:null,
    previewAdvance:0,
    lastPreviewAt:0,
    liveNewRatio:0,
    loopHint:false,
    ghostPreview:null,
    liveGhostCanvas:null,
    ghostVersion:0,
    peakScore:0,
    previousScore:0,
    peakNewRatio:0,
    scoreDropFrames:0,
    guideLocked:false,
    instruction:'Frame one clear section, take the first shot, then rotate slowly. MeshDoctor will recognize the label and extend it as you move.'
  };
}
function syncLabelCameraMirror(){
  const s=labelCameraGuideState;if(!s)return;
  const b=labelCameraGuideLocalBounds();
  const left=b.left,right=b.right,top=b.top,bottom=b.bottom;
  const xs=[left,left+(right-left)*.25,.5,left+(right-left)*.75,right];
  s.points.top=xs.map(x=>({x,y:top}));
  s.points.bottom=xs.map(x=>({x,y:bottom}));
}
function getLabelCameraGuideRect(canvas){const w=canvas.width,h=canvas.height;return{x:w*.10,y:h*.11,w:w*.80,h:h*.74};}
function getLabelCameraEditableRefs(){ return []; }
function labelCameraPointToPixel(ref,rect){const p=labelCameraGuideState.points[ref.row][ref.i];return{x:rect.x+p.x*rect.w,y:rect.y+p.y*rect.h};}
function labelCameraGuideLocalBounds(){
  const s=labelCameraGuideState;if(!s)return {left:0,right:1,top:.12,bottom:.88};
  const all=[...s.points.top,...s.points.bottom];
  return {
    left:Math.min(...all.map(p=>p.x)),
    right:Math.max(...all.map(p=>p.x)),
    top:Math.min(...all.map(p=>p.y)),
    bottom:Math.max(...all.map(p=>p.y))
  };
}
function scaleLabelCameraGuide(edge,value){
  const s=labelCameraGuideState;if(!s||s.guideLocked)return;
  const b=labelCameraGuideLocalBounds(),minSpan=.08;
  const rows=['top','bottom'];
  if(edge==='left'||edge==='right'){
    const center=.5;
    const half=edge==='left'?center-clamp(value,.01,center-minSpan/2):clamp(value,center+minSpan/2,.99)-center;
    const h=clamp(half,minSpan/2,.49),nextL=center-h,nextR=center+h;
    const oldSpan=Math.max(minSpan,b.right-b.left),nextSpan=Math.max(minSpan,nextR-nextL);
    rows.forEach(name=>s.points[name].forEach(pt=>{const u=(pt.x-b.left)/oldSpan;pt.x=nextL+u*nextSpan;}));
    syncLabelCameraMirror();
    return;
  }
  const center=(b.top+b.bottom)/2;
  const rawHalf=edge==='top'?center-clamp(value,.01,center-minSpan/2):clamp(value,center+minSpan/2,.99)-center;
  const half=clamp(rawHalf,minSpan/2,.49);
  const nextT=center-half,nextB=center+half;
  const oldSpan=Math.max(minSpan,b.bottom-b.top),nextSpan=Math.max(minSpan,nextB-nextT);
  rows.forEach(name=>s.points[name].forEach(pt=>{const u=(pt.y-b.top)/oldSpan;pt.y=nextT+u*nextSpan;}));
}
function setLabelCameraPoint(){ /* Photo mode now uses a simple handled capture box. */ }
function getLabelCameraScaleHandles(canvas){
  const rect=getLabelCameraGuideRect(canvas),b=labelCameraGuideLocalBounds();
  const left=rect.x+b.left*rect.w,right=rect.x+b.right*rect.w,top=rect.y+b.top*rect.h,bottom=rect.y+b.bottom*rect.h;
  const dpr=Math.max(1,window.devicePixelRatio||1),cx=(left+right)/2,cy=(top+bottom)/2;
  const sideOffset=Math.max(24*dpr,canvas.width*.018);
  const verticalOffset=Math.max(24*dpr,canvas.height*.020);
  return [
    {edge:'left',x:left-sideOffset,y:cy,angle:0},
    {edge:'top',x:cx,y:top-verticalOffset,angle:Math.PI/2}
  ];
}
function labelCameraNearestScaleHandle(x,y){
  const canvas=resizeLabelCameraOverlay();if(!canvas)return null;
  let best=null,bd=Infinity;for(const h of getLabelCameraScaleHandles(canvas)){const d=Math.hypot(h.x-x,h.y-y);if(d<bd){bd=d;best=h;}}
  return bd<=54*(window.devicePixelRatio||1)?{...best,distance:bd}:null;
}
function resizeLabelCameraOverlay(){
  const canvas=$('labelCameraOverlay'); if(!canvas)return null;
  const rect=canvas.getBoundingClientRect(),dpr=1;
  const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  return canvas;
}
function smoothPath(ctx,pts){if(pts.length<2)return;ctx.moveTo(pts[0].x,pts[0].y);for(let i=0;i<pts.length-1;i++){const p=pts[i],n=pts[i+1],mx=(p.x+n.x)/2,my=(p.y+n.y)/2;ctx.quadraticCurveTo(p.x,p.y,mx,my);}const lp=pts[pts.length-1];ctx.lineTo(lp.x,lp.y);}
function fitLabelCameraPreviewWidth(canvas,maxW=LABEL_CAMERA_PREVIEW_MAX_W){
  if(!canvas||canvas.width<=maxW)return canvas;
  const ratio=maxW/Math.max(1,canvas.width);
  const out=document.createElement('canvas');
  out.width=Math.max(1,Math.round(canvas.width*ratio));
  out.height=Math.max(1,Math.round(canvas.height*ratio));
  out.getContext('2d').drawImage(canvas,0,0,out.width,out.height);
  return out;
}
function clearLabelCameraPreviewUi(){
  const c=$('labelCameraPreviewCanvas'),meta=$('labelCameraPreviewMeta');
  if(meta) meta.textContent='0 live additions · 0 HQ captures';
  if(!c)return;
  const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
  const g=ctx.createLinearGradient(0,0,0,c.height);g.addColorStop(0,'rgba(11,22,35,.98)');g.addColorStop(1,'rgba(6,12,20,.98)');ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height);
  ctx.strokeStyle='rgba(87,217,255,.18)';ctx.lineWidth=2;ctx.strokeRect(1,1,c.width-2,c.height-2);
  ctx.setLineDash([10,8]);ctx.strokeStyle='rgba(255,79,227,.22)';ctx.beginPath();ctx.moveTo(18,c.height/2);ctx.lineTo(c.width-18,c.height/2);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='rgba(215,230,243,.86)';ctx.font='600 24px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('Live stitched label will appear here',c.width/2,c.height/2-6);
  ctx.font='400 18px system-ui, sans-serif';ctx.fillStyle='rgba(159,176,191,.92)';ctx.fillText('Capture once, then rotate the item slowly.',c.width/2,c.height/2+24);
}
function renderLabelCameraPreviewUi(){
  const c=$('labelCameraPreviewCanvas'),meta=$('labelCameraPreviewMeta'),s=labelCameraGuideState;
  if(meta) meta.textContent=`${s?.previewFrameCount||0} live addition${(s?.previewFrameCount||0)===1?'':'s'} · ${labelCameraSessionCount} HQ capture${labelCameraSessionCount===1?'':'s'}`;
  if(!c)return;
  const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
  const g=ctx.createLinearGradient(0,0,0,c.height);g.addColorStop(0,'rgba(11,22,35,.98)');g.addColorStop(1,'rgba(6,12,20,.98)');ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height);
  if(!s?.previewPanorama){clearLabelCameraPreviewUi();return;}
  const pano=s.previewPanorama,pad=10,availW=c.width-pad*2,availH=c.height-pad*2;
  const sx=Math.max(0,Math.floor(s.previewStartX||0)),ex=Math.min(pano.width,Math.ceil(s.previewEndX||pano.width)),sw=Math.max(1,ex-sx);
  const scale=Math.min(availW/sw,availH/Math.max(1,pano.height));
  const dw=Math.max(1,Math.round(sw*scale)),dh=Math.max(1,Math.round(pano.height*scale)),dx=pad,dy=Math.round((c.height-dh)/2);
  ctx.strokeStyle='rgba(87,217,255,.16)';ctx.lineWidth=2;ctx.strokeRect(dx-1,dy-1,dw+2,dh+2);ctx.drawImage(pano,sx,0,sw,pano.height,dx,dy,dw,dh);
  ctx.fillStyle='rgba(53,207,255,.18)';ctx.fillRect(pad,c.height-7,availW,3);ctx.fillStyle='rgba(53,207,255,.92)';ctx.fillRect(pad,c.height-7,Math.max(24,Math.min(availW,dw)),3);
}
function labelCameraLowResFrame(){
  const s=labelCameraGuideState,video=$('labelCameraVideo'),crop=labelCameraSourceCrop(0,0);if(!s||!video?.videoWidth||!crop)return null;
  const maxW=96,maxH=56,scale=Math.min(maxW/crop.sw,maxH/crop.sh),w=Math.max(36,Math.round(crop.sw*scale)),h=Math.max(24,Math.round(crop.sh*scale));
  let canvas=s.motionCanvas;if(!canvas){canvas=document.createElement('canvas');s.motionCanvas=canvas;}if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  canvas.getContext('2d',{alpha:false}).drawImage(video,crop.sx,crop.sy,crop.sw,crop.sh,0,0,w,h);
  const gw=48,gh=Math.max(18,Math.round(h*(gw/w)));let g=s.motionGrayCanvas;if(!g){g=document.createElement('canvas');s.motionGrayCanvas=g;}if(g.width!==gw||g.height!==gh){g.width=gw;g.height=gh;}
  const gx=g.getContext('2d',{willReadFrequently:true,alpha:false});gx.drawImage(canvas,0,0,gw,gh);
  const rgba=gx.getImageData(0,0,gw,gh).data,gray=new Uint8Array(gw*gh);for(let i=0,j=0;i<rgba.length;i+=4,j++)gray[j]=Math.round(.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2]);
  const preview=document.createElement('canvas');preview.width=w;preview.height=h;preview.getContext('2d').drawImage(canvas,0,0);
  return {canvas:preview,w,h,gw,gh,gray};
}
function labelCameraOverlapScore(a,b,ow,dy,direction){
  const top=2,bottom=Math.min(a.gh,b.gh)-2;let diff=0,count=0;
  for(let y=top;y<bottom;y+=2){const by=y+dy;if(by<top||by>=bottom)continue;
    const aStart=direction==='right'?a.gw-ow:0,bStart=direction==='right'?0:b.gw-ow;
    for(let x=0;x<ow;x+=2){diff+=Math.abs(a.gray[y*a.gw+aStart+x]-b.gray[by*b.gw+bStart+x]);count++;}
  }
  return count?1-diff/(count*255):0;
}
function estimateLabelCameraMotion(a,b,lockedDirection=null){
  if(!a||!b||a.gw!==b.gw||a.gh!==b.gh)return null;
  const dirs=lockedDirection?[lockedDirection]:['right','left'],maxOw=Math.max(10,Math.floor(a.gw*.96)),minOw=Math.max(8,Math.floor(a.gw*.52));
  let best=null;
  for(const direction of dirs){
    for(let ow=maxOw;ow>=minOw;ow-=4){
      const fraction=ow/a.gw;
      for(let dy=-2;dy<=2;dy++){
        const score=labelCameraOverlapScore(a,b,ow,dy,direction),weighted=score-(1-fraction)*.028;
        if(!best||weighted>best.weighted)best={direction,overlap:ow,dy,score,weighted,newRatio:1-fraction};
      }
    }
  }
  return best;
}
function sameLabelCameraFrameScore(a,b){
  if(!a||!b||a.gw!==b.gw||a.gh!==b.gh)return 0;let diff=0;for(let i=0;i<a.gray.length;i+=3)diff+=Math.abs(a.gray[i]-b.gray[i]);return 1-diff/(Math.ceil(a.gray.length/3)*255);
}
function seedLabelCameraPreviewFromLive(){
  const s=labelCameraGuideState;if(!s)return null;const frame=labelCameraLowResFrame();if(!frame)return null;
  const pano=document.createElement('canvas');pano.width=1600;pano.height=frame.canvas.height;const ctx=pano.getContext('2d',{alpha:false});ctx.fillStyle='#07101a';ctx.fillRect(0,0,pano.width,pano.height);
  const startX=520;ctx.drawImage(frame.canvas,startX,0);
  s.previewPanorama=pano;s.previewStartX=startX;s.previewEndX=startX+frame.canvas.width;s.previewAnchor=frame;s.firstPreviewFrame=frame;s.previewFrameCount=1;s.previewAdvance=0;s.previewDirection=null;s.loopHint=false;renderLabelCameraPreviewUi();return frame;
}
function appendLabelCameraLivePixels(frame,est){
  const s=labelCameraGuideState;if(!s||!frame||!est||est.score<.64||est.newRatio<.06)return false;
  if(!s.previewDirection&&est.newRatio>=.08)s.previewDirection=est.direction;
  if(s.previewDirection&&est.direction!==s.previewDirection)return false;
  const pano=s.previewPanorama;if(!pano)return false;
  const overlapPx=clamp(Math.round((est.overlap/frame.gw)*frame.canvas.width),1,frame.canvas.width-1),newPx=frame.canvas.width-overlapPx;if(newPx<4)return false;
  const ctx=pano.getContext('2d',{alpha:false}),direction=s.previewDirection||est.direction;
  if(direction==='left'){
    const dst=Math.round((s.previewStartX||0)-newPx);if(dst<4)return false;
    ctx.drawImage(frame.canvas,0,0,newPx,frame.canvas.height,dst,0,newPx,frame.canvas.height);s.previewStartX=dst;
  }else{
    const dst=Math.round(s.previewEndX||0);if(dst+newPx>=pano.width-4)return false;
    ctx.drawImage(frame.canvas,overlapPx,0,newPx,frame.canvas.height,dst,0,newPx,frame.canvas.height);s.previewEndX=dst+newPx;
  }
  s.previewAnchor=frame;s.previewFrameCount++;s.previewAdvance+=newPx;s.liveNewRatio=est.newRatio;
  // Panorama-style guidance: every frame that is confidently accepted becomes the new
  // visual reference. This keeps the ghost tied to recognized/committed pixels instead
  // of showing a fixed overlap zone inside the capture box.
  const liveGhost=labelCameraLiveGhostPreview(direction==='left'?'left':'right');
  if(liveGhost)s.ghostPreview=liveGhost;
  const usedW=(s.previewEndX||0)-(s.previewStartX||0);
  if(!s.loopHint&&s.previewFrameCount>=7&&usedW>frame.canvas.width*2.1&&sameLabelCameraFrameScore(s.firstPreviewFrame,frame)>.88)s.loopHint=true;
  renderLabelCameraPreviewUi();return true;
}
function advanceLabelCameraPreviewFromLive(){
  const s=labelCameraGuideState;if(!s?.previewPanorama||!s.previewAnchor)return null;const frame=labelCameraLowResFrame();if(!frame)return null;
  const est=estimateLabelCameraMotion(s.previewAnchor,frame,s.previewDirection);if(!est)return null;s.alignScore=est.score;s.liveNewRatio=est.newRatio;
  const appended=appendLabelCameraLivePixels(frame,est);return {...est,appended,frameWidth:frame.canvas.width};
}
function updateLabelCameraUi(){
  const s=labelCameraGuideState;if(!s)return;
  const first=$('labelCameraFirstShot'),help=$('labelCameraInstructionText');
  if(first){first.classList.add('hidden');first.textContent='';}
  if(!help)return;
  const wrap=help.closest?.('.label-camera-instruction');if(wrap)wrap.classList.remove('hidden');
  help.classList.remove('match-good','match-almost','match-loop');
  if(!s.previewPanorama){help.textContent='Alignment 0%';return;}
  const pct=Math.round(s.alignScore*100);
  if(s.loopHint){
    help.textContent=`Alignment ${pct}% · Loop detected`;
    help.classList.add('match-loop');
    return;
  }
  if(labelCameraWorking&&labelCameraSessionCount>0){
    help.textContent=`Alignment ${pct}% · Capturing`;
    help.classList.add('match-good');
    return;
  }
  if(s.alignScore>.72){
    help.textContent=`Alignment ${pct}% · Ready`;
    help.classList.add('match-good');
    return;
  }
  if(s.alignScore>.60){
    help.textContent=`Alignment ${pct}%`;
    help.classList.add('match-almost');
    return;
  }
  help.textContent=`Alignment ${pct}%`;
}
function drawLabelCameraOverlay(){
  const s=labelCameraGuideState,canvas=resizeLabelCameraOverlay(); if(!s||!canvas)return;
  const ctx=canvas.getContext('2d'),rect=getLabelCameraGuideRect(canvas); ctx.clearRect(0,0,canvas.width,canvas.height);
  const b=labelCameraGuideLocalBounds();
  const left=rect.x+b.left*rect.w,right=rect.x+b.right*rect.w,top=rect.y+b.top*rect.h,bottom=rect.y+b.bottom*rect.h;
  const direction=s.previewDirection||'right',ghost=s.ghostPreview||s.prevStrip?.preview||null;

  // The ghost is a continuation reference, not an overlap target. Keep it completely
  // OUTSIDE the capture box and snap its leading edge directly against the box.
  // Normal rightward panorama motion therefore shows the accepted label on the left,
  // exactly like a panorama camera guide. Reverse motion is mirrored automatically.
  if(ghost){
    const desiredGhostW=Math.max(24*(window.devicePixelRatio||1),(right-left)*LABEL_CAMERA_GHOST_RATIO);
    const edgeGap=0;
    const available=direction==='left'?(canvas.width-right-edgeGap):(left-edgeGap);
    const ghostW=Math.max(14,Math.min(desiredGhostW,Math.max(14,available)));
    const gx=direction==='left'?right+edgeGap:left-edgeGap-ghostW,gy=top,gh=bottom-top;
    ctx.save();
    ctx.beginPath();ctx.rect(gx,gy,ghostW,gh);ctx.clip();
    ctx.globalAlpha=.48;
    ctx.drawImage(ghost,gx,gy,ghostW,gh);
    ctx.restore();
  }

  // The capture box remains only as a framing guide for the NEW live section. There is
  // intentionally no visible overlap strip, seam target, center line, or alignment text.
  ctx.save();
  ctx.fillStyle='rgba(53,207,255,.028)';ctx.strokeStyle='rgba(83,225,255,.98)';ctx.lineWidth=Math.max(2,canvas.width*.0018);ctx.shadowColor='rgba(53,207,255,.38)';ctx.shadowBlur=7;
  ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.fill();ctx.stroke();ctx.restore();
  if(!s.guideLocked){
    for(const h of getLabelCameraScaleHandles(canvas)){
      ctx.save();ctx.translate(h.x,h.y);ctx.rotate(h.angle);ctx.shadowColor='rgba(255,79,227,.92)';ctx.shadowBlur=Math.max(14,canvas.width*.012);ctx.fillStyle='#ff4fe3';ctx.font=`900 ${Math.max(32*(window.devicePixelRatio||1),canvas.width*.028)}px system-ui, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('›',0,-1);ctx.restore();
    }
  }
  updateLabelCameraUi();
}
function stopLabelCameraLoop(){if(labelCameraRaf){cancelAnimationFrame(labelCameraRaf);labelCameraRaf=0;}}
function labelCameraGuideBoundsNormalized(){
  const s=labelCameraGuideState;if(!s)return {left:.10,right:.90,top:.20,bottom:.80};
  const rect={x:.10,y:.11,w:.80,h:.74};
  const all=[...s.points.top,...s.points.bottom];
  const minX=Math.min(...all.map(p=>p.x)),maxX=Math.max(...all.map(p=>p.x));
  const minY=Math.min(...all.map(p=>p.y)),maxY=Math.max(...all.map(p=>p.y));
  return {left:rect.x+minX*rect.w,right:rect.x+maxX*rect.w,top:rect.y+minY*rect.h,bottom:rect.y+maxY*rect.h};
}
function labelCameraDisplayRectToVideoSource(left,top,right,bottom){
  const video=$('labelCameraVideo'),canvas=resizeLabelCameraOverlay();
  if(!video?.videoWidth||!canvas)return null;
  const dw=canvas.width,dh=canvas.height,vw=video.videoWidth,vh=video.videoHeight;
  const scale=Math.max(dw/vw,dh/vh),rw=vw*scale,rh=vh*scale,ox=(dw-rw)/2,oy=(dh-rh)/2;
  let sx=(left*dw-ox)/scale,sy=(top*dh-oy)/scale,ex=(right*dw-ox)/scale,ey=(bottom*dh-oy)/scale;
  sx=clamp(sx,0,vw-1); sy=clamp(sy,0,vh-1); ex=clamp(ex,sx+1,vw); ey=clamp(ey,sy+1,vh);
  return {sx,sy,sw:ex-sx,sh:ey-sy};
}
function labelCameraSourceCrop(padX=.05,padY=.035){
  const b=labelCameraGuideBoundsNormalized();
  const w=b.right-b.left,h=b.bottom-b.top;
  return labelCameraDisplayRectToVideoSource(clamp(b.left-w*padX,0,1),clamp(b.top-h*padY,0,1),clamp(b.right+w*padX,0,1),clamp(b.bottom+h*padY,0,1));
}
function labelCameraCaptureGeometry(){
  const b=labelCameraGuideBoundsNormalized(),w=b.right-b.left,h=b.bottom-b.top;
  const core=labelCameraDisplayRectToVideoSource(b.left,b.top,b.right,b.bottom);
  const assist=labelCameraDisplayRectToVideoSource(
    clamp(b.left-w*LABEL_CAMERA_ASSIST_X,0,1),
    clamp(b.top-h*LABEL_CAMERA_ASSIST_Y,0,1),
    clamp(b.right+w*LABEL_CAMERA_ASSIST_X,0,1),
    clamp(b.bottom+h*LABEL_CAMERA_ASSIST_Y,0,1)
  );
  if(!core||!assist)return null;
  return {core,assist};
}
function labelCameraRectNorm(rect,video){
  return {
    x:clamp(rect.sx/Math.max(1,video.videoWidth),0,1),
    y:clamp(rect.sy/Math.max(1,video.videoHeight),0,1),
    w:clamp(rect.sw/Math.max(1,video.videoWidth),.001,1),
    h:clamp(rect.sh/Math.max(1,video.videoHeight),.001,1)
  };
}
function labelCameraLiveGhostPreview(side='right'){
  const s=labelCameraGuideState,video=$('labelCameraVideo'),geom=labelCameraCaptureGeometry();if(!s||!video?.videoWidth||!geom)return null;
  const core=geom.core,ratio=LABEL_CAMERA_GHOST_RATIO;
  const sx=side==='left'?core.sx:core.sx+core.sw*(1-ratio),sw=Math.max(2,core.sw*ratio);
  const targetH=240,scale=targetH/Math.max(1,core.sh),targetW=Math.max(64,Math.round(sw*scale));
  let out=s.liveGhostCanvas;if(!out){out=document.createElement('canvas');s.liveGhostCanvas=out;}
  if(out.width!==targetW||out.height!==targetH){out.width=targetW;out.height=targetH;}
  const ctx=out.getContext('2d');ctx.clearRect(0,0,out.width,out.height);ctx.drawImage(video,sx,core.sy,sw,core.sh,0,0,out.width,out.height);
  return out;
}
async function labelCameraGhostFromCapture(capture,side='right'){
  const meta=await labelCameraCaptureToCanvas(capture,{withMeta:true,maxEdge:900,mode:'assist'});
  if(!meta?.canvas||!meta.coreRect)return null;
  const {canvas,coreRect}=meta,ratio=LABEL_CAMERA_GHOST_RATIO;
  const sx=side==='left'?coreRect.x:coreRect.x+coreRect.w*(1-ratio),sw=Math.max(2,coreRect.w*ratio);
  const out=document.createElement('canvas');
  const targetH=Math.min(480,Math.max(320,Math.round(coreRect.h)));const scale=targetH/Math.max(1,coreRect.h);
  out.width=Math.max(96,Math.round(sw*scale));out.height=targetH;
  out.getContext('2d').drawImage(canvas,sx,coreRect.y,sw,coreRect.h,0,0,out.width,out.height);
  return out;
}
function labelCameraDisplayPointToVideoSource(nx,ny){
  const video=$('labelCameraVideo'),canvas=resizeLabelCameraOverlay();
  if(!video?.videoWidth||!canvas)return null;
  const dw=canvas.width,dh=canvas.height,vw=video.videoWidth,vh=video.videoHeight;
  const scale=Math.max(dw/vw,dh/vh),rw=vw*scale,rh=vh*scale,ox=(dw-rw)/2,oy=(dh-rh)/2;
  return {x:clamp((nx*dw-ox)/scale,0,vw-1),y:clamp((ny*dh-oy)/scale,0,vh-1)};
}
function labelCameraGuideQuadForCrop(crop){
  const s=labelCameraGuideState;if(!s||!crop||crop.sw<2||crop.sh<2)return null;
  const rect={x:.10,y:.11,w:.80,h:.74};
  const mapPoint=pt=>{
    const src=labelCameraDisplayPointToVideoSource(rect.x+pt.x*rect.w,rect.y+pt.y*rect.h);
    if(!src)return null;
    return {x:clamp((src.x-crop.sx)/crop.sw,0,1),y:clamp((src.y-crop.sy)/crop.sh,0,1)};
  };
  const top=s.points.top.map(mapPoint),bottom=s.points.bottom.map(mapPoint);
  if([...top,...bottom].some(p=>!p))return null;
  return [
    {x:top[0].x,y:top[0].y,corner:0},
    {x:top[1].x,y:top[1].y},
    {x:top[2].x,y:top[2].y},
    {x:top[3].x,y:top[3].y},
    {x:top[4].x,y:top[4].y,corner:1},
    {x:bottom[4].x,y:bottom[4].y,corner:2},
    {x:bottom[3].x,y:bottom[3].y},
    {x:bottom[2].x,y:bottom[2].y},
    {x:bottom[1].x,y:bottom[1].y},
    {x:bottom[0].x,y:bottom[0].y,corner:3}
  ];
}
function sampleLabelCameraStrip(side='left'){
  const s=labelCameraGuideState,video=$('labelCameraVideo'); if(!s||!video?.videoWidth)return null;
  const b=labelCameraGuideBoundsNormalized(),w=b.right-b.left,h=b.bottom-b.top;
  const stripW=Math.max(.02,w*.18),left=side==='left'?b.left:b.right-stripW;
  const crop=labelCameraDisplayRectToVideoSource(left,b.top+h*.10,left+stripW,b.bottom-h*.10); if(!crop)return null;
  let c=s.sampleCanvas; if(!c){c=document.createElement('canvas');c.width=20;c.height=48;s.sampleCanvas=c;}
  const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.clearRect(0,0,c.width,c.height); ctx.drawImage(video,crop.sx,crop.sy,crop.sw,crop.sh,0,0,c.width,c.height);
  const d=ctx.getImageData(0,0,c.width,c.height).data,out=new Uint8Array(c.width*c.height);
  for(let i=0,j=0;i<d.length;i+=4,j++)out[j]=Math.round(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2]);
  const preview=document.createElement('canvas');preview.width=c.width;preview.height=c.height;preview.getContext('2d').drawImage(c,0,0);
  return {w:c.width,h:c.height,data:out,preview};
}
function compareLumaSamples(a,b){if(!a||!b||a.w!==b.w||a.h!==b.h)return 0;let diff=0;for(let i=0;i<a.data.length;i++)diff+=Math.abs(a.data[i]-b.data[i]);return clamp(1-(diff/(a.data.length*255)),0,1);}
function tickLabelCamera(now=performance.now()){
  const st=labelCameraGuideState;
  if(st?.previewPanorama&&now-st.lastPreviewAt>=280){
    st.lastPreviewAt=now;const motion=advanceLabelCameraPreviewFromLive();
    if(motion){
      const score=motion.score,enoughNew=st.previewAdvance>=Math.max(16,motion.frameWidth*.28);
      if(score>st.peakScore){st.peakScore=score;st.peakNewRatio=motion.newRatio;st.scoreDropFrames=0;}
      else if(st.peakScore>=.62&&score<st.peakScore-.025)st.scoreDropFrames++;
      else if(score>=st.peakScore-.012)st.scoreDropFrames=0;
      const localPeak=enoughNew&&st.peakScore>=.64&&st.scoreDropFrames>=1;
      const strongNow=enoughNew&&score>=.78;
      if(st.auto&&(localPeak||strongNow)&&now-st.lastCaptureAt>1700&&!labelCameraWorking){
        captureLabelCamera(true);st.peakScore=0;st.previousScore=0;st.scoreDropFrames=0;st.peakNewRatio=0;
      }
      st.previousScore=score;updateLabelCameraUi();
    }
  }
  labelCameraRaf=requestAnimationFrame(tickLabelCamera);
}
function resetLabelCameraGuide(){ labelCameraGuideState=defaultLabelCameraGuideState(); syncLabelCameraMirror(); updateLabelCameraUi(); drawLabelCameraOverlay(); }
function labelCameraEventPos(ev){
  const canvas=resizeLabelCameraOverlay();if(!canvas)return null;const r=canvas.getBoundingClientRect();
  return {x:(ev.clientX-r.left)*(canvas.width/r.width),y:(ev.clientY-r.top)*(canvas.height/r.height)};
}
function labelCameraNearestRef(x,y){const s=labelCameraGuideState,canvas=resizeLabelCameraOverlay();if(!s||!canvas)return null;const rect=getLabelCameraGuideRect(canvas);let best=null,bd=Infinity;for(const ref of getLabelCameraEditableRefs()){const p=labelCameraPointToPixel(ref,rect),d=Math.hypot(p.x-x,p.y-y);if(d<bd){bd=d;best=ref;}}return bd<=30*(window.devicePixelRatio||1)?{...best,distance:bd}:null;}
function labelCameraPointerDown(ev){
  const s=labelCameraGuideState,canvas=$('labelCameraOverlay'),pos=labelCameraEventPos(ev);if(!s||!canvas||!pos)return;
  if(s.guideLocked)return;
  try{canvas.setPointerCapture(ev.pointerId);}catch{}
  const scaleHandle=labelCameraNearestScaleHandle(pos.x,pos.y);
  if(scaleHandle){s.dragging={pointerId:ev.pointerId,type:'scale',edge:scaleHandle.edge};ev.preventDefault();}
}
function labelCameraPointerMove(ev){
  const s=labelCameraGuideState,canvas=resizeLabelCameraOverlay(),pos=labelCameraEventPos(ev);if(!s||!canvas||!pos||!s.dragging||s.dragging.pointerId!==ev.pointerId)return;
  const rect=getLabelCameraGuideRect(canvas),nx=clamp((pos.x-rect.x)/rect.w,0,1),ny=clamp((pos.y-rect.y)/rect.h,0,1);
  if(s.dragging.type==='scale')scaleLabelCameraGuide(s.dragging.edge,(s.dragging.edge==='left'||s.dragging.edge==='right')?nx:ny);
  else setLabelCameraPoint(s.dragging.ref,nx,ny);
  drawLabelCameraOverlay();ev.preventDefault();
}
function labelCameraPointerEnd(ev){const s=labelCameraGuideState,canvas=$('labelCameraOverlay');if(!s||!canvas)return;if(s.dragging?.pointerId===ev.pointerId)s.dragging=null;try{canvas.releasePointerCapture(ev.pointerId);}catch{}}
async function prepareLabelCameraPhotoSettings(){
  labelCameraPhotoSettings=null;if(!labelCameraImageCapture)return;
  try{
    const caps=await labelCameraImageCapture.getPhotoCapabilities?.();if(!caps)return;
    const wr=caps.imageWidth||{},hr=caps.imageHeight||{},targetW=Math.min(Number(wr.max)||1600,1600),ratio=16/9;
    const targetH=Math.round(targetW/ratio),w=Math.max(Number(wr.min)||1,targetW),h=Math.max(Number(hr.min)||1,Math.min(Number(hr.max)||targetH,targetH));
    labelCameraPhotoSettings={imageWidth:Math.round(w),imageHeight:Math.round(h)};
  }catch(err){console.warn('Photo capability check unavailable',err);}
}
async function captureLabelCameraHighResRecord(video,geometry){
  const core=geometry?.core,assist=geometry?.assist;if(!core||!assist)return null;
  const coreNorm=labelCameraRectNorm(core,video),assistNorm=labelCameraRectNorm(assist,video);
  if(labelCameraImageCapture){
    try{const blob=await labelCameraImageCapture.takePhoto(labelCameraPhotoSettings||{});if(blob)return {blob,coreNorm,assistNorm,highRes:true};}catch(err){console.warn('Medium-resolution still capture unavailable',err);}
    try{
      const bitmap=await labelCameraImageCapture.grabFrame();if(bitmap){const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);bitmap.close?.();const blob=await canvasBlob(c,'image/jpeg',.95);if(blob)return {blob,coreNorm,assistNorm,highRes:false};}
    }catch(err){console.warn('Frame capture fallback unavailable',err);}
  }
  const c=document.createElement('canvas'),maxEdge=1800,scale=Math.min(1,maxEdge/Math.max(assist.sw,assist.sh));c.width=Math.max(1,Math.round(assist.sw*scale));c.height=Math.max(1,Math.round(assist.sh*scale));c.getContext('2d').drawImage(video,assist.sx,assist.sy,assist.sw,assist.sh,0,0,c.width,c.height);
  const blob=await canvasBlob(c,'image/jpeg',.96);
  const coreWithinAssist={x:clamp((core.sx-assist.sx)/assist.sw,0,1),y:clamp((core.sy-assist.sy)/assist.sh,0,1),w:clamp(core.sw/assist.sw,.001,1),h:clamp(core.sh/assist.sh,.001,1)};
  return blob?{blob,coreWithinAssist,highRes:false}:null;
}
async function startLabelCamera(){
  closeLabelAddDialog(); stopHomeCameraBg();
  if(!navigator.mediaDevices?.getUserMedia){ const input=document.createElement('input'); input.type='file'; input.accept='image/*'; input.capture='environment'; input.onchange=()=>addLabelFiles(input.files||[]); input.click(); return; }
  try{
    labelCameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:480},height:{ideal:270},aspectRatio:{ideal:16/9},frameRate:{ideal:12,max:15}},audio:false});
    const track=labelCameraStream.getVideoTracks?.()[0]||null;
    labelCameraImageCapture=null;
    if(track&&window.ImageCapture){
      try{ labelCameraImageCapture=new ImageCapture(track);prepareLabelCameraPhotoSettings(); }catch(err){ console.warn('ImageCapture unavailable',err); }
    }
    const video=$('labelCameraVideo'); video.srcObject=labelCameraStream; await video.play().catch(()=>{}); labelCameraSessionCount=0; labelCameraCaptures=[]; $('labelCameraCount').textContent='0'; $('labelCameraMirrorToggle').checked=true; $('labelCameraMirrorToggle').disabled=true; $('labelCameraAutoToggle').checked=true; resetLabelCameraGuide(); clearLabelCameraPreviewUi(); $('labelCameraDialog').showModal(); stopLabelCameraLoop(); labelCameraRaf=requestAnimationFrame(tickLabelCamera);
  }catch(err){ console.warn(err); toast('Camera could not open. Choose Photos instead.'); startHomeCameraBg(); }
}
function stopLabelCamera(resumeAmbient=true){ stopLabelCameraLoop(); labelCameraGuideState=null; labelCameraImageCapture=null; labelCameraPhotoSettings=null; if(labelCameraStream){labelCameraStream.getTracks().forEach(t=>t.stop()); labelCameraStream=null;} const video=$('labelCameraVideo'); if(video)video.srcObject=null; const mirrorToggle=$('labelCameraMirrorToggle'); if(mirrorToggle) mirrorToggle.disabled=false; if($('labelCameraDialog')?.open)$('labelCameraDialog').close(); clearLabelCameraPreviewUi(); if(resumeAmbient&&views.label.classList.contains('active'))startHomeCameraBg(); }
async function captureLabelCamera(fromAuto=false){
  if(labelCameraWorking)return;const video=$('labelCameraVideo');if(!video?.videoWidth)return;
  const st=labelCameraGuideState;if(st&&!st.previewPanorama)seedLabelCameraPreviewFromLive();
  const geometry=labelCameraCaptureGeometry();if(!geometry)return;
  labelCameraWorking=true;if(st){st.lastCaptureAt=performance.now();st.guideLocked=true;}
  const direction=st?.previewDirection||'right';
  if(st){st.ghostPreview=labelCameraLiveGhostPreview(direction==='left'?'left':'right')||st.ghostPreview;}
  updateLabelCameraUi();drawLabelCameraOverlay();
  try{
    const record=await captureLabelCameraHighResRecord(video,geometry);if(!record)return;
    record.direction=direction;record.order=labelCameraSessionCount;
    labelCameraCaptures.push(record);labelCameraSessionCount++;$('labelCameraCount').textContent=String(labelCameraSessionCount);
    if(labelCameraGuideState){
      labelCameraGuideState.previewAdvance=0;labelCameraGuideState.lastCaptureAt=performance.now();labelCameraGuideState.peakScore=0;labelCameraGuideState.scoreDropFrames=0;
      const strip=sampleLabelCameraStrip(direction==='left'?'left':'right');if(strip)labelCameraGuideState.prevStrip=strip;
      const ghostVersion=++labelCameraGuideState.ghostVersion;
      setTimeout(()=>labelCameraGhostFromCapture(record,direction==='left'?'left':'right').then(ghost=>{
        const current=labelCameraGuideState;if(current&&ghost&&current.ghostVersion===ghostVersion){current.ghostPreview=ghost;drawLabelCameraOverlay();}
      }).catch(err=>console.warn('Could not build HQ ghost reference',err)),180);
      updateLabelCameraUi();drawLabelCameraOverlay();
    }
    toast(fromAuto?`HQ keyframe ${labelCameraSessionCount} saved while tracking.`:`First HQ section captured. Rotate slowly and follow the ghosted edge.`);
  }finally{labelCameraWorking=false;updateLabelCameraUi();}
}
function defaultLabelMesh(){
  const L=.14,R=.86,T=.16,B=.84;
  return [
    {x:L,y:T,corner:0},
    {x:R,y:T,corner:1},
    {x:R,y:B,corner:2},
    {x:L,y:B,corner:3}
  ];
}
function cloneLabelMesh(q){return (q||[]).map(p=>({...p}));}
function cloneQuad(q){return cloneLabelMesh(q);}

function labelAreaPushHistory(){
  const item=labelItems[labelAreaIndex];
  if(!item?.quad)return;
  labelAreaHistory.push({quad:cloneLabelMesh(item.quad),rotation:Number(item.rotation)||0});
  if(labelAreaHistory.length>48)labelAreaHistory.shift();
}
function labelAreaUndo(){
  const item=labelItems[labelAreaIndex],prev=labelAreaHistory.pop();
  if(!item||!prev){toast('Nothing to undo.');return;}
  item.quad=cloneLabelMesh(prev.quad); item.rotation=Number(prev.rotation)||0; labelAreaSelectedIndex=-1;
  const slider=$('labelAreaRotationSlider'),out=$('labelAreaRotationValue');
  if(slider)slider.value=String(item.rotation||0); if(out)out.textContent=`${(item.rotation||0).toFixed(1)}°`;
  drawLabelArea();
}
function labelAreaNearestPoint(pos,q,radiusCss=48){
  let best=-1,bd=Infinity;
  q.forEach((pt,i)=>{const d=Math.hypot((pt.x-pos.x)*pos.cssW,(pt.y-pos.y)*pos.cssH); if(d<bd){bd=d; best=i;}});
  return bd<=radiusCss?best:-1;
}
function labelAreaNearestEdge(pos,q){
  let best={d:Infinity,i:-1,x:pos.x,y:pos.y};
  const px={x:pos.x,y:pos.y};
  for(let i=0;i<q.length;i++){
    const a=q[i],b=q[(i+1)%q.length];
    const r=pointSegDistance(px,a,b),dx=(r.x-pos.x)*pos.cssW,dy=(r.y-pos.y)*pos.cssH,d=Math.hypot(dx,dy);
    if(d<best.d)best={d,i,x:r.x,y:r.y};
  }
  return best;
}
function addLabelAreaPointAt(pos){
  const item=labelItems[labelAreaIndex]; if(!item)return false;
  const q=item.quad||defaultLabelMesh();
  const existing=labelAreaNearestPoint(pos,q,54);
  if(existing>=0){labelAreaSelectedIndex=existing; drawLabelArea(); return true;}
  const best=labelAreaNearestEdge(pos,q), threshold=Math.max(34,Math.min(pos.cssW,pos.cssH)*.08);
  if(best.i<0||best.d>threshold){labelAreaSelectedIndex=-1; drawLabelArea(); toast('Tap the blue perimeter to add a point.'); return false;}
  labelAreaPushHistory();
  const np={x:clamp(best.x,0,1),y:clamp(best.y,0,1)};
  item.quad=[...q.slice(0,best.i+1),np,...q.slice(best.i+1)];
  labelAreaSelectedIndex=best.i+1; drawLabelArea(); return true;
}
function removeSelectedLabelAreaPoint(){
  const item=labelItems[labelAreaIndex]; if(!item?.quad||labelAreaSelectedIndex<0||!item.quad[labelAreaSelectedIndex]){toast('Select a blue point first.');return;}
  if(item.quad[labelAreaSelectedIndex].corner!==undefined){toast('The four corner points stay fixed.');return;}
  labelAreaPushHistory(); item.quad.splice(labelAreaSelectedIndex,1); labelAreaSelectedIndex=-1; drawLabelArea();
}
function labelAreaCenter(q){return{x:q.reduce((s,p)=>s+p.x,0)/q.length,y:q.reduce((s,p)=>s+p.y,0)/q.length};}
function labelAreaDrawSource(ctx,canvas,bmp,rotation=0){
  ctx.save();ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate((Number(rotation)||0)*Math.PI/180);ctx.drawImage(bmp,-canvas.width/2,-canvas.height/2,canvas.width,canvas.height);ctx.restore();
}
function saveCurrentLabelMapView(){
  const item=labelItems[labelAreaIndex];if(!item)return;item.mapView={zoom:labelAreaZoom,panX:labelAreaPanX,panY:labelAreaPanY};
}
function resetLabelAreaGesture(){labelAreaDragIndex=-1;labelAreaDragStart=null;labelAreaGesture=null;labelAreaPinch=null;labelAreaPinched=false;labelAreaPointers.clear();}
function applyLabelAreaViewport(showChip=false){
  const canvas=$('labelAreaCanvas'),stage=$('labelAreaStage');if(!canvas||!stage)return;
  canvas.style.transform=`translate3d(${labelAreaPanX}px,${labelAreaPanY}px,0) scale(${labelAreaZoom})`;
  const chip=$('labelAreaZoomChip');
  if(chip&&(showChip||labelAreaZoom>1.02)){chip.textContent=`${labelAreaZoom.toFixed(1)}×`;chip.classList.remove('hidden');clearTimeout(applyLabelAreaViewport._t);applyLabelAreaViewport._t=setTimeout(()=>chip.classList.add('hidden'),900);}else chip?.classList.add('hidden');
}
function clampLabelAreaPan(){
  const stage=$('labelAreaStage')?.getBoundingClientRect();if(!stage)return;const extra=.16+Math.max(0,labelAreaZoom-1)*.62;labelAreaPanX=clamp(labelAreaPanX,-stage.width*extra,stage.width*extra);labelAreaPanY=clamp(labelAreaPanY,-stage.height*extra,stage.height*extra);
}
async function renderLabelArea(){
  if(!labelItems.length){showView('label');return;}
  labelAreaIndex=clamp(labelAreaIndex,0,labelItems.length-1);const item=labelItems[labelAreaIndex];if(!item.quad)item.quad=defaultLabelMesh();if(!Number.isFinite(item.rotation))item.rotation=0;if(!item.mapView)item.mapView={zoom:1,panX:0,panY:0};
  labelAreaSelectedIndex=-1; labelAreaHistory=[]; resetLabelAreaGesture();
  try{labelAreaBitmap?.close?.();}catch{}
  labelAreaBitmap=await createImageBitmap(item.blob);const maxEdge=1500,scale=Math.min(1,maxEdge/Math.max(labelAreaBitmap.width,labelAreaBitmap.height));const canvas=$('labelAreaCanvas');canvas.width=Math.max(1,Math.round(labelAreaBitmap.width*scale));canvas.height=Math.max(1,Math.round(labelAreaBitmap.height*scale));
  labelAreaZoom=clamp(Number(item.mapView.zoom)||1,1,LABEL_AREA_MAX_ZOOM);labelAreaPanX=Number(item.mapView.panX)||0;labelAreaPanY=Number(item.mapView.panY)||0;
  const slider=$('labelAreaRotationSlider'),out=$('labelAreaRotationValue');if(slider)slider.value=String(item.rotation||0);if(out)out.textContent=`${(item.rotation||0).toFixed(1)}°`;
  drawLabelArea();applyLabelAreaViewport(false);$('labelAreaCounter').textContent=`Image ${labelAreaIndex+1} of ${labelItems.length}`;$('labelPrevBtn').disabled=labelAreaIndex===0;$('labelNextBtn').textContent=labelAreaIndex===labelItems.length-1?'Stitch Label':'Next →';
}
function drawLabelArea(){
  const canvas=$('labelAreaCanvas');if(!canvas||!labelAreaBitmap||!labelItems[labelAreaIndex])return;
  const item=labelItems[labelAreaIndex],ctx=canvas.getContext('2d'),q=item.quad||defaultLabelMesh();
  ctx.clearRect(0,0,canvas.width,canvas.height);labelAreaDrawSource(ctx,canvas,labelAreaBitmap,item.rotation||0);
  ctx.fillStyle='rgba(0,0,0,.30)';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.save();ctx.beginPath();q.forEach((p,i)=>{const x=p.x*canvas.width,y=p.y*canvas.height;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.clip();labelAreaDrawSource(ctx,canvas,labelAreaBitmap,item.rotation||0);ctx.restore();
  const grad=ctx.createLinearGradient(0,0,canvas.width,canvas.height);grad.addColorStop(0,'#35cfff');grad.addColorStop(.5,'#697dff');grad.addColorStop(1,'#ff4fe3');
  ctx.strokeStyle=grad;ctx.lineWidth=Math.max(2,canvas.width/420);ctx.shadowBlur=12;ctx.shadowColor='#35cfff';ctx.beginPath();q.forEach((p,i)=>{const x=p.x*canvas.width,y=p.y*canvas.height;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.stroke();ctx.shadowBlur=0;
  const r=Math.max(7,canvas.width/105);
  q.forEach((p,i)=>{const x=p.x*canvas.width,y=p.y*canvas.height,isSel=i===labelAreaSelectedIndex,base=p.corner!==undefined?r*1.08:r;
    if(isSel){ctx.beginPath();ctx.arc(x,y,base+r*.62,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.14)';ctx.fill();ctx.lineWidth=Math.max(2,canvas.width/800);ctx.strokeStyle='rgba(255,255,255,.9)';ctx.stroke();}
    ctx.beginPath();ctx.arc(x,y,base,0,Math.PI*2);ctx.fillStyle=p.corner!==undefined?'#ff4fe3':'#6987ff';ctx.fill();ctx.lineWidth=Math.max(2,canvas.width/650);ctx.strokeStyle='#fff';ctx.stroke();
  });
  const center=labelAreaCenter(q),cx=center.x*canvas.width,cy=center.y*canvas.height,rr=Math.max(23,canvas.width/35);
  ctx.save();ctx.shadowBlur=18;ctx.shadowColor='rgba(53,207,255,.34)';ctx.fillStyle='rgba(8,22,34,.92)';ctx.strokeStyle='rgba(87,217,255,.88)';ctx.lineWidth=Math.max(2,canvas.width/600);ctx.beginPath();ctx.arc(cx,cy,rr,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
  ctx.strokeStyle='#bff4ff';ctx.lineWidth=Math.max(2.2,canvas.width/520);ctx.lineCap='round';ctx.lineJoin='round';const arm=rr*.52,tip=rr*.22;
  ctx.beginPath();ctx.moveTo(cx-arm,cy);ctx.lineTo(cx+arm,cy);ctx.moveTo(cx,cy-arm);ctx.lineTo(cx,cy+arm);ctx.moveTo(cx-arm,cy);ctx.lineTo(cx-arm+tip,cy-tip);ctx.moveTo(cx-arm,cy);ctx.lineTo(cx-arm+tip,cy+tip);ctx.moveTo(cx+arm,cy);ctx.lineTo(cx+arm-tip,cy-tip);ctx.moveTo(cx+arm,cy);ctx.lineTo(cx+arm-tip,cy+tip);ctx.moveTo(cx,cy-arm);ctx.lineTo(cx-tip,cy-arm+tip);ctx.moveTo(cx,cy-arm);ctx.lineTo(cx+tip,cy-arm+tip);ctx.moveTo(cx,cy+arm);ctx.lineTo(cx-tip,cy+arm-tip);ctx.moveTo(cx,cy+arm);ctx.lineTo(cx+tip,cy+arm-tip);ctx.stroke();ctx.restore();
}
function labelAreaPointerPos(ev){const c=$('labelAreaCanvas'),r=c.getBoundingClientRect();return{x:clamp((ev.clientX-r.left)/Math.max(1,r.width),0,1),y:clamp((ev.clientY-r.top)/Math.max(1,r.height),0,1),cssW:r.width,cssH:r.height};}
function startLabelAreaPinch(){const ps=[...labelAreaPointers.values()];if(ps.length<2)return;const a=ps[0],b=ps[1],mid=midpoint(a,b);labelAreaPinch={distance:Math.max(1,screenDistance(a,b)),zoom:labelAreaZoom,panX:labelAreaPanX,panY:labelAreaPanY,mid};labelAreaPinched=true;labelAreaGesture=null;labelAreaDragIndex=-1;labelAreaDragStart=null;}
function handleLabelAreaPinch(){if(!labelAreaPinch||labelAreaPointers.size<2)return;const ps=[...labelAreaPointers.values()],a=ps[0],b=ps[1],dist=Math.max(1,screenDistance(a,b)),mid=midpoint(a,b),newZoom=clamp(labelAreaPinch.zoom*(dist/labelAreaPinch.distance),1,LABEL_AREA_MAX_ZOOM),factor=newZoom/labelAreaPinch.zoom,stage=$('labelAreaStage').getBoundingClientRect(),cx=stage.left+stage.width/2,cy=stage.top+stage.height/2;labelAreaPanX=(mid.x-cx)-factor*(labelAreaPinch.mid.x-cx-labelAreaPinch.panX);labelAreaPanY=(mid.y-cy)-factor*(labelAreaPinch.mid.y-cy-labelAreaPinch.panY);labelAreaZoom=newZoom;clampLabelAreaPan();applyLabelAreaViewport(true);}
function labelAreaPointerDown(ev){
  const item=labelItems[labelAreaIndex];if(!item)return;ev.preventDefault();try{$('labelAreaCanvas').setPointerCapture(ev.pointerId);}catch{}
  labelAreaPointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});if(labelAreaPointers.size>=2){startLabelAreaPinch();return;}
  const p=labelAreaPointerPos(ev),q=item.quad||defaultLabelMesh(),center=labelAreaCenter(q),centerDist=Math.hypot((center.x-p.x)*p.cssW,(center.y-p.y)*p.cssH);
  if(centerDist<=44){labelAreaSelectedIndex=-1;labelAreaDragIndex=-2;labelAreaDragStart={pointerId:ev.pointerId,start:{x:p.x,y:p.y},quad:cloneQuad(q)};drawLabelArea();return;}
  const idx=labelAreaNearestPoint(p,q,52);
  if(idx>=0){labelAreaSelectedIndex=idx;labelAreaDragIndex=idx;labelAreaDragStart={pointerId:ev.pointerId,start:{x:p.x,y:p.y},quad:cloneQuad(q),historySaved:false,moved:false};drawLabelArea();return;}
  const edge=labelAreaNearestEdge(p,q),threshold=Math.max(34,Math.min(p.cssW,p.cssH)*.08);
  labelAreaSelectedIndex=-1;drawLabelArea();
  labelAreaGesture={type:'blank',pointerId:ev.pointerId,startX:ev.clientX,startY:ev.clientY,panX:labelAreaPanX,panY:labelAreaPanY,downPos:p,moved:false,edgeOkay:edge.i>=0&&edge.d<=threshold};
}
function labelAreaPointerMove(ev){
  if(labelAreaPointers.has(ev.pointerId))labelAreaPointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});if(labelAreaPinched&&labelAreaPointers.size>=2){ev.preventDefault();handleLabelAreaPinch();return;}
  const item=labelItems[labelAreaIndex];if(!item)return;
  if(labelAreaDragIndex!==-1){const p=labelAreaPointerPos(ev);
    if(labelAreaDragIndex===-2&&labelAreaDragStart?.quad){
      if(!labelAreaDragStart.historySaved){labelAreaPushHistory();labelAreaDragStart.historySaved=true;}
      const origin=labelAreaDragStart.quad,dx0=p.x-labelAreaDragStart.start.x,dy0=p.y-labelAreaDragStart.start.y,minX=Math.min(...origin.map(q=>q.x)),maxX=Math.max(...origin.map(q=>q.x)),minY=Math.min(...origin.map(q=>q.y)),maxY=Math.max(...origin.map(q=>q.y)),dx=clamp(dx0,-minX,1-maxX),dy=clamp(dy0,-minY,1-maxY);item.quad=origin.map(q=>({...q,x:q.x+dx,y:q.y+dy}));
    }else if(labelAreaDragIndex>=0){
      const moved=Math.hypot((p.x-labelAreaDragStart.start.x)*p.cssW,(p.y-labelAreaDragStart.start.y)*p.cssH);
      if(moved>3&&!labelAreaDragStart.historySaved){labelAreaPushHistory();labelAreaDragStart.historySaved=true;}
      item.quad[labelAreaDragIndex]={...item.quad[labelAreaDragIndex],x:clamp(p.x,0,1),y:clamp(p.y,0,1)};
    }
    drawLabelArea();ev.preventDefault();return;
  }
  if(labelAreaGesture?.pointerId===ev.pointerId){const dist=Math.hypot(ev.clientX-labelAreaGesture.startX,ev.clientY-labelAreaGesture.startY);if(dist>7)labelAreaGesture.moved=true;if(labelAreaGesture.moved){labelAreaPanX=labelAreaGesture.panX+(ev.clientX-labelAreaGesture.startX);labelAreaPanY=labelAreaGesture.panY+(ev.clientY-labelAreaGesture.startY);clampLabelAreaPan();applyLabelAreaViewport(false);}ev.preventDefault();}
}
function labelAreaPointerEnd(ev){
  labelAreaPointers.delete(ev.pointerId);
  if(labelAreaPinched){if(labelAreaPointers.size===0){labelAreaPinched=false;labelAreaPinch=null;saveCurrentLabelMapView();applyLabelAreaViewport(true);}return;}
  if(labelAreaDragIndex!==-1){labelAreaDragIndex=-1;labelAreaDragStart=null;saveCurrentLabelMapView();try{$('labelAreaCanvas').releasePointerCapture(ev.pointerId);}catch{}ev.preventDefault();return;}
  if(labelAreaGesture?.pointerId===ev.pointerId){
    const g=labelAreaGesture;labelAreaGesture=null;
    if(!g.moved&&g.edgeOkay){addLabelAreaPointAt(g.downPos);} else saveCurrentLabelMapView();
    try{$('labelAreaCanvas').releasePointerCapture(ev.pointerId);}catch{}ev.preventDefault();return;
  }
  labelAreaDragStart=null; saveCurrentLabelMapView(); try{$('labelAreaCanvas').releasePointerCapture(ev.pointerId);}catch{} ev.preventDefault();
}
async function startLabelAreaFlow(){if(!labelItems.length){toast('Add label images first.');return;}await buildLabelResult();}
async function labelAreaNext(){saveCurrentLabelMapView();if(labelAreaIndex<labelItems.length-1){labelAreaIndex++;await renderLabelArea();}else await buildLabelResult();}
async function labelAreaPrevious(){saveCurrentLabelMapView();if(labelAreaIndex>0){labelAreaIndex--;await renderLabelArea();}}
function applyLabelAreaRemaining(){const item=labelItems[labelAreaIndex];if(!item)return;for(let i=labelAreaIndex+1;i<labelItems.length;i++){labelItems[i].quad=cloneQuad(item.quad||defaultLabelMesh());labelItems[i].rotation=item.rotation||0;}toast('Mesh and straightening copied to remaining images.');}
function sampleChain(points,t){
  if(points.length===1)return points[0];const x=clamp(t,0,1)*(points.length-1),i=Math.min(points.length-2,Math.floor(x)),f=x-i,a=points[i],b=points[i+1];return{x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f};
}
function coonsPoint(mesh,u,v){
  // Mesh order: TL, top..., TR, right-mid, BR, bottom... reversed, BL, left-mid.
  const top=[mesh[0],mesh[1],mesh[2],mesh[3],mesh[4]],right=[mesh[4],mesh[5],mesh[6]],bottom=[mesh[10],mesh[9],mesh[8],mesh[7],mesh[6]],left=[mesh[0],mesh[11],mesh[10]];
  const T=sampleChain(top,u),B=sampleChain(bottom,u),L=sampleChain(left,v),R=sampleChain(right,v),tl=mesh[0],tr=mesh[4],br=mesh[6],bl=mesh[10];
  const bil={x:(1-u)*(1-v)*tl.x+u*(1-v)*tr.x+u*v*br.x+(1-u)*v*bl.x,y:(1-u)*(1-v)*tl.y+u*(1-v)*tr.y+u*v*br.y+(1-u)*v*bl.y};
  return{x:(1-v)*T.x+v*B.x+(1-u)*L.x+u*R.x-bil.x,y:(1-v)*T.y+v*B.y+(1-u)*L.y+u*R.y-bil.y};
}
async function warpLabelItem(item,targetH=900){
  const bmp=await createImageBitmap(item.blob);
  try{
    const src=document.createElement('canvas'),s=src.getContext('2d',{willReadFrequently:true}),sw=bmp.width,sh=bmp.height;
    src.width=sw; src.height=sh; labelAreaDrawSource(s,src,bmp,item.rotation||0);
    const q=(item.quad||defaultLabelMesh()).map(p=>({x:p.x*sw,y:p.y*sh,corner:p.corner}));
    const top=getEdgePointsFromMesh(q,0,1), right=getEdgePointsFromMesh(q,1,2), bottom=getEdgePointsFromMesh(q,2,3), left=getEdgePointsFromMesh(q,3,0);
    if([top,right,bottom,left].some(e=>e.length<2)) throw new Error('Invalid label mesh');
    const rawW=Math.max(32,(polyLength(top)+polyLength(bottom))/2), rawH=Math.max(32,(polyLength(left)+polyLength(right))/2);
    let H=Math.max(280,Math.round(targetH)), W=Math.max(160,Math.round(H*(rawW/rawH)));
    const maxW=2400; if(W>maxW){const fit=maxW/W; W=Math.round(W*fit); H=Math.max(180,Math.round(H*fit));}
    const out=document.createElement('canvas'); out.width=W; out.height=H; const o=out.getContext('2d',{willReadFrequently:true});
    const img=s.getImageData(0,0,sw,sh),sd=img.data,im=o.createImageData(W,H),od=im.data;
    const topX=new Float32Array(W),topY=new Float32Array(W),botX=new Float32Array(W),botY=new Float32Array(W);
    const leftX=new Float32Array(H),leftY=new Float32Array(H),rightX=new Float32Array(H),rightY=new Float32Array(H);
    for(let x=0;x<W;x++){const u=x/Math.max(1,W-1),a=samplePolylineNormalized(top,u),b=samplePolylineNormalized(bottom,1-u);topX[x]=a.x;topY[x]=a.y;botX[x]=b.x;botY[x]=b.y;}
    for(let y=0;y<H;y++){const v=y/Math.max(1,H-1),l=samplePolylineNormalized(left,1-v),r=samplePolylineNormalized(right,v);leftX[y]=l.x;leftY[y]=l.y;rightX[y]=r.x;rightY[y]=r.y;}
    const TL=q.find(p=>p.corner===0),TR=q.find(p=>p.corner===1),BR=q.find(p=>p.corner===2),BL=q.find(p=>p.corner===3);
    let oi=0;
    for(let y=0;y<H;y++){
      const v=y/Math.max(1,H-1),lvx=leftX[y],lvy=leftY[y],rvx=rightX[y],rvy=rightY[y];
      for(let x=0;x<W;x++){
        const u=x/Math.max(1,W-1);
        const bilx=(1-u)*(1-v)*TL.x+u*(1-v)*TR.x+(1-u)*v*BL.x+u*v*BR.x;
        const bily=(1-u)*(1-v)*TL.y+u*(1-v)*TR.y+(1-u)*v*BL.y+u*v*BR.y;
        let sx=(1-v)*topX[x]+v*botX[x]+(1-u)*lvx+u*rvx-bilx;
        let sy=(1-v)*topY[x]+v*botY[x]+(1-u)*lvy+u*rvy-bily;
        sx=clamp(sx,0,sw-1.001); sy=clamp(sy,0,sh-1.001);
        const x0=sx|0,y0=sy|0,x1=Math.min(x0+1,sw-1),y1=Math.min(y0+1,sh-1),fx=sx-x0,fy=sy-y0;
        const i00=(y0*sw+x0)*4,i10=(y0*sw+x1)*4,i01=(y1*sw+x0)*4,i11=(y1*sw+x1)*4;
        for(let c=0;c<3;c++){const a=sd[i00+c]*(1-fx)+sd[i10+c]*fx,b=sd[i01+c]*(1-fx)+sd[i11+c]*fx;od[oi+c]=a*(1-fy)+b*fy;} od[oi+3]=255; oi+=4;
      }
    }
    o.putImageData(im,0,0); return out;
  } finally { bmp.close?.(); }
}
function getEdgePointsFromMesh(mesh,cornerA,cornerB){
  const ia=mesh.findIndex(p=>p.corner===cornerA), ib=mesh.findIndex(p=>p.corner===cornerB); if(ia<0||ib<0)return [];
  const out=[]; let i=ia; while(true){out.push(mesh[i]); if(i===ib)break; i=(i+1)%mesh.length; if(out.length>mesh.length+1)break;} return out;
}
function samplePolylineNormalized(ps,t){
  if(ps.length===1)return ps[0]; const lens=[]; let total=0;
  for(let i=1;i<ps.length;i++){const l=Math.hypot(ps[i].x-ps[i-1].x,ps[i].y-ps[i-1].y); lens.push(l); total+=l;}
  if(total<1)return ps[0]; let target=t*total,acc=0;
  for(let i=0;i<lens.length;i++){ if(target<=acc+lens[i]||i===lens.length-1){ const f=lens[i]?((target-acc)/lens[i]):0; return {x:ps[i].x+(ps[i+1].x-ps[i].x)*f,y:ps[i].y+(ps[i+1].y-ps[i].y)*f}; } acc+=lens[i]; }
  return ps[ps.length-1];
}
function canvasToGraySample(canvas,maxW=240,maxH=180){
  const scale=Math.min(1,maxW/canvas.width,maxH/canvas.height);
  const w=Math.max(40,Math.round(canvas.width*scale)),h=Math.max(80,Math.round(canvas.height*scale));
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(canvas,0,0,w,h);
  const data=x.getImageData(0,0,w,h).data,gray=new Uint8Array(w*h);
  for(let i=0,j=0;i<data.length;i+=4,j++)gray[j]=Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2]);
  return {w,h,data:gray};
}
function scoreGrayOverlapBand(a,b,ow,dy=0,y0=0,y1=null){
  const top=Math.max(1,Math.round(y0)),bottom=Math.min(a.h,b.h,Math.round(y1??Math.min(a.h,b.h)-1));let diff=0,count=0;
  for(let y=top;y<bottom;y+=2){const by=y+dy;if(by<0||by>=b.h)continue;const aRow=y*a.w+(a.w-ow),bRow=by*b.w;for(let x=0;x<ow;x+=2){diff+=Math.abs(a.data[aRow+x]-b.data[bRow+x]);count++;}}
  return count?1-diff/(count*255):0;
}
function scoreGrayOverlap(a,b,ow,dy=0){return scoreGrayOverlapBand(a,b,ow,dy,Math.max(0,a.h*.05),Math.min(a.h,b.h)*.95);}
function bestLabelBandShift(a,b,ow,y0,y1){let best={score:-1,dy:0};for(let dy=-12;dy<=12;dy++){const score=scoreGrayOverlapBand(a,b,ow,dy,y0,y1);if(score>best.score)best={score,dy};}return best;}
function estimateLabelOverlap(prevCanvas,nextCanvas){
  const a=canvasToGraySample(prevCanvas),b=canvasToGraySample(nextCanvas),minW=Math.min(a.w,b.w);const step=Math.max(2,Math.round(minW/48)),minOw=Math.max(18,Math.round(minW*.12)),maxOw=Math.max(minOw+step,Math.round(minW*.78));let best={score:-1,ow:minOw,dy:0};
  for(let ow=minOw;ow<=maxOw;ow+=step){for(let dy=-10;dy<=10;dy+=2){const score=scoreGrayOverlap(a,b,ow,dy);if(score>best.score)best={score,ow,dy};}}
  const mid=Math.min(a.h,b.h)/2,topShift=bestLabelBandShift(a,b,best.ow,2,mid),bottomShift=bestLabelBandShift(a,b,best.ow,mid,Math.min(a.h,b.h)-2),xScale=Math.min(prevCanvas.width/a.w,nextCanvas.width/b.w),yScale=Math.min(prevCanvas.height/a.h,nextCanvas.height/b.h);
  return {overlap:Math.max(0,Math.round(best.ow*xScale)),score:best.score,dy:Math.round(best.dy*yScale),dyTop:Math.round(topShift.dy*yScale),dyBottom:Math.round(bottomShift.dy*yScale)};
}
function morphLabelPieceForSeam(piece,est){
  const top=Number(est?.dyTop)||Number(est?.dy)||0,bottom=Number(est?.dyBottom)||Number(est?.dy)||0,h=Math.max(1,piece.height),scaleY=clamp(1+(top-bottom)/h,.965,1.035),translate=-top;
  const out=document.createElement('canvas');out.width=piece.width;out.height=piece.height;const ctx=out.getContext('2d');ctx.setTransform(1,0,0,scaleY,0,translate);ctx.drawImage(piece,0,0);ctx.setTransform(1,0,0,1,0,0);return out;
}
async function stitchLabelPieces(pieces){
  if(!pieces?.length)throw new Error('No label pieces');if(pieces.length===1)return pieces[0];
  const working=[pieces[0]],links=[],positions=[{x:0,y:0}];let minY=0,maxY=pieces[0].height,totalW=pieces[0].width;
  for(let i=1;i<pieces.length;i++){
    const raw=pieces[i],est=estimateLabelOverlap(working[i-1],raw),piece=morphLabelPieceForSeam(raw,est);working.push(piece);
    const fallback=Math.round(Math.min(working[i-1].width,piece.width)*.18),overlap=clamp(est.score>.32?est.overlap:fallback,0,Math.min(working[i-1].width-4,piece.width-4));
    const prev=positions[i-1],x=prev.x+working[i-1].width-overlap,y=prev.y;positions.push({x,y});links.push({overlap,score:est.score});totalW=Math.max(totalW,x+piece.width);minY=Math.min(minY,y);maxY=Math.max(maxY,y+piece.height);
  }
  const out=document.createElement('canvas');out.width=Math.max(1,Math.ceil(totalW));out.height=Math.max(1,Math.ceil(maxY-minY));const ctx=out.getContext('2d');ctx.drawImage(working[0],positions[0].x,positions[0].y-minY);
  for(let i=1;i<working.length;i++){
    const piece=working[i],pos=positions[i],overlap=links[i-1].overlap,y=pos.y-minY;
    if(overlap>0){
      const blend=Math.min(overlap,Math.max(18,Math.round(overlap*.84))),tmp=document.createElement('canvas');tmp.width=blend;tmp.height=piece.height;const tx=tmp.getContext('2d');tx.drawImage(piece,Math.max(0,overlap-blend),0,blend,piece.height,0,0,blend,piece.height);tx.globalCompositeOperation='destination-in';const g=tx.createLinearGradient(0,0,blend,0);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.32,'rgba(0,0,0,.25)');g.addColorStop(.72,'rgba(0,0,0,.78)');g.addColorStop(1,'rgba(0,0,0,1)');tx.fillStyle=g;tx.fillRect(0,0,blend,piece.height);tx.globalCompositeOperation='source-over';ctx.drawImage(tmp,pos.x+overlap-blend,y);if(piece.width>overlap)ctx.drawImage(piece,overlap,0,piece.width-overlap,piece.height,pos.x+overlap,y,piece.width-overlap,piece.height);
    }else ctx.drawImage(piece,pos.x,y);
    await new Promise(r=>setTimeout(r,0));
  }
  return out;
}
async function labelCameraCaptureToCanvas(capture,options={}){
  const blob=capture?.blob||capture;if(!(blob instanceof Blob))throw new Error('Invalid panoramic capture');
  const bitmap=await createImageBitmap(blob);try{
    let ax=0,ay=0,aw=bitmap.width,ah=bitmap.height,coreRel={x:0,y:0,w:1,h:1};
    if(capture?.assistNorm){
      const n=capture.assistNorm;ax=clamp(Math.round(n.x*bitmap.width),0,bitmap.width-1);ay=clamp(Math.round(n.y*bitmap.height),0,bitmap.height-1);aw=clamp(Math.round(n.w*bitmap.width),1,bitmap.width-ax);ah=clamp(Math.round(n.h*bitmap.height),1,bitmap.height-ay);
      const cn=capture.coreNorm||n;coreRel={x:clamp((cn.x-n.x)/n.w,0,1),y:clamp((cn.y-n.y)/n.h,0,1),w:clamp(cn.w/n.w,.001,1),h:clamp(cn.h/n.h,.001,1)};
    }else if(capture?.coreWithinAssist){coreRel=capture.coreWithinAssist;}
    const maxEdge=options.maxEdge||3200,scale=Math.min(1,maxEdge/Math.max(aw,ah)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(aw*scale));c.height=Math.max(1,Math.round(ah*scale));c.getContext('2d').drawImage(bitmap,ax,ay,aw,ah,0,0,c.width,c.height);
    const coreRect={x:coreRel.x*c.width,y:coreRel.y*c.height,w:coreRel.w*c.width,h:coreRel.h*c.height};
    if(options.mode==='core'){
      const out=document.createElement('canvas');out.width=Math.max(1,Math.round(coreRect.w));out.height=Math.max(1,Math.round(coreRect.h));out.getContext('2d').drawImage(c,coreRect.x,coreRect.y,coreRect.w,coreRect.h,0,0,out.width,out.height);return options.withMeta?{canvas:out,coreRect:{x:0,y:0,w:out.width,h:out.height}}:out;
    }
    return options.withMeta?{canvas:c,coreRect}:c;
  }finally{bitmap.close?.();}
}
async function finalizeLabelCameraSession(){
  const count=labelCameraCaptures.length,direction=labelCameraGuideState?.previewDirection||'right';
  const captures=direction==='left'?[...labelCameraCaptures].reverse():[...labelCameraCaptures];
  stopLabelCamera(false);
  if(!count){
    labelCameraCaptures=[];
    if(views.label.classList.contains('active')) startHomeCameraBg();
    return;
  }
  busy(true,'Finishing panoramic label…');
  try{
    const pieces=[],metas=[];
    for(let i=0;i<captures.length;i++){
      $('busyText').textContent=`Preparing captured section · ${i+1}/${captures.length}`;
      const meta=await labelCameraCaptureToCanvas(captures[i],{withMeta:true,maxEdge:3200,mode:'assist'});metas.push(meta);pieces.push(meta.canvas);
      await new Promise(r=>setTimeout(r,0));
    }
    $('busyText').textContent='Morphing overlaps & blending seams…';
    const stitched=await stitchLabelPieces(pieces);
    const first=metas[0],last=metas[metas.length-1],trimLeft=Math.max(0,Math.round(first?.coreRect?.x||0)),trimRight=Math.max(0,Math.round((last?.canvas?.width||0)-((last?.coreRect?.x||0)+(last?.coreRect?.w||last?.canvas?.width||0))));
    const cropX=Math.min(trimLeft,Math.max(0,stitched.width-1)),cropW=Math.max(1,stitched.width-cropX-Math.min(trimRight,Math.max(0,stitched.width-cropX-1)));
    const out=document.createElement('canvas');out.width=cropW;out.height=stitched.height;out.getContext('2d').drawImage(stitched,cropX,0,cropW,stitched.height,0,0,cropW,stitched.height);
    const ctx=out.getContext('2d',{willReadFrequently:true});
    labelResultImage=ctx.getImageData(0,0,out.width,out.height);
    labelCameraCaptures=[];
    $('busyText').textContent='Opening final correction…';
    await new Promise(r=>setTimeout(r,20));
    startLabelPostStitchEditor(labelResultImage);
  }catch(err){
    console.error(err);
    toast('Could not stitch the panoramic photo set. Try fewer photos with a little more overlap.');
    showView('label');
    renderLabelBuilder();
  }finally{
    busy(false);
  }
}
async function buildLabelResult(){
  busy(true,'Preparing label sections…');
  try{
    const pieces=[];
    for(let i=0;i<labelItems.length;i++){$('busyText').textContent=`Flattening label section · ${i+1}/${labelItems.length}`;pieces.push(await warpLabelItem(labelItems[i],900));await new Promise(r=>setTimeout(r,0));}
    $('busyText').textContent='Matching overlaps & stitching…';
    const stitched=await stitchLabelPieces(pieces),ctx=stitched.getContext('2d',{willReadFrequently:true});
    labelResultImage=ctx.getImageData(0,0,stitched.width,stitched.height);
    $('busyText').textContent='Opening mesh editor…';await new Promise(r=>setTimeout(r,20));
    startLabelPostStitchEditor(labelResultImage);
  }catch(err){console.error(err);toast('Could not stitch these label images. Try fewer photos, keep a bit more overlap, or continue the last project and capture again.');}
  finally{busy(false);}
}
async function aiPolishLabelResult(){
  if(!labelResultImage)return;const ratio=Math.max(labelResultImage.width/labelResultImage.height,labelResultImage.height/labelResultImage.width);if(ratio>3){toast('This label is wider than the current AI whole-image limit. Local polish has been kept.');return;}busy(true,'AI polishing label…');const oldRef=aiReferenceDataUrl,oldName=aiReferenceName;aiReferenceDataUrl='';aiReferenceName='';try{const state=await checkAiService(true);if(state!=='ready')throw new Error('AI service unavailable');labelResultImage=await gptRestoreImage(labelResultImage,'document');const c=$('labelResultCanvas');c.width=labelResultImage.width;c.height=labelResultImage.height;c.getContext('2d').putImageData(labelResultImage,0,0);$('labelResultStatus').className='ai-engine-status ready';$('labelResultStatus').querySelector('span').textContent='AI label polish complete.';}catch(err){console.error(err);$('labelResultStatus').className='ai-engine-status fallback';$('labelResultStatus').querySelector('span').textContent='AI polish was unavailable. The locally polished stitched label is still ready to save.';}finally{aiReferenceDataUrl=oldRef;aiReferenceName=oldName;busy(false);}
}
function promptFileName({title='Name your file',help='Choose the name used when this file is saved.',defaultName='MeshDoctor-file',extension='.png'}={}){
  const dlg=$('fileNameDialog');if(!dlg)return Promise.resolve(sanitizeFileName(defaultName,'MeshDoctor-file'));$('fileNameTitle').textContent=title;$('fileNameHelp').textContent=help;$('fileNameInput').value=sanitizeFileName(defaultName,'MeshDoctor-file');$('fileNameExtension').textContent=extension;if(!dlg.open)dlg.showModal();setTimeout(()=>$('fileNameInput')?.select(),40);return new Promise(resolve=>{fileNameResolve=resolve;});
}
function closeFileNameDialog(value=null){if($('fileNameDialog')?.open)$('fileNameDialog').close();const resolve=fileNameResolve;fileNameResolve=null;if(resolve)resolve(value);}
async function requestPdfSave(){if(!pdfItems.length){toast('Add pages first.');return;}const name=await promptFileName({title:'Name your PDF',help:'Choose the filename for this PDF.',defaultName:userSettings.pdfFilename||'MeshDoctor-created',extension:'.pdf'});if(!name)return;userSettings.pdfFilename=name;saveSettings();syncSettingsUi();await savePdf(name);}
async function saveLabelResult(){if(!labelResultImage)return;const name=await promptFileName({title:'Name your label',help:'Choose the filename for this stitched label image.',defaultName:getDefaultLabelName(),extension:'.png'});if(!name)return;const c=$('labelResultCanvas'),blob=await canvasBlob(c,'image/png');if(blob){await saveBlobToOutput(blob,`${name}.png`,'Images');advanceLabelNameCounter();}}
async function saveLabelEditorResult(){
  const fallback=getDefaultLabelName();
  const name=sanitizeFileName($('imageOutputName')?.value||fallback,fallback);
  const blob=await canvasBlob(resultCanvas,'image/png');if(blob){await saveBlobToOutput(blob,`${name}.png`,'Images');advanceLabelNameCounter();}
}

async function savePdf(baseName=userSettings.pdfFilename){
  if(!pdfItems.length){toast('Add pages first.');return;}
  busy(true,`Building PDF · 1/${pdfItems.length}`);
  try{
    const pages=[];
    for(let i=0;i<pdfItems.length;i++){$('busyText').textContent=`Building PDF · ${i+1}/${pdfItems.length}`;pages.push(await pdfPageImage(pdfItems[i]));await new Promise(r=>setTimeout(r,0));}
    const pdf=buildImagePdf(pages);
    const fileName=`${sanitizeFileName(baseName||userSettings.pdfFilename,'MeshDoctor-created')}.pdf`;
    await saveBlobToOutput(pdf,fileName,'PDFs');
  }catch(err){console.error(err);toast('Could not build the PDF.');}
  finally{busy(false);}
}

function downloadCanvas(type='image/png'){
  resultCanvas.toBlob(async blob=>{if(!blob)return;const ext=type==='image/png'?'png':'jpg';const fileName=`${getImageOutputBase()}.${ext}`;await saveBlobToOutput(blob,fileName,'Images');},type,type==='image/jpeg'?.94:undefined);
}
async function shareCanvas(){
  resultCanvas.toBlob(async blob=>{if(!blob)return;const file=new File([blob],`${getImageOutputBase()}.png`,{type:'image/png'});try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'MeshDoctor corrected image'});}else{downloadCanvas('image/png');}}catch(e){if(e.name!=='AbortError')toast('Share was not available.');}},'image/png');
}

$('homeSettingsBtn')?.addEventListener('click',openSettingsDialog);
$('testAiConnectionBtn')?.addEventListener('click',testAiConnection);
$('chooseOutputFolderBtn')?.addEventListener('click',chooseOutputFolder);
$('settingsCloseBtn')?.addEventListener('click',closeSettingsDialog);
$('settingsCancelBtn')?.addEventListener('click',closeSettingsDialog);
$('settingsSaveBtn')?.addEventListener('click',()=>{
  userSettings.pdfFilename=sanitizeFileName($('settingsPdfName')?.value,'MeshDoctor-created');
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
$('pdfBuilderBtn').addEventListener('click',()=>{labelEditorMode=false;pdfEditingId=null;showView('pdf');});
$('labelMakerBtn').addEventListener('click',()=>{labelEditorMode=false;clearAiReference(true);showView('label');updateLabelRestoreUi();renderLabelBuilder();});
$('labelBackBtn').addEventListener('click',()=>{labelEditorMode=false;showView('home');});
$('labelAddBtn')?.addEventListener('click',openLabelAddDialog);
$('labelEmptyAddBtn')?.addEventListener('click',openLabelAddDialog);
$('labelRestoreBtn')?.addEventListener('click',()=>{busy(true,'Restoring last label project…');restoreLastLabelProject().finally(()=>busy(false));});
$('labelAddCloseBtn')?.addEventListener('click',closeLabelAddDialog);
$('labelAddDialog')?.addEventListener('cancel',ev=>{ev.preventDefault();closeLabelAddDialog();});
$('labelCameraChoiceBtn')?.addEventListener('click',startLabelCamera);
$('labelPhotosChoiceBtn')?.addEventListener('click',()=>{closeLabelAddDialog();$('labelPhotoInput').click();});
$('labelPhotoInput')?.addEventListener('change',e=>{addLabelFiles(e.target.files||[]);e.target.value='';});
$('labelReplaceInput')?.addEventListener('change',e=>{const file=e.target.files?.[0];e.target.value='';if(!file||!labelReplaceTargetId)return;const item=labelItemById(labelReplaceTargetId);labelReplaceTargetId=null;if(!item)return;revokeLabelItem(item);item.blob=file;item.url=URL.createObjectURL(file);item.name=file.name||item.name;item.quad=cloneLabelMesh(defaultLabelMesh());item.rotation=0;item.mapView={zoom:1,panX:0,panY:0};renderLabelBuilder();scheduleLabelProjectSave();toast('Label image replaced.');});
$('labelContinueBtn')?.addEventListener('pointerdown',burstCorrectButton);
$('labelContinueBtn')?.addEventListener('click',startLabelAreaFlow);
$('labelCameraCaptureBtn')?.addEventListener('click',()=>captureLabelCamera(false));
$('labelCameraDoneBtn')?.addEventListener('click',finalizeLabelCameraSession);
$('labelCameraCancelBtn')?.addEventListener('click',()=>{labelCameraCaptures=[];stopLabelCamera();});
$('labelCameraMirrorToggle')?.addEventListener('change',ev=>{if(!labelCameraGuideState)return;ev.target.checked=true;labelCameraGuideState.mirror=true;syncLabelCameraMirror();drawLabelCameraOverlay();});
$('labelCameraAutoToggle')?.addEventListener('change',ev=>{if(!labelCameraGuideState)return;labelCameraGuideState.auto=!!ev.target.checked;updateLabelCameraUi();});
$('labelCameraResetGuideBtn')?.addEventListener('click',()=>{if(labelCameraSessionCount>0){toast('Finish or cancel this panorama before resizing the guide.');return;}resetLabelCameraGuide();clearLabelCameraPreviewUi();drawLabelCameraOverlay();});
$('labelCameraOverlay')?.addEventListener('pointerdown',labelCameraPointerDown);
$('labelCameraOverlay')?.addEventListener('pointermove',labelCameraPointerMove);
$('labelCameraOverlay')?.addEventListener('pointerup',labelCameraPointerEnd);
$('labelCameraOverlay')?.addEventListener('pointercancel',labelCameraPointerEnd);
window.addEventListener('resize',()=>{if($('labelCameraDialog')?.open)drawLabelCameraOverlay();});
$('labelCameraDialog')?.addEventListener('cancel',ev=>{ev.preventDefault();labelCameraCaptures=[];stopLabelCamera();});
$('labelAreaBackBtn')?.addEventListener('click',()=>showView('label'));
$('labelAreaAutoBtn')?.addEventListener('click',()=>{const item=labelItems[labelAreaIndex];if(item){labelAreaPushHistory();item.quad=defaultLabelMesh();item.rotation=0;labelAreaSelectedIndex=-1;const slider=$('labelAreaRotationSlider'),out=$('labelAreaRotationValue');if(slider)slider.value='0';if(out)out.textContent='0.0°';drawLabelArea();toast('Reset to the base 4-point mesh.');}});
$('labelApplyRemainingBtn')?.addEventListener('click',applyLabelAreaRemaining);
$('labelAreaUndoBtn')?.addEventListener('click',labelAreaUndo);
$('labelAreaRemovePointBtn')?.addEventListener('click',removeSelectedLabelAreaPoint);
$('labelPrevBtn')?.addEventListener('click',labelAreaPrevious);
$('labelNextBtn')?.addEventListener('click',labelAreaNext);
$('labelAreaCanvas')?.addEventListener('pointerdown',labelAreaPointerDown);
$('labelAreaCanvas')?.addEventListener('pointermove',labelAreaPointerMove);
$('labelAreaCanvas')?.addEventListener('pointerup',labelAreaPointerEnd);
$('labelAreaCanvas')?.addEventListener('pointercancel',labelAreaPointerEnd);
$('labelAreaRotationSlider')?.addEventListener('pointerdown',()=>{const item=labelItems[labelAreaIndex];if(item&&!$('labelAreaRotationSlider').dataset.dragging){labelAreaPushHistory();$('labelAreaRotationSlider').dataset.dragging='1';}});
$('labelAreaRotationSlider')?.addEventListener('pointerup',()=>{if($('labelAreaRotationSlider')) delete $('labelAreaRotationSlider').dataset.dragging;});
$('labelAreaRotationSlider')?.addEventListener('pointercancel',()=>{if($('labelAreaRotationSlider')) delete $('labelAreaRotationSlider').dataset.dragging;});
$('labelAreaRotationSlider')?.addEventListener('input',ev=>{const item=labelItems[labelAreaIndex];if(!item)return;item.rotation=clamp(Number(ev.target.value)||0,-10,10);const out=$('labelAreaRotationValue');if(out)out.textContent=`${item.rotation.toFixed(1)}°`;drawLabelArea();});
$('labelAreaRotationResetBtn')?.addEventListener('click',()=>{const item=labelItems[labelAreaIndex];if(!item)return;labelAreaPushHistory();item.rotation=0;const slider=$('labelAreaRotationSlider'),out=$('labelAreaRotationValue');if(slider)slider.value='0';if(out)out.textContent='0.0°';drawLabelArea();});
$('labelResultBackBtn')?.addEventListener('click',()=>{showView('label');renderLabelBuilder();});
$('labelRebuildBtn')?.addEventListener('click',()=>{showView('label');renderLabelBuilder();});
$('labelAiPolishBtn')?.addEventListener('click',aiPolishLabelResult);
$('labelSaveBtn')?.addEventListener('click',saveLabelResult);
$('fileNameSaveBtn')?.addEventListener('click',()=>closeFileNameDialog(sanitizeFileName($('fileNameInput')?.value,'MeshDoctor-file')));
$('fileNameCancelBtn')?.addEventListener('click',()=>closeFileNameDialog(null));
$('fileNameCloseBtn')?.addEventListener('click',()=>closeFileNameDialog(null));
$('fileNameDialog')?.addEventListener('cancel',ev=>{ev.preventDefault();closeFileNameDialog(null);});
$('pdfBackBtn').addEventListener('click',()=>{pdfEditingId=null;showView('home');});
$('pdfAddBtn').addEventListener('click',()=>$('pdfImageInput').click());
$('pdfEmptyAddBtn').addEventListener('click',()=>$('pdfImageInput').click());
$('pdfImageInput').addEventListener('change',async e=>{const files=[...e.target.files];e.target.value='';await addPdfSources(files);});
$('savePdfBtn').addEventListener('pointerdown',burstCorrectButton);
$('savePdfBtn').addEventListener('click',requestPdfSave);
$('autoBtn').addEventListener('click',()=>{history.push(points.map(p=>({...p})));points=autoDetectDocument();selectedIndex=-1;hidePointActions();renderEditor();toast('Image boundary re-detected.');});
$('resetBtn').addEventListener('click',()=>{history.push(points.map(p=>({...p})));points=defaultQuad();selectedIndex=-1;hidePointActions();renderEditor();});
$('undoPointBtn').addEventListener('click',()=>{if(history.length){points=history.pop();selectedIndex=-1;hidePointActions();renderEditor();}else toast('Nothing to undo yet.');});
$('rotateBtn').addEventListener('click',()=>rotateSource());
if(meshMoveAllBtn){
  meshMoveAllBtn.addEventListener('pointerdown',ev=>{
    if(!labelEditorMode||!points.length)return;ev.preventDefault();ev.stopPropagation();
    history.push(points.map(p=>({...p})));
    meshMoveAllDrag={pointerId:ev.pointerId,start:eventToCanvas(ev),origin:points.map(p=>({...p}))};
    meshMoveAllBtn.classList.add('dragging');try{meshMoveAllBtn.setPointerCapture(ev.pointerId);}catch{}hidePointActions();
  });
  meshMoveAllBtn.addEventListener('pointermove',ev=>{
    if(!meshMoveAllDrag||meshMoveAllDrag.pointerId!==ev.pointerId)return;ev.preventDefault();ev.stopPropagation();
    const p=eventToCanvas(ev),dx=p.x-meshMoveAllDrag.start.x,dy=p.y-meshMoveAllDrag.start.y;translateWholeMesh(dx,dy,meshMoveAllDrag.origin);
  });
  const endWholeMeshMove=ev=>{
    if(!meshMoveAllDrag||meshMoveAllDrag.pointerId!==ev.pointerId)return;meshMoveAllDrag=null;meshMoveAllBtn.classList.remove('dragging');try{meshMoveAllBtn.releasePointerCapture(ev.pointerId);}catch{}updateMeshMoveAllPosition();ev.preventDefault();ev.stopPropagation();
  };
  meshMoveAllBtn.addEventListener('pointerup',endWholeMeshMove);meshMoveAllBtn.addEventListener('pointercancel',endWholeMeshMove);
}
$('labelRotationSlider')?.addEventListener('input',ev=>renderShapeRotation(ev.target.value));
$('labelRotationResetBtn')?.addEventListener('click',()=>{const slider=$('labelRotationSlider');if(slider)slider.value='0';renderShapeRotation(0);});
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
$('shapeBackBtn').addEventListener('click',async()=>{if(labelEditorMode){showView('label');renderLabelBuilder();}else if(pdfEditingId){pdfEditingId=null;showView('pdf');}else showView('home');});
$('headerBackBtn').addEventListener('click',()=>{showView('shape');renderEditor();});
$('resultHomeBtn').addEventListener('click',()=>{pdfEditingId=null;labelEditorMode=false;showView('home');});
$('adjustModeBtn').addEventListener('click',()=>setMode('adjust'));
$('bwModeBtn').addEventListener('click',()=>setMode('bw'));
$('correctedModeBtn').addEventListener('click',()=>setMode('corrected'));
$('aiAssistModeBtn').addEventListener('click',openAiAssist);
document.querySelectorAll('.ai-choice').forEach(btn=>btn.addEventListener('click',()=>runAiRestoreChoice(btn.dataset.aiChoice)));
$('resetAdjustBtn').addEventListener('click',()=>resetAdjustments(true));
$('savePngBtn').addEventListener('click',()=>pdfEditingId?savePdfEditedPage():(labelEditorMode?saveLabelEditorResult():downloadCanvas('image/png')));
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
loadLabelNameCounter();
loadLabelProjectMeta();
window.addEventListener('load',async()=>{ await restoreOutputHandle(); syncSettingsUi(); updateAiReferenceUi(); initAmbientShards();initHomeMesh();initMeshSliders();renderPdfBuilder();renderLabelBuilder();updateLabelRestoreUi();if(views.home.classList.contains('active')||views.pdf.classList.contains('active')||views.label.classList.contains('active')) startHomeCameraBg(); });
window.addEventListener('pagehide',()=>{stopHomeCameraBg();stopLabelCamera(false);saveLabelProject().catch(()=>{});});
document.addEventListener('visibilitychange',()=>{ if(document.hidden){stopHomeCameraBg();if(labelCameraStream)stopLabelCamera(false);} else if(views.home.classList.contains('active')||views.pdf.classList.contains('active')||views.label.classList.contains('active')) startHomeCameraBg(); });

if('serviceWorker' in navigator) { window.addEventListener('load', async ()=>{ try { const reg = await navigator.serviceWorker.register('./sw.js?v=1.6.22', {updateViaCache:'none'}); await reg.update(); } catch(err){ console.warn(err); } }); }
