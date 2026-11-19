const DEFAULT_WATCHLIST = ["ADBL","CIT","GBIME","HIDCL","ICFC","KBL","MMF1","NBL","NLIC","PRVU","SBL","SFMF"];
const DB_KEY = "nepse_research_desk_v1";
const state = loadState();

function loadState(){
  const fallback={watchlist:DEFAULT_WATCHLIST.slice(),rows:[],transactions:[]};
  try {
    const saved=JSON.parse(localStorage.getItem(DB_KEY));
    if(!saved||typeof saved!=="object") return fallback;
    const s={...fallback,...saved};
    s.rows=Array.isArray(saved.rows)?saved.rows:[];
    s.transactions=Array.isArray(saved.transactions)?saved.transactions:[];
    // Migrate the known combined typo without inventing historical price data.
    if(Array.isArray(s.watchlist)&&s.watchlist.includes("ADBLCIT")){
      s.watchlist=[...new Set(s.watchlist.flatMap(x=>x==="ADBLCIT"?["ADBL","CIT"]:[x]))];
    }
    if(!Array.isArray(s.watchlist)||!s.watchlist.length) s.watchlist=DEFAULT_WATCHLIST.slice();
    return s;
  } catch { return fallback; }
}
function save(){localStorage.setItem(DB_KEY,JSON.stringify(state));render();}
function fmt(n){return n===null||n===undefined||n===""?"—":Number.isFinite(Number(n))?Number(n).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2}):"—";}
function money(n){return "NPR "+fmt(n);}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function symbolRows(symbol){return state.rows.filter(r=>r.symbol===symbol).sort((a,b)=>a.date.localeCompare(b.date));}
function setTab(name){
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
  document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id===name));
  if(name==="portfolio") renderPortfolio();
  if(name==="research") renderResearch();
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));

