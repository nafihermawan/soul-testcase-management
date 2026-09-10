/**
 * Konstanta & validasi attachment yang aman dipakai di CLIENT maupun SERVER.
 * Dipisah dari `r2.ts` karena modul itu mengimpor AWS SDK (server-only) —
 * mengimpornya dari komponen client akan membocorkan SDK ke bundle browser.
 */

/** Batas ukuran file attachment (100 MB). */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

/** MIME yang diterima: gambar & video (evidence QA). */
export function isAllowedMime(mimeType: string): boolean {
  return /^image\//.test(mimeType) || /^video\//.test(mimeType);
}
