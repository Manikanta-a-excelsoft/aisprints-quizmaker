Date created: Aug 22, 2026
Date last modified: Aug 22, 2026 (night - Phase 3 COMPLETED; three auth endpoints built,
verified by 90 tests, a clean build, and manual curl against local D1)

# Register, Login, Logout - Technical PRD

## Overview/Problem

QuizMaker will let teachers build and maintain a bank of multiple-choice questions, but
today the application is an unmodified starter with no database, no accounts, and no way
to tell one teacher from another. Several teachers will use the same deployment, so every
feature that follows depends on each teacher having their own identity and a way to prove
it. Without this sprint there is nowhere to store a teacher, no way for one to return to
their own work, and no foundation for the MCQ features planned next.

This sprint builds only the account layer: a teacher can register, log in, log out, and
land on a placeholder MCQ page that proves the flow works end to end.

---

## Hypothesis

We believe that giving teachers their own registered account with a working login and
logout flow will establish the identity foundation that every later QuizMaker feature
needs, while keeping this sprint small enough to review carefully at every step.

---

## Scope

### In Scope

- A Cloudflare D1 database bound as `DB` in `wrangler.jsonc`, created locally.
- A migration under `migrations/` creating a `users` table with `id`, `first_name`,
  `last_name`, `username` (unique), `email` (unique), `password_hash`, `created_at`,
  `updated_at`, plus indexes on `username` and `email`.
- A user service in `src/lib/services/` exposing `createUser`, `updateUser`,
  `deleteUser`, `findUserById`, `findUserByUsername`, and `findUserByEmail`.
- `POST /api/auth/register` returning `201` on success, `400` on validation or duplicate
  errors, `500` on unexpected failure.
- `POST /api/auth/login` returning `200` on success, `401` on invalid credentials, `400`
  on malformed input, `500` on unexpected failure.
- `POST /api/auth/logout` returning a simple success response.
- Password hashing with Web Crypto PBKDF2-SHA256 and a random per-user salt so that
  `password_hash` never contains plaintext (see "Decisions").
- Register, login, and logout UI built from shadcn/ui components already in
  `src/components/ui/`, styled with the existing Tailwind v4 theme tokens.
- A stub MCQ page that displays placeholder copy indicating the real question builder
  arrives next sprint.
- The home route `/` redirecting to `/login` instead of rendering the starter page.
- A Vitest harness with an `npm test` script, and test-driven development in every
  implementation phase.

### Out of Scope

Explicitly not built in this sprint, deferred to a later one:

- **Session management of any kind.** No cookies, no server-side session store, no
  token-based auth, no `middleware.ts` route protection. This was decided deliberately
  to keep the sprint small; see "Known Limitations" for what this means in practice.
- JWT tokens.
- OAuth and social login (Google, Microsoft, and so on).
- MCQ question creation, editing, or the question bank itself. The MCQ page is a stub.
- Password reset and forgot-password flows.
- Email verification.
- Role-based access control and any notion of an admin.
- Multi-teacher collaboration or sharing.
- Remote D1 migrations and any deployment to Cloudflare.

### Cut

Considered during planning and deliberately removed:

- **A minimal identity cookie to gate the MCQ page** - Considered so that `/mcq` could
  reject visitors who had not logged in. Cut because it is session management, which the
  brain-dump ruled out for this sprint. The consequence is recorded under "Known
  Limitations" and closing it is the obvious first candidate for next sprint.
- **`middleware.ts` route protection** - Cut for the same reason. With no session there
  is nothing for middleware to read, so it would provide no real protection.
- **Base64 password encoding** - Mentioned in passing as a quick placeholder. Cut because
  base64 is reversible encoding, not hashing, and would violate the requirement that
  passwords are never recoverable from the database.
- **`react-hook-form`** - Cut because `shadcn.mdc` forbids introducing it without
  approval and the `field` primitives cover three simple forms.
- **`@cloudflare/vitest-pool-workers`** - Cut for this sprint. The testing skill warns it
  changes how the whole suite runs. Mocked D1 at the module boundary is enough here.

---

## Principles Applied

How the twelve aisprints principles apply to this sprint:

| # | Principle | How this sprint applies it |
|---|-----------|----------------------------|
| 01 | Start with clear intent & context | This PRD states the identity problem, hypothesis, and in/out scope before any auth code is written. |
| 02 | Brain-dump requirements | Register, login, logout, D1 schema, API shapes, and the no-session constraint were captured from the sprint brain-dump and organized here. |
| 03 | Establish rules/guardrails | Work follows `AGENTS.md`, `d1.mdc`, `nextjs.mdc`, `shadcn.mdc`, and the testing skill — including no cookies, JWT, or session store. |
| 04 | Phased implementation plan | Five phases from database setup through verification, each with explicit deliverables and a stop-for-review gate. |
| 05 | Iterate with precision | One phase per turn; each phase completes only its objective before the next begins. |
| 06 | Test early and often | Every implementation phase uses Vitest TDD: failing test first, then implementation, then green. |
| 07 | Communicate clearly with AI agent | Structured prompts, explicit scope boundaries, and phase-by-phase approval keep the agent aligned with intent. |
| 08 | Refine each layer systematically | Database, service, API, UI, and hashing are built in order so each layer rests on a tested foundation. |
| 09 | Maintain continuous documentation | This PRD is updated at the end of every phase with status, file references, and troubleshooting entries. |
| 10 | Deploy frequently | Local verification runs every phase; `npm run preview` on the Workers runtime is required in Phase 5 before handoff. |
| 11 | Reflect, learn, adjust | Known Limitations and the Cut section record deliberate trade-offs (no session) so they are not mistaken for bugs. |
| 12 | Up your own game | Using AI for PRD drafting, TDD scaffolding, and rule-aware implementation while reviewing each phase personally. |

---

## Orchestrator Workflow

Manikanta orchestrates this sprint; the agent implements one phase at a time.

- **Branch**: All work happens on `feature/register-login-logout`, branched from `main`.
  Nothing merges to `main` during the sprint.
- **Phase gates**: The agent stops at the end of every phase and waits for Manikanta's
  review. Manikanta says **"go Phase N"** before the next phase begins.
- **Commits and pushes**: The agent commits and pushes to `feature/register-login-logout`
  only after Manikanta explicitly approves a completed phase — never unprompted, never to
  `main`.
