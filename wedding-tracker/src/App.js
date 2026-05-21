import React, { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { ref, onValue, set, push, remove, update, serverTimestamp } from "firebase/database";

// Cloudinary config — for photo uploads (free, no credit card needed)
const CLOUDINARY = {
  cloudName: "dfiekkr9x",
  uploadPreset: "wedding_bills",
};

/* ═══════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════ */
const DEFAULT_CATEGORIES = {
  "Venue & Catering": 400000, "Decor & Florals": 100000, "Photography": 120000,
  "Apparel": 100000, "Jewellery": 150000, "Travel & Transport": 80000,
  "Gifts & Favours": 70000, "Ceremonies & Rituals": 50000, "Entertainment": 50000,
  "Honeymoon": 0, "Miscellaneous": 50000, "Contingency": 80000,
};
const ENGAGEMENT_DATE = new Date("2026-08-23");
const WEDDING_DATE = new Date("2026-11-11");
const PAYMENT_MODES = ["UPI", "Cash", "Credit Card", "Debit Card", "Bank Transfer", "Cheque", "Other"];
const NAME = { Bride: "Sanjana", Groom: "Akhil", Both: "Both" };
const dn = (v) => NAME[v] || v;

/* ═══════════════════════════════════════════════════════════════════════
   COLOR TOKENS — refined for better contrast
   ═══════════════════════════════════════════════════════════════════════ */
const C = {
  bg: "#FBF6EE",          // softer cream
  bg2: "#F5E8DB",         // gradient end
  ink: "#2B2018",         // near-black, high contrast
  inkSoft: "#5C4A3D",     // for secondary text — much better than 8C7B6F
  inkFaint: "#8A7568",    // for hint text only
  border: "#D9CCBC",
  borderLight: "#EDE3D5",
  cardBg: "#FFFFFF",
  brand: "#9B5536",       // deeper terracotta
  brandSoft: "#C17950",
  brandBg: "#FBE9DC",
  rose: "#8B4A56",        // deeper rose
  roseSoft: "#C4908B",
  roseBg: "#F8E0E2",
  sage: "#4F6B53",        // deeper sage
  sageSoft: "#A8B5A0",
  sageBg: "#E4EDE0",
  gold: "#B89432",
  goldSoft: "#D4AF37",
  goldBg: "#F5EBC9",
  plum: "#5A3A52",
  plumBg: "#EBDCE6",
  red: "#8B2A2A",
  redBg: "#F5D5D5",
  amber: "#A05B1F",
  amberBg: "#F8E1C5",
};

/* ═══════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════ */
const fmtL = (n) => {
  if (!n && n !== 0) return "₹0";
  const a = Math.abs(n); const s = n < 0 ? "-" : "";
  if (a >= 100000) return s + "₹" + (a / 100000).toFixed(a % 100000 === 0 ? 0 : 1) + "L";
  return s + "₹" + a.toLocaleString("en-IN");
};
const fmtFull = (n) => "₹" + Math.abs(n).toLocaleString("en-IN");
const fmtDate = (d) => { if (!d) return ""; try { return new Date(d).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }); } catch { return d; } };
const fmtDateShort = (d) => { if (!d) return ""; try { return new Date(d).toLocaleDateString("en-IN", { day:"numeric", month:"short" }); } catch { return d; } };
const daysUntil = (d) => { if (!d) return null; const t = new Date(); t.setHours(0,0,0,0); const target = new Date(d); target.setHours(0,0,0,0); return Math.round((target - t) / 86400000); };
const countdown = (target) => {
  const t = new Date(); t.setHours(0,0,0,0);
  if (t >= target) return target === ENGAGEMENT_DATE ? "Done! 💍" : "Today! 🎊";
  const d = Math.ceil((target - t) / 86400000);
  if (d > 60) { const m = Math.floor(d / 30); return `${m}M ${d % 30}D`; }
  return `${d} days`;
};
const clean = (obj) => { const o = {}; Object.keys(obj).forEach(k => { if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") o[k] = obj[k]; }); return o; };
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Compress image before upload — caps at ~1MB
async function compressImage(file, maxW = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxW / img.width, maxW / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error("compress failed")), "image/jpeg", quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   EXCEL EXPORT
   ═══════════════════════════════════════════════════════════════════════ */
function exportCSV(expList, payList, categories, catSpending, budget, settlement, bp, gp, bpt, gpt, ts, tsc) {
  let c = "\uFEFF";
  c += "WEDDING EXPENSES SUMMARY\n";
  c += `Total Budget,${budget}\nTotal Spent,${ts}\nRemaining,${budget - tsc - bpt - gpt}\nTotal Shared Costs,${tsc}\n`;
  c += `Sanjana Paid (Shared),${bp}\nAkhil Paid (Shared),${gp}\nSanjana Personal,${bpt}\nAkhil Personal,${gpt}\n`;
  c += `Settlement,${Math.abs(settlement) < 1 ? "All Settled" : settlement > 0 ? "Akhil owes Sanjana " + Math.abs(settlement) : "Sanjana owes Akhil " + Math.abs(settlement)}\n\n`;
  c += "CATEGORY BREAKDOWN\nCategory,Budget,Shared Spent,Sanjana Personal,Akhil Personal,Total Spent,Remaining,% Used\n";
  Object.entries(catSpending).forEach(([cat, d]) => { c += `"${cat}",${d.budget},${d.shared},${d.brideP},${d.groomP},${d.total},${d.budget - d.total},${d.budget > 0 ? ((d.total / d.budget) * 100).toFixed(1) + "%" : "0%"}\n`; });
  c += "\nALL EXPENSES\nDate,Type,Description,Category,Vendor,Paid By,Total Cost,Amount Paid,Payment Mode,Bill Link,Notes\n";
  [...expList].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)).forEach(e => {
    c += `${e.date || ""},${e.type === "shared" ? "Shared" : dn(e.owner) + " Personal"},"${(e.title || "").replace(/"/g, '""')}","${e.category || ""}","${(e.vendor || "").replace(/"/g, '""')}",${e.type === "shared" ? dn(e.paidBy) : dn(e.owner)},${e.totalCost || e.amountPaid || 0},${e.amountPaid || 0},${e.paymentMode || ""},"${(e.photos && e.photos.length ? e.photos.join(" | ") : e.billLink) || ""}","${(e.notes || "").replace(/"/g, '""')}"\n`;
  });
  if (payList.length) {
    c += "\nUPCOMING PAYMENTS\nDue Date,Vendor,Description,Category,Amount,Who Pays,Status,Notes\n";
    [...payList].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).forEach(p => {
      c += `${p.dueDate || ""},"${(p.vendor || "").replace(/"/g, '""')}","${(p.title || "").replace(/"/g, '""')}","${p.category || ""}",${p.amount || 0},${dn(p.whoPays)},${p.status || "Pending"},"${(p.notes || "").replace(/"/g, '""')}"\n`;
    });
  }
  const blob = new Blob([c], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `Wedding_Expenses_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

/* ═══════════════════════════════════════════════════════════════════════
   GLOBAL STYLES
   ═══════════════════════════════════════════════════════════════════════ */
const css = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', -apple-system, sans-serif; color: ${C.ink}; -webkit-font-smoothing: antialiased; }
.serif { font-family: 'Fraunces', Georgia, serif; font-feature-settings: 'ss01'; }
@keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
@keyframes slideIn { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:translateX(0); } }
@keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.5; transform:scale(1.2); } }
@keyframes spin { to { transform: rotate(360deg); } }
.fade-up { animation: fadeUp .35s ease both; }
.slide-in { animation: slideIn .3s ease both; }
.spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; }
.toast-msg { position:fixed; bottom:90px; left:50%; transform:translateX(-50%); background:${C.ink}; color:white; padding:10px 24px; border-radius:24px; font-size:14px; font-weight:600; z-index:100; animation:fadeUp .3s ease; box-shadow:0 8px 24px rgba(0,0,0,0.2); max-width: 90%; }
.btn-primary { background:${C.brand}; color:white; border:none; border-radius:12px; font-weight:600; cursor:pointer; box-shadow:0 4px 12px rgba(155,85,54,.25); transition:transform .1s, box-shadow .2s; }
.btn-primary:hover { box-shadow: 0 6px 16px rgba(155,85,54,.35); }
.btn-primary:active { transform:scale(.98); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.card { background:${C.cardBg}; border-radius:16px; padding:18px; margin-bottom:14px; box-shadow:0 1px 3px rgba(43,32,24,0.06), 0 4px 12px rgba(43,32,24,0.04); }
input, select, textarea { font-family: 'Inter', sans-serif; color: ${C.ink}; }
input:focus, select:focus, textarea:focus { outline:none; border-color:${C.brand}!important; box-shadow:0 0 0 3px rgba(155,85,54,.12); }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
.tab-btn { background:none; border:none; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:2px; padding: 4px 8px; transition: color 0.2s; }
`;

/* ═══════════════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [conn, setConn] = useState("connecting");
  const [tab, setTab] = useState("dashboard");
  const [budget, setBudget] = useState(1200000);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [expenses, setExpenses] = useState({});
  const [payments, setPayments] = useState({});
  const [showExpForm, setShowExpForm] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [editExp, setEditExp] = useState(null);
  const [editPay, setEditPay] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let timers = []; let unsubs = [];
    try {
      unsubs.push(onValue(ref(db, ".info/connected"), s => setConn(s.val() ? "connected" : "offline")));
      unsubs.push(onValue(ref(db, "settings/budget"), s => { if (s.exists()) setBudget(s.val()); }, e => console.warn(e.message)));
      unsubs.push(onValue(ref(db, "settings/categories"), s => { if (s.exists()) setCategories(s.val()); }, e => console.warn(e.message)));
      unsubs.push(onValue(ref(db, "expenses"), s => { setExpenses(s.exists() ? s.val() : {}); setLoading(false); }, e => { console.warn(e.message); setLoading(false); }));
      unsubs.push(onValue(ref(db, "payments"), s => { setPayments(s.exists() ? s.val() : {}); }, e => console.warn(e.message)));
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
  const saveBudget = v => set(ref(db, "settings/budget"), v).catch(() => showToast("⚠️ Save failed"));
  const saveCats = c => set(ref(db, "settings/categories"), c).catch(() => showToast("⚠️ Save failed"));
  const addExp = d => set(push(ref(db, "expenses")), { ...clean(d), createdAt: new Date().toISOString() })
    .then(() => showToast("Expense added ✓"))
    .catch(err => { console.error(err); showToast("⚠️ Failed: " + (err.message || "unknown")); });
  const updExp = (id, d) => update(ref(db, `expenses/${id}`), clean(d))
    .then(() => showToast("Updated ✓"))
    .catch(err => { console.error(err); showToast("⚠️ Update failed"); });
  const delExp = id => remove(ref(db, `expenses/${id}`)).then(() => showToast("Deleted ✓")).catch(() => showToast("⚠️ Failed"));

  const addPay = d => set(push(ref(db, "payments")), { ...clean(d), createdAt: new Date().toISOString(), status: d.status || "Pending" })
    .then(() => showToast("Payment scheduled ✓"))
    .catch(err => { console.error(err); showToast("⚠️ Failed"); });
  const updPay = (id, d) => update(ref(db, `payments/${id}`), clean(d)).then(() => showToast("Updated ✓")).catch(() => showToast("⚠️ Failed"));
  const delPay = id => remove(ref(db, `payments/${id}`)).then(() => showToast("Deleted ✓")).catch(() => showToast("⚠️ Failed"));

  // Convert an upcoming payment into a paid expense
  const markPayAsPaid = (pay) => {
    const expData = {
      type: pay.shared ? "shared" : "personal",
      owner: pay.shared ? undefined : pay.whoPays,
      date: new Date().toISOString().split("T")[0],
      title: pay.title || pay.vendor,
      category: pay.category,
      vendor: pay.vendor,
      paidBy: pay.shared ? pay.whoPays : pay.whoPays,
      totalCost: pay.amount,
      amountPaid: pay.amount,
      paymentMode: "",
      billLink: "",
      photos: [],
      notes: pay.notes ? `From scheduled payment: ${pay.notes}` : "Converted from scheduled payment",
    };
    addExp(expData);
    delPay(pay.id);
  };

  const expList = Object.entries(expenses).map(([id, e]) => ({ id, ...e }));
  const payList = Object.entries(payments).map(([id, p]) => ({ id, ...p }));
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

  if (loading) return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:12 }}>💍</div>
        <div className="serif" style={{ fontSize:18, color:C.inkSoft, letterSpacing:1.5 }}>Connecting...</div>
      </div>
    </div>
  );

  const doExport = () => exportCSV(expList, payList, categories, catS, budget, sett, bp, gp, bpt, gpt, ts, tsc);

  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(180deg, ${C.bg} 0%, ${C.bg2} 100%)`, position:"relative" }}>
      <style>{css}</style>
      {toast && <div className="toast-msg">{toast}</div>}

      {/* Header */}
      <Header conn={conn} onSettings={() => setShowSettings(true)} />

      {/* Tab Content */}
      <div style={{ padding:"0 0 84px" }}>
        {tab==="dashboard" && <DashTab budget={budget} ts={ts} rem={rem} tsc={tsc} sett={sett} bp={bp} gp={gp} bsh={tsc/2} bpt={bpt} gpt={gpt} catS={catS} payList={payList} />}
        {tab==="expenses" && <ExpTab exps={expList} onAdd={()=>{setEditExp(null);setShowExpForm(true);}} onEdit={e=>{setEditExp(e);setShowExpForm(true);}} onDel={id=>{if(window.confirm("Delete this expense?")) delExp(id);}} />}
        {tab==="vendors" && <VendorsTab expList={expList} payList={payList} />}
        {tab==="upcoming" && <UpcomingTab payList={payList} onAdd={()=>{setEditPay(null);setShowPayForm(true);}} onEdit={p=>{setEditPay(p);setShowPayForm(true);}} onDel={id=>{if(window.confirm("Delete this scheduled payment?")) delPay(id);}} onMarkPaid={markPayAsPaid} />}
        {tab==="insights" && <InsTab data={{expList, payList, shared, brideP, groomP, tsc, bp, gp, bpt, gpt, ts, rem, sett, budget, catS}} onExport={doExport} />}
      </div>

      {/* Modals */}
      {showExpForm && <ExpModal cats={Object.keys(categories)} init={editExp} onSave={d => { editExp ? updExp(editExp.id, d) : addExp(d); setShowExpForm(false); setEditExp(null); }} onClose={() => { setShowExpForm(false); setEditExp(null); }} />}
      {showPayForm && <PayModal cats={Object.keys(categories)} init={editPay} onSave={d => { editPay ? updPay(editPay.id, d) : addPay(d); setShowPayForm(false); setEditPay(null); }} onClose={() => { setShowPayForm(false); setEditPay(null); }} />}
      {showSettings && <SettingsModal budget={budget} saveBudget={saveBudget} categories={categories} saveCats={saveCats} catS={catS} showToast={showToast} onExport={doExport} onClose={() => setShowSettings(false)} />}

      {/* Bottom Nav — 5 tabs */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"rgba(251,246,238,0.96)", backdropFilter:"blur(14px)", borderTop:`1px solid ${C.borderLight}`, display:"flex", justifyContent:"space-around", padding:"8px 0 12px", zIndex:50 }}>
        {[
          { id:"dashboard", icon:"◈", label:"Home" },
          { id:"expenses", icon:"◎", label:"Expenses" },
          { id:"vendors", icon:"⬡", label:"Vendors" },
          { id:"upcoming", icon:"◔", label:"Upcoming" },
          { id:"insights", icon:"◉", label:"Insights" },
        ].map(t => (
          <button key={t.id} className="tab-btn" onClick={() => setTab(t.id)} style={{ color: tab===t.id ? C.brand : C.inkFaint, fontWeight: tab===t.id ? 700 : 500 }}>
            <span style={{ fontSize:20, lineHeight:1 }}>{t.icon}</span>
            <span style={{ fontSize:10, letterSpacing:0.3 }}>{t.label}</span>
            {tab===t.id && <div style={{ width:4, height:4, borderRadius:"50%", background:C.goldSoft, marginTop:1 }} />}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   HEADER
   ═══════════════════════════════════════════════════════════════════════ */
function Header({ conn, onSettings }) {
  return (
    <div style={{ background:`linear-gradient(135deg, ${C.ink} 0%, #4A3A2D 100%)`, padding:"22px 20px 18px", color:"white", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:-30, right:-30, width:140, height:140, borderRadius:"50%", background:"rgba(212,175,55,0.08)" }} />
      <div style={{ position:"absolute", bottom:-40, left:-20, width:100, height:100, borderRadius:"50%", background:"rgba(196,144,139,0.12)" }} />
      <div style={{ position:"relative", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div className="serif" style={{ fontSize:28, fontWeight:600, letterSpacing:0.3, marginBottom:3, display:"flex", alignItems:"center", gap:10 }}>
            <span>Wedding Planner</span>
            <span title={conn === "connected" ? "Synced" : "Offline"} style={{ fontSize:9, fontFamily:"'Inter',sans-serif", fontWeight:700, letterSpacing:0.8, padding:"3px 8px", borderRadius:10, display:"inline-flex", alignItems:"center", gap:5, background: conn==="connected"?"rgba(168,181,160,0.25)":"rgba(255,180,180,0.2)", border: `1px solid ${conn==="connected"?"rgba(168,181,160,0.5)":"rgba(255,180,180,0.4)"}`, color: conn==="connected"?"#D4F0D0":"#FFD0D0" }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background: conn==="connected"?C.sageSoft:"#E8A8A8", animation: conn==="connected"?"none":"pulse 1.5s ease infinite" }} />
              {conn === "connected" ? "SYNCED" : "OFFLINE"}
            </span>
          </div>
          <div style={{ fontSize:11, opacity:0.7, letterSpacing:1.8, textTransform:"uppercase", fontWeight:500 }}>Sanjana & Akhil</div>
        </div>
        <button onClick={onSettings} aria-label="Settings" style={{ background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.15)", color:"white", padding:"8px 10px", borderRadius:10, cursor:"pointer", fontSize:16 }}>⚙</button>
      </div>
      <div style={{ display:"flex", gap:8, marginTop:14, position:"relative" }}>
        {[{ l:"Engagement", d:ENGAGEMENT_DATE, e:"💍" }, { l:"Wedding", d:WEDDING_DATE, e:"🎊" }].map((ev,i) => (
          <div key={i} style={{ flex:1, background:"rgba(255,255,255,0.10)", borderRadius:12, padding:"10px 14px", border:"1px solid rgba(255,255,255,0.15)" }}>
            <div style={{ fontSize:10, opacity:0.75, textTransform:"uppercase", letterSpacing:1.2, fontWeight:600 }}>{ev.e} {ev.l}</div>
            <div className="serif" style={{ fontSize:17, fontWeight:600, marginTop:3 }}>{countdown(ev.d)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DASHBOARD TAB
   ═══════════════════════════════════════════════════════════════════════ */
function DashTab({ budget, ts, rem, tsc, sett, bp, gp, bsh, bpt, gpt, catS, payList }) {
  const pct = budget > 0 ? Math.min((ts / budget) * 100, 100) : 0;
  const upcoming = payList.filter(p => p.status !== "Paid").sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 3);

  return (
    <div style={{ padding:16 }} className="fade-up">
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
        <KpiCard label="Budget" value={fmtL(budget)} bg={`linear-gradient(135deg, ${C.ink}, #4A3A2D)`} />
        <KpiCard label="Spent" value={fmtL(ts)} bg={`linear-gradient(135deg, ${C.rose}, ${C.roseSoft})`} />
        <KpiCard label="Remaining" value={fmtL(rem)} bg={`linear-gradient(135deg, ${C.sage}, ${C.sageSoft})`} neg={rem<0} />
        <KpiCard label="Shared" value={fmtL(tsc)} bg={`linear-gradient(135deg, ${C.brand}, ${C.brandSoft})`} />
      </div>

      <div className="card">
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
          <span style={{ fontSize:13, fontWeight:600, color:C.inkSoft }}>Budget Used</span>
          <span className="serif" style={{ fontSize:16, fontWeight:600, color: pct>90 ? C.red : C.sage }}>{pct.toFixed(1)}%</span>
        </div>
        <div style={{ height:8, background:C.borderLight, borderRadius:4, overflow:"hidden" }}>
          <div style={{ height:"100%", borderRadius:4, transition:"width 0.6s", width:`${pct}%`, background: pct>90 ? `linear-gradient(90deg, ${C.brand}, ${C.red})` : `linear-gradient(90deg, ${C.sageSoft}, ${C.sage})` }} />
        </div>
      </div>

      {/* Settlement */}
      <div style={{ background:`linear-gradient(135deg, ${C.brand}, ${C.brandSoft})`, borderRadius:16, padding:20, marginBottom:14, color:"white", boxShadow:"0 6px 20px rgba(155,85,54,0.25)" }}>
        <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:1.5, opacity:0.85, marginBottom:8, fontWeight:600 }}>Settlement</div>
        <div className="serif" style={{ fontSize:26, fontWeight:600, marginBottom:6, lineHeight:1.2 }}>
          {Math.abs(sett)<1 ? "All Settled ✓" : sett>0 ? `Akhil owes ${fmtFull(sett)}` : `Sanjana owes ${fmtFull(Math.abs(sett))}`}
        </div>
        <div style={{ fontSize:12, opacity:0.85, lineHeight:1.5 }}>
          Sanjana paid {fmtL(bp)} · Akhil paid {fmtL(gp)} toward shared
        </div>
        <div style={{ display:"flex", gap:8, marginTop:14 }}>
          <MS label="Sanjana's share" value={fmtL(bsh)} />
          <MS label="Akhil's share" value={fmtL(bsh)} />
        </div>
      </div>

      {/* Upcoming Payments Alert */}
      {upcoming.length > 0 && (
        <div className="card" style={{ borderLeft:`4px solid ${C.amber}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <span style={{ fontSize:13, fontWeight:700, color:C.ink }}>⏰ Upcoming Payments</span>
            <span style={{ fontSize:11, color:C.inkSoft }}>Next {upcoming.length}</span>
          </div>
          {upcoming.map(p => {
            const days = daysUntil(p.dueDate);
            const overdue = days !== null && days < 0;
            const urgent = days !== null && days >= 0 && days <= 7;
            return (
              <div key={p.id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${C.borderLight}` }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:C.ink }}>{p.vendor || p.title}</div>
                  <div style={{ fontSize:11, color: overdue ? C.red : urgent ? C.amber : C.inkSoft, fontWeight: (overdue||urgent) ? 600 : 400 }}>
                    {fmtDateShort(p.dueDate)} · {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d to go`}
                  </div>
                </div>
                <div className="serif" style={{ fontSize:15, fontWeight:600, color:C.ink }}>{fmtL(p.amount)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Personal */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
        <div className="card" style={{ marginBottom:0 }}>
          <div style={{ fontSize:11, color:C.rose, textTransform:"uppercase", letterSpacing:1.2, marginBottom:6, fontWeight:600 }}>✿ Sanjana</div>
          <div className="serif" style={{ fontSize:20, fontWeight:600, color:C.ink }}>{fmtL(bpt)}</div>
        </div>
        <div className="card" style={{ marginBottom:0 }}>
          <div style={{ fontSize:11, color:C.sage, textTransform:"uppercase", letterSpacing:1.2, marginBottom:6, fontWeight:600 }}>❖ Akhil</div>
          <div className="serif" style={{ fontSize:20, fontWeight:600, color:C.ink }}>{fmtL(gpt)}</div>
        </div>
      </div>

      {/* Categories */}
      <div className="card">
        <div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:14 }}>Category Breakdown</div>
        {Object.entries(catS).map(([cat, d], i) => {
          const p = d.budget > 0 ? Math.min((d.total/d.budget)*100, 100) : 0;
          const ov = d.total > d.budget && d.budget > 0;
          return (
            <div key={cat} className="slide-in" style={{ marginBottom:14, animationDelay:`${i*.03}s` }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:13, fontWeight:500, color: ov ? C.red : C.ink }}>{cat}</span>
                <span style={{ fontSize:12, color:C.inkSoft, fontWeight:500 }}>{fmtL(d.total)} / {fmtL(d.budget)}</span>
              </div>
              <div style={{ height:6, background:C.borderLight, borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:3, transition:"width .5s", width:`${p}%`, background: ov ? C.red : p>75 ? C.brand : C.sageSoft }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, value, bg, neg }) {
  return (
    <div style={{ background:bg, borderRadius:14, padding:"14px 16px", color:"white", boxShadow:"0 4px 12px rgba(0,0,0,0.08)" }}>
      <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:1.2, opacity:0.85, fontWeight:600 }}>{label}</div>
      <div className="serif" style={{ fontSize:22, fontWeight:600, marginTop:4, color: neg ? "#FFC4C4" : "white" }}>{value}</div>
    </div>
  );
}
function MS({ label, value }) {
  return (
    <div style={{ flex:1, background:"rgba(255,255,255,0.15)", borderRadius:8, padding:"7px 10px" }}>
      <div style={{ fontSize:10, opacity:0.8, fontWeight:500 }}>{label}</div>
      <div style={{ fontSize:14, fontWeight:700 }}>{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   EXPENSES TAB
   ═══════════════════════════════════════════════════════════════════════ */
function ExpTab({ exps, onAdd, onEdit, onDel }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = exps.filter(e => {
    if (filter === "shared" && e.type !== "shared") return false;
    if (filter === "Bride" && !(e.type === "personal" && e.owner === "Bride")) return false;
    if (filter === "Groom" && !(e.type === "personal" && e.owner === "Groom")) return false;
    if (search && !(e.title || "").toLowerCase().includes(search.toLowerCase()) && !(e.vendor || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const sorted = [...filtered].sort((a,b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

  return (
    <div style={{ padding:16 }} className="fade-up">
      <div style={{ display:"flex", gap:6, marginBottom:10, overflowX:"auto", paddingBottom:4 }}>
        {[{id:"all",l:"All"},{id:"shared",l:"Shared"},{id:"Bride",l:"✿ Sanjana"},{id:"Groom",l:"❖ Akhil"}].map(x => (
          <button key={x.id} onClick={()=>setFilter(x.id)} style={{ background: filter===x.id ? C.ink : "white", color: filter===x.id ? "white" : C.inkSoft, border:`1px solid ${C.border}`, borderRadius:20, padding:"6px 14px", fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>{x.l}</button>
        ))}
      </div>
      <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search by description or vendor..." style={{ width:"100%", padding:"10px 14px", border:`1px solid ${C.border}`, borderRadius:10, fontSize:13, background:"white", marginBottom:14 }} />

      <button className="btn-primary" onClick={onAdd} style={{ width:"100%", padding:14, fontSize:15, marginBottom:16 }}>+ Add Expense</button>

      {sorted.length===0 ? (
        <div style={{ textAlign:"center", padding:40, color:C.inkFaint }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📝</div>
          <div style={{ fontSize:14 }}>{exps.length === 0 ? "No expenses yet" : "No matches"}</div>
        </div>
      ) : sorted.map((e,i) => (
        <div key={e.id} className="slide-in" style={{ background:"white", borderRadius:14, padding:14, marginBottom:10, boxShadow:"0 1px 4px rgba(43,32,24,0.06)", borderLeft:`4px solid ${e.type==="shared" ? C.brand : e.owner==="Bride" ? C.roseSoft : C.sageSoft}`, animationDelay:`${i*.04}s` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:15, fontWeight:600, color:C.ink, marginBottom:2 }}>{e.title}</div>
              {e.vendor && <div style={{ fontSize:12, color:C.brand, fontWeight:600, marginBottom:3 }}>{e.vendor}</div>}
              <div style={{ fontSize:11, color:C.inkSoft, lineHeight:1.5 }}>
                {fmtDate(e.date)} · {e.category} · {e.type==="shared" ? `Shared · Paid by ${dn(e.paidBy)}` : `${dn(e.owner)}'s personal`}{e.paymentMode ? ` · ${e.paymentMode}` : ""}
              </div>
              {e.notes && <div style={{ fontSize:11, color:C.inkFaint, marginTop:5, fontStyle:"italic" }}>{e.notes}</div>}
              {(e.photos && e.photos.length > 0) && (
                <div style={{ display:"flex", gap:6, marginTop:8 }}>
                  {e.photos.slice(0, 4).map((url, idx) => (
                    <a key={idx} href={url} target="_blank" rel="noopener noreferrer" style={{ width:46, height:46, borderRadius:6, overflow:"hidden", background:`url(${url}) center/cover`, border:`1px solid ${C.border}` }} />
                  ))}
                  {e.photos.length > 4 && <div style={{ width:46, height:46, borderRadius:6, background:C.borderLight, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:C.inkSoft }}>+{e.photos.length-4}</div>}
                </div>
              )}
              {e.billLink && (
                <a href={e.billLink} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:C.brand, marginTop:6, display:"inline-block", textDecoration:"none", fontWeight:600 }}>📎 View link →</a>
              )}
            </div>
            <div style={{ textAlign:"right", marginLeft:12 }}>
              <div className="serif" style={{ fontSize:18, fontWeight:600, color:C.ink }}>{fmtL(e.type==="shared" ? e.totalCost : e.amountPaid)}</div>
              {e.type==="shared" && (e.totalCost||0) !== (e.amountPaid||0) && <div style={{ fontSize:11, color:C.sage, marginTop:2, fontWeight:500 }}>Paid: {fmtL(e.amountPaid)}</div>}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:10, justifyContent:"flex-end" }}>
            <button onClick={()=>onEdit(e)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 12px", fontSize:11, color:C.inkSoft, cursor:"pointer", fontWeight:500 }}>Edit</button>
            <button onClick={()=>onDel(e.id)} style={{ background:"none", border:`1px solid ${C.redBg}`, borderRadius:6, padding:"4px 12px", fontSize:11, color:C.red, cursor:"pointer", fontWeight:500 }}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   VENDORS TAB (NEW)
   ═══════════════════════════════════════════════════════════════════════ */
function VendorsTab({ expList, payList }) {
  // Group by vendor
  const vendors = {};
  expList.forEach(e => {
    const v = (e.vendor || "").trim();
    if (!v) return;
    if (!vendors[v]) vendors[v] = { name: v, expenses: [], payments: [], totalCost: 0, paid: 0, category: e.category };
    vendors[v].expenses.push(e);
    vendors[v].totalCost = Math.max(vendors[v].totalCost, e.totalCost || e.amountPaid || 0);
    vendors[v].paid += (e.amountPaid || 0);
  });
  payList.forEach(p => {
    const v = (p.vendor || "").trim();
    if (!v) return;
    if (!vendors[v]) vendors[v] = { name: v, expenses: [], payments: [], totalCost: 0, paid: 0, category: p.category };
    vendors[v].payments.push(p);
  });

  const vendorList = Object.values(vendors).sort((a, b) => b.paid - a.paid);
  const [expanded, setExpanded] = useState(null);

  return (
    <div style={{ padding:16 }} className="fade-up">
      <div className="card" style={{ background: `linear-gradient(135deg, ${C.plum}, #7B5570)`, color:"white" }}>
        <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:1.5, opacity:0.85, marginBottom:4, fontWeight:600 }}>Vendor Overview</div>
        <div className="serif" style={{ fontSize:24, fontWeight:600 }}>{vendorList.length} vendor{vendorList.length !== 1 ? "s" : ""}</div>
        <div style={{ fontSize:12, opacity:0.85, marginTop:4 }}>Tap a vendor to see all transactions</div>
      </div>

      {vendorList.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, color:C.inkFaint }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🏪</div>
          <div style={{ fontSize:14 }}>No vendors yet</div>
          <div style={{ fontSize:12, marginTop:6 }}>Add a vendor name when logging expenses</div>
        </div>
      ) : vendorList.map(v => {
        const balance = v.totalCost - v.paid;
        const isExp = expanded === v.name;
        const lastPayment = v.expenses.length ? v.expenses.sort((a,b) => new Date(b.date) - new Date(a.date))[0] : null;
        const upcomingForVendor = v.payments.filter(p => p.status !== "Paid");
        const nextDue = upcomingForVendor.sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate))[0];

        return (
          <div key={v.name} className="card slide-in" style={{ padding:0, overflow:"hidden" }}>
            <button onClick={() => setExpanded(isExp ? null : v.name)} style={{ width:"100%", padding:14, background:"none", border:"none", textAlign:"left", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:600, color:C.ink }}>{v.name}</div>
                <div style={{ fontSize:11, color:C.inkSoft, marginTop:2 }}>{v.category} · {v.expenses.length} payment{v.expenses.length !== 1 ? "s" : ""}{upcomingForVendor.length > 0 ? ` · ${upcomingForVendor.length} scheduled` : ""}</div>
                {nextDue && <div style={{ fontSize:11, color:C.amber, fontWeight:600, marginTop:3 }}>Next: {fmtL(nextDue.amount)} due {fmtDateShort(nextDue.dueDate)}</div>}
              </div>
              <div style={{ textAlign:"right" }}>
                <div className="serif" style={{ fontSize:17, fontWeight:600, color:C.ink }}>{fmtL(v.paid)}</div>
                {balance > 0 && <div style={{ fontSize:11, color:C.red, fontWeight:600, marginTop:2 }}>{fmtL(balance)} due</div>}
                {v.totalCost > 0 && balance <= 0 && <div style={{ fontSize:11, color:C.sage, fontWeight:600, marginTop:2 }}>✓ Settled</div>}
                <div style={{ fontSize:14, color:C.inkFaint, marginTop:4 }}>{isExp ? "▴" : "▾"}</div>
              </div>
            </button>

            {isExp && (
              <div style={{ borderTop:`1px solid ${C.borderLight}`, padding:14, background:C.bg }}>
                {/* Progress bar if total cost is set */}
                {v.totalCost > 0 && (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                      <span style={{ fontSize:11, color:C.inkSoft, fontWeight:600 }}>Progress</span>
                      <span style={{ fontSize:11, color:C.inkSoft, fontWeight:600 }}>{fmtL(v.paid)} / {fmtL(v.totalCost)}</span>
                    </div>
                    <div style={{ height:6, background:C.borderLight, borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", borderRadius:3, width:`${Math.min((v.paid/v.totalCost)*100, 100)}%`, background:`linear-gradient(90deg, ${C.sageSoft}, ${C.sage})` }} />
                    </div>
                  </div>
                )}

                <div style={{ fontSize:11, color:C.inkSoft, fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Payments</div>
                {v.expenses.sort((a,b) => new Date(b.date) - new Date(a.date)).map(e => (
                  <div key={e.id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${C.borderLight}` }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, color:C.ink }}>{e.title}</div>
                      <div style={{ fontSize:11, color:C.inkSoft }}>{fmtDateShort(e.date)} · {dn(e.paidBy) || dn(e.owner)}{e.paymentMode ? ` · ${e.paymentMode}` : ""}</div>
                    </div>
                    <div className="serif" style={{ fontSize:14, fontWeight:600, color:C.ink }}>{fmtL(e.amountPaid)}</div>
                  </div>
                ))}

                {upcomingForVendor.length > 0 && (
                  <>
                    <div style={{ fontSize:11, color:C.amber, fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginTop:14, marginBottom:8 }}>Upcoming</div>
                    {upcomingForVendor.sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate)).map(p => (
                      <div key={p.id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${C.borderLight}` }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:500, color:C.ink }}>{p.title || "Installment"}</div>
                          <div style={{ fontSize:11, color:C.amber, fontWeight:600 }}>Due {fmtDateShort(p.dueDate)}</div>
                        </div>
                        <div className="serif" style={{ fontSize:14, fontWeight:600, color:C.ink }}>{fmtL(p.amount)}</div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   UPCOMING PAYMENTS TAB (NEW)
   ═══════════════════════════════════════════════════════════════════════ */
function UpcomingTab({ payList, onAdd, onEdit, onDel, onMarkPaid }) {
  const pending = payList.filter(p => p.status !== "Paid").sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));
  const paid = payList.filter(p => p.status === "Paid");
  const totalDue = pending.reduce((s,p) => s + (p.amount || 0), 0);
  const overdueCount = pending.filter(p => { const d = daysUntil(p.dueDate); return d !== null && d < 0; }).length;

  return (
    <div style={{ padding:16 }} className="fade-up">
      {/* Summary card */}
      <div className="card" style={{ background:`linear-gradient(135deg, ${C.amber}, #C77F4A)`, color:"white" }}>
        <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:1.5, opacity:0.85, marginBottom:4, fontWeight:600 }}>Upcoming Total</div>
        <div className="serif" style={{ fontSize:26, fontWeight:600 }}>{fmtL(totalDue)}</div>
        <div style={{ fontSize:12, opacity:0.85, marginTop:4 }}>{pending.length} payment{pending.length !== 1 ? "s" : ""} pending{overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}</div>
      </div>

      <button className="btn-primary" onClick={onAdd} style={{ width:"100%", padding:14, fontSize:15, marginBottom:16 }}>+ Schedule Payment</button>

      {pending.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, color:C.inkFaint }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📅</div>
          <div style={{ fontSize:14 }}>No upcoming payments scheduled</div>
          <div style={{ fontSize:12, marginTop:6 }}>Add deposits, installments, or future commitments</div>
        </div>
      ) : pending.map((p,i) => {
        const days = daysUntil(p.dueDate);
        const overdue = days !== null && days < 0;
        const urgent = days !== null && days >= 0 && days <= 7;
        const accent = overdue ? C.red : urgent ? C.amber : C.inkSoft;

        return (
          <div key={p.id} className="card slide-in" style={{ borderLeft:`4px solid ${accent}`, animationDelay:`${i*.04}s` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:600, color:C.ink }}>{p.vendor || p.title}</div>
                {p.title && p.vendor && <div style={{ fontSize:12, color:C.inkSoft, marginTop:2 }}>{p.title}</div>}
                <div style={{ fontSize:11, color:accent, fontWeight:600, marginTop:5 }}>
                  {fmtDate(p.dueDate)} · {overdue ? `${Math.abs(days)} days overdue` : days === 0 ? "Due today" : `${days} days to go`}
                </div>
                <div style={{ fontSize:11, color:C.inkSoft, marginTop:3 }}>
                  {p.category} · {p.shared ? "Shared" : "Personal"} · {dn(p.whoPays)}
                </div>
                {p.notes && <div style={{ fontSize:11, color:C.inkFaint, marginTop:5, fontStyle:"italic" }}>{p.notes}</div>}
              </div>
              <div className="serif" style={{ fontSize:18, fontWeight:600, color:C.ink, marginLeft:12 }}>{fmtL(p.amount)}</div>
            </div>
            <div style={{ display:"flex", gap:8, marginTop:12, justifyContent:"flex-end" }}>
              <button onClick={() => { if (window.confirm(`Mark "${p.vendor || p.title}" as paid? This will create an expense entry.`)) onMarkPaid(p); }} style={{ background:C.sage, color:"white", border:"none", borderRadius:6, padding:"6px 14px", fontSize:11, cursor:"pointer", fontWeight:600 }}>✓ Mark Paid</button>
              <button onClick={()=>onEdit(p)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"6px 12px", fontSize:11, color:C.inkSoft, cursor:"pointer", fontWeight:500 }}>Edit</button>
              <button onClick={()=>onDel(p.id)} style={{ background:"none", border:`1px solid ${C.redBg}`, borderRadius:6, padding:"6px 12px", fontSize:11, color:C.red, cursor:"pointer", fontWeight:500 }}>Delete</button>
            </div>
          </div>
        );
      })}

      {paid.length > 0 && (
        <>
          <div style={{ fontSize:11, color:C.inkSoft, fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginTop:24, marginBottom:8 }}>Completed</div>
          {paid.map(p => (
            <div key={p.id} className="card" style={{ opacity:0.6 }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:500, color:C.ink, textDecoration:"line-through" }}>{p.vendor || p.title}</div>
                  <div style={{ fontSize:11, color:C.sage, fontWeight:600 }}>✓ Paid</div>
                </div>
                <div className="serif" style={{ fontSize:16, color:C.inkSoft }}>{fmtL(p.amount)}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   INSIGHTS TAB
   ═══════════════════════════════════════════════════════════════════════ */
function InsTab({ data, onExport }) {
  const { expList, payList, shared, brideP, groomP, tsc, bp, gp, bpt, gpt, ts, sett, budget, catS } = data;
  const n = expList.length;
  const avg = n > 0 ? ts / n : 0;
  const biggest = n > 0 ? expList.reduce((mx, e) => (e.amountPaid || 0) > (mx.amountPaid || 0) ? e : mx, expList[0]) : null;
  const catRank = Object.entries(catS).filter(([,d]) => d.total > 0).sort((a, b) => b[1].total - a[1].total);
  const overBud = Object.entries(catS).filter(([,d]) => d.total > d.budget && d.budget > 0);
  const payM = {}; expList.forEach(e => { const m = e.paymentMode || "Unspecified"; payM[m] = (payM[m] || 0) + (e.amountPaid || 0); });
  const monthly = {}; expList.forEach(e => { if (!e.date) return; const k = e.date.substring(0, 7); monthly[k] = (monthly[k] || 0) + (e.amountPaid || 0); });
  const vendorBal = tsc - shared.reduce((s, e) => s + (e.amountPaid || 0), 0);
  const upcomingTotal = payList.filter(p => p.status !== "Paid").reduce((s,p) => s + (p.amount || 0), 0);

  const SR = ({ label, value, color }) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.borderLight}` }}>
      <span style={{ fontSize:13, color:C.inkSoft, fontWeight:500 }}>{label}</span>
      <span className="serif" style={{ fontSize:14, fontWeight:600, color: color || C.ink }}>{value}</span>
    </div>
  );

  return (
    <div style={{ padding:16 }} className="fade-up">
      <button onClick={onExport} className="btn-primary" style={{ width:"100%", padding:14, fontSize:15, marginBottom:16, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>📊 Download Excel / CSV</button>

      <div className="card">
        <div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:8 }}>Overview</div>
        <SR label="Total Expenses Logged" value={n} />
        <SR label="Shared Expenses" value={shared.length} />
        <SR label="Personal Expenses" value={n - shared.length} />
        <SR label="Upcoming Payments" value={fmtL(upcomingTotal)} color={C.amber} />
        <SR label="Average Expense" value={fmtL(Math.round(avg))} />
        {biggest && <SR label="Largest Payment" value={`${fmtL(biggest.amountPaid)} — ${biggest.title}`} color={C.brand} />}
      </div>

      <div className="card">
        <div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:12 }}>Who Paid What</div>
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <div style={{ flex: (bp+bpt) || 1, background:`linear-gradient(90deg, ${C.roseSoft}, ${C.rose})`, borderRadius:8, padding:"10px 12px", color:"white", minWidth:60 }}>
            <div style={{ fontSize:10, opacity:0.85, fontWeight:600 }}>Sanjana</div>
            <div className="serif" style={{ fontSize:17, fontWeight:600 }}>{fmtL(bp+bpt)}</div>
          </div>
          <div style={{ flex: (gp+gpt) || 1, background:`linear-gradient(90deg, ${C.sageSoft}, ${C.sage})`, borderRadius:8, padding:"10px 12px", color:"white", minWidth:60 }}>
            <div style={{ fontSize:10, opacity:0.85, fontWeight:600 }}>Akhil</div>
            <div className="serif" style={{ fontSize:17, fontWeight:600 }}>{fmtL(gp+gpt)}</div>
          </div>
        </div>
        <SR label="Sanjana — Shared" value={fmtL(bp)} color={C.rose} />
        <SR label="Sanjana — Personal" value={fmtL(bpt)} color={C.rose} />
        <SR label="Akhil — Shared" value={fmtL(gp)} color={C.sage} />
        <SR label="Akhil — Personal" value={fmtL(gpt)} color={C.sage} />
      </div>

      {vendorBal > 0 && (
        <div style={{ background:`linear-gradient(135deg, ${C.red}, #A85060)`, borderRadius:14, padding:16, marginBottom:14, color:"white" }}>
          <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:1.5, opacity:0.85, fontWeight:600 }}>Unpaid Vendor Balance</div>
          <div className="serif" style={{ fontSize:22, fontWeight:600, marginTop:4 }}>{fmtL(vendorBal)}</div>
          <div style={{ fontSize:12, opacity:0.85, marginTop:4 }}>Still owed for shared expenses</div>
        </div>
      )}

      {catRank.length > 0 && (
        <div className="card">
          <div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:8 }}>Top Categories</div>
          {catRank.slice(0, 5).map(([cat, d], i) => (
            <div key={cat} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${C.borderLight}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span className="serif" style={{ fontSize:18, fontWeight:600, color:C.goldSoft, width:26 }}>#{i+1}</span>
                <span style={{ fontSize:13, color:C.ink }}>{cat}</span>
              </div>
              <div style={{ textAlign:"right" }}>
                <span className="serif" style={{ fontSize:15, fontWeight:600 }}>{fmtL(d.total)}</span>
                <span style={{ fontSize:11, color:C.inkSoft, marginLeft:6 }}>({budget > 0 ? ((d.total/budget)*100).toFixed(1) : 0}%)</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {overBud.length > 0 && (
        <div className="card" style={{ borderLeft:`4px solid ${C.red}` }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.red, marginBottom:8 }}>⚠ Over Budget</div>
          {overBud.map(([cat, d]) => (
            <div key={cat} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0" }}>
              <span style={{ fontSize:13, color:C.ink }}>{cat}</span>
              <span className="serif" style={{ fontSize:13, fontWeight:600, color:C.red }}>{fmtL(d.total-d.budget)} over</span>
            </div>
          ))}
        </div>
      )}

      {Object.keys(payM).length > 0 && (
        <div className="card">
          <div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:8 }}>Payment Methods</div>
          {Object.entries(payM).sort((a,b)=>b[1]-a[1]).map(([m,a]) => (
            <div key={m} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${C.borderLight}` }}>
              <span style={{ fontSize:13, color:C.ink }}>{m}</span>
              <span className="serif" style={{ fontSize:13, fontWeight:600 }}>{fmtL(a)}</span>
            </div>
          ))}
        </div>
      )}

      {Object.keys(monthly).length > 0 && (
        <div className="card">
          <div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:12 }}>Monthly Spending</div>
          {Object.entries(monthly).sort((a,b)=>a[0].localeCompare(b[0])).map(([mo,a]) => {
            const lbl = new Date(mo+"-01").toLocaleDateString("en-IN", { month:"short", year:"numeric" });
            const bw = budget > 0 ? Math.min((a/(budget*.2))*100, 100) : 50;
            return (
              <div key={mo} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:12, color:C.inkSoft, fontWeight:500 }}>{lbl}</span>
                  <span className="serif" style={{ fontSize:13, fontWeight:600 }}>{fmtL(a)}</span>
                </div>
                <div style={{ height:6, background:C.borderLight, borderRadius:3, overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:3, width:`${bw}%`, background:`linear-gradient(90deg, ${C.brand}, ${C.brandSoft})` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {n === 0 && (
        <div style={{ textAlign:"center", padding:40, color:C.inkFaint }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📊</div>
          <div style={{ fontSize:14 }}>Add expenses to see insights</div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PHOTO UPLOADER (used inside modals)
   ═══════════════════════════════════════════════════════════════════════ */
function PhotoUploader({ photos, setPhotos, expenseId }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const cameraRef = useRef(null);
  const fileRef = useRef(null);

  const uploadToCloudinary = (blob) => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", blob);
      formData.append("upload_preset", CLOUDINARY.uploadPreset);
      formData.append("folder", `wedding-bills/${expenseId || "general"}`);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/image/upload`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText);
            resolve(res.secure_url);
          } catch (e) {
            reject(new Error("Invalid response from Cloudinary"));
          }
        } else {
          let errMsg = `Upload failed (${xhr.status})`;
          try {
            const res = JSON.parse(xhr.responseText);
            if (res.error?.message) errMsg = res.error.message;
          } catch {}
          reject(new Error(errMsg));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(formData);
    });
  };

  const upload = async (files) => {
    if (!files || !files.length) return;
    setUploading(true);
    setProgress(0);
    const newUrls = [...(photos || [])];
    try {
      for (const f of Array.from(files)) {
        try {
          const compressed = await compressImage(f);
          const url = await uploadToCloudinary(compressed);
          newUrls.push(url);
          setPhotos([...newUrls]);
        } catch (e) {
          console.error("Photo upload failed:", e);
          alert(`Photo upload failed: ${e.message}\n\nCheck your Cloudinary upload preset is set to "Unsigned".`);
          break;
        }
      }
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const removePhoto = (idx) => {
    if (!window.confirm("Remove this photo?")) return;
    // Note: photo stays in Cloudinary (we don't have delete permissions from browser)
    // but link is removed from the expense, so it won't appear anywhere
    setPhotos(photos.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={e => { upload(e.target.files); e.target.value = ""; }} />
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={e => { upload(e.target.files); e.target.value = ""; }} />

      {photos && photos.length > 0 && (
        <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
          {photos.map((url, idx) => (
            <div key={idx} style={{ position:"relative", width:70, height:70 }}>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ display:"block", width:"100%", height:"100%", borderRadius:8, overflow:"hidden", background:`url(${url}) center/cover`, border:`1px solid ${C.border}` }} />
              <button type="button" onClick={() => removePhoto(idx)} style={{ position:"absolute", top:-6, right:-6, width:22, height:22, borderRadius:"50%", background:C.red, color:"white", border:"2px solid white", cursor:"pointer", fontSize:12, fontWeight:700, padding:0, lineHeight:1 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {uploading && progress > 0 && (
        <div style={{ marginBottom:8 }}>
          <div style={{ height:4, background:C.borderLight, borderRadius:2, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${progress}%`, background:C.brand, transition:"width 0.2s" }} />
          </div>
          <div style={{ fontSize:11, color:C.inkSoft, marginTop:4, textAlign:"center" }}>Uploading... {progress}%</div>
        </div>
      )}

      <div style={{ display:"flex", gap:8 }}>
        <button type="button" onClick={() => cameraRef.current?.click()} disabled={uploading} style={{ flex:1, padding:"10px 14px", border:`1px dashed ${C.border}`, borderRadius:10, background:"white", color:C.brand, fontSize:13, fontWeight:600, cursor:uploading ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          {uploading ? <span className="spinner" style={{ borderTopColor: C.brand, borderColor:"rgba(155,85,54,0.2)" }} /> : "📷"} {uploading ? "Uploading..." : "Take Photo"}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ flex:1, padding:"10px 14px", border:`1px dashed ${C.border}`, borderRadius:10, background:"white", color:C.brand, fontSize:13, fontWeight:600, cursor:uploading ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          🖼️ Upload
        </button>
      </div>
      <div style={{ fontSize:11, color:C.inkFaint, marginTop:4 }}>Photos compressed automatically before upload</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   EXPENSE MODAL
   ═══════════════════════════════════════════════════════════════════════ */
function ExpModal({ cats, init, onSave, onClose }) {
  const [type, setType] = useState(init?.type || "shared");
  const [owner, setOwner] = useState(init?.owner || "Bride");
  const [date, setDate] = useState(init?.date || new Date().toISOString().split("T")[0]);
  const [title, setTitle] = useState(init?.title || "");
  const [vendor, setVendor] = useState(init?.vendor || "");
  const [cat, setCat] = useState(init?.category || cats[0]);
  const [paidBy, setPB] = useState(init?.paidBy || "Bride");
  const [tc, setTC] = useState(init?.totalCost?.toString() || "");
  const [ap, setAP] = useState(init?.amountPaid?.toString() || "");
  const [pm, setPM] = useState(init?.paymentMode || "");
  const [bl, setBL] = useState(init?.billLink || "");
  const [photos, setPhotos] = useState(init?.photos || []);
  const [notes, setN] = useState(init?.notes || "");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const sub = () => {
    const errs = {};
    if (!title.trim()) errs.title = "Description is required";
    if (!ap || parseFloat(ap) <= 0 || isNaN(parseFloat(ap))) errs.ap = "Enter a valid amount > 0";
    if (type === "shared" && tc && parseFloat(tc) < parseFloat(ap || 0)) errs.tc = "Total can't be less than paid";
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const el = document.getElementById(`field-${Object.keys(errs)[0]}`);
      if (el) el.scrollIntoView({ behavior:"smooth", block:"center" });
      return;
    }
    setSubmitting(true);
    setTimeout(() => setSubmitting(false), 5000);
    onSave({
      type,
      owner: type === "personal" ? owner : undefined,
      date, title: title.trim(), vendor: vendor.trim(), category: cat,
      paidBy: type === "shared" ? paidBy : owner,
      totalCost: type === "shared" ? (parseFloat(tc) || parseFloat(ap)) : parseFloat(ap),
      amountPaid: parseFloat(ap),
      paymentMode: pm, billLink: bl.trim(), photos, notes: notes.trim(),
    });
  };

  const inp = { width:"100%", padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, background:"white", color:C.ink, outline:"none" };
  const inpErr = { ...inp, border:`1px solid ${C.red}`, background:C.redBg };
  const lbl = { fontSize:12, fontWeight:600, color:C.inkSoft, marginBottom:5, display:"block" };
  const errMsg = (m) => m ? <div style={{ fontSize:11, color:C.red, marginTop:4, fontWeight:600 }}>⚠ {m}</div> : null;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(43,32,24,0.5)", zIndex:60, display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(4px)" }} onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="fade-up" style={{ background:C.bg, borderRadius:"24px 24px 0 0", width:"100%", maxWidth:480, maxHeight:"92vh", overflow:"auto", padding:"22px 20px 32px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <div className="serif" style={{ fontSize:22, fontWeight:600, color:C.ink }}>{init ? "Edit Expense" : "Add Expense"}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.inkSoft }}>×</button>
        </div>

        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          {["shared","personal"].map(t => (
            <button key={t} onClick={() => setType(t)} style={{ flex:1, padding:10, borderRadius:10, border:"2px solid", borderColor: type===t ? C.brand : C.border, background: type===t ? C.brandBg : "white", color: type===t ? C.brand : C.inkSoft, fontSize:13, fontWeight:700, cursor:"pointer" }}>
              {t==="shared" ? "🤝 Shared (50-50)" : "👤 Personal"}
            </button>
          ))}
        </div>

        {type==="personal" && (
          <div style={{ marginBottom:14 }}>
            <label style={lbl}>Whose expense?</label>
            <div style={{ display:"flex", gap:8 }}>
              {["Bride","Groom"].map(w => (
                <button key={w} onClick={() => setOwner(w)} style={{ flex:1, padding:10, borderRadius:8, border:`2px solid ${owner===w ? (w==="Bride" ? C.roseSoft : C.sageSoft) : C.border}`, background: owner===w ? (w==="Bride" ? C.roseBg : C.sageBg) : "white", fontSize:13, fontWeight:600, cursor:"pointer", color: owner===w ? (w==="Bride" ? C.rose : C.sage) : C.inkSoft }}>
                  {w==="Bride" ? "✿ Sanjana" : "❖ Akhil"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display:"grid", gap:14 }}>
          <div><label style={lbl}>Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp} /></div>
          <div id="field-title">
            <label style={lbl}>Description{errors.title && <span style={{ color:C.red }}> *</span>}</label>
            <input value={title} onChange={e=>{setTitle(e.target.value); if(errors.title) setErrors({...errors,title:null});}} placeholder="e.g. Photographer advance" style={errors.title ? inpErr : inp} />
            {errMsg(errors.title)}
          </div>
          <div>
            <label style={lbl}>Vendor <span style={{ color:C.inkFaint, fontWeight:400 }}>(optional, for tracking)</span></label>
            <input value={vendor} onChange={e=>setVendor(e.target.value)} placeholder="e.g. Happiness Weddings" style={inp} />
          </div>
          <div>
            <label style={lbl}>Category</label>
            <select value={cat} onChange={e=>setCat(e.target.value)} style={{...inp, appearance:"auto"}}>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {type==="shared" && (
            <>
              <div id="field-tc">
                <label style={lbl}>Total Cost of Item (₹)</label>
                <input type="number" value={tc} onChange={e=>{setTC(e.target.value); if(errors.tc) setErrors({...errors,tc:null});}} placeholder="Full cost, e.g. 105000" style={errors.tc ? inpErr : inp} />
                <div style={{ fontSize:11, color:C.inkFaint, marginTop:4 }}>Full price — 50% share auto-calculated. Leave blank to use Amount Paid.</div>
                {errMsg(errors.tc)}
              </div>
              <div>
                <label style={lbl}>Paid By</label>
                <div style={{ display:"flex", gap:6 }}>
                  {["Bride","Groom","Both"].map(w => (
                    <button key={w} onClick={() => setPB(w)} style={{ flex:1, padding:9, borderRadius:8, border:`2px solid ${paidBy===w ? C.brand : C.border}`, background: paidBy===w ? C.brandBg : "white", fontSize:12, fontWeight:600, cursor:"pointer", color: paidBy===w ? C.brand : C.inkSoft }}>
                      {dn(w)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div id="field-ap">
            <label style={lbl}>Amount Paid Now (₹){errors.ap && <span style={{ color:C.red }}> *</span>}</label>
            <input type="number" value={ap} onChange={e=>{setAP(e.target.value); if(errors.ap) setErrors({...errors,ap:null});}} placeholder="Amount actually paid" style={errors.ap ? inpErr : inp} />
            {errMsg(errors.ap)}
          </div>
          <div>
            <label style={lbl}>Payment Mode</label>
            <select value={pm} onChange={e=>setPM(e.target.value)} style={{...inp, appearance:"auto"}}>
              <option value="">Select...</option>
              {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>📎 Receipt / Bill</label>
            <PhotoUploader photos={photos} setPhotos={setPhotos} expenseId={init?.id} />
          </div>
          <div>
            <label style={lbl}>Or paste a link (Google Drive, etc.)</label>
            <input value={bl} onChange={e=>setBL(e.target.value)} placeholder="https://..." style={inp} />
          </div>
          <div>
            <label style={lbl}>Notes</label>
            <textarea value={notes} onChange={e=>setN(e.target.value)} placeholder="Optional notes..." rows={2} style={{...inp, resize:"vertical"}} />
          </div>
        </div>

        {Object.keys(errors).filter(k => errors[k]).length > 0 && (
          <div style={{ background:C.redBg, border:`1px solid ${C.red}`, borderRadius:8, padding:10, marginTop:14, fontSize:12, color:C.red, fontWeight:600 }}>
            ⚠ Please fill the highlighted fields
          </div>
        )}
        <button onClick={sub} disabled={submitting} className="btn-primary" style={{ width:"100%", padding:14, marginTop:18, fontSize:15, background: submitting ? C.inkFaint : C.ink }}>
          {submitting ? "Saving..." : (init ? "Update Expense" : "Save Expense")}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PAYMENT MODAL (Upcoming)
   ═══════════════════════════════════════════════════════════════════════ */
function PayModal({ cats, init, onSave, onClose }) {
  const [vendor, setVendor] = useState(init?.vendor || "");
  const [title, setTitle] = useState(init?.title || "");
  const [cat, setCat] = useState(init?.category || cats[0]);
  const [amount, setAmount] = useState(init?.amount?.toString() || "");
  const [dueDate, setDueDate] = useState(init?.dueDate || "");
  const [shared, setShared] = useState(init?.shared !== undefined ? init.shared : true);
  const [whoPays, setWhoPays] = useState(init?.whoPays || "Both");
  const [notes, setN] = useState(init?.notes || "");
  const [errors, setErrors] = useState({});

  const sub = () => {
    const errs = {};
    if (!vendor.trim() && !title.trim()) errs.vendor = "Enter a vendor or description";
    if (!amount || parseFloat(amount) <= 0) errs.amount = "Enter a valid amount";
    if (!dueDate) errs.dueDate = "Due date required";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({ vendor: vendor.trim(), title: title.trim(), category: cat, amount: parseFloat(amount), dueDate, shared, whoPays, notes: notes.trim() });
  };

  const inp = { width:"100%", padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, background:"white", color:C.ink, outline:"none" };
  const inpErr = { ...inp, border:`1px solid ${C.red}`, background:C.redBg };
  const lbl = { fontSize:12, fontWeight:600, color:C.inkSoft, marginBottom:5, display:"block" };
  const errMsg = (m) => m ? <div style={{ fontSize:11, color:C.red, marginTop:4, fontWeight:600 }}>⚠ {m}</div> : null;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(43,32,24,0.5)", zIndex:60, display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(4px)" }} onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="fade-up" style={{ background:C.bg, borderRadius:"24px 24px 0 0", width:"100%", maxWidth:480, maxHeight:"92vh", overflow:"auto", padding:"22px 20px 32px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <div className="serif" style={{ fontSize:22, fontWeight:600, color:C.ink }}>{init ? "Edit Payment" : "Schedule Payment"}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.inkSoft }}>×</button>
        </div>

        <div style={{ display:"grid", gap:14 }}>
          <div>
            <label style={lbl}>Vendor{errors.vendor && <span style={{ color:C.red }}> *</span>}</label>
            <input value={vendor} onChange={e=>{setVendor(e.target.value); if(errors.vendor) setErrors({...errors, vendor:null});}} placeholder="e.g. Happiness Weddings" style={errors.vendor ? inpErr : inp} />
            {errMsg(errors.vendor)}
          </div>
          <div>
            <label style={lbl}>Description (optional)</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Final installment" style={inp} />
          </div>
          <div>
            <label style={lbl}>Amount (₹){errors.amount && <span style={{ color:C.red }}> *</span>}</label>
            <input type="number" value={amount} onChange={e=>{setAmount(e.target.value); if(errors.amount) setErrors({...errors, amount:null});}} placeholder="e.g. 50000" style={errors.amount ? inpErr : inp} />
            {errMsg(errors.amount)}
          </div>
          <div>
            <label style={lbl}>Due Date{errors.dueDate && <span style={{ color:C.red }}> *</span>}</label>
            <input type="date" value={dueDate} onChange={e=>{setDueDate(e.target.value); if(errors.dueDate) setErrors({...errors, dueDate:null});}} style={errors.dueDate ? inpErr : inp} />
            {errMsg(errors.dueDate)}
          </div>
          <div>
            <label style={lbl}>Category</label>
            <select value={cat} onChange={e=>setCat(e.target.value)} style={{...inp, appearance:"auto"}}>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Type</label>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setShared(true)} style={{ flex:1, padding:10, borderRadius:10, border:`2px solid ${shared ? C.brand : C.border}`, background: shared ? C.brandBg : "white", color: shared ? C.brand : C.inkSoft, fontSize:13, fontWeight:700, cursor:"pointer" }}>🤝 Shared</button>
              <button onClick={() => setShared(false)} style={{ flex:1, padding:10, borderRadius:10, border:`2px solid ${!shared ? C.brand : C.border}`, background: !shared ? C.brandBg : "white", color: !shared ? C.brand : C.inkSoft, fontSize:13, fontWeight:700, cursor:"pointer" }}>👤 Personal</button>
            </div>
          </div>
          <div>
            <label style={lbl}>Who Pays</label>
            <div style={{ display:"flex", gap:6 }}>
              {(shared ? ["Both","Bride","Groom"] : ["Bride","Groom"]).map(w => (
                <button key={w} onClick={() => setWhoPays(w)} style={{ flex:1, padding:9, borderRadius:8, border:`2px solid ${whoPays===w ? C.brand : C.border}`, background: whoPays===w ? C.brandBg : "white", fontSize:12, fontWeight:600, cursor:"pointer", color: whoPays===w ? C.brand : C.inkSoft }}>
                  {dn(w)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={lbl}>Notes</label>
            <textarea value={notes} onChange={e=>setN(e.target.value)} placeholder="Optional reminder note..." rows={2} style={{...inp, resize:"vertical"}} />
          </div>
        </div>

        <button onClick={sub} className="btn-primary" style={{ width:"100%", padding:14, marginTop:18, fontSize:15, background:C.ink }}>
          {init ? "Update Payment" : "Schedule Payment"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SETTINGS MODAL
   ═══════════════════════════════════════════════════════════════════════ */
function SettingsModal({ budget, saveBudget, categories, saveCats, catS, showToast, onExport, onClose }) {
  const [budgetInput, setBudgetInput] = useState(budget.toString());
  const [catInputs, setCatInputs] = useState({...categories});
  const [editMode, setEditMode] = useState(false);
  const allocated = Object.values(catInputs).reduce((a,b) => a+b, 0);
  useEffect(() => { setCatInputs({...categories}); }, [categories]);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(43,32,24,0.5)", zIndex:60, display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(4px)" }} onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="fade-up" style={{ background:C.bg, borderRadius:"24px 24px 0 0", width:"100%", maxWidth:480, maxHeight:"92vh", overflow:"auto", padding:"22px 20px 32px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <div className="serif" style={{ fontSize:22, fontWeight:600, color:C.ink }}>Settings</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.inkSoft }}>×</button>
        </div>

        <div className="card">
          <div style={{ fontSize:13, fontWeight:700, color:C.ink, marginBottom:10 }}>Total Budget</div>
          <div style={{ display:"flex", gap:8 }}>
            <input type="number" value={budgetInput} onChange={e=>setBudgetInput(e.target.value)} style={{ flex:1, padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:16, fontWeight:600, background:"white" }} />
            <button onClick={() => { const v = parseFloat(budgetInput); if(v>0) { saveBudget(v); showToast("Budget updated ✓"); } }} style={{ padding:"10px 18px", background:C.ink, color:"white", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer" }}>Save</button>
          </div>
        </div>

        <div className="card">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>Category Budgets</div>
            <button onClick={() => setEditMode(!editMode)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"4px 12px", fontSize:12, color:C.inkSoft, cursor:"pointer", fontWeight:600 }}>{editMode ? "Done" : "Edit"}</button>
          </div>
          <div style={{ fontSize:12, fontWeight:600, marginBottom:14, color: Math.abs(allocated-budget) > 100 ? C.red : C.sage }}>
            Allocated: {fmtL(allocated)} / Budget: {fmtL(budget)}
            {Math.abs(allocated-budget) > 100 && ` (${fmtL(Math.abs(allocated-budget))} ${allocated>budget ? "over" : "under"})`}
          </div>
          {Object.keys(catInputs).map(cat => {
            const d = catS[cat] || { total:0, budget:catInputs[cat] };
            const p = d.budget > 0 ? (d.total/d.budget)*100 : 0;
            return (
              <div key={cat} style={{ marginBottom: editMode ? 10 : 12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:500, color:C.ink }}>{cat}</span>
                  {editMode ? (
                    <input type="number" value={catInputs[cat]} onChange={e => setCatInputs(prev => ({...prev, [cat]: parseFloat(e.target.value)||0}))} style={{ width:100, padding:"4px 8px", border:`1px solid ${C.border}`, borderRadius:6, fontSize:13, textAlign:"right" }} />
                  ) : (
                    <span style={{ fontSize:12, color: p>100 ? C.red : C.inkSoft }}>{fmtL(d.total)} / {fmtL(d.budget)}</span>
                  )}
                </div>
                {!editMode && (
                  <div style={{ height:5, background:C.borderLight, borderRadius:3, overflow:"hidden" }}>
                    <div style={{ height:"100%", borderRadius:3, width:`${Math.min(p, 100)}%`, background: p>100 ? C.red : p>75 ? C.brand : C.sageSoft }} />
                  </div>
                )}
              </div>
            );
          })}
          {editMode && (
            <button onClick={() => { saveCats(catInputs); setEditMode(false); showToast("Categories saved ✓"); }} style={{ width:"100%", padding:12, marginTop:8, background:`linear-gradient(135deg, ${C.sage}, ${C.sageSoft})`, color:"white", border:"none", borderRadius:10, fontWeight:700, cursor:"pointer" }}>
              Save Category Budgets
            </button>
          )}
        </div>

        <div className="card">
          <div style={{ fontSize:13, fontWeight:700, color:C.ink, marginBottom:10 }}>Data</div>
          <button onClick={() => { onExport(); showToast("Downloaded ✓"); }} style={{ width:"100%", padding:12, background:"white", color:C.ink, border:`1px solid ${C.border}`, borderRadius:10, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            📊 Download All Data as CSV
          </button>
        </div>
      </div>
    </div>
  );
}