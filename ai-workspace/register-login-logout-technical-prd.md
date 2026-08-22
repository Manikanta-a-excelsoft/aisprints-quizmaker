Date created: Aug 22, 2026
Date last modified: Aug 23, 2026 (Phase 5 COMPLETED, sprint complete - 146 tests, clean
lint and build, and the full flow verified on the Workers runtime with PBKDF2 hashes
confirmed in local D1)

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

**Open follow-up for Phase 4 - now closed**: `vitest.config.ts` used `pool: "threads"`
because the default `forks` pool would not start a worker before the Wrangler upgrade.
Re-tested in Phase 4 once jsdom tests existed: `npx vitest run --pool=forks` now passes all
146 tests, so that failure did share a root cause with the `workerd` crash. `threads` was
kept anyway because it is still slightly faster here (16.9s against 19.8s), and the config
comment now records that rather than implying `forks` is broken. Per-file jsdom opt-in was
also kept; environment setup is 22s of a full run even with only four jsdom files.

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

### Phase 4: Auth UI and Password Hashing - COMPLETED

**Objective**: A teacher can register and log in through the browser, and the database
contains only hashed passwords.

**What was built** (Aug 22, 2026, late night):

1. **Red**: wrote `src/lib/password.test.ts`, 20 tests, and confirmed the suite failed with
   `Cannot find module './password'`.
2. **Green**: implemented `src/lib/password.ts` with `hashPassword` and `verifyPassword`
   over Web Crypto PBKDF2-SHA256. All 20 passed.
3. Wired both functions into the register and login routes, deleted
   `src/lib/password-placeholder.ts`, and extended the route tests: the register route now
   has to produce a hash that `verifyPassword` accepts and a different hash for each
   registration of the same password, and the login route has to answer 401 for an account
   still holding a `sha256-placeholder$` value.
4. **Red**: wrote the client tests before the components -
   `src/lib/auth-client.test.ts`, `login-form.test.tsx`, `register-form.test.tsx`,
   `logout-button.test.tsx`, `src/app/mcq/page.test.tsx`, and `src/app/page.test.ts`.
   Confirmed each failed on the missing module, and that the root-redirect test failed
   against the untouched starter page.
5. **Green**: built `src/lib/auth-client.ts`, the three components, the three pages, and
   the root redirect. All 146 tests pass.

**Files**:

- `src/lib/password.ts` - `hashPassword`, `verifyPassword`
- `src/lib/auth-client.ts` - `postAuth`, shared by both forms
- `src/components/auth/login-form.tsx`, `register-form.tsx`, `logout-button.tsx`
- `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/app/mcq/page.tsx`
- `src/app/page.tsx` - now only `redirect("/login")`
- Deleted: `src/lib/password-placeholder.ts`
- Colocated tests beside each of the above

**Stored password format**: `pbkdf2-sha256$<iterations>$<base64 salt>$<base64 key>`, with
100,000 iterations, a 16-byte salt from `crypto.getRandomValues`, and a 256-bit derived
key. The salt and the iteration count are stored alongside the hash so the cost can be
raised later without invalidating existing accounts, and so verification needs no
configuration to stay in step with old rows.

**Design decisions worth recording**:

- Web Crypto rather than a native module, because this runs on the Workers runtime where
  Node's `crypto` is unavailable. No dependency was added.
- `verifyPassword` returns `false` rather than throwing for malformed input, unknown
  algorithms, bad base64, and the Phase 3 `sha256-placeholder$` values. A hashing failure
  therefore surfaces as a normal 401 and cannot turn into a 500 that distinguishes one
  stored row from another.
- The derived key is compared with a constant-time XOR accumulation rather than `===`, so
  the comparison does not leak how many leading bytes matched.
- Both forms validate with the same `registerSchema` and `loginSchema` the routes use and
  post `parsed.data`, so the client cannot drift from the server and the server receives
  values already trimmed by Zod.
- Server field errors are rendered against the matching input; a server `error` with no
  `fields` is rendered once above the form. `postAuth` decides which of the two applies, so
  the two forms cannot disagree about it.
- Forms carry `noValidate`, so the Zod messages are what the user sees rather than browser
  validation bubbles, and what the tests assert against.
