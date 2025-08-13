// ===== Katalogas (numatytasis) =====
// Šis sąrašas bus pakeistas tavo redagavimais (localStorage).
const DEFAULT_CATALOG = [
  { id: "miniserver", label: "Loxone Miniserver (Tree)", unit: "vnt", price: 0, icon: "🧠" },
  { id: "tree_ext",   label: "Tree Extension (2 šakos)", unit: "vnt", price: 0, icon: "🌳" },
  { id: "rgbw_tree",  label: "RGBW 24V Dimmer Tree",     unit: "vnt", price: 0, icon: "💡" },
  { id: "nano_2relay",label: "Nano 2 Relay Tree",        unit: "vnt", price: 0, icon: "⚙️" },
  { id: "nano_di",    label: "Nano DI Tree (6x DI)",     unit: "vnt", price: 0, icon: "⎇" },
  // pavyzdiniai bendri
  { id: "pir",   label: "PIR judesio jutiklis", unit: "vnt", price: 49, icon: "◉" },
  { id: "smoke", label: "Dūmų jutiklis",        unit: "vnt", price: 39, icon: "◎" }
];

// Storage raktas
const CAT_KEY = "loxqty.customCatalog.v1";

// Įkeliame katalogą iš localStorage (jei nėra - DEFAULT)
function loadCatalog() {
  try {
    const raw = localStorage.getItem(CAT_KEY);
    if (!raw) return [...DEFAULT_CATALOG];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
  } catch(e) { console.warn("catalog load error", e); }
  return [...DEFAULT_CATALOG];
}

// Išsaugome katalogą visiems naujiems projektams
function saveCatalogToLocal(catalog) {
  localStorage.setItem(CAT_KEY, JSON.stringify(catalog));
}

// ===== Bendra būsena =====
let CATALOG = loadCatalog(); // aktyvus katalogas
let pdfDoc = null;
let currentPage = 1;
let pageCount = 1;
let viewportScale = 1;
const state = {
  activeTool: null,
  scalePxPerMeter: null,
  snap: true,
  pages: {},
  pdfName: null,
  pdfData: null // Uint8Array baitai
};

// ===== UI nuorodos =====
const pdfCanvas = document.getElementById('pdfCanvas');
const annoCanvas = document.getElementById('annoCanvas');
const pdfCtx = pdfCanvas.getContext('2d');
const annoCtx = annoCanvas.getContext('2d');
const stage = document.getElementById('stage');
const pageInfo = document.getElementById('pageInfo');
const statusEl = document.getElementById('status');
const dropHint = document.getElementById('dropHint');
const totalsBody = document.querySelector('#totals tbody');
const grandTotalCell = document.getElementById('grandTotal');
const scaleLabel = document.getElementById('scaleLabel');
const includeCatalogInProject = document.getElementById('includeCatalogInProject');

const diagPdfName = document.getElementById('diagPdfName');
const diagPdfBytes = document.getElementById('diagPdfBytes');
const diagEmbedded = document.getElementById('diagEmbedded');

// ===== Katalogo sąrašas kairėje =====
const catalogWrap = document.getElementById('catalog');
function renderCatalogList() {
  catalogWrap.innerHTML = '';
  CATALOG.forEach(item => {
    const el = document.createElement('div');
    el.className = 'catalog-item';
    el.dataset.id = item.id;
    el.innerHTML = `
      <div class="catalog-icon">${item.icon || '●'}</div>
      <div class="catalog-meta"><strong>${item.label}</strong><small>${item.unit} • €${item.price}</small></div>
    `;
    el.addEventListener('click', () => setActiveTool(item.id));
    catalogWrap.appendChild(el);
  });
}
function setActiveTool(id){
  state.activeTool = id;
  document.querySelectorAll('.catalog-item').forEach(n=>n.classList.toggle('active', n.dataset.id===id));
}
renderCatalogList();

// ===== PDF įkėlimas =====
document.getElementById('pdfFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const arr = new Uint8Array(await file.arrayBuffer());
  state.pdfName = file.name;
  state.pdfData = arr;
  updateDiag();
  await openPdfArray(arr);
});

