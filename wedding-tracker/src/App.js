import React, { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { ref, onValue, set, push, remove, update, serverTimestamp } from "firebase/database";

const DEFAULT_CATEGORIES = {
  "Venue & Catering": 400000, "Decor & Florals": 100000,
  "Photography": 120000, "Apparel": 100000, "Jewellery": 150000,
  "Travel & Transport": 80000, "Gifts & Favours": 70000,
  "Ceremonies & Rituals": 50000, "Entertainment": 50000,
  "Honeymoon": 0, "Miscellaneous": 50000, "Contingency": 80000,
};
const ENGAGEMENT_DATE = new Date("2026-08-23");
const WEDDING_DATE = new Date("2026-11-11");
const PAYMENT_MODES = ["UPI", "Cash", "Credit Card", "Debit Card", "Bank Transfer", "Cheque", "Other"];
const NAME = { Bride: "Sanjana", Groom: "Akhil", Both: "Both" };
const dn = (v) => NAME[v] || v;

const fmtL = (n) => { if (!n && n !== 0) return "\u20b90"; const a = Math.abs(n); const s = n < 0 ? "-" : ""; if (a >= 100000) return s + "\u20b9" + (a / 100000).toFixed(a % 100000 === 0 ? 0 : 1) + "L"; return s + "\u20b9" + a.toLocaleString("en-IN"); };
const fmtFull = (n) => "\u20b9" + Math.abs(n).toLocaleString("en-IN");
const fmtDate = (d) => { if (!d) return ""; try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch(e) { return d; } };
const countdown = (target) => { const t = new Date(); t.setHours(0,0,0,0); if (t >= target) return target === ENGAGEMENT_DATE ? "Done! \ud83d\udc8d" : "Today! \ud83c\udf8a"; const d = Math.ceil((target - t) / 86400000); if (d > 60) { const m = Math.floor(d / 30); return `${m}M ${d % 30}D`; } return `${d} days`; };

function exportCSV(expList, categories, catSpending, budget, settlement, bp, gp, bpt, gpt, ts, tsc) {
  let c = "\uFEFF";
  c += "WEDDING EXPENSES SUMMARY\n";
  c += `Total Budget,${budget}\nTotal Spent,${ts}\nRemaining,${budget - tsc - bpt - gpt}\nTotal Shared Costs,${tsc}\n`;
  c += `Sanjana Paid (Shared),${bp}\nAkhil Paid (Shared),${gp}\nSanjana Personal,${bpt}\nAkhil Personal,${gpt}\n`;
  c += `Settlement,${Math.abs(settlement) < 1 ? "All Settled" : settlement > 0 ? "Akhil owes Sanjana " + Math.abs(settlement) : "Sanjana owes Akhil " + Math.abs(settlement)}\n\n`;
  c += "CATEGORY BREAKDOWN\nCategory,Budget,Shared Spent,Sanjana Personal,Akhil Personal,Total Spent,Remaining,% Used\n";
  Object.entries(catSpending).forEach(([cat, d]) => { c += `"${cat}",${d.budget},${d.shared},${d.brideP},${d.groomP},${d.total},${d.budget - d.total},${d.budget > 0 ? ((d.total / d.budget) * 100).toFixed(1) + "%" : "0%"}\n`; });
  c += "\nALL EXPENSES\nDate,Type,Description,Category,Paid By,Total Cost,Amount Paid,Payment Mode,Bill Link,Notes\n";
  [...expList].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)).forEach(e => {
    c += `${e.date || ""},${e.type === "shared" ? "Shared" : dn(e.owner) + " Personal"},"${(e.title || "").replace(/"/g, '""')}","${e.category || ""}",${e.type === "shared" ? dn(e.paidBy) : dn(e.owner)},${e.totalCost || e.amountPaid || 0},${e.amountPaid || 0},${e.paymentMode || ""},"${e.billLink || ""}","${(e.notes || "").replace(/"/g, '""')}"\n`;
  });
  const blob = new Blob([c], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `Wedding_Expenses_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

const css = `@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes slideIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.2)}}.fade-up{animation:fadeUp .35s ease both}.slide-in{animation:slideIn .3s ease both}.toast-msg{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#4A3F35;color:#FFF8F0;padding:10px 24px;border-radius:20px;font-size:14px;font-weight:600;z-index:100;animation:fadeUp .3s ease;box-shadow:0 4px 20px rgba(0,0,0,.15)}.btn-primary{background:linear-gradient(135deg,#C17950,#D4985F);color:#FFF8F0;border:none;border-radius:12px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(193,121,80,.25);transition:transform .1s}.btn-primary:active{transform:scale(.98)}.card{background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:0 2px 12px rgba(107,91,80,.06)}input:focus,select:focus,textarea:focus{outline:none;border-color:#C17950!important;box-shadow:0 0 0 3px rgba(193,121,80,.12)}`;

export default function App() {
  const [loading, setLoading] = useState(true);
  const [conn, setConn] = useState("connecting");
  const [tab, setTab] = useState("dashboard");
  const [budget, setBudget] = useState(1200000);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [expenses, setExpenses] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState(null);
  const loaded = useRef(false);

  useEffect(() => {
    let timers = []; let unsubs = [];
    try {
      unsubs.push(onValue(ref(db, ".info/connected"), s => setConn(s.val() ? "connected" : "offline")));
      unsubs.push(onValue(ref(db, "settings/budget"), s => { if (s.exists()) setBudget(s.val()); }, e => console.warn(e.message)));
      unsubs.push(onValue(ref(db, "settings/categories"), s => { if (s.exists()) setCategories(s.val()); }, e => console.warn(e.message)));
      unsubs.push(onValue(ref(db, "expenses"), s => { setExpenses(s.exists() ? s.val() : {}); loaded.current = true; setLoading(false); }, e => { console.warn(e.message); setLoading(false); }));
      timers.push(setTimeout(() => {
        onValue(ref(db, "settings/initialized"), s => {
          if (!s.exists()) update(ref(db, "settings"), { budget: 1200000, categories: DEFAULT_CATEGORIES, initialized: true, createdAt: serverTimestamp() }).catch(() => {});
        }, { onlyOnce: true });
      }, 800));
      timers.push(setTimeout(() => setLoading(false), 15000));
    } catch (e) { console.error(e); setLoading(false); }
    return () => { unsubs.forEach(u => u()); timers.forEach(t => clearTimeout(t)); };
  }, []);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2500); };
  const saveBudget = v => set(ref(db, "settings/budget"), v).catch(() => showToast("\u26a0\ufe0f Save failed"));
  const saveCats = c => set(ref(db, "settings/categories"), c).catch(() => showToast("\u26a0\ufe0f Save failed"));
  const addExp = d => { set(push(ref(db, "expenses")), { ...d, createdAt: new Date().toISOString() }).then(() => showToast("Added \u2713")).catch(() => showToast("\u26a0\ufe0f Failed")); };
  const updExp = (id, d) => { update(ref(db, `expenses/${id}`), d).then(() => showToast("Updated \u2713")).catch(() => showToast("\u26a0\ufe0f Failed")); };
  const delExp = id => { remove(ref(db, `expenses/${id}`)).then(() => showToast("Deleted \u2713")).catch(() => showToast("\u26a0\ufe0f Failed")); };

  const expList = Object.entries(expenses).map(([id, e]) => ({ id, ...e }));
  const shared = expList.filter(e => e.type === "shared");
  const brideP = expList.filter(e => e.type === "personal" && e.owner === "Bride");
  const groomP = expList.filter(e => e.type === "personal" && e.owner === "Groom");
  const tsc = shared.reduce((s, e) => s + (e.totalCost || 0), 0);
  const bp = shared.reduce((s, e) => e.paidBy === "Bride" ? s + (e.amountPaid || 0) : e.paidBy === "Both" ? s + (e.amountPaid || 0) / 2 : s, 0);
  const gp = shared.reduce((s, e) => e.paidBy === "Groom" ? s + (e.amountPaid || 0) : e.paidBy === "Both" ? s + (e.amountPaid || 0) / 2 : s, 0);
  const bpt = brideP.reduce((s, e) => s + (e.amountPaid || 0), 0);
  const gpt = groomP.reduce((s, e) => s + (e.amountPaid || 0), 0);
  const ts = bp + gp + bpt + gpt;
  const rem = budget - tsc - bpt - gpt;
  const sett = bp / 2 - gp / 2;
  const catS = {};
  Object.keys(categories).forEach(cat => {
    const sc = shared.filter(e => e.category === cat).reduce((s, e) => s + (e.amountPaid || 0), 0);
    const bc = brideP.filter(e => e.category === cat).reduce((s, e) => s + (e.amountPaid || 0), 0);
    const gc = groomP.filter(e => e.category === cat).reduce((s, e) => s + (e.amountPaid || 0), 0);
    catS[cat] = { shared: sc, brideP: bc, groomP: gc, total: sc + bc + gc, budget: categories[cat] };
  });

  if (loading) return (<div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#FFF8F0" }}><div style={{ textAlign:"center" }}><div style={{ fontSize:48,marginBottom:12 }}>{"\ud83d\udc8d"}</div><div style={{ fontSize:16,color:"#8C7B6F",letterSpacing:2,fontFamily:"'Cormorant Garamond', serif" }}>Connecting...</div></div></div>);

  const doExport = () => exportCSV(expList, categories, catS, budget, sett, bp, gp, bpt, gpt, ts, tsc);

  return (
    <div style={{ minHeight:"100vh",background:"linear-gradient(180deg,#FFF8F0 0%,#F5E1DA 100%)",position:"relative" }}>
      <style>{css}</style>
      {toast && <div className="toast-msg">{toast}</div>}
      <div style={{ background:"linear-gradient(135deg,#6B5B50,#8C7B6F)",padding:"20px 20px 16px",color:"#FFF8F0",position:"relative",overflow:"hidden" }}>
        <div style={{ position:"absolute",top:-20,right:-20,width:120,height:120,borderRadius:"50%",background:"rgba(212,175,55,0.1)" }} />
        <div style={{ fontFamily:"'Cormorant Garamond', serif",fontSize:26,fontWeight:700,letterSpacing:1,marginBottom:2,position:"relative",display:"flex",alignItems:"center",gap:10 }}>
          <span>Wedding Planner</span>
          <span title={conn === "connected" ? "Synced" : "Offline"} style={{ fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,padding:"3px 8px",borderRadius:10,display:"inline-flex",alignItems:"center",gap:5,background:conn==="connected"?"rgba(168,181,160,0.25)":"rgba(255,180,180,0.2)",border:`1px solid ${conn==="connected"?"rgba(168,181,160,0.5)":"rgba(255,180,180,0.4)"}`,color:conn==="connected"?"#D4F0D0":"#FFD0D0" }}>
            <span style={{ width:6,height:6,borderRadius:"50%",background:conn==="connected"?"#A8B5A0":"#E8A8A8",animation:conn==="connected"?"none":"pulse 1.5s ease infinite" }} />
            {conn === "connected" ? "SYNCED" : "OFFLINE"}
          </span>
        </div>
        <div style={{ fontSize:12,opacity:0.7,letterSpacing:1.5,textTransform:"uppercase",position:"relative" }}>Sanjana & Akhil</div>
        <div style={{ display:"flex",gap:8,marginTop:14,position:"relative" }}>
          {[{ l:"Engagement",d:ENGAGEMENT_DATE,e:"\ud83d\udc8d" },{ l:"Wedding",d:WEDDING_DATE,e:"\ud83c\udf8a" }].map((ev,i) => (
            <div key={i} style={{ flex:1,background:"rgba(255,248,240,0.12)",borderRadius:10,padding:"8px 12px",border:"1px solid rgba(255,248,240,0.15)" }}>
              <div style={{ fontSize:10,opacity:0.7,textTransform:"uppercase",letterSpacing:1 }}>{ev.e} {ev.l}</div>
              <div style={{ fontSize:16,fontWeight:700,fontFamily:"'Cormorant Garamond', serif",marginTop:2 }}>{countdown(ev.d)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding:"0 0 80px",overflowY:"auto" }}>
        {tab==="dashboard" && <DashTab budget={budget} ts={ts} rem={rem} tsc={tsc} sett={sett} bp={bp} gp={gp} bsh={tsc/2} bpt={bpt} gpt={gpt} catS={catS} />}
        {tab==="expenses" && <ExpTab exps={expList} onAdd={()=>{setEditId(null);setShowForm(true)}} onEdit={e=>{setEditId(e.id);setShowForm(true)}} onDel={id=>{if(window.confirm("Delete?"))delExp(id)}} />}
        {tab==="insights" && <InsTab data={{expList,shared,brideP,groomP,tsc,bp,gp,bpt,gpt,ts,rem,sett,budget,catS,categories}} onExport={doExport} />}
        {tab==="budget" && <BudTab budget={budget} saveBudget={saveBudget} categories={categories} saveCats={saveCats} catS={catS} showToast={showToast} showS={showSettings} setShowS={setShowSettings} />}
      </div>

      {showForm && <ExpModal cats={Object.keys(categories)} init={editId?expenses[editId]:null} onSave={d=>{editId?updExp(editId,d):addExp(d);setShowForm(false);setEditId(null)}} onClose={()=>{setShowForm(false);setEditId(null)}} />}

      <div style={{ position:"fixed",bottom:0,left:0,right:0,background:"rgba(255,248,240,0.95)",backdropFilter:"blur(12px)",borderTop:"1px solid rgba(196,144,139,0.2)",display:"flex",justifyContent:"space-around",padding:"8px 0 12px",zIndex:50 }}>
        {[{id:"dashboard",icon:"\u25c8",label:"Home"},{id:"expenses",icon:"\u25ce",label:"Expenses"},{id:"insights",icon:"\u25c9",label:"Insights"},{id:"budget",icon:"\u25a3",label:"Budget"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:tab===t.id?"#9B6B66":"#8C7B6F",fontWeight:tab===t.id?700:500 }}>
            <span style={{ fontSize:20,lineHeight:1 }}>{t.icon}</span>
            <span style={{ fontSize:10,letterSpacing:.5 }}>{t.label}</span>
            {tab===t.id && <div style={{ width:4,height:4,borderRadius:"50%",background:"#D4AF37",marginTop:1 }} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function KpiCard({ label, value, bg, neg }) {
  return (<div style={{ background:bg,borderRadius:14,padding:"14px 16px",color:"#FFF8F0",boxShadow:"0 4px 16px rgba(0,0,0,0.08)" }}><div style={{ fontSize:10,textTransform:"uppercase",letterSpacing:1.2,opacity:.75 }}>{label}</div><div style={{ fontSize:22,fontWeight:700,fontFamily:"'Cormorant Garamond', serif",marginTop:4,color:neg?"#FFB4B4":"#FFF8F0" }}>{value}</div></div>);
}
function MS({ label, value }) {
  return (<div style={{ flex:1,background:"rgba(255,255,255,0.15)",borderRadius:8,padding:"6px 10px" }}><div style={{ fontSize:10,opacity:.7 }}>{label}</div><div style={{ fontSize:14,fontWeight:700 }}>{value}</div></div>);
}

function DashTab({ budget, ts, rem, tsc, sett, bp, gp, bsh, bpt, gpt, catS }) {
  const pct = budget > 0 ? Math.min((ts / budget) * 100, 100) : 0;
  return (
    <div style={{ padding:16 }} className="fade-up">
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14 }}>
        <KpiCard label="Total Budget" value={fmtL(budget)} bg="linear-gradient(135deg,#6B5B50,#8C7B6F)" />
        <KpiCard label="Total Spent" value={fmtL(ts)} bg="linear-gradient(135deg,#9B6B66,#C4908B)" />
        <KpiCard label="Remaining" value={fmtL(rem)} bg="linear-gradient(135deg,#6B7F63,#A8B5A0)" neg={rem<0} />
        <KpiCard label="Shared Costs" value={fmtL(tsc)} bg="linear-gradient(135deg,#C17950,#D4985F)" />
      </div>
      <div className="card"><div style={{ display:"flex",justifyContent:"space-between",marginBottom:8 }}><span style={{ fontSize:13,fontWeight:600,color:"#6B5B50" }}>Budget Used</span><span style={{ fontSize:13,fontWeight:700,color:pct>90?"#8B3A4A":"#6B7F63" }}>{pct.toFixed(1)}%</span></div><div style={{ height:8,background:"#F0E8DD",borderRadius:4,overflow:"hidden" }}><div style={{ height:"100%",borderRadius:4,transition:"width 0.6s",width:`${pct}%`,background:pct>90?"linear-gradient(90deg,#C17950,#8B3A4A)":"linear-gradient(90deg,#A8B5A0,#6B7F63)" }} /></div></div>
      <div style={{ background:"linear-gradient(135deg,#C17950,#D4985F)",borderRadius:14,padding:18,marginBottom:14,color:"#FFF8F0",boxShadow:"0 4px 20px rgba(193,121,80,0.2)" }}>
        <div style={{ fontSize:11,textTransform:"uppercase",letterSpacing:1.5,opacity:.8,marginBottom:6 }}>Settlement</div>
        <div style={{ fontFamily:"'Cormorant Garamond', serif",fontSize:26,fontWeight:700,marginBottom:4 }}>{Math.abs(sett)<1?"All Settled! \u2713":sett>0?`Akhil owes ${fmtFull(sett)}`:`Sanjana owes ${fmtFull(Math.abs(sett))}`}</div>
        <div style={{ fontSize:12,opacity:.75,lineHeight:1.4,marginTop:8 }}>Sanjana paid {fmtL(bp)} \u00b7 Akhil paid {fmtL(gp)} toward shared costs</div>
        <div style={{ display:"flex",gap:8,marginTop:12 }}><MS label="Sanjana's share" value={fmtL(bsh)} /><MS label="Akhil's share" value={fmtL(bsh)} /></div>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14 }}>
        <div className="card" style={{ marginBottom:0 }}><div style={{ fontSize:11,color:"#9B6B66",textTransform:"uppercase",letterSpacing:1,marginBottom:4 }}>{"\u2723"} Sanjana Personal</div><div style={{ fontSize:20,fontWeight:700,color:"#9B6B66",fontFamily:"'Cormorant Garamond', serif" }}>{fmtL(bpt)}</div></div>
        <div className="card" style={{ marginBottom:0 }}><div style={{ fontSize:11,color:"#6B7F63",textTransform:"uppercase",letterSpacing:1,marginBottom:4 }}>{"\u2756"} Akhil Personal</div><div style={{ fontSize:20,fontWeight:700,color:"#6B7F63",fontFamily:"'Cormorant Garamond', serif" }}>{fmtL(gpt)}</div></div>
      </div>
      <div className="card"><div style={{ fontSize:14,fontWeight:700,color:"#6B5B50",marginBottom:14 }}>Category Breakdown</div>
        {Object.entries(catS).map(([cat, d], i) => { const p = d.budget>0?Math.min((d.total/d.budget)*100,100):0; const ov = d.total>d.budget&&d.budget>0; return (<div key={cat} className="slide-in" style={{ marginBottom:14,animationDelay:`${i*.03}s` }}><div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}><span style={{ fontSize:13,fontWeight:500,color:ov?"#8B3A4A":"#4A3F35" }}>{cat}</span><span style={{ fontSize:12,color:"#8C7B6F" }}>{fmtL(d.total)} / {fmtL(d.budget)}</span></div><div style={{ height:6,background:"#F5E1DA",borderRadius:3,overflow:"hidden" }}><div style={{ height:"100%",borderRadius:3,transition:"width .5s",width:`${p}%`,background:ov?"#8B3A4A":p>75?"#C17950":"#A8B5A0" }} /></div></div>); })}
      </div>
    </div>
  );
}

function InsTab({ data, onExport }) {
  const { expList, shared, brideP, groomP, tsc, bp, gp, bpt, gpt, ts, rem, sett, budget, catS } = data;
  const n = expList.length;
  const avg = n > 0 ? ts / n : 0;
  const biggest = n > 0 ? expList.reduce((mx, e) => (e.amountPaid || 0) > (mx.amountPaid || 0) ? e : mx, expList[0]) : null;
  const catRank = Object.entries(catS).filter(([,d]) => d.total > 0).sort((a, b) => b[1].total - a[1].total);
  const overBud = Object.entries(catS).filter(([,d]) => d.total > d.budget && d.budget > 0);
  const payM = {}; expList.forEach(e => { const m = e.paymentMode || "Unspecified"; payM[m] = (payM[m] || 0) + (e.amountPaid || 0); });
  const monthly = {}; expList.forEach(e => { if (!e.date) return; const k = e.date.substring(0, 7); monthly[k] = (monthly[k] || 0) + (e.amountPaid || 0); });
  const vendorBal = tsc - shared.reduce((s, e) => s + (e.amountPaid || 0), 0);
  const SR = ({ label, value, color, bold }) => (<div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #F0E8DD" }}><span style={{ fontSize:13,color:"#6B5B50" }}>{label}</span><span style={{ fontSize:14,fontWeight:bold?700:600,color:color||"#4A3F35",fontFamily:"'Cormorant Garamond', serif" }}>{value}</span></div>);

  return (
    <div style={{ padding:16 }} className="fade-up">
      <button onClick={onExport} className="btn-primary" style={{ width:"100%",padding:14,fontSize:15,marginBottom:16,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>{"\ud83d\udcca"} Download Excel / CSV</button>

      <div className="card"><div style={{ fontSize:14,fontWeight:700,color:"#6B5B50",marginBottom:8 }}>Overview</div>
        <SR label="Total Expenses Logged" value={n} />
        <SR label="Shared Expenses" value={shared.length} />
        <SR label="Personal Expenses" value={n - shared.length} />
        <SR label="Average Expense" value={fmtL(Math.round(avg))} />
        {biggest && <SR label="Largest Payment" value={`${fmtL(biggest.amountPaid)} \u2014 ${biggest.title}`} color="#C17950" />}
      </div>

      <div className="card"><div style={{ fontSize:14,fontWeight:700,color:"#6B5B50",marginBottom:12 }}>Who Paid What</div>
        <div style={{ display:"flex",gap:8,marginBottom:12 }}>
          <div style={{ flex:(bp+bpt)||1,background:"linear-gradient(90deg,#C4908B,#9B6B66)",borderRadius:8,padding:"10px 12px",color:"#FFF8F0",minWidth:60 }}><div style={{ fontSize:10,opacity:.8 }}>Sanjana</div><div style={{ fontSize:16,fontWeight:700,fontFamily:"'Cormorant Garamond', serif" }}>{fmtL(bp+bpt)}</div></div>
          <div style={{ flex:(gp+gpt)||1,background:"linear-gradient(90deg,#A8B5A0,#6B7F63)",borderRadius:8,padding:"10px 12px",color:"#FFF8F0",minWidth:60 }}><div style={{ fontSize:10,opacity:.8 }}>Akhil</div><div style={{ fontSize:16,fontWeight:700,fontFamily:"'Cormorant Garamond', serif" }}>{fmtL(gp+gpt)}</div></div>
        </div>
        <SR label="Sanjana \u2014 Shared" value={fmtL(bp)} color="#9B6B66" />
        <SR label="Sanjana \u2014 Personal" value={fmtL(bpt)} color="#9B6B66" />
        <SR label="Akhil \u2014 Shared" value={fmtL(gp)} color="#6B7F63" />
        <SR label="Akhil \u2014 Personal" value={fmtL(gpt)} color="#6B7F63" />
      </div>

      {vendorBal > 0 && <div style={{ background:"linear-gradient(135deg,#8B3A4A,#A85060)",borderRadius:14,padding:16,marginBottom:12,color:"#FFF8F0" }}><div style={{ fontSize:11,textTransform:"uppercase",letterSpacing:1.5,opacity:.8 }}>Unpaid Vendor Balance</div><div style={{ fontSize:24,fontWeight:700,fontFamily:"'Cormorant Garamond', serif",marginTop:4 }}>{fmtL(vendorBal)}</div><div style={{ fontSize:12,opacity:.75,marginTop:4 }}>Still owed to vendors for shared expenses</div></div>}

      {catRank.length > 0 && <div className="card"><div style={{ fontSize:14,fontWeight:700,color:"#6B5B50",marginBottom:8 }}>Top Categories</div>
        {catRank.slice(0, 5).map(([cat, d], i) => (<div key={cat} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #F0E8DD" }}><div style={{ display:"flex",alignItems:"center",gap:8 }}><span style={{ fontSize:16,fontWeight:700,color:"#D4AF37",fontFamily:"'Cormorant Garamond', serif",width:24 }}>#{i+1}</span><span style={{ fontSize:13 }}>{cat}</span></div><div style={{ textAlign:"right" }}><span style={{ fontSize:14,fontWeight:700,fontFamily:"'Cormorant Garamond', serif" }}>{fmtL(d.total)}</span><span style={{ fontSize:11,color:"#8C7B6F",marginLeft:6 }}>({budget>0?((d.total/budget)*100).toFixed(1):0}%)</span></div></div>))}
      </div>}

      {overBud.length > 0 && <div className="card" style={{ borderLeft:"4px solid #8B3A4A" }}><div style={{ fontSize:14,fontWeight:700,color:"#8B3A4A",marginBottom:8 }}>{"\u26a0"} Over Budget</div>{overBud.map(([cat, d]) => (<div key={cat} style={{ display:"flex",justifyContent:"space-between",padding:"6px 0" }}><span style={{ fontSize:13 }}>{cat}</span><span style={{ fontSize:13,fontWeight:600,color:"#8B3A4A" }}>{fmtL(d.total-d.budget)} over</span></div>))}</div>}

      {Object.keys(payM).length > 0 && <div className="card"><div style={{ fontSize:14,fontWeight:700,color:"#6B5B50",marginBottom:8 }}>Payment Methods</div>{Object.entries(payM).sort((a,b)=>b[1]-a[1]).map(([m,a])=>(<div key={m} style={{ display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #F0E8DD" }}><span style={{ fontSize:13 }}>{m}</span><span style={{ fontSize:13,fontWeight:600 }}>{fmtL(a)}</span></div>))}</div>}

      {Object.keys(monthly).length > 0 && <div className="card"><div style={{ fontSize:14,fontWeight:700,color:"#6B5B50",marginBottom:12 }}>Monthly Spending</div>{Object.entries(monthly).sort((a,b)=>a[0].localeCompare(b[0])).map(([mo,a])=>{ const lbl = new Date(mo+"-01").toLocaleDateString("en-IN",{month:"short",year:"numeric"}); const bw = budget>0?Math.min((a/(budget*.2))*100,100):50; return (<div key={mo} style={{ marginBottom:10 }}><div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}><span style={{ fontSize:12,color:"#6B5B50" }}>{lbl}</span><span style={{ fontSize:12,fontWeight:600 }}>{fmtL(a)}</span></div><div style={{ height:6,background:"#F5E1DA",borderRadius:3,overflow:"hidden" }}><div style={{ height:"100%",borderRadius:3,width:`${bw}%`,background:"linear-gradient(90deg,#C17950,#D4985F)" }} /></div></div>); })}</div>}

      {n === 0 && <div style={{ textAlign:"center",padding:40,color:"#8C7B6F" }}><div style={{ fontSize:36,marginBottom:8 }}>{"\ud83d\udcca"}</div><div style={{ fontSize:14 }}>Add expenses to see insights</div></div>}
    </div>
  );
}

function ExpTab({ exps, onAdd, onEdit, onDel }) {
  const [f, setF] = useState("all");
  const fl = f==="all"?exps:f==="shared"?exps.filter(e=>e.type==="shared"):exps.filter(e=>e.type==="personal"&&e.owner===f);
  const sorted = [...fl].sort((a,b)=>new Date(b.date||b.createdAt)-new Date(a.date||a.createdAt));
  return (
    <div style={{ padding:16 }} className="fade-up">
      <div style={{ display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:4 }}>
        {[{id:"all",l:"All"},{id:"shared",l:"Shared"},{id:"Bride",l:"\u2723 Sanjana"},{id:"Groom",l:"\u2756 Akhil"}].map(x=>(<button key={x.id} onClick={()=>setF(x.id)} style={{ background:f===x.id?"#6B5B50":"white",color:f===x.id?"#FFF8F0":"#6B5B50",border:"1px solid #D5C8BC",borderRadius:20,padding:"6px 16px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap" }}>{x.l}</button>))}
      </div>
      <button className="btn-primary" onClick={onAdd} style={{ width:"100%",padding:14,fontSize:15,marginBottom:16,borderRadius:12 }}>+ Add Expense</button>
      {sorted.length===0?(<div style={{ textAlign:"center",padding:40,color:"#8C7B6F" }}><div style={{ fontSize:36,marginBottom:8 }}>{"\ud83d\udcdd"}</div><div style={{ fontSize:14 }}>No expenses yet</div></div>):sorted.map((e,i)=>(<div key={e.id} className="slide-in" style={{ background:"white",borderRadius:12,padding:14,marginBottom:10,boxShadow:"0 2px 10px rgba(0,0,0,0.04)",borderLeft:`4px solid ${e.type==="shared"?"#C17950":e.owner==="Bride"?"#C4908B":"#A8B5A0"}`,animationDelay:`${i*.04}s` }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15,fontWeight:600,color:"#4A3F35" }}>{e.title}</div>
            <div style={{ fontSize:12,color:"#8C7B6F",marginTop:3,lineHeight:1.5 }}>{fmtDate(e.date)} \u00b7 {e.category} \u00b7 {e.type==="shared"?`Shared \u00b7 Paid by ${dn(e.paidBy)}`:`${dn(e.owner)}'s personal`}{e.paymentMode?` \u00b7 ${e.paymentMode}`:""}</div>
            {e.notes && <div style={{ fontSize:11,color:"#A89888",marginTop:4,fontStyle:"italic" }}>{e.notes}</div>}
            {e.billLink && <a href={e.billLink} target="_blank" rel="noopener noreferrer" style={{ fontSize:11,color:"#C17950",marginTop:4,display:"inline-block",textDecoration:"none",fontWeight:600 }}>{"\ud83d\udcce"} View Bill {"\u2192"}</a>}
          </div>
          <div style={{ textAlign:"right",marginLeft:12 }}>
            <div style={{ fontSize:18,fontWeight:700,color:"#4A3F35",fontFamily:"'Cormorant Garamond', serif" }}>{fmtL(e.type==="shared"?e.totalCost:e.amountPaid)}</div>
            {e.type==="shared"&&(e.totalCost||0)!==(e.amountPaid||0)&&<div style={{ fontSize:11,color:"#6B7F63",marginTop:2 }}>Paid: {fmtL(e.amountPaid)}</div>}
          </div>
        </div>
        <div style={{ display:"flex",gap:8,marginTop:10,justifyContent:"flex-end" }}>
          <button onClick={()=>onEdit(e)} style={{ background:"none",border:"1px solid #D5C8BC",borderRadius:6,padding:"4px 12px",fontSize:11,color:"#6B5B50",cursor:"pointer" }}>Edit</button>
          <button onClick={()=>onDel(e.id)} style={{ background:"none",border:"1px solid #E8C4C4",borderRadius:6,padding:"4px 12px",fontSize:11,color:"#8B3A4A",cursor:"pointer" }}>Delete</button>
        </div>
      </div>))}
    </div>
  );
}

function ExpModal({ cats, init, onSave, onClose }) {
  const [type, setType] = useState(init?.type || "shared");
  const [owner, setOwner] = useState(init?.owner || "Bride");
  const [date, setDate] = useState(init?.date || new Date().toISOString().split("T")[0]);
  const [title, setTitle] = useState(init?.title || "");
  const [cat, setCat] = useState(init?.category || cats[0]);
  const [paidBy, setPB] = useState(init?.paidBy || "Bride");
  const [tc, setTC] = useState(init?.totalCost?.toString() || "");
  const [ap, setAP] = useState(init?.amountPaid?.toString() || "");
  const [pm, setPM] = useState(init?.paymentMode || "");
  const [bl, setBL] = useState(init?.billLink || "");
  const [notes, setN] = useState(init?.notes || "");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const sub = () => {
    const errs = {};
    if (!title.trim()) errs.title = "Description is required";
    if (!ap || parseFloat(ap) <= 0 || isNaN(parseFloat(ap))) errs.ap = "Enter a valid amount greater than 0";
    if (type === "shared" && tc && (parseFloat(tc) < parseFloat(ap || 0))) errs.tc = "Total cost can't be less than amount paid";
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      // Scroll to first error
      const firstErrField = Object.keys(errs)[0];
      const el = document.getElementById(`field-${firstErrField}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    onSave({
      type,
      owner: type === "personal" ? owner : undefined,
      date,
      title: title.trim(),
      category: cat,
      paidBy: type === "shared" ? paidBy : owner,
      totalCost: type === "shared" ? (parseFloat(tc) || parseFloat(ap)) : parseFloat(ap),
      amountPaid: parseFloat(ap),
      paymentMode: pm,
      billLink: bl.trim(),
      notes: notes.trim(),
    });
  };

  const inpBase = { width:"100%",padding:"10px 12px",border:"1px solid #D5C8BC",borderRadius:8,fontSize:14,background:"#FFFDF8",color:"#4A3F35",outline:"none" };
  const inpErr = { ...inpBase, border:"1px solid #8B3A4A", background:"#FFF5F5" };
  const lbl = { fontSize:12,fontWeight:600,color:"#6B5B50",marginBottom:4,display:"block" };
  const errMsg = (msg) => msg ? <div style={{ fontSize:11,color:"#8B3A4A",marginTop:3,fontWeight:600 }}>{"\u26a0 "}{msg}</div> : null;

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(74,63,53,0.4)",zIndex:60,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(4px)" }} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="fade-up" style={{ background:"#FFF8F0",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"88vh",overflow:"auto",padding:"20px 20px 32px" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
          <div style={{ fontFamily:"'Cormorant Garamond', serif",fontSize:22,fontWeight:700,color:"#6B5B50" }}>{init?"Edit Expense":"Add Expense"}</div>
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#8C7B6F" }}>{"\u2715"}</button>
        </div>
        <div style={{ display:"flex",gap:8,marginBottom:16 }}>
          {["shared","personal"].map(t=>(<button key={t} onClick={()=>setType(t)} style={{ flex:1,padding:10,borderRadius:10,border:"2px solid",borderColor:type===t?"#C17950":"#D5C8BC",background:type===t?"#FFF0E6":"white",color:type===t?"#C17950":"#8C7B6F",fontSize:13,fontWeight:700,cursor:"pointer" }}>{t==="shared"?"\ud83e\udd1d Shared (50-50)":"\ud83d\udc64 Personal"}</button>))}
        </div>
        {type==="personal"&&<div style={{ marginBottom:14 }}><label style={lbl}>Whose expense?</label><div style={{ display:"flex",gap:8 }}>{["Bride","Groom"].map(w=>(<button key={w} onClick={()=>setOwner(w)} style={{ flex:1,padding:8,borderRadius:8,border:`2px solid ${owner===w?(w==="Bride"?"#C4908B":"#A8B5A0"):"#D5C8BC"}`,background:owner===w?(w==="Bride"?"#FCE4EC":"#E8F5E9"):"white",fontSize:13,fontWeight:600,cursor:"pointer",color:owner===w?(w==="Bride"?"#9B6B66":"#6B7F63"):"#8C7B6F" }}>{w==="Bride"?"\u2723 Sanjana":"\u2756 Akhil"}</button>))}</div></div>}
        <div style={{ display:"grid",gap:12 }}>
          <div><label style={lbl}>Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inpBase} /></div>
          <div id="field-title">
            <label style={lbl}>Description {errors.title && <span style={{ color:"#8B3A4A" }}>*</span>}</label>
            <input value={title} onChange={e=>{setTitle(e.target.value); if(errors.title) setErrors({...errors, title:null})}} placeholder="e.g. Photographer advance" style={errors.title ? inpErr : inpBase} />
            {errMsg(errors.title)}
          </div>
          <div><label style={lbl}>Category</label><select value={cat} onChange={e=>setCat(e.target.value)} style={{...inpBase,appearance:"auto"}}>{cats.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          {type==="shared"&&<>
            <div id="field-tc">
              <label style={lbl}>Total Cost of Item ({"\u20b9"})</label>
              <input type="number" value={tc} onChange={e=>{setTC(e.target.value); if(errors.tc) setErrors({...errors, tc:null})}} placeholder="Full cost, e.g. 105000" style={errors.tc ? inpErr : inpBase} />
              <div style={{ fontSize:11,color:"#8C7B6F",marginTop:3 }}>Full price \u2014 50% share auto-calculated. Leave blank to use Amount Paid.</div>
              {errMsg(errors.tc)}
            </div>
            <div>
              <label style={lbl}>Paid By</label>
              <div style={{ display:"flex",gap:6 }}>
                {["Bride","Groom","Both"].map(w=>(<button key={w} onClick={()=>setPB(w)} style={{ flex:1,padding:8,borderRadius:8,border:`2px solid ${paidBy===w?"#C17950":"#D5C8BC"}`,background:paidBy===w?"#FFF0E6":"white",fontSize:12,fontWeight:600,cursor:"pointer",color:paidBy===w?"#C17950":"#8C7B6F" }}>{dn(w)}</button>))}
              </div>
            </div>
          </>}
          <div id="field-ap">
            <label style={lbl}>Amount Paid Now ({"\u20b9"}) {errors.ap && <span style={{ color:"#8B3A4A" }}>*</span>}</label>
            <input type="number" value={ap} onChange={e=>{setAP(e.target.value); if(errors.ap) setErrors({...errors, ap:null})}} placeholder="Amount actually paid" style={errors.ap ? inpErr : inpBase} />
            {errMsg(errors.ap)}
          </div>
          <div><label style={lbl}>Payment Mode</label><select value={pm} onChange={e=>setPM(e.target.value)} style={{...inpBase,appearance:"auto"}}><option value="">Select...</option>{PAYMENT_MODES.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
          <div><label style={lbl}>{"\ud83d\udcce"} Bill / Invoice Link</label><input value={bl} onChange={e=>setBL(e.target.value)} placeholder="Google Drive / Dropbox link" style={inpBase} /><div style={{ fontSize:11,color:"#8C7B6F",marginTop:3 }}>Upload bill to Drive, paste share link</div></div>
          <div><label style={lbl}>Notes</label><textarea value={notes} onChange={e=>setN(e.target.value)} placeholder="Optional notes..." rows={2} style={{...inpBase,resize:"vertical"}} /></div>
        </div>
        {Object.keys(errors).filter(k => errors[k]).length > 0 && (
          <div style={{ background:"#FFE5E5",border:"1px solid #8B3A4A",borderRadius:8,padding:10,marginTop:14,fontSize:12,color:"#8B3A4A",fontWeight:600 }}>
            {"\u26a0 "}Please fill in the required fields highlighted above
          </div>
        )}
        <button onClick={sub} disabled={submitting} style={{ width:"100%",padding:14,marginTop:18,background:submitting?"#8C7B6F":"linear-gradient(135deg,#6B5B50,#8C7B6F)",color:"#FFF8F0",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:submitting?"not-allowed":"pointer",boxShadow:"0 4px 16px rgba(107,91,80,0.2)",opacity:submitting?0.7:1 }}>{submitting?"Saving...":(init?"Update Expense":"Save Expense")}</button>
      </div>
    </div>
  );
}

function BudTab({ budget, saveBudget, categories, saveCats, catS, showToast, showS, setShowS }) {
  const [bi, setBI] = useState(budget.toString());
  const [ci, setCI] = useState({...categories});
  const alloc = Object.values(ci).reduce((a,b)=>a+b, 0);
  useEffect(() => { setCI({...categories}); }, [categories]);
  return (
    <div style={{ padding:16 }} className="fade-up">
      <div className="card"><div style={{ fontSize:14,fontWeight:700,color:"#6B5B50",marginBottom:10 }}>Total Budget</div><div style={{ display:"flex",gap:8 }}><input type="number" value={bi} onChange={e=>setBI(e.target.value)} style={{ flex:1,padding:"10px 12px",border:"1px solid #D5C8BC",borderRadius:8,fontSize:16,fontWeight:600,background:"#FFFDF8",color:"#4A3F35" }} /><button onClick={()=>{const v=parseFloat(bi);if(v>0){saveBudget(v);showToast("Budget updated \u2713")}}} style={{ padding:"10px 20px",background:"#6B5B50",color:"#FFF8F0",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer" }}>Set</button></div></div>
      <div className="card">
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4 }}><div style={{ fontSize:14,fontWeight:700,color:"#6B5B50" }}>Category Budgets</div><button onClick={()=>setShowS(!showS)} style={{ background:"none",border:"1px solid #D5C8BC",borderRadius:8,padding:"4px 12px",fontSize:12,color:"#6B5B50",cursor:"pointer" }}>{showS?"Done":"Edit"}</button></div>
        <div style={{ fontSize:12,fontWeight:600,marginBottom:14,color:Math.abs(alloc-budget)>100?"#8B3A4A":"#6B7F63" }}>Allocated: {fmtL(alloc)} / Budget: {fmtL(budget)}{Math.abs(alloc-budget)>100&&` (${fmtL(Math.abs(alloc-budget))} ${alloc>budget?"over":"under"})`}</div>
        {Object.keys(ci).map(cat=>{const d=catS[cat]||{total:0,budget:ci[cat]};const p=d.budget>0?(d.total/d.budget)*100:0;return(<div key={cat} style={{ marginBottom:showS?10:12 }}><div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4 }}><span style={{ fontSize:13,fontWeight:500 }}>{cat}</span>{showS?<input type="number" value={ci[cat]} onChange={e=>setCI(prev=>({...prev,[cat]:parseFloat(e.target.value)||0}))} style={{ width:100,padding:"4px 8px",border:"1px solid #D5C8BC",borderRadius:6,fontSize:13,textAlign:"right" }} />:<span style={{ fontSize:12,color:p>100?"#8B3A4A":"#8C7B6F" }}>{fmtL(d.total)} / {fmtL(d.budget)}</span>}</div>{!showS&&<div style={{ height:5,background:"#F5E1DA",borderRadius:3,overflow:"hidden" }}><div style={{ height:"100%",borderRadius:3,width:`${Math.min(p,100)}%`,background:p>100?"#8B3A4A":p>75?"#C17950":"#A8B5A0" }} /></div>}</div>)})}
        {showS&&<button onClick={()=>{saveCats(ci);setShowS(false);showToast("Categories saved \u2713")}} style={{ width:"100%",padding:12,marginTop:8,background:"linear-gradient(135deg,#6B7F63,#A8B5A0)",color:"#FFF8F0",border:"none",borderRadius:10,fontWeight:700,cursor:"pointer" }}>Save Category Budgets</button>}
      </div>
    </div>
  );
}