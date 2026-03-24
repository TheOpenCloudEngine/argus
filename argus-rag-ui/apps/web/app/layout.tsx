import type { Metadata } from "next";
import { Roboto_Condensed } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const robotoCondensed = Roboto_Condensed({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Argus RAG",
  description: "Embedding, Indexing & Semantic Search",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={robotoCondensed.className}>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
