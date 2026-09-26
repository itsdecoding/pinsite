import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agency OS — High-Velocity Agency Operations",
  description: "Internal operations system for callers, developers, and management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background-base text-text-primary min-h-screen selection:bg-accent-subtle selection:text-accent-primary">
        {children}
      </body>
    </html>
  );
}
