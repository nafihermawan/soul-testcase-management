"use client";

import { createContext, useContext } from "react";

/**
 * Context reload data halaman: view (yang memegang useApi) membungkus kontennya
 * dengan Provider berisi `reload`, sehingga komponen turunan yang melakukan
 * mutasi (server actions) cukup memanggil useRefresh() untuk menyegarkan data.
 */
export const RefreshContext = createContext<() => void>(() => {});

export function useRefresh(): () => void {
  return useContext(RefreshContext);
}
