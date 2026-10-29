import { z } from "zod";
import { checkDatabaseConnection, listEmailScans, listUrlScans, saveEmailScan, saveUrlScan } from "./db";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { addAudit, classify, getMetrics, getTransaction, models, monitoring, state, summary } from "./fraud-data";
import { activeModelVersion, deployModel, mlopsHealth, mlopsStatus, rollbackModel, trainModel } from "./mlops";
import { defaultDataset, listDatasets, predictWithDataset } from "./dataset-model";
import { analyzeLink } from "./link-detector";
import { analyzeEmail } from "./email-detector";
import { sdk } from "./_core/sdk";

const riskFilter = z.enum(["ALL", "FRAUD", "LEGITIMATE", "HIGH", "MEDIUM", "LOW"]).default("ALL");
const DEMO_OPEN_ID = "demo-fraud-sentinel";
const DEMO_EMAIL = process.env.DEMO_AUTH_EMAIL ?? "demo@fraudsentinel.local";
const DEMO_PASSWORD = process.env.DEMO_AUTH_PASSWORD ?? "SentinelDemo123!";
const demoAuthEnabled = process.env.DEMO_AUTH_ENABLED === "true";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    demoConfig: publicProcedure.query(() => ({
      enabled: demoAuthEnabled,
      email: demoAuthEnabled ? DEMO_EMAIL : null,
    })),
    demoSignIn: publicProcedure.input(z.object({
      email: z.string().trim().email(),
      password: z.string().min(1),
    })).mutation(async ({ input, ctx }) => {
      if (!demoAuthEnabled) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Demo authentication is disabled" });
      }
      if (input.email.toLowerCase() !== DEMO_EMAIL.toLowerCase() || input.password !== DEMO_PASSWORD) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid demo credentials" });
      }
      const sessionToken = await sdk.signSession({
        openId: DEMO_OPEN_ID,
        appId: process.env.VITE_APP_ID || "fraud-sentinel-demo",
        name: "Demo Analyst",
      }, { expiresInMs: 1000 * 60 * 60 * 8 });
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: 1000 * 60 * 60 * 8,
      });
      return { success: true as const, token: sessionToken };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  health: publicProcedure.query(async () => {
    const database = await checkDatabaseConnection();
    return {
      api: "connected" as const,
      database: database.status,
      model: "loaded" as const,
      pipeline: state.pipeline.status.toLowerCase(),
      updatedAt: new Date().toISOString(),
    };
  }),
  datasets: router({
    list: publicProcedure.query(() => listDatasets()),
  }),
  linkDetection: router({
    history: publicProcedure.query(() => listUrlScans()),
    analyze: publicProcedure.input(z.object({ url: z.string().trim().min(1).max(2048) })).mutation(async ({ input }) => {
      const result = await analyzeLink(input.url);
      await saveUrlScan(result);
      return result;
    }),
  }),
  emailDetection: router({
    history: publicProcedure.query(() => listEmailScans()),
    analyze: publicProcedure.input(z.object({
      sender: z.string().trim().min(1).max(320),
      subject: z.string().max(300),
      content: z.string().max(20000),
      replyTo: z.string().email().max(320).optional(),
      headers: z.string().max(30000).optional(),
      attachments: z.array(z.string().max(255)).max(20).optional(),
    })).mutation(async ({ input }) => {
      const result = await analyzeEmail(input.sender, input.subject, input.content, input);
      await saveEmailScan(result);
      return result;
    }),
  }),
  mlops: router({
    status: publicProcedure.query(() => mlopsStatus()),
    health: publicProcedure.query(() => mlopsHealth()),
    train: publicProcedure.input(z.object({ datasetName: z.enum(["01_paysim_style", "02_credit_card_style", "03_ieee_cis_style"]).optional() }).optional()).mutation(({ input }) => trainModel(input?.datasetName)),
    deploy: publicProcedure.input(z.object({ version: z.string() })).mutation(({ input }) => deployModel(input.version)),
    rollback: publicProcedure.mutation(() => rollbackModel()),
  }),
  dashboard: router({
    summary: publicProcedure.query(() => summary()),
  }),
  transactions: router({
    list: publicProcedure.input(z.object({ search: z.string().default(""), filter: riskFilter, page: z.number().int().min(1).default(1), pageSize: z.number().int().min(5).max(50).default(12) })).query(({ input }) => {
      const all = state.transactions.slice(0, state.pipeline.processed).filter((row) => {
        const search = input.search.toLowerCase();
        const matchesSearch = !search || [row.id, row.customerId, row.merchantId, row.merchantName].some((value) => value.toLowerCase().includes(search));
        const matchesFilter = input.filter === "ALL" || (input.filter === "FRAUD" && row.prediction === "FRAUD") || (input.filter === "LEGITIMATE" && row.prediction === "LEGITIMATE") || row.riskLevel === input.filter;
        return matchesSearch && matchesFilter;
      }).reverse();
      const start = (input.page - 1) * input.pageSize;
      return { rows: all.slice(start, start + input.pageSize), total: all.length, page: input.page, pageSize: input.pageSize };
    }),
    get: publicProcedure.input(z.object({ id: z.string() })).query(({ input }) => getTransaction(input.id) ?? null),
    predict: publicProcedure.input(z.object({ amount: z.number().positive(), paymentMethod: z.string(), isNewDevice: z.boolean(), isInternational: z.boolean(), velocity1h: z.number().min(0), failedAttempts: z.number().min(0), datasetName: z.enum(["01_paysim_style", "02_credit_card_style", "03_ieee_cis_style"]).optional(), features: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional() })).mutation(({ input }) => {
      const result = predictWithDataset(input.datasetName ?? defaultDataset(), input);
      const probability = result.probability;
      const riskLevel = classify(probability);
      return { probability, riskLevel, prediction: riskLevel === "HIGH" ? "FRAUD" : "LEGITIMATE", modelVersion: activeModelVersion(), dataset: result.dataset, modelArtifact: result.modelVersion, metrics: result.metrics, processingTimeMs: 42, topRiskFactors: result.topRiskFactors };
    }),
  }),
  pipeline: router({
    status: publicProcedure.query(() => state.pipeline),
    start: publicProcedure.input(z.object({ speed: z.number().int().min(1).max(10).default(5) })).mutation(({ input }) => { state.pipeline.status = "RUNNING"; state.pipeline.speed = input.speed; state.pipeline.startedAt = state.pipeline.startedAt ?? new Date().toISOString(); addAudit("Pipeline started", "pipeline", `Transaction stream running at ${input.speed} tx/sec`); return state.pipeline; }),
    pause: publicProcedure.mutation(() => { state.pipeline.status = "PAUSED"; addAudit("Pipeline paused", "pipeline", `Stream paused at transaction ${state.pipeline.processed}`); return state.pipeline; }),
    stop: publicProcedure.mutation(() => { state.pipeline.status = "STOPPED"; addAudit("Pipeline stopped", "pipeline", `Stream stopped at transaction ${state.pipeline.processed}`); return state.pipeline; }),
    step: publicProcedure.mutation(() => { if (state.pipeline.cursor < state.transactions.length) { const next = state.transactions[state.pipeline.cursor]; state.pipeline.cursor += 1; state.pipeline.processed = state.pipeline.cursor; state.pipeline.lastTransactionId = next?.id ?? null; } return state.pipeline; }),
  }),
  monitoring: router({
    overview: publicProcedure.query(() => monitoring()),
    drift: publicProcedure.query(() => monitoring().drift),
    performance: publicProcedure.query(() => monitoring().metrics),
  }),
  models: router({
    list: publicProcedure.query(() => models()),
    get: publicProcedure.input(z.object({ version: z.string() })).query(({ input }) => models().find((model) => model.version === input.version) ?? null),
    retrain: publicProcedure.input(z.object({ datasetName: z.enum(["01_paysim_style", "02_credit_card_style", "03_ieee_cis_style"]).optional() }).optional()).mutation(({ input }) => trainModel(input?.datasetName)),
    promote: publicProcedure.input(z.object({ version: z.string() })).mutation(({ input }) => deployModel(input.version)),
  }),
  alerts: router({
    list: publicProcedure.input(z.object({ status: z.enum(["ALL", "OPEN", "ACKNOWLEDGED", "RESOLVED"]).default("ALL") })).query(({ input }) => input.status === "ALL" ? state.alerts : state.alerts.filter((alert) => alert.status === input.status)),
    acknowledge: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => { const alert = state.alerts.find((item) => item.id === input.id); if (alert) alert.status = "ACKNOWLEDGED"; addAudit("Alert acknowledged", input.id, "Alert moved to acknowledged state"); return alert ?? null; }),
    resolve: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => { const alert = state.alerts.find((item) => item.id === input.id); if (alert) alert.status = "RESOLVED"; addAudit("Alert resolved", input.id, "Alert marked resolved by operations"); return alert ?? null; }),
  }),
  experiments: router({ list: publicProcedure.query(() => [
    { id: "EXP-024", model: "Random Forest", dataset: "sentinel-synthetic-2k", featureSet: "risk-v4", timestamp: "2026-09-18T11:20:00.000Z", status: "Registered", metrics: "F1 0.87 · PR-AUC 0.88", params: "240 trees · balanced weights" },
    { id: "EXP-023", model: "Logistic Regression", dataset: "sentinel-synthetic-2k", featureSet: "risk-v4", timestamp: "2026-09-10T14:05:00.000Z", status: "Reference", metrics: "F1 0.76 · PR-AUC 0.77", params: "C=1.0 · balanced weights" },
    { id: "EXP-021", model: "Random Forest", dataset: "sentinel-synthetic-2k", featureSet: "risk-v3", timestamp: "2026-09-04T08:40:00.000Z", status: "Archived", metrics: "F1 0.84 · PR-AUC 0.84", params: "160 trees · balanced weights" },
  ]) }),
  audit: router({ list: publicProcedure.query(() => state.audit) }),
  settings: router({ get: publicProcedure.query(() => state.settings), update: publicProcedure.input(z.object({ lowThreshold: z.number().min(0).max(1), highThreshold: z.number().min(0).max(1), latencyThreshold: z.number().min(50).max(5000), driftThreshold: z.number().min(0).max(1) })).mutation(({ input }) => { state.settings = input; addAudit("Threshold changed", "risk-engine", `High risk ${input.highThreshold.toFixed(2)} · latency ${input.latencyThreshold} ms`); return state.settings; }) }),
  metrics: publicProcedure.query(() => getMetrics()),
});

export type AppRouter = typeof appRouter;
