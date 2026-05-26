import React, { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { ref, onValue, set, push, remove, update, serverTimestamp } from "firebase/database";

const CLOUDINARY = { cloudName: "dfiekkr9x", uploadPreset: "wedding_bills" };

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
const WEDDING_DATE = new Date("2026-11-11T08:00:00");
const RECEPTION_DATE = new Date("2026-11-11T19:00:00");
const PAYMENT_MODES = ["UPI", "Cash", "Credit Card", "Debit Card", "Bank Transfer", "Cheque", "Other"];
const NAME = { Bride: "Sanjana", Groom: "Akhil", Both: "Both" };
const dn = (v) => NAME[v] || v;

// Events
const EVENTS = [
  { id: "engagement", label: "Engagement", short: "Engagement", emoji: "💍", date: ENGAGEMENT_DATE },
  { id: "wedding",    label: "Wedding",    short: "Wedding",    emoji: "🎊", date: WEDDING_DATE },
  { id: "reception",  label: "Reception",  short: "Reception",  emoji: "🥂", date: RECEPTION_DATE },
  { id: "general",    label: "General",    short: "General",    emoji: "✦", date: null },
];
const UNCATEGORIZED = { id: "uncategorized", label: "Uncategorized", short: "Untagged", emoji: "·" };
const eventLabel = (id) => {
  const e = EVENTS.find(ev => ev.id === id);
  return e ? e.label : "Uncategorized";
};
const eventEmoji = (id) => {
  const e = EVENTS.find(ev => ev.id === id);
  return e ? e.emoji : "·";
};

/* ═══════════════════════════════════════════════════════════════════════
   WARM WEDDING COLOR PALETTE
   ═══════════════════════════════════════════════════════════════════════ */
const C = {
  // Backgrounds — warm champagne / ivory
  bg: "#FBF6EE",
  bg2: "#F5EBD8",
  bgWarm: "#FAF1E0",
  cardBg: "#FFFFFF",
  ivory: "#FFFCF5",

  // Inks — deep warm browns for text
  ink: "#2B2018",
  inkSoft: "#5C4A3D",
  inkFaint: "#8A7568",

  // Borders
  border: "#E5D6BF",
  borderLight: "#F0E5D0",

  // Brand — rich terracotta (signature)
  brand: "#9B5536",
  brandSoft: "#C17950",
  brandBg: "#FBE9DC",
  brandDeep: "#7A3E22",

  // Gold — warm metallic accent
  gold: "#B89432",
  goldSoft: "#D4AF37",
  goldBright: "#E5C158",
  goldBg: "#F8EFD0",
  goldDeep: "#8C6E1E",

  // Green — deeper emerald, warmer than sage
  green: "#3F6B4A",
  greenSoft: "#6B9774",
  greenBg: "#DEE9DD",
  greenDeep: "#2C4F35",

  // Rose — Sanjana
  rose: "#8B4A56",
  roseSoft: "#C4908B",
  roseBg: "#F5D8DA",
  roseDeep: "#6B3540",

  // Plum
  plum: "#5A3A52",
  plumBg: "#EBDCE6",

  // Alerts
  red: "#8B2A2A",
  redBg: "#F5D5D5",
  amber: "#A05B1F",
  amberBg: "#F8E1C5",

  // Event colors
  engagement: "#B89432",        // gold
  engagementBg: "#F8EFD0",
  wedding: "#9B5536",           // brand terracotta
  weddingBg: "#FBE9DC",
  reception: "#5A3A52",         // plum
  receptionBg: "#EBDCE6",
  general: "#5C4A3D",           // ink soft
  generalBg: "#F0E5D0",
};

const eventColor = (id) => {
  if (id === "engagement") return { c: C.engagement, bg: C.engagementBg };
  if (id === "wedding") return { c: C.wedding, bg: C.weddingBg };
  if (id === "reception") return { c: C.reception, bg: C.receptionBg };
  if (id === "general") return { c: C.general, bg: C.generalBg };
  return { c: C.inkFaint, bg: C.borderLight };
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
const parseLocalDate = (d) => {
  if (!d) return null;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day);
  }
  return new Date(d);
};
const fmtDate = (d) => { try { const p = parseLocalDate(d); return p ? p.toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) : ""; } catch { return d || ""; } };
const fmtDateShort = (d) => { try { const p = parseLocalDate(d); return p ? p.toLocaleDateString("en-IN", { day:"numeric", month:"short" }) : ""; } catch { return d || ""; } };
const daysUntil = (d) => {
  const target = parseLocalDate(d);
  if (!target) return null;
  target.setHours(0,0,0,0);
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.round((target - t) / 86400000);
};
const countdown = (target) => {
  if (!target) return "—";
  const t = new Date(); t.setHours(0,0,0,0);
  const tg = new Date(target); tg.setHours(0,0,0,0);
  if (t >= tg) return "Today!";
  const d = Math.ceil((tg - t) / 86400000);
  if (d > 60) { const m = Math.floor(d / 30); return `${m}M ${d % 30}D`; }
  return `${d} days`;
};
const clean = (obj) => { const o = {}; Object.keys(obj).forEach(k => { if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") o[k] = obj[k]; }); return o; };

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
function exportCSV(expList, payList, categories, catS, budget, sett, bp, gp, bpt, gpt, ts, tsc) {
  let c = "\uFEFF";
  c += "WEDDING EXPENSES SUMMARY\n";
  c += `Total Budget,${budget}\nTotal Spent,${ts}\nRemaining,${budget - tsc - bpt - gpt}\nTotal Shared Costs,${tsc}\n`;
  c += `Sanjana Paid (Shared),${bp}\nAkhil Paid (Shared),${gp}\nSanjana Personal,${bpt}\nAkhil Personal,${gpt}\n`;
  c += `Settlement,${Math.abs(sett) < 1 ? "All Settled" : sett > 0 ? "Akhil owes Sanjana " + Math.abs(sett) : "Sanjana owes Akhil " + Math.abs(sett)}\n\n`;
  c += "CATEGORY BREAKDOWN\nCategory,Budget,Shared Spent,Sanjana Personal,Akhil Personal,Total Spent,Remaining,% Used\n";
  Object.entries(catS).forEach(([cat, d]) => { c += `"${cat}",${d.budget},${d.shared},${d.brideP},${d.groomP},${d.total},${d.budget - d.total},${d.budget > 0 ? ((d.total / d.budget) * 100).toFixed(1) + "%" : "0%"}\n`; });
  c += "\nALL EXPENSES\nDate,Event,Type,Description,Category,Vendor,Paid By,Total Cost,Amount Paid,Payment Mode,Bill Link,Notes\n";
  [...expList].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)).forEach(e => {
    const evt = eventLabel(e.event);
    const photos = (e.photos && e.photos.length ? e.photos.join(" | ") : e.billLink) || "";
    c += `${e.date || ""},${evt},${e.type === "shared" ? "Shared" : dn(e.owner) + " Personal"},"${(e.title || "").replace(/"/g, '""')}","${e.category || ""}","${(e.vendor || "").replace(/"/g, '""')}",${e.type === "shared" ? dn(e.paidBy) : dn(e.owner)},${e.totalCost || e.amountPaid || 0},${e.amountPaid || 0},${e.paymentMode || ""},"${photos}","${(e.notes || "").replace(/"/g, '""')}"\n`;
  });
  if (payList.length) {
    c += "\nUPCOMING PAYMENTS\nDue Date,Event,Vendor,Description,Category,Amount,Who Pays,Status,Notes\n";
    [...payList].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).forEach(p => {
      c += `${p.dueDate || ""},${eventLabel(p.event)},"${(p.vendor || "").replace(/"/g, '""')}","${(p.title || "").replace(/"/g, '""')}","${p.category || ""}",${p.amount || 0},${dn(p.whoPays)},${p.status || "Pending"},"${(p.notes || "").replace(/"/g, '""')}"\n`;
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
@keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
@keyframes slideIn { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:translateX(0); } }
@keyframes expandDown { from { opacity:0; max-height:0; } to { opacity:1; max-height:2000px; } }
@keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.5; transform:scale(1.2); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
.fade-up { animation: fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both; }
.slide-in { animation: slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both; }
.expand-down { animation: expandDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) both; overflow:hidden; }
.spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; }
.toast-msg { position:fixed; bottom:96px; left:50%; transform:translateX(-50%); background:${C.ink}; color:white; padding:11px 26px; border-radius:24px; font-size:14px; font-weight:600; z-index:100; animation:fadeUp .3s ease; box-shadow:0 12px 32px rgba(0,0,0,0.25); max-width: 90%; letter-spacing:0.2px; }
.btn-primary { background:${C.brand}; color:white; border:none; border-radius:12px; font-weight:600; cursor:pointer; box-shadow:0 4px 14px rgba(155,85,54,.28); transition:all 0.25s cubic-bezier(0.16, 1, 0.3, 1); letter-spacing:0.2px; }
.btn-primary:hover { box-shadow: 0 8px 22px rgba(155,85,54,.4); transform: translateY(-1px); }
.btn-primary:active { transform:translateY(0) scale(0.98); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform:none; }
.btn-gold { background:linear-gradient(135deg, ${C.gold}, ${C.goldBright}); color:white; border:none; border-radius:12px; font-weight:600; cursor:pointer; box-shadow:0 4px 14px rgba(184,148,50,.32); transition:all 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
.btn-gold:hover { box-shadow:0 8px 22px rgba(184,148,50,.45); transform: translateY(-1px); }
.btn-gold:active { transform: translateY(0) scale(0.98); }
.card { background:${C.cardBg}; border-radius:16px; padding:18px; margin-bottom:14px; box-shadow:0 1px 3px rgba(43,32,24,0.05), 0 6px 16px rgba(43,32,24,0.04); transition: box-shadow 0.25s ease; }
.card:hover { box-shadow:0 1px 3px rgba(43,32,24,0.06), 0 8px 24px rgba(43,32,24,0.06); }
.card-press { transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1); }
.card-press:active { transform: scale(0.99); }
input, select, textarea { font-family: 'Inter', sans-serif; color: ${C.ink}; }
input:focus, select:focus, textarea:focus { outline:none; border-color:${C.brand}!important; box-shadow:0 0 0 3px rgba(155,85,54,.15); }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
.tab-btn { background:none; border:none; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:2px; padding: 4px 6px; transition: color 0.2s, transform 0.15s; }
.tab-btn:active { transform: scale(0.92); }
.chip { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:12px; font-size:10px; font-weight:600; letter-spacing:0.3px; }
.shimmer-gold { background: linear-gradient(90deg, ${C.gold}, ${C.goldBright}, ${C.gold}); background-size: 200% 100%; animation: shimmer 3s linear infinite; }
.chevron { display:inline-block; transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); color:${C.inkFaint}; font-size:14px; }
.chevron.open { transform: rotate(180deg); }
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
  const updExp = (id, d) => {
    // Allow clearing event field even though clean removes empty strings
    const cleaned = clean(d);
    if (d.event === "" || d.event === undefined) cleaned.event = null;
    return update(ref(db, `expenses/${id}`), cleaned)
      .then(() => showToast("Updated ✓"))
      .catch(err => { console.error(err); showToast("⚠️ Update failed"); });
  };
  const delExp = id => remove(ref(db, `expenses/${id}`)).then(() => showToast("Deleted ✓")).catch(() => showToast("⚠️ Failed"));

  const addPay = d => set(push(ref(db, "payments")), { ...clean(d), createdAt: new Date().toISOString(), status: d.status || "Pending" })
    .then(() => showToast("Payment scheduled ✓"))
    .catch(err => { console.error(err); showToast("⚠️ Failed"); });
  const updPay = (id, d) => update(ref(db, `payments/${id}`), clean(d)).then(() => showToast("Updated ✓")).catch(() => showToast("⚠️ Failed"));
  const delPay = id => remove(ref(db, `payments/${id}`)).then(() => showToast("Deleted ✓")).catch(() => showToast("⚠️ Failed"));

  const markPayAsPaid = (pay) => {
    const expData = {
      type: pay.shared ? "shared" : "personal",
      owner: pay.shared ? undefined : pay.whoPays,
      event: pay.event,
      date: new Date().toISOString().split("T")[0],
      title: pay.title || pay.vendor,
      category: pay.category, vendor: pay.vendor, paidBy: pay.whoPays,
      totalCost: pay.amount, amountPaid: pay.amount,
      paymentMode: "", billLink: "", photos: [],
      notes: pay.notes ? `From scheduled payment: ${pay.notes}` : "Converted from scheduled payment",
    };
    set(push(ref(db, "expenses")), { ...clean(expData), createdAt: new Date().toISOString() })
      .then(() => {
        update(ref(db, `payments/${pay.id}`), { status: "Paid", paidOn: new Date().toISOString().split("T")[0] }).catch(() => {});
        showToast("Marked as paid ✓");
      })
      .catch(err => { console.error(err); showToast("⚠️ Failed: " + (err.message || "unknown")); });
  };

  // ── Derived data ───────────────────────────────────────────────────
  const expList = Object.entries(expenses).map(([id, e]) => ({ id, ...e }));
  const payList = Object.entries(payments).map(([id, p]) => ({ id, ...p }));
  const shared = expList.filter(e => e.type === "shared");
  const brideP = expList.filter(e => e.type === "personal" && e.owner === "Bride");
  const groomP = expList.filter(e => e.type === "personal" && e.owner === "Groom");
  const tsc = shared.reduce((s, e) => s + (e.totalCost || 0), 0);
  const bp = shared.reduce((s, e) => e.paidBy === "Bride" ? s + (e.amountPaid || 0) : e.paidBy === "Both" ? s + (e.amountPaid || 0) / 2 : s, 0);
  const gp = shared.reduce((s, e) => e.paidBy === "Groom" ? s + (e.amountPaid || 0) : e.paidBy === "Both" ? s + (e.amountPaid || 0) / 2 : s, 0);
  const bptCost = brideP.reduce((s, e) => s + (e.totalCost || e.amountPaid || 0), 0);
  const gptCost = groomP.reduce((s, e) => s + (e.totalCost || e.amountPaid || 0), 0);
  const bpt = brideP.reduce((s, e) => s + (e.amountPaid || 0), 0);
  const gpt = groomP.reduce((s, e) => s + (e.amountPaid || 0), 0);
  const ts = bp + gp + bpt + gpt;
  const totalCommitted = tsc + bptCost + gptCost;
  const rem = budget - totalCommitted;
  const sett = bp / 2 - gp / 2;

  const catS = {};
  Object.keys(categories).forEach(cat => {
    const sc = shared.filter(e => e.category === cat).reduce((s, e) => s + (e.amountPaid || 0), 0);
    const bc = brideP.filter(e => e.category === cat).reduce((s, e) => s + (e.amountPaid || 0), 0);
    const gc = groomP.filter(e => e.category === cat).reduce((s, e) => s + (e.amountPaid || 0), 0);
    catS[cat] = { shared: sc, brideP: bc, groomP: gc, total: sc + bc + gc, budget: categories[cat] };
  });

  // Untagged count for nudge banner
  const untaggedCount = expList.filter(e => !e.event).length;

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:`linear-gradient(180deg, ${C.bg} 0%, ${C.bg2} 100%)` }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:52, marginBottom:14 }}>💍</div>
        <div className="serif" style={{ fontSize:18, color:C.inkSoft, letterSpacing:1.5 }}>Connecting...</div>
      </div>
    </div>
  );

  const doExport = () => exportCSV(expList, payList, categories, catS, budget, sett, bp, gp, bpt, gpt, ts, tsc);

  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(180deg, ${C.bg} 0%, ${C.bg2} 100%)`, position:"relative" }}>
      <style>{css}</style>
      {toast && <div className="toast-msg">{toast}</div>}

      <Header conn={conn} onSettings={() => setShowSettings(true)} />

      <div style={{ padding:"0 0 84px" }}>
        {tab==="dashboard" && <DashTab budget={budget} ts={ts} rem={rem} tsc={tsc} sett={sett} bp={bp} gp={gp} bpt={bpt} gpt={gpt} bptCost={bptCost} gptCost={gptCost} shared={shared} brideP={brideP} groomP={groomP} catS={catS} payList={payList} untaggedCount={untaggedCount} onGoExpenses={()=>setTab("expenses")} />}
        {tab==="expenses" && <ExpTab exps={expList} onAdd={()=>{setEditExp(null);setShowExpForm(true);}} onEdit={e=>{setEditExp(e);setShowExpForm(true);}} onDel={id=>{if(window.confirm("Delete this expense?")) delExp(id);}} />}
        {tab==="vendors" && <VendorsTab expList={expList} payList={payList} />}
        {tab==="upcoming" && <UpcomingTab payList={payList} onAdd={()=>{setEditPay(null);setShowPayForm(true);}} onEdit={p=>{setEditPay(p);setShowPayForm(true);}} onDel={id=>{if(window.confirm("Delete this scheduled payment?")) delPay(id);}} onMarkPaid={markPayAsPaid} />}
        {tab==="insights" && <InsTab data={{expList, payList, shared, brideP, groomP, tsc, bp, gp, bpt, gpt, bptCost, gptCost, ts, rem, sett, budget, catS}} onExport={doExport} />}
      </div>

      {showExpForm && <ExpModal cats={Object.keys(categories)} init={editExp} onSave={d => { editExp ? updExp(editExp.id, d) : addExp(d); setShowExpForm(false); setEditExp(null); }} onClose={() => { setShowExpForm(false); setEditExp(null); }} />}
      {showPayForm && <PayModal cats={Object.keys(categories)} init={editPay} onSave={d => { editPay ? updPay(editPay.id, d) : addPay(d); setShowPayForm(false); setEditPay(null); }} onClose={() => { setShowPayForm(false); setEditPay(null); }} />}
      {showSettings && <SettingsModal budget={budget} saveBudget={saveBudget} categories={categories} saveCats={saveCats} catS={catS} showToast={showToast} onExport={doExport} onClose={() => setShowSettings(false)} />}

      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"rgba(251,246,238,0.97)", backdropFilter:"blur(16px)", borderTop:`1px solid ${C.borderLight}`, display:"flex", justifyContent:"space-around", padding:"8px 0 12px", zIndex:50, boxShadow:"0 -2px 20px rgba(43,32,24,0.04)" }}>
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
            {tab===t.id && <div style={{ width:5, height:5, borderRadius:"50%", background:C.goldSoft, marginTop:1, boxShadow:`0 0 6px ${C.goldSoft}` }} />}
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
    <div style={{ background:`linear-gradient(135deg, ${C.ink} 0%, ${C.brandDeep} 100%)`, padding:"22px 18px 18px", color:"white", position:"relative", overflow:"hidden" }}>
      {/* Decorative gold blobs */}
      <div style={{ position:"absolute", top:-40, right:-40, width:160, height:160, borderRadius:"50%", background:`radial-gradient(circle, rgba(212,175,55,0.18) 0%, transparent 70%)` }} />
      <div style={{ position:"absolute", bottom:-50, left:-30, width:120, height:120, borderRadius:"50%", background:`radial-gradient(circle, rgba(196,144,139,0.15) 0%, transparent 70%)` }} />

      <div style={{ position:"relative", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div className="serif" style={{ fontSize:26, fontWeight:600, letterSpacing:0.3, marginBottom:3, display:"flex", alignItems:"center", gap:10 }}>
            <span>Sanjana & Akhil</span>
            <span title={conn === "connected" ? "Synced" : "Offline"} style={{ fontSize:9, fontFamily:"'Inter',sans-serif", fontWeight:700, letterSpacing:0.8, padding:"3px 8px", borderRadius:10, display:"inline-flex", alignItems:"center", gap:5, background: conn==="connected"?"rgba(168,181,160,0.25)":"rgba(255,180,180,0.2)", border: `1px solid ${conn==="connected"?"rgba(168,181,160,0.5)":"rgba(255,180,180,0.4)"}`, color: conn==="connected"?"#D4F0D0":"#FFD0D0" }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background: conn==="connected"?C.greenSoft:"#E8A8A8", animation: conn==="connected"?"none":"pulse 1.5s ease infinite" }} />
              {conn === "connected" ? "SYNCED" : "OFFLINE"}
            </span>
          </div>
          <div style={{ fontSize:11, opacity:0.7, letterSpacing:1.8, textTransform:"uppercase", fontWeight:500 }}>Wedding Planner · 2026</div>
        </div>
        <button onClick={onSettings} aria-label="Settings" style={{ background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.15)", color:"white", padding:"8px 10px", borderRadius:10, cursor:"pointer", fontSize:16, transition:"transform 0.15s, background 0.2s" }} onMouseDown={e=>e.currentTarget.style.transform="scale(0.94)"} onMouseUp={e=>e.currentTarget.style.transform="scale(1)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>⚙</button>
      </div>

      {/* Three event countdowns */}
      <div style={{ display:"flex", gap:6, marginTop:14, position:"relative" }}>
        {[
          { l:"Engagement", d:ENGAGEMENT_DATE, e:"💍", color:C.goldBright },
          { l:"Wedding",    d:WEDDING_DATE,    e:"🎊", color:C.brandSoft },
          { l:"Reception",  d:RECEPTION_DATE,  e:"🥂", color:"#C19BD0" },
        ].map((ev,i) => (
          <div key={i} className="fade-up" style={{ flex:1, background:"rgba(255,255,255,0.10)", borderRadius:12, padding:"10px 10px", border:"1px solid rgba(255,255,255,0.15)", animationDelay:`${i*0.05}s` }}>
            <div style={{ fontSize:9, opacity:0.75, textTransform:"uppercase", letterSpacing:1, fontWeight:600 }}>{ev.e} {ev.l}</div>
            <div className="serif" style={{ fontSize:15, fontWeight:600, marginTop:3, color:ev.color }}>{countdown(ev.d)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DASHBOARD TAB
   ═══════════════════════════════════════════════════════════════════════ */
function DashTab({ budget, ts, rem, tsc, sett, bp, gp, bpt, gpt, bptCost, gptCost, shared, brideP, groomP, catS, payList, untaggedCount, onGoExpenses }) {
  const pct = budget > 0 ? Math.min((ts / budget) * 100, 100) : 0;
  const upcoming = payList.filter(p => p.status !== "Paid").sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 3);

  return (
    <div style={{ padding:16 }} className="fade-up">
      {/* Untagged nudge */}
      {untaggedCount > 0 && (
        <div className="slide-in" onClick={onGoExpenses} style={{ cursor:"pointer", background:`linear-gradient(135deg, ${C.goldBg}, ${C.bgWarm})`, border:`1px solid ${C.goldSoft}`, borderRadius:14, padding:"12px 14px", marginBottom:14, display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:20 }}>🏷️</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.goldDeep }}>{untaggedCount} expense{untaggedCount!==1?"s":""} need an event tag</div>
            <div style={{ fontSize:11, color:C.inkSoft, marginTop:2 }}>Tap to open Expenses and edit them</div>
          </div>
          <span style={{ color:C.goldDeep, fontSize:14 }}>→</span>
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
        <KpiCard label="Budget" value={fmtL(budget)} bg={`linear-gradient(135deg, ${C.ink}, ${C.brandDeep})`} delay={0} />
        <KpiCard label="Spent" value={fmtL(ts)} bg={`linear-gradient(135deg, ${C.rose}, ${C.roseSoft})`} delay={0.05} />
        <KpiCard label="Remaining" value={fmtL(rem)} bg={`linear-gradient(135deg, ${C.green}, ${C.greenSoft})`} neg={rem<0} delay={0.1} />
        <KpiCard label="Shared" value={fmtL(tsc)} bg={`linear-gradient(135deg, ${C.brand}, ${C.brandSoft})`} delay={0.15} />
      </div>

      <div className="card slide-in" style={{ animationDelay:"0.2s" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
          <span style={{ fontSize:13, fontWeight:600, color:C.inkSoft }}>Budget Used</span>
          <span className="serif" style={{ fontSize:16, fontWeight:600, color: pct>90 ? C.red : C.green }}>{pct.toFixed(1)}%</span>
        </div>
        <div style={{ height:10, background:C.borderLight, borderRadius:5, overflow:"hidden" }}>
          <div style={{ height:"100%", borderRadius:5, transition:"width 0.8s cubic-bezier(0.16, 1, 0.3, 1)", width:`${pct}%`, background: pct>90 ? `linear-gradient(90deg, ${C.brand}, ${C.red})` : `linear-gradient(90deg, ${C.goldBright}, ${C.gold})` }} />
        </div>
      </div>

      {/* Settlement */}
      <div className="slide-in" style={{ background:`linear-gradient(135deg, ${C.brand}, ${C.brandSoft})`, borderRadius:18, padding:22, marginBottom:14, color:"white", boxShadow:"0 8px 28px rgba(155,85,54,0.28)", position:"relative", overflow:"hidden", animationDelay:"0.25s" }}>
        <div style={{ position:"absolute", top:-30, right:-20, width:120, height:120, borderRadius:"50%", background:"radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)" }} />
        <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:1.5, opacity:0.85, marginBottom:8, fontWeight:600, position:"relative" }}>Settlement</div>
        <div className="serif" style={{ fontSize:26, fontWeight:600, marginBottom:6, lineHeight:1.2, position:"relative" }}>
          {Math.abs(sett)<1 ? "All Settled ✓" : sett>0 ? `Akhil owes ${fmtFull(sett)}` : `Sanjana owes ${fmtFull(Math.abs(sett))}`}
        </div>
        <div style={{ fontSize:12, opacity:0.88, lineHeight:1.5, position:"relative" }}>
          Sanjana paid {fmtL(bp)} · Akhil paid {fmtL(gp)} toward shared
        </div>
        <div style={{ display:"flex", gap:8, marginTop:14, position:"relative" }}>
          <MS label="Sanjana's share" value={fmtL(tsc/2)} />
          <MS label="Akhil's share" value={fmtL(tsc/2)} />
        </div>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="card slide-in" style={{ borderLeft:`4px solid ${C.amber}`, animationDelay:"0.3s" }}>
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
                    {p.event && ` · ${eventLabel(p.event)}`}
                  </div>
                </div>
                <div className="serif" style={{ fontSize:15, fontWeight:600, color:C.ink }}>{fmtL(p.amount)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* SHARED card with event drill-down */}
      <SharedDrillCard shared={shared} tsc={tsc} bp={bp} gp={gp} />

      {/* PERSONAL card with 3-level drill */}
      <PersonalDrillCard brideP={brideP} groomP={groomP} bpt={bpt} gpt={gpt} bptCost={bptCost} gptCost={gptCost} />

      {/* Categories */}
      <div className="card slide-in" style={{ animationDelay:"0.45s" }}>
        <div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:14 }}>Category Breakdown</div>
        {Object.entries(catS).map(([cat, d], i) => {
          const p = d.budget > 0 ? Math.min((d.total/d.budget)*100, 100) : 0;
          const ov = d.total > d.budget && d.budget > 0;
          return (
            <div key={cat} className="slide-in" style={{ marginBottom:14, animationDelay:`${0.5 + i*.03}s` }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:13, fontWeight:500, color: ov ? C.red : C.ink }}>{cat}</span>
                <span style={{ fontSize:12, color:C.inkSoft, fontWeight:500 }}>{fmtL(d.total)} / {fmtL(d.budget)}</span>
              </div>
              <div style={{ height:6, background:C.borderLight, borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:3, transition:"width 0.6s cubic-bezier(0.16, 1, 0.3, 1)", width:`${p}%`, background: ov ? C.red : p>75 ? `linear-gradient(90deg, ${C.gold}, ${C.brand})` : `linear-gradient(90deg, ${C.greenSoft}, ${C.green})` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, value, bg, neg, delay=0 }) {
  return (
    <div className="slide-in" style={{ background:bg, borderRadius:14, padding:"14px 16px", color:"white", boxShadow:"0 6px 18px rgba(0,0,0,0.10)", animationDelay:`${delay}s`, position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:-15, right:-15, width:60, height:60, borderRadius:"50%", background:"radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)" }} />
      <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:1.2, opacity:0.85, fontWeight:600, position:"relative" }}>{label}</div>
      <div className="serif" style={{ fontSize:22, fontWeight:600, marginTop:4, color: neg ? "#FFC4C4" : "white", position:"relative" }}>{value}</div>
    </div>
  );
}
function MS({ label, value }) {
  return (
    <div style={{ flex:1, background:"rgba(255,255,255,0.16)", borderRadius:8, padding:"7px 10px", backdropFilter:"blur(8px)" }}>
      <div style={{ fontSize:10, opacity:0.85, fontWeight:500 }}>{label}</div>
      <div style={{ fontSize:14, fontWeight:700 }}>{value}</div>
    </div>
  );
}

/* SHARED drill card — Shared > by event > expenses */
function SharedDrillCard({ shared, tsc, bp, gp }) {
  const [open, setOpen] = useState(false);
  const [openEvent, setOpenEvent] = useState(null);
  const eventBuckets = {};
  EVENTS.concat([UNCATEGORIZED]).forEach(ev => {
    const id = ev.id === "uncategorized" ? null : ev.id;
    const items = shared.filter(e => (e.event || null) === id);
    if (items.length > 0) {
      const totalCost = items.reduce((s, e) => s + (e.totalCost || 0), 0);
      const paid = items.reduce((s, e) => s + (e.amountPaid || 0), 0);
      eventBuckets[ev.id] = { ...ev, items, totalCost, paid };
    }
  });

  return (
    <div className="card slide-in" style={{ padding:0, overflow:"hidden", marginBottom:14, animationDelay:"0.35s" }}>
      <button onClick={() => setOpen(!open)} className="card-press" style={{ width:"100%", background:"none", border:"none", padding:18, textAlign:"left", cursor:"pointer" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:11, color:C.brand, textTransform:"uppercase", letterSpacing:1.2, fontWeight:700 }}>🤝 Shared Expenses</div>
            <div className="serif" style={{ fontSize:22, fontWeight:600, color:C.ink, marginTop:3 }}>{fmtL(tsc)}</div>
            <div style={{ fontSize:11, color:C.inkSoft, marginTop:2 }}>{shared.length} expense{shared.length!==1?"s":""} · Paid: {fmtL(bp+gp)}</div>
          </div>
          <span className={`chevron ${open?"open":""}`}>▾</span>
        </div>
      </button>

      {open && (
        <div className="expand-down" style={{ borderTop:`1px solid ${C.borderLight}`, padding:14, background:C.bgWarm }}>
          {Object.keys(eventBuckets).length === 0 ? (
            <div style={{ fontSize:12, color:C.inkFaint, fontStyle:"italic", padding:"8px 0", textAlign:"center" }}>No shared expenses</div>
          ) : Object.values(eventBuckets).map((b, i) => {
            const isOpen = openEvent === b.id;
            const ec = eventColor(b.id === "uncategorized" ? null : b.id);
            return (
              <div key={b.id} className="slide-in" style={{ marginBottom:10, animationDelay:`${i*0.05}s` }}>
                <button onClick={() => setOpenEvent(isOpen ? null : b.id)} className="card-press" style={{ width:"100%", background:"white", border:`1px solid ${C.borderLight}`, borderLeft:`4px solid ${ec.c}`, borderRadius:10, padding:"10px 14px", textAlign:"left", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:C.ink }}>{b.emoji} {b.label}</div>
                    <div style={{ fontSize:11, color:C.inkSoft, marginTop:2 }}>{b.items.length} expense{b.items.length!==1?"s":""}{b.totalCost !== b.paid ? ` · Paid ${fmtL(b.paid)}` : ""}</div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div className="serif" style={{ fontSize:15, fontWeight:600, color:C.ink }}>{fmtL(b.totalCost)}</div>
                    <span className={`chevron ${isOpen?"open":""}`} style={{ fontSize:12 }}>▾</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="expand-down" style={{ marginTop:6, background:"white", border:`1px solid ${C.borderLight}`, borderRadius:10, padding:"4px 12px" }}>
                    {[...b.items].sort((a,b2)=>new Date(b2.date||b2.createdAt)-new Date(a.date||a.createdAt)).map(e => (
                      <div key={e.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${C.borderLight}` }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:500, color:C.ink, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{e.title}</div>
                          <div style={{ fontSize:11, color:C.inkSoft, marginTop:1 }}>{fmtDateShort(e.date)} · {e.category}{e.vendor ? ` · ${e.vendor}` : ""} · Paid by {dn(e.paidBy)}</div>
                        </div>
                        <div className="serif" style={{ fontSize:14, fontWeight:600, color:C.ink, marginLeft:10 }}>{fmtL(e.totalCost || e.amountPaid)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* PERSONAL drill card — Personal > by person > by event > expenses */
function PersonalDrillCard({ brideP, groomP, bpt, gpt, bptCost, gptCost }) {
  const [open, setOpen] = useState(false);
  const [openPerson, setOpenPerson] = useState(null);
  const [openEvent, setOpenEvent] = useState(null);
  const totalPersonal = bpt + gpt;
  const sPct = totalPersonal > 0 ? (bpt / totalPersonal) * 100 : 50;
  const aPct = totalPersonal > 0 ? (gpt / totalPersonal) * 100 : 50;
  const bDue = bptCost - bpt;
  const gDue = gptCost - gpt;

  const bucketByEvent = (list) => {
    const out = {};
    EVENTS.concat([UNCATEGORIZED]).forEach(ev => {
      const id = ev.id === "uncategorized" ? null : ev.id;
      const items = list.filter(e => (e.event || null) === id);
      if (items.length > 0) {
        out[ev.id] = { ...ev, items, paid: items.reduce((s, e) => s + (e.amountPaid || 0), 0), totalCost: items.reduce((s, e) => s + (e.totalCost || e.amountPaid || 0), 0) };
      }
    });
    return out;
  };
  const brideBuckets = bucketByEvent(brideP);
  const groomBuckets = bucketByEvent(groomP);

  const personSection = (key, name, color, colorBg, paid, due, totalCost, count, buckets) => {
    const isPersonOpen = openPerson === key;
    return (
      <div className="slide-in" style={{ marginBottom:10 }}>
        <button onClick={() => { setOpenPerson(isPersonOpen ? null : key); setOpenEvent(null); }} className="card-press" style={{ width:"100%", background:"white", border:`1px solid ${C.borderLight}`, borderLeft:`4px solid ${color}`, borderRadius:10, padding:"12px 14px", textAlign:"left", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color, textTransform:"uppercase", letterSpacing:0.8 }}>{name}</div>
            <div style={{ fontSize:11, color:C.inkSoft, marginTop:3 }}>{count} expense{count!==1?"s":""}{due > 0 ? ` · ${fmtL(due)} due` : ""}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ textAlign:"right" }}>
              <div className="serif" style={{ fontSize:17, fontWeight:600, color:C.ink }}>{fmtL(paid)}</div>
              {totalCost > paid && <div style={{ fontSize:11, color:C.inkFaint }}>of {fmtL(totalCost)}</div>}
            </div>
            <span className={`chevron ${isPersonOpen?"open":""}`} style={{ fontSize:12 }}>▾</span>
          </div>
        </button>

        {isPersonOpen && (
          <div className="expand-down" style={{ marginTop:6, paddingLeft:8 }}>
            {Object.keys(buckets).length === 0 ? (
              <div style={{ fontSize:12, color:C.inkFaint, fontStyle:"italic", padding:"8px 12px" }}>No expenses</div>
            ) : Object.values(buckets).map((b, i) => {
              const isEvOpen = openEvent === `${key}:${b.id}`;
              const ec = eventColor(b.id === "uncategorized" ? null : b.id);
              return (
                <div key={b.id} className="slide-in" style={{ marginBottom:6, animationDelay:`${i*0.04}s` }}>
                  <button onClick={() => setOpenEvent(isEvOpen ? null : `${key}:${b.id}`)} className="card-press" style={{ width:"100%", background:colorBg, border:`1px solid ${C.borderLight}`, borderLeft:`3px solid ${ec.c}`, borderRadius:8, padding:"8px 12px", textAlign:"left", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:C.ink }}>{b.emoji} {b.label}</div>
                      <div style={{ fontSize:10, color:C.inkSoft, marginTop:1 }}>{b.items.length} expense{b.items.length!==1?"s":""}</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div className="serif" style={{ fontSize:13, fontWeight:600, color:C.ink }}>{fmtL(b.paid)}</div>
                      <span className={`chevron ${isEvOpen?"open":""}`} style={{ fontSize:11 }}>▾</span>
                    </div>
                  </button>
                  {isEvOpen && (
                    <div className="expand-down" style={{ marginTop:4, background:"white", border:`1px solid ${C.borderLight}`, borderRadius:8, padding:"4px 12px" }}>
                      {[...b.items].sort((a,b2)=>new Date(b2.date||b2.createdAt)-new Date(a.date||a.createdAt)).map(e => (
                        <div key={e.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${C.borderLight}` }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:500, color:C.ink, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{e.title}</div>
                            <div style={{ fontSize:10, color:C.inkSoft, marginTop:1 }}>{fmtDateShort(e.date)} · {e.category}{e.vendor ? ` · ${e.vendor}` : ""}</div>
                          </div>
                          <div className="serif" style={{ fontSize:13, fontWeight:600, color:C.ink, marginLeft:8 }}>{fmtL(e.amountPaid)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card slide-in" style={{ padding:0, overflow:"hidden", marginBottom:14, animationDelay:"0.4s" }}>
      <button onClick={() => setOpen(!open)} className="card-press" style={{ width:"100%", background:"none", border:"none", padding:18, textAlign:"left", cursor:"pointer" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div>
            <div style={{ fontSize:11, color:C.inkSoft, textTransform:"uppercase", letterSpacing:1.2, fontWeight:700 }}>👤 Personal Expenses</div>
            <div className="serif" style={{ fontSize:22, fontWeight:600, color:C.ink, marginTop:3 }}>{fmtL(totalPersonal)}</div>
          </div>
          <span className={`chevron ${open?"open":""}`}>▾</span>
        </div>
        {totalPersonal > 0 ? (
          <>
            <div style={{ display:"flex", height:10, borderRadius:5, overflow:"hidden", background:C.borderLight, marginBottom:8 }}>
              <div style={{ width:`${sPct}%`, background:`linear-gradient(90deg, ${C.roseSoft}, ${C.rose})`, transition:"width 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }} />
              <div style={{ width:`${aPct}%`, background:`linear-gradient(90deg, ${C.green}, ${C.greenSoft})`, transition:"width 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }} />
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:C.rose }} />
                <span style={{ color:C.inkSoft, fontWeight:600 }}>Sanjana</span>
                <span className="serif" style={{ color:C.ink, fontWeight:600 }}>{fmtL(bpt)}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span className="serif" style={{ color:C.ink, fontWeight:600 }}>{fmtL(gpt)}</span>
                <span style={{ color:C.inkSoft, fontWeight:600 }}>Akhil</span>
                <span style={{ width:8, height:8, borderRadius:"50%", background:C.green }} />
              </div>
            </div>
          </>
        ) : (
          <div style={{ fontSize:12, color:C.inkFaint, fontStyle:"italic" }}>No personal expenses yet</div>
        )}
      </button>

      {open && (
        <div className="expand-down" style={{ borderTop:`1px solid ${C.borderLight}`, padding:14, background:C.bgWarm }}>
          {personSection("bride", "✿ Sanjana", C.rose, C.roseBg, bpt, bDue, bptCost, brideP.length, brideBuckets)}
          {personSection("groom", "❖ Akhil", C.green, C.greenBg, gpt, gDue, gptCost, groomP.length, groomBuckets)}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   EXPENSES TAB
   ═══════════════════════════════════════════════════════════════════════ */
function ExpTab({ exps, onAdd, onEdit, onDel }) {
  const [filter, setFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = exps.filter(e => {
    if (filter === "shared" && e.type !== "shared") return false;
    if (filter === "Bride" && !(e.type === "personal" && e.owner === "Bride")) return false;
    if (filter === "Groom" && !(e.type === "personal" && e.owner === "Groom")) return false;
    if (eventFilter === "uncategorized" && e.event) return false;
    if (eventFilter !== "all" && eventFilter !== "uncategorized" && e.event !== eventFilter) return false;
    if (search && !(e.title || "").toLowerCase().includes(search.toLowerCase()) && !(e.vendor || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const sorted = [...filtered].sort((a,b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

  return (
    <div style={{ padding:16 }} className="fade-up">
      {/* Type filter */}
      <div style={{ display:"flex", gap:6, marginBottom:10, overflowX:"auto", paddingBottom:4 }}>
        {[{id:"all",l:"All"},{id:"shared",l:"Shared"},{id:"Bride",l:"✿ Sanjana"},{id:"Groom",l:"❖ Akhil"}].map(x => (
          <button key={x.id} onClick={()=>setFilter(x.id)} style={{ background: filter===x.id ? C.ink : "white", color: filter===x.id ? "white" : C.inkSoft, border:`1px solid ${C.border}`, borderRadius:20, padding:"6px 14px", fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.2s" }}>{x.l}</button>
        ))}
      </div>
      {/* Event filter */}
      <div style={{ display:"flex", gap:6, marginBottom:10, overflowX:"auto", paddingBottom:4 }}>
        <button onClick={()=>setEventFilter("all")} style={{ background: eventFilter==="all" ? C.gold : "white", color: eventFilter==="all" ? "white" : C.inkSoft, border:`1px solid ${C.border}`, borderRadius:20, padding:"6px 14px", fontSize:11, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.2s" }}>All Events</button>
        {EVENTS.map(ev => (
          <button key={ev.id} onClick={()=>setEventFilter(ev.id)} style={{ background: eventFilter===ev.id ? eventColor(ev.id).c : "white", color: eventFilter===ev.id ? "white" : C.inkSoft, border:`1px solid ${C.border}`, borderRadius:20, padding:"6px 14px", fontSize:11, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.2s" }}>{ev.emoji} {ev.short}</button>
        ))}
        <button onClick={()=>setEventFilter("uncategorized")} style={{ background: eventFilter==="uncategorized" ? C.inkSoft : "white", color: eventFilter==="uncategorized" ? "white" : C.inkSoft, border:`1px solid ${C.border}`, borderRadius:20, padding:"6px 14px", fontSize:11, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.2s" }}>· Untagged</button>
      </div>
      <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search by description or vendor..." style={{ width:"100%", padding:"10px 14px", border:`1px solid ${C.border}`, borderRadius:10, fontSize:13, background:"white", marginBottom:14 }} />

      <button className="btn-primary" onClick={onAdd} style={{ width:"100%", padding:14, fontSize:15, marginBottom:16 }}>+ Add Expense</button>

      {sorted.length===0 ? (
        <div style={{ textAlign:"center", padding:40, color:C.inkFaint }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📝</div>
          <div style={{ fontSize:14 }}>{exps.length === 0 ? "No expenses yet" : "No matches"}</div>
        </div>
      ) : sorted.map((e,i) => {
        const ec = eventColor(e.event);
        return (
          <div key={e.id} className="slide-in" style={{ background:"white", borderRadius:14, padding:14, marginBottom:10, boxShadow:"0 1px 4px rgba(43,32,24,0.06)", borderLeft:`4px solid ${e.type==="shared" ? C.brand : e.owner==="Bride" ? C.roseSoft : C.greenSoft}`, animationDelay:`${i*.04}s` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:600, color:C.ink, marginBottom:3 }}>{e.title}</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:5 }}>
                  <span className="chip" style={{ background:ec.bg, color:ec.c }}>{eventEmoji(e.event)} {eventLabel(e.event)}</span>
                  {e.vendor && <span className="chip" style={{ background:C.brandBg, color:C.brand }}>🏪 {e.vendor}</span>}
                </div>
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
                {e.billLink && <a href={e.billLink} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:C.brand, marginTop:6, display:"inline-block", textDecoration:"none", fontWeight:600 }}>📎 View link →</a>}
              </div>
              <div style={{ textAlign:"right", marginLeft:12 }}>
                <div className="serif" style={{ fontSize:18, fontWeight:600, color:C.ink }}>{fmtL(e.totalCost || e.amountPaid)}</div>
                {(e.totalCost || 0) > (e.amountPaid || 0) && (
                  <>
                    <div style={{ fontSize:11, color:C.green, marginTop:2, fontWeight:500 }}>Paid: {fmtL(e.amountPaid)}</div>
                    <div style={{ fontSize:11, color:C.amber, marginTop:1, fontWeight:600 }}>Due: {fmtL((e.totalCost || 0) - (e.amountPaid || 0))}</div>
                  </>
                )}
              </div>
            </div>
            <div style={{ display:"flex", gap:8, marginTop:10, justifyContent:"flex-end" }}>
              <button onClick={()=>onEdit(e)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 12px", fontSize:11, color:C.inkSoft, cursor:"pointer", fontWeight:500, transition:"all 0.15s" }}>Edit</button>
              <button onClick={()=>onDel(e.id)} style={{ background:"none", border:`1px solid ${C.redBg}`, borderRadius:6, padding:"4px 12px", fontSize:11, color:C.red, cursor:"pointer", fontWeight:500, transition:"all 0.15s" }}>Delete</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   VENDORS TAB
   ═══════════════════════════════════════════════════════════════════════ */
function VendorsTab({ expList, payList }) {
  const [eventFilter, setEventFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);

  const filteredExp = eventFilter === "all" ? expList : eventFilter === "uncategorized" ? expList.filter(e => !e.event) : expList.filter(e => e.event === eventFilter);
  const filteredPay = eventFilter === "all" ? payList : eventFilter === "uncategorized" ? payList.filter(p => !p.event) : payList.filter(p => p.event === eventFilter);

  // Group by vendor (and split by event for visibility)
  const vendors = {};
  filteredExp.forEach(e => {
    const v = (e.vendor || "").trim();
    if (!v) return;
    if (!vendors[v]) vendors[v] = { name: v, expenses: [], payments: [], totalCost: 0, paid: 0, category: e.category, events: new Set() };
    vendors[v].expenses.push(e);
    vendors[v].totalCost = Math.max(vendors[v].totalCost, e.totalCost || e.amountPaid || 0);
    vendors[v].paid += (e.amountPaid || 0);
    if (e.event) vendors[v].events.add(e.event);
  });
  filteredPay.forEach(p => {
    const v = (p.vendor || "").trim();
    if (!v) return;
    if (!vendors[v]) vendors[v] = { name: v, expenses: [], payments: [], totalCost: 0, paid: 0, category: p.category, events: new Set() };
    vendors[v].payments.push(p);
    if (p.event) vendors[v].events.add(p.event);
  });
  const vendorList = Object.values(vendors).sort((a, b) => b.paid - a.paid);

  return (
    <div style={{ padding:16 }} className="fade-up">
      <div className="card" style={{ background: `linear-gradient(135deg, ${C.plum}, #7B5570)`, color:"white" }}>
        <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:1.5, opacity:0.85, marginBottom:4, fontWeight:600 }}>Vendor Overview</div>
        <div className="serif" style={{ fontSize:24, fontWeight:600 }}>{vendorList.length} vendor{vendorList.length !== 1 ? "s" : ""}</div>
        <div style={{ fontSize:12, opacity:0.85, marginTop:4 }}>Tap a vendor to see all transactions</div>
      </div>

      {/* Event filter */}
      <div style={{ display:"flex", gap:6, marginBottom:14, overflowX:"auto", paddingBottom:4 }}>
        <button onClick={()=>setEventFilter("all")} style={{ background: eventFilter==="all" ? C.gold : "white", color: eventFilter==="all" ? "white" : C.inkSoft, border:`1px solid ${C.border}`, borderRadius:20, padding:"6px 14px", fontSize:11, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.2s" }}>All Events</button>
        {EVENTS.map(ev => (
          <button key={ev.id} onClick={()=>setEventFilter(ev.id)} style={{ background: eventFilter===ev.id ? eventColor(ev.id).c : "white", color: eventFilter===ev.id ? "white" : C.inkSoft, border:`1px solid ${C.border}`, borderRadius:20, padding:"6px 14px", fontSize:11, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.2s" }}>{ev.emoji} {ev.short}</button>
        ))}
      </div>

      {vendorList.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, color:C.inkFaint }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🏪</div>
          <div style={{ fontSize:14 }}>No vendors {eventFilter !== "all" ? "for this event" : "yet"}</div>
          <div style={{ fontSize:12, marginTop:6 }}>Add a vendor name when logging expenses</div>
        </div>
      ) : vendorList.map((v, idx) => {
        const balance = v.totalCost - v.paid;
        const isExp = expanded === v.name;
        const upcomingForVendor = v.payments.filter(p => p.status !== "Paid");
        const nextDue = upcomingForVendor.sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
        const eventsList = [...v.events];

        return (
          <div key={v.name} className="card slide-in" style={{ padding:0, overflow:"hidden", animationDelay:`${idx*0.04}s` }}>
            <button onClick={() => setExpanded(isExp ? null : v.name)} className="card-press" style={{ width:"100%", padding:14, background:"none", border:"none", textAlign:"left", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:600, color:C.ink }}>{v.name}</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:4 }}>
                  {eventsList.map(eid => {
                    const ec = eventColor(eid);
                    return <span key={eid} className="chip" style={{ background:ec.bg, color:ec.c }}>{eventEmoji(eid)} {eventLabel(eid)}</span>;
                  })}
                </div>
                <div style={{ fontSize:11, color:C.inkSoft, marginTop:5 }}>{v.category} · {v.expenses.length} payment{v.expenses.length !== 1 ? "s" : ""}{upcomingForVendor.length > 0 ? ` · ${upcomingForVendor.length} scheduled` : ""}</div>
                {nextDue && <div style={{ fontSize:11, color:C.amber, fontWeight:600, marginTop:3 }}>Next: {fmtL(nextDue.amount)} due {fmtDateShort(nextDue.dueDate)}</div>}
              </div>
              <div style={{ textAlign:"right", marginLeft:12 }}>
                <div className="serif" style={{ fontSize:17, fontWeight:600, color:C.ink }}>{fmtL(v.paid)}</div>
                {balance > 0 && <div style={{ fontSize:11, color:C.red, fontWeight:600, marginTop:2 }}>{fmtL(balance)} due</div>}
                {v.totalCost > 0 && balance <= 0 && <div style={{ fontSize:11, color:C.green, fontWeight:600, marginTop:2 }}>✓ Settled</div>}
                <span className={`chevron ${isExp?"open":""}`} style={{ fontSize:14, marginTop:4, display:"block" }}>▾</span>
              </div>
            </button>

            {isExp && (
              <div className="expand-down" style={{ borderTop:`1px solid ${C.borderLight}`, padding:14, background:C.bgWarm }}>
                {v.totalCost > 0 && (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                      <span style={{ fontSize:11, color:C.inkSoft, fontWeight:600 }}>Progress</span>
                      <span style={{ fontSize:11, color:C.inkSoft, fontWeight:600 }}>{fmtL(v.paid)} / {fmtL(v.totalCost)}</span>
                    </div>
                    <div style={{ height:6, background:C.borderLight, borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", borderRadius:3, width:`${Math.min((v.paid/v.totalCost)*100, 100)}%`, background:`linear-gradient(90deg, ${C.greenSoft}, ${C.green})`, transition:"width 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }} />
                    </div>
                  </div>
                )}
                <div style={{ fontSize:11, color:C.inkSoft, fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Payments</div>
                {v.expenses.sort((a,b) => new Date(b.date) - new Date(a.date)).map(e => (
                  <div key={e.id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${C.borderLight}` }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, color:C.ink }}>{e.title}</div>
                      <div style={{ fontSize:11, color:C.inkSoft }}>{fmtDateShort(e.date)} · {eventLabel(e.event)} · {dn(e.paidBy) || dn(e.owner)}{e.paymentMode ? ` · ${e.paymentMode}` : ""}</div>
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
                          <div style={{ fontSize:11, color:C.amber, fontWeight:600 }}>Due {fmtDateShort(p.dueDate)} · {eventLabel(p.event)}</div>
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
   UPCOMING PAYMENTS TAB
   ═══════════════════════════════════════════════════════════════════════ */
function UpcomingTab({ payList, onAdd, onEdit, onDel, onMarkPaid }) {
  const [eventFilter, setEventFilter] = useState("all");
  const filtered = payList.filter(p => {
    if (eventFilter === "uncategorized" && p.event) return false;
    if (eventFilter !== "all" && eventFilter !== "uncategorized" && p.event !== eventFilter) return false;
    return true;
  });
  const pending = filtered.filter(p => p.status !== "Paid").sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));
  const paid = filtered.filter(p => p.status === "Paid");
  const totalDue = pending.reduce((s,p) => s + (p.amount || 0), 0);
  const overdueCount = pending.filter(p => { const d = daysUntil(p.dueDate); return d !== null && d < 0; }).length;

  return (
    <div style={{ padding:16 }} className="fade-up">
      <div className="card" style={{ background:`linear-gradient(135deg, ${C.amber}, #C77F4A)`, color:"white", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-20, right:-20, width:100, height:100, borderRadius:"50%", background:"radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)" }} />
        <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:1.5, opacity:0.85, marginBottom:4, fontWeight:600, position:"relative" }}>Upcoming Total</div>
        <div className="serif" style={{ fontSize:26, fontWeight:600, position:"relative" }}>{fmtL(totalDue)}</div>
        <div style={{ fontSize:12, opacity:0.85, marginTop:4, position:"relative" }}>{pending.length} payment{pending.length !== 1 ? "s" : ""} pending{overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}</div>
      </div>

      {/* Event filter */}
      <div style={{ display:"flex", gap:6, marginBottom:14, overflowX:"auto", paddingBottom:4 }}>
        <button onClick={()=>setEventFilter("all")} style={{ background: eventFilter==="all" ? C.gold : "white", color: eventFilter==="all" ? "white" : C.inkSoft, border:`1px solid ${C.border}`, borderRadius:20, padding:"6px 14px", fontSize:11, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.2s" }}>All Events</button>
        {EVENTS.map(ev => (
          <button key={ev.id} onClick={()=>setEventFilter(ev.id)} style={{ background: eventFilter===ev.id ? eventColor(ev.id).c : "white", color: eventFilter===ev.id ? "white" : C.inkSoft, border:`1px solid ${C.border}`, borderRadius:20, padding:"6px 14px", fontSize:11, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.2s" }}>{ev.emoji} {ev.short}</button>
        ))}
      </div>

      <button className="btn-primary" onClick={onAdd} style={{ width:"100%", padding:14, fontSize:15, marginBottom:16 }}>+ Schedule Payment</button>

      {pending.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, color:C.inkFaint }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📅</div>
          <div style={{ fontSize:14 }}>No upcoming payments scheduled</div>
        </div>
      ) : pending.map((p,i) => {
        const days = daysUntil(p.dueDate);
        const overdue = days !== null && days < 0;
        const urgent = days !== null && days >= 0 && days <= 7;
        const accent = overdue ? C.red : urgent ? C.amber : C.inkSoft;
        const ec = eventColor(p.event);
        return (
          <div key={p.id} className="card slide-in" style={{ borderLeft:`4px solid ${accent}`, animationDelay:`${i*.04}s` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:600, color:C.ink }}>{p.vendor || p.title}</div>
                {p.title && p.vendor && <div style={{ fontSize:12, color:C.inkSoft, marginTop:2 }}>{p.title}</div>}
                <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:5 }}>
                  <span className="chip" style={{ background:ec.bg, color:ec.c }}>{eventEmoji(p.event)} {eventLabel(p.event)}</span>
                </div>
                <div style={{ fontSize:11, color:accent, fontWeight:600, marginTop:5 }}>
                  {fmtDate(p.dueDate)} · {overdue ? `${Math.abs(days)} days overdue` : days === 0 ? "Due today" : `${days} days to go`}
                </div>
                <div style={{ fontSize:11, color:C.inkSoft, marginTop:3 }}>{p.category} · {p.shared ? "Shared" : "Personal"} · {dn(p.whoPays)}</div>
                {p.notes && <div style={{ fontSize:11, color:C.inkFaint, marginTop:5, fontStyle:"italic" }}>{p.notes}</div>}
              </div>
              <div className="serif" style={{ fontSize:18, fontWeight:600, color:C.ink, marginLeft:12 }}>{fmtL(p.amount)}</div>
            </div>
            <div style={{ display:"flex", gap:8, marginTop:12, justifyContent:"flex-end" }}>
              <button onClick={() => { if (window.confirm(`Mark "${p.vendor || p.title}" as paid?`)) onMarkPaid(p); }} style={{ background:C.green, color:"white", border:"none", borderRadius:6, padding:"6px 14px", fontSize:11, cursor:"pointer", fontWeight:600, transition:"all 0.15s" }}>✓ Mark Paid</button>
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
            <div key={p.id} className="card" style={{ opacity:0.65 }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:500, color:C.ink, textDecoration:"line-through" }}>{p.vendor || p.title}</div>
                  <div style={{ fontSize:11, color:C.green, fontWeight:600 }}>✓ Paid · {eventLabel(p.event)}</div>
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
  const { expList, payList, shared, brideP, groomP, tsc, bp, gp, bpt, gpt, bptCost, gptCost, ts, sett, budget, catS } = data;
  const n = expList.length;
  const avg = n > 0 ? ts / n : 0;
  const biggest = n > 0 ? expList.reduce((mx, e) => (e.amountPaid || 0) > (mx.amountPaid || 0) ? e : mx, expList[0]) : null;
  const catRank = Object.entries(catS).filter(([,d]) => d.total > 0).sort((a, b) => b[1].total - a[1].total);
  const overBud = Object.entries(catS).filter(([,d]) => d.total > d.budget && d.budget > 0);
  const payM = {}; expList.forEach(e => { const m = e.paymentMode || "Unspecified"; payM[m] = (payM[m] || 0) + (e.amountPaid || 0); });
  const monthly = {}; expList.forEach(e => { if (!e.date) return; const k = e.date.substring(0, 7); monthly[k] = (monthly[k] || 0) + (e.amountPaid || 0); });
  const sharedUnpaid = tsc - shared.reduce((s, e) => s + (e.amountPaid || 0), 0);
  const personalUnpaid = (bptCost - bpt) + (gptCost - gpt);
  const vendorBal = sharedUnpaid + personalUnpaid;
  const upcomingTotal = payList.filter(p => p.status !== "Paid").reduce((s,p) => s + (p.amount || 0), 0);

  // Per-event totals
  const eventTotals = {};
  EVENTS.concat([UNCATEGORIZED]).forEach(ev => {
    const id = ev.id === "uncategorized" ? null : ev.id;
    const items = expList.filter(e => (e.event || null) === id);
    const sharedTotal = items.filter(e => e.type === "shared").reduce((s, e) => s + (e.totalCost || 0), 0);
    const personalTotal = items.filter(e => e.type === "personal").reduce((s, e) => s + (e.totalCost || e.amountPaid || 0), 0);
    const total = sharedTotal + personalTotal;
    if (total > 0 || items.length > 0) eventTotals[ev.id] = { ...ev, sharedTotal, personalTotal, total, count: items.length };
  });

  const SR = ({ label, value, color }) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.borderLight}` }}>
      <span style={{ fontSize:13, color:C.inkSoft, fontWeight:500 }}>{label}</span>
      <span className="serif" style={{ fontSize:14, fontWeight:600, color: color || C.ink }}>{value}</span>
    </div>
  );

  return (
    <div style={{ padding:16 }} className="fade-up">
      <button onClick={onExport} className="btn-gold" style={{ width:"100%", padding:14, fontSize:15, marginBottom:16, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>📊 Download Excel / CSV</button>

      {/* Per-event breakdown */}
      {Object.keys(eventTotals).length > 0 && (
        <div className="card">
          <div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:12 }}>By Event</div>
          {Object.values(eventTotals).map((ev, i) => {
            const ec = eventColor(ev.id === "uncategorized" ? null : ev.id);
            const pct = ts > 0 ? (ev.total / ts) * 100 : 0;
            return (
              <div key={ev.id} className="slide-in" style={{ marginBottom:12, animationDelay:`${i*0.04}s` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:6 }}>
                  <div>
                    <span style={{ fontSize:13, fontWeight:600, color:ec.c }}>{ev.emoji} {ev.label}</span>
                    <span style={{ fontSize:11, color:C.inkSoft, marginLeft:6 }}>· {ev.count} expense{ev.count!==1?"s":""}</span>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <span className="serif" style={{ fontSize:15, fontWeight:600, color:C.ink }}>{fmtL(ev.total)}</span>
                    <span style={{ fontSize:11, color:C.inkFaint, marginLeft:6 }}>({pct.toFixed(0)}%)</span>
                  </div>
                </div>
                <div style={{ height:7, background:C.borderLight, borderRadius:4, overflow:"hidden", display:"flex" }}>
                  {ev.sharedTotal > 0 && <div style={{ width:`${(ev.sharedTotal/ev.total)*100}%`, background:C.brand, transition:"width 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }} />}
                  {ev.personalTotal > 0 && <div style={{ width:`${(ev.personalTotal/ev.total)*100}%`, background:`linear-gradient(90deg, ${C.roseSoft}, ${C.green})`, transition:"width 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }} />}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, fontSize:10, color:C.inkSoft }}>
                  <span>Shared: {fmtL(ev.sharedTotal)}</span>
                  <span>Personal: {fmtL(ev.personalTotal)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
          <div style={{ flex: (gp+gpt) || 1, background:`linear-gradient(90deg, ${C.greenSoft}, ${C.green})`, borderRadius:8, padding:"10px 12px", color:"white", minWidth:60 }}>
            <div style={{ fontSize:10, opacity:0.85, fontWeight:600 }}>Akhil</div>
            <div className="serif" style={{ fontSize:17, fontWeight:600 }}>{fmtL(gp+gpt)}</div>
          </div>
        </div>
        <SR label="Sanjana — Shared" value={fmtL(bp)} color={C.rose} />
        <SR label="Sanjana — Personal" value={fmtL(bpt)} color={C.rose} />
        <SR label="Akhil — Shared" value={fmtL(gp)} color={C.green} />
        <SR label="Akhil — Personal" value={fmtL(gpt)} color={C.green} />
      </div>

      {vendorBal > 0 && (
        <div style={{ background:`linear-gradient(135deg, ${C.red}, #A85060)`, borderRadius:14, padding:16, marginBottom:14, color:"white" }}>
          <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:1.5, opacity:0.85, fontWeight:600 }}>Unpaid Vendor Balance</div>
          <div className="serif" style={{ fontSize:22, fontWeight:600, marginTop:4 }}>{fmtL(vendorBal)}</div>
          <div style={{ fontSize:12, opacity:0.85, marginTop:4 }}>
            Still owed across all expenses
            {sharedUnpaid > 0 && personalUnpaid > 0 && ` · Shared: ${fmtL(sharedUnpaid)} · Personal: ${fmtL(personalUnpaid)}`}
          </div>
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
                  <div style={{ height:"100%", borderRadius:3, width:`${bw}%`, background:`linear-gradient(90deg, ${C.brand}, ${C.brandSoft})`, transition:"width 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }} />
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
   PHOTO UPLOADER
   ═══════════════════════════════════════════════════════════════════════ */
function PhotoUploader({ photos, setPhotos, expenseId, onUploadingChange }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  useEffect(() => { if (onUploadingChange) onUploadingChange(uploading); }, [uploading, onUploadingChange]);

  const uploadToCloudinary = (blob) => new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", blob);
    formData.append("upload_preset", CLOUDINARY.uploadPreset);
    formData.append("folder", `wedding-bills/${expenseId || "general"}`);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/image/upload`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText).secure_url); }
        catch { reject(new Error("Invalid response")); }
      } else {
        let errMsg = `Upload failed (${xhr.status})`;
        try { const res = JSON.parse(xhr.responseText); if (res.error?.message) errMsg = res.error.message; } catch {}
        reject(new Error(errMsg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(formData);
  });

  const upload = async (files) => {
    if (!files || !files.length) return;
    setUploading(true); setProgress(0);
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
          alert(`Photo upload failed: ${e.message}`);
          break;
        }
      }
    } finally { setUploading(false); setProgress(0); }
  };

  const removePhoto = (idx) => {
    if (!window.confirm("Remove this photo?")) return;
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
        <button type="button" onClick={() => cameraRef.current?.click()} disabled={uploading} style={{ flex:1, padding:"10px 14px", border:`1px dashed ${C.border}`, borderRadius:10, background:"white", color:C.brand, fontSize:13, fontWeight:600, cursor:uploading ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"all 0.2s" }}>
          {uploading ? <span className="spinner" style={{ borderTopColor: C.brand, borderColor:"rgba(155,85,54,0.2)" }} /> : "📷"} {uploading ? "Uploading..." : "Take Photo"}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ flex:1, padding:"10px 14px", border:`1px dashed ${C.border}`, borderRadius:10, background:"white", color:C.brand, fontSize:13, fontWeight:600, cursor:uploading ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"all 0.2s" }}>
          🖼️ Upload
        </button>
      </div>
      <div style={{ fontSize:11, color:C.inkFaint, marginTop:4 }}>Photos compressed automatically</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   EXPENSE MODAL
   ═══════════════════════════════════════════════════════════════════════ */
function ExpModal({ cats, init, onSave, onClose }) {
  const [type, setType] = useState(init?.type || "shared");
  const [owner, setOwner] = useState(init?.owner || "Bride");
  const [event, setEvent] = useState(init?.event || "");
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
  const [photoUploading, setPhotoUploading] = useState(false);

  const sub = () => {
    if (photoUploading) { alert("Please wait for the photo to finish uploading."); return; }
    const errs = {};
    if (!title.trim()) errs.title = "Description is required";
    if (!ap || parseFloat(ap) <= 0 || isNaN(parseFloat(ap))) errs.ap = "Enter a valid amount > 0";
    if (!event && !init) errs.event = "Please pick an event";
    if (tc && parseFloat(tc) < parseFloat(ap || 0)) errs.tc = "Total can't be less than paid";
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const el = document.getElementById(`field-${Object.keys(errs)[0]}`);
      if (el) el.scrollIntoView({ behavior:"smooth", block:"center" });
      return;
    }
    setSubmitting(true);
    setTimeout(() => setSubmitting(false), 5000);
    onSave({
      type, owner: type === "personal" ? owner : undefined,
      event: event || undefined,
      date, title: title.trim(), vendor: vendor.trim(), category: cat,
      paidBy: type === "shared" ? paidBy : owner,
      totalCost: parseFloat(tc) || parseFloat(ap),
      amountPaid: parseFloat(ap),
      paymentMode: pm, billLink: bl.trim(), photos, notes: notes.trim(),
    });
  };

  const inp = { width:"100%", padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, background:"white", color:C.ink, outline:"none", transition:"all 0.2s" };
  const inpErr = { ...inp, border:`1px solid ${C.red}`, background:C.redBg };
  const lbl = { fontSize:12, fontWeight:600, color:C.inkSoft, marginBottom:5, display:"block" };
  const errMsg = (m) => m ? <div style={{ fontSize:11, color:C.red, marginTop:4, fontWeight:600 }}>⚠ {m}</div> : null;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(43,32,24,0.55)", zIndex:60, display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(6px)", animation:"fadeUp 0.3s ease" }} onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="fade-up" style={{ background:C.bg, borderRadius:"24px 24px 0 0", width:"100%", maxWidth:480, maxHeight:"92vh", overflow:"auto", padding:"22px 20px 32px", boxShadow:"0 -8px 32px rgba(0,0,0,0.15)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <div className="serif" style={{ fontSize:22, fontWeight:600, color:C.ink }}>{init ? "Edit Expense" : "Add Expense"}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.inkSoft }}>×</button>
        </div>

        {/* Event picker — FIRST */}
        <div id="field-event" style={{ marginBottom:16 }}>
          <label style={lbl}>Event{errors.event && <span style={{ color:C.red }}> *</span>}</label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {EVENTS.map(ev => {
              const ec = eventColor(ev.id);
              const sel = event === ev.id;
              return (
                <button key={ev.id} onClick={() => { setEvent(ev.id); if(errors.event) setErrors({...errors, event:null}); }} style={{ padding:"10px 10px", borderRadius:10, border:`2px solid ${sel ? ec.c : C.border}`, background: sel ? ec.bg : "white", color: sel ? ec.c : C.inkSoft, fontSize:12, fontWeight:600, cursor:"pointer", textAlign:"center", transition:"all 0.2s" }}>
                  <div style={{ fontSize:16 }}>{ev.emoji}</div>
                  <div style={{ marginTop:2 }}>{ev.label}</div>
                </button>
              );
            })}
          </div>
          {errMsg(errors.event)}
        </div>

        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          {["shared","personal"].map(t => (
            <button key={t} onClick={() => setType(t)} style={{ flex:1, padding:10, borderRadius:10, border:"2px solid", borderColor: type===t ? C.brand : C.border, background: type===t ? C.brandBg : "white", color: type===t ? C.brand : C.inkSoft, fontSize:13, fontWeight:700, cursor:"pointer", transition:"all 0.2s" }}>
              {t==="shared" ? "🤝 Shared (50-50)" : "👤 Personal"}
            </button>
          ))}
        </div>

        {type==="personal" && (
          <div style={{ marginBottom:14 }}>
            <label style={lbl}>Whose expense?</label>
            <div style={{ display:"flex", gap:8 }}>
              {["Bride","Groom"].map(w => (
                <button key={w} onClick={() => setOwner(w)} style={{ flex:1, padding:10, borderRadius:8, border:`2px solid ${owner===w ? (w==="Bride" ? C.roseSoft : C.greenSoft) : C.border}`, background: owner===w ? (w==="Bride" ? C.roseBg : C.greenBg) : "white", fontSize:13, fontWeight:600, cursor:"pointer", color: owner===w ? (w==="Bride" ? C.rose : C.green) : C.inkSoft, transition:"all 0.2s" }}>
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
            <label style={lbl}>Vendor <span style={{ color:C.inkFaint, fontWeight:400 }}>(optional)</span></label>
            <input value={vendor} onChange={e=>setVendor(e.target.value)} placeholder="e.g. Happiness Weddings" style={inp} />
          </div>
          <div>
            <label style={lbl}>Category</label>
            <select value={cat} onChange={e=>setCat(e.target.value)} style={{...inp, appearance:"auto"}}>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div id="field-tc">
            <label style={lbl}>Total Cost of Item (₹) <span style={{ color:C.inkFaint, fontWeight:400 }}>(optional)</span></label>
            <input type="number" value={tc} onChange={e=>{setTC(e.target.value); if(errors.tc) setErrors({...errors,tc:null});}} placeholder={type==="shared" ? "Full cost, e.g. 105000" : "Full price, e.g. 85000"} style={errors.tc ? inpErr : inp} />
            <div style={{ fontSize:11, color:C.inkFaint, marginTop:4 }}>{type==="shared" ? "Full price — 50% share auto-calculated. Leave blank to use Amount Paid." : "Useful for instalments. Leave blank if paying in full."}</div>
            {errMsg(errors.tc)}
          </div>
          {type==="shared" && (
            <div>
              <label style={lbl}>Paid By</label>
              <div style={{ display:"flex", gap:6 }}>
                {["Bride","Groom","Both"].map(w => (
                  <button key={w} onClick={() => setPB(w)} style={{ flex:1, padding:9, borderRadius:8, border:`2px solid ${paidBy===w ? C.brand : C.border}`, background: paidBy===w ? C.brandBg : "white", fontSize:12, fontWeight:600, cursor:"pointer", color: paidBy===w ? C.brand : C.inkSoft, transition:"all 0.2s" }}>{dn(w)}</button>
                ))}
              </div>
            </div>
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
            <PhotoUploader photos={photos} setPhotos={setPhotos} expenseId={init?.id} onUploadingChange={setPhotoUploading} />
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
        <button onClick={sub} disabled={submitting || photoUploading} className="btn-primary" style={{ width:"100%", padding:14, marginTop:18, fontSize:15, background: (submitting || photoUploading) ? C.inkFaint : C.ink }}>
          {photoUploading ? "Waiting for photo..." : submitting ? "Saving..." : (init ? "Update Expense" : "Save Expense")}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PAYMENT MODAL
   ═══════════════════════════════════════════════════════════════════════ */
function PayModal({ cats, init, onSave, onClose }) {
  const [vendor, setVendor] = useState(init?.vendor || "");
  const [title, setTitle] = useState(init?.title || "");
  const [event, setEvent] = useState(init?.event || "");
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
    if (!event) errs.event = "Please pick an event";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({ vendor: vendor.trim(), title: title.trim(), event, category: cat, amount: parseFloat(amount), dueDate, shared, whoPays, notes: notes.trim() });
  };

  const inp = { width:"100%", padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, background:"white", color:C.ink, outline:"none", transition:"all 0.2s" };
  const inpErr = { ...inp, border:`1px solid ${C.red}`, background:C.redBg };
  const lbl = { fontSize:12, fontWeight:600, color:C.inkSoft, marginBottom:5, display:"block" };
  const errMsg = (m) => m ? <div style={{ fontSize:11, color:C.red, marginTop:4, fontWeight:600 }}>⚠ {m}</div> : null;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(43,32,24,0.55)", zIndex:60, display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(6px)" }} onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="fade-up" style={{ background:C.bg, borderRadius:"24px 24px 0 0", width:"100%", maxWidth:480, maxHeight:"92vh", overflow:"auto", padding:"22px 20px 32px", boxShadow:"0 -8px 32px rgba(0,0,0,0.15)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <div className="serif" style={{ fontSize:22, fontWeight:600, color:C.ink }}>{init ? "Edit Payment" : "Schedule Payment"}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.inkSoft }}>×</button>
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={lbl}>Event{errors.event && <span style={{ color:C.red }}> *</span>}</label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {EVENTS.map(ev => {
              const ec = eventColor(ev.id);
              const sel = event === ev.id;
              return (
                <button key={ev.id} onClick={() => { setEvent(ev.id); if(errors.event) setErrors({...errors, event:null}); }} style={{ padding:"10px 10px", borderRadius:10, border:`2px solid ${sel ? ec.c : C.border}`, background: sel ? ec.bg : "white", color: sel ? ec.c : C.inkSoft, fontSize:12, fontWeight:600, cursor:"pointer", textAlign:"center", transition:"all 0.2s" }}>
                  <div style={{ fontSize:16 }}>{ev.emoji}</div>
                  <div style={{ marginTop:2 }}>{ev.label}</div>
                </button>
              );
            })}
          </div>
          {errMsg(errors.event)}
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
              <button onClick={() => setShared(true)} style={{ flex:1, padding:10, borderRadius:10, border:`2px solid ${shared ? C.brand : C.border}`, background: shared ? C.brandBg : "white", color: shared ? C.brand : C.inkSoft, fontSize:13, fontWeight:700, cursor:"pointer", transition:"all 0.2s" }}>🤝 Shared</button>
              <button onClick={() => setShared(false)} style={{ flex:1, padding:10, borderRadius:10, border:`2px solid ${!shared ? C.brand : C.border}`, background: !shared ? C.brandBg : "white", color: !shared ? C.brand : C.inkSoft, fontSize:13, fontWeight:700, cursor:"pointer", transition:"all 0.2s" }}>👤 Personal</button>
            </div>
          </div>
          <div>
            <label style={lbl}>Who Pays</label>
            <div style={{ display:"flex", gap:6 }}>
              {(shared ? ["Both","Bride","Groom"] : ["Bride","Groom"]).map(w => (
                <button key={w} onClick={() => setWhoPays(w)} style={{ flex:1, padding:9, borderRadius:8, border:`2px solid ${whoPays===w ? C.brand : C.border}`, background: whoPays===w ? C.brandBg : "white", fontSize:12, fontWeight:600, cursor:"pointer", color: whoPays===w ? C.brand : C.inkSoft, transition:"all 0.2s" }}>{dn(w)}</button>
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
  useEffect(() => { if (!editMode) setCatInputs({...categories}); }, [categories, editMode]);
  useEffect(() => { setBudgetInput(budget.toString()); }, [budget]);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(43,32,24,0.55)", zIndex:60, display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(6px)" }} onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="fade-up" style={{ background:C.bg, borderRadius:"24px 24px 0 0", width:"100%", maxWidth:480, maxHeight:"92vh", overflow:"auto", padding:"22px 20px 32px", boxShadow:"0 -8px 32px rgba(0,0,0,0.15)" }}>
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
          <div style={{ fontSize:12, fontWeight:600, marginBottom:14, color: Math.abs(allocated-budget) > 100 ? C.red : C.green }}>
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
                    <div style={{ height:"100%", borderRadius:3, width:`${Math.min(p, 100)}%`, background: p>100 ? C.red : p>75 ? C.brand : C.greenSoft, transition:"width 0.5s" }} />
                  </div>
                )}
              </div>
            );
          })}
          {editMode && (
            <button onClick={() => { saveCats(catInputs); setEditMode(false); showToast("Categories saved ✓"); }} style={{ width:"100%", padding:12, marginTop:8, background:`linear-gradient(135deg, ${C.green}, ${C.greenSoft})`, color:"white", border:"none", borderRadius:10, fontWeight:700, cursor:"pointer" }}>
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