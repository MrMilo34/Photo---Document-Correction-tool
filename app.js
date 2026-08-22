'use strict';

const $ = (id) => document.getElementById(id);
const views = { home: $('homeView'), shape: $('shapeView'), result: $('resultView') };
const editCanvas = $('editCanvas'), ectx = editCanvas.getContext('2d', { willReadFrequently: true });
const resultCanvas = $('resultCanvas'), rctx = resultCanvas.getContext('2d', { willReadFrequently: true });
const loupe = $('loupe'), loupeCanvas = $('loupeCanvas'), lctx = loupeCanvas.getContext('2d');
const stageWrap = $('stageWrap'), canvasPan = $('canvasPan'), canvasZoom = $('canvasZoom');
const pointActions = $('pointActions'), movePointBtn = $('movePointBtn'), removePointBtn = $('removePointBtn'), zoomChip = $('zoomChip');
const sourceCanvas = document.createElement('canvas'), sctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
const workingCanvas = document.createElement('canvas'), wctx = workingCanvas.getContext('2d', { willReadFrequently: true });

let points = [];
let draggedIndex = -1;
let pointerMoved = false;
let downPos = null;
let correctedOriginal = null;
let correctedImage = null;
let aiAssistImage = null;
let adjustedImage = null;
let bwImage = null;
let currentMode = 'corrected';
let adjustTimer = null;
const adjustments = { brightness:0, contrast:0, saturation:0, black:0, white:0 };
let history = [];
let currentFileBase = 'document';
let selectedIndex = -1;
let editZoom = 1, panX = 0, panY = 0;
let gesture = null, pinchState = null, pinchedUntilClear = false;
const activePointers = new Map();
let precisionMove = null;
const SELECT_RADIUS_CSS = 62;
const EDGE_TAP_RADIUS_CSS = 46;
const MAX_ZOOM = 5;


function showView(name){
  Object.values(views).forEach(v=>v.classList.remove('active'));
  views[name].classList.add('active');
  document.body.classList.toggle('result-mode', name==='result');
  if(name!=='shape') hidePointActions();
  window.scrollTo(0,0);
}
function busy(on, text='Working…'){ $('busyText').textContent=text; $('busy').classList.toggle('hidden', !on); }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),2200); }
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

async function loadFile(file){
  if(!file) return;
  currentFileBase = (file.name || 'document').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'_') || 'document';
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
  if(editZoom<=1.01){editZoom=1;panX=0;panY=0;}
  canvasPan.style.transform=`translate3d(${panX}px,${panY}px,0)`;
  canvasZoom.style.transform=`scale(${editZoom})`;
  views.shape.classList.toggle('focus-edit',editZoom>1.18 || !!precisionMove || (gesture?.type==='point' && gesture.moved));
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
  applyViewport(false);
}
function clampPan(){
  if(editZoom<=1.01){panX=0;panY=0;return;}
  const r=stageWrap.getBoundingClientRect();
  const mx=r.width*Math.min(2.4,editZoom*.72), my=r.height*Math.min(2.4,editZoom*.72);
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
  if(!pinchState||activePointers.size<2)return;const ps=[...activePointers.values()],a=ps[0],b=ps[1];
  const dist=Math.max(1,screenDistance(a,b)), mid=midpoint(a,b), newZoom=clamp(pinchState.zoom*(dist/pinchState.distance),1,MAX_ZOOM), factor=newZoom/pinchState.zoom;
  const sr=stageWrap.getBoundingClientRect(),cx=sr.left+sr.width/2,cy=sr.top+sr.height/2;
  panX=(mid.x-cx)-factor*(pinchState.mid.x-cx-pinchState.panX);
  panY=(mid.y-cy)-factor*(pinchState.mid.y-cy-pinchState.panY);
  editZoom=newZoom;clampPan();applyViewport(true);
}

