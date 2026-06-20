"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays, LogOut, KeyRound, Send, Loader2, Lock, ShieldCheck, Plus,
} from "lucide-react";
import { useToast } from "../components/Toast";

type Role = "employee" | "admin";
interface Session { username: string; role: Role; name: string; }
interface Req {
  request_id: string; leave_type: string; start_date: string; end_date: string;
  day_part: string; days: string; reason: string; created_at: string;
}

const TYPES = ["Holiday", "Unplanned", "Sick", "Planned"] as const;
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function LeavePage() {
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  useEffect(() => { refreshMe(); }, []);
  async function refreshMe() {
    setLoadingMe(true);
    try {
      const r = await fetch("/api/leave/me", { cache: "no-store" });
      const d = await r.json();
      setSession(d.session || null);
    } catch { setSession(null); } finally { setLoadingMe(false); }
  }

  if (loadingMe) return <div className="page"><div className="muted" style={{ padding: 30 }}><Loader2 className="spin" size={18} /> Loading…</div></div>;
  if (!session) return <LoginView onIn={refreshMe} />;
  return <EmployeeView session={session} onOut={refreshMe} toast={toast} />;
}

function LoginView({ onIn }: { onIn: () => void }) {
  const [u, setU] = useState(""); const [p, setP] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit() {
    setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/leave/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Login failed");
      onIn();
    } catch (e: any) { setErr(e?.message || String(e)); } finally { setBusy(false); }
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
          <input type="password" value={p} onChange={(e) => setP(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••••" />
          {err && <div className="note err" style={{ marginTop: 12 }}>⚠ {err}</div>}
          <button className="btn primary" style={{ width: "100%", marginTop: 16, justifyContent: "center" }} onClick={submit} disabled={busy || !u || !p}>
            {busy ? <><Loader2 size={16} className="spin" /> Signing in…</> : <><Lock size={16} /> Sign in</>}
          </button>
          <div className="muted small" style={{ marginTop: 14, textAlign: "center" }}>
            Account created by your admin. Forgot your password? Ask your admin to reset it.
          </div>
          <Link className="link" style={{ justifyContent: "center", marginTop: 8 }} href="/leave/admin">Admin portal →</Link>
        </div>
      </div>
    </div>
  );
}

function EmployeeView({ session, onOut, toast }: { session: Session; onOut: () => void; toast: (m: string, k?: any) => void }) {
  const [type, setType] = useState<typeof TYPES[number]>("Planned");
  const [start, setStart] = useState(todayISO());
  const [multi, setMulti] = useState(false);
  const [end, setEnd] = useState(todayISO());
  const [dayPart, setDayPart] = useState<"full" | "half">("full");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => { loadReqs(); }, []);
  async function loadReqs() {
    try { const r = await fetch("/api/leave/requests", { cache: "no-store" }); const d = await r.json(); if (r.ok) setReqs(d.requests || []); } catch {}
  }

  async function submit() {
    if (!reason.trim()) { toast("Reason is required", "error"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/leave/requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leave_type: type, start_date: start, end_date: multi ? end : start, day_part: multi ? "full" : dayPart, reason }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Submit failed");
      toast(`Leave recorded · ${d.request_id}${d.mail?.sent ? " · email sent" : ""}`, "success");
      setReason("");
      loadReqs();
    } catch (e: any) { toast(e?.message || String(e), "error"); } finally { setBusy(false); }
  }

  async function logout() { await fetch("/api/leave/logout", { method: "POST" }); onOut(); }

  return (
    <div className="page">
      <div className="leave-top">
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Leave Request</h1>
          <div className="muted small">Signed in as <strong>{session.name}</strong> ({session.username})</div>
        </div>
        <div className="row">
          {session.role === "admin" && <Link className="btn ghost sm" href="/leave/admin"><ShieldCheck size={15} /> Admin portal</Link>}
          <button className="btn ghost sm" onClick={() => setPwOpen((v) => !v)}><KeyRound size={15} /> Change password</button>
          <button className="btn ghost sm" onClick={logout}><LogOut size={15} /> Sign out</button>
        </div>
      </div>

      {pwOpen && <ChangePassword onDone={() => setPwOpen(false)} toast={toast} />}

      <section className="card">
        <div className="card-head"><span className="step-num"><CalendarDays size={15} /></span><h2>Record leave</h2></div>

        <label>Leave type</label>
        <div className="type-chips">
          {TYPES.map((t) => (
            <button key={t} className={`chip ${type === t ? "active" : ""}`} onClick={() => setType(t)}>{t}</button>
          ))}
        </div>

        <div className="grid" style={{ marginTop: 16 }}>
          <div>
            <label>{multi ? "Start date" : "Date"}</label>
            <input type="date" value={start} onChange={(e) => { setStart(e.target.value); if (!multi) setEnd(e.target.value); }} />
          </div>
          {multi ? (
            <div>
              <label>End date</label>
              <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </div>
          ) : (
            <div>
              <label>Duration</label>
              <div className="type-chips">
                <button className={`chip ${dayPart === "full" ? "active" : ""}`} onClick={() => setDayPart("full")}>Full day</button>
                <button className={`chip ${dayPart === "half" ? "active" : ""}`} onClick={() => setDayPart("half")}>Half day</button>
              </div>
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
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? <><Loader2 size={16} className="spin" /> Submitting…</> : <><Send size={16} /> Submit leave</>}
          </button>
          <span className="muted small">A Leave Request ID is generated automatically on submit.</span>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><span className="step-num"><CalendarDays size={15} /></span><h2>My leave records</h2></div>
        {reqs.length === 0 ? (
          <div className="empty"><div className="empty-ico"><CalendarDays size={22} /></div><div className="empty-title">No leave recorded yet</div><div className="empty-sub">Submit your first leave above.</div></div>
        ) : (
          <div className="ltable-wrap">
            <table className="ltable">
              <thead><tr><th>Request ID</th><th>Type</th><th>Date(s)</th><th>Duration</th><th>Reason</th></tr></thead>
              <tbody>
                {reqs.map((r) => (
                  <tr key={r.request_id}>
                    <td className="mono">{r.request_id}</td>
                    <td><span className={`tpill t-${r.leave_type.toLowerCase()}`}>{r.leave_type}</span></td>
                    <td>{r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`}</td>
                    <td>{r.day_part === "half" ? "Half day" : `${r.days} day${r.days === "1" ? "" : "s"}`}</td>
                    <td>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ChangePassword({ onDone, toast }: { onDone: () => void; toast: (m: string, k?: any) => void }) {
  const [oldP, setOldP] = useState(""); const [newP, setNewP] = useState(""); const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const r = await fetch("/api/leave/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oldPassword: oldP, newPassword: newP }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      toast("Password updated", "success"); onDone();
    } catch (e: any) { toast(e?.message || String(e), "error"); } finally { setBusy(false); }
  }
  return (
    <section className="card">
      <div className="card-head"><span className="step-num"><KeyRound size={15} /></span><h2>Change password</h2></div>
      <div className="grid">
        <div><label>Current password</label><input type="password" value={oldP} onChange={(e) => setOldP(e.target.value)} /></div>
        <div><label>New password</label><input type="password" value={newP} onChange={(e) => setNewP(e.target.value)} /></div>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn primary sm" onClick={save} disabled={busy || !newP}>Update password</button>
        <button className="btn ghost sm" onClick={onDone}>Cancel</button>
      </div>
    </section>
  );
}
