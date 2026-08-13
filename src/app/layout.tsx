import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import "./globals.css";

/**
 * Three faces, each with a job the reader can feel:
 *   Newsreader  - natural language, as it exists before a tokenizer touches it
 *   Plex Sans   - the interface talking
 *   Plex Mono   - the machine's representation: tokens, numbers, coordinates
 * The serif/mono split is doing semantic work, not decoration; it lands where
 * a sentence and its tokenisation sit next to each other.
 */

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Attention Atlas",
  description:
    "Read attention inside BERT and GPT-2, one head at a time. Pick a layer and head, and watch where each token looks.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} ${newsreader.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