- Logout navigates to `/login` even when the request fails. There is no session to clear,
  so a network error must not trap the user on the quiz page.
- Successful login navigates and leaves the submit button disabled, rather than restoring
  it for the moment before the route changes.

**shadcn/Base UI components used**: no block code was supplied for this phase, so the pages
were composed from the components already installed by Phase 0 rather than pasted from a
block. Login and register are the shadcn `card` + `field` form layout: `Card`,
`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `FieldGroup`,
`Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `Input`, and `Button`, with
`Label` reached through `FieldLabel`. The MCQ stub uses `Card` and `Badge`, and the logout
control is `Button` with `variant="outline"`. `FieldError` was a good fit as installed: it
already renders `role="alert"` and accepts an `errors` array, so the accessible error
wiring is `aria-invalid` plus `aria-describedby` on the input and nothing more.

**Testing notes**:

- The four component suites opt into jsdom per file with `// @vitest-environment jsdom`.
  Measured environment cost across the whole 13-file run was 22s, so the per-file opt-in is
  still worth keeping.
- Queries are by role and accessible name, except the password inputs, which have no
  accessible role and are found with `getByLabelText`.
- `next/navigation` is mocked so `router.push` can be asserted; `next/link` renders as-is
  without a router provider and needed no mock.
- `fetch` is stubbed per test with `vi.stubGlobal`. One test resolves it manually to hold
  the request open and assert the button reads "Signing in…" and is disabled mid-flight.
- Both forms are asserted never to echo the submitted password into the page text.

**Verified**:
- `npm test` - 146 tests passing in 13 files (56 new, 90 from Phases 1 to 3), 16.88s
- `npm run lint` - clean, exit 0, no output
- `npm run build` - succeeded, TypeScript clean; `/`, `/login`, `/mcq`, and `/register`
  prerendered as static, the three API routes listed as dynamic
- Not yet done, and left for Phase 5: walking the flow in a browser and re-querying local
  D1 to confirm the stored value now starts with `pbkdf2-sha256$`

**Deliverables**:
- `src/lib/password.ts` and its tests - done
- Register, login, and MCQ stub pages plus the logout control - done
- `src/app/page.tsx` redirecting to `/login` - done
- Phase 4 marker updated, including which components each page came from - done

**Note for anyone with an existing local account**: accounts created during Phase 3 hold a
`sha256-placeholder$` hash. `verifyPassword` rejects that format outright, so those
accounts can no longer log in and must be registered again. The prefix makes the affected
rows easy to find:
`npx wrangler d1 execute quizmaker-db --local --command "SELECT username FROM users WHERE password_hash LIKE 'sha256-placeholder$%'"`.
Deleting them and registering again is the intended fix; there is no migration path,
because the placeholder hash cannot be converted into a PBKDF2 one without the plaintext.

**Deliberately not built**: no cookie, no JWT, no session store, and no middleware. Login
verifies the credentials and navigates, and nothing downstream knows who is signed in. That
is this sprint's documented scope, and it is why `/mcq` is reachable directly by URL.

### Phase 5: Verification and Documentation - COMPLETED

**Objective**: Prove the sprint works rather than assert it, and leave the documentation
accurate for whoever picks this up next.

**What was verified** (Aug 23, 2026):

**1. `npm test`** - 146 tests passing in 13 files, 15.54s, exit 0.

```
 Test Files  13 passed (13)
      Tests  146 passed (146)
   Duration  15.54s (transform 3.86s, setup 0ms, import 12.04s, tests 16.15s, environment 19.42s)
```

