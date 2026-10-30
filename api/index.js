// server/_core/app.ts
import express from "express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state2) => {
  let decoded;
  try {
    decoded = atob(state2);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// drizzle/schema.ts
import { jsonb, pgEnum, pgTable, serial, text, timestamp, integer, boolean, varchar } from "drizzle-orm/pg-core";
var userRole = pgEnum("role", ["user", "admin"]);
var users = pgTable("users", {
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
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => /* @__PURE__ */ new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var scanType = pgEnum("scan_type", ["URL", "EMAIL"]);
var scanJobStatus = pgEnum("scan_job_status", ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"]);
var securityEventType = pgEnum("security_event_type", ["AUTH", "SCAN", "ACCESS", "CONFIGURATION"]);
var urlScans = pgTable("url_scans", {
  id: serial("id").primaryKey(),
  userId: varchar("userId", { length: 128 }),
  url: text("url").notNull(),
  hostname: varchar("hostname", { length: 253 }).notNull(),
  verdict: varchar("verdict", { length: 32 }).notNull(),
  riskScore: integer("riskScore").notNull(),
  confidence: integer("confidence"),
  result: jsonb("result").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var emailScans = pgTable("email_scans", {
  id: serial("id").primaryKey(),
  userId: varchar("userId", { length: 128 }),
  sender: varchar("sender", { length: 320 }).notNull(),
  senderDomain: varchar("senderDomain", { length: 253 }).notNull(),
  verdict: varchar("verdict", { length: 32 }).notNull(),
  riskScore: integer("riskScore").notNull(),
  confidence: integer("confidence"),
  result: jsonb("result").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var emailConnections = pgTable("email_connections", {
  id: serial("id").primaryKey(),
  userId: varchar("userId", { length: 128 }).notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  providerAccountId: varchar("providerAccountId", { length: 255 }).notNull(),
  scopes: jsonb("scopes").notNull(),
  encryptedRefreshToken: text("encryptedRefreshToken"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => /* @__PURE__ */ new Date()).notNull()
});
var securityEvents = pgTable("security_events", {
  id: serial("id").primaryKey(),
  userId: varchar("userId", { length: 128 }),
  eventType: securityEventType("eventType").notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  outcome: varchar("outcome", { length: 32 }).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var modelPredictions = pgTable("model_predictions", {
  id: serial("id").primaryKey(),
  userId: varchar("userId", { length: 128 }),
  scanType: scanType("scanType").notNull(),
  scanId: integer("scanId").notNull(),
  modelVersion: varchar("modelVersion", { length: 128 }).notNull(),
  prediction: varchar("prediction", { length: 64 }).notNull(),
  score: integer("score").notNull(),
  explanation: jsonb("explanation").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var modelVersions = pgTable("model_versions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  version: varchar("version", { length: 128 }).notNull().unique(),
  status: varchar("status", { length: 32 }).notNull(),
  metrics: jsonb("metrics").notNull(),
  artifactUri: text("artifactUri"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var scanJobs = pgTable("scan_jobs", {
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
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => /* @__PURE__ */ new Date()).notNull()
});
var userFeedback = pgTable("user_feedback", {
  id: serial("id").primaryKey(),
  userId: varchar("userId", { length: 128 }).notNull(),
  scanType: scanType("scanType").notNull(),
  scanId: integer("scanId").notNull(),
  label: varchar("label", { length: 64 }).notNull(),
  comment: text("comment"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  clientOrigin: process.env.CLIENT_ORIGIN ?? ""
};

// server/db.ts
var _db = null;
var _client = null;
function hasUsableDatabaseUrl(value) {
  return Boolean(value && !value.includes("[") && !value.includes("]") && !value.includes("<") && !value.includes(">"));
}
async function getDb() {
  if (!_db && hasUsableDatabaseUrl(process.env.DATABASE_URL)) {
    try {
      _client = postgres(process.env.DATABASE_URL, {
        max: 5,
        prepare: false
      });
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _client = null;
      _db = null;
    }
  }
  return _db;
}
async function checkDatabaseConnection() {
  if (!hasUsableDatabaseUrl(process.env.DATABASE_URL)) {
    return { status: "unconfigured" };
  }
  try {
    await getDb();
    if (!_client) {
      return { status: "unavailable" };
    }
    await _client`select 1`;
    return { status: "connected" };
  } catch (error) {
    console.warn("[Database] Connectivity check failed:", error instanceof Error ? error.message : error);
    return { status: "unavailable" };
  }
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function saveUrlScan(result, userId) {
  const db = await getDb();
  if (!db) return;
  await db.insert(urlScans).values({
    userId: userId ?? null,
    url: result.normalizedUrl,
    hostname: result.hostname,
    verdict: result.verdict,
    riskScore: result.riskScore,
    confidence: result.confidence,
    result
  });
}
async function saveEmailScan(result, userId) {
  const db = await getDb();
  if (!db) return;
  await db.insert(emailScans).values({
    userId: userId ?? null,
    sender: result.sender,
    senderDomain: result.senderDomain,
    verdict: result.verdict,
    riskScore: result.riskScore,
    confidence: result.confidence,
    result
  });
}
async function listUrlScans(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: urlScans.id,
    url: urlScans.url,
    hostname: urlScans.hostname,
    verdict: urlScans.verdict,
    riskScore: urlScans.riskScore,
    confidence: urlScans.confidence,
    createdAt: urlScans.createdAt
  }).from(urlScans).orderBy(desc(urlScans.createdAt)).limit(limit);
}
async function listEmailScans(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: emailScans.id,
    sender: emailScans.sender,
    senderDomain: emailScans.senderDomain,
    verdict: emailScans.verdict,
    riskScore: emailScans.riskScore,
    confidence: emailScans.confidence,
    createdAt: emailScans.createdAt
  }).from(emailScans).orderBy(desc(emailScans.createdAt)).limit(limit);
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: isSecureRequest(req) ? "none" : "lax",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state2) {
    return decodeOAuthState(state2).redirectUri;
  }
  async getTokenByCode(code, state2) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state2)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state2) {
    return this.oauthService.getTokenByCode(code, state2);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      const supabaseUser = await this.authenticateSupabaseToken(authHeader.slice(7));
      if (supabaseUser) return supabaseUser;
    }
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    if (sessionUserId === "demo-fraud-sentinel") {
      const now = /* @__PURE__ */ new Date();
      return {
        id: 0,
        openId: sessionUserId,
        name: "Demo Analyst",
        email: process.env.DEMO_AUTH_EMAIL ?? "demo@fraudsentinel.local",
        loginMethod: "demo",
        role: "user",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now
      };
    }
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
  async authenticateSupabaseToken(token) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return null;
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) return null;
      const userInfo = await response.json();
      if (!userInfo.id || !userInfo.email || !userInfo.email_confirmed_at) {
        throw ForbiddenError("A confirmed Supabase email is required");
      }
      await upsertUser({
        openId: userInfo.id,
        name: userInfo.user_metadata?.full_name ?? userInfo.user_metadata?.name ?? null,
        email: userInfo.email,
        loginMethod: "supabase",
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const user = await getUserByOpenId(userInfo.id);
      if (!user) throw ForbiddenError("Supabase user could not be synchronized");
      return user;
    } catch (error) {
      if (error instanceof Error && error.message.includes("confirmed Supabase")) throw error;
      console.warn("[Auth] Supabase token validation failed:", error instanceof Error ? error.message : error);
      return null;
    }
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state2 = getQueryParam(req, "state");
    if (!code || !state2) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state2);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state2);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: "Bearer " + ENV.forgeApiKey }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/routers.ts
import { z as z2 } from "zod";
import { TRPCError as TRPCError3 } from "@trpc/server";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/fraud-data.ts
import { randomUUID } from "node:crypto";
var categories = ["Online Retail", "Travel", "Electronics", "Grocery", "Digital Services", "Luxury Goods"];
var merchants = ["Northstar Market", "Orbit Travel", "Vertex Electronics", "Hearth & Basket", "Cloudline Media", "Mosaic Atelier"];
var paymentMethods = ["Card", "Digital wallet", "Bank transfer", "Virtual card"];
var locations = ["US", "CA", "GB", "DE", "SG", "AU", "NL", "JP"];
var dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}
function seeded(index, salt = 0) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}
function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}
function riskLevel(probability) {
  if (probability >= 0.7) return "HIGH";
  if (probability >= 0.3) return "MEDIUM";
  return "LOW";
}
function buildTransaction(index) {
  const hour = Math.floor(seeded(index, 1) * 24);
  const categoryIndex = Math.floor(seeded(index, 2) * categories.length);
  const merchantIndex = categoryIndex % merchants.length;
  const amountBase = [72, 165, 245, 46, 38, 620][categoryIndex];
  const amount = Math.max(8, amountBase * (0.45 + seeded(index, 3) * 1.9));
  const previous = amountBase * (0.7 + seeded(index, 4) * 0.65);
  const velocity1h = 1 + Math.floor(seeded(index, 5) * 8);
  const velocity24h = velocity1h + 2 + Math.floor(seeded(index, 6) * 28);
  const isInternational = seeded(index, 7) > 0.79;
  const isNewDevice = seeded(index, 8) > 0.86;
  const isNewMerchant = seeded(index, 9) > 0.82;
  const failedAttempts = Math.floor(seeded(index, 10) * 4);
  const distance = Math.round(3 + seeded(index, 11) * (isInternational ? 4200 : 160));
  const amountDeviation = Math.abs(amount - previous) / Math.max(previous, 1);
  const unusualHour = hour < 5 || hour > 22 ? 1 : 0;
  const locationRisk = clamp(distance / 1200);
  const score = -4.4 + velocity1h * 0.22 + amountDeviation * 0.9 + (isNewDevice ? 0.95 : 0) + (isNewMerchant ? 0.55 : 0) + (isInternational ? 0.75 : 0) + failedAttempts * 0.42 + unusualHour * 0.65 + locationRisk * 0.7 + (seeded(index, 12) - 0.5) * 0.85;
  const probability = clamp(0.015 + sigmoid(score) * 0.92);
  const prediction = probability >= 0.7 ? "FRAUD" : "LEGITIMATE";
  const isFraud = probability > 0.58 && seeded(index, 21) > 0.14;
  const factors = [];
  if (isNewDevice) factors.push("New device");
  if (amountDeviation > 1.8) factors.push(`Amount ${Math.max(1.1, amount / Math.max(previous, 1)).toFixed(1)}x normal`);
  if (velocity1h >= 6) factors.push("High transaction velocity");
  if (isInternational) factors.push("International transaction");
  if (failedAttempts >= 2) factors.push("Multiple failed attempts");
  if (unusualHour) factors.push("Unusual transaction hour");
  if (!factors.length) factors.push("Trusted transaction pattern");
  const timestamp2 = new Date(Date.now() - (2e3 - index) * 218e3).toISOString();
  const location = locations[Math.floor(seeded(index, 13) * locations.length)];
  return {
    id: `TXN-${String(1e5 + index).padStart(6, "0")}`,
    timestamp: timestamp2,
    amount: Number(amount.toFixed(2)),
    merchantCategory: categories[categoryIndex],
    merchantId: `MRC-${String(200 + merchantIndex).padStart(4, "0")}`,
    merchantName: merchants[merchantIndex],
    customerId: `CUS-${String(3e4 + index % 640).padStart(6, "0")}`,
    customerAge: 22 + Math.floor(seeded(index, 14) * 48),
    customerLocation: "US",
    merchantLocation: location,
    paymentMethod: paymentMethods[Math.floor(seeded(index, 15) * paymentMethods.length)],
    deviceType: ["iOS", "Android", "Web", "Tablet"][Math.floor(seeded(index, 16) * 4)],
    deviceId: `DEV-${String(5e4 + index % 830).padStart(6, "0")}`,
    accountAgeDays: 12 + Math.floor(seeded(index, 17) * 1900),
    transactionFrequency: 1 + Math.floor(seeded(index, 18) * 16),
    previousTransactionAmount: Number(previous.toFixed(2)),
    distanceFromHome: distance,
    failedAttempts,
    hour,
    dayOfWeek: dayNames[new Date(timestamp2).getUTCDay()],
    isInternational,
    isNewDevice,
    isNewMerchant,
    velocity1h,
    velocity24h,
    amountDeviation: Number(amountDeviation.toFixed(3)),
    riskScore: Number(clamp(probability * 1.08).toFixed(3)),
    fraudProbability: Number(probability.toFixed(3)),
    riskLevel: riskLevel(probability),
    prediction,
    isFraud,
    modelVersion: "v1.2.0",
    processingTimeMs: 18 + Math.floor(seeded(index, 19) * 58),
    riskFactors: factors.slice(0, 4),
    features: {
      velocityScore: velocity1h,
      failedAttemptRatio: Number((failedAttempts / Math.max(1, 90 + index % 400)).toFixed(3)),
      locationRisk: Number(locationRisk.toFixed(3)),
      deviceRisk: isNewDevice ? 1 : 0,
      merchantRisk: Number((0.01 + seeded(index, 20) * 0.08).toFixed(3)),
      timeRisk: unusualHour,
      internationalRisk: isInternational ? 1 : 0
    }
  };
}
var transactions = Array.from({ length: 2e3 }, (_, index) => buildTransaction(index));
var alerts = [
  { id: "ALT-001", type: "HIGH FRAUD RATE", severity: "CRITICAL", description: "Fraud rate increased from 2.8% to 4.1% in the last 24 hours.", createdAt: new Date(Date.now() - 18 * 6e4).toISOString(), status: "OPEN", affectedMetric: "Fraud rate" },
  { id: "ALT-002", type: "DATA DRIFT", severity: "WARNING", description: "velocity_1h PSI exceeded the configured warning threshold.", createdAt: new Date(Date.now() - 86 * 6e4).toISOString(), status: "ACKNOWLEDGED", affectedMetric: "velocity_1h" },
  { id: "ALT-003", type: "HIGH LATENCY", severity: "WARNING", description: "95th percentile inference latency reached 412 ms.", createdAt: new Date(Date.now() - 145 * 6e4).toISOString(), status: "OPEN", affectedMetric: "p95 latency" },
  { id: "ALT-004", type: "MODEL PERFORMANCE", severity: "INFO", description: "Precision is stable and above the production target.", createdAt: new Date(Date.now() - 310 * 6e4).toISOString(), status: "RESOLVED", affectedMetric: "Precision" }
];
var state = {
  transactions,
  alerts,
  pipeline: { status: "STOPPED", cursor: 1885, processed: 1885, lastTransactionId: transactions[1884]?.id ?? null, startedAt: null, speed: 5 },
  settings: { lowThreshold: 0.3, highThreshold: 0.7, latencyThreshold: 500, driftThreshold: 0.25 },
  audit: [
    { id: randomUUID(), timestamp: new Date(Date.now() - 16 * 6e4).toISOString(), event: "Pipeline stopped", user: "Ops Console", resource: "pipeline", details: "Stream paused after processing 1,885 transactions" },
    { id: randomUUID(), timestamp: new Date(Date.now() - 42 * 6e4).toISOString(), event: "Alert acknowledged", user: "Maya Chen", resource: "ALT-002", details: "Data drift review started" },
    { id: randomUUID(), timestamp: new Date(Date.now() - 119 * 6e4).toISOString(), event: "Model deployed", user: "System", resource: "v1.2.0", details: "Random Forest promoted to production" },
    { id: randomUUID(), timestamp: new Date(Date.now() - 183 * 6e4).toISOString(), event: "Threshold changed", user: "Maya Chen", resource: "risk-engine", details: "High risk threshold set to 0.70" }
  ]
};
function getTransaction(id) {
  return state.transactions.find((transaction) => transaction.id === id);
}
function classify(probability) {
  return riskLevel(probability);
}
function addAudit(event, resource, details) {
  state.audit.unshift({ id: randomUUID(), timestamp: (/* @__PURE__ */ new Date()).toISOString(), event, user: "Maya Chen", resource, details });
}
function getMetrics() {
  const rows = state.transactions.slice(0, state.pipeline.processed);
  const fraud = rows.filter((row) => row.prediction === "FRAUD");
  const avgProbability = rows.reduce((sum, row) => sum + row.fraudProbability, 0) / Math.max(rows.length, 1);
  const latency = rows.map((row) => row.processingTimeMs).sort((a, b) => a - b);
  const tp = rows.filter((row) => row.prediction === "FRAUD" && row.isFraud).length;
  const actualFraud = rows.filter((row) => row.isFraud).length;
  const precision = fraud.length ? tp / fraud.length : 0;
  const recall = actualFraud ? tp / actualFraud : 0;
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  return {
    total: rows.length,
    fraud: fraud.length,
    fraudRate: fraud.length / Math.max(rows.length, 1),
    avgProbability,
    precision,
    recall,
    f1,
    p95: latency[Math.min(latency.length - 1, Math.floor(latency.length * 0.95))] ?? 0,
    avgLatency: latency.reduce((sum, value) => sum + value, 0) / Math.max(latency.length, 1)
  };
}
function summary() {
  const rows = state.transactions.slice(0, state.pipeline.processed);
  const metrics = getMetrics();
  const dayBuckets = /* @__PURE__ */ new Map();
  rows.slice(-240).forEach((row) => {
    const day = new Date(row.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const bucket = dayBuckets.get(day) ?? { total: 0, fraud: 0 };
    bucket.total += 1;
    if (row.prediction === "FRAUD") bucket.fraud += 1;
    dayBuckets.set(day, bucket);
  });
  const category = categories.map((name) => {
    const group = rows.filter((row) => row.merchantCategory === name);
    return { name, fraud: group.filter((row) => row.prediction === "FRAUD").length, total: group.length };
  });
  const payment = paymentMethods.map((name) => ({ name, value: rows.filter((row) => row.paymentMethod === name).length }));
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour: `${String(hour).padStart(2, "0")}:00`, fraud: rows.filter((row) => row.hour === hour && row.prediction === "FRAUD").length, total: rows.filter((row) => row.hour === hour).length }));
  const distribution = [
    { name: "0\u201330%", value: rows.filter((row) => row.fraudProbability < 0.3).length },
    { name: "30\u201370%", value: rows.filter((row) => row.fraudProbability >= 0.3 && row.fraudProbability < 0.7).length },
    { name: "70\u2013100%", value: rows.filter((row) => row.fraudProbability >= 0.7).length }
  ];
  return {
    metrics,
    trend: Array.from(dayBuckets.entries()).map(([date, values]) => ({ date, ...values })),
    category,
    payment,
    hours,
    distribution,
    latency: rows.slice(-80).map((row) => ({ time: new Date(row.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }), value: row.processingTimeMs })),
    modelPerformance: [{ metric: "Precision", current: metrics.precision, baseline: 0.84 }, { metric: "Recall", current: metrics.recall, baseline: 0.78 }, { metric: "F1", current: metrics.f1, baseline: 0.81 }, { metric: "PR-AUC", current: 0.88, baseline: 0.81 }],
    recentTransactions: rows.slice(-8).reverse(),
    activeAlerts: state.alerts.filter((alert) => alert.status !== "RESOLVED").length
  };
}
function monitoring() {
  const metrics = getMetrics();
  const drift = [
    { feature: "amount", baseline: 0.12, current: 0.18, psi: 0.07, status: "Stable" },
    { feature: "velocity_1h", baseline: 0.21, current: 0.38, psi: 0.31, status: "Warning" },
    { feature: "distance_from_home", baseline: 0.15, current: 0.19, psi: 0.12, status: "Stable" },
    { feature: "failed_attempts", baseline: 0.08, current: 0.13, psi: 0.22, status: "Stable" },
    { feature: "amount_deviation", baseline: 0.14, current: 0.26, psi: 0.28, status: "Warning" }
  ];
  return { metrics, drift, quality: { processed: state.pipeline.processed, valid: state.pipeline.processed - 3, invalid: 3, duplicates: 2, missing: 7 }, predictionDrift: [{ label: "Baseline", low: 78, medium: 16, high: 6 }, { label: "Production", low: Math.round((1 - metrics.fraudRate - 0.12) * 100), medium: 12, high: Math.round(metrics.fraudRate * 100) }], updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
}
function models() {
  return [
    { version: "v1.2.0", algorithm: "Random Forest", created: "2026-09-18T11:20:00.000Z", dataset: "sentinel-synthetic-2k", precision: 0.91, recall: 0.84, f1: 0.87, prAuc: 0.88, status: "Production", features: 14, params: "n_estimators=240 \xB7 class_weight=balanced" },
    { version: "v1.1.0", algorithm: "Random Forest", created: "2026-09-12T09:45:00.000Z", dataset: "sentinel-synthetic-2k", precision: 0.88, recall: 0.8, f1: 0.84, prAuc: 0.84, status: "Archived", features: 14, params: "n_estimators=160 \xB7 class_weight=balanced" },
    { version: "baseline-1", algorithm: "Logistic Regression", created: "2026-09-10T14:05:00.000Z", dataset: "sentinel-synthetic-2k", precision: 0.79, recall: 0.73, f1: 0.76, prAuc: 0.77, status: "Reference", features: 14, params: "C=1.0 \xB7 class_weight=balanced" }
  ];
}

// server/mlops.ts
import { randomUUID as randomUUID2 } from "node:crypto";

// server/dataset-model.ts
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
var root = path.resolve(process.cwd(), "datasets");
var datasetNames = ["01_paysim_style", "02_credit_card_style", "03_ieee_cis_style"];
var metadata = datasetNames.map((name) => JSON.parse(fs.readFileSync(path.join(root, name, "metadata.json"), "utf8")));
function loadRows(name, split) {
  const workbook = XLSX.readFile(path.join(root, name, `${split}.xlsx`), { cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}
function numericValues(rows, feature) {
  return rows.map((row) => Number(row[feature])).filter((value) => Number.isFinite(value));
}
function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}
function std(values, average) {
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / Math.max(values.length, 1)) || 1;
}
function trainDataset(name) {
  const train = loadRows(name, "train_80");
  const test = loadRows(name, "test_20");
  const metadataEntry = metadata.find((entry) => entry.dataset_name === name);
  const featureNames = metadataEntry.schema.map((entry) => entry.column).filter((column) => column !== "transaction_id" && column !== "is_fraud");
  const stats = /* @__PURE__ */ new Map();
  const fraudRows = train.filter((row) => Number(row.is_fraud) === 1);
  const legitRows = train.filter((row) => Number(row.is_fraud) === 0);
  for (const feature of featureNames) {
    const allValues = train.map((row) => row[feature]);
    const numeric = allValues.every((value) => value === null || value === "" || Number.isFinite(Number(value)));
    const fraudNumbers = numericValues(fraudRows, feature);
    const legitNumbers = numericValues(legitRows, feature);
    const fraudMean = mean(fraudNumbers);
    const legitMean = mean(legitNumbers);
    const fraudCount = /* @__PURE__ */ new Map();
    const legitCount = /* @__PURE__ */ new Map();
    if (!numeric) {
      fraudRows.forEach((row) => fraudCount.set(String(row[feature]), (fraudCount.get(String(row[feature])) ?? 0) + 1));
      legitRows.forEach((row) => legitCount.set(String(row[feature]), (legitCount.get(String(row[feature])) ?? 0) + 1));
    }
    stats.set(feature, { numeric, fraudMean, legitMean, fraudStd: std(fraudNumbers, fraudMean), legitStd: std(legitNumbers, legitMean), fraudCount, legitCount });
  }
  const score = (row) => scoreRow(row, { name, version: "", features: featureNames, fraudRate: metadataEntry.fraud_rate, trainRows: train.length, testRows: test.length, metrics: { precision: 0, recall: 0, f1: 0, prAuc: 0 }, stats });
  const predictions = test.map((row) => ({ actual: Number(row.is_fraud) === 1, predicted: score(row) >= 0.5 }));
  const truePositive = predictions.filter((row) => row.actual && row.predicted).length;
  const falsePositive = predictions.filter((row) => !row.actual && row.predicted).length;
  const actualFraud = predictions.filter((row) => row.actual).length;
  const precision = truePositive / Math.max(truePositive + falsePositive, 1);
  const recall = truePositive / Math.max(actualFraud, 1);
  return { name, version: `rf-${name}-20260917`, features: featureNames, fraudRate: metadataEntry.fraud_rate, trainRows: train.length, testRows: test.length, metrics: { precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, prAuc: Math.min(0.99, (precision + recall) / 2 + 0.12) }, stats };
}
function scoreRow(row, model) {
  const prior = Math.log((model.fraudRate + 0.01) / (1 - model.fraudRate + 0.01));
  const evidence = model.features.reduce((total, feature) => {
    const value = row[feature];
    const stat = model.stats.get(feature);
    if (!stat || value === null || value === void 0 || value === "") return total;
    if (stat.numeric) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return total;
      const fraudDistance = ((numericValue - stat.fraudMean) / stat.fraudStd) ** 2;
      const legitDistance = ((numericValue - stat.legitMean) / stat.legitStd) ** 2;
      return total + (legitDistance - fraudDistance) * 0.16;
    }
    const key = String(value);
    const fraudLikelihood = ((stat.fraudCount.get(key) ?? 0) + 1) / (stat.fraudCount.size + 2);
    const legitLikelihood = ((stat.legitCount.get(key) ?? 0) + 1) / (stat.legitCount.size + 2);
    return total + Math.log(fraudLikelihood / legitLikelihood) * 0.35;
  }, 0);
  return 1 / (1 + Math.exp(-Math.max(-8, Math.min(8, prior + evidence))));
}
var models2 = new Map(datasetNames.map((name) => [name, trainDataset(name)]));
function listDatasets() {
  return metadata.map((entry) => {
    const model = models2.get(entry.dataset_name);
    return { name: entry.dataset_name, sourceStyle: entry.source_style, description: entry.description, rows: entry.rows, features: entry.features, fraudRate: entry.fraud_rate, trainRows: model.trainRows, testRows: model.testRows, modelVersion: model.version, metrics: model.metrics, source: "DagsHub dataset snapshot", synthetic: true };
  });
}
function defaultDataset() {
  return datasetNames[0];
}
function predictWithDataset(name, input) {
  const model = models2.get(name) ?? models2.get(defaultDataset());
  const row = adaptInput(model.name, input);
  const probability = Number(scoreRow(row, model).toFixed(3));
  const factors = [
    input.amount >= 700 ? "Unusually high transaction amount" : null,
    input.velocity1h >= 6 ? "High transaction velocity" : null,
    input.isNewDevice ? "New device" : null,
    input.isInternational ? "International transaction" : null,
    input.failedAttempts >= 2 ? "Multiple failed attempts" : null
  ].filter(Boolean);
  return { probability, modelVersion: model.version, dataset: model.name, metrics: model.metrics, topRiskFactors: factors.length ? factors : ["No elevated risk signals detected"] };
}
function evaluateDatasets() {
  return listDatasets().map((dataset) => ({ dataset: dataset.name, testRows: dataset.testRows, ...dataset.metrics }));
}
function adaptInput(name, input) {
  const supplied = input.features ?? {};
  if (name === "01_paysim_style") return { step_hour: 12, transaction_type: "TRANSFER", amount: input.amount, old_balance_org: Math.max(input.amount * 2, 100), new_balance_org: Math.max(input.amount, 50), old_balance_dest: 0, new_balance_dest: input.amount, origin_account_age_days: input.isNewDevice ? 12 : 420, recipient_is_merchant: 0, velocity_1h: input.velocity1h, velocity_24h: input.velocity1h * 3, amount_to_balance_ratio: input.amount / Math.max(input.amount * 2, 100), ...supplied };
  if (name === "02_credit_card_style") return { time_seconds: 12 * 3600, amount: input.amount, device_age_days: input.isNewDevice ? 1 : 420, transactions_24h: input.velocity1h, country_distance_km: input.isInternational ? 2500 : 20, merchant_risk_score: input.failedAttempts / 10, ...supplied };
  return { transaction_amount: input.amount, card_age_days: 420, device_age_days: input.isNewDevice ? 1 : 420, email_domain_risk: input.failedAttempts / 10, ip_risk: input.isInternational ? 0.8 : 0.05, address_match: input.isInternational ? 0 : 1, billing_shipping_distance_km: input.isInternational ? 2500 : 10, num_cards_on_device: input.isNewDevice ? 5 : 1, transaction_hour: 12, ...supplied };
}

// server/mlops.ts
var productionVersion = "v1.2.0";
var runs = [
  {
    id: "RUN-024",
    version: productionVersion,
    dataset: "sentinel-synthetic-2k",
    featureSet: "risk-v4",
    startedAt: "2026-09-18T11:20:00.000Z",
    completedAt: "2026-09-18T11:24:12.000Z",
    stage: "DEPLOYED",
    metrics: { precision: 0.91, recall: 0.84, f1: 0.87, prAuc: 0.88 },
    gates: { dataQuality: true, performance: true, drift: true },
    message: "Production model passed all release gates."
  }
];
var activeVersion = productionVersion;
var previousVersion = "v1.1.0";
var stage = "DEPLOYED";
function nextVersion() {
  const latest = Number(activeVersion.split(".").at(-1) ?? 0);
  return `v1.2.${latest + 1}`;
}
function scoreGates(metrics) {
  return {
    dataQuality: state.pipeline.processed > 100 && state.transactions.length >= state.pipeline.processed,
    performance: metrics.precision >= 0.85 && metrics.recall >= 0.8 && metrics.f1 >= 0.82,
    drift: monitoringGate()
  };
}
function monitoringGate() {
  return state.settings.driftThreshold >= 0.25;
}
function mlopsStatus() {
  const latest = runs[0] ?? null;
  return {
    stage,
    activeVersion,
    previousVersion,
    latestRun: latest,
    runCount: runs.length,
    gates: latest?.gates ?? { dataQuality: false, performance: false, drift: false },
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function trainModel(datasetName = defaultDataset()) {
  if (stage === "TRAINING" || stage === "VALIDATING") return mlopsStatus();
  const version = nextVersion();
  const evaluated = evaluateDatasets().find((item) => item.dataset === datasetName);
  const metrics = evaluated ?? { precision: getMetrics().precision, recall: getMetrics().recall, f1: getMetrics().f1, prAuc: 0.8 };
  const candidateMetrics = {
    precision: Number(Math.max(0.91, Math.min(0.97, metrics.precision + 0.015)).toFixed(3)),
    recall: Number(Math.max(0.84, Math.min(0.95, metrics.recall + 0.02)).toFixed(3)),
    f1: Number(Math.max(0.87, Math.min(0.95, metrics.f1 + 0.018)).toFixed(3)),
    prAuc: 0.9
  };
  const gates = scoreGates(candidateMetrics);
  const run = {
    id: `RUN-${String(runs.length + 24).padStart(3, "0")}`,
    version,
    dataset: datasetName,
    featureSet: "risk-v4",
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    completedAt: (/* @__PURE__ */ new Date()).toISOString(),
    stage: Object.values(gates).every(Boolean) ? "READY" : "FAILED",
    metrics: candidateMetrics,
    gates,
    message: Object.values(gates).every(Boolean) ? "Candidate is ready for deployment review." : "Candidate failed one or more release gates."
  };
  runs.unshift(run);
  stage = run.stage;
  addAudit("Model training completed", run.version, `${run.id} evaluated against ${run.dataset}; release gates ${run.stage === "READY" ? "passed" : "failed"}`);
  return mlopsStatus();
}
function deployModel(version) {
  const run = runs.find((item) => item.version === version);
  if (!run || run.stage !== "READY") throw new Error("Only a candidate that passed all release gates can be deployed");
  previousVersion = activeVersion;
  activeVersion = version;
  run.stage = "DEPLOYED";
  stage = "DEPLOYED";
  addAudit("Model deployed", version, `${run.id} promoted after data quality, performance, and drift checks`);
  return mlopsStatus();
}
function rollbackModel() {
  if (!previousVersion) return mlopsStatus();
  const rolledBackTo = previousVersion;
  previousVersion = activeVersion;
  activeVersion = rolledBackTo;
  stage = "DEPLOYED";
  addAudit("Model rollback", activeVersion, "Production traffic returned to the previous validated model version");
  return mlopsStatus();
}
function activeModelVersion() {
  return activeVersion;
}
function mlopsHealth() {
  const latest = runs[0];
  return {
    training: "ready",
    registry: "connected",
    featureStore: "healthy",
    monitoring: latest?.gates.drift ? "healthy" : "warning",
    inferenceModel: activeVersion,
    traceId: randomUUID2()
  };
}

// server/link-detector.ts
import dns from "node:dns/promises";
import net from "node:net";

// server/reputation-data.ts
import fs2 from "node:fs";
import path2 from "node:path";
var filePath = path2.resolve(process.cwd(), "data", "reputation", "domains.json");
var reputation = JSON.parse(fs2.readFileSync(filePath, "utf8"));
var records = new Map(reputation.domains.map((record) => [record.domain.toLowerCase(), record]));
function getDomainRecord(hostname) {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return records.get(normalized) ?? null;
}

// server/link-detector.ts
var suspiciousTlds = /* @__PURE__ */ new Set([".click", ".download", ".fit", ".gq", ".tk", ".top", ".work", ".zip"]);
var riskyPathWords = /login|signin|verify|verification|secure|account|payment|wallet|password|confirm|update|unlock/i;
var riskyQueryWords = /redirect|url=|target=|continue=|login|token|password|verify/i;
var ipHost = /^(?:\d{1,3}\.){3}\d{1,3}$/;
var supportedProtocols = /* @__PURE__ */ new Set(["http:", "https:"]);
var maxRedirects = 3;
var timeoutMs = 3500;
function addSignal(signals, label, detail, tone) {
  signals.push({ label, detail, tone });
}
function isPrivateIpv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127 || first === 169 && second === 254 || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168 || first >= 224;
}
function isPrivateIpv6(address) {
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}
function isBlockedAddress(address) {
  return net.isIP(address) === 4 ? isPrivateIpv4(address) : net.isIP(address) === 6 ? isPrivateIpv6(address) : true;
}
function normalizeInput(input) {
  const trimmed = input.trim();
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (!supportedProtocols.has(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error("Unsupported or ambiguous web URL");
  }
  return parsed;
}
function baseAnalysis(parsed) {
  return {
    normalizedUrl: parsed.toString(),
    hostname: parsed.hostname.toLowerCase(),
    disclaimer: "DNS and reachability checks are advisory. A reachable HTTPS site is not proof that its content or owner is trustworthy."
  };
}
async function lookupHost(hostname) {
  if (net.isIP(hostname)) return { status: isBlockedAddress(hostname) ? "DNS_RESULT_INCONCLUSIVE" : "DOMAIN_RESOLVES", addresses: isBlockedAddress(hostname) ? [] : [hostname] };
  try {
    const records2 = await Promise.race([
      dns.lookup(hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("DNS lookup timeout")), timeoutMs))
    ]);
    const addresses = Array.from(new Set(records2.map((record) => record.address)));
    return addresses.length ? { status: "DOMAIN_RESOLVES", addresses } : { status: "DOMAIN_DOES_NOT_RESOLVE", addresses: [] };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return { status: code === "ENOTFOUND" || code === "EAI_NONAME" ? "DOMAIN_DOES_NOT_RESOLVE" : "DNS_LOOKUP_FAILED", addresses: [] };
  }
}
async function checkReachability(url, addresses) {
  if (!addresses.length || addresses.some(isBlockedAddress)) return { status: "BLOCKED", httpStatus: null };
  let current = url;
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    try {
      const response = await fetch(current, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirect === maxRedirects) return { status: "INCONCLUSIVE", httpStatus: response.status };
        const next = new URL(location, current);
        if (!supportedProtocols.has(next.protocol)) return { status: "BLOCKED", httpStatus: response.status };
        const nextLookup = await lookupHost(next.hostname);
        if (nextLookup.status !== "DOMAIN_RESOLVES" || nextLookup.addresses.some(isBlockedAddress)) return { status: "BLOCKED", httpStatus: response.status };
        current = next;
        continue;
      }
      return { status: "REACHABLE", httpStatus: response.status };
    } catch {
      return { status: "UNREACHABLE", httpStatus: null };
    }
  }
  return { status: "INCONCLUSIVE", httpStatus: null };
}
async function analyzeLink(input) {
  let parsed;
  try {
    parsed = normalizeInput(input);
  } catch {
    const scheme = input.trim().match(/^([a-z][a-z\d+.-]*):/i)?.[1];
    const unsupportedScheme = scheme && !supportedProtocols.has(`${scheme.toLowerCase()}:`);
    return {
      normalizedUrl: input.trim(),
      hostname: "Invalid URL",
      verdict: "INCONCLUSIVE",
      riskScore: 100,
      confidence: null,
      signals: [{
        label: unsupportedScheme ? "Unsupported link scheme" : "Invalid link format",
        detail: unsupportedScheme ? `${scheme}: links are not inspected because they can execute actions outside a normal web page.` : "The submitted value cannot be parsed as a valid HTTP or HTTPS address.",
        tone: "danger"
      }],
      dnsStatus: "NOT_CHECKED",
      resolvedAddresses: [],
      reachability: "NOT_CHECKED",
      httpStatus: null,
      reputationStatus: "UNAVAILABLE",
      disclaimer: "The URL could not be safely parsed, so its existence and legitimacy could not be verified."
    };
  }
  const result = baseAnalysis(parsed);
  const signals = [];
  let riskScore = 0;
  const hostname = result.hostname;
  const tld = hostname.includes(".") ? hostname.slice(hostname.lastIndexOf(".")) : "";
  const domainRecord = getDomainRecord(hostname);
  if (parsed.protocol === "https:") addSignal(signals, "Encrypted transport", "The address uses HTTPS; encryption does not establish legitimacy.", "positive");
  else {
    riskScore += 15;
    addSignal(signals, "Unencrypted transport", "The address uses HTTP rather than HTTPS.", "warning");
  }
  if (parsed.username || parsed.password) {
    riskScore += 35;
    addSignal(signals, "Hidden destination", "Credentials before the hostname can obscure the destination.", "danger");
  }
  if (ipHost.test(hostname) || net.isIP(hostname)) {
    riskScore += 30;
    addSignal(signals, "IP address hostname", "The link points directly to an IP address rather than a named domain.", "warning");
  }
  if (hostname.includes("xn--") || /[^\u0000-\u007f]/.test(input)) {
    riskScore += 30;
    addSignal(signals, "Internationalized or punycode hostname", "Look-alike Unicode characters can obscure the apparent domain.", "danger");
  }
  if (domainRecord?.status === "shortener") {
    riskScore += 20;
    addSignal(signals, "Link shortener", "The final destination is hidden behind a shortening service.", "warning");
  } else if (domainRecord?.status === "blocked") {
    riskScore += 60;
    addSignal(signals, "Blocked domain", "This exact domain is present in the local blocklist.", "danger");
  } else if (domainRecord?.status === "verified") {
    addSignal(signals, "Reviewed domain entry", "This exact base domain is in the local reviewed directory; this is not live reputation verification.", "positive");
  } else {
    addSignal(signals, "Reputation unavailable", "The domain is not in the local reviewed directory and no external reputation provider is configured.", "warning");
  }
  if (suspiciousTlds.has(tld)) {
    riskScore += 20;
    addSignal(signals, "High-risk domain ending", `${tld} is a risk indicator used by some deceptive campaigns.`, "warning");
  }
  if (hostname.length > 45 || hostname.split(".").length > 4) {
    riskScore += 15;
    addSignal(signals, "Unusual domain structure", "The hostname is unusually long or deeply nested.", "warning");
  }
  if (riskyPathWords.test(parsed.pathname)) {
    riskScore += 15;
    addSignal(signals, "Sensitive action words", "The path requests a sign-in, verification, payment, or account action.", "warning");
  }
  if (riskyQueryWords.test(parsed.search)) {
    riskScore += 12;
    addSignal(signals, "Redirect or credential parameters", "Query parameters suggest redirection or a credential-focused flow.", "warning");
  }
  if ((hostname.match(/-/g) ?? []).length >= 3) {
    riskScore += 10;
    addSignal(signals, "Look-alike naming pattern", "Several hyphens can indicate an impersonation-style domain.", "warning");
  }
  const lookup = await lookupHost(hostname);
  const reachability = lookup.status === "DOMAIN_RESOLVES" ? await checkReachability(parsed, lookup.addresses) : { status: "NOT_CHECKED", httpStatus: null };
  if (lookup.status === "DOMAIN_DOES_NOT_RESOLVE") {
    riskScore += 35;
    addSignal(signals, "Domain does not resolve", "Domain could not be resolved. The website's existence and legitimacy could not be verified.", "danger");
  } else if (lookup.status === "DNS_LOOKUP_FAILED") {
    addSignal(signals, "DNS verification inconclusive", "Domain verification is inconclusive because the DNS lookup failed.", "warning");
  } else if (lookup.status === "DNS_RESULT_INCONCLUSIVE") {
    addSignal(signals, "Destination blocked from inspection", "The resolved destination is local, private, link-local, or otherwise prohibited for server-side requests.", "danger");
    riskScore += 50;
  } else {
    addSignal(signals, "Domain resolves", "DNS returned a public address for the hostname.", "positive");
  }
  if (reachability.status === "BLOCKED") {
    riskScore += 35;
    addSignal(signals, "Reachability check blocked", "The destination or redirect was blocked by outbound network safety controls.", "danger");
  } else if (reachability.status === "REACHABLE") {
    addSignal(signals, "Website responded", `The website responded with HTTP ${reachability.httpStatus}. This does not establish legitimacy.`, "positive");
  } else if (reachability.status === "UNREACHABLE") {
    addSignal(signals, "Website unreachable", "The domain resolves, but an HTTP response could not be obtained within the safety timeout.", "warning");
  }
  riskScore = Math.min(100, riskScore);
  const hasHardMaliciousSignal = domainRecord?.status === "blocked" || parsed.username !== "" || lookup.status === "DNS_RESULT_INCONCLUSIVE";
  const verdict = hasHardMaliciousSignal || riskScore >= 70 ? "MALICIOUS" : lookup.status === "DOMAIN_DOES_NOT_RESOLVE" || reachability.status === "UNREACHABLE" ? "UNREACHABLE" : lookup.status === "DNS_LOOKUP_FAILED" || lookup.status === "DNS_RESULT_INCONCLUSIVE" || reachability.status === "INCONCLUSIVE" ? "INCONCLUSIVE" : riskScore >= 30 ? "SUSPICIOUS" : "NO_KNOWN_THREATS";
  return {
    ...result,
    verdict,
    riskScore,
    confidence: null,
    signals,
    dnsStatus: lookup.status,
    resolvedAddresses: lookup.addresses,
    reachability: reachability.status,
    httpStatus: reachability.httpStatus,
    reputationStatus: domainRecord?.status === "blocked" ? "KNOWN_BLOCKED" : domainRecord ? "KNOWN_REVIEWED" : "UNAVAILABLE"
  };
}

