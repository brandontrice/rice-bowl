import type { Metadata } from "next";
import { Big_Shoulders, Instrument_Sans, Chivo_Mono } from "next/font/google";
import "./globals.css";

/* Variable display face. Bebas Neue had a single weight, which is why
   nothing in the app could be emphasised; this gives us 100–900. */
const display = Big_Shoulders({
  variable: "--font-display",
  fallback: ["Arial Narrow", "Haettenschweiler", "sans-serif"],
  subsets: ["latin"],
});

const body = Instrument_Sans({
  variable: "--font-body",
  fallback: ["system-ui", "sans-serif"],
  subsets: ["latin"],
});

/* Every number in the product: scores, pick counts, the ledger. */
const data = Chivo_Mono({
  variable: "--font-data",
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Rice-Lay House",
    template: "%s · Rice-Lay House",
  },
  description: "A permanent-rivalry fantasy matchup, redrafted every week.",
  applicationName: "Rice-Lay House",
  openGraph: {
    title: "Rice-Lay House",
    description: "A permanent-rivalry fantasy matchup, redrafted every week.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${data.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ground text-ink">{children}</body>
    </html>
  );
}