**2. `npm run lint`** - exit 0, no output at all. (18s here, against 5.6 minutes for the
same command in Phase 4; ESLint's cache is the difference, not the code.)

**3. `npm run build`** - succeeded, TypeScript clean:

```
✓ Compiled successfully in 23.5s
  Finished TypeScript in 107s ...
✓ Generating static pages using 10 workers (9/9) in 1129ms

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/auth/login
├ ƒ /api/auth/logout
├ ƒ /api/auth/register
├ ○ /login
├ ○ /mcq
└ ○ /register
```

**4. `npm run preview`** - failed on the first attempt, which is exactly what this phase
exists to catch. `npm run dev` and `npm run build` had both been clean throughout:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'esbuild' imported from
C:\aisprint-quizeMaker\aisprints-quizmaker\node_modules\@opennextjs\cloudflare\dist\cli\build\bundle-server.js
```

Root cause and workaround are in Troubleshooting under "npm run preview fails with Cannot
find package 'esbuild'". Manikanta chose to keep the `node_modules` junction rather than add
a dependency; see "Rejected, or decided against for now" for what that costs. Once `esbuild`
resolved, preview built and served the Worker:

```
Your Worker has access to the following bindings:
Binding                            Resource                  Mode
env.DB (quizmaker-db)              D1 Database               local
env.ASSETS                         Assets                    local
env.NEXTJS_ENV ("(hidden)")        Environment Variable      local

⎔ Starting local server...
[wrangler:info] Ready on http://127.0.0.1:8787
```

**5. The full flow on the Workers runtime** (`http://127.0.0.1:8787`, not the Node dev
server). Every page and endpoint below was exercised against that server:

| Step | Result |
|---|---|
| `GET /` | `307` with `Location: /login` |
| `GET /login` | `200`; `<h1>Sign in</h1>`, `id="username"`, a `type="password"` input, link to `/register` |
| `GET /register` | `200`; `<h1>Create your account</h1>` and all five field ids |
| `GET /mcq` | `200`; `<h1>Multiple choice quiz</h1>`, "Log out", and the "later sprint" copy |
| `POST /api/auth/register` (new user `grace5`) | `201` with the created user, no `passwordHash` in the body |
| Same request again | `400` `{"error":"Email already registered"}` |
| `POST /api/auth/login`, correct password | `200` with the user, **no `set-cookie` header** |
| `POST /api/auth/login`, wrong password | `401` `{"error":"Invalid credentials"}` |
| `POST /api/auth/login`, unknown username | `401` `{"error":"Invalid credentials"}`, byte-identical to the line above |
| `POST /api/auth/logout` | `200` `{"success":true}`, no `set-cookie` |
| `POST /api/auth/login` again after logout | `200`, same user - the credentials still work |

Registering, logging out, and logging back in therefore all work on workerd, which also
proves Web Crypto PBKDF2 runs there and not just under Node.

**6. Local D1 after the flow.** Both stored hashes are PBKDF2, 90 characters, and contain
no fragment of the plaintext:

```
username    password_hash                                                                  is_pbkdf2  plaintext?
manikanta   pbkdf2-sha256$100000$nmXqeWNOkFckhFcGxg/j9w==$LvM7y0QmDrKG4AutXq6QV7LsnbuIT6nAneZMWnZah2c=   1   0
grace5      pbkdf2-sha256$100000$3f9tkaUd8l4sTi4Opy3xSA==$bNAtur+T4l5Dq9w23VZPGxa5V5Xezt3/B1wUJI4GBng=   1   0
```

The leftover Phase 3 account (`ada99967`, `sha256-placeholder$c4bbcb1f...`) was deleted
first, so no placeholder-era row remains.

**7. Salting proven against the real database, not just in a unit test.** A second account
(`alan5`) was registered through the API with a password byte-identical to `grace5`'s. SQL
comparison of the two rows returned `hashes_differ = 1`, with different salt segments
(`100000$3...` against `100000$F...`).

**8. No session machinery anywhere.** Grepping `src/` for `cookie`, `jwt`, `session`,
`localStorage`, and `sessionStorage` returns only comments explaining the absence and two
tests asserting `set-cookie` is null. There is no `middleware.ts` in the repository.

**What was not done, deliberately**: no deploy, no `--remote` migration, and no remote
database access. Those are Manikanta's.

**Honest limits of this verification**: the flow was driven with `curl.exe` against the
Workers preview, not clicked through in a browser, because this environment has no browser
automation. What that leaves unproven by direct observation is only the client-side
submission path - the `fetch` call and `router.push` that the form components perform - and
that path is covered by the 26 component tests. Manikanta had already registered the
`manikanta` account through the browser during his Phase 4 review, so the browser path has
been exercised by hand, just not in this transcript.