- **Course submission**: At the end of Phase 5, after verification is complete, Manikanta
  exports this Cursor chat transcript for course submission.

---

## Technical Requirements

### Database Schema

One table. `id` uses D1's SQLite `randomblob` default so the service does not need a UUID
dependency.

```sql
-- migrations/0001_create_users_table.sql

CREATE TABLE users (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_email    ON users (email);
```

Notes on the schema:

- `password_hash` stores only a derived hash. Plaintext passwords are never written to
  the database, never logged, and never returned in an API response.
- SQLite already creates an implicit index to enforce each `UNIQUE` constraint, so the two
  explicit `CREATE INDEX` statements are strictly redundant for lookup performance. They
  are included because the requirements asked for named indexes on `username` and
  `email`, and because a named index is easier to reason about later. This is a
  deliberate, harmless duplication rather than an oversight.
- `updated_at` is not maintained by SQLite automatically. `updateUser` must set it
  explicitly on every write.

Per `d1.mdc`, the migration is created with
`npx wrangler d1 migrations create <db> create_users_table` and applied with
`npx wrangler d1 migrations apply <db> --local`. **The remote database is never touched.**

### API Endpoints

All three route handlers live under `src/app/api/auth/`. Every handler validates its
input before use, treats all input as untrusted, and never returns `password_hash` in a
response body.

#### POST /api/auth/register

**Request Body:**
```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "ada",
  "email": "ada@example.com",
  "password": "correct horse battery staple"
}
```

**Response:**
- Success (201): `{ "user": { "id", "firstName", "lastName", "username", "email", "createdAt", "updatedAt" } }`
  — the shape `toPublicUser()` produces, which also carries `updatedAt`
- Error (400): `{ "error": "Validation failed", "fields": { "email": "Must be a valid email address" } }`
- Error (400): `{ "error": "Username already taken" }` or `{ "error": "Email already registered" }`
- Error (500): `{ "error": "Could not create account" }`

Validation rules: all five fields required and non-empty; `email` must be a valid email
address; `username` between 3 and 32 characters; `password` at least 8 characters. A
duplicate `username` or `email` returns `400`, not `500`, since it is a client-correctable
problem.

#### POST /api/auth/login

**Request Body:**
```json
{
  "username": "ada",
  "password": "correct horse battery staple"
}
```

**Response:**
- Success (200): `{ "user": { ... } }` — the same `toPublicUser()` shape register returns,
  including `createdAt` and `updatedAt`
- Error (400): `{ "error": "Validation failed", "fields": { ... } }`
- Error (401): `{ "error": "Invalid credentials" }`
- Error (500): `{ "error": "Could not sign in" }`

An unknown username and a wrong password both return the same `401` with the same message,
so the endpoint does not reveal which usernames exist. Because there is no session, a
successful login returns the user object and nothing else - no cookie is set and no token
is issued.

#### POST /api/auth/logout

**Request Body:** none.

**Response:**
- Success (200): `{ "success": true }`

With no session to destroy, this endpoint has no server-side effect. It exists so the UI
has a real endpoint to call and so the sprint's logout flow is complete and testable. This
is recorded honestly rather than dressed up as more than it is.

### User Interface Requirements

Built from the shadcn/ui components already installed (`button`, `card`, `field`, `input`,
`label`, `separator`). Forms use the Base UI `field` primitives - `FieldSet`,
`FieldGroup`, `Field`, `FieldLabel`, `FieldDescription`, `FieldError` - since there is no
`Form` component under Base UI. Colors come from the theme tokens in
`src/app/globals.css` (`bg-background`, `text-muted-foreground`, `border-destructive`);
no hard-coded hex values. Class names compose through `cn()` from `@/lib/utils`.

#### Home (/)

- Server Component that immediately `redirect("/login")`.
- Replaces the current Next.js starter content in `src/app/page.tsx`.

#### Register (/register)

- Card-wrapped sign-up form with fields: first name, last name, username, email,
  password.
- Client-side validation mirrors the server rules; server errors remain authoritative and
  are surfaced through `FieldError`.
- Submits to `POST /api/auth/register`. On `201`, navigates to `/mcq`. On `400`, renders
  per-field errors and the top-level message.
- Submit button disabled while the request is in flight.
- Link to `/login` for teachers who already have an account.

#### Login (/login)

- Card-wrapped form with fields: username, password.
- Submits to `POST /api/auth/login`. On `200`, navigates to `/mcq`. On `401`, shows
  "Invalid credentials" without indicating which field was wrong.
- Link to `/register`.

#### MCQ stub (/mcq)

- Placeholder page stating that multiple-choice question creation arrives in the next
  sprint. No question data, no forms, no persistence.
- Renders a logout control.

#### Logout

- A client component button that calls `POST /api/auth/logout` and then navigates to
  `/login`.

---

## Implementation Phases

Five phases. Work stops at the end of each one for Manikanta's review before the next
begins. Every phase follows the same test-driven loop: write failing Vitest tests first,
confirm they fail for the right reason, implement until green, then update this PRD.

### Phase 1: Database and Test Setup - COMPLETED

**Objective**: A running test harness and a `users` table applied to the local D1
database, so later phases have somewhere to write tests and store users.

**What was built** (Aug 22, 2026):

1. Installed the approved Vitest devDependencies. `@vitejs/plugin-react` had to be pinned
   to `^5` (resolved to 5.2.0); see Troubleshooting.
2. `vitest.config.ts` with `vite-tsconfig-paths` for the `@/` alias, `globals: true`, and
   two deviations from the testing skill forced by this machine: `environment: "node"`
   instead of `jsdom`, and `pool: "threads"` instead of the default `forks`. See
   Troubleshooting.
3. Added `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json`.
4. Created the D1 database: `npx wrangler d1 create quizmaker-db` returned database id
   `5090552a-6ebc-46b3-97d1-32c5dbb58073` in region APAC. Added the `d1_databases` block
   to `wrangler.jsonc` by hand with binding `DB` and `migrations_dir: "migrations"`.
   Wrangler suggested the binding name `quizmaker_db`; `DB` is used instead because
   `d1.mdc` requires it.
5. **Red**: wrote `migrations/migrations.test.ts`, a text contract over the migration SQL.
   Confirmed 16 tests failing with "No users migration found in migrations/" before the
   migration existed.
