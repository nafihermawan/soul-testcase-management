import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/** Font dasar aplikasi (--font-sans). Dimuat lewat next/font/google agar
 *  di-host sendiri oleh Next (tanpa request ke Google saat runtime). */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Soul Test Case Management",
    template: "%s — Soul Test Case Management",
  },
  description: "Dashboard manajemen test case SoulParking",
  /**
   * Ikon dilayani dari /public (bukan konvensi app/) dengan query versi `?v=`.
   *
   * Alasannya: favicon di-cache sangat agresif oleh browser dan URL-nya tidak
   * pernah berubah, sehingga ikon lama — segitiga bawaan "Create Next App" —
   * bisa tertahan lama di browser meski file di server sudah diganti.
   * Dengan mengubah URL, browser dipaksa mengambil ulang.
   *
   * Setiap kali file ikon diganti, naikkan angka versinya.
   */
  icons: {
    icon: [
      { url: "/favicon.ico?v=2", type: "image/x-icon", sizes: "32x32" },
      { url: "/icon.png?v=2", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png?v=2" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
