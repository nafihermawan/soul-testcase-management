// Deklarasi untuk modul yang tidak menyertakan @types di manifest (react-dom,
// papaparse). Sumber tipe tunggal agar konsisten di semua environment.
declare module "react-dom" {
  import * as React from "react";
  export function createPortal(
    children: React.ReactNode,
    container: Element | DocumentFragment | null
  ): React.ReactPortal;
  export const flushSync: unknown;
  export const version: string;
  export const render: unknown;
  export const hydrate: unknown;
  export const unmountComponentAtNode: unknown;
}

declare module "papaparse" {
  type ParseResult<T> = { data: T[]; errors: unknown[]; meta: Record<string, unknown> };
  const Papa: {
    parse: <T = Record<string, string>>(input: any, config?: any) => ParseResult<T>;
    unparse: (data: any, config?: any) => string;
  };
  export = Papa;
}
