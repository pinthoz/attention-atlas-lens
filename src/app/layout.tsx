import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Outfit, Space_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * The dashboard's own type stack, so the two surfaces feel like one product:
 *   Inter          - interface text
 *   Space Grotesk  - card titles and the wordmark
 *   JetBrains Mono - tokens, weights, coordinates (and tabular figures)
 *   Outfit         - the pill controls, where the dashboard uses it
 */

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-grotesk",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Attention Atlas Lens",
  description:
    "Read attention inside BERT and GPT-2, one head at a time. Pick a layer and head, and watch where each token looks.",
  // The dashboard's own mark, copied from attention-atlas/static/favicon.ico.
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrains.variable} ${outfit.variable}`}
    >
      {/*
       * Browser extensions (theme switchers, readers, grammar tools) commonly
       * stamp attributes such as `data-rm-theme` onto <body> before React
       * hydrates, which React then reports as a server/client mismatch. The
       * attribute is not ours, nothing in this project writes it, so the
       * warning is noise about the visitor's browser rather than a bug.
       * suppressHydrationWarning applies to this element's own attributes
       * only, one level deep, so real mismatches inside the tree still surface.
       */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