6. **Green**: created the migration with
   `npx wrangler d1 migrations create quizmaker-db create_users_table`, filled in the SQL
   from the schema above, and all 16 tests passed.
7. Added `migrations/schema.test.ts`, which executes the migration against an in-memory
   SQLite database using Node 24's built-in `node:sqlite` and asserts real behavior:
   column list, NOT NULL flags, both named indexes, generated `id` and timestamps,
   distinct ids, and that duplicate usernames, duplicate emails, and a missing
   `password_hash` are all rejected. It was added while the local D1 apply was still
   blocked, as the only executable proof the SQL was valid, and it is worth keeping now
   that D1 has accepted the migration because it exercises constraint behavior that a
   migration log cannot show. It was written after the migration rather than red-first; its
   ability to fail was verified by temporarily removing `UNIQUE` from `username`, which
   failed a test in both files, then restoring it.

8. Applied the migration to the local database with
   `npx wrangler d1 migrations apply quizmaker-db --local`. This was initially blocked by
   a `workerd` crash; Manikanta cleared it by upgrading Wrangler to 4.125.0, which is now
   pinned as `wrangler: "^4.125.0"` in `package.json`. See Troubleshooting.
9. Ran `npm run cf-typegen`, which now completes through "Runtime types generated" and
   writes `DB: D1Database` into `cloudflare-env.d.ts`, so `env.DB` is typed for Phase 2.

**Verified**:
- `npm test` - 33 tests passing in 2 files, about 1 second
- `npm run lint` - clean, exit 0
- `npx tsc --noEmit` - clean, exit 0
- `npx wrangler d1 migrations list quizmaker-db --local` - "No migrations to apply!",
  meaning `0001_create_users_table.sql` is already applied locally
- Queried the local database directly: the `users` table exists with 8 columns, and both
  `idx_users_username` and `idx_users_email` are present alongside the three
  `sqlite_autoindex` entries SQLite creates for the primary key and the two unique columns
- `cloudflare-env.d.ts` line 5 declares `DB: D1Database`

**Deliverables**:
- `vitest.config.ts`, `test` and `test:watch` scripts - done
- `d1_databases` binding in `wrangler.jsonc` - done
- Regenerated `cloudflare-env.d.ts` with `DB: D1Database` - done
- `migrations/0001_create_users_table.sql` - done
- `migrations/migrations.test.ts` passing - done
- `migrations/schema.test.ts` passing - done, added beyond the original plan
- Migration applied to local D1 with `--local` only - done; the remote database has never
  been migrated

**Open follow-up for Phase 4**: `vitest.config.ts` uses `pool: "threads"` and
`environment: "node"` because the default `forks` pool would not start a worker before the
Wrangler upgrade. That failure may have shared a root cause with the `workerd` crash, so it
is worth re-testing the defaults when the first jsdom component test is written. The jsdom
setup cost of roughly 45 seconds was measured separately and is a real reason to keep
opting in per file regardless.

### Phase 2: User Service - COMPLETED

**Objective**: All database access for users lives behind one testable module, so no route
handler or component ever touches `env.DB` directly.

**What was built** (Aug 22, 2026):

1. **Red**: wrote `src/lib/services/user-service.test.ts` first, 29 tests. Confirmed the
   whole suite failed with `Cannot find module '/src/lib/services/user-service'` before any
   implementation existed, while Phase 1's 33 tests kept passing.
2. **Green**: implemented `src/lib/services/user-service.ts` exporting the six functions
   plus supporting types. All 62 tests pass.

**Exported surface** (`src/lib/services/user-service.ts`):

| Export | Signature | Notes |
|---|---|---|
| `createUser` | `(input: CreateUserInput) => Promise<User>` | `INSERT ... RETURNING`, so the generated `id` and timestamps come back in one round trip |
| `findUserById` | `(id: string) => Promise<User \| null>` | `null` when nothing matches |
| `findUserByUsername` | `(username: string) => Promise<User \| null>` | `null` when nothing matches |
| `findUserByEmail` | `(email: string) => Promise<User \| null>` | `null` when nothing matches |
| `updateUser` | `(id: string, changes: UpdateUserInput) => Promise<User \| null>` | Writes only the supplied columns, always sets `updated_at`, `null` if the id does not exist |
| `deleteUser` | `(id: string) => Promise<boolean>` | `true` only when a row was actually removed, read from `meta.changes` |
| `toPublicUser` | `(user: User) => PublicUser` | Strips `passwordHash`; the single safe way for Phase 3 to build a response body |
| `DuplicateUserError` | `class`, carries `field: "username" \| "email"` | Lets Phase 3 answer 400 rather than 500 |
| `User`, `PublicUser`, `CreateUserInput`, `UpdateUserInput` | types | `User` is the full row including `passwordHash` |

**Design decisions worth recording**:

- `User` includes `passwordHash` because Phase 3's login has to compare against the stored
  hash, and this module is the only way to reach the database. `PublicUser` and
  `toPublicUser()` exist so a route never has to hand-strip the field. The acceptance
  criterion about responses never carrying `password_hash` is enforced at the route layer
  in Phase 3, using `toPublicUser`.
- D1 reports a unique violation as an error message rather than a typed error, so
  `asDuplicateUserError` parses the column out of
  `UNIQUE constraint failed: users.<column>` and converts it to `DuplicateUserError`.
  Anything else is rethrown untouched, so a real fault still becomes a 500.
- `updateUser` builds its `SET` clause dynamically but numbers placeholders as it goes, so
  a three-column update produces `?1, ?2, ?3` with the id as `?4`. Column names come from a
  fixed internal list, never from caller input. An update with no fields throws instead of
  emitting invalid SQL.

**Testing notes**:

- `@opennextjs/cloudflare` is mocked so `getCloudflareContext()` yields a fake `env.DB`.
  No test touches a real database; the fake records every statement and its bindings and
  returns queued rows, run results, or errors.
- The fake's `first()` throws on use, which turns the `d1.mdc` rule into something the
  suite enforces rather than something a reviewer has to spot. Verified by temporarily
  switching `findUserBy` to `first()`, which failed the lookup tests with
  "first() must not be used", then reverting.
- Two convention tests assert across every recorded statement that no anonymous `?`
  placeholder is ever used, and that a multi-column update numbers placeholders
  consecutively from `?1`.

