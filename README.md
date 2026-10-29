# Fraud Sentinel

Fraud Sentinel is an operational dashboard for real-time payment fraud detection and MLOps observability. It presents a seeded 2,000-record synthetic transaction stream, model risk decisions, pipeline health, drift signals, model registry metadata, alert management, and audit events through a single full-stack WebDev project.

> The transaction dataset is synthetic. It is designed to exercise the product workflow and must not be presented as real banking data.

## What is implemented

The dashboard includes a persistent operations shell with routes for Overview, Transactions, Link Detection, Email Verification, Pipeline, Monitoring, Models, Experiments, Alerts, Audit Logs, and Settings. The overview combines live KPI cards, transaction activity, risk probability bands, fraud by merchant category, system health, and a recent transaction feed. Transactions are searchable, filterable, paginated, and linked to an investigation view containing customer, merchant, device, location, engineered features, risk factors, model output, and processing timeline. Link Detection and Email Verification provide safe, static heuristics for suspicious URLs and sender/message patterns; they never open submitted links, contact senders, or claim mailbox ownership.

The pipeline page can start, pause, and stop a sequential simulator at 1, 5, or 10 transactions per second. Monitoring exposes data-quality counters, model performance, latency, feature drift, and deployment thresholds. The model registry compares Random Forest and Logistic Regression metadata, supports retraining initiation, and records promotion actions. Alerts can be acknowledged or resolved. Settings changes are applied to the process state and recorded in the audit log.

## Architecture

The project uses the supported Manus WebDev full-stack template:

- React 19, TypeScript, Vite, Tailwind CSS 4, Wouter, and Recharts for the client.
- Express and tRPC 11 for typed server procedures.
- Drizzle/PostgreSQL support for future durable persistence and authenticated user records. Supabase pooled PostgreSQL connections are supported through `DATABASE_URL`.
- A deterministic TypeScript data layer in `server/fraud-data.ts` for the initial synthetic dataset and operational state. This keeps the preview self-contained and responsive while preserving clear seams for database-backed queries.

The original brief requested FastAPI and PostgreSQL. This implementation uses the platform-supported server and database runtime instead so it can run in the attached WebDev environment without a second process or external database service. The server procedures retain the same product boundaries: transactions, predictions, pipeline control, monitoring, models, alerts, experiments, audit, settings, and health.

## Data and scoring

`server/fraud-data.ts` generates 2,000 payment transactions with relationships among velocity, amount deviation, device novelty, merchant novelty, international travel, failed attempts, transaction hour, and distance from home. Fraud probability is derived from those signals. The generator also produces a hidden synthetic ground-truth label so precision and recall are bounded classification metrics rather than decorative numbers.

Risk bands follow the configurable thresholds shown in Settings:

| Band | Default rule |
| --- | --- |
| Low | Probability below `0.30` |
| Medium | Probability from `0.30` through `0.69` |
| High | Probability at or above `0.70` |

The displayed risk factors are feature-derived explanations. They are not SHAP attributions.

The repository also includes the synthetic training bundle under `datasets/`: PaySim-style mobile money, credit-card-style PCA signals, and IEEE-CIS-style card-not-present signals. Each model is trained from its `train_80.xlsx` split and evaluated against `test_20.xlsx` at server startup. The Transactions scoring form lets operators select the dataset model; responses include the deployed registry version, dataset name, model artifact version, and held-out metrics.

## Main procedures

All client/server communication uses tRPC under `/api/trpc`.

| Area | Procedures |
| --- | --- |
| Dashboard | `dashboard.summary`, `health` |
| Transactions | `transactions.list`, `transactions.get`, `transactions.predict` |
| Trust signals | `linkDetection.analyze`, `emailDetection.analyze` |
| Pipeline | `pipeline.status`, `pipeline.start`, `pipeline.pause`, `pipeline.stop`, `pipeline.step` |
| Monitoring | `monitoring.overview`, `monitoring.drift`, `monitoring.performance` |
| Models | `models.list`, `models.get`, `models.retrain`, `models.promote` |
| Alerts | `alerts.list`, `alerts.acknowledge`, `alerts.resolve` |
| Governance | `experiments.list`, `audit.list`, `settings.get`, `settings.update` |

The MLOps control plane also exposes `mlops.status`, `mlops.health`, `mlops.train`, `mlops.deploy`, and `mlops.rollback`. Training evaluates a candidate against data-quality, performance, and drift gates. Only a candidate in `READY` state can be deployed; deployment changes the active model version used by new predictions and every lifecycle action is written to the audit log.

