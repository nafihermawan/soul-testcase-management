"use client";

import { useCallback, useEffect, useRef } from "react";
import { signOut } from "next-auth/react";

/** Batas tidak aktif sebelum sesi dianggap berakhir — 6 jam. */
export const IDLE_TIMEOUT_MS = 6 * 60 * 60 * 1000;

/** Selang pengecekan berkala saat tab tetap terbuka & diam (ms). */
const CHECK_INTERVAL_MS = 60 * 1000;

/** Kunci localStorage penanda aktivitas terakhir — dibagi lintas tab. */
const LAST_ACTIVITY_KEY = "soul:lastActivity";

/** Interaksi yang dianggap "aktivitas" pengguna. */
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

const readLastActivity = (): number | null => {
  try {
    const v = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};

const writeLastActivity = (value: number) => {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(value));
  } catch {
    // localStorage bisa dimatikan (mis. private mode) — abaikan, pakai ref.
  }
};

/**
 * Auto-logout karena tidak aktif selama 6 jam. Dipasang HANYA di area
 * terautentikasi (layout `(app)`).
 *
 * Timestamp aktivitas terakhir dibagi lewat localStorage supaya beberapa tab
 * tidak saling bertentangan — tab yang sedang aktif menahan logout untuk tab
 * lain (dan sebaliknya).
 */
export function SessionTimeout() {
  const lastActivity = useRef(Date.now());
  const loggingOut = useRef(false);

  const logout = useCallback(async () => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    // Bersihkan penanda lokal sebelum sesi dihapus.
    try {
      window.localStorage.removeItem(LAST_ACTIVITY_KEY);
    } catch {
      // abaikan
    }
    // signOut menghapus cookie sesi NextAuth; callbackUrl mengarahkan ke login
    // dengan penanda `reason=timeout` agar halaman login menampilkan toast.
    await signOut({ callbackUrl: "/login?reason=timeout" });
  }, []);

  useEffect(() => {
    // Mulai dari penanda tersimpan (lintas tab / setelah reload).
    lastActivity.current = readLastActivity() ?? Date.now();

    const isExpired = () => {
      // Baca nilai terbaru dari localStorage: aktivitas di tab lain tetap
      // menahan logout untuk tab ini.
      const stored = readLastActivity();
      const last = stored && stored > lastActivity.current ? stored : lastActivity.current;
      return Date.now() - last >= IDLE_TIMEOUT_MS;
    };

    const check = () => {
      if (isExpired()) void logout();
    };

    const onActivity = () => {
      // Interaksi pertama setelah diam lama: putuskan dulu sebelum memperbarui.
      if (isExpired()) {
        void logout();
        return;
      }
      lastActivity.current = Date.now();
      writeLastActivity(lastActivity.current);
    };

    // Buka kembali tab/jendela: periksa apakah sudah lewat 6 jam.
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [logout]);

  return null;
}
