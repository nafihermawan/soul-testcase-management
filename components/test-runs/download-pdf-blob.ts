"use client";

/**
 * Picu unduhan PDF dari sebuah Blob lewat hidden anchor di DOKUMEN PEMANGGIL.
 *
 * Dua hal yang wajib ada agar tidak pernah berubah jadi tab baru:
 *  - Anchor ditempel ke `document.body` DULU sebelum `click()`. Sebagian browser
 *    mengabaikan atribut `download` pada anchor yang belum masuk dokumen dan
 *    memperlakukannya sebagai navigasi biasa — PDF lalu terbuka di viewer.
 *  - Blob diunduh dari dokumen yang benar-benar dilihat pengguna (tab Test Run /
 *    Run History), bukan dari iframe tak terlihat yang membuat PDF-nya.
 *
 * @param fileName nama file TANPA ekstensi; `.pdf` ditambahkan di sini.
 */
export function downloadPdfBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName || "download"}.pdf`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);
  // Revoke ditunda: melepas object URL terlalu cepat bisa membatalkan unduhan
  // di sebagian browser (mis. Safari).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