## Run locally

The managed project already includes its dependencies and a running development server. For a local checkout:

```bash
pnpm install
pnpm dev
```

The default preview runs on port 3000. The project also supports:

```bash
pnpm check
pnpm test
pnpm build
```

The existing `client/` directory is the frontend application and `server/` is the
Express/tRPC backend. They remain in one workspace so the current same-origin
development and production builds continue to work. For a separate frontend
deployment, set `VITE_API_BASE_URL` to the backend origin at frontend build time
and set `CLIENT_ORIGIN` to the exact frontend origin on the backend. Leave both
empty for the default same-origin setup. See [.env.example](./.env.example).

### Authentication

The application uses the existing OAuth provider rather than collecting passwords
in the frontend. The callback validates a one-time state nonce, exchanges the
authorization code server-side, synchronizes the user record, and issues an
HTTP-only signed session cookie. Dashboard routes are protected in the frontend
for user experience, while the backend session is the source of truth.

Copy `.env.example` to `.env` and configure `OAUTH_SERVER_URL`, `JWT_SECRET`,
`VITE_OAUTH_PORTAL_URL`, and `VITE_APP_ID` to enable the sign-in and workspace
access actions. Password recovery remains managed by the configured identity
provider; the login screen does not claim to send a local reset email.

For a local product demonstration before OAuth is configured, start the server
with `DEMO_AUTH_ENABLED=true`. The preview login then exposes the clearly labeled
demo account `demo@fraudsentinel.local` / `SentinelDemo123!`. Demo sessions are
short-lived and use the same signed session validation path, but demo mode is
not production authentication and must remain disabled in deployed environments.

## Testing

The test suite covers the scaffold authentication contract plus synthetic data population, required field quality, risk-band semantics, bounded metrics, and processed-record counts. Run the complete suite with `pnpm test`.

## Runtime limitations

Operational dashboard state is currently process-local and resets when the server restarts. URL and email detector results now have PostgreSQL persistence through the `url_scans` and `email_scans` tables, with the remaining job, security-event, model, feedback, and email-connection tables defined in the Drizzle migration. Apply the migration only after configuring a verified Supabase pooled `DATABASE_URL` with `pnpm db:push`.

The health endpoint performs a real `SELECT 1` connectivity check and reports `unconfigured` or `unavailable` when it cannot verify the database; it never reports a static database success.

The Link Detection and Email Detection pages use authenticated tRPC procedures. Each completed analysis is stored with the signed-in user's `openId`, and each page displays only that user's recent scan history. The `scan_jobs`, `email_connections`, `security_events`, `model_predictions`, `model_versions`, and `user_feedback` tables are schema foundations for queued processing, provider integrations, auditability, model governance, and feedback workflows; they are not presented as active integrations until their corresponding services are implemented.

The frontend uses polling through tRPC for live refreshes. The original WebSocket contract is represented by the pipeline procedures and can be upgraded to a server-sent or WebSocket transport without changing page contracts.

The trust-signal analyzers use a versioned in-repository organization/domain directory, deterministic pattern checks, bounded DNS lookups, and SSRF-blocked HTTP HEAD checks. They do not render pages, download content, contact senders, or verify mailbox ownership. They are not wired to an unverified third-party fraud feed or email provider. A production integration should add an authenticated provider with explicit licensing, rate limits, privacy controls, and a reviewable fallback; the typed tRPC procedures provide the seam for that integration.

The MLOps lifecycle is currently process-local as well: it is an executable release-control simulation with deterministic metrics, not a replacement for a durable MLflow registry, feature store, stream processor, or external inference service. Persisting runs and active versions requires moving `server/mlops.ts` state behind the existing Drizzle database layer.

## Project map

```text
client/src/App.tsx                    Route wiring
client/src/components/DashboardLayout.tsx  Sidebar and top status bar
client/src/pages/Home.tsx             Overview dashboard
client/src/pages/Transactions.tsx     Feed and investigation view
client/src/pages/Operations.tsx       Pipeline, monitoring, models, alerts, and governance
server/fraud-data.ts                  Synthetic dataset and operational state
server/routers.ts                     Typed tRPC procedures
server/fraud-data.test.ts             Data and risk-engine tests
```

## References

[1]: https://react.dev/ "React documentation"
[2]: https://trpc.io/docs/ "tRPC documentation"
[3]: https://recharts.org/en-US/ "Recharts documentation"
[4]: https://orm.drizzle.team/docs/overview "Drizzle ORM documentation"
