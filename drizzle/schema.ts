import { jsonb, pgEnum, pgTable, serial, text, timestamp, integer, boolean, varchar } from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const userRole = pgEnum("role", ["user", "admin"]);

export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const scanType = pgEnum("scan_type", ["URL", "EMAIL"]);
export const scanJobStatus = pgEnum("scan_job_status", ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"]);
export const securityEventType = pgEnum("security_event_type", ["AUTH", "SCAN", "ACCESS", "CONFIGURATION"]);

export const urlScans = pgTable("url_scans", {
  id: serial("id").primaryKey(),
  userId: varchar("userId", { length: 128 }),
  url: text("url").notNull(),
  hostname: varchar("hostname", { length: 253 }).notNull(),
  verdict: varchar("verdict", { length: 32 }).notNull(),
  riskScore: integer("riskScore").notNull(),
  confidence: integer("confidence"),
  result: jsonb("result").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const emailScans = pgTable("email_scans", {
  id: serial("id").primaryKey(),
  userId: varchar("userId", { length: 128 }),
  sender: varchar("sender", { length: 320 }).notNull(),
  senderDomain: varchar("senderDomain", { length: 253 }).notNull(),
  verdict: varchar("verdict", { length: 32 }).notNull(),
  riskScore: integer("riskScore").notNull(),
  confidence: integer("confidence"),
  result: jsonb("result").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const emailConnections = pgTable("email_connections", {
  id: serial("id").primaryKey(),
  userId: varchar("userId", { length: 128 }).notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  providerAccountId: varchar("providerAccountId", { length: 255 }).notNull(),
  scopes: jsonb("scopes").notNull(),
  encryptedRefreshToken: text("encryptedRefreshToken"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export const securityEvents = pgTable("security_events", {
  id: serial("id").primaryKey(),
  userId: varchar("userId", { length: 128 }),
  eventType: securityEventType("eventType").notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  outcome: varchar("outcome", { length: 32 }).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const modelPredictions = pgTable("model_predictions", {
  id: serial("id").primaryKey(),
  userId: varchar("userId", { length: 128 }),
  scanType: scanType("scanType").notNull(),
  scanId: integer("scanId").notNull(),
  modelVersion: varchar("modelVersion", { length: 128 }).notNull(),
  prediction: varchar("prediction", { length: 64 }).notNull(),
  score: integer("score").notNull(),
  explanation: jsonb("explanation").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const modelVersions = pgTable("model_versions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  version: varchar("version", { length: 128 }).notNull().unique(),
  status: varchar("status", { length: 32 }).notNull(),
  metrics: jsonb("metrics").notNull(),
  artifactUri: text("artifactUri"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const scanJobs = pgTable("scan_jobs", {
  id: serial("id").primaryKey(),
  userId: varchar("userId", { length: 128 }),
  type: scanType("type").notNull(),
  status: scanJobStatus("status").default("QUEUED").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull().unique(),
  payload: jsonb("payload").notNull(),
  result: jsonb("result"),
  attempts: integer("attempts").default(0).notNull(),
  error: text("error"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export const userFeedback = pgTable("user_feedback", {
  id: serial("id").primaryKey(),
  userId: varchar("userId", { length: 128 }).notNull(),
  scanType: scanType("scanType").notNull(),
  scanId: integer("scanId").notNull(),
  label: varchar("label", { length: 64 }).notNull(),
  comment: text("comment"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});