**Deliverables**:
- Recorded command output for test, lint, build, and preview - done, above
- This PRD fully updated with code references - done
- Updated `AGENTS.md` Project section - done; the stale "no database, authentication, or
  testing framework is installed" line in Stack was corrected too, and `npm test` was
  added to the command table
- Confirmation that verification is complete, so Manikanta can export the chat transcript
  for course submission - done, with the one open dependency decision noted above

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

Phase 5 ran this same sequence against `npm run preview` instead, on
`http://127.0.0.1:8787`, which is the Workers runtime rather than Node. Prefer that for
anything runtime-sensitive; the commands are identical apart from the port.

Confirm nothing sensitive was stored, and remember each username and email can only be
used once:

```powershell
npx wrangler d1 execute quizmaker-db --local --command "SELECT username, password_hash FROM users ORDER BY created_at DESC LIMIT 5"
```

---

## Technical Implementation Details

What was actually built, as of the end of Phase 5. Thirteen test files, 146 tests.

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

Built in Phase 4:

- `src/lib/password.ts` - PBKDF2-SHA256 hashing and verification, 20 tests
- `src/lib/auth-client.ts` - the forms' one way of posting to the auth API, 7 tests
- `src/components/auth/login-form.tsx`, `register-form.tsx`, `logout-button.tsx` - client
  components, 26 jsdom tests between them
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

Password storage, `src/lib/password.ts`. The salt and iteration count travel with the hash,
so the cost can be raised later without invalidating existing rows:

```typescript
const ALGORITHM = "pbkdf2-sha256";
const ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await deriveKey(password, salt, ITERATIONS);

  return [ALGORITHM, ITERATIONS, toBase64(salt), toBase64(derived)].join("$");
}
```

`verifyPassword` parses that string, re-derives with the stored salt and iteration count,
and compares with a constant-time XOR. It returns `false` rather than throwing for anything
malformed, including the deleted Phase 3 `sha256-placeholder$` format, so a bad row produces
a 401 and never a 500.

Form submission, both auth forms. The client validates with the same schema the route uses
and posts `parsed.data`, so client and server rules cannot drift and the server receives
values Zod has already trimmed:

```typescript
const parsed = registerSchema.safeParse(values);
if (!parsed.success) {
  setErrors(fieldErrors(parsed.error));
  return;
}

const result = await postAuth("/api/auth/register", parsed.data);
if (result.ok) {
  router.push("/login");
  return;
}

setErrors(result.fields);      // rendered against each input by FieldError
setFormError(result.message);  // rendered once above the form
```

### Important Notes

- D1 is server-only. A database module must never be imported into a `'use client'`
  component.
- `getCloudflareContext()` does not work under jsdom; tests mock it.
- Wrangler's local D1 is a local SQLite file. It is not the remote database and is not
  shared with anyone else.
- Web Crypto PBKDF2 was confirmed working on workerd in Phase 5, not just under Node. Any
  future hashing change has to be re-checked with `npm run preview`, because `npm run dev`
  runs on Node and would not catch a Workers-only failure.
- Password inputs have no accessible role, so component tests find them with
  `getByLabelText` while every other control is queried by role and accessible name.
- `FieldError` from the installed shadcn set already renders `role="alert"` and accepts an
  `errors` array, so error wiring on an input is only `aria-invalid` and `aria-describedby`.

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

### Rejected, or decided against for now

- **`esbuild@0.25.4` as a devDependency** - proposed Aug 23, 2026 in Phase 5 and declined
  by Manikanta the same day. `npm run preview` cannot start without a top-level `esbuild`,
  because `@opennextjs/cloudflare@1.20.2` imports it without declaring it, so Phase 5
  supplied one with a `node_modules` junction and left it at that. The decision keeps
  `package.json` free of a dependency that only exists to patch around an upstream
  packaging bug.

  **Consequence to know about**: the junction is not tracked and does not survive
  `npm install`. Anyone who reinstalls, or clones the repository fresh, gets the
  `ERR_MODULE_NOT_FOUND` failure again on `npm run preview` and has to recreate the
  junction from the Troubleshooting entry, or run preview under WSL, which OpenNext
  recommends on Windows anyway. `npm run dev`, `npm test`, `npm run lint`, and
  `npm run build` are all unaffected. Worth revisiting when
  `@opennextjs/cloudflare` is next upgraded, since a fixed upstream package would remove
  the problem outright.

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
      (Phase 5: every row is `pbkdf2-sha256$100000$...`, 90 characters, and `instr()`
      finds no fragment of the plaintext)