**Verified**:
- `npm test` - 62 tests passing in 3 files (29 new, 33 from Phase 1)
- `npm run lint` - clean, exit 0
- `npx tsc --noEmit` - clean, exit 0

**Deliverables**:
- `src/lib/services/user-service.ts` - done
- `src/lib/services/user-service.test.ts` passing - done
- Phase 2 marker and code references updated here - done

**Note**: Password hashing is *not* part of this phase. The service accepts an
already-hashed `passwordHash` and stores it verbatim. Hashing arrives in Phase 4.

### Phase 3: Auth API Routes - COMPLETED

**Objective**: The three HTTP endpoints work and return the exact status codes specified
above, verified by tests and by hand with curl.

**What was built** (Aug 22, 2026):

1. `zod` was already installed at `^4.4.3`, so nothing new was added. Zod 4 exposes
   `z.email()` as a top-level validator, which is what the schemas use rather than the
   deprecated `z.string().email()`.
2. **Red**: wrote the three route test files first, 28 tests. Confirmed all three suites
   failed with `Cannot find module '/src/app/api/auth/<route>/route'` while the 62 earlier
   tests kept passing.
3. **Green**: implemented the three route handlers plus two supporting modules. All 90
   tests pass.

**Files**:

- `src/app/api/auth/register/route.ts` - 201 on success, 400 on validation or duplicate,
  500 otherwise
- `src/app/api/auth/login/route.ts` - 200 on success, 401 on any credential failure, 400 on
  malformed input, 500 otherwise
- `src/app/api/auth/logout/route.ts` - 200 with `{ "success": true }`, no side effects
- `src/lib/validation/auth.ts` - `registerSchema`, `loginSchema`, and `fieldErrors()`
- `src/lib/password-placeholder.ts` - temporary hashing, replaced in Phase 4
- Colocated tests: `route.test.ts` beside each route

**Design decisions worth recording**:

- Schemas live in `src/lib/validation/auth.ts` rather than inside each route so the Phase 4
  forms can mirror exactly the rules the server enforces instead of restating them.
- `loginSchema` only requires both fields to be non-empty. Applying the registration
  password rules at login would advertise the password policy and would lock out existing
  accounts if the rules later change.
- `fieldErrors()` keeps the first Zod issue per field, producing the flat
  `{ "email": "Must be a valid email address" }` shape the API contract documents.
- Both credential failures return one shared `INVALID_CREDENTIALS` constant, so an unknown
  username and a wrong password are indistinguishable. A test asserts the two responses are
  byte-identical.
- 500 responses return a fixed message and never the underlying error. The real error goes
  to `console.error` with a short label and no request body, so no password reaches the
  logs.
- Routes call only the user service and shape every success body through `toPublicUser()`,
  so `passwordHash` cannot reach a client by omission.
- Handlers return the standard Web `Response.json` rather than `NextResponse`, which keeps
  the tests free of a `next/server` import and works identically on the Workers runtime.

**Testing notes**:

- The user service is mocked with `importOriginal`, so `DuplicateUserError` and
  `toPublicUser` are the real implementations while `createUser` and `findUserByUsername`
  are stubs. Response shaping is therefore genuinely exercised rather than mocked.
- `@opennextjs/cloudflare` is mocked to throw if called, so a route test that accidentally
  reached a Cloudflare binding would fail loudly instead of silently hitting a database.
- The login fixture computes its stored hash with the real placeholder, so the 200 path
  proves verification works rather than asserting against a hand-written constant.

**Verified**:
- `npm test` - 90 tests passing in 6 files (28 new, 62 from Phases 1 and 2)
- `npm run build` - succeeded; all three routes listed as dynamic (`ƒ`) functions
- `npm run lint` - clean, exit 0
- Manual curl against `npm run dev` on the real local D1: register returned 201 with a
  generated id and timestamps, a repeat registration returned 400
  `{"error":"Email already registered"}`, login with the correct password returned 200 with
  the same user, a wrong password and an unknown username both returned 401
  `{"error":"Invalid credentials"}`, an all-invalid body returned 400 with four named
  fields, and logout returned 200 `{"success":true}`
- Queried the local database afterwards: the stored value is
  `sha256-placeholder$c4bbcb1f...`, confirming no plaintext password was written

**Deliverables**:
- `zod` in `package.json` dependencies - already present, `^4.4.3`
- Zod schemas for the register and login request bodies - done
- The three route handlers and their colocated tests, passing - done
- Working curl commands recorded in this PRD - done, see "Manual API Verification"
- Phase 3 marker updated - done

**Note on the hashing placeholder**: `src/lib/password-placeholder.ts` is an unsalted
single-round SHA-256. It is one-way, so no plaintext password is stored, but it is not
acceptable password storage: equal passwords produce equal hashes and it is cheap to attack
with a rainbow table. Phase 4 replaces it with `src/lib/password.ts` using Web Crypto
PBKDF2-SHA256 and a random per-user salt, deletes this file, and updates both routes. Any
account registered before that point has a `sha256-placeholder$` hash and must be
recreated; the prefix makes those rows easy to find.

### Phase 4: Auth UI and Password Hashing - PLANNED

**Objective**: A teacher can register and log in through the browser, and the database
contains only hashed passwords.

**Tasks**:
1. **Red**: write `src/lib/password.test.ts` asserting that hashing the same password
   twice yields different stored values (unique salt), that verification succeeds for the
   correct password, that it fails for a wrong password, and that the plaintext never
   appears in the stored string.
2. **Green**: implement `src/lib/password.ts` with `hashPassword` and `verifyPassword`
   using Web Crypto PBKDF2-SHA256, and wire them into the register and login routes.
3. **Red**: write smoke tests for the register and login client components asserting the
   fields render with accessible labels and that a validation error is displayed, queried
   by role and accessible name per the testing skill.
4. **Green**: build `src/app/register/page.tsx`, `src/app/login/page.tsx`,
   `src/app/mcq/page.tsx`, and the logout button, from the shadcn blocks Manikanta
   provides, adapted to the installed Base UI components.
5. Replace `src/app/page.tsx` with a redirect to `/login`.
6. Run `npm test`, `npm run lint`, `npm run build`.

**Deliverables**:
- `src/lib/password.ts` and its tests
- Register, login, and MCQ stub pages plus the logout control
- `src/app/page.tsx` redirecting to `/login`
- Phase 4 marker updated, including which shadcn block each page came from

### Phase 5: Verification and Documentation - PLANNED

