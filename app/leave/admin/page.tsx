"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck, LogOut, Loader2, Lock, UserPlus, Trash2, KeyRound, Pencil, Upload,
  LayoutDashboard, Users, Mail, Save, CalendarDays, FileSpreadsheet, Send, Plus, ScrollText, AlertTriangle,
} from "lucide-react";
import { useToast } from "../../components/Toast";
import LeaveCalendar, { CalCell } from "../LeaveCalendar";
import { Modal, ConfirmDialog, PromptDialog } from "../Modal";
import { LEAVE_TYPES, dayPartLabel, rangeLabel, typeColor, workingDates, typeClass } from "@/lib/leaveShared";

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
  const [holidays, setHolidays] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [fEmp, setFEmp] = useState(""); const [fType, setFType] = useState("all");
  const [busyMail, setBusyMail] = useState(false);
  // Excel report period
  const [rpt, setRpt] = useState<"month" | "year" | "custom">("month");
  const [ry, setRy] = useState(thisMonth().slice(0, 4));
  const [rFrom, setRFrom] = useState(thisMonth() + "-01");
  const [rTo, setRTo] = useState(new Date().toISOString().slice(0, 10));
  function lastDayOf(m: string) { const [y, mm] = m.split("-").map(Number); return `${m}-${String(new Date(y, mm, 0).getDate()).padStart(2, "0")}`; }
  function reportRange() {
    if (rpt === "year") return { from: `${ry}-01-01`, to: `${ry}-12-31`, label: String(ry) };
    if (rpt === "custom") return { from: rFrom, to: rTo, label: `${rFrom}_to_${rTo}` };
    return { from: `${month}-01`, to: lastDayOf(month), label: month };
  }
  function downloadExcel() {
    const { from, to, label } = reportRange();
    if (!from || !to || from > to) { toast("Pick a valid period", "error"); return; }
    const a = document.createElement("a");
    a.href = `/api/leave/admin/export?from=${from}&to=${to}&label=${encodeURIComponent(label)}`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);
  useEffect(() => { (async () => { try { const r = await fetch("/api/leave/admin/holidays", { cache: "no-store" }); const d = await r.json(); if (r.ok) { const h: Record<string, string> = {}; (d.holidays || []).forEach((x: any) => { h[x.holiday_date] = x.name; }); setHolidays(h); } } catch {} })(); }, []);
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
    const holSet = new Set(Object.keys(holidays));
    filtered.forEach((l) => workingDates(l.start_date, l.end_date, holSet).forEach((d) => {
      if (d.startsWith(month)) { c[d] = c[d] || { people: [] }; c[d].people!.push({ name: l.display_name, type: l.leave_type }); }
    }));
    Object.entries(holidays).forEach(([d, name]) => { if (d.startsWith(month)) c[d] = { ...(c[d] || {}), holiday: name }; });
    return c;
  }, [filtered, month, holidays]);

  const ranking = useMemo(() => {
    const m = new Map<string, { name: string; days: number; reqs: number }>();
    leaves.forEach((l) => { const e = m.get(l.username) || { name: l.display_name, days: 0, reqs: 0 }; e.days += Number(l.days) || 0; e.reqs += 1; m.set(l.username, e); });
    return [...m.values()].sort((a, b) => b.days - a.days).slice(0, 8);
  }, [leaves]);
  const topDays = Math.max(1, ...ranking.map((r) => r.days));

  const monthLong = new Date(month + "-01T00:00:00").toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <>
      <div className="dash-hero">
        <div className="dash-hero-main">
          <div className="dash-hero-greet">Leave overview</div>
          <h2>{monthLong}</h2>
          <p>{people} {people === 1 ? "person" : "people"} on leave · {leaves.length} record{leaves.length === 1 ? "" : "s"} this month</p>
        </div>
        <div className="dash-hero-mini">
          {counts.map((c) => (<span key={c.t} className="mini-chip"><i style={{ background: typeColor(c.t) }} />{c.t} <b>{c.n}</b></span>))}
        </div>
      </div>

      <section className="card report-card">
        <div className="card-head"><span className="step-num"><FileSpreadsheet size={15} /></span><h2>Generate Excel report</h2></div>
        <div className="seg">
          {(["month", "year", "custom"] as const).map((k) => (
            <button key={k} className={`seg-btn ${rpt === k ? "active" : ""}`} onClick={() => setRpt(k)}>{k === "month" ? "Monthly" : k === "year" ? "Yearly" : "Custom period"}</button>
          ))}
        </div>
        <div className="report-inputs">
          {rpt === "month" && <div><label>Month</label><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>}
          {rpt === "year" && <div><label>Year</label><input type="number" min="2000" max="2100" value={ry} onChange={(e) => setRy(e.target.value)} /></div>}
          {rpt === "custom" && (<>
            <div><label>From</label><input type="date" value={rFrom} onChange={(e) => setRFrom(e.target.value)} /></div>
            <div><label>To</label><input type="date" value={rTo} min={rFrom} onChange={(e) => setRTo(e.target.value)} /></div>
          </>)}
          <div className="report-actions">
            <button className="btn primary sm" onClick={downloadExcel}><FileSpreadsheet size={15} /> Download Excel</button>
            <button className="btn ghost sm" onClick={emailSummary} disabled={busyMail}>{busyMail ? <Loader2 size={14} className="spin" /> : <Send size={15} />} Email summary</button>
          </div>
        </div>
        <div className="muted small" style={{ marginTop: 10 }}>Includes employee name, leave dates, duration, days, reason &amp; Request ID — plus a per-employee summary sheet.</div>
      </section>

      <section className="card">
        <div className="card-head"><span className="step-num"><LayoutDashboard size={15} /></span><h2>Who is on leave</h2>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: "auto", marginLeft: "auto" }} />
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
        <div className="card-head"><span className="step-num"><Users size={15} /></span><h2>Top by leave — {month}</h2></div>
        {ranking.length === 0 ? <div className="muted small">No leave recorded this month.</div> : (
          <div className="rank">
            {ranking.map((r, i) => (
              <div className="rank-row" key={r.name + i}>
                <span className="rank-pos">{i + 1}</span>
                <span className="rank-name">{r.name}</span>
                <span className="rank-track"><span className="rank-fill" style={{ width: `${(r.days / topDays) * 100}%` }} /></span>
                <span className="rank-val">{r.days}d · {r.reqs}</span>
              </div>
            ))}
          </div>
        )}
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
                    <td><span className={`tpill ${typeClass(l.leave_type)}`}>{l.leave_type}</span></td>
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
  const [delTarget, setDelTarget] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkText, setBulkText] = useState(""); const [bulkBusy, setBulkBusy] = useState(false); const [bulkRes, setBulkRes] = useState<any[] | null>(null);

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
    const r = await fetch(`/api/leave/admin/users/${encodeURIComponent(username)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed"); toast(ok, "success"); load();
  }
  async function remove(username: string) {
    const r = await fetch(`/api/leave/admin/users/${encodeURIComponent(username)}`, { method: "DELETE" });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed"); toast(`Removed '${username}'`, "info"); load();
  }
  async function openHistory(username: string) {
    try { const r = await fetch(`/api/leave/admin/leaves?username=${encodeURIComponent(username)}`, { cache: "no-store" }); const d = await r.json(); if (r.ok) setHistory({ user: username, leaves: d.leaves || [] }); } catch {}
  }
  function toggleSel(username: string) { setSel((s) => { const n = new Set(s); n.has(username) ? n.delete(username) : n.add(username); return n; }); }
  function toggleAll() { setSel((s) => s.size === list.length ? new Set() : new Set(list.map((x) => x.username))); }
  async function bulkActive(active: boolean) {
    const targets = [...sel];
    for (const un of targets) { try { await fetch(`/api/leave/admin/users/${encodeURIComponent(un)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "active", active }) }); } catch {} }
    toast(`${targets.length} user(s) ${active ? "activated" : "deactivated"}`, "info"); setSel(new Set()); load();
  }
  async function bulkImport() {
    const rows = bulkText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
      const [username, display_name, em, password, r] = line.split(",").map((x) => (x || "").trim());
      return { username, display_name, email: em, password, role: r };
    }).filter((r) => r.username && r.username.toLowerCase() !== "username");
    if (!rows.length) { toast("Paste at least one user row", "error"); return; }
    setBulkBusy(true); setBulkRes(null);
    try { const r = await fetch("/api/leave/admin/users/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed"); setBulkRes(d.results || []); toast(`Imported ${d.added}/${d.total}`, d.added ? "success" : "error"); load(); }
    catch (e: any) { toast(e?.message || String(e), "error"); } finally { setBulkBusy(false); }
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
        <div className="card-head"><span className="step-num"><Upload size={15} /></span><h2>Bulk import users</h2></div>
        <p className="muted small">One per line: <code>username,display_name,email,password,role</code> — role optional (default employee), a header row is ignored.</p>
        <textarea className="ta mono" rows={5} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"jdoe,Jane Doe,jane@rogers.com,Pass1234,employee\nmsmith,Mike Smith,mike@rogers.com,Pass1234"} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary sm" onClick={bulkImport} disabled={bulkBusy || !bulkText.trim()}>{bulkBusy ? <Loader2 size={14} className="spin" /> : <Upload size={15} />} Import users</button>
        </div>
        {bulkRes && (
          <div className="ltable-wrap" style={{ marginTop: 12 }}>
            <table className="ltable"><thead><tr><th>Username</th><th>Result</th></tr></thead>
              <tbody>{bulkRes.map((r, i) => (<tr key={i}><td className="mono">{r.username}</td><td>{r.ok ? <span className="tpill t-planned">added</span> : <span className="tpill t-holiday">{r.error}</span>}</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head"><span className="step-num"><Users size={15} /></span><h2>Users</h2></div>
        {sel.size > 0 && (
          <div className="bulk-bar">
            <span>{sel.size} selected</span>
            <button className="btn ghost sm" onClick={() => bulkActive(true)}>Activate</button>
            <button className="btn ghost sm" onClick={() => bulkActive(false)}>Deactivate</button>
            <button className="linkbtn" onClick={() => setSel(new Set())}>Clear</button>
          </div>
        )}
        {loading ? (
          <div className="ltable-wrap">{[0, 1, 2].map((i) => <div key={i} className="skeleton skel-row" />)}</div>
        ) : (
          <div className="ltable-wrap">
            <table className="ltable">
              <thead><tr>
                <th style={{ width: 28 }}><input type="checkbox" style={{ width: "auto" }} checked={sel.size === list.length && list.length > 0} onChange={toggleAll} /></th>
                <th>Username</th><th>Name</th><th>Role</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.username} style={e.active === "false" ? { opacity: .55 } : undefined}>
                    <td><input type="checkbox" style={{ width: "auto" }} checked={sel.has(e.username)} onChange={() => toggleSel(e.username)} /></td>
                    <td className="mono">{e.username}</td>
                    <td><button className="linkbtn" onClick={() => openHistory(e.username)}>{e.display_name}</button></td>
                    <td><span className={`tpill ${e.role === "admin" ? "t-holiday" : "t-planned"}`}>{e.role}</span></td>
                    <td>{e.active === "false" ? <span className="muted">inactive</span> : "active"}</td>
                    <td className="row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      <button className="btn ghost sm" title="Edit" onClick={() => setEdit(e)}><Pencil size={13} /></button>
                      <button className="btn ghost sm" title="Reset password" onClick={() => setResetTarget(e.username)}><KeyRound size={13} /></button>
                      <button className="btn ghost sm" title={e.active === "false" ? "Activate" : "Deactivate"} onClick={() => act(e.username, { action: "active", active: e.active === "false" }, "Updated").catch((err) => toast(err.message, "error"))}>{e.active === "false" ? "On" : "Off"}</button>
                      {e.username !== session.username && <button className="btn danger sm" title="Remove" onClick={() => setDelTarget(e.username)}><Trash2 size={13} /></button>}
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
      {delTarget && <ConfirmDialog title="Remove user" message={`Remove '${delTarget}'? This permanently deletes the account.`} confirmLabel="Remove" danger
        onConfirm={async () => { try { await remove(delTarget); } catch (e: any) { toast(e?.message || String(e), "error"); } setDelTarget(null); }} onClose={() => setDelTarget(null)} />}
      {resetTarget && <PromptDialog title={`Reset password — ${resetTarget}`} label="New password (min 6)" type="password" confirmLabel="Reset"
        onSubmit={async (v) => { try { await act(resetTarget, { action: "reset", password: v }, `Password reset for '${resetTarget}'`); } catch (e: any) { toast(e?.message || String(e), "error"); } setResetTarget(null); }} onClose={() => setResetTarget(null)} />}
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
              <tr key={l.request_id}><td><span className={`tpill ${typeClass(l.leave_type)}`}>{l.leave_type}</span></td><td>{rangeLabel(l.start_date, l.end_date)}</td><td>{dayPartLabel(l.day_part)}</td><td>{l.reason}</td></tr>
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