['dragenter','dragover'].forEach(ev => {
  document.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropHint.style.display='block'; });
});
['dragleave','drop'].forEach(ev => {
  document.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); if (ev==='drop') dropHint.style.display='none'; });
});
document.addEventListener('drop', async (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const arr = new Uint8Array(await file.arrayBuffer());
  state.pdfName = file.name;
  state.pdfData = arr;
  updateDiag();
  await openPdfArray(arr);
});

async function openPdfArray(arrUint8) {
  if (!window.pdfjsLib) { alert('pdfjsLib nerastas. Įdėk vendor/pdf.mjs ir vendor/pdf.worker.mjs'); return; }
  statusEl.textContent = 'Status: kraunu PDF…';
  const task = pdfjsLib.getDocument({ data: arrUint8 });
  task.onPassword = (updatePassword)=>{
    const pwd = prompt('Šis PDF apsaugotas. Slaptažodis:');
    updatePassword(pwd || '');
  };
  try {
    pdfDoc = await task.promise;
  } catch (err) {
    console.error('[pdf] klaida:', err);
    statusEl.textContent = 'Klaida: ' + (err?.message || String(err));
    alert('Nepavyko įkelti PDF: ' + (err?.message || String(err)));
    return;
  }
  pageCount = pdfDoc.numPages;
  currentPage = 1;
  state.pages = state.pages || {};
  await renderPage();
  updateTotals();
  pageInfo.textContent = `1 / ${pageCount}`;
  statusEl.textContent = 'Status: PDF įkeltas: ' + (state.pdfName || '(be pavadinimo)') + ', puslapių: ' + pageCount;
}

async function renderPage() {
  if (!pdfDoc) return;
  const page = await pdfDoc.getPage(currentPage);
  const viewport = page.getViewport({ scale: 1 });
  const wrapW = Math.max(320, stage.clientWidth - 24);
  viewportScale = Math.max(0.5, wrapW / viewport.width);
  const scaled = page.getViewport({ scale: viewportScale });

  pdfCanvas.width = Math.floor(scaled.width);
  pdfCanvas.height = Math.floor(scaled.height);
  annoCanvas.width = pdfCanvas.width;
  annoCanvas.height = pdfCanvas.height;

  pdfCtx.save();
  pdfCtx.fillStyle = '#fff';
  pdfCtx.fillRect(0,0,pdfCanvas.width,pdfCanvas.height);
  pdfCtx.restore();

  await page.render({ canvasContext: pdfCtx, viewport: scaled }).promise;
  drawAnnotations();
  pageInfo.textContent = `${currentPage} / ${pageCount}`;
}
document.getElementById('prevPage').onclick = async ()=>{ if(!pdfDoc) return; currentPage = Math.max(1, currentPage-1); await renderPage(); };
document.getElementById('nextPage').onclick = async ()=>{ if(!pdfDoc) return; currentPage = Math.min(pageCount, currentPage+1); await renderPage(); };

