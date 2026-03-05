const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

type FetchInitWithMeta = RequestInit & {
  gsNoTimeout?: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var __gsFetchTimeoutInstalled: boolean | undefined;
}

function hasRequestSignal(input: RequestInfo | URL): boolean {
  return typeof Request !== 'undefined' && input instanceof Request && Boolean(input.signal);
}

export function installFetchTimeout(timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS): void {
  if (globalThis.__gsFetchTimeoutInstalled) return;
  if (typeof globalThis.fetch !== 'function') return;

  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const opts = (init || {}) as FetchInitWithMeta;
    if (opts.signal || opts.gsNoTimeout || hasRequestSignal(input)) {
      return nativeFetch(input, init);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await nativeFetch(input, { ...opts, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  globalThis.__gsFetchTimeoutInstalled = true;
}
