// ====== Minimal catalog (with capacity rule) ======
const CAT_KEY = 'loxqty.catalog.v2';
const DEFAULT_CATALOG = [
  // Relay Extension (14 rel.) item
  { id:'relay_ext', sku:'100200', label:'Relay Extension (14 rel.)', group:'Valdikliai', family:'Relay', color:'-', unit:'vnt', price:0, icon:'⚙️' },
  // On/Off light that consumes 1 relay channel
  { id:'onoff_light', sku:'200100', label:'On/Off šviestuvas', group:'Apšvietimas', family:'On/Off', color:'balta', unit:'vnt', price:0, icon:'💡',
    requires:[{ type:'capacity', id:'relay_ext', capacity:14, per:1 }]
  }
];
function loadCatalog() { try { return JSON.parse(localStorage.getItem(CAT_KEY)) || DEFAULT_CATALOG; } catch { return DEFAULT_CATALOG; } }
function saveCatalog(cat){ localStorage.setItem(CAT_KEY, JSON.stringify(cat)); }
let CATALOG = loadCatalog();

// ====== State ======
let pdfDoc = null, currentPage = 1, pageCount = 1, viewportScale = 1;
const state = { activeTool:null, scalePxPerMeter:null, pages:{}, pdfName:null, pdfData:null, snap:true };

// ====== UI refs ======
const pdfCanvas = document.getElementById('pdfCanvas');
const annoCanvas = document.getElementById('annoCanvas');
const pdfCtx = pdfCanvas.getContext('2d');
const annoCtx = annoCanvas.getContext('2d');
const stage = document.getElementById('stage');
const pageInfo = document.getElementById('pageInfo');
const statusEl = document.getElementById('status');
const totalsBody = document.querySelector('#totals tbody');
const grandTotalCell = document.getElementById('grandTotal');

// ====== Catalog filters & rendering ======
const fGroup=document.getElementById('fGroup'), fFamily=document.getElementById('fFamily'), fColor=document.getElementById('fColor');
function unique(arr, key){ return Array.from(new Set(arr.map(x=>x[key]).filter(Boolean))); }
function fillFilters(){
  const cat = CATALOG;
  const groups = unique(cat,'group'); fGroup.innerHTML = '<option value="">Grupė</option>'+groups.map(g=>`<option>${g}</option>`).join('');
  const families = unique(cat,'family'); fFamily.innerHTML = '<option value="">Šeima</option>'+families.map(g=>`<option>${g}</option>`).join('');
  const colors = unique(cat,'color'); fColor.innerHTML = '<option value="">Spalva</option>'+colors.map(g=>`<option>${g}</option>`).join('');
}
fillFilters(); [fGroup,fFamily,fColor].forEach(el=>el.addEventListener('change',renderCatalog));

const catalogWrap = document.getElementById('catalog');
function renderCatalog(){
  const g=fGroup.value||null, ff=fFamily.value||null, c=fColor.value||null;
  catalogWrap.innerHTML='';
  CATALOG.filter(it => (!g||it.group===g) && (!ff||it.family===ff) && (!c||it.color===c)).forEach(item => {
    const el = document.createElement('div'); el.className='catalog-item'; el.dataset.id=item.id;
    el.innerHTML = `<div class="catalog-icon">${item.icon||'●'}</div>
      <div class="catalog-meta"><strong>${item.label}</strong><small>${item.sku||''} • ${item.unit} • €${item.price}</small></div>`;
    el.addEventListener('click', ()=>setActiveTool(item.id));
    catalogWrap.appendChild(el);
  });
}
function setActiveTool(id){
  state.activeTool=id;
  document.querySelectorAll('.catalog-item').forEach(n=>n.classList.toggle('active', n.dataset.id===id));
}
renderCatalog();

