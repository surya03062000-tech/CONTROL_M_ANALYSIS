"use client";

import { useRef } from "react";
import Link from "next/link";

// A card element with a mouse-follow 3D tilt + light-glow effect. Pure CSS
// transform driven by inline custom properties — no animation library.
// Renders as a Next <Link>, a plain <a>, or a <div>, matching how the
// dashboard cards branch on internal / external / disabled today.
// Respects prefers-reduced-motion (see .tilt-card rules in globals.css) and
// is inert on touch devices since no mousemove fires there.
interface TiltCardProps {
  as?: "link" | "a" | "div";
  href?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  [key: string]: any;
}

export default function TiltCard({ as = "div", href, className = "", style, children, ...rest }: TiltCardProps) {
  const ref = useRef<HTMLElement>(null);

  function onMove(e: React.MouseEvent<HTMLElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rx = (0.5 - py) * 8;  // max ~4deg tilt up/down
    const ry = (px - 0.5) * 8;  // max ~4deg tilt left/right
    el.style.setProperty("--tilt-x", `${rx.toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${ry.toFixed(2)}deg`);
    el.style.setProperty("--glow-x", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--glow-y", `${(py * 100).toFixed(1)}%`);
  }
  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  }

  const cls = `tilt-card ${className}`;
  const handlers = { onMouseMove: onMove, onMouseLeave: onLeave };

  if (as === "link" && href) {
    return (
      <Link href={href} ref={ref as any} className={cls} style={style} {...handlers} {...rest}>
        <div className="tilt-card-inner">{children}</div>
      </Link>
    );
  }
  if (as === "a" && href) {
    return (
      <a href={href} ref={ref as any} className={cls} style={style} {...handlers} {...rest}>
        <div className="tilt-card-inner">{children}</div>
      </a>
    );
  }
  return (
    <div ref={ref as any} className={cls} style={style} {...handlers} {...rest}>
      <div className="tilt-card-inner">{children}</div>
    </div>
  );
}
