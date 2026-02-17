import { useState, useRef, useEffect, useCallback } from "react";

// ── Highlight colours ──────────────────────────────────────────────────────────
const HL_COLORS = [
  { id:"yellow", bg:"#FEF08A", border:"#EAB308", label:"Yellow" },
  { id:"green",  bg:"#BBF7D0", border:"#16A34A", label:"Green"  },
  { id:"blue",   bg:"#BFDBFE", border:"#2563EB", label:"Blue"   },
  { id:"pink",   bg:"#FBCFE8", border:"#DB2777", label:"Pink"   },
  { id:"orange", bg:"#FED7AA", border:"#EA580C", label:"Orange" },
  { id:"purple", bg:"#DDD6FE", border:"#7C3AED", label:"Purple" },
];

// ── Card colours ───────────────────────────────────────────────────────────────
const CARD_COLORS = [
  { bg:"#FFFBEB", border:"#F59E0B", text:"#78350F" },
  { bg:"#F0FDF4", border:"#16A34A", text:"#14532D" },
  { bg:"#FFF1F2", border:"#E11D48", text:"#881337" },
  { bg:"#EFF6FF", border:"#2563EB", text:"#1E3A8A" },
  { bg:"#F5F3FF", border:"#7C3AED", text:"#4C1D95" },
  { bg:"#FFF7ED", border:"#EA580C", text:"#7C2D12" },
  { bg:"#F0FDFA", border:"#0D9488", text:"#134E4A" },
  { bg:"#FDF4FF", border:"#A21CAF", text:"#701A75" },
];
const randomCard = () => CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)];

let _id = 0;
const uid = p => `${p}_${++_id}_${Date.now()}`;

let _ghost = null;
const getGhost = () => {
  if (!_ghost) {
    _ghost = document.createElement("div");
    _ghost.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;";
    document.body.appendChild(_ghost);
  }
  return _ghost;
};

// ── Segment paragraph text by highlight ranges ─────────────────────────────────
function segmentPara(text, hls = []) {
  if (!hls.length) return [{ type:"text", text }];
  const events = [];
  hls.forEach(h => {
    events.push({ pos:h.start, type:"open",  hl:h });
    events.push({ pos:h.end,   type:"close", hl:h });
  });
  events.sort((a,b) => a.pos-b.pos || (a.type==="close"?-1:1));
  const segs=[]; let cursor=0; const active=[];
  const flush = to => {
    if (to<=cursor) return;
    const t=text.slice(cursor,to); if(!t) return;
    segs.push(active.length?{type:"highlight",text:t,hl:active[active.length-1]}:{type:"text",text:t});
    cursor=to;
  };
  events.forEach(ev=>{
    flush(ev.pos);
    if(ev.type==="open") active.push(ev.hl);
    else { const i=active.findLastIndex(h=>h.id===ev.hl.id); if(i!==-1) active.splice(i,1); }
  });
  flush(text.length);
  return segs;
}

// ── Load external script ───────────────────────────────────────────────────────
function loadScript(src) {
  return new Promise((res,rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=rej;
    document.head.appendChild(s);
  });
}