// ====== Catalog modal editor ======
const modal = document.getElementById('catalogModal');
const catRows = document.getElementById('catRows');
document.getElementById('openCatalog').onclick = () => { catRows.innerHTML=''; CATALOG.forEach(c=>addRow(c)); modal.showModal(); };
document.getElementById('closeModal').onclick = ()=> modal.close();
document.getElementById('addRow').onclick = ()=> addRow({ id:'', sku:'', label:'', group:'', family:'', color:'', unit:'vnt', price:0, icon:'●' });

function addRow(item){
  const tr=document.createElement('tr');
  tr.innerHTML = `
    <td><input data-f="id" value="${item.id||''}"></td>
    <td><input data-f="sku" value="${item.sku||''}"></td>
    <td><input data-f="label" value="${item.label||''}"></td>
    <td><input data-f="group" value="${item.group||''}"></td>
    <td><input data-f="family" value="${item.family||''}"></td>
    <td><input data-f="color" value="${item.color||''}"></td>
    <td><input data-f="unit" value="${item.unit||'vnt'}"></td>
    <td><input data-f="price" type="number" step="0.01" value="${item.price??0}"></td>
    <td><input data-f="icon" value="${item.icon||'●'}"></td>
    <td><button class="del">✕</button></td>`;
  tr.querySelector('.del').onclick = ()=> tr.remove();
  catRows.appendChild(tr);
}
document.getElementById('catalogForm').addEventListener('submit', e=>{
  e.preventDefault();
  const rows=[...catRows.querySelectorAll('tr')];
  const next=rows.map(tr=>{
    const o={}; tr.querySelectorAll('input').forEach(inp=>{ const k=inp.dataset.f; o[k]=k==='price'?parseFloat(inp.value||'0'):inp.value; });
    return o;
  }).filter(o=>o.id && o.label);
  CATALOG = next;
  saveCatalog(CATALOG);
  fillFilters(); renderCatalog();
  modal.close();
});

// ====== PDF handling ======
document.getElementById('pdfFile').addEventListener('change', async (e)=>{
  const f = e.target.files[0]; if(!f) return;
  const arr = new Uint8Array(await f.arrayBuffer()); state.pdfName=f.name; state.pdfData=arr; await openPdfArray(arr);
});
['dragenter','dragover'].forEach(ev=>document.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); document.getElementById('dropHint').style.display='block'; }));
['dragleave','drop'].forEach(ev=>document.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); if(ev==='drop') document.getElementById('dropHint').style.display='none'; }));
document.addEventListener('drop', async (e)=>{
  const f = e.dataTransfer?.files?.[0]; if(!f) return;
  const arr = new Uint8Array(await f.arrayBuffer()); state.pdfName=f.name; state.pdfData=arr; await openPdfArray(arr);
});

async function openPdfArray(arr){
  if(!window.pdfjsLib){ alert('PDF.js neįkeltas'); return; }
  statusEl.textContent='Status: kraunu PDF…';
  const task = window.pdfjsLib.getDocument({ data: arr });
  try { pdfDoc = await task.promise; } catch(err){ alert('Nepavyko įkelti PDF: '+(err?.message||err)); return; }
  pageCount = pdfDoc.numPages; currentPage=1; await renderPage(); updateTotals();
  pageInfo.textContent = `1 / ${pageCount}`; statusEl.textContent = `Status: PDF įkeltas (${state.pdfName||''})`;
}

async function renderPage(){
  const page = await pdfDoc.getPage(currentPage);
  const vp1 = page.getViewport({ scale: 1 });
  const wrapW = Math.max(320, stage.clientWidth - 24);
  viewportScale = Math.max(0.5, wrapW / vp1.width);
  const vp = page.getViewport({ scale: viewportScale });
  pdfCanvas.width = Math.floor(vp.width); pdfCanvas.height = Math.floor(vp.height);
  annoCanvas.width = pdfCanvas.width; annoCanvas.height = pdfCanvas.height;
  pdfCtx.fillStyle='#fff'; pdfCtx.fillRect(0,0,pdfCanvas.width,pdfCanvas.height);
  await page.render({ canvasContext: pdfCtx, viewport: vp }).promise;
  drawAnnotations();
  pageInfo.textContent = `${currentPage} / ${pageCount}`;
}
document.getElementById('prevPage').onclick = async ()=>{ if(!pdfDoc) return; currentPage=Math.max(1,currentPage-1); await renderPage(); };
document.getElementById('nextPage').onclick = async ()=>{ if(!pdfDoc) return; currentPage=Math.min(pageCount,currentPage+1); await renderPage(); };