// ===== Anotacijos =====
function getPageData(){ if(!state.pages[currentPage]) state.pages[currentPage] = { markers: [], lines: [] }; return state.pages[currentPage]; }
function drawAnnotations(){
  const page = getPageData();
  annoCtx.clearRect(0,0,annoCanvas.width, annoCanvas.height);
  annoCtx.lineWidth = 2; annoCtx.strokeStyle = '#333';
  page.lines.forEach(l => { annoCtx.beginPath(); annoCtx.moveTo(l.x1,l.y1); annoCtx.lineTo(l.x2,l.y2); annoCtx.stroke(); });
  page.markers.forEach(m => {
    const cat = CATALOG.find(c => c.id === m.id) || { icon: '●' };
    annoCtx.font = '18px system-ui'; annoCtx.textAlign='center'; annoCtx.textBaseline='middle';
    annoCtx.fillText(cat.icon, m.x, m.y);
  });
}
function snapAngle(dx,dy){
  if(!document.getElementById('snap').checked) return {dx,dy};
  const ang=Math.atan2(dy,dx); const steps=[0,45,90,135,180].map(a=>a*Math.PI/180);
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
  if(measuring){ measurePts.push({x,y}); if(measurePts.length===2){ const px=Math.hypot(measurePts[1].x-measurePts[0].x, measurePts[1].y-measurePts[0].y); const meters=parseFloat(prompt('Atstumas metrais:', '3.0')||'0'); if(meters>0){ state.scalePxPerMeter=px/meters; document.getElementById('scaleLabel').textContent=`1 m = ${state.scalePxPerMeter.toFixed(1)} px`; } measuring=false; measurePts=[]; document.getElementById('tooltip').hidden=true; drawAnnotations(); } return; }
  if(!state.activeTool){ alert('Pasirink elementą kairėje.'); return; }
  const p=getPageData(); p.markers.push({id: state.activeTool, x, y}); drawAnnotations(); updateTotals();
});
annoCanvas.addEventListener('contextmenu',(e)=>{ e.preventDefault(); const hit=hitTestMarker(e); if(hit.idx>=0){ const p=getPageData(); p.markers.splice(hit.idx,1); drawAnnotations(); updateTotals(); }});
annoCanvas.addEventListener('mousedown',(e)=>{ const {x,y}=localPos(e); if(measuring) return; if(e.shiftKey){ dragStart={x,y}; } else if(e.altKey||e.metaKey){ const hit=hitTestMarker(e); dragMarkerIdx=hit.idx; }});
document.addEventListener('mouseup',(e)=>{ if(dragStart && e.shiftKey){ const {x,y}=localPos(e); const {dx,dy}=snapAngle(x-dragStart.x,y-dragStart.y); const p=getPageData(); p.lines.push({x1:dragStart.x,y1:dragStart.y,x2:dragStart.x+dx,y2:dragStart.y+dy}); dragStart=null; drawAnnotations(); updateTotals(); } dragMarkerIdx=-1; });
function hitTestMarker(e){ const {x,y}=localPos(e); const p=getPageData(); for(let i=p.markers.length-1;i>=0;i--){ const m=p.markers[i]; if(Math.hypot(x-m.x,y-m.y)<12) return {idx:i,m}; } return {idx:-1,m:null}; }
function localPos(e){ const r=annoCanvas.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; }
function showTip(text,clientX,clientY){ const t=document.getElementById('tooltip'); t.textContent=text; t.style.left=`${clientX+10}px`; t.style.top=`${clientY+10}px`; t.hidden=false; }

// ===== Suvestinė + CSV =====
function updateTotals(){
  const counts={}; Object.values(state.pages).forEach(p=>p.markers.forEach(m=>counts[m.id]=(counts[m.id]||0)+1));
  totalsBody.innerHTML=''; let grand=0;
  CATALOG.forEach(c=>{ const n=counts[c.id]||0; if(n>0){ const sum=n*c.price; grand+=sum; const tr=document.createElement('tr'); tr.innerHTML=`<td>${c.label}</td><td>${n}</td><td>${c.price}</td><td>${sum}</td>`; totalsBody.appendChild(tr); }});
  grandTotalCell.textContent=grand;
}
document.getElementById('exportCSV').onclick=()=>{
  const counts={}; Object.values(state.pages).forEach(p=>p.markers.forEach(m=>counts[m.id]=(counts[m.id]||0)+1));
  const rows=[['Tipas','Vnt','Kaina/vnt','Suma']]; let total=0;
  CATALOG.forEach(c=>{ const n=counts[c.id]||0; if(n>0){ const sum=n*c.price; total+=sum; rows.push([c.label,String(n),String(c.price),String(sum)]); }});
  rows.push(['','','Iš viso',String(total)]);
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\\n');
  downloadBlob(csv,'samata.csv','text/csv;charset=utf-8');
};

