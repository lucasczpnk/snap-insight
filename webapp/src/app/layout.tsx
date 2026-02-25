import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snap Insight - Dataset Intelligence SaaS",
  description: "Upload data → instantly understand structure, quality, and insights.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
