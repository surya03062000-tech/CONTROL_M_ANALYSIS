"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck, LogOut, Loader2, Lock, UserPlus, Trash2, KeyRound, Pencil, X,
  LayoutDashboard, Users, Mail, Save, CalendarDays, Download, Send, Plus, ScrollText, AlertTriangle,
} from "lucide-react";
import { useToast } from "../../components/Toast";
import LeaveCalendar, { CalCell } from "../LeaveCalendar";
import { LEAVE_TYPES, dayPartLabel, rangeLabel, typeColor, expandDates } from "@/lib/leaveShared";

interface Session { username: string; role: string; name: string; }
interface UserRow { username: string; role: string; display_name: string; email: string; active: string; created_at: string; must_change: string; }
interface Leave { request_id: string; username: string; display_name: string; leave_type: string; start_date: string; end_date: string; day_part: string; days: string; reason: string; }

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

export default function AdminPage() {
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [insecure, setInsecure] = useState(false);
  const [loadingMe, setLoadingMe] = useState(true);

  useEffect(() => { refreshMe(); }, []);
  async function refreshMe() {
    setLoadingMe(true);
    try { const r = await fetch("/api/leave/me", { cache: "no-store" }); const d = await r.json(); setSession(d.session || null); setInsecure(!!d.insecureSecret); }
    catch { setSession(null); } finally { setLoadingMe(false); }
  }

  if (loadingMe) return <div className="page"><div className="muted" style={{ padding: 30 }}><Loader2 className="spin" size={18} /> Loading…</div></div>;
  if (!session || session.role !== "admin") return <AdminLogin onIn={refreshMe} unauthorized={!!session} />;
  return <AdminView session={session} insecure={insecure} onOut={refreshMe} toast={toast} />;
}

