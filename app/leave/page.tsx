"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays, LogOut, KeyRound, Send, Loader2, Lock, ShieldCheck,
  RefreshCw, Trash2, Pencil, Download, AlertTriangle, X,
} from "lucide-react";
import { useToast } from "../components/Toast";
import LeaveCalendar, { CalCell } from "./LeaveCalendar";
import { ConfirmDialog } from "./Modal";
import {
  LEAVE_TYPES, DAY_PARTS, dayPartLabel, isHalf, genRequestId, expandDates, workingDates, computeWorkingDays, rangeLabel, typeClass,
} from "@/lib/leaveShared";

interface Session { username: string; role: string; name: string; must_change?: boolean; }
interface Req { request_id: string; leave_type: string; start_date: string; end_date: string; day_part: string; days: string; reason: string; }
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthOf = (d: string) => d.slice(0, 7);

export default function LeavePage() {
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
  if (!session) return <LoginView onIn={refreshMe} toast={toast} />;
  return <EmployeeView session={session} onChange={refreshMe} toast={toast} />;
}

function LoginView({ onIn, toast }: { onIn: () => void; toast: (m: string, k?: any) => void }) {
  const [u, setU] = useState(""); const [p, setP] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [forgot, setForgot] = useState(false);
  async function submit() {
    setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/leave/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Login failed"); onIn();
    } catch (e: any) { setErr(e?.message || String(e)); } finally { setBusy(false); }
  }
  async function sendReset() {
    try { await fetch("/api/leave/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u }) }); }
    catch {}
    toast("If that account has an email on file, a reset link has been sent.", "info"); setForgot(false);
  }
  return (
    <div className="page">
      <div className="login-wrap">
        <div className="login-card card">
          <div className="login-logo"><CalendarDays size={26} /></div>
          <h2>Leave Request</h2>
          <p className="muted small" style={{ marginTop: -4 }}>Sign in to record your leave.</p>
          <label>Username</label>
          <input value={u} onChange={(e) => setU(e.target.value)} placeholder="your username" autoFocus />
          <label style={{ marginTop: 12 }}>Password</label>
          <input type="password" value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••••" />
          {err && <div className="note err" style={{ marginTop: 12 }}>⚠ {err}</div>}
          <button className="btn primary" style={{ width: "100%", marginTop: 16, justifyContent: "center" }} onClick={submit} disabled={busy || !u || !p}>
            {busy ? <><Loader2 size={16} className="spin" /> Signing in…</> : <><Lock size={16} /> Sign in</>}
          </button>
          {forgot ? (
            <div className="note" style={{ marginTop: 12, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
              Enter your username above, then <button className="linkbtn" onClick={sendReset}>send reset link</button>. (Needs an email on file.)
            </div>
          ) : (
            <button className="linkbtn" style={{ marginTop: 12 }} onClick={() => setForgot(true)}>Forgot password?</button>
          )}
          <Link className="link" style={{ justifyContent: "center", marginTop: 10 }} href="/leave/admin">Admin portal →</Link>
        </div>
      </div>
    </div>
  );
}

function EmployeeView({ session, onChange, toast }: { session: Session; onChange: () => void; toast: (m: string, k?: any) => void }) {
  const [type, setType] = useState<typeof LEAVE_TYPES[number]>("Planned");
  const [start, setStart] = useState(todayISO());
  const [multi, setMulti] = useState(false);
  const [end, setEnd] = useState(todayISO());
  const [dayPart, setDayPart] = useState("full");
  const [reason, setReason] = useState("");
  const [reqId, setReqId] = useState(() => genRequestId());
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [pwOpen, setPwOpen] = useState(!!session.must_change);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  const [calMonth, setCalMonth] = useState(monthOf(start));
  const [avail, setAvail] = useState<Record<string, number>>({});
  const [holidays, setHolidays] = useState<Record<string, string>>({});

  useEffect(() => { loadReqs(); }, []);
  useEffect(() => { loadAvail(calMonth); }, [calMonth]);

  async function loadReqs() {
    try { const r = await fetch("/api/leave/requests", { cache: "no-store" }); const d = await r.json(); if (r.ok) setReqs(d.requests || []); } catch {}
  }
  async function loadAvail(month: string) {
    try {
      const r = await fetch(`/api/leave/availability?month=${month}`, { cache: "no-store" }); const d = await r.json();
      if (r.ok) { setAvail(d.counts || {}); const h: Record<string, string> = {}; (d.holidays || []).forEach((x: any) => { h[x.holiday_date] = x.name; }); setHolidays(h); }
    } catch {}
  }

  const overlap = useMemo(() => {
    const dates = expandDates(start, multi ? end : start);
    return Math.max(0, ...dates.map((d) => avail[d] || 0));
  }, [start, end, multi, avail]);

  const holSet = useMemo(() => new Set(Object.keys(holidays)), [holidays]);
  const wdays = useMemo(() => computeWorkingDays(start, multi ? end : start, multi ? "full" : dayPart, holSet), [start, end, multi, dayPart, holSet]);

  const cells: Record<string, CalCell> = useMemo(() => {
    const c: Record<string, CalCell> = {};
    Object.entries(avail).forEach(([d, n]) => { c[d] = { ...(c[d] || {}), count: n }; });
    Object.entries(holidays).forEach(([d, name]) => { c[d] = { ...(c[d] || {}), holiday: name }; });
    reqs.forEach((r) => workingDates(r.start_date, r.end_date, holSet).forEach((d) => { if (monthOf(d) === calMonth) c[d] = { ...(c[d] || {}), mine: true }; }));
    return c;
  }, [avail, holidays, reqs, calMonth, holSet]);

  function resetForm() {
    setEditing(null); setType("Planned"); setStart(todayISO()); setMulti(false); setEnd(todayISO());
    setDayPart("full"); setReason(""); setReqId(genRequestId());
  }
  function startEdit(r: Req) {
    setEditing(r.request_id); setType(r.leave_type as any); setStart(r.start_date);
    setMulti(r.start_date !== r.end_date); setEnd(r.end_date); setDayPart(r.day_part || "full");
    setReason(r.reason); setReqId(r.request_id); setCalMonth(monthOf(r.start_date));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (!reason.trim()) { toast("Reason is required", "error"); return; }
    setBusy(true);
    const payload = { leave_type: type, start_date: start, end_date: multi ? end : start, day_part: multi ? "full" : dayPart, reason, request_id: reqId };
    try {
      const url = editing ? `/api/leave/requests/${encodeURIComponent(editing)}` : "/api/leave/requests";
      const r = await fetch(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed");
      toast(editing ? "Leave updated" : `Leave recorded · ${d.request_id}${d.mail?.sent ? " · email sent" : ""}`, "success");
      resetForm(); loadReqs(); loadAvail(calMonth);
    } catch (e: any) { toast(e?.message || String(e), "error"); } finally { setBusy(false); }
  }
  async function doCancel(id: string) {
    try { const r = await fetch(`/api/leave/requests/${encodeURIComponent(id)}`, { method: "DELETE" }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed"); toast("Leave withdrawn", "info"); if (editing === id) resetForm(); loadReqs(); loadAvail(calMonth); }
    catch (e: any) { toast(e?.message || String(e), "error"); }
  }
  async function logout() { await fetch("/api/leave/logout", { method: "POST" }); onChange(); }

  const mustChange = !!session.must_change;

  return (
    <div className="page">
      <div className="leave-top">
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Leave Request</h1>
          <div className="muted small">Signed in as <strong>{session.name}</strong> ({session.username})</div>
        </div>
        <div className="row">
          {session.role === "admin" && <Link className="btn ghost sm" href="/leave/admin"><ShieldCheck size={15} /> Admin</Link>}
          <a className="btn ghost sm" href="/api/leave/ics"><Download size={15} /> Export .ics</a>
          <button className="btn ghost sm" onClick={() => setPwOpen((v) => !v)}><KeyRound size={15} /> Password</button>
          <button className="btn ghost sm" onClick={logout}><LogOut size={15} /> Sign out</button>
        </div>
      </div>

      {mustChange && <div className="note err" style={{ marginBottom: 16 }}><AlertTriangle size={15} /> Please set a new password before recording leave.</div>}
      {pwOpen && <ChangePassword onDone={() => { setPwOpen(false); onChange(); }} toast={toast} forced={mustChange} />}

      {!mustChange && (
        <>
          <section className="card">
            <div className="card-head"><span className="step-num"><CalendarDays size={15} /></span><h2>{editing ? "Edit leave" : "Record leave"}</h2>
              {editing && <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={resetForm}><X size={14} /> Cancel edit</button>}
            </div>

            <label>Leave type</label>
            <div className="type-chips">
              {LEAVE_TYPES.map((t) => <button key={t} className={`chip ${type === t ? "active" : ""}`} onClick={() => setType(t)}>{t}</button>)}
            </div>

            <div className="grid" style={{ marginTop: 16 }}>
              <div>
                <label>{multi ? "Start date" : "Date"}</label>
                <input type="date" value={start} onChange={(e) => { setStart(e.target.value); if (!multi) setEnd(e.target.value); setCalMonth(monthOf(e.target.value)); }} />
              </div>
              {multi ? (
                <div><label>End date</label><input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></div>
              ) : (
                <div><label>Duration</label>
                  <select value={dayPart} onChange={(e) => setDayPart(e.target.value)}>
                    {DAY_PARTS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
                  </select>
                </div>
              )}
              <div className="full">
                <label className="row" style={{ gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={multi} onChange={(e) => { setMulti(e.target.checked); if (e.target.checked) setDayPart("full"); }} />
                  <span>Multiple days (date range)</span>
                </label>
              </div>
              <div className="full">
                <label>Reason</label>
                <textarea className="ta" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Short reason for the leave…" rows={3} />
              </div>
              <div className="full">
                <label>Leave Request ID</label>
                <div className="row" style={{ gap: 8 }}>
                  <input value={reqId} onChange={(e) => setReqId(e.target.value)} disabled={!!editing} className="mono" />
                  {!editing && <button className="btn ghost sm" onClick={() => setReqId(genRequestId())} title="Generate new ID"><RefreshCw size={14} /></button>}
                </div>
                <div className="hint">Auto-generated — edit it if you prefer your own ID.</div>
              </div>
            </div>

            <div className="muted small" style={{ marginTop: 14 }}>Counts as <b style={{ color: wdays > 0 ? "var(--ok)" : "var(--err)" }}>{wdays} working day{wdays === 1 ? "" : "s"}</b> — weekends &amp; holidays are excluded.</div>
            {overlap > 0 && <div className="note" style={{ marginTop: 10, background: "var(--warn-bg)", color: "var(--warn)", border: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)" }}><AlertTriangle size={14} /> {overlap} teammate{overlap === 1 ? "" : "s"} already off on the selected date(s).</div>}

            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn primary" onClick={submit} disabled={busy}>
                {busy ? <><Loader2 size={16} className="spin" /> Saving…</> : editing ? <><Pencil size={16} /> Update leave</> : <><Send size={16} /> Submit leave</>}
              </button>
            </div>
          </section>

          <section className="card">
            <div className="card-head"><span className="step-num"><CalendarDays size={15} /></span><h2>Calendar</h2></div>
            <p className="muted small">Your leave is highlighted; “N off” shows how many teammates are away (no names). Click a day to set it.</p>
            <LeaveCalendar month={calMonth} onMonth={setCalMonth} cells={cells} onPick={(d) => { setStart(d); if (!multi) setEnd(d); }} />
          </section>

          <section className="card">
            <div className="card-head"><span className="step-num"><CalendarDays size={15} /></span><h2>My leave records</h2></div>
            {reqs.length === 0 ? (
              <div className="empty"><div className="empty-ico"><CalendarDays size={22} /></div><div className="empty-title">No leave recorded yet</div><div className="empty-sub">Submit your first leave above.</div></div>
            ) : (
              <div className="ltable-wrap">
                <table className="ltable">
                  <thead><tr><th>Request ID</th><th>Type</th><th>Date(s)</th><th>Duration</th><th>Reason</th><th></th></tr></thead>
                  <tbody>
                    {reqs.map((r) => (
                      <tr key={r.request_id}>
                        <td className="mono">{r.request_id}</td>
                        <td><span className={`tpill ${typeClass(r.leave_type)}`}>{r.leave_type}</span></td>
                        <td>{rangeLabel(r.start_date, r.end_date)}</td>
                        <td>{dayPartLabel(r.day_part)}{!isHalf(r.day_part) && ` · ${r.days}d`}</td>
                        <td>{r.reason}</td>
                        <td className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                          <button className="btn ghost sm" onClick={() => startEdit(r)}><Pencil size={13} /></button>
                          <button className="btn danger sm" onClick={() => setCancelTarget(r.request_id)}><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {cancelTarget && <ConfirmDialog title="Withdraw leave" message={`Withdraw leave ${cancelTarget}? This removes the record.`} confirmLabel="Withdraw" danger
        onConfirm={async () => { await doCancel(cancelTarget); setCancelTarget(null); }} onClose={() => setCancelTarget(null)} />}
    </div>
  );
}

function ChangePassword({ onDone, toast, forced }: { onDone: () => void; toast: (m: string, k?: any) => void; forced?: boolean }) {
  const [oldP, setOldP] = useState(""); const [newP, setNewP] = useState(""); const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const r = await fetch("/api/leave/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oldPassword: oldP, newPassword: newP }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed");
      toast("Password updated", "success"); onDone();
    } catch (e: any) { toast(e?.message || String(e), "error"); } finally { setBusy(false); }
  }
  return (
    <section className="card">
      <div className="card-head"><span className="step-num"><KeyRound size={15} /></span><h2>{forced ? "Set a new password" : "Change password"}</h2></div>
      <div className="grid">
        <div><label>Current password</label><input type="password" value={oldP} onChange={(e) => setOldP(e.target.value)} /></div>
        <div><label>New password (min 6)</label><input type="password" value={newP} onChange={(e) => setNewP(e.target.value)} /></div>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn primary sm" onClick={save} disabled={busy || !newP}>Update password</button>
        {!forced && <button className="btn ghost sm" onClick={onDone}>Cancel</button>}
      </div>
    </section>
  );
}
