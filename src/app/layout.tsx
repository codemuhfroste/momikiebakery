import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import DemoBanner from "@/components/DemoBanner";
import { getSession } from "@/lib/rbac";
import { SHOW_DEMO_BANNER } from "@/lib/demo";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Momikie's POS",
  description: "Point-of-sale system for Momikie's General Merchandise",
  appleWebApp: { title: "Momikie's POS", statusBarStyle: "black-translucent" },
};

// Colours the phone's status bar to match the navy menu bar.
export const viewport: Viewport = { themeColor: "#0f1d3d" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // Height of the pinned demo banner; the sidebar sits just below it.
      style={{ "--banner-h": SHOW_DEMO_BANNER ? "2.25rem" : "0px" } as React.CSSProperties}
    >
      <body className="min-h-full">
        <DemoBanner />
        <AppShell role={session?.role} name={session?.name}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
