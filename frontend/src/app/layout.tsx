import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from 'next/font/google';
import { Toaster } from "react-hot-toast";
import "./globals.css";
import "./brand.css";
import AuthGuard from "@/components/layout/AuthGuard";

const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const body = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Estética Radiante",
  description: "Agendamento e gestão da Estética Radiante · Elis Carvalho",
};

export const viewport: Viewport = {
  themeColor: "#0e0812",
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
    <html lang="pt-BR">
      <body className={`${display.variable} ${body.variable} antialiased`}>
        <AuthGuard>{children}</AuthGuard>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}