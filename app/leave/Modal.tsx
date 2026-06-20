"use client";

import { useState } from "react";
import { X } from "lucide-react";

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><strong>{title}</strong><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title, message, confirmLabel = "Confirm", danger, onConfirm, onClose,
}: { title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void | Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted small" style={{ marginTop: 0 }}>{message}</p>
      <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button className={`btn ${danger ? "danger" : "primary"} sm`} disabled={busy}
                onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

export function PromptDialog({
  title, label, placeholder, type = "text", confirmLabel = "Save", onSubmit, onClose,
}: { title: string; label: string; placeholder?: string; type?: string; confirmLabel?: string; onSubmit: (v: string) => void | Promise<void>; onClose: () => void }) {
  const [val, setVal] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <label>{label}</label>
      <input type={type} value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder} autoFocus
             onKeyDown={(e) => { if (e.key === "Enter" && val) (async () => { setBusy(true); try { await onSubmit(val); } finally { setBusy(false); } })(); }} />
      <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={busy || !val}
                onClick={async () => { setBusy(true); try { await onSubmit(val); } finally { setBusy(false); } }}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