**Objective**: Prove the sprint works rather than assert it, and leave the documentation
accurate for whoever picks this up next.

**Tasks**:
1. Run `npm test`, `npm run lint`, `npm run build`, and `npm run preview`, and report the
   actual output of each. `npm run preview` matters because `npm run dev` runs on Node and
   hides Workers-specific problems.
2. Walk the full flow in a browser: register, land on the MCQ stub, log out, log in again
   with the same credentials.
3. Confirm by querying the local D1 database that `password_hash` holds no plaintext.
4. Mark every acceptance criterion below, and mark all five phases COMPLETED.
5. Fill in "Technical Implementation Details" and "Troubleshooting Guide" with what was
   actually built and what actually broke.
6. Replace the placeholder Project section in `AGENTS.md` with a current description of
   QuizMaker, since that file is loaded into every future conversation and a stale
   description misleads all of them.
7. Once verification is complete and this PRD is updated, prompt Manikanta to export the
   Cursor chat transcript for course submission. The export is Manikanta's to run; the
   agent's job is to confirm the sprint is genuinely finished first so the transcript
   captures a complete sprint rather than a half-verified one.
8. Do not deploy and do not migrate the remote database. Both are Manikanta's to run.

**Deliverables**:
- Recorded command output for test, lint, build, and preview
- This PRD fully updated with code references
- Updated `AGENTS.md` Project section
- Confirmation that verification is complete, so Manikanta can export the chat transcript
  for course submission

---

## Manual API Verification

Start the dev server with `npm run dev`. It binds `3000` when free and falls back to `3001`
or higher, so read the port from its output and substitute it below. Bindings work in dev
because `next.config.ts` calls `initOpenNextCloudflareForDev()`, so these requests hit the
real local D1.

**Windows PowerShell.** `curl` is an alias for `Invoke-WebRequest`, so call `curl.exe`
explicitly. PowerShell also splits an inline JSON body on the spaces inside a password, so
write the body to a file and send it with `--data-binary "@file"`. Inline `-d` with a
space-containing password silently sends a broken body and returns 400.

```powershell
$body = "$env:TEMP\reg.json"
Set-Content -Path $body -NoNewline -Value '{"firstName":"Ada","lastName":"Lovelace","username":"ada","email":"ada@example.com","password":"correct horse battery staple"}'

# Register: expect 201
curl.exe -s -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" --data-binary "@$body" -w "`nHTTP %{http_code}`n"

# Same request again: expect 400, "Username already taken" or "Email already registered"
curl.exe -s -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" --data-binary "@$body" -w "`nHTTP %{http_code}`n"

$login = "$env:TEMP\login.json"
Set-Content -Path $login -NoNewline -Value '{"username":"ada","password":"correct horse battery staple"}'

# Login: expect 200 with the user object
curl.exe -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" --data-binary "@$login" -w "`nHTTP %{http_code}`n"

# Wrong password and unknown username: both expect 401 "Invalid credentials"
curl.exe -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"ada\",\"password\":\"wrong\"}" -w "`nHTTP %{http_code}`n"
curl.exe -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"nobody\",\"password\":\"whatever\"}" -w "`nHTTP %{http_code}`n"

# Validation failure: expect 400 with a message per invalid field
curl.exe -s -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d "{\"firstName\":\"\",\"lastName\":\"L\",\"username\":\"ab\",\"email\":\"nope\",\"password\":\"short\"}" -w "`nHTTP %{http_code}`n"

# Logout: expect 200 {"success":true}
curl.exe -s -X POST http://localhost:3000/api/auth/logout -w "`nHTTP %{http_code}`n"
```

**bash or zsh**, where single quotes keep the body intact:

```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Ada","lastName":"Lovelace","username":"ada","email":"ada@example.com","password":"correct horse battery staple"}' \
  -w "\nHTTP %{http_code}\n"

curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"ada","password":"correct horse battery staple"}' \
  -w "\nHTTP %{http_code}\n"

curl -s -X POST http://localhost:3000/api/auth/logout -w "\nHTTP %{http_code}\n"
```

Confirm nothing sensitive was stored, and remember each username and email can only be
used once:

```powershell
npx wrangler d1 execute quizmaker-db --local --command "SELECT username, password_hash FROM users ORDER BY created_at DESC LIMIT 5"
```

---

## Technical Implementation Details

To be filled in as code is written. Expected shape:

### Key Files

Built in Phase 1:

- `vitest.config.ts` - test harness; `node` environment, `threads` pool, `@/` alias
- `migrations/0001_create_users_table.sql` - the `users` table, constraints, and indexes
- `migrations/migrations.test.ts` - text contract over the migration SQL, 16 tests
- `migrations/schema.test.ts` - executes the migration against `node:sqlite` and asserts
  real constraint behavior, 17 tests
- `wrangler.jsonc` - `d1_databases` block binding `quizmaker-db` as `DB`

Built in Phase 2:

- `src/lib/services/user-service.ts` - the only module that touches `env.DB` for users;
  six functions plus `toPublicUser` and `DuplicateUserError`
- `src/lib/services/user-service.test.ts` - 29 tests against a fake D1 that records every
  statement and rejects `first()`

Built in Phase 3:

- `src/app/api/auth/register/route.ts` - account creation endpoint
- `src/app/api/auth/login/route.ts` - credential check endpoint
- `src/app/api/auth/logout/route.ts` - logout acknowledgement
- `src/lib/validation/auth.ts` - Zod schemas shared with the Phase 4 forms
- `src/lib/password-placeholder.ts` - temporary SHA-256 hashing, deleted in Phase 4
- `route.test.ts` beside each route - 28 tests with the user service mocked

Planned for later phases:
- `src/lib/password.ts` - hashing and verification
- `src/app/api/auth/register/route.ts` - account creation endpoint
- `src/app/api/auth/login/route.ts` - credential check endpoint
- `src/app/api/auth/logout/route.ts` - logout acknowledgement
- `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/app/mcq/page.tsx` - UI
- `src/app/page.tsx` - redirect to `/login`

### Implementation Patterns

