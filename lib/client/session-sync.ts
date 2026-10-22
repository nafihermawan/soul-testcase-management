"use client";

/**
 * Kanal sinyal perubahan sesi antar-tab.
 *
 * Konteks: NextAuth memakai strategi JWT, jadi sesi disimpan di SATU cookie
 * httpOnly yang dipakai bersama oleh seluruh tab pada browser yang sama. Cookie
 * httpOnly tidak bisa dibaca/ditulis dari JavaScript, sehingga perubahan sesi
 * (logout / login akun lain) di satu tab tidak pernah diketahui tab lainnya:
 * tab lama tetap menampilkan identitas & data pengguna sebelumnya (state
 * client-nya basi) padahal request-nya sudah memakai cookie terbaru — itulah
 * percampuran akses sesi yang dilaporkan.
 *
 * Yang dibroadcast di sini hanyalah SINYAL (bukan token/kredensial). Token tetap
 * hanya hidup di cookie httpOnly; tidak ada nilai kredensial yang ditaruh di
 * localStorage. Tab yang menerima sinyal lalu revalidasi ke server (/api/me).
 */

export type SessionChangeAction = "login" | "logout";

export type SessionChangeMessage = {
  action: SessionChangeAction;
  /** Penanda unik agar pesan tidak diproses berkali-kali. */
  nonce: string;
  ts: number;
};

const CHANNEL_NAME = "soul:session";
const STORAGE_KEY = "soul:session-change";

const hasBroadcastChannel = (): boolean =>
  typeof window !== "undefined" && typeof window.BroadcastChannel !== "undefined";

const makeMessage = (action: SessionChangeAction): SessionChangeMessage => ({
  action,
  nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  ts: Date.now(),
});

/**
 * Umumkan perubahan sesi ke tab LAIN (tab pengirim tidak menerima pesan ini).
 * Dipakai tepat setelah login berhasil dan tepat setelah cookie sesi terhapus.
 */
export function notifySessionChange(action: SessionChangeAction): void {
  if (typeof window === "undefined") return;
  const message = makeMessage(action);
  try {
    if (hasBroadcastChannel()) {
      // BroadcastChannel: kanal tunggal, jadi tidak ada pengiriman ganda.
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(message);
      channel.close();
      return;
    }
    // Fallback browser tanpa BroadcastChannel: event `storage` juga hanya
    // terkirim ke tab lain (bukan tab penulis).
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
  } catch {
    // BroadcastChannel/localStorage bisa diblokir (mis. mode privat) — abaikan.
  }
}

/**
 * Dengarkan sinyal perubahan sesi dari tab lain.
 * @returns fungsi unsubscribe untuk dipanggil saat unmount.
 */
export function subscribeSessionChange(
  handler: (message: SessionChangeMessage) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  if (hasBroadcastChannel()) {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const onMessage = (event: MessageEvent) => {
      const data = event.data as SessionChangeMessage | undefined;
      if (data && typeof data.action === "string") handler(data);
    };
    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const data = JSON.parse(event.newValue) as SessionChangeMessage;
      if (data && typeof data.action === "string") handler(data);
    } catch {
      // Nilai rusak (bukan JSON valid) — abaikan.
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
