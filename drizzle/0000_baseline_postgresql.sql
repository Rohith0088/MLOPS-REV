CREATE TYPE "public"."scan_job_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."scan_type" AS ENUM('URL', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."security_event_type" AS ENUM('AUTH', 'SCAN', 'ACCESS', 'CONFIGURATION');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "email_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" varchar(128) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"providerAccountId" varchar(255) NOT NULL,
	"scopes" jsonb NOT NULL,
	"encryptedRefreshToken" text,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" varchar(128),
	"sender" varchar(320) NOT NULL,
	"senderDomain" varchar(253) NOT NULL,
	"verdict" varchar(32) NOT NULL,
	"riskScore" integer NOT NULL,
	"confidence" integer,
	"result" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" varchar(128),
	"scanType" "scan_type" NOT NULL,
	"scanId" integer NOT NULL,
	"modelVersion" varchar(128) NOT NULL,
	"prediction" varchar(64) NOT NULL,
	"score" integer NOT NULL,
	"explanation" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"version" varchar(128) NOT NULL,
	"status" varchar(32) NOT NULL,
	"metrics" jsonb NOT NULL,
	"artifactUri" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "model_versions_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "scan_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" varchar(128),
	"type" "scan_type" NOT NULL,
	"status" "scan_job_status" DEFAULT 'QUEUED' NOT NULL,
	"idempotencyKey" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scan_jobs_idempotencyKey_unique" UNIQUE("idempotencyKey")
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" varchar(128),
	"eventType" "security_event_type" NOT NULL,
	"action" varchar(128) NOT NULL,
	"outcome" varchar(32) NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "url_scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" varchar(128),
	"url" text NOT NULL,
	"hostname" varchar(253) NOT NULL,
	"verdict" varchar(32) NOT NULL,
	"riskScore" integer NOT NULL,
	"confidence" integer,
	"result" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" varchar(128) NOT NULL,
	"scanType" "scan_type" NOT NULL,
	"scanId" integer NOT NULL,
	"label" varchar(64) NOT NULL,
	"comment" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