D1 access, per `d1.mdc` - numbered placeholders, and read `results[0]` rather than
`first()`:

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function findUserByUsername(username: string): Promise<User | null> {
  const { env } = await getCloudflareContext();
  const { results } = await env.DB.prepare(
    "SELECT id, first_name, last_name, username, email, created_at, updated_at " +
      "FROM users WHERE username = ?1"
  )
    .bind(username)
    .all<UserRow>();

  return results[0] ? toUser(results[0]) : null;
}
```

### Important Notes

- D1 is server-only. A database module must never be imported into a `'use client'`
  component.
- `getCloudflareContext()` does not work under jsdom; tests mock it.
- Wrangler's local D1 is a local SQLite file. It is not the remote database and is not
  shared with anyone else.

---

## Known Limitations

Recorded deliberately so they are not mistaken for bugs:

- **There is no authentication after login.** With no cookie, no session store, and no
  token, the server cannot tell one request from another. `/mcq` is a public route -
  anyone who types the URL reaches it without logging in, and a browser reload loses any
  sense of who is signed in. Login therefore verifies credentials and navigates; it does
  not establish a session.
- **Logout is a formality.** It returns `{ "success": true }` and clears nothing, because
  there is nothing to clear.
- **This is not production-ready auth.** Closing it means adding real session management,
  which is the natural first task of the next sprint.

---

## Decisions

`AGENTS.md` requires proposing a dependency and explaining why before adding it. Every
dependency this sprint needs has now been approved by Manikanta. Anything not listed here
still requires a fresh conversation before it is installed.

### Approved

- **Vitest and its companions** - approved Aug 22, 2026, installed in Phase 1 before any
  test runs. Package list: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`,
  `@testing-library/user-event`, `jsdom`, and `vite-tsconfig-paths`, all as
  devDependencies. `vite-tsconfig-paths` is what makes `@/` imports resolve in tests;
  without it every `@/lib/...` import fails. `@testing-library/user-event` is for the
  Phase 4 component tests.
- **`zod` for route handler input validation** - approved Aug 22, 2026, installed in
  Phase 3 as a runtime dependency. `nextjs.mdc` requires validating all route handler and
  Server Action input with a Zod schema and treating every input as untrusted, so this
  follows the rule rather than diverging from it. Later sprints will need it anyway. The
  alternative, hand-written validation for the three auth endpoints, is rejected.
- **Password hashing: Web Crypto PBKDF2-SHA256** with a random per-user salt - approved
  Aug 22, 2026, implemented in Phase 4. Chosen because it adds no dependency and runs
  natively on the Workers runtime, unlike `bcryptjs`, which is CPU-heavy inside a Worker.
  Base64 or any other reversible encoding is not acceptable.

---

## Acceptance Criteria

- [x] A `users` table exists in the local D1 database with `id`, `first_name`,
      `last_name`, `username`, `email`, `password_hash`, `created_at`, and `updated_at`
      (applied to local D1 and confirmed by direct query: 8 columns present)
- [x] `username` and `email` each reject duplicates at the database level (proven by
      `migrations/schema.test.ts` executing the migration; the same `UNIQUE` constraints
      are present in the applied local D1 schema)
- [x] Named indexes exist on `username` and `email` (`idx_users_username` and
      `idx_users_email` confirmed in the applied local D1 schema)
- [x] The migration was applied with `--local` only; the remote database is untouched
- [x] `npm test` runs and every test passes
- [x] Each phase's tests were written before its implementation and observed failing first
      (Phase 1: `migrations.test.ts` red first; `schema.test.ts` was added after and had
      its failure mode verified separately. Phase 2: `user-service.test.ts` red first)
- [x] The user service covers create, update, delete, and find by id, username, and email,
      each with passing tests against a mocked D1
- [x] Every user query uses a prepared statement with numbered placeholders and no
      concatenated user input (asserted across every recorded statement by a convention
      test in `src/lib/services/user-service.test.ts`)
- [x] `POST /api/auth/register` returns 201 with the created user on success (tests plus
      manual curl)
- [x] `POST /api/auth/register` returns 400 for invalid input and for a duplicate username
      or email
- [x] `POST /api/auth/login` returns 200 with the user for correct credentials
- [x] `POST /api/auth/login` returns 401 for both an unknown username and a wrong
      password, with an identical message (asserted byte-identical in
      `src/app/api/auth/login/route.test.ts`)
- [x] `POST /api/auth/logout` returns a success response
- [x] No API response body and no log line contains `password_hash` or a plaintext
      password (responses shaped through `toPublicUser`; `console.error` receives a label
      and the error only, never the request body)
- [x] Querying the local database confirms `password_hash` is a hash, not the password
      (currently the Phase 3 placeholder hash; to be re-confirmed after Phase 4 swaps in
      PBKDF2)
- [ ] Hashing the same password twice produces different stored values (Phase 4; the
      current placeholder is unsalted and deliberately does not satisfy this)
- [ ] `/register` and `/login` render with shadcn components and show field-level errors
- [ ] A teacher can register in the browser and land on the MCQ stub
- [ ] The MCQ stub states that question creation arrives next sprint and creates no
      questions
- [ ] Logging out returns the teacher to `/login`, and logging back in with the same
      credentials succeeds
- [ ] `/` redirects to `/login` and the Next.js starter page is gone
- [ ] `npm run lint` passes with no new errors
- [ ] `npm run build` succeeds
- [ ] `npm run preview` serves the app on the Workers runtime and the full flow works
      there
- [ ] No cookie is set, no token is issued, and no session store exists anywhere in the
      codebase
- [ ] This PRD's phase markers and code references match what was actually built

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Registration completes | A new teacher registers in under 60 seconds | Manual walkthrough during Phase 5 |
| Passwords never stored in plaintext | 0 plaintext passwords | Query `password_hash` for every row in the local database |
| Test coverage of the auth surface | Every service method and every documented status code has a test | Count tests against the endpoint and method lists above |
| Duplicate accounts prevented | 100% of duplicate username or email attempts rejected with 400 | Automated tests plus a manual repeat registration |
| Credential errors do not leak account existence | Unknown username and wrong password are indistinguishable | Compare both 401 response bodies |
| Sprint stays in scope | 0 out-of-scope features built | Review the Out of Scope list against the diff at Phase 5 |

---

## Dependencies

### External Dependencies

- Cloudflare D1 - the SQLite database holding the `users` table
- Wrangler CLI - creating the database, running migrations, generating binding types.
  Requires `npx wrangler login`; verify with `npx wrangler whoami`
- Cloudflare Workers runtime - what `npm run preview` exercises, via `@opennextjs/cloudflare`

