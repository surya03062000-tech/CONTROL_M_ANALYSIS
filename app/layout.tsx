import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Control-M Analyzer — Trigger",
  description: "Trigger the Control-M lineage Databricks job, watch status, download the Excel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
