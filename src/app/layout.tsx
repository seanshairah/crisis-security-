import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Crisis Security", template: "%s · Crisis Security" },
  description: "Crisis Security operations portal: guards, sites, shifts, attendance and incidents, run over two-way SMS.",
};

export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f2ec" }, { media: "(prefers-color-scheme: dark)", color: "#141311" }] };

/** Applies the saved theme before first paint so a light-theme viewer never sees a dark flash.
 *  No saved choice means the CSS follows the system preference. Runs from our own origin's markup only. */
const THEME_BOOT = `try{var t=localStorage.getItem("crisis-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistMono.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} /></head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