// ====== Annotations & interactions ======
function getPageData(){ if(!state.pages[currentPage]) state.pages[currentPage]={markers:[],lines:[]}; return state.pages[currentPage]; }
function drawAnnotations(){
  const p=getPageData(); annoCtx.clearRect(0,0,annoCanvas.width,annoCanvas.height);
  // lines
  annoCtx.lineWidth=2; annoCtx.strokeStyle='#333'; p.lines.forEach(l=>{ annoCtx.beginPath(); annoCtx.moveTo(l.x1,l.y1); annoCtx.lineTo(l.x2,l.y2); annoCtx.stroke(); });
  // markers
  p.markers.forEach(m=>{ const cat = CATALOG.find(c=>c.id===m.id) || {icon:'●'}; annoCtx.font='18px system-ui'; annoCtx.textAlign='center'; annoCtx.textBaseline='middle'; annoCtx.fillText(cat.icon, m.x, m.y); });
}
let measuring=false, measurePts=[], dragStart=null, dragMarkerIdx=-1;
document.getElementById('setScale').onclick=()=>{ measuring=true; measurePts=[]; showTip('Spustelk du taškus pagal žinomą atstumą.'); };
annoCanvas.addEventListener('mousemove',(e)=>{
  const {x,y}=localPos(e);
  if(measuring){ if(measurePts.length===1){ drawAnnotations(); annoCtx.setLineDash([6,4]); annoCtx.strokeStyle='#007aff'; annoCtx.beginPath(); annoCtx.moveTo(measurePts[0].x,measurePts[0].y); annoCtx.lineTo(x,y); annoCtx.stroke(); annoCtx.setLineDash([]); } return; }
  if(dragStart && e.shiftKey){ drawAnnotations(); const {dx,dy}=snapAngle(x-dragStart.x,y-dragStart.y); annoCtx.setLineDash([6,4]); annoCtx.strokeStyle='#555'; annoCtx.beginPath(); annoCtx.moveTo(dragStart.x,dragStart.y); annoCtx.lineTo(dragStart.x+dx,dragStart.y+dy); annoCtx.stroke(); annoCtx.setLineDash([]); }
  else if(dragMarkerIdx>=0 && (e.altKey||e.metaKey)){ const p=getPageData(); p.markers[dragMarkerIdx].x=x; p.markers[dragMarkerIdx].y=y; drawAnnotations(); }
});
annoCanvas.addEventListener('click',(e)=>{
  const {x,y}=localPos(e);
  if(measuring){ measurePts.push({x,y}); if(measurePts.length===2){ const px=Math.hypot(measurePts[1].x-measurePts[0].x, measurePts[1].y-measurePts[0].y); const m=parseFloat(prompt('Atstumas (m):','3.0')||'0'); if(m>0){ state.scalePxPerMeter=px/m; document.getElementById('scaleLabel')?.textContent = `1 m = ${state.scalePxPerMeter.toFixed(1)} px`; } measuring=false; measurePts=[]; } return; }
  if(!state.activeTool){ alert('Pasirink elementą kairėje.'); return; }
  const p=getPageData(); p.markers.push({id:state.activeTool,x,y}); drawAnnotations(); updateTotals();
});
annoCanvas.addEventListener('contextmenu',(e)=>{ e.preventDefault(); const hit=hitTestMarker(e); if(hit.idx>=0){ const p=getPageData(); p.markers.splice(hit.idx,1); drawAnnotations(); updateTotals(); }});
annoCanvas.addEventListener('mousedown',(e)=>{ const {x,y}=localPos(e); if(measuring) return; if(e.shiftKey){ dragStart={x,y}; } else if(e.altKey||e.metaKey){ const hit=hitTestMarker(e); dragMarkerIdx=hit.idx; }});
document.addEventListener('mouseup',(e)=>{ if(dragStart && e.shiftKey){ const {x,y}=localPos(e); const {dx,dy}=snapAngle(x-dragStart.x,y-dragStart.y); const p=getPageData(); p.lines.push({x1:dragStart.x,y1:dragStart.y,x2:dragStart.x+dx,y2:dragStart.y+dy}); dragStart=null; drawAnnotations(); updateTotals(); } dragMarkerIdx=-1; });