- [x] Hashing the same password twice produces different stored values
      (`src/lib/password.test.ts` asserts three hashes of one password are all distinct
      with distinct salts, and Phase 5 confirmed it in the database: two accounts
      registered with the same password compared `hashes_differ = 1`)
- [x] `/register` and `/login` render with shadcn components and show field-level errors
      (asserted by role and accessible name in the two form test suites; both pages also
      served `200` with their headings and every field id from the Workers preview)
- [x] A teacher can register in the browser and land on the MCQ stub (`POST` register
      returned `201` on workerd and `/mcq` served `200` with its heading and logout
      control; Manikanta also registered by hand through the browser in Phase 4. The
      click-through itself was not scripted - no browser automation here)
- [x] The MCQ stub states that question creation arrives next sprint and creates no
      questions
- [x] Logging out returns the teacher to `/login`, and logging back in with the same
      credentials succeeds (logout returned `200` and a second login with the same
      credentials returned `200` on the Workers runtime; the return to `/login` is the
      `router.push` covered by `logout-button.test.tsx`)
- [x] `/` redirects to `/login` and the Next.js starter page is gone (`307` with
      `Location: /login` from the preview server)
- [x] `npm run lint` passes with no new errors
- [x] `npm run build` succeeds
- [x] `npm run preview` serves the app on the Workers runtime and the full flow works
      there (after the `esbuild` resolution problem recorded in Troubleshooting; every
      page and endpoint was then exercised against `http://127.0.0.1:8787`)
- [x] No cookie is set, no token is issued, and no session store exists anywhere in the
      codebase (no `set-cookie` on any response; grepping `src/` for cookie, jwt, session,
      and storage APIs returns only comments and the two tests asserting their absence;
      there is no `middleware.ts`)
- [x] This PRD's phase markers and code references match what was actually built

---

## Success Metrics

| Metric | Target | Result at Phase 5 |
|--------|--------|--------------|
| Registration completes | A new teacher registers in under 60 seconds | Met. A single `POST` returns 201; the form is one card with five fields |
| Passwords never stored in plaintext | 0 plaintext passwords | Met. Every row is `pbkdf2-sha256$100000$...` and `instr()` finds no plaintext fragment |
| Test coverage of the auth surface | Every service method and every documented status code has a test | Met. 146 tests; every service method and every documented status code is covered |
| Duplicate accounts prevented | 100% of duplicate username or email attempts rejected with 400 | Met. Tests plus a repeat registration on workerd returning 400 "Email already registered" |
| Credential errors do not leak account existence | Unknown username and wrong password are indistinguishable | Met. Both returned `401 {"error":"Invalid credentials"}`, and a test asserts they are byte-identical |
| Sprint stays in scope | 0 out-of-scope features built | Met. No cookie, token, session store, or middleware exists; no question-authoring code was written |

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

### `npm run preview` fails with "Cannot find package 'esbuild'" (hit in Phase 5, worked around)
**Problem**: `npm run preview` died immediately, before any bundling:
`Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'esbuild' imported from
node_modules\@opennextjs\cloudflare\dist\cli\build\bundle-server.js`. `npm run dev`,
`npm run build`, `npm test`, and `npm run lint` were all unaffected, so nothing before
Phase 5 surfaced it.
**Cause**: `@opennextjs/cloudflare@1.20.2` imports bare `esbuild` in its build CLI but does
not declare it in `dependencies` or `peerDependencies`. It relies on `esbuild` being
hoisted to the top level from its own dependency `@opennextjs/aws@4.1.0`, which pins
`esbuild@0.25.4`. On this install npm could not hoist it, because `wrangler@4.125.0` wants
`esbuild@0.28.1`; npm nested both instead
(`node_modules/@opennextjs/aws/node_modules/esbuild` and
`node_modules/wrangler/node_modules/esbuild`), leaving no `node_modules/esbuild` for
`@opennextjs/cloudflare` to resolve. `npm ls esbuild` shows both nested copies. This is an
upstream packaging bug, not a mistake in this repository.
**Workaround used, so Phase 5 could finish**: a directory junction was created inside
`node_modules` only, pointing the expected path at the copy that is already installed:

