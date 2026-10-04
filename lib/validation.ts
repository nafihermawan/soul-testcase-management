/**
 * Util input yang aman di-import dari komponen client maupun server.
 */

/**
 * Normalisasi URL: tambahkan `https://` bila pengguna tidak mengetik skema.
 * `www.clickup.com` / `clickup.com` -> `https://...`; `http(s)://...` dibiarkan.
 * Nilai kosong mengembalikan string kosong.
 */
export function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/**
 * Pesan error bila nilai TIDAK bisa diparse sebagai URL setelah dinormalisasi.
 * `null` = valid atau kosong (field ini opsional).
 */
export function urlFormatError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  try {
    new URL(normalizeUrl(v));
    return null;
  } catch {
    return "Format URL tidak valid. Periksa kembali tautannya.";
  }
}
