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

type UseApiState<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
};

/**
 * Hook data fetching untuk halaman client-rendered.
 * - path null / enabled=false => tidak fetch.
 * - reload() mengulang fetch tanpa mengosongkan data lama (untuk resync pasca-mutasi).
 * - Response race-safe: hasil basi diabaikan; fetch dibatalkan saat unmount.
 */
export function useApi<T>(path: string | null, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    error: null,
    loading: enabled && path !== null,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || !path) {
      setState((s) => ({ data: s.data, error: null, loading: false }));
      return;
    }
    let cancelled = false;
    setState((s) => ({ data: s.data, error: null, loading: true }));

    getJSON<T>(path)
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((e) => {
        if (cancelled) return;
        const err = e instanceof HttpError ? e : new HttpError(0, "Terjadi kesalahan koneksi.");
        setState((s) => ({ data: s.data, error: { status: err.status, message: err.message }, loading: false }));
      });

    return () => {
      cancelled = true;
    };
  }, [path, enabled, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    reload,
  };
}