// ── Parse uploaded file ────────────────────────────────────────────────────────
async function parseFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext==="txt") {
    const raw = await file.text();
    const lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const sections=[]; let cur=null;
    lines.forEach((line,i) => {
      const isH = line.length<80 && !/[.!?]$/.test(line) && i>0 && cur?.paragraphs.length>0;
      if (isH) { sections.push(cur); cur={id:`s${sections.length+1}`,heading:line,paragraphs:[]}; }
      else if (!cur) { cur={id:"s1",heading:"Content",paragraphs:[line]}; }
      else cur.paragraphs.push(line);
    });
    if (cur) sections.push(cur);
    return { title:file.name.replace(/\.[^.]+$/,""), sections:sections.filter(s=>s.paragraphs.length) };
  }

  if (ext==="docx") {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
    const ab=await file.arrayBuffer();
    const result=await window.mammoth.extractRawText({arrayBuffer:ab});
    const lines=result.value.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const sections=[]; let cur=null;
    lines.forEach((line,i) => {
      const isH=line.length<80&&!/[.!?]$/.test(line)&&i>0&&cur?.paragraphs.length>0;
      if(isH){sections.push(cur);cur={id:`s${sections.length+1}`,heading:line,paragraphs:[]};}
      else if(!cur){cur={id:"s1",heading:"Introduction",paragraphs:[line]};}
      else cur.paragraphs.push(line);
    });
    if(cur) sections.push(cur);
    return { title:file.name.replace(/\.[^.]+$/,""), sections:sections.filter(s=>s.paragraphs.length) };
  }

  if (ext==="pdf") {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const ab=await file.arrayBuffer();
    const pdf=await window.pdfjsLib.getDocument({data:ab}).promise;
    const sections=[];
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);
      const content=await page.getTextContent();
      const lineMap={};
      content.items.forEach(item=>{
        const y=Math.round(item.transform[5]);
        if(!lineMap[y]) lineMap[y]=[];
        lineMap[y].push(item.str);
      });
      const lines=Object.keys(lineMap).sort((a,b)=>b-a).map(y=>lineMap[y].join(" ").trim()).filter(Boolean);
      const paragraphs=[]; let buf="";
      lines.forEach(line=>{
        buf=buf?buf+" "+line:line;
        if(/[.!?]$/.test(line)||line.length<60){paragraphs.push(buf.trim());buf="";}
      });
      if(buf) paragraphs.push(buf.trim());
      if(paragraphs.length) sections.push({id:`s${p}`,heading:`Page ${p}`,paragraphs:paragraphs.filter(t=>t.length>10)});
    }
    return { title:file.name.replace(/\.[^.]+$/,""), sections };
  }

  throw new Error(`Unsupported file type: .${ext}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
export default function LiquidTextApp() {
  const [doc,          setDoc]          = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [loadError,    setLoadError]    = useState(null);
  const [draggingFile, setDraggingFile] = useState(false);

  // workspace state
  const [excerpts,     setExcerpts]     = useState([]);
  const [connections,  setConnections]  = useState([]);
  const [highlights,   setHighlights]   = useState({});
  const [draggingCard, setDraggingCard] = useState(null);
  const [connectMode,  setConnectMode]  = useState(false);
  const [connectSrc,   setConnectSrc]   = useState(null);
  const [activeExc,    setActiveExc]    = useState(null);
  const [notes,        setNotes]        = useState({});
  const [editingNote,  setEditingNote]  = useState(null);
  const [zoom,         setZoom]         = useState(1);
  const [panOffset,    setPanOffset]    = useState({x:0,y:0});
  const [isPanning,    setIsPanning]    = useState(false);
  const [panStart,     setPanStart]     = useState({x:0,y:0});
  const [flashPara,    setFlashPara]    = useState(null);
  const [toolbar,      setToolbar]      = useState(null);
  const [showHowTo,    setShowHowTo]    = useState(true);
  const [dropHL,       setDropHL]       = useState(false);
  const [dragPreview,  setDragPreview]  = useState(null);
  const [docDragOn,    setDocDragOn]    = useState(false);

  const docPanelRef    = useRef(null);
  const scrollableRef  = useRef(null);  // the actual scrolling div inside left panel
  const workspaceRef   = useRef(null);
  const fileInputRef   = useRef(null);
  const cardDragOff    = useRef({x:0,y:0});
  const docDragData    = useRef({text:"",paraId:null});

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file) return;
    if (!/\.(pdf|txt|docx)$/i.test(file.name)) { setLoadError("Please upload a PDF, TXT or DOCX file."); return; }
    setLoading(true); setLoadError(null);
    try {
      const parsed = await parseFile(file);
      setDoc(parsed);
      setExcerpts([]); setConnections([]); setHighlights({});
      setNotes({}); setPanOffset({x:0,y:0}); setZoom(1);
    } catch(e) { setLoadError("Could not read file: "+e.message); }
    finally { setLoading(false); }
  };

  // ── Text selection → show toolbar ─────────────────────────────────────────
  const handleDocMouseUp = useCallback(() => {
    setTimeout(()=>{
      const sel=window.getSelection();
      if(!sel||sel.isCollapsed){setToolbar(null);return;}
      const text=sel.toString().trim();
      if(text.length<2){setToolbar(null);return;}
      const range=sel.getRangeAt(0);
      const rect=range.getBoundingClientRect();
      let node=range.startContainer;
      while(node&&node.nodeType!==1) node=node.parentElement;
      while(node&&!node.dataset?.paraId) node=node.parentElement;
      const paraId=node?.dataset?.paraId??null;
      let start=0,end=0;
      if(paraId){
        const el=scrollableRef.current?.querySelector(`[data-para-id="${paraId}"]`);
        if(el){const t=el.innerText;start=t.indexOf(text);end=start+text.length;}
      }
      setToolbar({x:rect.left+rect.width/2,y:rect.top-8,text,paraId,start,end});
    },10);
  },[]);

  useEffect(()=>{
    const h=e=>{if(!e.target.closest(".hl-toolbar"))setToolbar(null);};
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  // ── Highlight ──────────────────────────────────────────────────────────────
  const applyHL = useCallback((colorId)=>{
    if(!toolbar?.paraId||toolbar.start<0) return;
    setHighlights(prev=>({...prev,[toolbar.paraId]:[...(prev[toolbar.paraId]||[]),{id:uid("hl"),start:toolbar.start,end:toolbar.end,colorId,text:toolbar.text}]}));
    setToolbar(null); window.getSelection()?.removeAllRanges();
  },[toolbar]);

  const removeHL = useCallback((paraId,hlId)=>{
    setHighlights(prev=>({...prev,[paraId]:(prev[paraId]||[]).filter(h=>h.id!==hlId)}));
  },[]);

  // ── Extract from toolbar ───────────────────────────────────────────────────
  const extractFromToolbar = useCallback(()=>{
    if(!toolbar) return;
    const ws=workspaceRef.current; if(!ws) return;
    const rect=ws.getBoundingClientRect();
    setExcerpts(prev=>[...prev,{id:uid("exc"),text:toolbar.text,paraId:toolbar.paraId,x:(Math.random()*Math.max(80,rect.width-280))/zoom,y:(Math.random()*Math.max(40,rect.height-180))/zoom+20,colorSet:randomCard(),width:240}]);
    setToolbar(null); window.getSelection()?.removeAllRanges();
  },[toolbar,zoom]);

  // ── Drag from doc ──────────────────────────────────────────────────────────
  const handleParaDragStart = useCallback((e,paraId)=>{
    const text=window.getSelection()?.toString().trim()||"";
    if(text.length<2){e.preventDefault();return;}
    docDragData.current={text,paraId};
    e.dataTransfer.effectAllowed="copy";
    e.dataTransfer.setData("text/plain",text);
    e.dataTransfer.setDragImage(getGhost(),0,0);
    setDocDragOn(true); setDragPreview({x:e.clientX,y:e.clientY,text}); setToolbar(null);
  },[]);

  const handleParaDragEnd = useCallback(()=>{setDocDragOn(false);setDragPreview(null);setDropHL(false);},[]);

  const handleWsDragOver = useCallback((e)=>{
    e.preventDefault(); e.dataTransfer.dropEffect="copy";
    setDropHL(true); setDragPreview(p=>p?{...p,x:e.clientX,y:e.clientY}:null);
  },[]);

  const handleWsDragLeave = useCallback((e)=>{
    if(!workspaceRef.current?.contains(e.relatedTarget)) setDropHL(false);
  },[]);

  const handleWsDrop = useCallback((e)=>{
    e.preventDefault();
    const{text,paraId}=docDragData.current;
    if(text){
      const ws=workspaceRef.current; if(!ws) return;
      const r=ws.getBoundingClientRect();
      setExcerpts(prev=>[...prev,{id:uid("exc"),text,paraId,x:(e.clientX-r.left-120)/zoom,y:(e.clientY-r.top-44)/zoom,colorSet:randomCard(),width:240}]);
    }
    setDocDragOn(false);setDropHL(false);setDragPreview(null);
    docDragData.current={text:"",paraId:null};
    window.getSelection()?.removeAllRanges();
  },[zoom]);

  useEffect(()=>{
    if(!docDragOn) return;
    const fn=e=>setDragPreview(p=>p?{...p,x:e.clientX,y:e.clientY}:null);
    window.addEventListener("dragover",fn);
    return()=>window.removeEventListener("dragover",fn);
  },[docDragOn]);

  // ── Card drag ──────────────────────────────────────────────────────────────
  const startCardDrag = useCallback((e,id)=>{
    if(connectMode) return;
    e.preventDefault(); e.stopPropagation();
    const r=e.currentTarget.getBoundingClientRect();
    cardDragOff.current={x:e.clientX-r.left,y:e.clientY-r.top};
    setDraggingCard(id); setActiveExc(id);
  },[connectMode]);

  useEffect(()=>{
    if(!draggingCard) return;
    const onMove=e=>{
      const ws=workspaceRef.current; if(!ws) return;
      const r=ws.getBoundingClientRect();
      setExcerpts(prev=>prev.map(exc=>exc.id===draggingCard?{...exc,x:(e.clientX-r.left-cardDragOff.current.x)/zoom,y:(e.clientY-r.top-cardDragOff.current.y)/zoom}:exc));
    };
    const onUp=()=>setDraggingCard(null);
    window.addEventListener("mousemove",onMove); window.addEventListener("mouseup",onUp);
    return()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
  },[draggingCard,zoom]);

  // ── Pan ────────────────────────────────────────────────────────────────────
  const startPan = useCallback((e)=>{
    if(draggingCard||connectMode||docDragOn) return;
    if(e.target!==workspaceRef.current&&!e.target.dataset.wsbg) return;
    setIsPanning(true); setPanStart({x:e.clientX-panOffset.x,y:e.clientY-panOffset.y});
  },[draggingCard,connectMode,docDragOn,panOffset]);

  useEffect(()=>{
    if(!isPanning) return;
    const onMove=e=>setPanOffset({x:e.clientX-panStart.x,y:e.clientY-panStart.y});
    const onUp=()=>setIsPanning(false);
    window.addEventListener("mousemove",onMove); window.addEventListener("mouseup",onUp);
    return()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
  },[isPanning,panStart]);

  // ── Connect ────────────────────────────────────────────────────────────────
  const handleCardClick = useCallback((e,id)=>{
    if(!connectMode) return; e.stopPropagation();
    if(!connectSrc){setConnectSrc(id);return;}
    if(connectSrc!==id){
      const exists=connections.some(c=>(c.from===connectSrc&&c.to===id)||(c.from===id&&c.to===connectSrc));
      if(!exists) setConnections(prev=>[...prev,{id:uid("conn"),from:connectSrc,to:id}]);
      setConnectSrc(null); setConnectMode(false);
    }
  },[connectMode,connectSrc,connections]);

  const deleteExc = useCallback((id)=>{
    setExcerpts(prev=>prev.filter(e=>e.id!==id));
    setConnections(prev=>prev.filter(c=>c.from!==id&&c.to!==id));
    if(activeExc===id) setActiveExc(null);
  },[activeExc]);

  // ── Scroll to source ───────────────────────────────────────────────────────
  const scrollToSource = useCallback((paraId)=>{
    if(!paraId) return;
    const attempt=(tries=0)=>{
      const panel=scrollableRef.current;
      if(!panel&&tries<10){setTimeout(()=>attempt(tries+1),60);return;}
      if(!panel) return;
      const el=panel.querySelector(`[data-para-id="${paraId}"]`);
      if(!el) return;
      // el.offsetTop is relative to its offsetParent inside the scrollable div
      // Collect offsets up to the scrollable container
      let offsetTop=0, node=el;
      while(node && node!==panel){
        offsetTop+=node.offsetTop;
        node=node.offsetParent;
      }
      const target=offsetTop - (panel.clientHeight/2) + (el.offsetHeight/2);
      panel.scrollTo({top:Math.max(0,target), behavior:"smooth"});
      // Reset flash so same-para re-click always re-fires
      setFlashPara(null);
      setTimeout(()=>{ setFlashPara(paraId); setTimeout(()=>setFlashPara(null),2400); }, 80);
    };
    setTimeout(()=>attempt(),80);
  },[]);

  // ── SVG helpers ────────────────────────────────────────────────────────────
  const getCenter = useCallback((id)=>{
    const exc=excerpts.find(e=>e.id===id); if(!exc) return{x:0,y:0};
    return{x:exc.x*zoom+panOffset.x+(exc.width*zoom)/2,y:exc.y*zoom+panOffset.y+44};
  },[excerpts,zoom,panOffset]);

  const curve=(a,b)=>{const dx=b.x-a.x;return`M${a.x} ${a.y} C${a.x+dx*0.45} ${a.y},${b.x-dx*0.45} ${b.y},${b.x} ${b.y}`;};
  const saveNote=(id,t)=>{setNotes(p=>({...p,[id]:t}));setEditingNote(null);};
  const totalHL=Object.values(highlights).reduce((a,b)=>a+b.length,0);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",width:"100vw",fontFamily:"'Segoe UI',system-ui,sans-serif",overflow:"hidden",background:"#F1F5F9"}}>

      {/* ── TOP HEADER BAR ───────────────────────────────────────────────── */}
      <div style={{height:54,background:"#fff",borderBottom:"2px solid #E2E8F0",display:"flex",alignItems:"center",padding:"0 20px",gap:14,boxShadow:"0 1px 6px rgba(0,0,0,0.07)",flexShrink:0,zIndex:200}}>
        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:9,flexShrink:0}}>
          <div style={{width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,#4F46E5,#7C3AED)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:"#fff",boxShadow:"0 2px 8px rgba(79,70,229,0.3)"}}>L</div>
          <span style={{fontSize:18,fontWeight:800,color:"#4F46E5",letterSpacing:"-0.02em"}}>LiquidNote</span>
        </div>

        <div style={{width:1,height:28,background:"#E2E8F0",flexShrink:0}}/>

        {/* Doc name */}
        <div style={{flex:1,fontSize:13,fontWeight:600,color:"#374151",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {doc ? `📄 ${doc.title}` : "No document loaded — upload one in the left panel"}
        </div>

        {/* Toolbar buttons — only when doc is loaded */}
        {doc && (
          <div style={{display:"flex",gap:7,alignItems:"center",flexShrink:0}}>
            <HBtn onClick={()=>{setConnectMode(v=>!v);setConnectSrc(null);}} active={connectMode} aColor={connectMode?"#DC2626":"#059669"}>
              {connectMode?"⚡ Connecting…":"🔗 Connect"}
            </HBtn>
            <HBtn onClick={()=>{setExcerpts([]);setConnections([]);setHighlights({});}} danger>🗑 Clear All</HBtn>
            <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:4}}>
              <ZBtn onClick={()=>setZoom(z=>Math.max(0.4,+(z-0.1).toFixed(1)))}>−</ZBtn>
              <span style={{fontSize:11,fontWeight:700,color:"#374151",minWidth:40,textAlign:"center",background:"#F3F4F6",borderRadius:5,padding:"3px 0"}}>{Math.round(zoom*100)}%</span>
              <ZBtn onClick={()=>setZoom(z=>Math.min(2,+(z+0.1).toFixed(1)))}>+</ZBtn>
            </div>
          </div>
        )}
      </div>

      {/* ── MAIN BODY: LEFT + RIGHT PANELS ───────────────────────────────── */}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* ════════════════════════════════════════════════════════════════
            LEFT PANEL — Upload + Document reader
        ════════════════════════════════════════════════════════════════ */}
        <div ref={docPanelRef} onMouseUp={handleDocMouseUp}
          style={{width:420,minWidth:340,maxWidth:500,background:"#fff",borderRight:"2px solid #E2E8F0",display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden",boxShadow:"2px 0 10px rgba(0,0,0,0.05)",zIndex:2}}>

          {/* ── Upload area (always visible at top of left panel) ─────── */}
          <div style={{borderBottom:"2px solid #E2E8F0",flexShrink:0}}>

            {/* Upload drop zone */}
            <div
              onClick={()=>fileInputRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setDraggingFile(true);}}
              onDragLeave={()=>setDraggingFile(false)}
              onDrop={e=>{e.preventDefault();setDraggingFile(false);handleFile(e.dataTransfer.files[0]);}}
              style={{
                margin:14,
                border:`2px dashed ${draggingFile?"#4F46E5":"#CBD5E1"}`,
                borderRadius:14,
                padding:"18px 16px",
                background:draggingFile?"#EEF2FF":"#F8FAFC",
                cursor:"pointer",
                transition:"all 0.2s",
                display:"flex",
                alignItems:"center",
                gap:14,
                boxShadow:draggingFile?"0 0 0 3px rgba(79,70,229,0.12)":"none",
              }}>

              {/* Icon */}
              <div style={{width:44,height:44,borderRadius:12,background:loading?"#EEF2FF":draggingFile?"#C7D2FE":"#EEF2FF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0,transition:"all 0.2s"}}>
                {loading?"⏳":draggingFile?"📌":"📂"}
              </div>

              <div style={{flex:1,minWidth:0}}>
                {loading ? (
                  <>
                    <div style={{fontSize:13,fontWeight:700,color:"#4F46E5",marginBottom:2}}>Reading document…</div>
                    <div style={{fontSize:11,color:"#94A3B8"}}>Please wait</div>
                  </>
                ) : doc ? (
                  <>
                    <div style={{fontSize:12,fontWeight:700,color:"#4F46E5",marginBottom:1}}>✅ {doc.title}</div>
                    <div style={{fontSize:11,color:"#94A3B8"}}>{doc.sections.length} sections loaded · Click to replace</div>
                  </>
                ) : (
                  <>
                    <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:2}}>{draggingFile?"Drop to upload!":"Upload a document"}</div>
                    <div style={{fontSize:11,color:"#94A3B8"}}>PDF · TXT · DOCX — click or drag & drop</div>
                  </>
                )}
              </div>

              {/* Format pills */}
              {!loading && !doc && (
                <div style={{display:"flex",flexDirection:"column",gap:3,flexShrink:0}}>
                  {["PDF","TXT","DOCX"].map(f=>(
                    <span key={f} style={{fontSize:9,fontWeight:800,color:"#6366F1",background:"#EEF2FF",borderRadius:4,padding:"2px 6px",letterSpacing:"0.06em"}}>{f}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Error */}
            {loadError && (
              <div style={{margin:"0 14px 12px",padding:"8px 12px",borderRadius:8,background:"#FEF2F2",border:"1px solid #FECACA",color:"#DC2626",fontSize:11,fontWeight:600}}>
                ⚠️ {loadError}
              </div>
            )}

            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.docx" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])} />
          </div>

          {/* ── Document content (scrollable) ─────────────────────────── */}
          <div ref={scrollableRef} style={{flex:1,overflowY:"auto"}}>
            {!doc ? (
              /* Empty state */
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",padding:32,textAlign:"center",color:"#94A3B8"}}>
                <div style={{fontSize:48,marginBottom:16,opacity:0.4}}>📄</div>
                <div style={{fontSize:15,fontWeight:700,color:"#CBD5E1",marginBottom:8}}>No document yet</div>
                <div style={{fontSize:12,lineHeight:1.6}}>Upload a PDF, TXT, or DOCX file above to start reading, highlighting, and building your research workspace.</div>
              </div>
            ) : (
              /* Document sections */
              <div style={{padding:"4px 22px 60px"}}>

                {/* Doc title */}
                <div style={{padding:"16px 0 12px",borderBottom:"1px solid #E2E8F0",marginBottom:4}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#94A3B8",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>📄 {doc.sections.length} sections</div>
                  <h1 style={{margin:0,fontSize:16,fontWeight:800,color:"#0F172A",lineHeight:1.3,letterSpacing:"-0.02em"}}>{doc.title}</h1>
                  <div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:"#F0FDF4",border:"1px solid #86EFAC",fontSize:11,color:"#166534",lineHeight:1.5}}>
                    🖊 <b>Select text</b> → highlight colour or extract to workspace &nbsp;|&nbsp; ✋ <b>Drag</b> selected text to the right panel
                  </div>
                </div>

                {doc.sections.map(section=>(
                  <div key={section.id} style={{marginTop:20}}>
                    <h2 style={{fontSize:10,fontWeight:800,color:"#4F46E5",letterSpacing:"0.1em",textTransform:"uppercase",margin:"0 0 10px",paddingBottom:6,borderBottom:"2px solid #EEF2FF"}}>{section.heading}</h2>
                    {section.paragraphs.map((para,pi)=>{
                      const paraId=`${section.id}_p${pi}`;
                      const isFlash=flashPara===paraId;
                      const segs=segmentPara(para,highlights[paraId]||[]);
                      return (
                        <p key={paraId} data-para-id={paraId} draggable
                          onDragStart={e=>handleParaDragStart(e,paraId)}
                          onDragEnd={handleParaDragEnd}
                          style={{fontSize:14,lineHeight:1.85,color:"#1E293B",margin:"0 0 11px",padding:isFlash?"10px 14px":"4px 0",borderRadius:8,background:isFlash?"#FEF08A":"transparent",borderLeft:isFlash?"5px solid #EAB308":"4px solid transparent",boxShadow:isFlash?"0 0 0 4px rgba(234,179,8,0.4), 0 4px 16px rgba(234,179,8,0.25)":"none",outline:isFlash?"none":"none",transition:isFlash?"none":"all 0.6s ease",cursor:"text",userSelect:"text"}}>
                          {segs.map((seg,si)=>{
                            if(seg.type==="text") return <span key={si}>{seg.text}</span>;
                            const c=HL_COLORS.find(c=>c.id===seg.hl.colorId)||HL_COLORS[0];
                            return(
                              <mark key={si} style={{background:c.bg,borderBottom:`2px solid ${c.border}`,borderRadius:3,padding:"1px 2px",cursor:"pointer"}}>
                                {seg.text}
                                <span onClick={e=>{e.preventDefault();e.stopPropagation();removeHL(paraId,seg.hl.id);}}
                                  style={{display:"inline-flex",alignItems:"center",justifyContent:"center",marginLeft:2,width:13,height:13,borderRadius:"50%",background:c.border,color:"#fff",fontSize:9,fontWeight:900,lineHeight:1,verticalAlign:"middle",cursor:"pointer"}}>×</span>
                              </mark>
                            );
                          })}
                        </p>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            RIGHT PANEL — Workspace canvas
        ════════════════════════════════════════════════════════════════ */}
        <div ref={workspaceRef} data-wsbg="1"
          style={{flex:1,position:"relative",overflow:"hidden",background:dropHL?"#EEF2FF":"#F1F5F9",border:dropHL?"3px dashed #6366F1":"3px solid transparent",cursor:isPanning?"grabbing":connectMode?"crosshair":"default",transition:"background 0.15s,border 0.15s",boxSizing:"border-box"}}
          onMouseDown={startPan}
          onDragOver={handleWsDragOver}
          onDragLeave={handleWsDragLeave}
          onDrop={handleWsDrop}>

          {/* Dot grid */}
          <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
            <defs>
              <pattern id="g" x={panOffset.x%26} y={panOffset.y%26} width="26" height="26" patternUnits="userSpaceOnUse">
                <circle cx="1.5" cy="1.5" r="1.5" fill={dropHL?"#A5B4FC":"#CBD5E1"}/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#g)"/>
          </svg>

          {/* Drop overlay */}
          {dropHL&&(
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",zIndex:200}}>
              <div style={{background:"rgba(79,70,229,0.92)",color:"#fff",padding:"18px 36px",borderRadius:20,fontSize:20,fontWeight:800,boxShadow:"0 8px 32px rgba(79,70,229,0.4)",display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:28}}>📌</span> Drop here to create a card
              </div>
            </div>
          )}

          {/* Empty workspace state */}
          {excerpts.length===0&&!dropHL&&(
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:52,marginBottom:14}}>{doc?"🗂️":"⬅️"}</div>
                <div style={{fontSize:20,fontWeight:800,color:"#4F46E5",marginBottom:8}}>
                  {doc?"Workspace is empty":"Upload a document first"}
                </div>
                <div style={{fontSize:14,color:"#64748B",maxWidth:320,lineHeight:1.7}}>
                  {doc
                    ?"Select text in the left panel, then highlight or drag it here"
                    :"Use the left panel to upload a PDF, TXT, or DOCX file"}
                </div>
              </div>
            </div>
          )}

          {/* SVG connections */}
          <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:1}}>
            {connections.map(conn=>{
              const from=getCenter(conn.from),to=getCenter(conn.to),mid={x:(from.x+to.x)/2,y:(from.y+to.y)/2};
              return(
                <g key={conn.id}>
                  <path d={curve(from,to)} fill="none" stroke="rgba(79,70,229,0.12)" strokeWidth={12}/>
                  <path d={curve(from,to)} fill="none" stroke="#4F46E5" strokeWidth={2.5} strokeDasharray="8 5" opacity={0.8}/>
                  <circle cx={from.x} cy={from.y} r={5.5} fill="#4F46E5"/>
                  <circle cx={to.x} cy={to.y} r={5.5} fill="#4F46E5"/>
                  <circle cx={mid.x} cy={mid.y} r={11} fill="#fff" stroke="#E11D48" strokeWidth={1.5} style={{cursor:"pointer",pointerEvents:"all"}} onClick={()=>setConnections(p=>p.filter(c=>c.id!==conn.id))}/>
                  <text x={mid.x} y={mid.y+5} textAnchor="middle" fill="#E11D48" fontSize={14} fontWeight="bold" style={{pointerEvents:"none"}}>×</text>
                </g>
              );
            })}
          </svg>

          {/* Excerpt cards */}
          {excerpts.map(exc=>{
            const isActive=activeExc===exc.id,isCS=connectSrc===exc.id,cs=exc.colorSet;
            return(
              <div key={exc.id}
                style={{position:"absolute",left:exc.x*zoom+panOffset.x,top:exc.y*zoom+panOffset.y,width:exc.width*zoom,zIndex:isActive?100:10,cursor:connectMode?"pointer":draggingCard===exc.id?"grabbing":"grab",userSelect:"none"}}
                onMouseDown={e=>startCardDrag(e,exc.id)}
                onClick={e=>handleCardClick(e,exc.id)}>
                <div style={{background:cs.bg,border:`2px solid ${isCS?"#DC2626":cs.border}`,borderRadius:12,padding:"0 0 10px",boxShadow:isCS?"0 0 0 4px rgba(220,38,38,0.2),0 8px 24px rgba(0,0,0,0.15)":isActive?"0 10px 32px rgba(0,0,0,0.18)":"0 2px 10px rgba(0,0,0,0.09)",transform:isActive?"scale(1.025) rotate(0.3deg)":"scale(1)",transition:draggingCard===exc.id?"none":"all 0.15s",position:"relative",overflow:"hidden"}}>
                  <div style={{height:5,background:cs.border}}/>
                  {/* Delete */}
                  <button onMouseDown={e=>{e.stopPropagation();e.preventDefault();}} onClick={e=>{e.stopPropagation();deleteExc(exc.id);}}
                    style={{position:"absolute",top:12,right:8,width:22,height:22,borderRadius:"50%",background:"#EF4444",border:"2px solid #fff",color:"#fff",fontSize:13,fontWeight:900,cursor:"pointer",display:isActive?"flex":"none",alignItems:"center",justifyContent:"center",zIndex:10,lineHeight:1,padding:0}}>×</button>
                  {/* Text */}
                  <p style={{margin:"0 12px",fontSize:Math.max(11,13*zoom),lineHeight:1.65,color:cs.text,fontFamily:"'Georgia',serif",fontStyle:"italic",fontWeight:500}}>
                    "{exc.text.length>200?exc.text.slice(0,200)+"…":exc.text}"
                  </p>
                  {/* Go to source */}
                  {exc.paraId&&(
                    <button onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();scrollToSource(exc.paraId);}}
                      style={{display:"flex",alignItems:"center",gap:6,margin:"10px 12px 0",width:"calc(100% - 24px)",padding:"7px 10px",borderRadius:8,background:"rgba(255,255,255,0.75)",border:`1.5px solid ${cs.border}`,cursor:"pointer",boxSizing:"border-box",transition:"all 0.15s"}}
                      onMouseEnter={e=>{e.currentTarget.style.background=cs.border;[...e.currentTarget.querySelectorAll(".sl")].forEach(el=>el.style.color="#fff");}}
                      onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.75)";[...e.currentTarget.querySelectorAll(".sl")].forEach(el=>el.style.color=cs.border);}}>
                      <span className="sl" style={{fontSize:14,color:cs.border,lineHeight:1,transition:"color 0.15s"}}>↩</span>
                      <span className="sl" style={{fontSize:11,fontWeight:700,color:cs.border,flex:1,textAlign:"left",transition:"color 0.15s"}}>Go to source — {exc.paraId.split("_")[0].toUpperCase()}</span>
                      <span className="sl" style={{fontSize:10,color:cs.border,opacity:0.6,transition:"color 0.15s"}}>§</span>
                    </button>
                  )}
                  {/* Note */}
                  {editingNote===exc.id?(
                    <textarea autoFocus defaultValue={notes[exc.id]||""} onBlur={e=>saveNote(exc.id,e.target.value)} onMouseDown={e=>e.stopPropagation()} placeholder="Add your note…"
                      style={{display:"block",width:"calc(100% - 24px)",margin:"8px 12px 0",padding:"5px 8px",borderRadius:6,border:`1.5px solid ${cs.border}`,background:"#fff",fontSize:11,color:cs.text,resize:"none",fontFamily:"sans-serif",boxSizing:"border-box",outline:"none"}} rows={2}/>
                  ):notes[exc.id]?(
                    <div onClick={e=>{e.stopPropagation();setEditingNote(exc.id);}} style={{margin:"8px 12px 0",padding:"6px 8px",borderRadius:6,background:"rgba(255,255,255,0.6)",border:`1px dashed ${cs.border}`,cursor:"text"}}>
                      <span style={{fontSize:10,color:cs.border,fontWeight:700}}>📝 NOTE</span>
                      <p style={{margin:"2px 0 0",fontSize:11,color:cs.text,fontStyle:"normal"}}>{notes[exc.id]}</p>
                    </div>
                  ):null}
                  <div style={{display:"flex",justifyContent:"flex-end",margin:"8px 12px 0"}}>
                    <button onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setEditingNote(exc.id);}} style={{fontSize:10,fontWeight:700,color:cs.border,background:"rgba(255,255,255,0.7)",border:`1.5px solid ${cs.border}`,borderRadius:5,cursor:"pointer",padding:"2px 8px"}}>+ note</button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Connect hint */}
          {connectMode&&(
            <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:connectSrc?"#FEF9C3":"#EEF2FF",border:`2px solid ${connectSrc?"#CA8A04":"#4F46E5"}`,borderRadius:24,padding:"10px 24px",fontSize:13,fontWeight:700,color:connectSrc?"#713F12":"#3730A3",boxShadow:"0 4px 20px rgba(0,0,0,0.1)",zIndex:1000,pointerEvents:"none",whiteSpace:"nowrap"}}>
              {connectSrc?"⚡ Click another card to connect!":"🔗 Click any card to start connecting"}
            </div>
          )}

          {/* Stats bar */}
          <div style={{position:"absolute",bottom:16,right:16,background:"#fff",border:"1px solid #E2E8F0",borderRadius:10,padding:"7px 14px",fontSize:12,fontWeight:600,boxShadow:"0 2px 6px rgba(0,0,0,0.07)",display:"flex",gap:12,alignItems:"center"}}>
            <span style={{color:"#4F46E5"}}>🗂 {excerpts.length} cards</span>
            <span style={{color:"#CBD5E1"}}>|</span>
            <span style={{color:"#059669"}}>🔗 {connections.length} links</span>
            <span style={{color:"#CBD5E1"}}>|</span>
            <span style={{color:"#EAB308"}}>🖊 {totalHL} highlights</span>
          </div>

          {/* How-to */}
          {showHowTo&&(
            <div style={{position:"absolute",bottom:16,left:16,background:"#fff",border:"1px solid #E2E8F0",borderRadius:12,padding:"10px 16px",fontSize:11,color:"#475569",lineHeight:1.9,boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                <div style={{fontSize:10,fontWeight:800,color:"#4F46E5",letterSpacing:"0.1em",textTransform:"uppercase"}}>How to use</div>
                <button onClick={()=>setShowHowTo(false)} style={{width:18,height:18,borderRadius:"50%",background:"#F1F5F9",border:"1px solid #E2E8F0",color:"#94A3B8",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,padding:0,marginLeft:12}}>×</button>
              </div>
              <div>📂 <b>Upload</b> PDF/TXT/DOCX in the left panel</div>
              <div>🖊 <b>Select text</b> → pick a highlight colour</div>
              <div>✂️ <b>Select text</b> → Extract to workspace</div>
              <div>✋ <b>Drag selected text</b> onto this canvas</div>
              <div>↩ Click <b>"Go to source"</b> on any card</div>
              <div>🔗 <b>Connect</b> → click two cards to link</div>
            </div>
          )}
        </div>
      </div>

      {/* ── HIGHLIGHT / EXTRACT TOOLBAR ──────────────────────────────────── */}
      {toolbar&&(
        <div className="hl-toolbar" style={{position:"fixed",left:Math.max(10,Math.min(toolbar.x-160,window.innerWidth-330)),top:Math.max(10,toolbar.y-80),zIndex:9999,background:"#1E293B",borderRadius:14,padding:"10px 14px",boxShadow:"0 12px 40px rgba(0,0,0,0.35)",display:"flex",flexDirection:"column",gap:8,minWidth:300}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:10,fontWeight:700,color:"#94A3B8",letterSpacing:"0.08em",textTransform:"uppercase",marginRight:2,whiteSpace:"nowrap"}}>Highlight:</span>
            {HL_COLORS.map(c=>(
              <button key={c.id} title={c.label} onClick={()=>applyHL(c.id)}
                style={{width:26,height:26,borderRadius:"50%",background:c.bg,border:`2.5px solid ${c.border}`,cursor:"pointer",flexShrink:0,transition:"transform 0.1s"}}
                onMouseEnter={e=>e.currentTarget.style.transform="scale(1.3)"}
                onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}/>
            ))}
          </div>
          <div style={{height:1,background:"rgba(255,255,255,0.1)"}}/>
          <div style={{display:"flex",gap:6}}>
            <button onClick={extractFromToolbar} style={{flex:1,padding:"6px 10px",borderRadius:8,background:"linear-gradient(135deg,#4F46E5,#7C3AED)",border:"none",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
              ✂️ Extract to workspace
            </button>
            <button onClick={()=>{setToolbar(null);window.getSelection()?.removeAllRanges();}} style={{padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"#94A3B8",fontSize:12,cursor:"pointer"}}>
              Cancel
            </button>
          </div>
          <div style={{position:"absolute",bottom:-7,left:"50%",transform:"translateX(-50%)",width:14,height:14,background:"#1E293B",clipPath:"polygon(0 0,100% 0,50% 100%)"}}/>
        </div>
      )}

      {/* ── DRAG PREVIEW ─────────────────────────────────────────────────── */}
      {dragPreview&&(
        <div style={{position:"fixed",left:dragPreview.x+14,top:dragPreview.y+14,width:220,background:"#fff",border:"2px solid #4F46E5",borderRadius:12,padding:"8px 12px",boxShadow:"0 12px 40px rgba(79,70,229,0.35)",pointerEvents:"none",zIndex:9999,transform:"rotate(-2deg)",opacity:0.95}}>
          <div style={{height:4,background:"#4F46E5",borderRadius:4,marginBottom:8,marginLeft:-4,marginRight:-4,marginTop:-4,borderTopLeftRadius:10,borderTopRightRadius:10}}/>
          <p style={{margin:0,fontSize:12,color:"#1E293B",fontStyle:"italic",fontFamily:"Georgia,serif",lineHeight:1.5}}>"{dragPreview.text.length>100?dragPreview.text.slice(0,100)+"…":dragPreview.text}"</p>
          <div style={{marginTop:6,fontSize:10,fontWeight:700,color:"#6366F1"}}>📌 Drop on workspace →</div>
        </div>
      )}
    </div>
  );
}

function HBtn({onClick,children,active,aColor,danger}){
  return <button onClick={onClick} style={{padding:"6px 12px",borderRadius:7,fontSize:12,fontWeight:700,border:`1.5px solid ${active?aColor:danger?"#FCA5A5":"#E2E8F0"}`,background:active?`${aColor}18`:danger?"#FEF2F2":"#F9FAFB",color:active?aColor:danger?"#DC2626":"#374151",cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap"}}>{children}</button>;
}
function ZBtn({onClick,children}){
  return <button onClick={onClick} style={{width:28,height:28,borderRadius:7,background:"#F3F4F6",border:"1.5px solid #E2E8F0",color:"#374151",fontSize:18,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,padding:0}}>{children}</button>;
}
