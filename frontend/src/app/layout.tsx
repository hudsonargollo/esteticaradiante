import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";
import AuthGuard from "@/components/layout/AuthGuard";

export const metadata: Metadata = {
  title: "FloSalon",
  description: "Point of Sale for salons",
};

export const viewport: Viewport = {
  themeColor: "#3248FF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthGuard>{children}</AuthGuard>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
