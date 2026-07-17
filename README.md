# ClassCue

ClassCue is a phone-first application that helps parents manage their children's extracurricular classes, schedules, attendance, punctuality, fees, payments, and reminders.

The repository uses [vinext](https://github.com/cloudflare/vinext), with Cloudflare D1 and Drizzle available for persistence.

## Current Status

The core parent workflow is now usable end to end: family setup, reusable contacts, recurring classes, attendance, schedule exceptions, fees/payments, parent-controlled reminders, reviewed suggestions, and safe record maintenance. Historical attendance and financial records remain intact when a class is archived.

## Product Documentation

- `docs/requirements.md` — confirmed product requirements.
- `docs/mvp-scope.md` — MVP boundaries, success criteria, and deferred capabilities.
- `docs/user-journeys.md` — navigation, screen map, interaction rules, and core journeys.
- `docs/data-model.md` — entities, relationships, invariants, indexes, and migration sequence.
- `docs/architecture.md` — runtime choices, module boundaries, request flows, security, and implementation sequence.
- `outputs/classcue-user-journey/` — editable HTML mockups, rendered boards, and the PowerPoint walkthrough.

## Project Progress

Dates and times use Gulf Standard Time (`Asia/Dubai`, UTC+4).

### 17 July 2026, 10:22 PM GST — Mockups approved and delivery workflow agreed

- Parent requirements and the first-version scope were confirmed through short Q&A rounds.
- MVP scope and eight core user journeys were documented.
- Six visual journey boards covering 18 phone screens were produced.
- An eight-slide PowerPoint walkthrough was rendered and checked for layout overflow.
- The mockups were accepted as a sufficient baseline; visual refinement is deferred until needed.
- Agreed to update this progress log, commit, and push after each completed stage.
- Related commits: `d12e701`, `bb7c070`.

### 17 July 2026, 10:26 PM GST — Data model and architecture established

- Defined the household ownership boundary and a future-compatible membership model while retaining one active parent for the MVP.
- Modelled children, reusable contacts, providers, enrollments, versioned schedules, concrete sessions, attendance, punctuality, fees, payments, session-credit ledgers, reminders, AI proposals, and audit history.
- Selected a modular-monolith architecture using Vinext, TypeScript, Cloudflare D1, and Drizzle.
- Kept authentication, notifications, file storage, and AI behind adapters so hackathon choices can change later.
- Defined server-side household authorization, money and timezone rules, historical preservation, idempotency, and optimistic concurrency.
- Split delivery into seven implementation stages beginning with the child-to-Today vertical slice.

### 17 July 2026, 11:31 PM GST — First working vertical slice completed

- Replaced the generated loading scaffold with the ClassCue product shell and approved visual direction.
- Added the signed-out introduction plus signed-in Today, Children, Fees, and More navigation.
- Enabled the logical D1 binding and added the first generated migration with 11 relational tables.
- Implemented server-side signed-in identity resolution and household-scoped data access.
- Implemented child creation and recurring-class setup with reusable provider and teacher records.
- Added timezone-aware, idempotent generation of a rolling 90-day session horizon.
- Added a household snapshot API that groups upcoming classes by child.
- Added safe runtime database initialization for local previews and packaged migrations for hosted releases.
- Added a ClassCue social-preview image and product metadata.
- Verified TypeScript, the production build, migration structure, and an authenticated child-to-session flow.

### 17 July 2026, 11:51 PM GST — Attendance and punctuality completed

- Added household-scoped attendance recording for scheduled and makeup sessions after they start.
- Kept session status, attendance, and punctuality as separate persisted fields.
- Added on-time as the attended default, late-arrival minutes from 1–360, absent status, and optional notes.
- Added safe editing so changing late to absent clears punctuality and minutes without changing the session schedule.
- Added phone-first attendance controls, quick lateness presets, and clear parent confirmation language.
- Added attendance rate, late-arrival count, average minutes late, and recent session history for each child.
- Expanded the household snapshot to include up to 90 days of recent sessions for missed attendance entry.
- Verified the production build, type checks, contract tests, and authenticated late-to-absent end-to-end flow.

### 18 July 2026, 12:06 AM GST — Schedule exceptions and linked makeups completed

- Added explicit “This session only” and “This and future sessions” choices to prevent accidental recurrence changes.
- Added cancellation, holiday, and reschedule states while preserving the original session and its reason.
- Added manual replacement and makeup sessions linked to their source session, including per-session location overrides.
- Added pending compensation tracking and child-level makeup balances for cancelled sessions whose makeup date is not known yet.
- Added versioned recurrence changes that close the previous rule, retain history and manual exceptions, and regenerate only eligible future recurring sessions.
- Kept attendance independent and blocked schedule edits once attendance exists.
- Added safe runtime migrations for existing D1 databases plus regression coverage for history, links, and recurrence boundaries.
- Verified the production build, TypeScript, contract tests, and authenticated end-to-end cancellation, makeup, reschedule, and future-recurrence flows.

### 18 July 2026, 12:30 AM GST — Fees and payments completed

- Added monthly, term, prepaid-package, and per-session fee arrangements for each child’s class.
- Stored money as integer minor units and kept due and paid totals separated by ISO currency.
- Added explainable suggested charges using configured terms, billable session counts, or the previous paid amount.
- Added parent-confirmed overrides with required reasons and append-only adjustment history.
- Added due, overdue, partial-payment, and paid states with payment date, method, reference, and notes.
- Added fee highlights on Today, child-level paid/due summaries, detailed Fees views, and manual fee-reminder sharing.
- Added package purchase and usage ledger entries, with paid package credits automatically created and completed non-makeup sessions consuming one credit.
- Added safe D1 billing migrations, household-scoped authorization, currency-aware validation, and regression coverage.
- Verified all four fee models plus mixed currencies, first and later adjustments, partial and full payments, previous-payment suggestions, and package-balance consumption through authenticated end-to-end flows.

### 18 July 2026, 12:48 AM GST — Reminders and reviewed suggestions completed

- Added independent reminder rules for upcoming classes, fee due dates, and repeating overdue fees, including on/off controls and parent-selected timing.
- Added idempotent reminder jobs, a persistent in-app inbox, upcoming reminders, and delivery/dismissal history.
- Added browser notifications while ClassCue is open, plus native phone sharing with clipboard fallback for class and fee reminders.
- Automatically cancelled pending reminder jobs when a class changes, a rule is disabled, or a fee becomes fully paid.
- Added explainable, data-based reminder suggestions that never change records until the parent explicitly accepts them.
- Routed accepted suggestions through the same validated reminder command and recorded accept/dismiss decisions in an audit log.
- Clearly labelled the current suggestion engine as deterministic rather than generative AI because no OpenAI API credential is configured.
- Added safe D1 migrations and regression coverage for reminder idempotency, household isolation, paid-fee cancellation, notification wiring, and reviewed suggestions.
- Verified the production build, TypeScript, lint, contract tests, and an authenticated class-reminder and overdue-fee flow through acceptance, delivery, payment, and cancellation.

### 18 July 2026, 1:08 AM GST — Contacts, settings, and record maintenance completed

- Added reusable household contacts with name, institute, phone, email, notes, and per-class roles for teachers, administration, payment support, and other support.
- Added contact reuse during class setup and class-level contact management, including exactly one primary teacher for reminder details.
- Added editing for child profiles, class names, subjects, institutes, physical locations, and online-class links.
- Added household name and default-timezone settings while preserving the timezone already assigned to existing class schedules.
- Added optimistic version checks so an older screen cannot overwrite a newer class edit.
- Added safe class archiving that stops future recurring sessions and active fee arrangements while preserving attendance, payment, fee, and contact history.
- Added class restoration that resumes the latest recurring schedule and fee arrangement without recreating the enrollment.
- Added an archived-class history surface and prevented contacts linked to active classes from being archived accidentally.
- Added a database constraint for one primary teacher per enrollment plus household-scoped maintenance APIs and regression coverage.
- Verified contact reuse across two children, primary-teacher handoff, stale-edit protection, profile and household updates, online links, archive/restore, and resumed session generation through an authenticated end-to-end flow.

### 18 July 2026, 1:17 AM GST — Installability and production-readiness pass completed

- Added a standards-based web-app manifest, branded app icons, iPhone home-screen metadata, portrait phone orientation, and standalone display mode.
- Added an in-app install surface with browser install prompting, iPhone Add to Home Screen guidance, and installed-state feedback.
- Hardened the service-worker lifecycle and added a push-event handler while keeping private household responses out of offline caches.
- Added visible, dismissible error feedback for reminder actions, suggestion review, notification permission, class restoration, and installation failures.
- Added keyboard focus indicators, current-page navigation semantics, Escape-to-close dialogs, dialog descriptions, and focus restoration.
- Added a plain-language privacy summary explaining account ownership, parent-confirmed suggestions, tap-initiated sharing, and the no-payment-processing boundary.
- Verified the generated manifest content type and payload, all app-icon responses, service-worker delivery, cross-household isolation for new maintenance routes, and the complete production build.
- Expanded the regression suite to 11 passing checks covering the installable phone surface and the rule that private app data is never cached offline.

### 18 July 2026, 1:29 AM GST — Closed-app phone notifications completed

- Added household- and user-scoped Web Push subscriptions so each signed-in parent controls notification delivery per device.
- Added a scheduled worker that checks due reminder jobs every minute and delivers class, fee-due, and overdue-fee notifications while ClassCue is closed.
- Added per-device delivery history, retry backoff, an eight-attempt ceiling, and automatic expiry for invalid push subscriptions.
- Added production VAPID configuration through Sites environment variables; the private signing key is stored as a secret and is not committed to Git.
- Added phone notification enable/disable controls, accurate closed-app status, and iPhone/iPad guidance to install ClassCue before enabling Web Push.
- Recalculate reminder jobs immediately after session, recurrence, fee, archive, and restore changes so scheduled delivery does not depend on opening the app again.
- Preserved the in-app reminder inbox and open-app browser delivery as fallbacks when notifications are unsupported, blocked, or disabled.
- Verified 12 regression checks, TypeScript, ESLint, the production build, and the emitted one-minute cron configuration.

### 18 July 2026, 1:40 AM GST — Privacy-scoped OpenAI insight adapter completed

- Added an on-demand OpenAI Responses API adapter for fee explanations, attendance and punctuality patterns, and reminder-timing proposals.
- Used strict JSON Schema Structured Outputs with the current `gpt-5.6-sol` model default, explicit low-latency reasoning, a 30-second timeout, and `store: false`.
- Limited model input to pseudonymous class and fee aliases plus aggregate facts; child names, class names, contacts, notes, raw attendance history, and payment references are not sent.
- Revalidated every proposed reminder against current household-owned records before it can become a pending suggestion.
- Kept both model-generated and rule-based suggestions under explicit parent review; informational insights make no record change, and accepted reminder proposals use the existing validated reminder command.
- Added a ten-minute household rate limit and an audit event for every model-generation request to control API usage and preserve accountability.
- Added clear UI labels separating AI-generated insights from the ClassCue rule engine, plus an honest disconnected state until an API key is configured.
- Verified 13 regression checks, TypeScript, ESLint, and the production build. A live OpenAI call remains pending until `OPENAI_API_KEY` is added as a Sites secret.

### 18 July 2026, 1:44 AM GST — Notification ownership edge case hardened

- Changed device status checks to confirm that the browser push endpoint is registered to the currently signed-in parent, rather than trusting browser state alone.
- Safely replaces a stale subscription from a previous account before registering the current parent, avoiding a misleading enabled state on shared devices.
- Requires successful server revocation before removing the local subscription so failed disable actions remain recoverable.
- Reverified all 13 regression checks, TypeScript, ESLint, and the production build.

### 18 July 2026, 1:47 AM GST — Production dependency audit cleared

- Audited the current production dependency tree against the npm advisory database.
- Replaced Next.js’s vulnerable nested PostCSS release with the patched `8.5.19` release through a narrow package override.
- Confirmed the production dependency audit now reports zero known vulnerabilities without downgrading Next.js or using a forced breaking update.
- Reverified all 13 regression checks, TypeScript, ESLint, and the production build after the dependency change.

### Next stage

- Configure the OpenAI API key, run one live structured-output acceptance call, and deploy the connected AI stage.
- Complete the live-device notification enable/send/receive acceptance check.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

The local database initializes from the generated migration on the first authenticated request. This project does not use `wrangler.jsonc`.

## Included Shape

- `app/` contains the phone-first product surface and authenticated API routes.
- `src/modules/` contains household, scheduling, and Today domain logic.
- `db/schema.ts` defines the relational D1 schema.
- `drizzle/` contains generated, reviewed SQL migrations.
- `.openai/hosting.json` declares the Sites D1 binding; R2 remains disabled.
- `vite.config.ts` provides Cloudflare-compatible local and production builds.

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build ClassCue and verify the product shell and initial migration
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
