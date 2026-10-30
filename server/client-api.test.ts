import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchApi, resolveTrpcUrl } from "../client/src/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("shared detector API transport", () => {
  it.each([undefined, "", "  ", "/"])("defaults %s to same origin", input => {
    expect(resolveTrpcUrl(input)).toBe("/api/trpc");
  });
  it.each(["https://backend.example", " https://backend.example/// ", "https://backend.example/api/", "https://backend.example/api/trpc/"])("normalizes %s", input => {
    expect(resolveTrpcUrl(input)).toBe("https://backend.example/api/trpc");
  });
  it.each(["/api", "/api/trpc"])("supports relative endpoint %s", input => {
    expect(resolveTrpcUrl(input)).toBe("/api/trpc");
  });
  it.each(["backend.example", "//backend.example", "ftp://backend.example", "https://user:password@backend.example", "https://backend.example?token=secret", "https://backend.example#section"])("rejects ambiguous or unsafe config %s", input => {
    expect(() => resolveTrpcUrl(input)).toThrow();
  });
  it("preserves request credentials and structured tRPC errors", async () => {
    const response = new Response(JSON.stringify({ error: { message: "Invalid URL" } }), { status: 400, headers: { "content-type": "application/json" } });
    const fetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetch);
    const init: RequestInit = { method: "POST", credentials: "include", headers: { Authorization: "Bearer test-token" }, body: "synthetic test" };
    expect(await fetchApi("/api/trpc/linkDetection.analyze", init)).toBe(response);
    expect(fetch).toHaveBeenCalledWith("/api/trpc/linkDetection.analyze", init);
  });
  it("explains a platform crash and does not retry a mutation", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("FUNCTION_INVOCATION_FAILED", { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchApi("/api/trpc/emailDetection.analyze", { method: "POST" })).rejects.toThrow("HTTP 500");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("detects an SPA fallback instead of treating it as a result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>frontend</html>", { headers: { "content-type": "text/html" } })));
    await expect(fetchApi("/api/trpc/health")).rejects.toThrow("web page instead of an API response");
  });
  it("explains network or CORS failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(fetchApi("/api/trpc/health")).rejects.toThrow("Cannot reach the scan service");
  });
});
