import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Sistema de diseño: Inter Tight para títulos/display (más condensada, más
 * carácter que Inter a tamaños grandes), Inter para texto de cuerpo/UI
 * (excelente legibilidad en pantalla), JetBrains Mono para datos tabulares
 * (montos, NITs, confidence, IDs) — una tabular/monoespaciada hace que
 * columnas de números alineen visualmente, cosa que Inter (proporcional)
 * no logra igual de bien.
 */
const interTight = Inter_Tight({
  variable: "--font-display",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mansor — Digitalización de documentos",
  description:
    "Sistema de digitalización de documentos financieros de Mansor con OCR propio.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${interTight.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