### Approved Packages

See "Decisions" for why each is approved.

- `zod` - runtime dependency for route handler input validation, used in Phase 3. Already
  present in `package.json` at `^4.4.3` as of Phase 1; it was installed ahead of the phase
  that needs it
- `vitest`, `@vitejs/plugin-react`, `@testing-library/react`,
  `@testing-library/user-event`, `jsdom`, `vite-tsconfig-paths` - devDependencies,
  installed in Phase 1. `@vitejs/plugin-react` is pinned to `^5` because 6.x conflicts
  with the Babel 7 that `shadcn` holds; see Troubleshooting
- Password hashing needs no package; PBKDF2-SHA256 comes from Web Crypto

### Internal Dependencies

- `src/lib/services/user-service.ts` - the only module that touches `env.DB` for users
- `src/lib/password.ts` - hashing and verification, consumed by the register and login routes
- `src/components/ui/*` - the installed shadcn/Base UI components used by all three pages
- `src/lib/utils.ts` - the existing `cn()` helper for composing Tailwind classes
- `src/app/globals.css` - Tailwind v4 theme tokens

### Bindings and Environment

- `DB` - the D1 binding, added to `wrangler.jsonc` in Phase 1 and typed by
  `npm run cf-typegen`
- No new environment variables or secrets are expected. If one becomes necessary, the
  local value goes in `.dev.vars` and an empty placeholder is added to
  `.dev.vars.example`, per `AGENTS.md`

---

## Risks and Mitigation

### Technical Risks

- **Risk**: A no-session design invites someone to reach for a cookie mid-sprint, quietly
  expanding scope.
- **Mitigation**: The cookie is recorded under Cut with its reason. Any change of mind is
  Manikanta's call, made explicitly, not a drive-by addition during a phase.

- **Risk**: `npm run dev` runs on Node and hides Workers-specific failures, so D1 access
  can look fine locally and break on the real runtime.
- **Mitigation**: Phase 5 requires `npm run preview` on the Workers runtime, and its
  actual output is reported rather than assumed.

- **Risk**: Mocked D1 in unit tests can drift from real D1 behavior - `first()` in
  particular behaves inconsistently between local and remote.
- **Mitigation**: Follow `d1.mdc` and always read `results[0]` from `all()`. Back the
  mocked tests with the manual curl and browser checks in Phases 3 and 5.

- **Risk**: A hashing algorithm chosen for familiarity could be too CPU-heavy for a
  Worker's limits.
- **Mitigation**: Settled deliberately rather than by habit. PBKDF2-SHA256 via Web Crypto
  is approved because it runs natively on the Workers runtime; `bcryptjs` was rejected on
  CPU cost. Recorded under "Decisions".

- **Risk**: An accidental `--remote` migration or a stray `npm run deploy` changes
  production.
- **Mitigation**: Both are prohibited by `AGENTS.md` and `d1.mdc`, restated in every
  phase, and reserved for Manikanta.

### User Experience Risks

- **Risk**: A teacher registers, reloads, and finds the app has no idea who they are,
  which reads as a broken app rather than an unbuilt feature.
- **Mitigation**: The MCQ stub says plainly that this is an early build, and the gap is
  documented under Known Limitations so the demo can name it as the next sprint's work.

- **Risk**: Validation errors that only appear as one generic message make it unclear
  which field is wrong.
- **Mitigation**: The register endpoint returns a per-field `fields` object, surfaced
  through `FieldError`.

- **Risk**: A specific "no such user" message would let anyone probe which accounts exist.
- **Mitigation**: Both login failure modes return the same 401 message, and an acceptance
  criterion checks it.

---

## Troubleshooting Guide

### workerd crashes, so no local D1 command works (hit in Phase 1, RESOLVED)
**Problem**: `npx wrangler d1 migrations apply quizmaker-db --local` exited with
`0xc0000005 access violation` and "The Workers runtime failed to start". The same crash
broke `wrangler d1 migrations list --local` and the runtime-types step of
`npm run cf-typegen`, and would have broken `npm run preview` in Phase 5.
**Cause**: The `workerd` binary could not start on this Windows machine. Wrangler's error
message points at an outdated Microsoft Visual C++ Redistributable. During Phase 1 the
crash reproduced identically on the installed 4.118.0 and on 4.125.0 invoked through
`npx`, which made it look version-independent at the time.
**Solution**: Upgrading Wrangler to 4.125.0 as an installed dependency fixed it, and
`wrangler` is now pinned as `^4.125.0` in `package.json`. Manikanta ran the upgrade and the
migration then applied cleanly. If this recurs on another machine, install the latest
Microsoft Visual C++ Redistributable (x64) from
https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist and reboot, since
that is what the runtime error itself points to and it may have contributed here.
**Verification**: `npx wrangler d1 migrations list quizmaker-db --local` reports "No
migrations to apply!", and querying the local database shows the `users` table with 8
columns and both named indexes.

### Vitest hangs with "Timeout waiting for worker to respond" (hit in Phase 1, fixed)
**Problem**: The first `npm test` run produced no test results at all, only
`[vitest-pool]: Failed to start forks worker` after 60 seconds.
**Cause**: Two separate costs on this machine. The default `forks` pool never got a worker
to respond, and the `jsdom` environment takes about 45 seconds to initialize where `node`
takes none. The `forks` failure happened while `workerd` was also crashing natively, so the
two may have shared a root cause.
**Solution**: `vitest.config.ts` sets `pool: "threads"` and `environment: "node"`. This
diverges from the testing skill, which specifies `jsdom` globally. Phase 4's component
tests opt in per file with `// @vitest-environment jsdom` at the top, paying the jsdom cost
only where a DOM is actually needed. Worth re-testing the `forks` default in Phase 4 now
that the Wrangler upgrade has settled the native crash.
**Code Reference**: `vitest.config.ts`

### `npm install` fails with ERESOLVE on @vitejs/plugin-react (hit in Phase 1, fixed)
**Problem**: Installing the approved package list failed with a peer dependency conflict.
**Cause**: `@vitejs/plugin-react@6` pulls `@rolldown/plugin-babel`, which needs
`@babel/core@^8`, but `shadcn` holds Babel 7 in the tree.
**Solution**: Pin `@vitejs/plugin-react@^5` (5.2.0), which uses `@rolldown/pluginutils`
and resolves cleanly. `--force` and `--legacy-peer-deps` were deliberately avoided.

