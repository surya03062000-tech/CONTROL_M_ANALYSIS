"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck, LogOut, Loader2, Lock, UserPlus, Trash2, KeyRound,
  LayoutDashboard, Users, Mail, Save, CalendarDays,
} from "lucide-react";
import { useToast } from "../../components/Toast";

interface Session { username: string; role: string; name: string; }
interface Emp { username: string; display_name: string; email: string; active: string; created_at: string; }
interface Leave { request_id: string; username: string; display_name: string; leave_type: string; start_date: string; end_date: string; day_part: string; days: string; reason: string; }

const TYPES = ["Holiday", "Unplanned", "Sick", "Planned"] as const;
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

export default function AdminPage() {
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  useEffect(() => { refreshMe(); }, []);
  async function refreshMe() {
    setLoadingMe(true);
    try { const r = await fetch("/api/leave/me", { cache: "no-store" }); const d = await r.json(); setSession(d.session || null); }
    catch { setSession(null); } finally { setLoadingMe(false); }
  }

  if (loadingMe) return <div className="page"><div className="muted" style={{ padding: 30 }}><Loader2 className="spin" size={18} /> Loading…</div></div>;
  if (!session || session.role !== "admin") return <AdminLogin onIn={refreshMe} unauthorized={!!session} />;
  return <AdminView session={session} onOut={refreshMe} toast={toast} />;
}

function AdminLogin({ onIn, unauthorized }: { onIn: () => void; unauthorized: boolean }) {
  const [u, setU] = useState(""); const [p, setP] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit() {
    setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/leave/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p, as: "admin" }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Login failed");
      onIn();
    } catch (e: any) { setErr(e?.message || String(e)); } finally { setBusy(false); }
  }
  return (
    <div className="page">
      <div className="login-wrap">
        <div className="login-card card">
          <div className="login-logo admin"><ShieldCheck size={26} /></div>
          <h2>Admin Portal</h2>
          <p className="muted small" style={{ marginTop: -4 }}>Leave Request — administrators only.</p>
          {unauthorized && <div className="note err" style={{ marginTop: 8 }}>This account is not an admin.</div>}
          <label>Username</label>
          <input value={u} onChange={(e) => setU(e.target.value)} placeholder="admin" autoFocus />
          <label style={{ marginTop: 12 }}>Password</label>
          <input type="password" value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••••" />
          {err && <div className="note err" style={{ marginTop: 12 }}>⚠ {err}</div>}
          <button className="btn primary" style={{ width: "100%", marginTop: 16, justifyContent: "center" }} onClick={submit} disabled={busy || !u || !p}>
            {busy ? <><Loader2 size={16} className="spin" /> Signing in…</> : <><Lock size={16} /> Sign in</>}
          </button>
          <Link className="link" style={{ justifyContent: "center", marginTop: 12 }} href="/leave">← Employee sign-in</Link>
        </div>
      </div>
    </div>
  );
}

