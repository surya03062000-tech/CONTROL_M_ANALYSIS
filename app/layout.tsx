import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppShell from "./components/AppShell";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Rogers Data Engineering Portal",
  description: "Powering D&AI Teams, One Tool at a Time — Control-M lineage analysis, diagrams, and Excel dashboards.",
  applicationName: "D&AI Portal",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "D&AI Portal" },
};

export const viewport: Viewport = {
  themeColor: "#DA291C",
};

// Set the theme before paint so there's no light→dark flash.
const themeBootstrap = `
try {
  var t = localStorage.getItem('cm-theme');
  if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