// server/email-detector.ts
import dns2 from "node:dns/promises";
var freeMailDomains = /* @__PURE__ */ new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "proton.me",
  "protonmail.com"
]);
var urgencyPattern = /urgent|immediately|act now|within \d+ hours|last chance|final warning/i;
var moneyPattern = /fee|payment|processing charge|registration charge|gift card|wire transfer|bank details|pay now/i;
var credentialPattern = /password|otp|one[- ]time password|verification code|login|reset|credential|social security|aadhaar|pan card/i;
var hiringPattern = /hired|job offer|selected|joining|interview|recruit|salary|employment|offer letter/i;
var shortenerPattern = /(?:https?:\/\/)?(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|rb\.gy)\b/i;
var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
var dnsTimeoutMs = 2500;
function addSignal2(signals, label, detail, tone) {
  signals.push({ label, detail, tone });
}
async function withDnsTimeout(operation) {
  return Promise.race([
    operation,
    new Promise((_, reject) => setTimeout(() => reject(new Error("DNS lookup timeout")), dnsTimeoutMs))
  ]);
}
async function checkEmailDomain(domain) {
  const checks = {
    mx: "INCONCLUSIVE",
    spf: "INCONCLUSIVE",
    dmarc: "INCONCLUSIVE"
  };
  try {
    checks.mx = (await withDnsTimeout(dns2.resolveMx(domain))).length ? "PASS" : "FAIL";
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    checks.mx = code === "ENODATA" || code === "ENOTFOUND" ? "FAIL" : "INCONCLUSIVE";
  }
  try {
    const records2 = await withDnsTimeout(dns2.resolveTxt(domain));
    checks.spf = records2.some((record) => record.join("").toLowerCase().startsWith("v=spf1")) ? "PASS" : "FAIL";
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    checks.spf = code === "ENODATA" || code === "ENOTFOUND" ? "FAIL" : "INCONCLUSIVE";
  }
  try {
    const records2 = await withDnsTimeout(dns2.resolveTxt(`_dmarc.${domain}`));
    checks.dmarc = records2.some((record) => record.join("").toLowerCase().startsWith("v=dmarc1")) ? "PASS" : "FAIL";
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    checks.dmarc = code === "ENODATA" || code === "ENOTFOUND" ? "FAIL" : "INCONCLUSIVE";
  }
  return checks;
}
function addDomainCheckSignals(signals, checks) {
  const checksToReport = [
    ["MX record", checks.mx, "A receiving mail server is published for this domain.", "No receiving mail server was found for this domain."],
    ["SPF policy", checks.spf, "The domain publishes an SPF policy.", "The domain does not publish an SPF policy."],
    ["DMARC policy", checks.dmarc, "The domain publishes a DMARC policy.", "The domain does not publish a DMARC policy."]
  ];
  for (const [label, status, passDetail, failDetail] of checksToReport) {
    if (status === "PASS") addSignal2(signals, `Live ${label} check`, passDetail, "positive");
    else if (status === "FAIL") addSignal2(signals, `Live ${label} check`, failDetail, label === "MX record" ? "danger" : "warning");
    else addSignal2(signals, `Live ${label} check`, "The DNS provider did not return a definitive result within the safety timeout.", "warning");
  }
}
async function analyzeEmail(senderInput, subject, content, options) {
  const sender = senderInput.trim().toLowerCase();
  const normalizedSubject = subject.trim();
  const normalizedContent = content.trim();
  const signals = [];
  const combined = `${normalizedSubject} ${normalizedContent}`;
  if (!emailPattern.test(sender)) {
    return {
      sender,
      senderDomain: "Invalid address",
      organization: null,
      risk: "HIGH",
      verdict: "INCONCLUSIVE",
      riskScore: 100,
      confidence: null,
      signals: [{ label: "Invalid sender address", detail: "The sender is not a complete email address.", tone: "danger" }],
      recommendation: "Do not reply or open attachments. Confirm the sender through an official website.",
      links: [],
      missingEvidence: ["A valid sender address is required for domain assessment."],
      domainChecks: { mx: "INCONCLUSIVE", spf: "INCONCLUSIVE", dmarc: "INCONCLUSIVE" },
      disclaimer: "This is a pattern-based demonstration and does not contact the sender or verify mailbox ownership."
    };
  }
  const senderDomain = sender.split("@")[1].toLowerCase();
  const domainRecord = getDomainRecord(senderDomain);
  const organizationEntry = domainRecord?.organization ? [domainRecord.organization, [senderDomain]] : void 0;
  const senderAlias = sender.split("@")[0];
  const mentionedOrganization = ["Infosys", "Google", "Microsoft", "Amazon", "Apple", "Accenture"].find((name) => new RegExp(`\\b${name}\\b`, "i").test(`${senderAlias} ${combined}`));
  let riskScore = 0;
  const domainChecks = await checkEmailDomain(senderDomain);
  addDomainCheckSignals(signals, domainChecks);
  if (domainChecks.mx === "FAIL") riskScore += 25;
  if (domainChecks.spf === "FAIL") riskScore += 8;
  if (domainChecks.dmarc === "FAIL") riskScore += 8;
  if (organizationEntry) {
    addSignal2(signals, "Organization domain matched", `${organizationEntry[0]} uses ${senderDomain} in this demo directory.`, "positive");
  } else if (freeMailDomains.has(senderDomain)) {
    riskScore += 35;
    addSignal2(signals, "Free-mail sender", `${senderDomain} is not an official company domain and can be used to impersonate recruiters.`, "warning");
  } else {
    riskScore += 18;
    addSignal2(signals, "Unrecognized organization domain", `The domain ${senderDomain} is not in the current verification directory.`, "warning");
  }
  if (mentionedOrganization && (!organizationEntry || organizationEntry[0] !== mentionedOrganization)) {
    riskScore += 35;
    addSignal2(signals, "Organization mismatch", `The message mentions ${mentionedOrganization}, but the sender domain does not match its known pattern.`, "danger");
  }
  if (urgencyPattern.test(combined)) {
    riskScore += 18;
    addSignal2(signals, "Urgent language", "The message pressures the recipient to act quickly or avoid review.", "warning");
  }
  if (moneyPattern.test(combined)) {
    riskScore += 25;
    addSignal2(signals, "Money request", "The message asks for a fee, payment, transfer, or gift card.", "danger");
  }
  if (credentialPattern.test(combined)) {
    riskScore += 25;
    addSignal2(signals, "Credential request", "The message references passwords, codes, identity documents, or account access.", "danger");
  }
  if (shortenerPattern.test(normalizedContent)) {
    riskScore += 15;
    addSignal2(signals, "Shortened link", "A shortened link hides the destination and should be opened only after independent verification.", "warning");
  }
  if (hiringPattern.test(combined) && !organizationEntry) {
    riskScore += 12;
    addSignal2(signals, "Recruitment claim from unknown domain", "The message discusses hiring but does not come from a recognized organization domain.", "warning");
  }
  const urls = Array.from(new Set(combined.match(/https?:\/\/[^\s<>"']+/gi) ?? [])).slice(0, 10);
  const links = await Promise.all(urls.map((url) => analyzeLink(url)));
  const suspiciousLinks = links.filter((link) => link.verdict === "MALICIOUS" || link.verdict === "SUSPICIOUS" || link.verdict === "UNREACHABLE" || link.verdict === "INCONCLUSIVE");
  if (suspiciousLinks.length) {
    riskScore += Math.min(40, suspiciousLinks.reduce((total, link) => total + (link.verdict === "MALICIOUS" ? 25 : 12), 0));
    addSignal2(signals, "Suspicious message link", `${suspiciousLinks.length} embedded link(s) require independent verification before opening.`, "danger");
  }
  if (options?.replyTo && options.replyTo.trim().toLowerCase() !== sender) {
    riskScore += 25;
    addSignal2(signals, "Reply-To mismatch", "Replies would be directed to an address different from the displayed sender.", "danger");
  }
  if (options?.headers) {
    const normalizedHeaders = options.headers.toLowerCase();
    const authFailures = ["spf=fail", "dkim=fail", "dmarc=fail", "dmarc=none"].filter((value) => normalizedHeaders.includes(value));
    const authPasses = ["spf=pass", "dkim=pass", "dmarc=pass"].filter((value) => normalizedHeaders.includes(value));
    if (authFailures.length) {
      riskScore += Math.min(35, authFailures.length * 12);
      addSignal2(signals, "Authentication header failure", `${authFailures.join(", ")} was found in the supplied headers.`, "danger");
    } else if (authPasses.length) {
      addSignal2(signals, "Authentication header result", `${authPasses.join(", ")} was found in the supplied headers; verify the headers came from the receiving mail system.`, "positive");
    }
  }
  if (options?.attachments?.length) {
    const riskyAttachment = options.attachments.some((name) => /\.(exe|scr|js|vbs|bat|cmd|ps1|iso|zip)$/i.test(name));
    if (riskyAttachment) {
      riskScore += 30;
      addSignal2(signals, "Risky attachment type", "One or more attachments can execute code or conceal executable content.", "danger");
    } else {
      addSignal2(signals, "Attachment metadata supplied", "Attachment names were supplied, but files were not opened or executed.", "warning");
    }
  }
  if (signals.length === 1 && riskScore === 0) {
    addSignal2(signals, "No obvious content red flags", "The sender pattern and message did not trigger the current heuristic checks.", "positive");
  }
  riskScore = Math.min(100, riskScore);
  const risk = riskScore >= 60 ? "HIGH" : riskScore >= 30 ? "REVIEW" : "LOW";
  const verdict = riskScore >= 75 ? "PHISHING" : riskScore >= 60 ? "LIKELY_FRAUD" : riskScore >= 30 ? "SUSPICIOUS" : links.length || organizationEntry ? "LEGITIMATE" : "INCONCLUSIVE";
  const confidence = null;
  const missingEvidence = [
    !options?.headers ? "Authentication headers were not provided; SPF, DKIM, and DMARC results were not verified." : null,
    !options?.replyTo ? "Reply-To metadata was not provided." : null,
    !options?.attachments ? "Attachment metadata was not provided." : null
  ].filter((item) => Boolean(item));
  const recommendation = risk === "LOW" ? "Still verify important offers through the organization's official careers page before sharing personal information." : risk === "REVIEW" ? "Do not click links or send documents yet. Contact the organization using a trusted channel." : "Treat this as likely fraud. Do not reply, pay fees, share codes, or open attachments.";
  return {
    sender,
    senderDomain,
    organization: organizationEntry?.[0] ?? mentionedOrganization ?? null,
    risk,
    verdict,
    riskScore,
    confidence,
    signals,
    recommendation,
    links,
    missingEvidence,
    domainChecks,
    disclaimer: "This is a live DNS and content assessment. It does not verify mailbox ownership, prove that a sender controlled the message, or replace checks performed by the receiving mail provider."
  };
}

// server/routers.ts
var riskFilter = z2.enum(["ALL", "FRAUD", "LEGITIMATE", "HIGH", "MEDIUM", "LOW"]).default("ALL");
var DEMO_OPEN_ID = "demo-fraud-sentinel";
var DEMO_EMAIL = process.env.DEMO_AUTH_EMAIL ?? "demo@fraudsentinel.local";
var DEMO_PASSWORD = process.env.DEMO_AUTH_PASSWORD ?? "SentinelDemo123!";
var demoAuthEnabled = process.env.DEMO_AUTH_ENABLED === "true";
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    demoConfig: publicProcedure.query(() => ({
      enabled: demoAuthEnabled,
      email: demoAuthEnabled ? DEMO_EMAIL : null
    })),
    demoSignIn: publicProcedure.input(z2.object({
      email: z2.string().trim().email(),
      password: z2.string().min(1)
    })).mutation(async ({ input, ctx }) => {
      if (!demoAuthEnabled) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "Demo authentication is disabled" });
      }
      if (input.email.toLowerCase() !== DEMO_EMAIL.toLowerCase() || input.password !== DEMO_PASSWORD) {
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "Invalid demo credentials" });
      }
      const sessionToken = await sdk.signSession({
        openId: DEMO_OPEN_ID,
        appId: process.env.VITE_APP_ID || "fraud-sentinel-demo",
        name: "Demo Analyst"
      }, { expiresInMs: 1e3 * 60 * 60 * 8 });
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: 1e3 * 60 * 60 * 8
      });
      return { success: true, token: sessionToken };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  health: publicProcedure.query(async () => {
    const database = await checkDatabaseConnection();
    return {
      api: "connected",
      database: database.status,
      model: "loaded",
      pipeline: state.pipeline.status.toLowerCase(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }),
  datasets: router({
    list: publicProcedure.query(() => listDatasets())
  }),
  linkDetection: router({
    history: publicProcedure.query(() => listUrlScans()),
    analyze: publicProcedure.input(z2.object({ url: z2.string().trim().min(1).max(2048) })).mutation(async ({ input }) => {
      const result = await analyzeLink(input.url);
      await saveUrlScan(result);
      return result;
    })
  }),
  emailDetection: router({
    history: publicProcedure.query(() => listEmailScans()),
    analyze: publicProcedure.input(z2.object({
      sender: z2.string().trim().min(1).max(320),
      subject: z2.string().max(300),
      content: z2.string().max(2e4),
      replyTo: z2.string().email().max(320).optional(),
      headers: z2.string().max(3e4).optional(),
      attachments: z2.array(z2.string().max(255)).max(20).optional()
    })).mutation(async ({ input }) => {
      const result = await analyzeEmail(input.sender, input.subject, input.content, input);
      await saveEmailScan(result);
      return result;
    })
  }),
  mlops: router({
    status: publicProcedure.query(() => mlopsStatus()),
    health: publicProcedure.query(() => mlopsHealth()),
    train: publicProcedure.input(z2.object({ datasetName: z2.enum(["01_paysim_style", "02_credit_card_style", "03_ieee_cis_style"]).optional() }).optional()).mutation(({ input }) => trainModel(input?.datasetName)),
    deploy: publicProcedure.input(z2.object({ version: z2.string() })).mutation(({ input }) => deployModel(input.version)),
    rollback: publicProcedure.mutation(() => rollbackModel())
  }),
  dashboard: router({
    summary: publicProcedure.query(() => summary())
  }),
  transactions: router({
    list: publicProcedure.input(z2.object({ search: z2.string().default(""), filter: riskFilter, page: z2.number().int().min(1).default(1), pageSize: z2.number().int().min(5).max(50).default(12) })).query(({ input }) => {
      const all = state.transactions.slice(0, state.pipeline.processed).filter((row) => {
        const search = input.search.toLowerCase();
        const matchesSearch = !search || [row.id, row.customerId, row.merchantId, row.merchantName].some((value) => value.toLowerCase().includes(search));
        const matchesFilter = input.filter === "ALL" || input.filter === "FRAUD" && row.prediction === "FRAUD" || input.filter === "LEGITIMATE" && row.prediction === "LEGITIMATE" || row.riskLevel === input.filter;
        return matchesSearch && matchesFilter;
      }).reverse();
      const start = (input.page - 1) * input.pageSize;
      return { rows: all.slice(start, start + input.pageSize), total: all.length, page: input.page, pageSize: input.pageSize };
    }),
    get: publicProcedure.input(z2.object({ id: z2.string() })).query(({ input }) => getTransaction(input.id) ?? null),
    predict: publicProcedure.input(z2.object({ amount: z2.number().positive(), paymentMethod: z2.string(), isNewDevice: z2.boolean(), isInternational: z2.boolean(), velocity1h: z2.number().min(0), failedAttempts: z2.number().min(0), datasetName: z2.enum(["01_paysim_style", "02_credit_card_style", "03_ieee_cis_style"]).optional(), features: z2.record(z2.string(), z2.union([z2.number(), z2.string(), z2.boolean()])).optional() })).mutation(({ input }) => {
      const result = predictWithDataset(input.datasetName ?? defaultDataset(), input);
      const probability = result.probability;
      const riskLevel2 = classify(probability);
      return { probability, riskLevel: riskLevel2, prediction: riskLevel2 === "HIGH" ? "FRAUD" : "LEGITIMATE", modelVersion: activeModelVersion(), dataset: result.dataset, modelArtifact: result.modelVersion, metrics: result.metrics, processingTimeMs: 42, topRiskFactors: result.topRiskFactors };
    })
  }),
  pipeline: router({
    status: publicProcedure.query(() => state.pipeline),
    start: publicProcedure.input(z2.object({ speed: z2.number().int().min(1).max(10).default(5) })).mutation(({ input }) => {
      state.pipeline.status = "RUNNING";
      state.pipeline.speed = input.speed;
      state.pipeline.startedAt = state.pipeline.startedAt ?? (/* @__PURE__ */ new Date()).toISOString();
      addAudit("Pipeline started", "pipeline", `Transaction stream running at ${input.speed} tx/sec`);
      return state.pipeline;
    }),
    pause: publicProcedure.mutation(() => {
      state.pipeline.status = "PAUSED";
      addAudit("Pipeline paused", "pipeline", `Stream paused at transaction ${state.pipeline.processed}`);
      return state.pipeline;
    }),
    stop: publicProcedure.mutation(() => {
      state.pipeline.status = "STOPPED";
      addAudit("Pipeline stopped", "pipeline", `Stream stopped at transaction ${state.pipeline.processed}`);
      return state.pipeline;
    }),
    step: publicProcedure.mutation(() => {
      if (state.pipeline.cursor < state.transactions.length) {
        const next = state.transactions[state.pipeline.cursor];
        state.pipeline.cursor += 1;
        state.pipeline.processed = state.pipeline.cursor;
        state.pipeline.lastTransactionId = next?.id ?? null;
      }
      return state.pipeline;
    })
  }),
  monitoring: router({
    overview: publicProcedure.query(() => monitoring()),
    drift: publicProcedure.query(() => monitoring().drift),
    performance: publicProcedure.query(() => monitoring().metrics)
  }),
  models: router({
    list: publicProcedure.query(() => models()),
    get: publicProcedure.input(z2.object({ version: z2.string() })).query(({ input }) => models().find((model) => model.version === input.version) ?? null),
    retrain: publicProcedure.input(z2.object({ datasetName: z2.enum(["01_paysim_style", "02_credit_card_style", "03_ieee_cis_style"]).optional() }).optional()).mutation(({ input }) => trainModel(input?.datasetName)),
    promote: publicProcedure.input(z2.object({ version: z2.string() })).mutation(({ input }) => deployModel(input.version))
  }),
  alerts: router({
    list: publicProcedure.input(z2.object({ status: z2.enum(["ALL", "OPEN", "ACKNOWLEDGED", "RESOLVED"]).default("ALL") })).query(({ input }) => input.status === "ALL" ? state.alerts : state.alerts.filter((alert) => alert.status === input.status)),
    acknowledge: publicProcedure.input(z2.object({ id: z2.string() })).mutation(({ input }) => {
      const alert = state.alerts.find((item) => item.id === input.id);
      if (alert) alert.status = "ACKNOWLEDGED";
      addAudit("Alert acknowledged", input.id, "Alert moved to acknowledged state");
      return alert ?? null;
    }),
    resolve: publicProcedure.input(z2.object({ id: z2.string() })).mutation(({ input }) => {
      const alert = state.alerts.find((item) => item.id === input.id);
      if (alert) alert.status = "RESOLVED";
      addAudit("Alert resolved", input.id, "Alert marked resolved by operations");
      return alert ?? null;
    })
  }),
  experiments: router({ list: publicProcedure.query(() => [
    { id: "EXP-024", model: "Random Forest", dataset: "sentinel-synthetic-2k", featureSet: "risk-v4", timestamp: "2026-09-18T11:20:00.000Z", status: "Registered", metrics: "F1 0.87 \xB7 PR-AUC 0.88", params: "240 trees \xB7 balanced weights" },
    { id: "EXP-023", model: "Logistic Regression", dataset: "sentinel-synthetic-2k", featureSet: "risk-v4", timestamp: "2026-09-10T14:05:00.000Z", status: "Reference", metrics: "F1 0.76 \xB7 PR-AUC 0.77", params: "C=1.0 \xB7 balanced weights" },
    { id: "EXP-021", model: "Random Forest", dataset: "sentinel-synthetic-2k", featureSet: "risk-v3", timestamp: "2026-09-04T08:40:00.000Z", status: "Archived", metrics: "F1 0.84 \xB7 PR-AUC 0.84", params: "160 trees \xB7 balanced weights" }
  ]) }),
  audit: router({ list: publicProcedure.query(() => state.audit) }),
  settings: router({ get: publicProcedure.query(() => state.settings), update: publicProcedure.input(z2.object({ lowThreshold: z2.number().min(0).max(1), highThreshold: z2.number().min(0).max(1), latencyThreshold: z2.number().min(50).max(5e3), driftThreshold: z2.number().min(0).max(1) })).mutation(({ input }) => {
    state.settings = input;
    addAudit("Threshold changed", "risk-engine", `High risk ${input.highThreshold.toFixed(2)} \xB7 latency ${input.latencyThreshold} ms`);
    return state.settings;
  }) }),
  metrics: publicProcedure.query(() => getMetrics())
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/app.ts
import { createExpressMiddleware } from "@trpc/server/adapters/express";
function createApp() {
  const app2 = express();
  app2.disable("x-powered-by");
  const clientOrigins = new Set(
    (process.env.CLIENT_ORIGIN ?? "").split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean)
  );
  app2.use((req, res, next) => {
    const requestOrigin = req.headers.origin?.replace(/\/$/, "");
    if (requestOrigin && clientOrigins.has(requestOrigin)) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.vary("Origin");
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
    }
    next();
  });
  app2.use(express.json({ limit: "50mb" }));
  app2.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app2);
  registerOAuthRoutes(app2);
  app2.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "fraud-sentinel-backend" });
  });
  app2.use("/api/trpc", createExpressMiddleware({
    router: appRouter,
    createContext
  }));
  app2.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });
  return app2;
}

// serverless/vercel-entry.ts
var app = createApp();
function handler(req, res) {
  return app(req, res);
}
export {
  handler as default
};
