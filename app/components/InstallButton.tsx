"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { useToast } from "./Toast";

// "Download app" = install this PWA. Uses the beforeinstallprompt event where
// available (Chrome/Edge/Android); on other browsers it shows guidance instead.
export default function InstallButton() {
  const { toast } = useToast();
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: any) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    try { if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true); } catch {}
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  async function click() {
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice?.outcome === "accepted") toast("Installing the app…", "success");
      setDeferred(null);
    } else {
      toast("To install: open your browser menu → “Install app” / “Add to Home Screen”.", "info");
    }
  }

  return (
    <button className="btn sm install-btn" onClick={click} title="Install / download the app">
      <Download size={15} /> Download app
    </button>
  );
}
