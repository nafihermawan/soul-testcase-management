"use client";

import { useCallback, useEffect, useState } from "react";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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
 * - reload() memaksa fetch baru (cache dibuang dulu).
 * - Response race-safe: hasil basi diabaikan; fetch dibatalkan saat unmount.
 */
export function useApi<T>(path: string | null, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;
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

  useEffect(() => {
    if (!usable || !path) {
      setState((s) => ({ data: s.data, error: null, loading: false }));
      return;
    }

    const cached = isFresh(path);
    if (cached) {
      setState({ data: cached.data as T, error: null, loading: false });
      return;
    }

    let cancelled = false;
    setState((s) => ({ data: s.data, error: null, loading: true }));

    fetchCached<T>(path)
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
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
  }, [path, usable, tick]);

  const reload = useCallback(() => {
    // Mutasi sudah terjadi di server -> jangan pakai data cache mana pun.
    invalidateApiCache();
    setTick((t) => t + 1);
  }, []);

  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    reload,
  };
}