### "near notnull: syntax error" reading pragma_table_info (hit in Phase 1, fixed)
**Problem**: `SELECT name, type, notnull, pk FROM pragma_table_info('users')` failed.
**Cause**: `notnull` needs quoting in a SELECT list.
**Solution**: Select the whole pragma row with `SELECT * FROM pragma_table_info('users')`
and read the properties off the result.
**Code Reference**: `migrations/schema.test.ts`

### Vite config loader warnings on every test run (hit in Phase 1, accepted)
**Problem**: Each `npm test` prints two advisory warnings: ESM syntax in a file loaded as
CommonJS, and that `vite-tsconfig-paths` is now redundant because Vite resolves tsconfig
paths natively.
**Cause**: Vitest 4 with a `.ts` config file and the plugin the testing skill mandates.
**Solution**: Left as-is. Both are advisory, tests pass, and the filename and plugin are
what the skill and the approved plan specify. Renaming to `.mts` or switching to
`resolve.tsconfigPaths` would silence them if the noise becomes a problem.

Known hazards worth watching, drawn from the project rules and setup notes:

### `@/` imports fail in tests
**Problem**: Every test importing `@/lib/...` fails to resolve.
**Cause**: `vite-tsconfig-paths` missing from `vitest.config.ts`.
**Solution**: Add the plugin as shown in the testing skill.

### `getCloudflareContext()` throws in a test
**Problem**: A service test fails trying to reach the Cloudflare context.
**Cause**: The context is unavailable under jsdom.
**Solution**: Mock `@opennextjs/cloudflare` and supply a fake `env.DB`.

### D1 binding errors on placeholders
**Problem**: Queries fail with a binding error in local Wrangler.
**Cause**: Anonymous `?` placeholders, or mixed `?` and `?1` styles.
**Solution**: Use numbered placeholders throughout.

### `npm run dev` is not on port 3000
**Problem**: curl to `localhost:3000` connects to nothing or to something stale.
**Cause**: Next.js falls back to another port when 3000 is taken.
**Solution**: Read the port from the dev server output and use that.

### `npx shadcn add <name>` produces no files
**Problem**: A component silently fails to install.
**Cause**: The `@shadcn/` namespace was omitted, or the component has no Base UI
equivalent.
**Solution**: Use `npx shadcn@latest add @shadcn/<name>`, and check for an equivalent
before assuming the command is broken.

---

## Notes for AI Agents

1. Read the Problem and Hypothesis first to understand intent.
2. Treat Scope (In/Out/Cut) as binding. Do not build out-of-scope items, and do not add
   session management, cookies, tokens, or MCQ functionality however small the change
   looks.
3. **One phase per turn.** Stop at the end of a phase and wait for Manikanta's review
   before starting the next. He says "go Phase N" to begin the next one; absent that, do
   not start it.
4. **Tests first, every phase.** Write the failing test, confirm it fails for the right
   reason, then implement. Never write an assertion that cannot fail; if behavior is hard
   to assert, say so instead of producing a hollow test.
5. **Ask before adding any dependency**, per `AGENTS.md`. "Decisions" lists everything
   already approved for this sprint - the Vitest set, `zod`, and PBKDF2 hashing. Anything
   beyond that list needs Manikanta's approval first.
6. **Never run `npm run deploy`** unless Manikanta explicitly asks.
7. **Never apply a migration with `--remote`.** Local only. Remote schema changes are
   Manikanta's to make and run.
8. Do not edit generated files: `cloudflare-env.d.ts`, `next-env.d.ts`,
   `package-lock.json`.
9. Keep all D1 access inside `src/lib/services/`. Never import a database module into a
   `'use client'` component.
10. Follow the file-scoped rules: `d1.mdc` for migrations and queries, `nextjs.mdc` for
    App Router structure, `shadcn.mdc` for components and forms, and the testing skill for
    Vitest.
11. **Verify before claiming completion.** Run `npm run lint` and `npm run build` and
    report the real output. Inspection is not verification.
12. Update this PRD as part of finishing each phase: set the status marker, record the
    files created with `filepath:line-number` references, tick the acceptance criteria
    that now pass, and add a Troubleshooting entry for anything that broke.
13. **Do not commit or push on your own.** All work stays on
    `feature/register-login-logout`. Commit and push only after Manikanta explicitly
    approves a phase, and never to `main`. See "Orchestrator Workflow".
14. Say when you are unsure. A flagged uncertainty is more useful than a confident guess.

---

## Current Status

**Last Updated**: Aug 22, 2026 (night, after Phase 3 completion)
**Current Phase**: Phase 3 - Auth API Routes, COMPLETED
**Branch**: `feature/register-login-logout`, branched from `main`. Phase 1 is committed
locally as `0a46303` but not yet pushed, because no GitHub credentials are available in the
agent's shell; Manikanta will push. Phases 2 and 3 are uncommitted and awaiting his review.
**Status**: Phases 1, 2, and 3 COMPLETED with no outstanding blockers. 90 tests pass, the
production build succeeds, and lint is clean. Register, login, and logout all work against
the real local D1, confirmed by curl. The one deliberate gap is password hashing: register
currently uses an unsalted SHA-256 placeholder, which Phase 4 replaces with PBKDF2.
**Dependency decisions**: All settled as of Aug 22, 2026 - the Vitest set (Phase 1),
`zod` (Phase 3), and Web Crypto PBKDF2-SHA256 hashing (Phase 4) are approved. No open
decisions remain; anything not on that list still needs approval before it is installed.
`@vitejs/plugin-react` is pinned to `^5` and `wrangler` was upgraded to `^4.125.0`, both
for reasons recorded in Troubleshooting.
**Next Steps**: Manikanta reviews Phase 3. Nothing is committed for it until he approves.
Phase 4 does not start until he says "go Phase 4", and it needs the shadcn sign-up and login
block code from him. Phase 4 must also delete `src/lib/password-placeholder.ts` and rewire
both routes to the real PBKDF2 implementation.

**Phase Status Summary**:

- Phase 1 - Database and Test Setup: COMPLETED
- Phase 2 - User Service: COMPLETED
- Phase 3 - Auth API Routes: COMPLETED
- Phase 4 - Auth UI and Password Hashing: PLANNED
- Phase 5 - Verification and Documentation: PLANNED
