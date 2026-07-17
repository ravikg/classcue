# ClassCue

ClassCue is a phone-first application that helps parents manage their children's extracurricular classes, schedules, attendance, punctuality, fees, payments, and reminders.

The repository uses [vinext](https://github.com/cloudflare/vinext), with Cloudflare D1 and Drizzle available for persistence.

## Current Status

The product foundation, recurring-class flow, attendance, and schedule-exception stages are complete. A signed-in parent can create a household, add children and recurring classes, record attendance and lateness, cancel or reschedule one session, link makeups, and explicitly change this-and-future recurrence without rewriting history.

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

### Next stage

- Add the fees and payments domain with monthly, term, package, and per-session charging patterns.
- Track due and paid amounts, currencies, payment methods, adjustments, and optional receipts.
- Surface fee reminders and child-level due summaries without coupling payments to attendance.

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