editCanvas.addEventListener('pointerdown',ev=>{
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
    if(gesture.moved&&editZoom>1.01){panX=gesture.panStart.x+(ev.clientX-gesture.startClient.x);panY=gesture.panStart.y+(ev.clientY-gesture.startClient.y);clampPan();applyViewport(false);}
  }
});
editCanvas.addEventListener('pointerup',ev=>{
  ev.preventDefault();activePointers.delete(ev.pointerId);loupe.classList.add('hidden');
  if(pinchedUntilClear){if(activePointers.size===0){pinchedUntilClear=false;pinchState=null;gesture=null;applyViewport(true);}return;}
  if(!gesture||gesture.pointerId!==ev.pointerId)return;
  const g=gesture;gesture=null;
  if(g.type==='point'){
    selectedIndex=g.index;renderEditor();pointActions.classList.remove('hidden');updatePointActions();applyViewport(false);
  }else if(!g.moved){addPointAt(g.downCanvas);}else applyViewport(false);
});
editCanvas.addEventListener('pointercancel',ev=>{activePointers.delete(ev.pointerId);loupe.classList.add('hidden');if(activePointers.size===0){gesture=null;pinchState=null;pinchedUntilClear=false;}applyViewport(false);});

movePointBtn.addEventListener('pointerdown',ev=>{
  ev.preventDefault();ev.stopPropagation();if(selectedIndex<0||!points[selectedIndex])return;
  movePointBtn.setPointerCapture?.(ev.pointerId);
  precisionMove={pointerId:ev.pointerId,index:selectedIndex,startX:ev.clientX,startY:ev.clientY,origin:{x:points[selectedIndex].x,y:points[selectedIndex].y},historySaved:false,moved:false};
  hidePointActions();views.shape.classList.add('focus-edit');showLoupe(points[selectedIndex],ev);
});
movePointBtn.addEventListener('pointermove',ev=>{
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

function makeCorrected(){
  const top=getEdgePoints(0,1), right=getEdgePoints(1,2), bottom=getEdgePoints(2,3), left=getEdgePoints(3,0);
  if([top,right,bottom,left].some(e=>e.length<2)) throw new Error('Invalid perimeter');
  const w0=(polyLength(top)+polyLength(bottom))/2, h0=(polyLength(left)+polyLength(right))/2;
  const maxOut=2000, scale=Math.min(1,maxOut/Math.max(w0,h0));
  const W=Math.max(320,Math.round(w0*scale)), H=Math.max(320,Math.round(h0*scale));
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
  // Stronger cleanup mode: build on the balanced correction and push shadow removal and clarity further.
  const base = cleanupImage(img);
  const W=base.width,H=base.height, src=base.data;
  const out=new ImageData(new Uint8ClampedArray(src),W,H), d=out.data;
  const step=Math.max(14,Math.round(Math.max(W,H)/96)), gw=Math.ceil(W/step), gh=Math.ceil(H/step), count=gw*gh;
  const lumGrid=new Float32Array(count), weightGrid=new Float32Array(count);
  for(let y=0;y<H;y+=2) for(let x=0;x<W;x+=2){
    const i=(y*W+x)*4;
    const lum=.299*src[i]+.587*src[i+1]+.114*src[i+2];
    const w=Math.pow(clamp((lum-90)/150,0,1),1.3)+0.05;
    const cell=Math.floor(y/step)*gw+Math.floor(x/step);
    lumGrid[cell]+=lum*w; weightGrid[cell]+=w;
  }
  for(let i=0;i<count;i++) lumGrid[i]=weightGrid[i]>.001 ? lumGrid[i]/weightGrid[i] : 238;
  for(let pass=0; pass<5; pass++){
    const next=new Float32Array(count);
    for(let y=0;y<gh;y++) for(let x=0;x<gw;x++){
      let s=0,w=0;
      for(let yy=Math.max(0,y-2);yy<=Math.min(gh-1,y+2);yy++) for(let xx=Math.max(0,x-2);xx<=Math.min(gw-1,x+2);xx++){
        const dx=xx-x, dy=yy-y, idx=yy*gw+xx, wt=(dx===0&&dy===0)?4:((Math.abs(dx)+Math.abs(dy)===1)?2:1);
        s+=lumGrid[idx]*wt; w+=wt;
      }
      next[y*gw+x]=s/w;
    }
    lumGrid.set(next);
  }
  let p=0;
  for(let y=0;y<H;y++){
    const gy=y/step, y0=Math.min(gh-1,Math.floor(gy)), y1=Math.min(gh-1,y0+1), fy=gy-y0;
    for(let x=0;x<W;x++,p+=4){
      const gx=x/step, x0=Math.min(gw-1,Math.floor(gx)), x1=Math.min(gw-1,x0+1), fx=gx-x0;
      const a=lumGrid[y0*gw+x0]*(1-fx)+lumGrid[y0*gw+x1]*fx;
      const b=lumGrid[y1*gw+x0]*(1-fx)+lumGrid[y1*gw+x1]*fx;
      const illum=a*(1-fy)+b*fy;
      const shadowBoost=clamp((240-illum)/120,0,1);
      for(let c=0;c<3;c++){
        let v=src[p+c];
        v=v*(1.02+shadowBoost*0.22);
        v=(v-128)*(1.07+shadowBoost*0.06)+128;
        if(v>214) v=214+(v-214)*1.24;
        d[p+c]=clamp(v,0,255);
      }
      d[p+3]=255;
    }
  }
  // Stronger local sharpening, but only from neighbouring source pixels.
  const tmp=new Uint8ClampedArray(d);
  for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){
    const p=(y*W+x)*4;
    for(let c=0;c<3;c++){
      const up=((y-1)*W+x)*4+c, dn=((y+1)*W+x)*4+c, lf=(y*W+x-1)*4+c, rt=(y*W+x+1)*4+c;
      const blur=(tmp[up]+tmp[dn]+tmp[lf]+tmp[rt])*0.25;
      let v=tmp[p+c]+(tmp[p+c]-blur)*0.26;
      d[p+c]=clamp(v,0,255);
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

function blackWhiteImage(img){
  const W=img.width,H=img.height,s=img.data,out=new ImageData(W,H),d=out.data;
  const step=Math.max(16,Math.round(Math.max(W,H)/100)),gw=Math.ceil(W/step),gh=Math.ceil(H/step),grid=new Float32Array(gw*gh),cnt=new Uint32Array(gw*gh);
  for(let y=0;y<H;y+=2)for(let x=0;x<W;x+=2){const i=(y*W+x)*4,k=Math.floor(y/step)*gw+Math.floor(x/step);grid[k]+=.299*s[i]+.587*s[i+1]+.114*s[i+2];cnt[k]++;}
  for(let i=0;i<grid.length;i++)grid[i]=cnt[i]?grid[i]/cnt[i]:200;
  let p=0;for(let y=0;y<H;y++){for(let x=0;x<W;x++,p+=4){const g=.299*s[p]+.587*s[p+1]+.114*s[p+2],local=grid[Math.min(gh-1,Math.floor(y/step))*gw+Math.min(gw-1,Math.floor(x/step))],t=local-26;const v=g>t?255:0;d[p]=d[p+1]=d[p+2]=v;d[p+3]=255;}}return out;
}

function displayImage(img){resultCanvas.width=img.width;resultCanvas.height=img.height;rctx.putImageData(img,0,0);}
function resetAdjustments(render=false){
  Object.keys(adjustments).forEach(k=>adjustments[k]=0);
  const ids={brightness:'brightnessSlider',contrast:'contrastSlider',saturation:'saturationSlider',black:'blackSlider',white:'whiteSlider'};
  for(const [k,id] of Object.entries(ids)){const el=$(id);if(el)el.value=0;const out=$(k+'Value');if(out)out.value='0';}
  adjustedImage=null;
  if(render&&currentMode==='adjust'&&correctedOriginal){adjustedImage=applyAdjustments(correctedOriginal);displayImage(adjustedImage);}
}
async function runCorrection(){
  if(points.length<4)return;busy(true,'Straightening document…');await new Promise(r=>setTimeout(r,40));
  try{correctedOriginal=makeCorrected();correctedImage=cleanupImage(correctedOriginal);aiAssistImage=null;adjustedImage=null;bwImage=null;currentMode='corrected';resetAdjustments(false);displayImage(correctedImage);setModeButtons();showView('result');}
  catch(e){console.error(e);toast('Could not correct this shape. Try moving the perimeter points.');}
  finally{busy(false);}
}
async function setMode(mode){
  currentMode=mode;
  $('adjustPanel').classList.toggle('hidden',mode!=='adjust');
  $('aiAssistPanel').classList.toggle('hidden',mode!=='assist');
  if(mode==='assist'&&!aiAssistImage){busy(true,'Running AI Assisted cleanup…');await new Promise(r=>setTimeout(r,35));}
  else if(mode==='bw'&&!bwImage){busy(true,'Making greyscale scan…');await new Promise(r=>setTimeout(r,30));}
  try{
    if(mode==='corrected') {
      correctedImage ||= cleanupImage(correctedOriginal);
      displayImage(correctedImage);
    }
    else if(mode==='adjust') {
      adjustedImage=applyAdjustments(correctedOriginal);
      displayImage(adjustedImage);
    }
    else if(mode==='assist') {
      aiAssistImage ||= aggressiveCleanupImage(correctedOriginal);
      displayImage(aiAssistImage);
    }
    else {
      correctedImage ||= cleanupImage(correctedOriginal);
      bwImage ||= blackWhiteImage(correctedImage);
      displayImage(bwImage);
    }
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

function scheduleAdjustmentRender(){
  const map={brightness:'brightnessSlider',contrast:'contrastSlider',saturation:'saturationSlider',black:'blackSlider',white:'whiteSlider'};
  for(const [k,id] of Object.entries(map)){
    adjustments[k]=Number($(id).value)||0;
    $(k+'Value').value=(adjustments[k]>0?'+':'')+adjustments[k];
  }
  clearTimeout(adjustTimer);
  adjustTimer=setTimeout(()=>{
    if(currentMode!=='adjust'||!correctedOriginal)return;
    adjustedImage=applyAdjustments(correctedOriginal);
    displayImage(adjustedImage);
  },65);
}

function rotateSource(){
  const c=document.createElement('canvas');c.width=sourceCanvas.height;c.height=sourceCanvas.width;const cx=c.getContext('2d');cx.translate(c.width,0);cx.rotate(Math.PI/2);cx.drawImage(sourceCanvas,0,0);
  sourceCanvas.width=c.width;sourceCanvas.height=c.height;sctx.drawImage(c,0,0);setupEditCanvas();points=autoDetectDocument();history=[];selectedIndex=-1;hidePointActions();resetViewport();renderEditor();
}

function downloadCanvas(type='image/png'){
  resultCanvas.toBlob(blob=>{if(!blob)return;const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${currentFileBase}-corrected.${type==='image/png'?'png':'jpg'}`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Saved to your downloads.');},type,type==='image/jpeg'?.94:undefined);
}
async function shareCanvas(){
  resultCanvas.toBlob(async blob=>{if(!blob)return;const file=new File([blob],`${currentFileBase}-corrected.png`,{type:'image/png'});try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Corrected document'});}else{downloadCanvas('image/png');}}catch(e){if(e.name!=='AbortError')toast('Share was not available.');}},'image/png');
}

$('cameraInput').addEventListener('change',e=>loadFile(e.target.files[0]));$('galleryInput').addEventListener('change',e=>loadFile(e.target.files[0]));
$('autoBtn').addEventListener('click',()=>{history.push(points.map(p=>({...p})));points=autoDetectDocument();selectedIndex=-1;hidePointActions();renderEditor();toast('Document edge re-detected.');});
$('resetBtn').addEventListener('click',()=>{history.push(points.map(p=>({...p})));points=defaultQuad();selectedIndex=-1;hidePointActions();renderEditor();});
$('undoPointBtn').addEventListener('click',()=>{if(history.length){points=history.pop();selectedIndex=-1;hidePointActions();renderEditor();}else toast('Nothing to undo yet.');});
$('rotateBtn').addEventListener('click',()=>rotateSource());$('correctBtn').addEventListener('click',runCorrection);
$('headerBackBtn').addEventListener('click',()=>{showView('shape');renderEditor();});
$('adjustModeBtn').addEventListener('click',()=>setMode('adjust'));
$('bwModeBtn').addEventListener('click',()=>setMode('bw'));
$('correctedModeBtn').addEventListener('click',()=>setMode('corrected'));
$('aiAssistModeBtn').addEventListener('click',()=>setMode('assist'));
['brightnessSlider','contrastSlider','saturationSlider','blackSlider','whiteSlider'].forEach(id=>$(id).addEventListener('input',scheduleAdjustmentRender));
$('resetAdjustBtn').addEventListener('click',()=>resetAdjustments(true));
$('savePngBtn').addEventListener('click',()=>downloadCanvas('image/png'));$('shareBtn').addEventListener('click',shareCanvas);
$('aboutBtn').addEventListener('click',()=>$('aboutDialog').showModal());$('closeAboutBtn').addEventListener('click',()=>$('aboutDialog').close());

if('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js?v=0.5.1', { updateViaCache: 'none' });
      await registration.update();
    } catch (err) {
      console.warn(err);
    }
  });
}
