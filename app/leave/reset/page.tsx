"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Lock, KeyRound, CheckCircle2 } from "lucide-react";

export default function ResetPage() {
  const [token, setToken] = useState("");
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [done, setDone] = useState(false);

  useEffect(() => {
    try { setToken(new URLSearchParams(window.location.search).get("token") || ""); } catch {}
  }, []);

  async function submit() {
    setErr("");
    if (pw !== pw2) { setErr("Passwords don't match."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/leave/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, newPassword: pw }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed");
      setDone(true);
    } catch (e: any) { setErr(e?.message || String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <div className="login-wrap">
        <div className="login-card card">
          <div className="login-logo"><KeyRound size={26} /></div>
          <h2>Reset password</h2>
          {done ? (
            <>
              <div className="note ok" style={{ marginTop: 12 }}><CheckCircle2 size={15} /> Password updated. You can sign in now.</div>
              <Link className="btn primary" style={{ width: "100%", marginTop: 16, justifyContent: "center" }} href="/leave"><Lock size={16} /> Go to sign in</Link>
            </>
          ) : !token ? (
            <div className="note err" style={{ marginTop: 12 }}>Missing reset token. Use the link from your email.</div>
          ) : (
            <>
              <label style={{ marginTop: 10 }}>New password (min 6)</label>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
              <label style={{ marginTop: 12 }}>Confirm password</label>
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••••" />
              {err && <div className="note err" style={{ marginTop: 12 }}>⚠ {err}</div>}
              <button className="btn primary" style={{ width: "100%", marginTop: 16, justifyContent: "center" }} onClick={submit} disabled={busy || !pw}>
                {busy ? <><Loader2 size={16} className="spin" /> Saving…</> : <><Lock size={16} /> Set new password</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