function hitTestMarker(e){ const {x,y}=localPos(e); const p=getPageData(); for(let i=p.markers.length-1;i>=0;i--){ const m=p.markers[i]; if(Math.hypot(x-m.x,y-m.y)<12) return {idx:i,m}; } return {idx:-1,m:null}; }
function localPos(e){ const r=annoCanvas.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; }
function snapAngle(dx,dy){ if(!document.getElementById('snap').checked) return {dx,dy}; const a=Math.atan2(dy,dx), steps=[0,45,90,135,180].map(s=>s*Math.PI/180); let best=steps[0],bd=Infinity; for(const s of steps){ const d=Math.abs(Math.atan2(Math.sin(a-s),Math.cos(a-s))); if(d<bd){best=s;bd=d;} } const len=Math.hypot(dx,dy); return {dx:len*Math.cos(best),dy:len*Math.sin(best)}; }
function showTip(){} // simplified

// ====== Totals with capacity rules ======
function countAllMarkers(){
  const counts={};
  Object.values(state.pages).forEach(p=>p.markers.forEach(m=>counts[m.id]=(counts[m.id]||0)+1));
  return counts;
}
function applyCapacity(counts){
  // Look for items with requires capacity; compute needed providers
  CATALOG.forEach(item => {
    if (!item.requires) return;
    item.requires.forEach(req => {
      if (req.type==='capacity' && req.id && req.capacity>0) {
        const consumerCount = counts[item.id] || 0;
        const per = req.per || 1;
        const unitsNeeded = Math.ceil((consumerCount * per) / req.capacity);
        // ensure provider (req.id) meets at least unitsNeeded
        counts[req.id] = Math.max(counts[req.id]||0, unitsNeeded);
      }
    });
  });
  return counts;
}

