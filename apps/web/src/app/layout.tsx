import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const ui = Inter({ variable: "--font-ui", subsets: ["latin"], display: "swap" });
const serif = Newsreader({ variable: "--font-serif", subsets: ["latin"], display: "swap", style: ["normal", "italic"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: "JewelRoute — field sales for jewellery makers", template: "%s · JewelRoute" },
  description: "Know where every salesman went, what they sold, and where every piece of jewellery is.",
};
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={`${ui.variable} ${serif.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
