/**
 * Kontrak pesan antara halaman report (di dalam iframe) dan halaman pemanggilnya
 * (halaman Test Run / Run History) untuk unduhan PDF langsung.
 *
 * Dipisah dari komponen agar pemanggil tidak perlu meng-import modul komponen
 * report hanya demi satu konstanta.
 */
export const REPORT_PDF_READY = "report-pdf-ready";

export type ReportPdfReadyMessage = {
  type: typeof REPORT_PDF_READY;
  /** false = pembuatan PDF gagal (spinner tetap dimatikan, tapi ada toast error). */
  ok: boolean;
  /**
   * PDF yang sudah jadi. Dikirim ke halaman pemanggil supaya unduhan dipicu di
   * dokumen yang dilihat pengguna, bukan di dalam iframe tak terlihat — inilah
   * yang membuat PDF tidak terbuka di tab baru.
   */
  blob?: Blob;
  /** Nama file (tanpa ekstensi) untuk atribut `download`. */
  fileName?: string;
};
