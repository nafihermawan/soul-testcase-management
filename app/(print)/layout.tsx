export default function PrintLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Route group khusus cetak: tanpa sidebar/header aplikasi.
  //
  // Body aplikasi di-set `height: 100vh; overflow: hidden` (globals.css), jadi
  // halaman cetak butuh kontainer scroll-nya sendiri dengan tinggi terbatas —
  // tanpa ini dokumen report yang lebih tinggi dari viewport tidak bisa digulir.
  // `.print-scroll` di-reset pada @media print agar seluruh dokumen tetap
  // tercetak (bukan hanya bagian yang terlihat).
  return (
    <div
      className="print-scroll"
      style={{ background: "#FFFFFF", height: "100vh", overflowY: "auto" }}
    >
      {children}
    </div>
  );
}
