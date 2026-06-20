"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { typeColor } from "@/lib/leaveShared";

export interface CalCell { count?: number; mine?: boolean; holiday?: string; people?: { name: string; type: string }[]; }

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function LeaveCalendar({
  month, onMonth, cells, onPick, showNames = false,
}: {
  month: string; onMonth: (m: string) => void; cells: Record<string, CalCell>;
  onPick?: (date: string) => void; showNames?: boolean;
}) {
  const [y, m] = month.split("-").map(Number);
  const startWeekday = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

  const items: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) items.push(null);
  for (let d = 1; d <= daysInMonth; d++) items.push(`${month}-${String(d).padStart(2, "0")}`);

  const label = new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="cal">
      <div className="cal-head">
        <button className="icon-btn" aria-label="Previous month" onClick={() => onMonth(shiftMonth(month, -1))}><ChevronLeft size={16} /></button>
        <strong>{label}</strong>
        <button className="icon-btn" aria-label="Next month" onClick={() => onMonth(shiftMonth(month, 1))}><ChevronRight size={16} /></button>
      </div>
      <div className="cal-grid cal-wd">{WD.map((w) => <div key={w} className="cal-wdh">{w}</div>)}</div>
      <div className="cal-grid">
        {items.map((date, i) => {
          if (!date) return <div key={`b${i}`} className="cal-cell empty" />;
          const c = cells[date] || {};
          const dow = new Date(date + "T00:00:00").getDay();
          const weekend = dow === 0 || dow === 6;
          const clickable = !!onPick;
          return (
            <div key={date}
                 className={`cal-cell ${weekend ? "weekend" : ""} ${c.mine ? "mine" : ""} ${c.holiday ? "holiday" : ""} ${date === today ? "today" : ""} ${clickable ? "pick" : ""}`}
                 onClick={() => onPick?.(date)} role={clickable ? "button" : undefined} tabIndex={clickable ? 0 : undefined}
                 onKeyDown={(e) => { if (clickable && (e.key === "Enter" || e.key === " ")) onPick?.(date); }}>
              <span className="cal-day">{Number(date.slice(8))}</span>
              {c.holiday && <span className="cal-hol" title={c.holiday}>{c.holiday}</span>}
              {!showNames && !!c.count && <span className="cal-count">{c.count} off</span>}
              {showNames && c.people?.slice(0, 3).map((p, j) => (
                <span key={j} className="cal-name" style={{ borderColor: typeColor(p.type) }}>{p.name}</span>
              ))}
              {showNames && (c.people?.length || 0) > 3 && <span className="cal-more">+{(c.people!.length - 3)} more</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
