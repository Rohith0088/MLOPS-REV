/** One endpoint for every tRPC procedure, including both detectors. */
export function resolveTrpcUrl(configuredBase?: string): string {
  const base = configuredBase?.trim().replace(/\/+$/, "") ?? "";
  if (!base) return "/api/trpc";

  // Accept an origin, /api, or the full /api/trpc endpoint without doubling it.
  const relative = base.startsWith("/") && !base.startsWith("//");
  let parsed: URL;
  try {
    parsed = new URL(base, relative ? "https://local.invalid" : undefined);
  } catch {
    throw new Error("VITE_API_BASE_URL must be an HTTP(S) backend URL or an absolute path.");
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("VITE_API_BASE_URL must not contain credentials, query parameters, or a fragment.");
  }
  let path = parsed.pathname.replace(/\/+$/, "");
  if (!path.endsWith("/api/trpc")) path += path.endsWith("/api") ? "/trpc" : "/api/trpc";
  return relative ? path : `${parsed.origin}${path}`;
}

/** Preserve tRPC JSON errors; explain network/platform failures without replaying scans. */
export async function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await globalThis.fetch(input, init);
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new Error("Cannot reach the scan service. It may be offline or blocking this site's connection.", { cause: error });
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    await response.body?.cancel();
    throw new Error(response.ok
      ? "The scan service returned a web page instead of an API response. Check the configured backend address."
      : `The scan service is unavailable (HTTP ${response.status}). Please try again later.`);
  }
  return response;
}