function AdminView({ session, onOut, toast }: { session: Session; onOut: () => void; toast: (m: string, k?: any) => void }) {
  const [tab, setTab] = useState<"dashboard" | "employees" | "config">("dashboard");
  async function logout() { await fetch("/api/leave/logout", { method: "POST" }); onOut(); }
  return (
    <div className="page">
      <div className="leave-top">
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Leave — Admin Portal</h1>
          <div className="muted small">Signed in as <strong>{session.name}</strong></div>
        </div>
        <div className="row">
          <Link className="btn ghost sm" href="/leave"><CalendarDays size={15} /> Employee view</Link>
          <button className="btn ghost sm" onClick={logout}><LogOut size={15} /> Sign out</button>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "dashboard" ? "active" : ""}`} onClick={() => setTab("dashboard")}><LayoutDashboard size={16} /> Monthly dashboard</button>
        <button className={`tab ${tab === "employees" ? "active" : ""}`} onClick={() => setTab("employees")}><Users size={16} /> Employees</button>
        <button className={`tab ${tab === "config" ? "active" : ""}`} onClick={() => setTab("config")}><Mail size={16} /> Notifications</button>
      </div>

      {tab === "dashboard" && <Dashboard />}
      {tab === "employees" && <Employees toast={toast} />}
      {tab === "config" && <Notifications toast={toast} />}
    </div>
  );
}

function Dashboard() {
  const [month, setMonth] = useState(thisMonth());
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);
  async function load() {
    setLoading(true);
    try { const r = await fetch(`/api/leave/admin/leaves?month=${month}`, { cache: "no-store" }); const d = await r.json(); if (r.ok) setLeaves(d.leaves || []); } catch {} finally { setLoading(false); }
  }
  const counts = TYPES.map((t) => ({ t, n: leaves.filter((l) => l.leave_type === t).length }));
  const people = new Set(leaves.map((l) => l.username)).size;

  return (
    <section className="card">
      <div className="card-head"><span className="step-num"><LayoutDashboard size={15} /></span><h2>Who is on leave</h2>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: "auto", marginLeft: "auto" }} />
      </div>

      <div className="stats" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <div className="stat"><div className="stat-ico" style={{ background: "#334155" }}><Users size={18} /></div><div className="stat-val">{people}</div><div className="stat-lbl">Employees</div></div>
        {counts.map((c, i) => (
          <div className="stat" key={c.t}><div className="stat-ico" style={{ background: ["#DA291C", "#d97706", "#0891b2", "#16a34a"][i] }}><CalendarDays size={18} /></div><div className="stat-val">{c.n}</div><div className="stat-lbl">{c.t}</div></div>
        ))}
      </div>

      {loading ? (
        <div className="ltable-wrap" style={{ marginTop: 18 }}>{[0, 1, 2].map((i) => <div key={i} className="skeleton skel-row" />)}</div>
      ) : leaves.length === 0 ? (
        <div className="empty"><div className="empty-ico"><CalendarDays size={22} /></div><div className="empty-title">No leave this month</div><div className="empty-sub">Nobody has recorded leave for {month}.</div></div>
      ) : (
        <div className="ltable-wrap" style={{ marginTop: 18 }}>
          <table className="ltable">
            <thead><tr><th>Employee</th><th>Type</th><th>Date(s)</th><th>Duration</th><th>Reason</th><th>Request ID</th></tr></thead>
            <tbody>
              {leaves.map((l) => (
                <tr key={l.request_id}>
                  <td><strong>{l.display_name}</strong></td>
                  <td><span className={`tpill t-${l.leave_type.toLowerCase()}`}>{l.leave_type}</span></td>
                  <td>{l.start_date === l.end_date ? l.start_date : `${l.start_date} → ${l.end_date}`}</td>
                  <td>{l.day_part === "half" ? "Half day" : `${l.days} day${l.days === "1" ? "" : "s"}`}</td>
                  <td>{l.reason}</td>
                  <td className="mono">{l.request_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Employees({ toast }: { toast: (m: string, k?: any) => void }) {
  const [list, setList] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(false);
  const [u, setU] = useState(""); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try { const r = await fetch("/api/leave/admin/users", { cache: "no-store" }); const d = await r.json(); if (r.ok) setList(d.users || []); } catch {} finally { setLoading(false); }
  }
  async function add() {
    setBusy(true);
    try {
      const r = await fetch("/api/leave/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, display_name: name, email, password: pw }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      toast(`Employee '${u}' added`, "success");
      setU(""); setName(""); setEmail(""); setPw(""); load();
    } catch (e: any) { toast(e?.message || String(e), "error"); } finally { setBusy(false); }
  }
  async function remove(username: string) {
    if (!confirm(`Remove employee '${username}'?`)) return;
    try {
      const r = await fetch(`/api/leave/admin/users/${encodeURIComponent(username)}`, { method: "DELETE" });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed");
      toast(`Removed '${username}'`, "info"); load();
    } catch (e: any) { toast(e?.message || String(e), "error"); }
  }
  async function reset(username: string) {
    const np = prompt(`New password for '${username}':`);
    if (!np) return;
    try {
      const r = await fetch(`/api/leave/admin/users/${encodeURIComponent(username)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: np }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed");
      toast(`Password reset for '${username}'`, "success");
    } catch (e: any) { toast(e?.message || String(e), "error"); }
  }

  return (
    <>
      <section className="card">
        <div className="card-head"><span className="step-num"><UserPlus size={15} /></span><h2>Add employee</h2></div>
        <div className="grid">
          <div><label>Username</label><input value={u} onChange={(e) => setU(e.target.value)} placeholder="jdoe" /></div>
          <div><label>Display name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" /></div>
          <div><label>Email (optional)</label><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@rogers.com" /></div>
          <div><label>Initial password</label><input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="set a password" /></div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary sm" onClick={add} disabled={busy || !u || !pw}><UserPlus size={15} /> Add employee</button>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><span className="step-num"><Users size={15} /></span><h2>Employees</h2></div>
        {loading ? (
          <div className="ltable-wrap">{[0, 1, 2].map((i) => <div key={i} className="skeleton skel-row" />)}</div>
        ) : list.length === 0 ? (
          <div className="empty"><div className="empty-ico"><Users size={22} /></div><div className="empty-title">No employees yet</div><div className="empty-sub">Add employees above so they can sign in and record leave.</div></div>
        ) : (
          <div className="ltable-wrap">
            <table className="ltable">
              <thead><tr><th>Username</th><th>Name</th><th>Email</th><th>Added</th><th></th></tr></thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.username}>
                    <td className="mono">{e.username}</td>
                    <td>{e.display_name}</td>
                    <td>{e.email || "—"}</td>
                    <td className="muted small">{(e.created_at || "").slice(0, 10)}</td>
                    <td className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                      <button className="btn ghost sm" onClick={() => reset(e.username)}><KeyRound size={14} /> Reset</button>
                      <button className="btn danger sm" onClick={() => remove(e.username)}><Trash2 size={14} /> Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Notifications({ toast }: { toast: (m: string, k?: any) => void }) {
  const [emails, setEmails] = useState(""); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => { try { const r = await fetch("/api/leave/admin/config", { cache: "no-store" }); const d = await r.json(); if (r.ok) setEmails(d.emails || ""); } catch {} finally { setLoading(false); } })();
  }, []);
  async function save() {
    setBusy(true);
    try {
      const r = await fetch("/api/leave/admin/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed");
      toast("Notification recipients saved", "success");
    } catch (e: any) { toast(e?.message || String(e), "error"); } finally { setBusy(false); }
  }
  return (
    <section className="card">
      <div className="card-head"><span className="step-num"><Mail size={15} /></span><h2>Email notifications</h2></div>
      <p className="muted small">These recipients get an email whenever any employee submits leave. Separate multiple addresses with commas.</p>
      <label>Recipient emails</label>
      <textarea className="ta" rows={3} value={emails} disabled={loading} onChange={(e) => setEmails(e.target.value)} placeholder="manager@rogers.com, lead@rogers.com" />
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn primary sm" onClick={save} disabled={busy || loading}><Save size={15} /> Save recipients</button>
      </div>
      <div className="muted small" style={{ marginTop: 10 }}>Email delivery requires <code>RESEND_API_KEY</code> to be set in the deployment.</div>
    </section>
  );
}
