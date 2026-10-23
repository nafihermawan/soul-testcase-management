"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Tangani respons 401 dari mana pun: sesi sudah tidak berlaku (kedaluwarsa,
 * logout dari tab lain, atau cookie tergantikan). Buang cache lalu paksa ke
 * halaman login supaya tab yang masih memegang state akun lama tidak terus
 * melakukan request dengan sesi yang sudah mati.
 */
function handleUnauthorized(): void {
  if (typeof window === "undefined") return;
  invalidateApiCache();
  // Di halaman login, 401 memang berarti "belum login" — jangan redirect
  // (mencegah loop) karena form login justru yang harus tampil.
  if (window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

/** Fetch JSON dengan error handling; lempar HttpError berisi pesan dari server bila non-2xx. */
export async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let message = `Gagal memuat data (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // body bukan JSON; abaikan
    }
    if (res.status === 401) handleUnauthorized();
    throw new HttpError(res.status, message);
  }
  return (await res.json()) as T;
}

export type ApiError = { status: number; message: string };

/* ---------- Cache client (in-memory) ---------- */

/**
 * Cache singkat untuk GET payload halaman.
 *
 * Kenapa di client dan bukan lewat header `Cache-Control`:
 * aplikasi ini memutasi data lewat server action lalu menambal state lokal di
 * tempat. Kalau browser juga menyimpan response JSON (max-age), data basi bisa
 * muncul kembali setelah mutasi dan sulit dikendalikan. Menyimpan cache di sini
 * membuat kita bisa membuangnya kapan pun (mis. saat reload() dipanggil).
 *
 * TTL sengaja pendek: cukup untuk back-navigation dalam beberapa detik, tanpa
 * membuat data lama terasa "nyangkut".
 */
const CACHE_TTL_MS = 10_000;
const cache = new Map<string, { data: unknown; ts: number }>();
/** Dedupe: request identik yang masih berjalan tidak dijalankan dua kali. */
const inFlight = new Map<string, Promise<unknown>>();

function isFresh(path: string): { data: unknown } | null {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return { data: hit.data };
  return null;
}

/** Buang seluruh cache; dipakai sebelum fetch paksa (reload) & setelah mutasi. */
export function invalidateApiCache(): void {
  cache.clear();
}

function fetchCached<T>(path: string): Promise<T> {
  const pending = inFlight.get(path) as Promise<T> | undefined;
  if (pending) return pending;

  const p = getJSON<T>(path)
    .then((data) => {
      cache.set(path, { data, ts: Date.now() });
      inFlight.delete(path);
      return data;
    })
    .catch((e: unknown) => {
      inFlight.delete(path);
      throw e;
    });

  inFlight.set(path, p);
  return p;
}

type UseApiState<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
};

/**
 * Hook data fetching untuk halaman client-rendered.
 * - path null / enabled=false => tidak fetch.
 * - Cache in-memory ber-TTL: back-navigation dalam window TTL tidak fetch ulang.
 * - reload() memaksa fetch baru (cache dibuang dulu, skeleton tampil).
 * - pollMs > 0 => refetch background berkala (tanpa skeleton).
 * - refetchOnFocus => revalidasi saat tab kembali fokus/visible (tanpa skeleton).
 * - alwaysFresh => cache tetap dipakai untuk paint pertama, tapi data segar
 *   selalu diambil di background saat mount (untuk statistik yang harus akurat).
 * - Response race-safe: hasil basi diabaikan; fetch dibatalkan saat unmount.
 */
export function useApi<T>(
  path: string | null,
  opts?: {
    enabled?: boolean;
    /** Interval refetch background dalam ms (0/undefined = nonaktif). */
    pollMs?: number;
    /** Revalidasi saat window/tab kembali fokus atau visible. */
    refetchOnFocus?: boolean;
    /** Selalu ambil data segar di background, walau cache masih fresh. */
    alwaysFresh?: boolean;
  }
) {
  const enabled = opts?.enabled ?? true;
  const pollMs = opts?.pollMs ?? 0;
  const refetchOnFocus = opts?.refetchOnFocus ?? false;
  const alwaysFresh = opts?.alwaysFresh ?? false;
  const usable = enabled && path !== null;

  const [state, setState] = useState<UseApiState<T>>(() => {
    if (!usable || !path) return { data: null, error: null, loading: false };
    const cached = isFresh(path);
    // Data dari cache dipakai langsung supaya tidak ada kedipan skeleton saat
    // kembali ke halaman yang baru saja dibuka.
    return cached
      ? { data: cached.data as T, error: null, loading: false }
      : { data: null, error: null, loading: true };
  });
  const [tick, setTick] = useState(0);
  /**
   * Penanda bahwa tick berikutnya adalah refresh BACKGROUND: data lama tetap
   * ditampilkan (tanpa skeleton) sampai data baru tiba, dan kegagalan jaringan
   * sesaat tidak menimpa data yang sudah ada.
   */
  const silentRef = useRef(false);

  useEffect(() => {
    if (!usable || !path) {
      setState((s) => ({ data: s.data, error: null, loading: false }));
      return;
    }

    const cached = isFresh(path);
    const background = silentRef.current || (alwaysFresh && cached !== null);
    silentRef.current = false;

    if (cached && !background) {
      setState({ data: cached.data as T, error: null, loading: false });
      return;
    }

    let cancelled = false;
    if (cached) {
      // Pakai cache sebagai paint pertama, data segar menyusul di background.
      setState({ data: cached.data as T, error: null, loading: false });
    } else if (!background) {
      setState((s) => ({ data: s.data, error: null, loading: true }));
    }

    fetchCached<T>(path)
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Refresh background gagal: pertahankan data terakhir yang valid.
        if (background) return;
        const err = e instanceof HttpError ? e : new HttpError(0, "Terjadi kesalahan koneksi.");
        setState((s) => ({
          data: s.data,
          error: { status: err.status, message: err.message },
          loading: false,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [path, usable, tick, alwaysFresh]);

  const reload = useCallback(() => {
    // Mutasi sudah terjadi di server -> jangan pakai data cache mana pun.
    invalidateApiCache();
    silentRef.current = false;
    setTick((t) => t + 1);
  }, []);

  /**
   * Refetch background: tanpa skeleton & tanpa menimpa data bila gagal.
   * Cache global sengaja TIDAK dibuang di sini — fetch-nya memang melewati
   * cache (lihat `background`), jadi halaman lain tidak ikut kehilangan cache.
   */
  const revalidateSilently = useCallback(() => {
    silentRef.current = true;
    setTick((t) => t + 1);
  }, []);

  // Polling berkala + revalidasi saat tab kembali fokus/visible.
  useEffect(() => {
    if (!usable) return;
    const interval = pollMs > 0 ? window.setInterval(revalidateSilently, pollMs) : null;
    if (!refetchOnFocus) {
      return () => {
        if (interval) window.clearInterval(interval);
      };
    }
    const onFocus = () => revalidateSilently();
    const onVisibility = () => {
      if (document.visibilityState === "visible") revalidateSilently();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (interval) window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [usable, pollMs, refetchOnFocus, revalidateSilently]);

  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    reload,
    revalidateSilently,
  };
}
