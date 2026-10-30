import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "./_core/app";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "./routers";
import { fetchApi, resolveTrpcUrl } from "../client/src/lib/api";

vi.mock("./db", () => ({
  checkDatabaseConnection: async () => ({ status: "unconfigured" }),
  listEmailScans: async () => [],
  listUrlScans: async () => [],
  saveUrlScan: vi.fn(async () => {}),
  saveEmailScan: vi.fn(async () => {}),
}));

describe("shared serverless Express entry point", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    vi.stubEnv("CLIENT_ORIGIN", "https://dashboard.example, https://frontend.example/");
    server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    vi.unstubAllEnvs();
  });
  it("serves tRPC JSON and honest unconfigured database status", async () => {
    const response = await fetch(`${base}/api/trpc/health`);
    expect(response.status).toBe(200);
    expect((await response.json()).result.data.json.database).toBe("unconfigured");
  });
  it("handles credentialed preflight before tRPC", async () => {
    const response = await fetch(`${base}/api/trpc/auth.me`, {
      method: "OPTIONS", headers: { Origin: "https://dashboard.example" },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://dashboard.example");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });
  it("does not grant CORS to an unrelated origin", async () => {
    const response = await fetch(`${base}/api/trpc/auth.me`, {
      headers: { Origin: "https://unrelated.example" },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
  it("allows configured Render frontend origins with a trailing slash", async () => {
    const response = await fetch(`${base}/api/trpc/auth.me`, {
      headers: { Origin: "https://frontend.example/" },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://frontend.example");
  });
  it("allows anonymous access to scan history", async () => {
    const response = await fetch(`${base}/api/trpc/linkDetection.history`);
    expect(response.status).toBe(200);
  });
  it("returns JSON 404 for unknown API paths instead of the SPA", async () => {
    const response = await fetch(`${base}/api/unknown`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "API route not found" });
  });
  it("sends both detector mutations through the shared client to Express", async () => {
    const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({
      url: resolveTrpcUrl(`${base}/api/`),
      transformer: superjson,
      fetch: (input, init) => fetchApi(input, {
        ...init, credentials: "include",
        headers: { ...init?.headers, Origin: "https://dashboard.example" },
      }),
    })] });
    // These deliberately invalid synthetic inputs exercise the real detectors
    // without contacting arbitrary websites or a user's mailbox.
    const link = await client.linkDetection.analyze.mutate({ url: "javascript:alert(1)" });
    const email = await client.emailDetection.analyze.mutate({ sender: "invalid", subject: "Synthetic test", content: "Transport test" });
    expect(link.verdict).toBe("INCONCLUSIVE");
    expect(link.signals[0].label).toBe("Unsupported link scheme");
    expect(email.verdict).toBe("INCONCLUSIVE");
    expect(email.signals[0].label).toBe("Invalid sender address");
    const db = await import("./db");
    expect(db.saveUrlScan).toHaveBeenCalledWith(expect.objectContaining({ normalizedUrl: "javascript:alert(1)" }));
    expect(db.saveEmailScan).toHaveBeenCalledWith(expect.objectContaining({ sender: "invalid" }));
  });
});
