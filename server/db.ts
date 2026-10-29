import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { emailScans, InsertUser, users, urlScans } from "../drizzle/schema";
import type { EmailAnalysis } from "./email-detector";
import type { LinkAnalysis } from "./link-detector";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

function hasUsableDatabaseUrl(value: string | undefined): value is string {
  return Boolean(value && !value.includes("[") && !value.includes("]") && !value.includes("<") && !value.includes(">"));
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && hasUsableDatabaseUrl(process.env.DATABASE_URL)) {
    try {
      _client = postgres(process.env.DATABASE_URL, {
        max: 5,
        prepare: false,
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

export type DatabaseHealth = {
  status: "connected" | "unconfigured" | "unavailable";
};

export async function checkDatabaseConnection(): Promise<DatabaseHealth> {
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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Partial<InsertUser> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function saveUrlScan(result: LinkAnalysis, userId?: string | null) {
  const db = await getDb();
  if (!db) return;

  await db.insert(urlScans).values({
    userId: userId ?? null,
    url: result.normalizedUrl,
    hostname: result.hostname,
    verdict: result.verdict,
    riskScore: result.riskScore,
    confidence: result.confidence,
    result,
  });
}

export async function saveEmailScan(result: EmailAnalysis, userId?: string | null) {
  const db = await getDb();
  if (!db) return;

  await db.insert(emailScans).values({
    userId: userId ?? null,
    sender: result.sender,
    senderDomain: result.senderDomain,
    verdict: result.verdict,
    riskScore: result.riskScore,
    confidence: result.confidence,
    result,
  });
}

export async function listUrlScans(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: urlScans.id,
    url: urlScans.url,
    hostname: urlScans.hostname,
    verdict: urlScans.verdict,
    riskScore: urlScans.riskScore,
    confidence: urlScans.confidence,
    createdAt: urlScans.createdAt,
  }).from(urlScans).orderBy(desc(urlScans.createdAt)).limit(limit);
}

export async function listEmailScans(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: emailScans.id,
    sender: emailScans.sender,
    senderDomain: emailScans.senderDomain,
    verdict: emailScans.verdict,
    riskScore: emailScans.riskScore,
    confidence: emailScans.confidence,
    createdAt: emailScans.createdAt,
  }).from(emailScans).orderBy(desc(emailScans.createdAt)).limit(limit);
}
