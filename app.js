// ===== Config & external catalog =====
const CAT_KEY = 'loxqty.catalog.v3';

let APP_CFG = { iconMaxPx: 32, thumbnailPx: 64, snapAngles: [0,45,90,135,180] };
async function loadConfig() {
  try {
    const r = await fetch('./config.json', { cache: 'no-store' });
    if (r.ok) APP_CFG = Object.assign(APP_CFG, await r.json());
  } catch (_) {}
}
async function loadExternalCatalog() {
  try {
    const r = await fetch('./catalog.json', { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch (_) {}
  return null;
}

// ===== Default catalog (fallback) =====
const DEFAULT_CATALOG = [
  { id:'relay_ext', sku:'100200', type:'capacity', label:'Relay Extension (14 rel.)', group:'Valdikliai', family:'Relay', color:'—', unit:'vnt', price:0, icon:'🔗', capKey:'relay', capSize:14 },
  { id:'dali_ext',  sku:'100300', type:'capacity', label:'DALI Extension (64 addr.)',  group:'Valdikliai', family:'DALI',  color:'—', unit:'vnt', price:0, icon:'🖧', capKey:'dali',  capSize:64 },
  { id:'light_onoff', sku:'200100', type:'device', label:'On/Off šviestuvas', group:'Apšvietimas', family:'On/Off', color:'Balta', unit:'vnt', price:0, icon:'💡', requires:[{type:'capacity', cap:'relay', per:1}] },
  { id:'light_dali',  sku:'200110', type:'device', label:'DALI šviestuvas',    group:'Apšvietimas', family:'DALI',   color:'Balta', unit:'vnt', price:0, icon:'💡', requires:[{type:'capacity', cap:'dali',  per:1}] },
  { id:'touch',       sku:'300100', type:'device', label:'Touch Tree',         group:'Valdikliai', family:'Tree',   color:'Balta', unit:'vnt', price:0, icon:'🖐️' }
];
function loadCatalogLocal() {
  try { return JSON.parse(localStorage.getItem(CAT_KEY)) || DEFAULT_CATALOG; } catch { return DEFAULT_CATALOG; }
}
function saveCatalog(cat) { localStorage.setItem(CAT_KEY, JSON.stringify(cat)); }
let CATALOG = loadCatalogLocal();

// ===== State & DOM =====
let pdfDoc=null, currentPage=1, pageCount=1, viewportScale=1;
const pdfCanvas=document.getElementById('pdfCanvas');
const annoCanvas=document.getElementById('annoCanvas');
const pdfCtx=pdfCanvas.getContext('2d');
const annoCtx=annoCanvas.getContext('2d');
const stage=document.getElementById('stage');
const pageInfo=document.getElementById('pageInfo');
const statusEl=document.getElementById('status');
const dropHint=document.getElementById('dropHint');
const totalsBody=document.querySelector('#totals tbody');
const grandTotalCell=document.getElementById('grandTotal');
const scaleLabel=document.getElementById('scaleLabel');

const state = {
  activeTool: null,
  scalePxPerMeter: null,
  snap: true,
  pages: {},
  pdfName: null,
  pdfData: null // Uint8Array
};

// ===== Filters (Group → Family → Color) =====
const fGroup=document.getElementById('fGroup');
const fFamily=document.getElementById('fFamily');
const fColor=document.getElementById('fColor');
[fGroup, fFamily, fColor].forEach(s=>s.addEventListener('change', renderCatalog));
function fillFilters(){
  const groups=[...new Set(CATALOG.map(c=>c.group).filter(Boolean))].sort();
  const families=[...new Set(CATALOG.map(c=>c.family).filter(Boolean))].sort();
  const colors=[...new Set(CATALOG.map(c=>c.color).filter(Boolean))].sort();
  function fill(sel, arr, title){
    const v=sel.value;
    sel.innerHTML = `<option value="">${title}</option>` + arr.map(x=>`<option>${x}</option>`).join('');
    sel.value = v || '';
  }
  fill(fGroup, groups, 'Grupė');
  fill(fFamily, families, 'Šeima');
  fill(fColor, colors, 'Spalva');
}

// ===== Catalog list =====
const catalogWrap=document.getElementById('catalog');
function renderCatalog(){
  catalogWrap.innerHTML='';
  const gg=fGroup.value, ff=fFamily.value, cc=fColor.value;
  CATALOG.filter(c => (!gg||c.group===gg) && (!ff||c.family===ff) && (!cc||c.color===cc))
    .forEach(item=>{
      const el=document.createElement('div'); el.className='catalog-item'; el.dataset.id=item.id;
      const iconHTML = item.img ? `<img src="${item.img}" alt="">` : (item.icon || '●');
      el.innerHTML = `
        <div class="catalog-icon">${iconHTML}</div>
        <div class="catalog-meta">
          <strong>${item.label}</strong>
          <small>${item.sku||''} • ${item.group||''}/${item.family||''}/${item.color||''} • ${item.unit||''} • €${item.price||0} ${item.type==='capacity'?`• cap:${item.capKey}/${item.capSize}`:''}</small>
        </div>`;
      el.addEventListener('click', ()=>setActiveTool(item.id));
      catalogWrap.appendChild(el);
    });
}
function setActiveTool(id){
  state.activeTool=id;
  document.querySelectorAll('.catalog-item').forEach(n=>n.classList.toggle('active', n.dataset.id===id));
}

// ===== PDF load =====
document.getElementById('pdfFile').addEventListener('change', async (e)=>{
  const f=e.target.files[0]; if(!f) return;
  const arr = new Uint8Array(await f.arrayBuffer());
  state.pdfName=f.name; state.pdfData=arr;
  await openPdfArray(arr);
});
['dragenter','dragover'].forEach(ev=>document.addEventListener(ev,e=>{e.preventDefault(); e.stopPropagation(); dropHint.style.display='block';}));
['dragleave','drop'].forEach(ev=>document.addEventListener(ev,e=>{e.preventDefault(); e.stopPropagation(); if(ev==='drop') dropHint.style.display='none';}));
document.addEventListener('drop', async (e)=>{
  const f = e.dataTransfer?.files?.[0]; if(!f) return;
  const arr = new Uint8Array(await f.arrayBuffer());
  state.pdfName=f.name; state.pdfData=arr;
  await openPdfArray(arr);
});

async function openPdfArray(arr){
  await window.__pdfReady;
  const task = window.pdfjsLib.getDocument({ data: arr });
  try { pdfDoc = await task.promise; }
  catch(err){ alert('Nepavyko įkelti PDF: '+(err?.message||err)); return; }
  pageCount=pdfDoc.numPages; currentPage=1; state.pages=state.pages||{};
  await renderPage(); updateTotals();
  pageInfo.textContent = `1 / ${pageCount}`;
  statusEl.textContent = `Status: PDF įkeltas (${state.pdfName||''}), puslapių: ${pageCount}`;
}

// ===== Render page (DPR support) =====
async function renderPage(){
  const page = await pdfDoc.getPage(currentPage);
  const viewport = page.getViewport({ scale: 1 });
  const wrapW = Math.max(320, stage.clientWidth - 24);
  viewportScale = Math.max(0.5, wrapW / viewport.width);
  const scaled = page.getViewport({ scale: viewportScale });

  const dpr = window.devicePixelRatio || 1;
  pdfCanvas.width = Math.floor(scaled.width * dpr);
  pdfCanvas.height = Math.floor(scaled.height * dpr);
  annoCanvas.width = pdfCanvas.width;
  annoCanvas.height = pdfCanvas.height;
  pdfCanvas.style.width = Math.floor(scaled.width) + 'px';
  pdfCanvas.style.height = Math.floor(scaled.height) + 'px';
  annoCanvas.style.width = pdfCanvas.style.width;
  annoCanvas.style.height = pdfCanvas.style.height;

  pdfCtx.setTransform(dpr,0,0,dpr,0,0);
  annoCtx.setTransform(dpr,0,0,dpr,0,0);

  pdfCtx.fillStyle='#fff'; pdfCtx.fillRect(0,0,scaled.width,scaled.height);
  await page.render({ canvasContext: pdfCtx, viewport: scaled }).promise;
  drawAnnotations();
  pageInfo.textContent = `${currentPage} / ${pageCount}`;
}
document.getElementById('prevPage').onclick = async ()=>{ if(!pdfDoc) return; currentPage=Math.max(1,currentPage-1); await renderPage(); };
document.getElementById('nextPage').onclick = async ()=>{ if(!pdfDoc) return; currentPage=Math.min(pageCount,currentPage+1); await renderPage(); };

// ===== Annotations (32px icons, keep aspect) =====
const IMG_CACHE = new Map();
function getImg(src){ let im=IMG_CACHE.get(src); if(!im){ im=new Image(); im.src=src; IMG_CACHE.set(src, im);} return im; }

function drawAnnotations(){
  const page = getPageData();
  annoCtx.clearRect(0,0,annoCanvas.width, annoCanvas.height);
  annoCtx.lineWidth=2; annoCtx.strokeStyle='#333';

  // lines
  page.lines.forEach(l=>{ annoCtx.beginPath(); annoCtx.moveTo(l.x1,l.y1); annoCtx.lineTo(l.x2,l.y2); annoCtx.stroke(); });

  // markers
  page.markers.forEach(m=>{
    const cat = CATALOG.find(c=>c.id===m.id) || {};
    if (cat.img) {
      const img = getImg(cat.img);
      if (!img.complete) { img.onload = () => drawAnnotations(); return; }
      const target = APP_CFG.iconMaxPx || 32; // max side
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const scale = target / Math.max(iw, ih);
      const dw = Math.round(iw * scale);
      const dh = Math.round(ih * scale);
      const dx = Math.round(m.x - dw/2);
      const dy = Math.round(m.y - dh/2);
      annoCtx.drawImage(img, dx, dy, dw, dh);
    } else {
      annoCtx.font='18px system-ui'; annoCtx.textAlign='center'; annoCtx.textBaseline='middle';
      annoCtx.fillText(cat.icon || '●', m.x, m.y);
    }
  });
}

function getPageData(){ if(!state.pages[currentPage]) state.pages[currentPage]={markers:[],lines:[]}; return state.pages[currentPage]; }

function snapAngle(dx,dy){
  if(!document.getElementById('snap').checked) return {dx,dy};
  const ang=Math.atan2(dy,dx);
  const steps=(APP_CFG.snapAngles||[0,45,90,135,180]).map(a=>a*Math.PI/180);
  let best=steps[0],bd=Infinity; for(const s of steps){ const d=Math.abs(Math.atan2(Math.sin(ang-s),Math.cos(ang-s))); if(d<bd){best=s;bd=d;} }
  const len=Math.hypot(dx,dy); return {dx:len*Math.cos(best),dy:len*Math.sin(best)};
}

let measuring=false, measurePts=[]; let dragStart=null; let dragMarkerIdx=-1;
document.getElementById('setScale').onclick=()=>{ measuring=true; measurePts=[]; showTip('Spustelk du taškus pagal žinomą atstumą.'); };
annoCanvas.addEventListener('mousemove',(e)=>{
  const {x,y}=localPos(e);
  if(measuring){ if(measurePts.length===1){ drawAnnotations(); annoCtx.setLineDash([6,4]); annoCtx.strokeStyle='#007aff'; annoCtx.beginPath(); annoCtx.moveTo(measurePts[0].x,measurePts[0].y); annoCtx.lineTo(x,y); annoCtx.stroke(); annoCtx.setLineDash([]); showTip('Antras taškas – įvesk m.', e.clientX, e.clientY);} return; }
  if(dragStart && e.shiftKey){ drawAnnotations(); const {dx,dy}=snapAngle(x-dragStart.x,y-dragStart.y); annoCtx.strokeStyle='#555'; annoCtx.setLineDash([6,4]); annoCtx.beginPath(); annoCtx.moveTo(dragStart.x,dragStart.y); annoCtx.lineTo(dragStart.x+dx,dragStart.y+dy); annoCtx.stroke(); annoCtx.setLineDash([]); }
  else if(dragMarkerIdx>=0 && (e.altKey||e.metaKey)){ const p=getPageData(); p.markers[dragMarkerIdx].x=x; p.markers[dragMarkerIdx].y=y; drawAnnotations(); }
});
annoCanvas.addEventListener('mouseleave',()=>document.getElementById('tooltip').hidden=true);
annoCanvas.addEventListener('click',(e)=>{
  const {x,y}=localPos(e);
  if(measuring){ measurePts.push({x,y}); if(measurePts.length===2){ const px=Math.hypot(measurePts[1].x-measurePts[0].x, measurePts[1].y-measurePts[0].y); const meters=parseFloat(prompt('Atstumas metrais:','3.0')||'0'); if(meters>0){ state.scalePxPerMeter=px/meters; scaleLabel.textContent=`1 m = ${state.scalePxPerMeter.toFixed(1)} px`; } measuring=false; measurePts=[]; document.getElementById('tooltip').hidden=true; drawAnnotations(); } return; }
  if(!state.activeTool){ alert('Pasirink elementą kairėje.'); return; }
  const p=getPageData(); p.markers.push({id: state.activeTool, x, y}); drawAnnotations(); updateTotals();
});
annoCanvas.addEventListener('contextmenu',(e)=>{ e.preventDefault(); const hit=hitTestMarker(e); if(hit.idx>=0){ const p=getPageData(); p.markers.splice(hit.idx,1); drawAnnotations(); updateTotals(); }});
annoCanvas.addEventListener('mousedown',(e)=>{ const {x,y}=localPos(e); if(measuring) return; if(e.shiftKey){ dragStart={x,y}; } else if(e.altKey||e.metaKey){ const hit=hitTestMarker(e); dragMarkerIdx=hit.idx; }});
document.addEventListener('mouseup',(e)=>{ if(dragStart && e.shiftKey){ const {x,y}=localPos(e); const {dx,dy}=snapAngle(x-dragStart.x,y-dragStart.y); const p=getPageData(); p.lines.push({x1:dragStart.x,y1:dragStart.y,x2:dragStart.x+dx,y2:dragStart.y+dy}); dragStart=null; drawAnnotations(); updateTotals(); } dragMarkerIdx=-1; });
function hitTestMarker(e){ const {x,y}=localPos(e); const p=getPageData(); for(let i=p.markers.length-1;i>=0;i--){ const m=p.markers[i]; if(Math.hypot(x-m.x,y-m.y)<12) return {idx:i,m}; } return {idx:-1,m:null}; }
function localPos(e){ const r=annoCanvas.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; }
function showTip(text,clientX,clientY){ const t=document.getElementById('tooltip'); t.textContent=text; t.style.left=`${clientX+10}px`; t.style.top=`${clientY+10}px`; t.hidden=false; }

// ===== Totals + capacity auto-add =====
function updateTotals(){
  const counts={}; Object.values(state.pages).forEach(p=>p.markers.forEach(m=>counts[m.id]=(counts[m.id]||0)+1));

  // Demand per capKey
  const demand={};
  for(const [id, n] of Object.entries(counts)){
    const cat = CATALOG.find(c=>c.id===id);
    if(!cat) continue;
    if(Array.isArray(cat.requires)){
      for(const req of cat.requires){
        if(req.type==='capacity' && req.cap && req.per>0){
          demand[req.cap] = (demand[req.cap]||0) + n*req.per;
        }
      }
    }
  }

  // Providers
  const providers = CATALOG.filter(c=>c.type==='capacity' && c.capKey && c.capSize>0);
  const autoNeeded={};
  for(const capKey of Object.keys(demand)){
    const p0 = providers.find(p=>p.capKey===capKey);
    if(!p0) continue;
    autoNeeded[p0.id] = Math.ceil(demand[capKey] / p0.capSize);
  }
  // Merge with manual
  for(const pid of Object.keys(autoNeeded)){
    const manual = counts[pid]||0;
    counts[pid] = Math.max(manual, autoNeeded[pid]);
  }

  // Render totals
  totalsBody.innerHTML=''; let grand=0;
  const ordered=[...providers, ...CATALOG.filter(c=>c.type!=='capacity')];
  for(const c of ordered){
    const n = counts[c.id]||0; if(n<=0) continue;
    const sum = n*(c.price||0); grand+=sum;
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${c.sku||''}</td><td>${c.label}</td><td>${n}</td><td>${c.price||0}</td><td>${sum}</td>`;
    totalsBody.appendChild(tr);
  }
  grandTotalCell.textContent = grand;
}

document.getElementById('exportCSV').onclick=()=>{
  const rows=[['SKU','Pavadinimas','Vnt','Kaina/vnt','Suma']];
  totalsBody.querySelectorAll('tr').forEach(tr=>{
    rows.push(Array.from(tr.querySelectorAll('td')).map(td=>td.textContent));
  });
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadBlob(csv,'samata.csv','text/csv;charset=utf-8');
};

// ===== Export: PNG + PDF(print) =====
document.getElementById('exportPNGs').onclick = async ()=>{
  if(!pdfDoc) return alert('Pirma įkelk PDF.');
  for(let p=1;p<=pageCount;p++){ await renderPageAt(p); const merged=mergeCanvases(); const url=merged.toDataURL('image/png'); downloadURL(url,`planas_p${p}.png`); }
};
document.getElementById('exportPDF').onclick = async ()=>{
  if(!pdfDoc) return alert('Pirma įkelk PDF.');
  const w=window.open('', '_blank');
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Eksportas</title>');
  w.document.write('<style>@page{size:A4;margin:0} body{margin:0} .page{page-break-after:always;} img{width:100%;display:block}</style>');
  w.document.write('</head><body>');
  for(let p=1;p<=pageCount;p++){ await renderPageAt(p); const merged=mergeCanvases(); const dataUrl=merged.toDataURL('image/png'); w.document.write(`<div class="page"><img src="${dataUrl}"></div>`); }
  w.document.write('</body></html>'); w.document.close(); w.focus(); w.print();
};
async function renderPageAt(p){ const prev=currentPage; currentPage=p; await renderPage(); currentPage=prev; pageInfo.textContent=`${prev} / ${pageCount}`; }
function mergeCanvases(){ const out=document.createElement('canvas'); out.width=pdfCanvas.width; out.height=pdfCanvas.height; const ctx=out.getContext('2d'); ctx.drawImage(pdfCanvas,0,0); ctx.drawImage(annoCanvas,0,0); return out; }
function downloadURL(url,fn){ const a=document.createElement('a'); a.href=url; a.download=fn; a.click(); }
function downloadBlob(content,fn,type){ const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); downloadURL(url,fn); URL.revokeObjectURL(url); }

// ===== Save/Load project (embed PDF + catalog) =====
document.getElementById('saveProject').onclick = async ()=>{
  let pdfArr = state.pdfData;
  if((!pdfArr || !pdfArr.length) && pdfDoc && pdfDoc.getData){
    try{ pdfArr = new Uint8Array(await pdfDoc.getData()); } catch{}
  }
  if(!pdfArr || !pdfArr.length){ alert('PDF baitų nėra. Įkelk PDF.'); return; }
  const project = {
    version: 10,
    meta: { savedAt: new Date().toISOString() },
    pdf: { name: state.pdfName || 'planas.pdf', dataBase64: uint8ToBase64(pdfArr) },
    catalog: CATALOG,
    state: { activeTool: state.activeTool, scalePxPerMeter: state.scalePxPerMeter, snap: state.snap, pages: state.pages }
  };
  downloadBlob(JSON.stringify(project), (state.pdfName?state.pdfName.replace(/\.pdf$/i,''):'projektas')+'_samata.json', 'application/json');
};
document.getElementById('loadProject').addEventListener('change', async (e)=>{
  const f=e.target.files[0]; if(!f) return;
  let obj=null; try{ obj=JSON.parse(await f.text()); } catch{ alert('Blogas projekto failas'); return; }
  if(!obj.pdf?.dataBase64){ alert('Projekte nerastas įterptas PDF'); return; }
  if(Array.isArray(obj.catalog)){ CATALOG=obj.catalog; saveCatalog(CATALOG); fillFilters(); renderCatalog(); }
  state.activeTool=obj.state?.activeTool||null;
  state.scalePxPerMeter=obj.state?.scalePxPerMeter||null;
  state.snap=obj.state?.snap!==false;
  state.pages=obj.state?.pages||{};
  state.pdfName=obj.pdf?.name||'planas.pdf';
  state.pdfData=base64ToUint8(obj.pdf.dataBase64);
  await openPdfArray(state.pdfData);
  updateTotals();
});

// ===== Catalog modal (with image thumbnails 64px) =====
const modal=document.getElementById('catalogModal');
const catRows=document.getElementById('catRows');
document.getElementById('openCatalog').onclick=()=>{ catRows.innerHTML=''; CATALOG.forEach(c=>addRow(c)); modal.showModal(); };
document.getElementById('closeModal').onclick=()=> modal.close();
document.getElementById('addDevice').onclick=()=> addRow({ type:'device', unit:'vnt', price:0, icon:'●', requires:[] });
document.getElementById('addCapacity').onclick=()=> addRow({ type:'capacity', unit:'vnt', price:0, icon:'●', capKey:'relay', capSize:14 });

function addRow(item){
  const tr=document.createElement('tr');
  tr.innerHTML = `
    <td><input data-f="id" value="${item.id||''}" placeholder="id"></td>
    <td><input data-f="sku" value="${item.sku||''}" placeholder="SKU"></td>
    <td>
      <select data-f="type">
        <option value="device" ${item.type==='device'?'selected':''}>device</option>
        <option value="capacity" ${item.type==='capacity'?'selected':''}>capacity</option>
      </select>
    </td>
    <td><input data-f="label" value="${item.label||''}" placeholder="pavadinimas"></td>
    <td><input data-f="group" value="${item.group||''}" placeholder="grupė"></td>
    <td><input data-f="family" value="${item.family||''}" placeholder="šeima"></td>
    <td><input data-f="color" value="${item.color||''}" placeholder="spalva"></td>
    <td><input data-f="unit" value="${item.unit||'vnt'}" placeholder="vnt"></td>
    <td><input data-f="price" type="number" step="0.01" value="${item.price??0}"></td>
    <td><input data-f="icon" value="${item.icon||'●'}" placeholder="ikona"></td>
    <td>
      <input type="file" accept="image/*" class="imgUp">
      <button type="button" class="imgClear">✕</button>
      <input type="hidden" data-f="img" value="${item.img||''}">
    </td>
    <td class="thumb">${item.img?`<img src="${item.img}" style="width:64px;height:64px;object-fit:contain;border:1px solid #eee;border-radius:6px;">`:''}</td>
    <td><input data-f="capKey" value="${item.capKey||''}" placeholder="relay/dali…"></td>
    <td><input data-f="capSize" type="number" step="1" value="${item.capSize??0}"></td>
    <td><textarea data-f="requires" placeholder='[{"type":"capacity","cap":"relay","per":1}]'>${item.requires?JSON.stringify(item.requires):''}</textarea></td>
    <td><button class="del">✕</button></td>
  `;
  tr.querySelector('.del').onclick=()=> tr.remove();
  const fileInput = tr.querySelector('.imgUp');
  const clearBtn = tr.querySelector('.imgClear');
  const hidden = tr.querySelector('input[data-f="img"]');
  const thumb = tr.querySelector('.thumb');

  fileInput.addEventListener('change', async (e)=>{
    const f = e.target.files[0]; if(!f) return;
    const dataUrl = await fileToThumb64(f, APP_CFG.thumbnailPx || 64);
    hidden.value = dataUrl;
    thumb.innerHTML = `<img src="${dataUrl}" style="width:${APP_CFG.thumbnailPx||64}px;height:${APP_CFG.thumbnailPx||64}px;object-fit:contain;border:1px solid #eee;border-radius:6px;">`;
  });
  clearBtn.addEventListener('click', ()=>{ hidden.value=''; thumb.innerHTML=''; });
  catRows.appendChild(tr);
}

document.getElementById('catalogForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const rows=Array.from(catRows.querySelectorAll('tr'));
  const next=[];
  for(const tr of rows){
    const obj={};
    tr.querySelectorAll('input,select,textarea').forEach(inp=>{
      const f=inp.dataset.f; if(!f) return;
      let v=inp.value;
      if(f==='price' || f==='capSize') v=parseFloat(v||'0');
      if(f==='requires'){ v=v.trim(); if(!v) v=[]; else{ try{ v=JSON.parse(v); } catch{ alert('Blogas JSON laukelyje "requires"'); v=[]; } } }
      obj[f]=v;
    });
    const selType = tr.querySelector('select[data-f="type"]');
    if(selType) obj.type = selType.value;
    if(!obj.id || !obj.label) continue;
    next.push(obj);
  }
  CATALOG = next;
  saveCatalog(CATALOG);
  fillFilters(); renderCatalog();
  modal.close();
});

async function fileToThumb64(file, maxSide){
  const img = new Image();
  const buf = await file.arrayBuffer();
  const url = URL.createObjectURL(new Blob([buf]));
  try {
    await new Promise((res, rej)=>{ img.onload=res; img.onerror=rej; img.src=url; });
    const w=img.naturalWidth, h=img.naturalHeight;
    const scale = maxSide / Math.max(w,h);
    const dw = Math.max(1, Math.round(w*scale));
    const dh = Math.max(1, Math.round(h*scale));
    const canvas = document.createElement('canvas');
    canvas.width = dw; canvas.height = dh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0,0,dw,dh);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ===== Utilities =====
function uint8ToBase64(u8){ let b=''; const ch=0x8000; for(let i=0;i<u8.length;i+=ch){ b += String.fromCharCode.apply(null, u8.subarray(i,i+ch)); } return btoa(b); }
function base64ToUint8(b64){ const bin=atob(b64); const len=bin.length; const u8=new Uint8Array(len); for(let i=0;i<len;i++) u8[i]=bin.charCodeAt(i); return u8; }
window.addEventListener('resize', ()=>{ if(pdfDoc) renderPage(); });

// ===== Boot: load config/catalog, then render =====
(async function boot(){
  await loadConfig();
  const ext = await loadExternalCatalog();
  if (ext) { CATALOG = ext; saveCatalog(CATALOG); }
  fillFilters(); renderCatalog();
})();