function render(){
  document.getElementById("watchCount").textContent=state.watchlist.length;
  document.getElementById("rowCount").textContent=state.rows.length.toLocaleString();
  const today=isoToday(),eligibleDates=state.rows.filter(r=>r.date<=today).map(r=>r.date).sort();
  const futureCount=state.rows.filter(r=>r.date>today).length;
  document.getElementById("latestDate").textContent=eligibleDates.at(-1)||"—";
  document.getElementById("freshness").textContent=eligibleDates.length?`Eligible imported date (not live)${futureCount?` · ${futureCount} future rows excluded` : ""}`:"No eligible data imported";
  document.getElementById("symbolsText").textContent=state.watchlist.join(", ");
  const list=document.getElementById("watchlist");list.innerHTML="";
  state.watchlist.forEach(sym=>{
    const rows=symbolRows(sym).filter(r=>r.date<=isoToday()),last=rows.at(-1),prev=rows.at(-2);
    const delta=last&&prev?((last.close-prev.close)/prev.close*100):null;
    const el=document.createElement("div");el.className="stock";
    el.innerHTML=`<div><span class="symbol">${esc(sym)}</span><small>${rows.length} daily records · ${last?.date||"no data"}</small></div><div class="price">${last?fmt(last.close):"—"}<em>${delta===null?"Awaiting history":`${delta>=0?"+":""}${fmt(delta)}% vs prior row`}</em></div>`;
    list.appendChild(el);
  });
  const sel=document.getElementById("symbolSelect"),old=sel.value;
  sel.innerHTML=state.watchlist.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
  if(state.watchlist.includes(old))sel.value=old;
  ["txSymbol","openSymbol"].forEach(id=>{
    const el=document.getElementById(id),prev=el.value;
    el.innerHTML=state.watchlist.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
    if(state.watchlist.includes(prev))el.value=prev;
  });
  renderResearch();
  renderPortfolio();
}
function ema(values,period){
  if(values.length<period)return null;
  const k=2/(period+1);let v=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for(let i=period;i<values.length;i++)v=values[i]*k+v*(1-k);
  return v;
}
function emaSeries(values,period){
  const out=Array(values.length).fill(null);if(values.length<period)return out;
  const k=2/(period+1);let v=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  out[period-1]=v;
  for(let i=period;i<values.length;i++){v=values[i]*k+v*(1-k);out[i]=v;}
  return out;
}
// Wilder RSI series. Values are aligned to the input close array; warm-up slots are null.
function rsiSeries(values,period=14){
  const out=Array(values.length).fill(null);if(values.length<=period)return out;
  let gains=0,losses=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>0)gains+=d;else losses-=d;}
  let ag=gains/period,al=losses/period;
  out[period]=ag===0&&al===0?50:al===0?100:ag===0?0:100-100/(1+ag/al);
  for(let i=period+1;i<values.length;i++){
    const d=values[i]-values[i-1];ag=(ag*(period-1)+Math.max(d,0))/period;al=(al*(period-1)+Math.max(-d,0))/period;
    out[i]=ag===0&&al===0?50:al===0?100:ag===0?0:100-100/(1+ag/al);
  }
  return out;
}
function rsi(values,period=14){const a=rsiSeries(values,period);return a.at(-1)??null;}
function atrSeries(rows,period=14){
  const tr=Array(rows.length).fill(null),out=Array(rows.length).fill(null);
  for(let i=1;i<rows.length;i++){
    const prev=Number(rows[i-1].close),r=rows[i];
    tr[i]=Math.max(Number(r.high)-Number(r.low),Math.abs(Number(r.high)-prev),Math.abs(Number(r.low)-prev));
  }
  if(rows.length<=period)return out;
  const initial=tr.slice(1,period+1).reduce((a,b)=>a+b,0)/period;out[period]=initial;
  for(let i=period+1;i<rows.length;i++)out[i]=(out[i-1]*(period-1)+tr[i])/period;
  return out;
}
function signalState(rsiValues,signalValues){
  const n=rsiValues.length-1;if(n<1||rsiValues[n]==null||signalValues[n]==null||rsiValues[n-1]==null||signalValues[n-1]==null)return {cross:null,aboveSignal:null,above50:null,combined:null,rsi:null,signal:null};
  const crossUp=rsiValues[n-1]<=signalValues[n-1]&&rsiValues[n]>signalValues[n];
  const crossDown=rsiValues[n-1]>=signalValues[n-1]&&rsiValues[n]<signalValues[n];
  const above50=rsiValues[n]>50;
  return {cross:crossUp?'Bullish crossover':crossDown?'Bearish crossover':'No new crossover',aboveSignal:rsiValues[n]>signalValues[n],above50,combined:crossUp&&above50?'Bullish confirmation':crossDown&&!above50?'Bearish confirmation':'No combined confirmation',rsi:rsiValues[n],signal:signalValues[n]};
}
function aggregateBars(rows,period){
  const map=new Map();
  rows.forEach(r=>{
    const d=new Date(r.date+'T12:00:00Z');let key;
    if(period==='weekly'){
      const sun=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-d.getUTCDay()));
      key=sun.toISOString().slice(0,10);
    }else key=r.date.slice(0,7);
    let b=map.get(key);if(!b){b={period:key,date:r.date,open:Number(r.open),high:Number(r.high),low:Number(r.low),close:Number(r.close),volume:Number(r.volume)};map.set(key,b);}
    else{b.high=Math.max(b.high,Number(r.high));b.low=Math.min(b.low,Number(r.low));b.close=Number(r.close);b.volume+=Number(r.volume);b.date=r.date;}
  });
  return [...map.values()].sort((a,b)=>a.period.localeCompare(b.period));
}
function timeframeAnalysis(rows,period){
  const bars=period==='daily'?rows:aggregateBars(rows,period),closes=bars.map(r=>Number(r.close));
  const rs=rsiSeries(closes,14);
  // EMA must begin at the first valid RSI, not at artificial zero warm-up values.
  const first=rs.findIndex(v=>v!==null);
  if(first<0)return {bars,rs,es:[],state:{cross:null,aboveSignal:null,above50:null,combined:null,rsi:null,signal:null},provisional:false,period};
  const validRsi=rs.slice(first),validEma=emaSeries(validRsi,9),aligned=Array(first).fill(null).concat(validEma);
  const st=signalState(rs,aligned);
  const today=isoToday();let provisional=false;
  if(bars.length){
    const last=bars.at(-1),dt=new Date(last.date+'T12:00:00Z');
    if(period==='weekly'){
      const dow=dt.getUTCDay();provisional=dow!==4||last.date>=today;
    }else if(period==='monthly'){
      const end=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth()+1,0));provisional=end.toISOString().slice(0,10)>today;
    }
  }
  return {bars,rs,es:aligned,state:st,provisional,period};
}
function macd(values){const e12=ema(values,12),e26=ema(values,26);return e12===null||e26===null?null:e12-e26;}
function renderResearch(){
  const sym=document.getElementById("symbolSelect").value||state.watchlist[0];
  const today=isoToday();
  const allRows=symbolRows(sym),futureRows=allRows.filter(r=>r.date>today);
  const rows=allRows.filter(r=>r.date<=today),closes=rows.map(r=>Number(r.close)),volumes=rows.map(r=>Number(r.volume));
  const card=document.getElementById("researchCard");drawChart(closes,sym);
  document.getElementById("chartCaption").textContent=rows.length?`${rows.length} eligible imported observations · latest ${rows.at(-1).date} · not a live quote`:"No eligible history available.";
  if(rows.length<50){const rc=document.getElementById("rsiChart");rc.getContext("2d").clearRect(0,0,rc.width,rc.height);card.innerHTML=`<strong>${esc(sym)}</strong><p class="muted">Only ${rows.length} non-future observations are eligible. At least 50 daily closing prices are required for this initial trend screen; 200+ are preferable for long-term analysis.</p>${futureRows.length?`<p class="muted">${futureRows.length} future-dated rows excluded (latest ${futureRows.at(-1).date}). Verify their source/date before use.</p>`:""}`;document.getElementById("timeframeSummary").innerHTML="Insufficient data.";document.getElementById("rsiCaption").textContent="At least 23 daily closes are needed for RSI(14) plus its EMA(9) signal line.";document.getElementById("signalHistory").textContent="No signal history.";return;}
  const e20=ema(closes,20),e50=ema(closes,50),e200=ema(closes,200),rsiValues=rsiSeries(closes,14),rsiEma=(()=>{const first=rsiValues.findIndex(v=>v!==null);return first<0?Array(rows.length).fill(null):Array(first).fill(null).concat(emaSeries(rsiValues.slice(first),9));})();
  const rv=rsiValues.at(-1),rsiSig=rsiEma.at(-1),atr=atrSeries(rows,14).at(-1),m=macd(closes);
  const avgVol=volumes.slice(-21,-1).reduce((a,b)=>a+b,0)/Math.max(1,volumes.slice(-21,-1).length);
  const vr=avgVol?volumes.at(-1)/avgVol:null,trend=e20>e50&&e50>e200;
  const daily=signalState(rsiValues,rsiEma),weekly=timeframeAnalysis(rows,"weekly"),monthly=timeframeAnalysis(rows,"monthly");
  card.innerHTML=`<strong>${esc(sym)} · Technical screen</strong>
  <div class="score-row"><span>Latest eligible close (${rows.at(-1).date})</span><b>${fmt(closes.at(-1))}</b></div>
  <div class="score-row"><span>EMA 20 / 50 / 200</span><b>${fmt(e20)} / ${fmt(e50)} / ${e200?fmt(e200):"insufficient"}</b></div>
  <div class="score-row"><span>RSI(14) / EMA(9) of RSI</span><b>${fmt(rv)} / ${fmt(rsiSig)}</b></div>
  <div class="score-row"><span>ATR(14)</span><b>${fmt(atr)} (${atr&&closes.at(-1)?fmt(atr/closes.at(-1)*100)+"% of close":"—"})</b></div>
  <div class="score-row"><span>New RSI/EMA crossover</span><b>${esc(daily.cross||"Insufficient")}</b></div>
  <div class="score-row"><span>RSI vs EMA(9) now</span><b>${daily.aboveSignal===null?"Insufficient":daily.aboveSignal?"Above":"Below"}</b></div>
  <div class="score-row"><span>RSI above 50</span><b>${daily.above50===null?"Insufficient":daily.above50?"Yes":"No"}</b></div>
  <div class="score-row"><span>Combined daily state</span><b>${esc(daily.combined||"Insufficient")}</b></div>
  <div class="score-row"><span>MACD line (12,26)</span><b>${fmt(m)}</b></div>
  <div class="score-row"><span>Latest / 20-day avg volume</span><b>${vr===null?"—":fmt(vr)+"x"}</b></div>
  <p class="muted">${trend?"Bullish EMA alignment detected.":"Bullish EMA alignment not detected."} ${vr!==null&&vr>=1.5?"Volume is at least 1.5x its recent average.":""}</p>
  ${futureRows.length?`<p class="muted small">Warning: ${futureRows.length} future-dated row(s) excluded; latest excluded date ${futureRows.at(-1).date}. Verify before importing or using them.</p>`:""}
  <p class="muted small">RSI uses Wilder smoothing; RSI signal uses EMA(9) of RSI. A crossover is reported only when the latest eligible observation crosses the signal line relative to the previous observation.</p>`;
  drawRsiChart(rows,rsiValues,rsiEma);
  const history=[];for(let i=1;i<rsiValues.length;i++)if(rsiValues[i-1]!=null&&rsiEma[i-1]!=null&&rsiValues[i]!=null&&rsiEma[i]!=null){if(rsiValues[i-1]<=rsiEma[i-1]&&rsiValues[i]>rsiEma[i])history.push({date:rows[i].date,type:"Bullish cross"});else if(rsiValues[i-1]>=rsiEma[i-1]&&rsiValues[i]<rsiEma[i])history.push({date:rows[i].date,type:"Bearish cross"});}
  document.getElementById("signalHistory").innerHTML=history.length?`<strong>Recent historical crossovers</strong><br>${history.slice(-12).reverse().map(x=>`${esc(x.date)} — ${esc(x.type)}`).join("<br>")}`:"No RSI/EMA crossovers found in eligible history.";
  document.getElementById("rsiCaption").textContent=`Latest RSI ${fmt(rv)} · RSI EMA(9) ${fmt(rsiSig)} · 30 / 50 / 70 reference levels · ${history.length} historical crossovers`;
  const tf=[{label:"Daily",a:daily,provisional:false,count:rows.length},{label:"Weekly",a:weekly.state,provisional:weekly.provisional,count:weekly.bars.length},{label:"Monthly",a:monthly.state,provisional:monthly.provisional,count:monthly.bars.length}];
  const available=tf.filter(x=>x.a.above50!==null),bull=available.filter(x=>x.a.above50).length,bear=available.length-bull;
  const alignment=available.length<2?"Insufficient timeframe coverage":bull===available.length?`Bullish momentum agreement across ${available.length} available timeframe(s)`:bear===available.length?`Bearish momentum agreement across ${available.length} available timeframe(s)`:"Mixed momentum across timeframes";
  document.getElementById("timeframeSummary").innerHTML=`<div class="score-row"><span><strong>Alignment</strong></span><b>${esc(alignment)}</b></div>`+tf.map(x=>`<div class="score-row"><span><strong>${x.label}</strong><br><small>${x.count} ${x.label.toLowerCase()} bars${x.provisional?" · latest period provisional":""}</small></span><b>${esc(x.a.cross||"Insufficient")}<br><small>RSI ${fmt(x.a.rsi)} · ${x.a.above50===null?"50-level unavailable":x.a.above50?"Above 50":"Below 50"}</small></b></div>`).join("");
}
function drawRsiChart(rows,rs,es){
  const c=document.getElementById("rsiChart"),ctx=c.getContext("2d"),w=c.width=Math.max(320,c.clientWidth)*devicePixelRatio,h=c.height=220*devicePixelRatio,pad=22*devicePixelRatio;
  ctx.clearRect(0,0,w,h);ctx.font=`${10*devicePixelRatio}px system-ui`;const left=pad,right=w-pad,top=pad,bottom=h-pad;
  const y=v=>bottom-(v/100)*(bottom-top);
  [30,50,70].forEach(level=>{ctx.strokeStyle=level===50?"#8297aa":"#40566d";ctx.setLineDash(level===50?[]:[4*devicePixelRatio,4*devicePixelRatio]);ctx.beginPath();ctx.moveTo(left,y(level));ctx.lineTo(right,y(level));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#9db0c3";ctx.fillText(String(level),2,y(level)+3*devicePixelRatio);});
  const start=Math.max(0,rows.length-120),n=rows.length-start;if(n<2)return;const x=i=>left+(i/(n-1))*(right-left);
  [[rs,"#69b7ff"],[es,"#f4bd63"]].forEach(([arr,color])=>{ctx.strokeStyle=color;ctx.lineWidth=2*devicePixelRatio;ctx.beginPath();let begun=false;for(let j=start;j<rows.length;j++){if(arr[j]==null)continue;const px=x(j-start),py=y(arr[j]);if(!begun){ctx.moveTo(px,py);begun=true;}else ctx.lineTo(px,py);}ctx.stroke();});
  for(let j=Math.max(start+1,1);j<rows.length;j++)if(rs[j-1]!=null&&es[j-1]!=null&&rs[j]!=null&&es[j]!=null){const up=rs[j-1]<=es[j-1]&&rs[j]>es[j],down=rs[j-1]>=es[j-1]&&rs[j]<es[j];if(up||down){ctx.fillStyle=up?"#55d6a0":"#ff8585";ctx.beginPath();ctx.arc(x(j-start),y(rs[j]),4*devicePixelRatio,0,Math.PI*2);ctx.fill();}}
  ctx.fillStyle="#69b7ff";ctx.fillText("RSI14",left,10*devicePixelRatio);ctx.fillStyle="#f4bd63";ctx.fillText("EMA9(RSI)",left+55*devicePixelRatio,10*devicePixelRatio);
}
document.getElementById("symbolSelect").addEventListener("change",renderResearch);
function drawChart(values){
  const c=document.getElementById("priceChart"),ctx=c.getContext("2d"),w=c.width=c.clientWidth*devicePixelRatio,h=c.height=190*devicePixelRatio;
  ctx.clearRect(0,0,w,h);if(values.length<2)return;
  const v=values.slice(-90),min=Math.min(...v),max=Math.max(...v),pad=18*devicePixelRatio;
  ctx.strokeStyle="#35516d";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad,pad);ctx.lineTo(pad,h-pad);ctx.lineTo(w-pad,h-pad);ctx.stroke();
  ctx.strokeStyle="#69b7ff";ctx.lineWidth=2*devicePixelRatio;ctx.beginPath();
  v.forEach((x,i)=>{const px=pad+i/(v.length-1)*(w-2*pad),py=h-pad-(x-min)/(max-min||1)*(h-2*pad);i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.stroke();
}
function parseCSV(text){
  const lines=text.replace(/^\uFEFF/,"").trim().split(/\r?\n/),headers=lines.shift().split(",").map(x=>x.trim().toLowerCase());
  const required=["date","symbol","open","high","low","close","volume"],missing=required.filter(x=>!headers.includes(x));
  if(missing.length)throw Error("Missing columns: "+missing.join(", "));
  return lines.filter(Boolean).map((line,i)=>{
    const cols=line.split(","),o={};headers.forEach((h,j)=>o[h]=(cols[j]||"").trim());
    const r={date:o.date,symbol:o.symbol.toUpperCase(),open:Number(o.open),high:Number(o.high),low:Number(o.low),close:Number(o.close),volume:Number(o.volume),source:o.source||"User-imported CSV"};
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!state.watchlist.includes(r.symbol)||![r.open,r.high,r.low,r.close,r.volume].every(Number.isFinite)||r.close<=0||r.volume<0)throw Error(`Invalid row ${i+2}: check date, watchlist symbol and numeric OHLCV values.`);
    if(r.high<Math.max(r.open,r.close,r.low)||r.low>Math.min(r.open,r.close,r.high))throw Error(`Invalid high/low on row ${i+2}.`);
    return r;
  });
}
document.getElementById("importBtn").addEventListener("click",async()=>{
  const f=document.getElementById("csvFile").files[0],status=document.getElementById("importStatus");
  if(!f){status.textContent="Choose a CSV file first.";return;}
  try{const incoming=parseCSV(await f.text()),map=new Map(state.rows.map(r=>[r.symbol+"|"+r.date,r]));
    incoming.forEach(r=>map.set(r.symbol+"|"+r.date,r));
    state.rows=Array.from(map.values()).sort((a,b)=>a.date.localeCompare(b.date)||a.symbol.localeCompare(b.symbol));
    save();status.textContent=`Imported ${incoming.length} rows. Duplicate symbol/date rows were replaced.`;
  }catch(e){status.textContent="Import failed: "+e.message;}
});

// Portfolio accounting: chronologically replay opening balances, buys and sells using moving weighted-average cost.
function replayLedger(){
  const txs=[...state.transactions].sort((a,b)=>a.date.localeCompare(b.date)||(a.createdAt||0)-(b.createdAt||0));
  const holdings={},realisedBySymbol={};
  for(const t of txs){
    const h=holdings[t.symbol]||(holdings[t.symbol]={qty:0,cost:0,wacc:0});
    realisedBySymbol[t.symbol]??=0;
    const qty=Number(t.quantity),price=Number(t.price),charges=Number(t.charges||0),tax=Number(t.tax||0);
    if(t.type==="OPENING"||t.type==="BUY"){
      const addCost=qty*price+charges+tax;
      h.qty+=qty;h.cost+=addCost;h.wacc=h.qty?h.cost/h.qty:0;
    }else if(t.type==="SELL"){
      const costSold=qty*h.wacc,netProceeds=qty*price-charges-tax;
      h.qty-=qty;h.cost-=costSold;
      if(Math.abs(h.qty)<1e-8){h.qty=0;h.cost=0;h.wacc=0;}else h.wacc=h.cost/h.qty;
      realisedBySymbol[t.symbol]+=netProceeds-costSold;
    }
  }
  return {holdings,realisedBySymbol};
}
function latestPrice(symbol){
  const rows=symbolRows(symbol).filter(r=>r.date<=isoToday());return rows.length?{price:Number(rows.at(-1).close),date:rows.at(-1).date}:null;
}
function renderPortfolio(){
  const {holdings,realisedBySymbol}=replayLedger();
  const symbols=[...new Set([...Object.keys(holdings),...Object.keys(realisedBySymbol)])];
  let totalCost=0,marketValue=0,hasAnyCMP=false,unrealised=0,realised=Object.values(realisedBySymbol).reduce((a,b)=>a+b,0),openCount=0;
  let newestPriceDate="";
  const body=document.getElementById("holdingsBody");body.innerHTML="";
  symbols.sort().forEach(sym=>{
    const h=holdings[sym];if(!h||h.qty<=0)return;
    openCount++;totalCost+=h.cost;
    const q=latestPrice(sym),mv=q?h.qty*q.price:null,up=q?mv-h.cost:null;
    if(q){hasAnyCMP=true;marketValue+=mv;unrealised+=up;if(q.date>newestPriceDate)newestPriceDate=q.date;}
    const tr=document.createElement("tr");
    tr.innerHTML=`<td><strong>${esc(sym)}</strong></td><td>${fmt(h.qty)}</td><td>${fmt(h.wacc)}</td><td>${q?fmt(q.price):"—"}</td><td>${money(h.cost)}</td><td>${q?money(mv):"—"}</td><td class="${up===null?"":up>=0?"positive":"negative"}">${up===null?"—":money(up)}</td>`;
    body.appendChild(tr);
  });
  if(!body.children.length)body.innerHTML='<tr><td colspan="7" class="muted">No holdings entered yet.</td></tr>';
  const currentSymbols=symbols.filter(s=>holdings[s]?.qty>0);
  const unrealKnown=currentSymbols.length===0||currentSymbols.every(s=>latestPrice(s));
  const combined=unrealKnown?realised+unrealised:null;
  document.getElementById("totalCost").textContent=money(totalCost);
  document.getElementById("marketValue").textContent=unrealKnown?money(marketValue):"Partial / unavailable";
  document.getElementById("marketValueDate").textContent=currentSymbols.length?(unrealKnown?`CMP through ${newestPriceDate}`:"Import prices for every holding"):"No open holdings";
  document.getElementById("unrealisedPL").textContent=unrealKnown?money(unrealised):"—";
  document.getElementById("unrealisedPL").className=unrealKnown?(unrealised>=0?"positive":"negative"):"";
  document.getElementById("unrealisedPct").textContent=unrealKnown&&totalCost?`${fmt(unrealised/totalCost*100)}% return on current cost`:"Awaiting complete CMP data";
  document.getElementById("realisedPL").textContent=money(realised);
  document.getElementById("realisedPL").className=realised>=0?"positive":"negative";
  document.getElementById("combinedPL").textContent=combined===null?"—":money(combined);
  document.getElementById("combinedPL").className=combined===null?"":combined>=0?"positive":"negative";
  document.getElementById("openPositions").textContent=openCount;
  renderTransactions();
}
function ledgerError(entries){
  const sorted=[...entries].sort((a,b)=>a.date.localeCompare(b.date)||(a.createdAt||0)-(b.createdAt||0));
  const qtyBySymbol={};
  for(const t of sorted){
    qtyBySymbol[t.symbol]??=0;
    if(t.type==="OPENING"||t.type==="BUY")qtyBySymbol[t.symbol]+=Number(t.quantity);
    if(t.type==="SELL"){
      if(Number(t.quantity)>qtyBySymbol[t.symbol]+1e-8)return `Insufficient shares for this sale on ${t.date}. Available: ${fmt(qtyBySymbol[t.symbol])}.`;
      qtyBySymbol[t.symbol]-=Number(t.quantity);
    }
  }
  return null;
}
function validateCandidate(candidate){return ledgerError([...state.transactions,candidate]);}
function renderTransactions(){
  const body=document.getElementById("transactionsBody");body.innerHTML="";
  const sorted=[...state.transactions].sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||0)-(a.createdAt||0));
  if(!sorted.length){body.innerHTML='<tr><td colspan="8" class="muted">No transactions yet.</td></tr>';return;}
  sorted.forEach(t=>{
    const label=t.type==="OPENING"?"Opening":t.type;
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${esc(t.date)}</td><td>${esc(t.symbol)}</td><td>${label}</td><td>${fmt(t.quantity)}</td><td>${fmt(t.price)}</td><td>${fmt(t.charges||0)}</td><td>${fmt(t.tax||0)}</td><td><button class="danger small-btn" data-delete-tx="${esc(t.id)}" type="button">Delete</button></td>`;
    body.appendChild(tr);
  });
}
function isoToday(){return new Date().toLocaleDateString("en-CA");}
document.getElementById("txDate").value=isoToday();
document.getElementById("openDate").value=isoToday();
document.getElementById("transactionForm").addEventListener("submit",e=>{
  e.preventDefault();
  const tx={id:"tx_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),createdAt:Date.now(),
    date:document.getElementById("txDate").value,symbol:document.getElementById("txSymbol").value,
    type:document.getElementById("txType").value,quantity:Number(document.getElementById("txQty").value),
    price:Number(document.getElementById("txPrice").value),charges:Number(document.getElementById("txCharges").value||0),
    tax:Number(document.getElementById("txTax").value||0),notes:document.getElementById("txNotes").value.trim()};
  const status=document.getElementById("txStatus");
  if(!tx.date||!Number.isInteger(tx.quantity)||tx.quantity<=0||!Number.isFinite(tx.price)||tx.price<=0||tx.charges<0||tx.tax<0){status.textContent="Check date, whole-share quantity, price, charges and tax.";return;}
  const err=validateCandidate(tx);if(err){status.textContent=err;return;}
  state.transactions.push(tx);save();e.target.reset();document.getElementById("txDate").value=isoToday();
  document.getElementById("txCharges").value="0";document.getElementById("txTax").value="0";
  status.textContent="Transaction saved. Weighted-average cost and P/L recalculated.";
});
document.getElementById("openingForm").addEventListener("submit",e=>{
  e.preventDefault();
  const tx={id:"op_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),createdAt:Date.now(),
    date:document.getElementById("openDate").value,symbol:document.getElementById("openSymbol").value,
    type:"OPENING",quantity:Number(document.getElementById("openQty").value),price:Number(document.getElementById("openWacc").value),
    charges:0,tax:0,notes:"Manual opening balance"};
  const status=document.getElementById("openStatus");
  if(!tx.date||!Number.isInteger(tx.quantity)||tx.quantity<=0||!Number.isFinite(tx.price)||tx.price<=0){status.textContent="Enter a valid date, whole-share quantity and WACC.";return;}
  if(state.transactions.some(t=>t.symbol===tx.symbol)){status.textContent="This symbol already has ledger entries. Add a normal buy/sell transaction instead; do not create a second opening balance.";return;}
  const err=validateCandidate(tx);if(err){status.textContent=err;return;}
  state.transactions.push(tx);save();e.target.reset();document.getElementById("openDate").value=isoToday();
  status.textContent="Opening holding saved. Manual WACC is now the opening cost basis.";
});
document.getElementById("transactionsBody").addEventListener("click",e=>{
  const btn=e.target.closest("[data-delete-tx]");if(!btn)return;
  const id=btn.dataset.deleteTx,tx=state.transactions.find(t=>t.id===id);
  if(!tx)return;
  if(!confirm(`Delete ${tx.type} entry for ${tx.symbol} dated ${tx.date}? All later portfolio calculations will be recomputed.`))return;
  const updated=state.transactions.filter(t=>t.id!==id);
  const err=ledgerError(updated);
  if(err){alert("Cannot delete this transaction: "+err+" No change made.");return;}
  state.transactions=updated;save();
});

document.getElementById("editWatch").addEventListener("click",()=>{
  const raw=prompt("Enter 10–20 comma-separated NEPSE symbols:",state.watchlist.join(","));
  if(raw===null)return;
  const symbols=[...new Set(raw.split(",").map(s=>s.trim().toUpperCase()).filter(Boolean))];
  if(symbols.length<10||symbols.length>20||symbols.some(s=>!/^[A-Z0-9]+$/.test(s))){alert("Please enter 10–20 unique valid symbols.");return;}
  const inUse=state.transactions.map(t=>t.symbol).filter(s=>!symbols.includes(s));
  if(inUse.length){alert("Cannot remove symbols with portfolio transactions: "+[...new Set(inUse)].join(", "));return;}
  state.watchlist=symbols;save();
});
function downloadBackup(filename="nepse-research-desk-v03-backup.json"){
  const blob=new Blob([JSON.stringify({...state,backupVersion:3,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.getElementById("exportBtn").addEventListener("click",()=>downloadBackup());

function validateBackup(data){
  if(!data||typeof data!=="object"||Array.isArray(data))throw Error("The selected file is not a JSON backup object.");
  if(!Array.isArray(data.watchlist)||!Array.isArray(data.rows)||!Array.isArray(data.transactions))throw Error("Backup must contain watchlist, rows and transactions arrays.");
  if(data.watchlist.length<1||data.watchlist.length>100)throw Error("Watchlist must contain between 1 and 100 symbols.");
  const watch=[...new Set(data.watchlist.map(x=>String(x).trim().toUpperCase()))];
  if(watch.length!==data.watchlist.length||watch.some(x=>!/^[A-Z0-9]+$/.test(x)))throw Error("Watchlist has duplicate or invalid symbols.");
  const rowKeys=new Set();
  for(let i=0;i<data.rows.length;i++){
    const r=data.rows[i];
    if(!r||!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))||!/^[A-Z0-9]+$/.test(String(r.symbol))||![r.open,r.high,r.low,r.close,r.volume].every(v=>Number.isFinite(Number(v))))throw Error(`Invalid OHLCV record at row ${i+1}.`);
    if(Number(r.close)<=0||Number(r.volume)<0||Number(r.high)<Math.max(Number(r.open),Number(r.close),Number(r.low))||Number(r.low)>Math.min(Number(r.open),Number(r.close),Number(r.high)))throw Error(`OHLCV consistency failure at row ${i+1}.`);
    const key=r.symbol+"|"+r.date;if(rowKeys.has(key))throw Error(`Duplicate symbol/date record: ${key}.`);rowKeys.add(key);
  }
  const ids=new Set();
  for(let i=0;i<data.transactions.length;i++){
    const t=data.transactions[i];
    if(!t||!watch.includes(String(t.symbol).toUpperCase())||!/^\d{4}-\d{2}-\d{2}$/.test(String(t.date))||! ["OPENING","BUY","SELL"].includes(t.type)||!Number.isInteger(Number(t.quantity))||Number(t.quantity)<=0||!Number.isFinite(Number(t.price))||Number(t.price)<=0||!Number.isFinite(Number(t.charges||0))||Number(t.charges||0)<0||!Number.isFinite(Number(t.tax||0))||Number(t.tax||0)<0)throw Error(`Invalid portfolio transaction at item ${i+1}.`);
    if(t.id&&ids.has(String(t.id)))throw Error(`Duplicate transaction ID: ${t.id}.`);if(t.id)ids.add(String(t.id));
  }
  const ledgerIssue=ledgerError(data.transactions);if(ledgerIssue)throw Error("Portfolio ledger check failed: "+ledgerIssue);
  return {watchlist:watch,rows:data.rows,transactions:data.transactions};
}
document.getElementById("restoreBtn").addEventListener("click",async()=>{
  const file=document.getElementById("backupFile").files[0],status=document.getElementById("restoreStatus");
  if(!file){status.textContent="Choose a JSON backup file first.";return;}
  try{
    const parsed=JSON.parse(await file.text()),restored=validateBackup(parsed);
    const today=isoToday(),futureRows=restored.rows.filter(r=>r.date>today).length;
    const legacyRows=restored.rows.filter(r=>!restored.watchlist.includes(r.symbol)).length;
    const detail=`This will replace local data with ${restored.watchlist.length} watchlist symbols, ${restored.rows.length} price rows and ${restored.transactions.length} transactions. ${futureRows} rows are dated after this device's current date (${today}); ${legacyRows} rows use symbols outside the watchlist. These records will be retained, not silently deleted. Continue?`;
    if(!confirm(detail))return;
    downloadBackup("nepse-research-desk-pre-restore-safety.json");
    state.watchlist=restored.watchlist;state.rows=restored.rows;state.transactions=restored.transactions;
    save();status.textContent=`Restore successful: ${restored.watchlist.length} symbols, ${restored.rows.length} price rows, ${restored.transactions.length} transactions. Future-dated rows: ${futureRows}; legacy-symbol rows retained: ${legacyRows}.`;
  }catch(e){status.textContent="Restore rejected; existing local data was not changed. "+e.message;}
});
document.getElementById("clearBtn").addEventListener("click",()=>{
  if(confirm("Permanently delete all locally stored watchlist, price and portfolio data from this browser? Export a backup first.")){localStorage.removeItem(DB_KEY);location.reload();}
});
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
render();
