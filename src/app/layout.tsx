import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import DemoBanner from "@/components/DemoBanner";
import { cookies } from "next/headers";
import { getSession } from "@/lib/rbac";
import { SHOW_DEMO_BANNER } from "@/lib/demo";
import { APP_EMBED_COOKIE } from "@/lib/auth";

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
  // Inside the mobile app's page viewer the app draws its own sidebar and
  // banner, so the site shows just the page.
  const embedded = (await cookies()).get(APP_EMBED_COOKIE)?.value === "1";
  const banner = SHOW_DEMO_BANNER && !embedded;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // Height of the pinned demo banner; the sidebar sits just below it.
      style={{ "--banner-h": banner ? "2.25rem" : "0px" } as React.CSSProperties}
    >
      <body className="min-h-full">
        {banner && <DemoBanner />}
        <AppShell role={session?.role} name={session?.name} embedded={embedded}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