// ===== Eksportai =====
document.getElementById('exportPNGs').onclick = async ()=>{
  if(!pdfDoc) return alert('Pirma įkelk PDF.');
  for(let p=1; p<=pageCount; p++){ await renderPageAt(p); const merged=mergeCanvases(); const url=merged.toDataURL('image/png'); downloadURL(url, `planas_p${p}.png`); }
};
document.getElementById('exportPDF').onclick = async ()=>{
  if(!pdfDoc) return alert('Pirma įkelk PDF.');
  const w = window.open('', '_blank');
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Eksportas</title>');
  w.document.write('<style>@page{size:A4;margin:0} body{margin:0} .page{page-break-after:always;} img{width:100%;display:block}</style>');
  w.document.write('</head><body>');
  for(let p=1;p<=pageCount;p++){ await renderPageAt(p); const merged=mergeCanvases(); const dataUrl=merged.toDataURL('image/png'); w.document.write(`<div class="page"><img src="${dataUrl}"></div>`); }
  w.document.write('</body></html>'); w.document.close(); w.focus(); w.print();
};
document.getElementById('downloadOriginalPdf').onclick = ()=>{
  if (state.pdfData && state.pdfData.length) {
    const blob = new Blob([state.pdfData], {type:'application/pdf'});
    const url = URL.createObjectURL(blob);
    downloadURL(url, state.pdfName || 'planas.pdf');
    URL.revokeObjectURL(url);
  } else {
    alert('PDF baitų nėra. Įkelk PDF arba įkelk projektą su įterptu PDF.');
  }
};

async function renderPageAt(p){ const prev=currentPage; currentPage=p; await renderPage(); currentPage=prev; pageInfo.textContent=`${prev} / ${pageCount}`; }
function mergeCanvases(){ const out=document.createElement('canvas'); out.width=pdfCanvas.width; out.height=pdfCanvas.height; const ctx=out.getContext('2d'); ctx.drawImage(pdfCanvas,0,0); ctx.drawImage(annoCanvas,0,0); return out; }
function downloadURL(url,filename){ const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); }
function downloadBlob(content,filename,type){ const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); downloadURL(url,filename); URL.revokeObjectURL(url); }

// ===== Projektas su įterptu PDF (ir opcion. katalogu) =====
document.getElementById('saveProject').onclick = async () => {
  // Užtikrinam, kad turėtume baitus
  let data = state.pdfData;
  if (!data && pdfDoc?.getData) {
    try { const a = await pdfDoc.getData(); data = new Uint8Array(a); state.pdfData = data; } catch(e){}
  }
  const bytes = data?.length || 0;
  updateDiag();
  if (!bytes) { alert('PDF baitų nėra. Įkelk PDF failą ir bandyk dar kartą.'); return; }

  const project = {
    version: 7,
    meta: { savedAt: new Date().toISOString() },
    pdf: { name: state.pdfName || 'planas.pdf', dataBase64: uint8ToBase64(data) },
    state: { activeTool: state.activeTool, scalePxPerMeter: state.scalePxPerMeter, snap: document.getElementById('snap').checked, pages: state.pages }
  };
  if (includeCatalogInProject.checked) {
    project.catalog = CATALOG;
  }
  const jsonStr = JSON.stringify(project);
  downloadBlob(jsonStr, (state.pdfName ? state.pdfName.replace(/\.pdf$/i,'') : 'projektas') + '_samata.json', 'application/json');
};

document.getElementById('loadProject').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if(!f) return;
  let obj = null;
  try { obj = JSON.parse(await f.text()); } catch(err){ alert('Blogas projekto failas.'); return; }
  if (!obj || !obj.pdf || !obj.pdf.dataBase64) { alert('Projekte nerastas įterptas PDF.'); return; }
  // atstatom būseną
  state.activeTool = obj.state?.activeTool || null;
  state.scalePxPerMeter = obj.state?.scalePxPerMeter || null;
  document.getElementById('snap').checked = obj.state?.snap !== false;
  state.pages = obj.state?.pages || {};
  // katalogą, jei buvo įtrauktas
  if (Array.isArray(obj.catalog) && obj.catalog.length) {
    CATALOG = obj.catalog;
    renderCatalogList();
  }
  state.pdfName = obj.pdf?.name || 'planas.pdf';
  state.pdfData = base64ToUint8(obj.pdf.dataBase64);
  updateDiag();
  await openPdfArray(state.pdfData);
  updateTotals();
});

// ===== Katalogo redagavimo modalas + import/export =====
const catalogModal = document.getElementById('catalogModal');
const openCatalogBtn = document.getElementById('editCatalogBtn');
const closeCatalogBtn = document.getElementById('closeCatalog');
const addRowBtn = document.getElementById('addRow');
const saveCatalogBtn = document.getElementById('saveCatalog');
const resetCatalogBtn = document.getElementById('resetCatalog');
const catTableBody = document.getElementById('catTableBody');
const exportCatalogBtn = document.getElementById('exportCatalogBtn');
const importCatalogInput = document.getElementById('importCatalogInput');

