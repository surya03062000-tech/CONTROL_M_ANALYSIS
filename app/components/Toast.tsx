"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";
interface Toast { id: number; kind: ToastKind; msg: string; }

interface ToastCtx { toast: (msg: string, kind?: ToastKind) => void; }
const Ctx = createContext<ToastCtx>({ toast: () => {} });

export function useToast() { return useContext(Ctx); }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((xs) => xs.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((msg: string, kind: ToastKind = "info") => {
    const id = ++seq.current;
    setItems((xs) => [...xs, { id, kind, msg }]);
    setTimeout(() => remove(id), kind === "error" ? 7000 : 4200);
  }, [remove]);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="toast-ico">
              {t.kind === "success" ? <CheckCircle2 size={18} /> : t.kind === "error" ? <AlertTriangle size={18} /> : <Info size={18} />}
            </span>
            <span className="toast-msg">{t.msg}</span>
            <button className="toast-x" aria-label="Dismiss" onClick={() => remove(t.id)}><X size={15} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
