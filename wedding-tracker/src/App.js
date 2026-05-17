import React, { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { ref, onValue, set, push, remove, update, serverTimestamp } from "firebase/database";

/* ═══════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════ */
const fmtL = (n) => {
  if (!n && n !== 0) return "₹0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 100000) return sign + "₹" + (abs / 100000).toFixed(abs % 100000 === 0 ? 0 : 1) + "L";
  return sign + "₹" + abs.toLocaleString("en-IN");
};
const fmtFull = (n) => "₹" + Math.abs(n).toLocaleString("en-IN");

const countdown = (target) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (today >= target) return target === ENGAGEMENT_DATE ? "Done! 💍" : "Today! 🎊";
  const diff = Math.ceil((target - today) / 86400000);
  if (diff > 60) { const m = Math.floor(diff / 30); const d = diff % 30; return `${m}M ${d}D`; }
  return `${diff} days`;
};

/* ═══════════════════════════════════════════════════════════════════════
   STYLES (shared)
   ═══════════════════════════════════════════════════════════════════════ */
const css = `
  @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @keyframes slideIn { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:translateX(0); } }
  @keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.2); } }
  .fade-up { animation: fadeUp 0.35s ease both; }
  .slide-in { animation: slideIn 0.3s ease both; }
  .toast-msg { position:fixed; bottom:90px; left:50%; transform:translateX(-50%); background:#4A3F35; color:#FFF8F0; padding:10px 24px; border-radius:20px; font-size:14px; font-weight:600; z-index:100; animation:fadeUp 0.3s ease; box-shadow:0 4px 20px rgba(0,0,0,0.15); }
  .btn-primary { background:linear-gradient(135deg,#C17950,#D4985F); color:#FFF8F0; border:none; border-radius:12px; font-weight:700; cursor:pointer; box-shadow:0 4px 16px rgba(193,121,80,0.25); transition:transform 0.1s; }
  .btn-primary:active { transform:scale(0.98); }
  .card { background:white; border-radius:14px; padding:16px; margin-bottom:12px; box-shadow:0 2px 12px rgba(107,91,80,0.06); }
  input:focus, select:focus, textarea:focus { outline:none; border-color:#C17950 !important; box-shadow:0 0 0 3px rgba(193,121,80,0.12); }
`;