openCatalogBtn.onclick = () => { openCatalogEditor(); };
closeCatalogBtn.onclick = () => { catalogModal.hidden = true; };
resetCatalogBtn.onclick = () => { CATALOG = [...DEFAULT_CATALOG]; renderCatalogEditor(); };
addRowBtn.onclick = () => { CATALOG.push({ id:'', label:'', unit:'vnt', price:0, icon:'●' }); renderCatalogEditor(true); };
saveCatalogBtn.onclick = () => {
  // iš lentelės jau būna CATALOG suatnaujintas per input eventus
  // Filtruojam tuščius ID/pavadinimus
  CATALOG = CATALOG.filter(it => (it.id || '').trim() && (it.label || '').trim());
  saveCatalogToLocal(CATALOG);
  renderCatalogList();
  catalogModal.hidden = true;
};

exportCatalogBtn.onclick = () => {
  const json = JSON.stringify({ version:1, catalog: CATALOG }, null, 2);
  downloadBlob(json, 'katalogas.json', 'application/json');
};
importCatalogInput.addEventListener('change', async (e) => {
  const f = e.target.files[0]; if(!f) return;
  try {
    const obj = JSON.parse(await f.text());
    if (Array.isArray(obj)) {
      CATALOG = obj;
    } else if (Array.isArray(obj.catalog)) {
      CATALOG = obj.catalog;
    } else {
      alert('Netinkamas katalogo JSON formatas.');
      return;
    }
    saveCatalogToLocal(CATALOG);
    renderCatalogList();
    alert('Katalogas įkeltas.');
  } catch(err) {
    alert('Nepavyko perskaityti katalogo JSON.');
  }
});

function openCatalogEditor() {
  renderCatalogEditor();
  catalogModal.hidden = false;
}
function renderCatalogEditor(focusLast=false) {
  catTableBody.innerHTML = '';
  CATALOG.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input value="${escapeHtml(item.id||'')}" data-idx="${idx}" data-key="id"></td>
      <td><input value="${escapeHtml(item.label||'')}" data-idx="${idx}" data-key="label"></td>
      <td><input value="${escapeHtml(item.unit||'vnt')}" data-idx="${idx}" data-key="unit"></td>
      <td><input type="number" step="0.01" value="${Number(item.price||0)}" data-idx="${idx}" data-key="price"></td>
      <td><input value="${escapeHtml(item.icon||'●')}" data-idx="${idx}" data-key="icon"></td>
      <td><button class="del" data-del="${idx}">Šalinti</button></td>
    `;
    catTableBody.appendChild(tr);
  });
  catTableBody.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', (e)=>{
      const i = Number(e.target.dataset.idx);
      const k = e.target.dataset.key;
      let v = e.target.value;
      if (k === 'price') v = Number(v||0);
      CATALOG[i][k] = v;
    });
  });
  catTableBody.querySelectorAll('button[data-del]').forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.dataset.del);
      CATALOG.splice(i,1);
      renderCatalogEditor();
    };
  });
  if (focusLast) {
    const last = catTableBody.querySelector('tr:last-child input');
    last && last.focus();
  }
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ===== Diagnozė =====
function updateDiag(){
  diagPdfName.textContent = state.pdfName || '—';
  const bytes = state.pdfData?.length || 0;
  diagPdfBytes.textContent = String(bytes);
  diagEmbedded.textContent = bytes > 0 ? 'Taip' : 'Ne';
}

// ===== Pagalbinės base64 funkcijos =====
function uint8ToBase64(u8){
  let binary=''; const chunk=0x8000;
  for(let i=0;i<u8.length;i+=chunk){ const sub=u8.subarray(i, i+chunk); binary += String.fromCharCode.apply(null, sub); }
  return btoa(binary);
}
function base64ToUint8(b64){
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i=0;i<len;i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Resize
window.addEventListener('resize', ()=>{ if(pdfDoc) renderPage(); });
