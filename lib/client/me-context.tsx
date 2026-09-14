"use client";

import { createContext, useContext } from "react";
import type { Me } from "@/types/api";

/**
 * Context identitas user (termasuk role) dari AppShell.
 *
 * /api/me di-fetch SEKALI di root layout, lalu hasilnya dibagikan ke halaman
 * yang butuh role untuk gating aksi. Halaman cukup memakai useMe() — tidak
 * perlu fetch /api/me sendiri, sehingga payload utamanya tidak menunggu
 * request role tambahan (lihat audit performa navigasi, item 3).
 */
export type MeState = { me: Me | null; loading: boolean };

export const MeContext = createContext<MeState>({ me: null, loading: true });

export function useMe(): MeState {
  return useContext(MeContext);
}