```powershell
New-Item -ItemType Junction -Path "node_modules\esbuild" `
  -Target "node_modules\@opennextjs\aws\node_modules\esbuild"
```

Preview then built and served normally. `node_modules` is not committed, so this changed no
tracked file - but it also will not survive `npm install`, and it is invisible to anyone who
clones the repository.
**Alternative fix, considered and declined**: adding `esbuild@0.25.4` to `devDependencies`
would give a real top-level copy. Manikanta declined it on Aug 23, 2026, preferring to keep
`package.json` clean of a workaround for someone else's packaging bug, so the junction above
is the standing answer. Recreate it after any `npm install`, or run preview under WSL.
**Verification**: `node -e "console.log(require.resolve('esbuild'))"` resolves, and
`npm run preview` reaches `Ready on http://127.0.0.1:8787`.

### PowerShell `-match` on curl output returns HTML instead of true or false (hit in Phase 5)
**Problem**: Checking a fetched page with `$page -match 'Sign in'` printed thousands of
lines of HTML, and one verification command wrote a 112 KB result.
**Cause**: `curl.exe` output arrives as an array of lines. PowerShell's `-match` against an
array is a filter that returns the matching elements, not a boolean.
**Solution**: Join first and cast: `$page = (curl.exe -s $url) -join "`n"`, then
`[bool]($page -match 'Sign in')`. Worth knowing for any future page check on Windows.

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
only where a DOM is actually needed.
**Update from Phase 4**: `--pool=forks` was re-tested once the jsdom tests existed and now
passes all 146 tests, which supports the shared-root-cause theory. `threads` was kept
because it is still marginally faster (16.9s against 19.8s). Measured jsdom cost is also
lower than the original 45s estimate: 22s of environment setup across a 13-file run.
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

**Last Updated**: Aug 23, 2026 (after Phase 5 completion - sprint complete)
**Current Phase**: Phase 5 - Verification and Documentation, COMPLETED. All five phases are
done.
**Branch**: `feature/register-login-logout`, branched from `main`. Phases 1 to 4 are
committed locally as `0a46303`, `5330139`, `805432d`, and `c2be2cb`, none of them pushed,
because no GitHub credentials are available in the agent's shell; Manikanta will push. The
Phase 5 documentation changes are uncommitted and awaiting his review. Nothing has been
merged to `main`.
**Status**: The sprint is functionally complete and verified on the runtime it will actually
deploy to. 146 tests pass, lint is clean, the production build succeeds, and the whole
register / login / logout flow works against `npm run preview` on workerd with local D1
bound. Every stored password is PBKDF2-SHA256 with a random per-user salt, confirmed by
querying the database. One environment caveat: `npm run preview` needs a top-level
`esbuild`, supplied by a `node_modules` junction rather than a declared dependency, by
decision. It has to be recreated after any `npm install`.
**Dependency decisions**: The Vitest set (Phase 1), `zod` (Phase 3), and Web Crypto
PBKDF2-SHA256 hashing (Phase 4) are approved; Phases 4 and 5 added no dependency. Adding
`esbuild` was proposed in Phase 5 and declined; the junction stands instead.
`@vitejs/plugin-react` is pinned to `^5` and `wrangler` was upgraded to `^4.125.0`, both
for reasons recorded in Troubleshooting.
**Next Steps**: Manikanta reviews Phase 5, then exports the Cursor chat transcript for
course submission. Deploying and any remote migration remain his. The natural first task of
the next sprint is real session management, without which login establishes nothing and
`/mcq` stays public.

**Phase Status Summary**:

- Phase 1 - Database and Test Setup: COMPLETED
- Phase 2 - User Service: COMPLETED
- Phase 3 - Auth API Routes: COMPLETED
- Phase 4 - Auth UI and Password Hashing: COMPLETED
- Phase 5 - Verification and Documentation: COMPLETED
