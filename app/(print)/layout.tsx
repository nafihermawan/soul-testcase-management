export default function PrintLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Route group khusus cetak: tanpa sidebar/header aplikasi.
  return (
    <div style={{ background: "#FFFFFF", minHeight: "100vh" }}>{children}</div>
  );
}
