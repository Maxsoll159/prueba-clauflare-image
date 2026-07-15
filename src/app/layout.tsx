import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CF Image + S3 — Demo de cacheo",
  description:
    "API devuelve URLs de S3 → Cloudflare transforma y cachea → next/image optimiza",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full bg-[radial-gradient(circle_at_top,_#e0f2fe,_#f8fafc_55%)] text-slate-950">
        {children}
      </body>
    </html>
  );
}
