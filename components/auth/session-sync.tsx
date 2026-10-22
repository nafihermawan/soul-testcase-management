"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMe } from "@/lib/client/me-context";
import { invalidateApiCache } from "@/lib/client/use-api";
import { subscribeSessionChange } from "@/lib/client/session-sync";

const LOGIN_PATH = "/login";

/**
 * Jeda minimal untuk revalidasi yang dipicu fokus/visibility, agar berpindah
 * window berkali-kali tidak memicu banyak request. Sinyal dari tab lain
 * (broadcast) selalu dipaksa jalan, jadi tidak pernah tertahan jeda ini.
 */
const FOCUS_THROTTLE_MS = 1000;

/**
 * Menjaga sesi tetap konsisten di SELURUH tab yang terbuka.
 *
 * Dipasang di dalam area terautentikasi (di bawah MeContext). Alurnya:
 * 1. Mendengar sinyal perubahan sesi dari tab lain (BroadcastChannel/storage).
 * 2. Revalidasi identitas ke server lewat `/api/me` (tanpa cache).
 * 3. Bila sesi sudah tidak berlaku -> paksa ke halaman login (sesi lama
 *    di-invalidate total di tab ini). Bila identitas berpindah akun -> reload
 *    penuh supaya tab ini benar-benar beralih ke sesi baru, bukan mempertahankan
 *    data akun lama di memory.
 *
 * Revalidasi juga dipicu saat tab kembali fokus/visible: browser bisa membekukan
 * tab latar sehingga event lintas-tab terlewat — ini jaring pengaman untuk kasus
 * tersebut.
 *
 * Sinyal yang datang bersamaan dengan request yang masih jalan tidak dibuang,
 * melainkan dijadwalkan sekali lagi setelahnya (`pending`), supaya perubahan
 * sesi tidak pernah lolos begitu saja.
 */
export function SessionSync() {
  const { me } = useMe();
  // Identitas yang sedang dipegang tab ini; null selama pemuatan awal.
  const currentIdRef = useRef<string | null>(me?.id ?? null);
  const running = useRef(false);
  const pending = useRef(false);
  const lastRun = useRef(0);
  const revalidateRef = useRef<(force?: boolean) => void>(() => {});

  useEffect(() => {
    currentIdRef.current = me?.id ?? null;
  }, [me?.id]);

  const revalidate = useCallback(async (force = false) => {
    if (running.current) {
      // Sedang ada revalidasi berjalan — ulangi sekali setelah selesai agar
      // sinyal yang datang di tengah request tetap diproses.
      pending.current = true;
      return;
    }
    const now = Date.now();
    if (!force && now - lastRun.current < FOCUS_THROTTLE_MS) return;
    lastRun.current = now;
    running.current = true;
    try {
      const res = await fetch("/api/me", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        // Sesi hilang (logout dari tab lain) atau kedaluwarsa.
        invalidateApiCache();
        if (window.location.pathname !== LOGIN_PATH) {
          window.location.replace(LOGIN_PATH);
        }
        return;
      }
      const data = (await res.json()) as { id?: string };
      const known = currentIdRef.current;
      // Akun berganti (mis. tab lain login sebagai user berbeda): paksa reload
      // agar seluruh state client dibangun ulang dari sesi yang berlaku.
      if (known && data.id && data.id !== known) {
        invalidateApiCache();
        window.location.reload();
      }
    } catch {
      // Gangguan jaringan sesaat — biarkan tab berjalan, coba lagi nanti.
    } finally {
      running.current = false;
      if (pending.current) {
        pending.current = false;
        revalidateRef.current(true);
      }
    }
  }, []);

  useEffect(() => {
    revalidateRef.current = (force = false) => void revalidate(force);
  }, [revalidate]);

  useEffect(() => subscribeSessionChange(() => void revalidate(true)), [revalidate]);

  useEffect(() => {
    const onFocus = () => void revalidate();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void revalidate();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [revalidate]);

  return null;
}