function AdminLogin({ onIn, unauthorized }: { onIn: () => void; unauthorized: boolean }) {
  const [u, setU] = useState(""); const [p, setP] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit() {
    setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/leave/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p, as: "admin" }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Login failed"); onIn();
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

const TABS = [
  { k: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { k: "employees", label: "Users", icon: Users },
  { k: "holidays", label: "Holidays", icon: CalendarDays },
  { k: "config", label: "Notifications", icon: Mail },
  { k: "audit", label: "Audit log", icon: ScrollText },
] as const;

function AdminView({ session, insecure, onOut, toast }: { session: Session; insecure: boolean; onOut: () => void; toast: (m: string, k?: any) => void }) {
  const [tab, setTab] = useState<typeof TABS[number]["k"]>("dashboard");
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

      {insecure && <div className="note" style={{ marginBottom: 16, background: "var(--warn-bg)", color: "var(--warn)", border: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)" }}><AlertTriangle size={15} /> Set a strong <code>AUTH_SECRET</code> in the deployment — sessions are currently signed with an insecure default.</div>}

      <div className="tabs">
        {TABS.map((t) => { const I = t.icon; return <button key={t.k} className={`tab ${tab === t.k ? "active" : ""}`} onClick={() => setTab(t.k)}><I size={16} /> {t.label}</button>; })}
      </div>

      {tab === "dashboard" && <Dashboard toast={toast} />}
      {tab === "employees" && <Employees session={session} toast={toast} />}
      {tab === "holidays" && <Holidays toast={toast} />}
      {tab === "config" && <Notifications toast={toast} />}
      {tab === "audit" && <Audit />}
    </div>
  );
}

function Dashboard({ toast }: { toast: (m: string, k?: any) => void }) {
  const [month, setMonth] = useState(thisMonth());
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(false);
  const [fEmp, setFEmp] = useState(""); const [fType, setFType] = useState("all");
  const [busyMail, setBusyMail] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);
  async function load() {
    setLoading(true);
    try { const r = await fetch(`/api/leave/admin/leaves?month=${month}`, { cache: "no-store" }); const d = await r.json(); if (r.ok) setLeaves(d.leaves || []); } catch {} finally { setLoading(false); }
  }
  async function emailSummary() {
    setBusyMail(true);
    try { const r = await fetch(`/api/leave/admin/summary?month=${month}`, { method: "POST" }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed"); toast(d.mail?.sent ? "Summary emailed" : `Not sent: ${d.mail?.reason || "email not configured"}`, d.mail?.sent ? "success" : "error"); }
    catch (e: any) { toast(e?.message || String(e), "error"); } finally { setBusyMail(false); }
  }

  const filtered = leaves.filter((l) => (fType === "all" || l.leave_type === fType) && (!fEmp || (l.display_name + l.username).toLowerCase().includes(fEmp.toLowerCase())));
  const counts = LEAVE_TYPES.map((t) => ({ t, n: leaves.filter((l) => l.leave_type === t).length }));
  const maxN = Math.max(1, ...counts.map((c) => c.n));
  const people = new Set(leaves.map((l) => l.username)).size;

  const cells: Record<string, CalCell> = useMemo(() => {
    const c: Record<string, CalCell> = {};
    filtered.forEach((l) => expandDates(l.start_date, l.end_date).forEach((d) => {
      if (d.startsWith(month)) { c[d] = c[d] || { people: [] }; c[d].people!.push({ name: l.display_name, type: l.leave_type }); }
    }));
    return c;
  }, [filtered, month]);

  return (
    <>
      <section className="card">
        <div className="card-head"><span className="step-num"><LayoutDashboard size={15} /></span><h2>Who is on leave</h2>
          <div className="row" style={{ marginLeft: "auto", gap: 8 }}>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: "auto" }} />
            <a className="btn ghost sm" href={`/api/leave/admin/export?month=${month}`}><Download size={15} /> CSV</a>
            <button className="btn ghost sm" onClick={emailSummary} disabled={busyMail}>{busyMail ? <Loader2 size={14} className="spin" /> : <Send size={15} />} Email summary</button>
          </div>
        </div>

        <div className="stats five">
          <div className="stat"><div className="stat-ico" style={{ background: "#334155" }}><Users size={18} /></div><div className="stat-val">{people}</div><div className="stat-lbl">Employees</div></div>
          {counts.map((c) => (
            <div className="stat" key={c.t}><div className="stat-ico" style={{ background: typeColor(c.t) }}><CalendarDays size={18} /></div><div className="stat-val">{c.n}</div><div className="stat-lbl">{c.t}</div></div>
          ))}
        </div>

        <div className="bars">
          {counts.map((c) => (
            <div className="bar-row" key={c.t}>
              <span className="bar-label">{c.t}</span>
              <span className="bar-track"><span className="bar-fill" style={{ width: `${(c.n / maxN) * 100}%`, background: typeColor(c.t) }} /></span>
              <span className="bar-n">{c.n}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head"><span className="step-num"><CalendarDays size={15} /></span><h2>Calendar — {month}</h2></div>
        <LeaveCalendar month={month} onMonth={setMonth} cells={cells} showNames />
      </section>

      <section className="card">
        <div className="card-head"><span className="step-num"><Users size={15} /></span><h2>Leave records</h2>
          <div className="row" style={{ marginLeft: "auto", gap: 8 }}>
            <input placeholder="Filter employee…" value={fEmp} onChange={(e) => setFEmp(e.target.value)} style={{ width: 170 }} />
            <select value={fType} onChange={(e) => setFType(e.target.value)} style={{ width: "auto" }}>
              <option value="all">All types</option>
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        {loading ? (
          <div className="ltable-wrap">{[0, 1, 2].map((i) => <div key={i} className="skeleton skel-row" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-ico"><CalendarDays size={22} /></div><div className="empty-title">No matching leave</div><div className="empty-sub">Nothing for {month} with the current filters.</div></div>
        ) : (
          <div className="ltable-wrap">
            <table className="ltable">
              <thead><tr><th>Employee</th><th>Type</th><th>Date(s)</th><th>Duration</th><th>Reason</th><th>Request ID</th></tr></thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.request_id}>
                    <td><strong>{l.display_name}</strong></td>
                    <td><span className={`tpill t-${l.leave_type.toLowerCase()}`}>{l.leave_type}</span></td>
                    <td>{rangeLabel(l.start_date, l.end_date)}</td>
                    <td>{dayPartLabel(l.day_part)}</td>
                    <td>{l.reason}</td>
                    <td className="mono">{l.request_id}</td>
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

function Employees({ session, toast }: { session: Session; toast: (m: string, k?: any) => void }) {
  const [list, setList] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [u, setU] = useState(""); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [role, setRole] = useState("employee");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<UserRow | null>(null);
  const [history, setHistory] = useState<{ user: string; leaves: Leave[] } | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try { const r = await fetch("/api/leave/admin/users", { cache: "no-store" }); const d = await r.json(); if (r.ok) setList(d.users || []); } catch {} finally { setLoading(false); }
  }
  async function add() {
    setBusy(true);
    try {
      const r = await fetch("/api/leave/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, display_name: name, email, password: pw, role }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed");
      toast(`User '${u}' added`, "success"); setU(""); setName(""); setEmail(""); setPw(""); setRole("employee"); load();
    } catch (e: any) { toast(e?.message || String(e), "error"); } finally { setBusy(false); }
  }
  async function act(username: string, body: any, ok: string) {
    try { const r = await fetch(`/api/leave/admin/users/${encodeURIComponent(username)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed"); toast(ok, "success"); load(); }
    catch (e: any) { toast(e?.message || String(e), "error"); }
  }
  async function remove(username: string) {
    if (!confirm(`Remove '${username}'? This deletes the account.`)) return;
    try { const r = await fetch(`/api/leave/admin/users/${encodeURIComponent(username)}`, { method: "DELETE" }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed"); toast(`Removed '${username}'`, "info"); load(); }
    catch (e: any) { toast(e?.message || String(e), "error"); }
  }
  async function resetPw(username: string) {
    const np = prompt(`New password for '${username}' (they'll be asked to change it):`); if (!np) return;
    act(username, { action: "reset", password: np }, `Password reset for '${username}'`);
  }
  async function openHistory(username: string) {
    try { const r = await fetch(`/api/leave/admin/leaves?username=${encodeURIComponent(username)}`, { cache: "no-store" }); const d = await r.json(); if (r.ok) setHistory({ user: username, leaves: d.leaves || [] }); } catch {}
  }

  return (
    <>
      <section className="card">
        <div className="card-head"><span className="step-num"><UserPlus size={15} /></span><h2>Add user</h2></div>
        <div className="grid">
          <div><label>Username</label><input value={u} onChange={(e) => setU(e.target.value)} placeholder="jdoe" /></div>
          <div><label>Display name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" /></div>
          <div><label>Email (optional)</label><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@rogers.com" /></div>
          <div><label>Initial password (min 6)</label><input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="set a password" /></div>
          <div><label>Role</label><select value={role} onChange={(e) => setRole(e.target.value)}><option value="employee">employee</option><option value="admin">admin</option></select></div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary sm" onClick={add} disabled={busy || !u || !pw}><UserPlus size={15} /> Add user</button>
          <span className="muted small">New users are asked to set their own password on first sign-in.</span>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><span className="step-num"><Users size={15} /></span><h2>Users</h2></div>
        {loading ? (
          <div className="ltable-wrap">{[0, 1, 2].map((i) => <div key={i} className="skeleton skel-row" />)}</div>
        ) : (
          <div className="ltable-wrap">
            <table className="ltable">
              <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.username} style={e.active === "false" ? { opacity: .55 } : undefined}>
                    <td className="mono">{e.username}</td>
                    <td><button className="linkbtn" onClick={() => openHistory(e.username)}>{e.display_name}</button></td>
                    <td><span className={`tpill ${e.role === "admin" ? "t-holiday" : "t-planned"}`}>{e.role}</span></td>
                    <td>{e.active === "false" ? <span className="muted">inactive</span> : "active"}</td>
                    <td className="row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      <button className="btn ghost sm" title="Edit" onClick={() => setEdit(e)}><Pencil size={13} /></button>
                      <button className="btn ghost sm" title="Reset password" onClick={() => resetPw(e.username)}><KeyRound size={13} /></button>
                      <button className="btn ghost sm" title={e.active === "false" ? "Activate" : "Deactivate"} onClick={() => act(e.username, { action: "active", active: e.active === "false" }, "Updated")}>{e.active === "false" ? "On" : "Off"}</button>
                      {e.username !== session.username && <button className="btn danger sm" title="Remove" onClick={() => remove(e.username)}><Trash2 size={13} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {edit && <EditUser user={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} toast={toast} />}
      {history && <HistoryModal data={history} onClose={() => setHistory(null)} />}
    </>
  );
}

function EditUser({ user, onClose, onSaved, toast }: { user: UserRow; onClose: () => void; onSaved: () => void; toast: (m: string, k?: any) => void }) {
  const [name, setName] = useState(user.display_name); const [email, setEmail] = useState(user.email); const [role, setRole] = useState(user.role); const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await patch({ action: "profile", display_name: name, email });
      if (role !== user.role) await patch({ action: "role", role });
      toast("User updated", "success"); onSaved();
    } catch (e: any) { toast(e?.message || String(e), "error"); } finally { setBusy(false); }
  }
  async function patch(body: any) {
    const r = await fetch(`/api/leave/admin/users/${encodeURIComponent(user.username)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed");
  }
  return (
    <Modal title={`Edit ${user.username}`} onClose={onClose}>
      <label>Display name</label><input value={name} onChange={(e) => setName(e.target.value)} />
      <label style={{ marginTop: 12 }}>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} />
      <label style={{ marginTop: 12 }}>Role</label><select value={role} onChange={(e) => setRole(e.target.value)}><option value="employee">employee</option><option value="admin">admin</option></select>
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn primary sm" onClick={save} disabled={busy}><Save size={15} /> Save</button>
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

function HistoryModal({ data, onClose }: { data: { user: string; leaves: Leave[] }; onClose: () => void }) {
  return (
    <Modal title={`Leave history — ${data.user}`} onClose={onClose}>
      {data.leaves.length === 0 ? <div className="muted small">No leave records.</div> : (
        <div className="ltable-wrap">
          <table className="ltable">
            <thead><tr><th>Type</th><th>Date(s)</th><th>Duration</th><th>Reason</th></tr></thead>
            <tbody>{data.leaves.map((l) => (
              <tr key={l.request_id}><td><span className={`tpill t-${l.leave_type.toLowerCase()}`}>{l.leave_type}</span></td><td>{rangeLabel(l.start_date, l.end_date)}</td><td>{dayPartLabel(l.day_part)}</td><td>{l.reason}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function Holidays({ toast }: { toast: (m: string, k?: any) => void }) {
  const [list, setList] = useState<{ holiday_date: string; name: string }[]>([]);
  const [date, setDate] = useState(""); const [name, setName] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { load(); }, []);
  async function load() { try { const r = await fetch("/api/leave/admin/holidays", { cache: "no-store" }); const d = await r.json(); if (r.ok) setList(d.holidays || []); } catch {} }
  async function add() {
    if (!date) return; setBusy(true);
    try { const r = await fetch("/api/leave/admin/holidays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, name }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed"); toast("Holiday added", "success"); setDate(""); setName(""); load(); }
    catch (e: any) { toast(e?.message || String(e), "error"); } finally { setBusy(false); }
  }
  async function del(d: string) { try { const r = await fetch(`/api/leave/admin/holidays?date=${encodeURIComponent(d)}`, { method: "DELETE" }); if (r.ok) { toast("Removed", "info"); load(); } } catch {} }
  return (
    <section className="card">
      <div className="card-head"><span className="step-num"><CalendarDays size={15} /></span><h2>Company holidays</h2></div>
      <p className="muted small">Holidays show on everyone's calendar.</p>
      <div className="grid">
        <div><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Canada Day" /></div>
      </div>
      <div className="row" style={{ marginTop: 14 }}><button className="btn primary sm" onClick={add} disabled={busy || !date}><Plus size={15} /> Add holiday</button></div>
      {list.length > 0 && (
        <div className="ltable-wrap" style={{ marginTop: 16 }}>
          <table className="ltable"><thead><tr><th>Date</th><th>Name</th><th></th></tr></thead>
            <tbody>{list.map((h) => (<tr key={h.holiday_date}><td>{h.holiday_date}</td><td>{h.name}</td><td style={{ textAlign: "right" }}><button className="btn danger sm" onClick={() => del(h.holiday_date)}><Trash2 size={13} /></button></td></tr>))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Notifications({ toast }: { toast: (m: string, k?: any) => void }) {
  const [emails, setEmails] = useState(""); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { const r = await fetch("/api/leave/admin/config", { cache: "no-store" }); const d = await r.json(); if (r.ok) setEmails(d.emails || ""); } catch {} finally { setLoading(false); } })(); }, []);
  async function save() {
    setBusy(true);
    try { const r = await fetch("/api/leave/admin/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed"); toast("Recipients saved", "success"); }
    catch (e: any) { toast(e?.message || String(e), "error"); } finally { setBusy(false); }
  }
  return (
    <section className="card">
      <div className="card-head"><span className="step-num"><Mail size={15} /></span><h2>Email notifications</h2></div>
      <p className="muted small">These recipients get an email whenever an employee submits leave. Comma-separated.</p>
      <label>Recipient emails</label>
      <textarea className="ta" rows={3} value={emails} disabled={loading} onChange={(e) => setEmails(e.target.value)} placeholder="manager@rogers.com, lead@rogers.com" />
      <div className="row" style={{ marginTop: 14 }}><button className="btn primary sm" onClick={save} disabled={busy || loading}><Save size={15} /> Save recipients</button></div>
      <div className="muted small" style={{ marginTop: 10 }}>Email delivery requires <code>RESEND_API_KEY</code> in the deployment.</div>
    </section>
  );
}

function Audit() {
  const [rows, setRows] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { const r = await fetch("/api/leave/admin/audit", { cache: "no-store" }); const d = await r.json(); if (r.ok) setRows(d.audit || []); } catch {} finally { setLoading(false); } })(); }, []);
  return (
    <section className="card">
      <div className="card-head"><span className="step-num"><ScrollText size={15} /></span><h2>Audit log</h2></div>
      {loading ? <div className="ltable-wrap">{[0, 1, 2].map((i) => <div key={i} className="skeleton skel-row" />)}</div>
        : rows.length === 0 ? <div className="muted small">No activity yet.</div> : (
          <div className="ltable-wrap">
            <table className="ltable"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
              <tbody>{rows.map((r, i) => (<tr key={i}><td className="muted small">{(r.ts || "").slice(0, 19).replace("T", " ")}</td><td className="mono">{r.actor}</td><td>{r.action}</td><td className="mono">{r.target}</td><td className="muted small">{r.detail}</td></tr>))}</tbody>
            </table>
          </div>
        )}
    </section>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><strong>{title}</strong><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
