/**
 * Server-side localStorage polyfill. Import this as early as possible (e.g. from next.config).
 * Node v25 with --localstorage-file (invalid path) provides a broken proxy; this replaces it.
 */
if (typeof window === "undefined") {
  const stub = {
    getItem: () => null as string | null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    get length() {
      return 0;
    },
    key: () => null as string | null,
  };
  const g = globalThis as unknown as { localStorage?: unknown };
  if (typeof g.localStorage === "undefined" || typeof (g.localStorage as { getItem?: unknown }).getItem !== "function") {
    g.localStorage = stub;
  }
}