/* ═══════════════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [connStatus, setConnStatus] = useState("connecting");
  const [tab, setTab] = useState("dashboard");
  const [budget, setBudget] = useState(1200000);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [expenses, setExpenses] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState(null);
  const dataLoaded = useRef(false);

  // ── Firebase Realtime Listeners ────────────────────────────────────
  useEffect(() => {
    let initTimer = null;
    let unsubs = [];

    try {
      // 1. Connection status listener (Firebase built-in)
      const connRef = ref(db, ".info/connected");
      const unsubConn = onValue(connRef, (snap) => {
        setConnStatus(snap.val() === true ? "connected" : "offline");
      });
      unsubs.push(unsubConn);

      // 2. Budget listener
      const unsub1 = onValue(ref(db, "settings/budget"),
        (snap) => { if (snap.exists()) setBudget(snap.val()); },
        (err) => { console.warn("Budget listener error:", err.message); }
      );
      unsubs.push(unsub1);

      // 3. Categories listener
      const unsub2 = onValue(ref(db, "settings/categories"),
        (snap) => { if (snap.exists()) setCategories(snap.val()); },
        (err) => { console.warn("Categories listener error:", err.message); }
      );
      unsubs.push(unsub2);

      // 4. Expenses listener — this is the main one that controls loading state
      const unsub3 = onValue(ref(db, "expenses"),
        (snap) => {
          setExpenses(snap.exists() ? snap.val() : {});
          dataLoaded.current = true;
          setLoading(false);
        },
        (err) => { console.warn("Expenses listener error:", err.message); setLoading(false); }
      );
      unsubs.push(unsub3);

      // 5. One-time initialization — write defaults if database is empty
      initTimer = setTimeout(() => {
        const initRef = ref(db, "settings/initialized");
        onValue(initRef, (snap) => {
          if (!snap.exists()) {
            update(ref(db, "settings"), {
              budget: 1200000,
              categories: DEFAULT_CATEGORIES,
              initialized: true,
              createdAt: serverTimestamp(),
            }).catch(err => console.warn("Init write failed:", err));
          }
        }, { onlyOnce: true });
      }, 800);

      // Safety: if nothing loads in 15 seconds, just show the app with defaults
      const safetyTimer = setTimeout(() => {
        setLoading(false);
      }, 15000);

      return () => {
        unsubs.forEach(u => u());
        if (initTimer) clearTimeout(initTimer);
        clearTimeout(safetyTimer);
      };
    } catch (err) {
      console.error("Firebase setup error:", err);
      setLoading(false);
    }
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  // ── Firebase Write Helpers ─────────────────────────────────────────
  const saveBudget = (val) => set(ref(db, "settings/budget"), val).catch(err => showToast("⚠️ Save failed"));
  const saveCategories = (cats) => set(ref(db, "settings/categories"), cats).catch(err => showToast("⚠️ Save failed"));

  const addExpense = (data) => {
    const newRef = push(ref(db, "expenses"));
    set(newRef, { ...data, createdAt: new Date().toISOString() })
      .then(() => showToast("Expense added ✓"))
      .catch(() => showToast("⚠️ Save failed — check connection"));
  };
  const updateExpense = (id, data) => {
    update(ref(db, `expenses/${id}`), data)
      .then(() => showToast("Updated ✓"))
      .catch(() => showToast("⚠️ Update failed"));
  };
  const deleteExpense = (id) => {
    remove(ref(db, `expenses/${id}`))
      .then(() => showToast("Deleted ✓"))
      .catch(() => showToast("⚠️ Delete failed"));
  };

  // ── Computed ───────────────────────────────────────────────────────
  const expList = Object.entries(expenses).map(([id, e]) => ({ id, ...e }));
  const shared = expList.filter(e => e.type === "shared");
  const bridePersonal = expList.filter(e => e.type === "personal" && e.owner === "Bride");
  const groomPersonal = expList.filter(e => e.type === "personal" && e.owner === "Groom");

  const totalSharedCost = shared.reduce((s, e) => s + (e.totalCost || 0), 0);
  const bridePaidShared = shared.reduce((s, e) => {
    if (e.paidBy === "Bride") return s + (e.amountPaid || 0);
    if (e.paidBy === "Both") return s + (e.amountPaid || 0) / 2;
    return s;
  }, 0);
  const groomPaidShared = shared.reduce((s, e) => {
    if (e.paidBy === "Groom") return s + (e.amountPaid || 0);
    if (e.paidBy === "Both") return s + (e.amountPaid || 0) / 2;
    return s;
  }, 0);

  const bridePersonalTotal = bridePersonal.reduce((s, e) => s + (e.amountPaid || 0), 0);
  const groomPersonalTotal = groomPersonal.reduce((s, e) => s + (e.amountPaid || 0), 0);
  const totalSpent = bridePaidShared + groomPaidShared + bridePersonalTotal + groomPersonalTotal;
  const remaining = budget - totalSharedCost - bridePersonalTotal - groomPersonalTotal;
  const settlement = bridePaidShared / 2 - groomPaidShared / 2;

  const catSpending = {};
  Object.keys(categories).forEach(cat => {
    const shC = shared.filter(e => e.category === cat).reduce((s, e) => s + (e.amountPaid || 0), 0);
    const bpC = bridePersonal.filter(e => e.category === cat).reduce((s, e) => s + (e.amountPaid || 0), 0);
    const gpC = groomPersonal.filter(e => e.category === cat).reduce((s, e) => s + (e.amountPaid || 0), 0);
    catSpending[cat] = { shared: shC, brideP: bpC, groomP: gpC, total: shC + bpC + gpC, budget: categories[cat] };
  });

  // ── Loading Screen ─────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#FFF8F0", padding:20 }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:12 }}>💍</div>
        <div style={{ fontSize:16, color:"#8C7B6F", letterSpacing:2, fontFamily:"'Cormorant Garamond', serif" }}>Connecting...</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(180deg,#FFF8F0 0%,#F5E1DA 100%)", position:"relative" }}>
      <style>{css}</style>
      {toast && <div className="toast-msg">{toast}</div>}

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{
        background:"linear-gradient(135deg,#6B5B50 0%,#8C7B6F 100%)",
        padding:"20px 20px 16px", color:"#FFF8F0", position:"relative", overflow:"hidden",
      }}>
        <div style={{ position:"absolute", top:-20, right:-20, width:120, height:120, borderRadius:"50%", background:"rgba(212,175,55,0.1)" }} />
        <div style={{ position:"absolute", bottom:-30, left:-10, width:80, height:80, borderRadius:"50%", background:"rgba(196,144,139,0.15)" }} />
        <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:26, fontWeight:700, letterSpacing:1, marginBottom:2, position:"relative", display:"flex", alignItems:"center", gap:10 }}>
          <span>Wedding Planner</span>
          <span title={connStatus === "connected" ? "Synced with partner" : "Offline — changes will sync when reconnected"} style={{
            fontSize:10, fontFamily:"'DM Sans', sans-serif", fontWeight:600, letterSpacing:0.5,
            padding:"3px 8px", borderRadius:10, display:"inline-flex", alignItems:"center", gap:5,
            background: connStatus === "connected" ? "rgba(168,181,160,0.25)" : "rgba(255,180,180,0.2)",
            border: `1px solid ${connStatus === "connected" ? "rgba(168,181,160,0.5)" : "rgba(255,180,180,0.4)"}`,
            color: connStatus === "connected" ? "#D4F0D0" : "#FFD0D0",
          }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background: connStatus === "connected" ? "#A8B5A0" : "#E8A8A8", animation: connStatus === "connected" ? "none" : "pulse 1.5s ease infinite" }} />
            {connStatus === "connected" ? "SYNCED" : "OFFLINE"}
          </span>
        </div>
        <div style={{ fontSize:12, opacity:0.7, letterSpacing:1.5, textTransform:"uppercase", position:"relative" }}>
          Sanjana & Partner
        </div>
        <div style={{ display:"flex", gap:8, marginTop:14, position:"relative" }}>
          {[{ label:"Engagement", date:ENGAGEMENT_DATE, emoji:"💍" }, { label:"Wedding", date:WEDDING_DATE, emoji:"🎊" }].map((ev,i) => (
            <div key={i} style={{ flex:1, background:"rgba(255,248,240,0.12)", borderRadius:10, padding:"8px 12px", border:"1px solid rgba(255,248,240,0.15)" }}>
              <div style={{ fontSize:10, opacity:0.7, textTransform:"uppercase", letterSpacing:1 }}>{ev.emoji} {ev.label}</div>
              <div style={{ fontSize:16, fontWeight:700, fontFamily:"'Cormorant Garamond', serif", marginTop:2 }}>{countdown(ev.date)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div style={{ padding:"0 0 80px", overflowY:"auto" }}>
        {tab === "dashboard" && <DashboardTab {...{ budget, totalSpent, remaining, totalSharedCost, settlement, bridePaidShared, groomPaidShared, brideShareOfShared: totalSharedCost/2, bridePersonalTotal, groomPersonalTotal, catSpending, categories }} />}
        {tab === "expenses" && <ExpensesTab expenses={expList} onAdd={() => { setEditId(null); setShowForm(true); }} onEdit={(e) => { setEditId(e.id); setShowForm(true); }} onDelete={(id) => { if(window.confirm("Delete?")) deleteExpense(id); }} />}
        {tab === "budget" && <BudgetTab {...{ budget, saveBudget, categories, saveCategories, catSpending, showToast, showSettings, setShowSettings }} />}
      </div>

      {/* ── Add/Edit Modal ─────────────────────────────────────────── */}
      {showForm && (
        <ExpenseModal
          categories={Object.keys(categories)}
          initial={editId ? expenses[editId] : null}
          onSave={(data) => { editId ? updateExpense(editId, data) : addExpense(data); setShowForm(false); setEditId(null); }}
          onClose={() => { setShowForm(false); setEditId(null); }}
        />
      )}

      {/* ── Bottom Nav ─────────────────────────────────────────────── */}
      <div style={{
        position:"fixed", bottom:0, left:0, right:0,
        background:"rgba(255,248,240,0.95)", backdropFilter:"blur(12px)",
        borderTop:"1px solid rgba(196,144,139,0.2)",
        display:"flex", justifyContent:"space-around", padding:"8px 0 12px", zIndex:50,
      }}>
        {[{ id:"dashboard", icon:"◈", label:"Dashboard" }, { id:"expenses", icon:"◎", label:"Expenses" }, { id:"budget", icon:"▣", label:"Budget" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background:"none", border:"none", cursor:"pointer",
            display:"flex", flexDirection:"column", alignItems:"center", gap:2,
            color: tab===t.id ? "#9B6B66" : "#8C7B6F",
            fontWeight: tab===t.id ? 700 : 500, transition:"all 0.2s",
          }}>
            <span style={{ fontSize:20, lineHeight:1 }}>{t.icon}</span>
            <span style={{ fontSize:11, letterSpacing:0.5 }}>{t.label}</span>
            {tab===t.id && <div style={{ width:4, height:4, borderRadius:"50%", background:"#D4AF37", marginTop:1 }} />}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DASHBOARD TAB
   ═══════════════════════════════════════════════════════════════════════ */
function DashboardTab({ budget, totalSpent, remaining, totalSharedCost, settlement,
  bridePaidShared, groomPaidShared, brideShareOfShared,
  bridePersonalTotal, groomPersonalTotal, catSpending }) {

  const pct = budget > 0 ? Math.min((totalSpent / budget) * 100, 100) : 0;

  return (
    <div style={{ padding:16 }} className="fade-up">
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
        <KpiCard label="Total Budget" value={fmtL(budget)} bg="linear-gradient(135deg,#6B5B50,#8C7B6F)" />
        <KpiCard label="Total Spent" value={fmtL(totalSpent)} bg="linear-gradient(135deg,#9B6B66,#C4908B)" />
        <KpiCard label="Remaining" value={fmtL(remaining)} bg="linear-gradient(135deg,#6B7F63,#A8B5A0)" neg={remaining<0} />
        <KpiCard label="Shared Costs" value={fmtL(totalSharedCost)} bg="linear-gradient(135deg,#C17950,#D4985F)" />
      </div>

      {/* Budget progress */}
      <div className="card">
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <span style={{ fontSize:13, fontWeight:600, color:"#6B5B50" }}>Budget Used</span>
          <span style={{ fontSize:13, fontWeight:700, color: pct>90 ? "#8B3A4A" : "#6B7F63" }}>{pct.toFixed(1)}%</span>
        </div>
        <div style={{ height:8, background:"#F0E8DD", borderRadius:4, overflow:"hidden" }}>
          <div style={{ height:"100%", borderRadius:4, transition:"width 0.6s", width:`${pct}%`,
            background: pct>90 ? "linear-gradient(90deg,#C17950,#8B3A4A)" : "linear-gradient(90deg,#A8B5A0,#6B7F63)" }} />
        </div>
      </div>

      {/* Settlement */}
      <div style={{
        background:"linear-gradient(135deg,#C17950,#D4985F)", borderRadius:14, padding:18,
        marginBottom:14, color:"#FFF8F0", boxShadow:"0 4px 20px rgba(193,121,80,0.2)",
      }}>
        <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:1.5, opacity:0.8, marginBottom:6 }}>Settlement</div>
        <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:26, fontWeight:700, marginBottom:4 }}>
          {Math.abs(settlement)<1 ? "All Settled! ✓" : settlement>0 ? `Groom owes ${fmtFull(settlement)}` : `Bride owes ${fmtFull(Math.abs(settlement))}`}
        </div>
        <div style={{ fontSize:12, opacity:0.75, lineHeight:1.4, marginTop:8 }}>
          Bride paid {fmtL(bridePaidShared)} · Groom paid {fmtL(groomPaidShared)} toward shared costs
        </div>
        <div style={{ display:"flex", gap:8, marginTop:12 }}>
          <MiniStat label="Bride's share" value={fmtL(brideShareOfShared)} />
          <MiniStat label="Groom's share" value={fmtL(brideShareOfShared)} />
        </div>
      </div>

      {/* Personal */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
        <div className="card" style={{ marginBottom:0 }}>
          <div style={{ fontSize:11, color:"#9B6B66", textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>✿ Bride Personal</div>
          <div style={{ fontSize:20, fontWeight:700, color:"#9B6B66", fontFamily:"'Cormorant Garamond', serif" }}>{fmtL(bridePersonalTotal)}</div>
        </div>
        <div className="card" style={{ marginBottom:0 }}>
          <div style={{ fontSize:11, color:"#6B7F63", textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>❖ Groom Personal</div>
          <div style={{ fontSize:20, fontWeight:700, color:"#6B7F63", fontFamily:"'Cormorant Garamond', serif" }}>{fmtL(groomPersonalTotal)}</div>
        </div>
      </div>

      {/* Categories */}
      <div className="card">
        <div style={{ fontSize:14, fontWeight:700, color:"#6B5B50", marginBottom:14 }}>Category Breakdown</div>
        {Object.entries(catSpending).map(([cat, d], i) => {
          const p = d.budget>0 ? Math.min((d.total/d.budget)*100,100) : 0;
          const over = d.total > d.budget && d.budget > 0;
          return (
            <div key={cat} className="slide-in" style={{ marginBottom:14, animationDelay:`${i*0.03}s` }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ fontSize:13, fontWeight:500, color:over?"#8B3A4A":"#4A3F35" }}>{cat}</span>
                <span style={{ fontSize:12, color:"#8C7B6F" }}>{fmtL(d.total)} / {fmtL(d.budget)}</span>
              </div>
              <div style={{ height:6, background:"#F5E1DA", borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:3, transition:"width 0.5s", width:`${p}%`,
                  background: over?"#8B3A4A" : p>75?"#C17950":"#A8B5A0" }} />
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
    <div style={{ background:bg, borderRadius:14, padding:"14px 16px", color:"#FFF8F0", boxShadow:"0 4px 16px rgba(0,0,0,0.08)" }}>
      <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:1.2, opacity:0.75 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, fontFamily:"'Cormorant Garamond', serif", marginTop:4, color:neg?"#FFB4B4":"#FFF8F0" }}>{value}</div>
    </div>
  );
}
function MiniStat({ label, value }) {
  return (
    <div style={{ flex:1, background:"rgba(255,255,255,0.15)", borderRadius:8, padding:"6px 10px" }}>
      <div style={{ fontSize:10, opacity:0.7 }}>{label}</div>
      <div style={{ fontSize:14, fontWeight:700 }}>{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   EXPENSES TAB
   ═══════════════════════════════════════════════════════════════════════ */
function ExpensesTab({ expenses, onAdd, onEdit, onDelete }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter==="all" ? expenses
    : filter==="shared" ? expenses.filter(e=>e.type==="shared")
    : expenses.filter(e=>e.type==="personal"&&e.owner===filter);
  const sorted = [...filtered].sort((a,b) => new Date(b.date||b.createdAt) - new Date(a.date||a.createdAt));

  return (
    <div style={{ padding:16 }} className="fade-up">
      <div style={{ display:"flex", gap:6, marginBottom:14, overflowX:"auto", paddingBottom:4 }}>
        {[{id:"all",label:"All"},{id:"shared",label:"Shared"},{id:"Bride",label:"✿ Bride"},{id:"Groom",label:"❖ Groom"}].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            background:filter===f.id?"#6B5B50":"white", color:filter===f.id?"#FFF8F0":"#6B5B50",
            border:"1px solid #D5C8BC", borderRadius:20, padding:"6px 16px",
            fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap",
          }}>{f.label}</button>
        ))}
      </div>

      <button className="btn-primary" onClick={onAdd} style={{ width:"100%", padding:14, fontSize:15, marginBottom:16, borderRadius:12 }}>
        + Add Expense
      </button>

      {sorted.length===0 ? (
        <div style={{ textAlign:"center", padding:40, color:"#8C7B6F" }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📝</div>
          <div style={{ fontSize:14 }}>No expenses yet</div>
        </div>
      ) : sorted.map((e,i) => (
        <div key={e.id} className="slide-in" style={{
          background:"white", borderRadius:12, padding:14, marginBottom:10,
          boxShadow:"0 2px 10px rgba(0,0,0,0.04)",
          borderLeft:`4px solid ${e.type==="shared"?"#C17950":e.owner==="Bride"?"#C4908B":"#A8B5A0"}`,
          animationDelay:`${i*0.04}s`,
        }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:15, fontWeight:600, color:"#4A3F35" }}>{e.title}</div>
              <div style={{ fontSize:12, color:"#8C7B6F", marginTop:3, lineHeight:1.5 }}>
                {e.date} · {e.category} · {e.type==="shared"?`Shared · Paid by ${e.paidBy}`:`${e.owner}'s personal`}
                {e.paymentMode?` · ${e.paymentMode}`:""}
              </div>
              {e.notes && <div style={{ fontSize:11, color:"#A89888", marginTop:4, fontStyle:"italic" }}>{e.notes}</div>}
              {e.billLink && (
                <a href={e.billLink} target="_blank" rel="noopener noreferrer" style={{
                  fontSize:11, color:"#C17950", marginTop:4, display:"inline-block",
                  textDecoration:"none", fontWeight:600,
                }}>📎 View Bill / Invoice →</a>
              )}
            </div>
            <div style={{ textAlign:"right", marginLeft:12 }}>
              <div style={{ fontSize:18, fontWeight:700, color:"#4A3F35", fontFamily:"'Cormorant Garamond', serif" }}>
                {fmtL(e.type==="shared"?e.totalCost:e.amountPaid)}
              </div>
              {e.type==="shared" && (e.totalCost||0)!==(e.amountPaid||0) && (
                <div style={{ fontSize:11, color:"#6B7F63", marginTop:2 }}>Paid: {fmtL(e.amountPaid)}</div>
              )}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:10, justifyContent:"flex-end" }}>
            <button onClick={() => onEdit(e)} style={{ background:"none", border:"1px solid #D5C8BC", borderRadius:6, padding:"4px 12px", fontSize:11, color:"#6B5B50", cursor:"pointer" }}>Edit</button>
            <button onClick={() => onDelete(e.id)} style={{ background:"none", border:"1px solid #E8C4C4", borderRadius:6, padding:"4px 12px", fontSize:11, color:"#8B3A4A", cursor:"pointer" }}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ADD / EDIT EXPENSE MODAL
   ═══════════════════════════════════════════════════════════════════════ */
function ExpenseModal({ categories, initial, onSave, onClose }) {
  const [type, setType] = useState(initial?.type || "shared");
  const [owner, setOwner] = useState(initial?.owner || "Bride");
  const [date, setDate] = useState(initial?.date || new Date().toISOString().split("T")[0]);
  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initial?.category || categories[0]);
  const [paidBy, setPaidBy] = useState(initial?.paidBy || "Bride");
  const [totalCost, setTotalCost] = useState(initial?.totalCost?.toString() || "");
  const [amountPaid, setAmountPaid] = useState(initial?.amountPaid?.toString() || "");
  const [paymentMode, setPaymentMode] = useState(initial?.paymentMode || "");
  const [billLink, setBillLink] = useState(initial?.billLink || "");
  const [notes, setNotes] = useState(initial?.notes || "");

  const handleSubmit = () => {
    if (!title.trim() || !amountPaid) return;
    onSave({
      type, owner: type==="personal"?owner:undefined,
      date, title:title.trim(), category,
      paidBy: type==="shared"?paidBy:owner,
      totalCost: type==="shared" ? (parseFloat(totalCost)||parseFloat(amountPaid)) : parseFloat(amountPaid),
      amountPaid: parseFloat(amountPaid),
      paymentMode, billLink:billLink.trim(), notes:notes.trim(),
    });
  };

  const inp = { width:"100%", padding:"10px 12px", border:"1px solid #D5C8BC", borderRadius:8, fontSize:14, background:"#FFFDF8", color:"#4A3F35", outline:"none" };
  const lbl = { fontSize:12, fontWeight:600, color:"#6B5B50", marginBottom:4, display:"block" };

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(74,63,53,0.4)", zIndex:60,
      display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(4px)",
    }} onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="fade-up" style={{
        background:"#FFF8F0", borderRadius:"20px 20px 0 0", width:"100%", maxWidth:480,
        maxHeight:"88vh", overflow:"auto", padding:"20px 20px 32px",
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:22, fontWeight:700, color:"#6B5B50" }}>
            {initial?"Edit Expense":"Add Expense"}
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#8C7B6F" }}>✕</button>
        </div>

        {/* Type toggle */}
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          {["shared","personal"].map(t => (
            <button key={t} onClick={() => setType(t)} style={{
              flex:1, padding:10, borderRadius:10, border:"2px solid",
              borderColor:type===t?"#C17950":"#D5C8BC",
              background:type===t?"#FFF0E6":"white",
              color:type===t?"#C17950":"#8C7B6F",
              fontSize:13, fontWeight:700, cursor:"pointer",
            }}>{t==="shared"?"🤝 Shared (50-50)":"👤 Personal"}</button>
          ))}
        </div>

        {type==="personal" && (
          <div style={{ marginBottom:14 }}>
            <label style={lbl}>Whose expense?</label>
            <div style={{ display:"flex", gap:8 }}>
              {["Bride","Groom"].map(w => (
                <button key={w} onClick={() => setOwner(w)} style={{
                  flex:1, padding:8, borderRadius:8,
                  border:`2px solid ${owner===w?(w==="Bride"?"#C4908B":"#A8B5A0"):"#D5C8BC"}`,
                  background:owner===w?(w==="Bride"?"#FCE4EC":"#E8F5E9"):"white",
                  fontSize:13, fontWeight:600, cursor:"pointer",
                  color:owner===w?(w==="Bride"?"#9B6B66":"#6B7F63"):"#8C7B6F",
                }}>{w==="Bride"?"✿ Bride":"❖ Groom"}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display:"grid", gap:12 }}>
          <div><label style={lbl}>Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Description</label><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Photographer advance" style={inp} /></div>
          <div>
            <label style={lbl}>Category</label>
            <select value={category} onChange={e=>setCategory(e.target.value)} style={{...inp, appearance:"auto"}}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {type==="shared" && (
            <>
              <div>
                <label style={lbl}>Total Cost of Item (₹)</label>
                <input type="number" value={totalCost} onChange={e=>setTotalCost(e.target.value)} placeholder="Full cost, e.g. 105000" style={inp} />
                <div style={{ fontSize:11, color:"#8C7B6F", marginTop:3 }}>The full price — each person's 50% share is auto-calculated</div>
              </div>
              <div>
                <label style={lbl}>Paid By</label>
                <div style={{ display:"flex", gap:6 }}>
                  {["Bride","Groom","Both"].map(w => (
                    <button key={w} onClick={() => setPaidBy(w)} style={{
                      flex:1, padding:8, borderRadius:8,
                      border:`2px solid ${paidBy===w?"#C17950":"#D5C8BC"}`,
                      background:paidBy===w?"#FFF0E6":"white",
                      fontSize:12, fontWeight:600, cursor:"pointer",
                      color:paidBy===w?"#C17950":"#8C7B6F",
                    }}>{w}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label style={lbl}>Amount Paid Now (₹)</label>
            <input type="number" value={amountPaid} onChange={e=>setAmountPaid(e.target.value)} placeholder="Amount actually paid" style={inp} />
          </div>
          <div>
            <label style={lbl}>Payment Mode</label>
            <select value={paymentMode} onChange={e=>setPaymentMode(e.target.value)} style={{...inp, appearance:"auto"}}>
              <option value="">Select...</option>
              {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>📎 Bill / Invoice Link</label>
            <input value={billLink} onChange={e=>setBillLink(e.target.value)} placeholder="Paste Google Drive / Dropbox link" style={inp} />
            <div style={{ fontSize:11, color:"#8C7B6F", marginTop:3 }}>Upload bill to Google Drive, paste the share link. Both of you will see it.</div>
          </div>
          <div>
            <label style={lbl}>Notes</label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes..." rows={2} style={{...inp, resize:"vertical"}} />
          </div>
        </div>

        <button onClick={handleSubmit} style={{
          width:"100%", padding:14, marginTop:18,
          background:"linear-gradient(135deg,#6B5B50,#8C7B6F)",
          color:"#FFF8F0", border:"none", borderRadius:12,
          fontSize:15, fontWeight:700, cursor:"pointer",
          boxShadow:"0 4px 16px rgba(107,91,80,0.2)",
        }}>{initial?"Update Expense":"Save Expense"}</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   BUDGET TAB
   ═══════════════════════════════════════════════════════════════════════ */
function BudgetTab({ budget, saveBudget, categories, saveCategories, catSpending, showToast, showSettings, setShowSettings }) {
  const [budgetInput, setBudgetInput] = useState(budget.toString());
  const [catInputs, setCatInputs] = useState({...categories});
  const allocated = Object.values(catInputs).reduce((a,b) => a+b, 0);

  // Sync if categories change from Firebase
  useEffect(() => { setCatInputs({...categories}); }, [categories]);

  return (
    <div style={{ padding:16 }} className="fade-up">
      <div className="card">
        <div style={{ fontSize:14, fontWeight:700, color:"#6B5B50", marginBottom:10 }}>Total Budget</div>
        <div style={{ display:"flex", gap:8 }}>
          <input type="number" value={budgetInput} onChange={e=>setBudgetInput(e.target.value)} style={{
            flex:1, padding:"10px 12px", border:"1px solid #D5C8BC", borderRadius:8,
            fontSize:16, fontWeight:600, background:"#FFFDF8", color:"#4A3F35",
          }} />
          <button onClick={() => {
            const v = parseFloat(budgetInput);
            if(v>0) { saveBudget(v); showToast("Budget updated ✓"); }
          }} style={{
            padding:"10px 20px", background:"#6B5B50", color:"#FFF8F0",
            border:"none", borderRadius:8, fontWeight:700, cursor:"pointer",
          }}>Set</button>
        </div>
      </div>

      <div className="card">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#6B5B50" }}>Category Budgets</div>
          <button onClick={() => setShowSettings(!showSettings)} style={{
            background:"none", border:"1px solid #D5C8BC", borderRadius:8,
            padding:"4px 12px", fontSize:12, color:"#6B5B50", cursor:"pointer",
          }}>{showSettings?"Done":"Edit"}</button>
        </div>
        <div style={{
          fontSize:12, fontWeight:600, marginBottom:14,
          color: Math.abs(allocated-budget)>100 ? "#8B3A4A" : "#6B7F63",
        }}>
          Allocated: {fmtL(allocated)} / Budget: {fmtL(budget)}
          {Math.abs(allocated-budget)>100 && ` (${fmtL(Math.abs(allocated-budget))} ${allocated>budget?"over":"under"})`}
        </div>

        {Object.keys(catInputs).map(cat => {
          const d = catSpending[cat] || { total:0, budget:catInputs[cat] };
          const p = d.budget>0 ? (d.total/d.budget)*100 : 0;
          return (
            <div key={cat} style={{ marginBottom:showSettings?10:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                <span style={{ fontSize:13, fontWeight:500 }}>{cat}</span>
                {showSettings ? (
                  <input type="number" value={catInputs[cat]} onChange={e => setCatInputs(prev=>({...prev,[cat]:parseFloat(e.target.value)||0}))} style={{
                    width:100, padding:"4px 8px", border:"1px solid #D5C8BC", borderRadius:6, fontSize:13, textAlign:"right",
                  }} />
                ) : (
                  <span style={{ fontSize:12, color:p>100?"#8B3A4A":"#8C7B6F" }}>{fmtL(d.total)} / {fmtL(d.budget)}</span>
                )}
              </div>
              {!showSettings && (
                <div style={{ height:5, background:"#F5E1DA", borderRadius:3, overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:3, width:`${Math.min(p,100)}%`,
                    background: p>100?"#8B3A4A":p>75?"#C17950":"#A8B5A0" }} />
                </div>
              )}
            </div>
          );
        })}

        {showSettings && (
          <button onClick={() => { saveCategories(catInputs); setShowSettings(false); showToast("Categories saved ✓"); }} style={{
            width:"100%", padding:12, marginTop:8,
            background:"linear-gradient(135deg,#6B7F63,#A8B5A0)",
            color:"#FFF8F0", border:"none", borderRadius:10, fontWeight:700, cursor:"pointer",
          }}>Save Category Budgets</button>
        )}
      </div>
    </div>
  );
}