function updateTotals(){
  let counts = countAllMarkers();
  counts = applyCapacity(counts);

  totalsBody.innerHTML=''; let grand=0;
  // show in catalog order
  CATALOG.forEach(c=>{
    const n = counts[c.id] || 0;
    if (n>0){
      const sum = n * (c.price||0);
      grand += sum;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${c.sku||''}</td><td>${c.label}</td><td>${n}</td><td>${c.price||0}</td><td>${sum}</td>`;
      totalsBody.appendChild(tr);
    }
  });
  grandTotalCell.textContent = grand;
}
document.getElementById('exportCSV').onclick = ()=>{
  let counts = applyCapacity(countAllMarkers());
  const rows = [['SKU','Tipas','Vnt','Kaina/vnt','Suma']]; let total=0;
  CATALOG.forEach(c=>{ const n=counts[c.id]||0; if(n>0){ const sum=n*(c.price||0); total+=sum; rows.push([c.sku||'', c.label, String(n), String(c.price||0), String(sum)]); } });
  rows.push(['','','','Iš viso', String(total)]);
  const csv = rows.map(r => r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='samata.csv'; a.click(); URL.revokeObjectURL(url);
};

// ====== Export PNG & PDF (print) ======
document.getElementById('exportPNGs').onclick = async ()=>{
  if(!pdfDoc) return alert('Pirma įkelk PDF.');
  for(let p=1;p<=pageCount;p++){ await renderPageAt(p); const merged=mergeCanvases(); const url=merged.toDataURL('image/png'); const a=document.createElement('a'); a.href=url; a.download=`planas_p${p}.png`; a.click(); }
};
document.getElementById('exportPDF').onclick = async ()=>{
  if(!pdfDoc) return alert('Pirma įkelk PDF.');
  const w = window.open('', '_blank');
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Eksportas</title><style>@page{size:A4;margin:0}body{margin:0}.page{page-break-after:always}img{width:100%;display:block}</style></head><body>');
  for(let p=1;p<=pageCount;p++){ await renderPageAt(p); const merged=mergeCanvases(); const dataUrl=merged.toDataURL('image/png'); w.document.write(`<div class="page"><img src="${dataUrl}"></div>`); }
  w.document.write('</body></html>'); w.document.close(); w.focus(); w.print();
};
async function renderPageAt(p){ const prev=currentPage; currentPage=p; await renderPage(); currentPage=prev; pageInfo.textContent=`${prev} / ${pageCount}`; }
function mergeCanvases(){ const out=document.createElement('canvas'); out.width=pdfCanvas.width; out.height=pdfCanvas.height; const ctx=out.getContext('2d'); ctx.drawImage(pdfCanvas,0,0); ctx.drawImage(annoCanvas,0,0); return out; }

// ====== Save/Load project (embed PDF) ======
document.getElementById('saveProject').onclick = async ()=>{
  let pdfArr = state.pdfData;
  if((!pdfArr || !pdfArr.length) && pdfDoc && pdfDoc.getData){ try{ const data=await pdfDoc.getData(); pdfArr=new Uint8Array(data);}catch{} }
  if(!pdfArr || !pdfArr.length){ alert('PDF baitų nėra. Įkelk PDF.'); return; }
  const proj = {
    version: 8,
    meta: { savedAt: new Date().toISOString() },
    pdf: { name: state.pdfName||'planas.pdf', dataBase64: uint8ToBase64(pdfArr) },
    catalog: CATALOG,
    state: { activeTool: state.activeTool, scalePxPerMeter: state.scalePxPerMeter, pages: state.pages, snap: state.snap }
  };
  const json = JSON.stringify(proj);
  const blob = new Blob([json], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=(state.pdfName?state.pdfName.replace(/\.pdf$/i,''):'projektas')+'_samata.json'; a.click(); URL.revokeObjectURL(url);
};
document.getElementById('loadProject').addEventListener('change', async (e)=>{
  const f = e.target.files[0]; if(!f) return;
  let obj=null; try{ obj=JSON.parse(await f.text()); }catch{ alert('Blogas projekto failas'); return; }
  if(!obj.pdf?.dataBase64){ alert('Projekte nėra PDF'); return; }
  if(Array.isArray(obj.catalog)){ CATALOG=obj.catalog; saveCatalog(CATALOG); fillFilters(); renderCatalog(); }
  state.activeTool = obj.state?.activeTool||null;
  state.scalePxPerMeter = obj.state?.scalePxPerMeter||null;
  state.pages = obj.state?.pages||{};
  state.snap = obj.state?.snap!==false;
  state.pdfName = obj.pdf?.name||'planas.pdf';
  state.pdfData = base64ToUint8(obj.pdf.dataBase64);
  await openPdfArray(state.pdfData);
  updateTotals();
});

// ====== Utils ======
function uint8ToBase64(u8){ let b=''; const ch=0x8000; for(let i=0;i<u8.length;i+=ch){ const s=u8.subarray(i,i+ch); b+=String.fromCharCode.apply(null,s);} return btoa(b); }
function base64ToUint8(b64){ const bin=atob(b64); const len=bin.length; const u8=new Uint8Array(len); for(let i=0;i<len;i++) u8[i]=bin.charCodeAt(i); return u8; }

window.addEventListener('resize', ()=>{ if(pdfDoc) renderPage(); });
