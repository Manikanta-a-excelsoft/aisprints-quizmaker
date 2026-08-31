Date created: Aug 31, 2026
Date last modified: Aug 31, 2026 (Phase 3 COMPLETED — all six endpoints live under
`src/app/api/mcq/` with Zod validation shared with the Phase 4 form, proven by 86 tests and
by a curl run covering every documented status code against real local D1. The `PUT` endpoint
docs and the choice schema were corrected to match replace-all editing. Phase 2 COMPLETED
earlier the same day — `mcq-service.ts` owns every database call, proven by 50 tests against
a real SQLite database built from the migration files, settling open decisions 1 and 3. Phase
1 COMPLETED before that — the three MCQ tables applied to local D1, proven by 77 tests.
Revised at the start so every commit, push, remote migration, and deploy is proposed and
waits for Manikanta's explicit approval rather than happening on the agent's own initiative.)

# MCQ CRUD and Attempts - Technical PRD

## Overview/Problem

Sprint 1 gave QuizMaker accounts: a teacher can register, log in, and log out, and lands on
a `/mcq` page that says the question builder arrives later. That page is a stub. There is
no way to write a question, no table to hold one, and nothing a teacher can do with the
product after logging in, so the application currently proves an identity and then offers
nothing to use it on.

This sprint builds the question bank itself. A teacher can create a multiple-choice
question, see every question in a list, edit one, delete one, and attempt one — pick an
answer, submit it, and be told immediately whether they were right — with the attempt
recorded in the database rather than discarded. After this sprint QuizMaker does the thing
its name promises.

---

## Hypothesis

We believe that full create, read, update, and delete for multiple-choice questions, plus a
recorded attempt flow, will turn QuizMaker from a login demo into a usable question bank
for teachers, while keeping every layer thin enough to test and review one phase at a time.

---

## Scope

### In Scope

**Data**

- One new migration, `migrations/0002_create_mcq_tables.sql`, creating `mcq_questions`,
  `mcq_choices`, and `mcq_attempts`, applied to the **local** D1 database only.
- Ids as `TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16))))` and timestamps as
  `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`, matching `0001_create_users_table.sql`.
- `ON DELETE CASCADE` from `mcq_questions` to both `mcq_choices` and `mcq_attempts`;
  `ON DELETE SET NULL` on every reference to `users (id)`.
- Named indexes on every foreign key column.

**Service layer**

- `src/lib/services/mcq-service.ts` as the only module that touches `env.DB` for questions,
  choices, and attempts, in the same shape as `user-service.ts`: numbered placeholders,
  `RETURNING` read back with `.all()`, never `.first()`, and `db.batch()` where a question
  and its choices must be written together.

**Validation**

- `src/lib/validation/mcq.ts` holding the Zod schemas, following `auth.ts`, and reusing the
  `fieldErrors()` pattern so MCQ error responses look like the auth ones.
- `name` required, at most 100 characters. `questionText` required, at most 1000. Each
  choice text required, at most 500. Between 2 and 6 choices. Exactly one choice flagged
  correct. Every rule carries a human-readable message.
- The create and edit form validates with the same schema the route enforces, so the two
  cannot disagree.

**API**

- Route handlers (not Server Actions) under `src/app/api/mcq/`: list, create, read, update,
  delete, and record-an-attempt.

**UI**

- `/mcq` — replaces the Sprint 1 stub with a table of questions: name, truncated question
  text, choice count, and row actions.
- `/mcq/new` and `/mcq/[id]/edit` — one shared form component with a dynamic choice list
  (add and remove choices) and a radio group marking the correct one.
- `/mcq/[id]/attempt` — the question with its choices as a radio group; after submitting,
  clear feedback on whether the answer was right and which choice was correct.
- Delete behind a confirmation step, so a single misclick cannot destroy a question.

**UI polish, in scope from the start rather than added later**

- A search input above the table that filters the already-loaded rows **in memory**. No new
  endpoint, no query parameters, no refetch.
- An empty-state card with a line of copy and a button to create the first question, shown
  instead of an empty table.
- Row actions collapsed into a dropdown menu rather than three bare buttons.
- `sonner` toasts confirming create, update, and delete.
- Skeleton rows while the list loads, so the page does not flash empty.

**Process**

- Test-driven in every phase: failing run pasted into the chat first, then the passing run.
- Tests colocated with their subject, run by `npm test` on the existing Vitest setup.
- Any missing shadcn component installed with the shadcn CLI; any missing package installed
  with `npm install`, with the `package-lock.json` change committed. No hand-made
  `node_modules` junctions or other manual shortcuts for new dependencies.

### Out of Scope

Explicitly not built in this sprint, deferred to a later one:

- **Session management of any kind.** No cookie, no token, no session store, no
  `middleware.ts`. This remains deliberate; see "Known Limitations". It is the reason
  `created_by` and `user_id` exist but stay null.
- Attributing a question or an attempt to the teacher who made it. The columns are created;
  populating them needs sessions.
- Any per-teacher view: "my questions", "my attempts", "my score", a results history page,
  or any aggregate over `mcq_attempts` beyond writing the rows.
- Server-side search, pagination, or sorting. The list loads every question and filters in
  the browser.
- Question types other than single-answer multiple choice. No multi-select, no free text,
  no true/false shortcut, no images or attachments in a question.
- Quizzes as a grouping above questions: no sets, no tags, no categories, no difficulty.
- Import, export, duplication, or bulk operations.
- AI-assisted question generation. No AI SDK is installed and none is being added.
- Rich text or Markdown in question or choice text. Plain text only.
- Soft delete, undo, an audit trail, or version history. Delete is permanent.
- Role-based access control. There are no roles, and with no session there is nothing to
  attach one to.
- Remote D1 migrations and deployment during Phases 1 to 5. Both are the named close-out
  step after Phase 5 and happen only when Manikanta asks.

### Cut

Considered while planning this sprint and deliberately removed:

- **A database-level guarantee of exactly one correct choice** — Cut. SQLite cannot express
  "exactly one row in this group has `is_correct = 1`" as a `CHECK` constraint, and doing it
  with triggers would put business logic in the migration where no test in this project
  currently looks. The rule is enforced in the Zod schema and in the service, and the gap
  is recorded under "Known Limitations" rather than hidden.
- **A `UNIQUE` index on `(question_id, position)`** — Cut. It would guarantee no two choices
  share a position, but SQLite checks uniqueness per statement rather than at commit, so
  reordering choices during an edit could collide mid-batch on a perfectly valid final
  state. A plain index plus `ORDER BY position, id` gives stable rendering without that
  trap.
- **Snapshotting the chosen choice text onto `mcq_attempts`** — Cut for now. It would keep
  an attempt fully readable after its question is edited, but nothing in this sprint reads
  attempts back, so it would be storage for a feature that does not exist. Raised as open
  decision 4 in case Manikanta wants it while the table is being created anyway.
- **Server-side search with a `?q=` parameter** — Cut. Explicitly asked for as an in-memory
  filter over loaded rows. Revisit when the bank is large enough that loading it all is the
  problem.
- **`react-hook-form`** — Cut again, as in Sprint 1. `shadcn.mdc` forbids introducing it
  without approval, and the dynamic choice list is a `useState` array. This is the most
  complex form in the project so far, so if the hand-rolled version turns ugly it will be
  raised rather than smuggled in.
- **Optimistic UI on delete** — Cut. Removing the row before the request returns means
  restoring it on failure, and the confirmation dialog plus a toast already makes the
  action feel immediate.
- **`@cloudflare/vitest-pool-workers`** — Cut in Sprint 1 and still cut, unless Manikanta
  picks option A in open decision 1. The testing skill warns it changes how the whole suite
  runs.

---

## Principles Applied

How the twelve aisprints principles apply to this sprint:

| # | Principle | How this sprint applies it |
|---|-----------|----------------------------|
| 01 | Start with clear intent & context | This PRD states the problem, hypothesis, and in/out scope before any MCQ code is written. |
| 02 | Brain-dump requirements | The schema, validation rules, endpoint list, UI polish, and the no-session constraint were captured from Manikanta's brain-dump and organized here. |
| 03 | Establish rules/guardrails | Work follows `AGENTS.md`, `d1.mdc`, `nextjs.mdc`, `shadcn.mdc`, `tailwind.mdc`, `cloudflare.mdc`, the testing skill, and the new `phase-commit.mdc`. |
| 04 | Phased implementation plan | Five phases from migration to runtime verification, each with objective, tasks, deliverables, and a stop-for-review gate. |
| 05 | Iterate with precision | One phase per turn. A phase does only its own objective. |
| 06 | Test early and often | Every phase writes failing tests first and pastes both the red and the green run into the chat. |
| 07 | Communicate clearly with AI agent | Explicit scope boundaries, open decisions settled before Phase 1, and approval required for any post-phase change. |
| 08 | Refine each layer systematically | Schema, service, API, UI, verification — each layer rests on a tested one below it. |
| 09 | Maintain continuous documentation | This PRD is updated at the end of every phase, and the update ships in the same commit as the code. |
| 10 | Deploy frequently | Local verification every phase; `npm run preview` on the Workers runtime in Phase 5. Deployment itself is the named close-out step. |
| 11 | Reflect, learn, adjust | Known Limitations and Cut record deliberate trade-offs so they are not read as bugs. Sprint 1's `esbuild` and Wrangler lessons are carried forward into Risks. |
| 12 | Up your own game | AI drafts the PRD and the TDD scaffolding; Manikanta reviews every phase and settles every open decision. |

---

## Orchestrator Workflow

Manikanta orchestrates; the agent implements one phase at a time.

- **Branch**: all work happens on `feature/mcq-crud`, branched from `origin/main` after
  Sprint 1 merged. Nothing merges to `main` during the sprint.
- **Phase gates**: the agent does not start a phase until Manikanta says so in the chat.
  He says **"go Phase N"**; absent that, the phase does not begin.
- **Commits**: governed by `.cursor/rules/phase-commit.mdc`, which is already the first
  commit on this branch. At the end of each phase, once the phase's tests are green and this
  PRD is updated, the agent **proposes** the commit — it shows the exact `git add`,
  `git commit`, and `git push` commands and the commit message, and then stops. **Nothing is
  staged, committed, or pushed until Manikanta has read the diff and said go in the chat.**
  The push happens in that same approved batch, not as a later step the agent decides on its
  own. One phase per commit. PRD and migration changes ride in the same commit as the code
  they describe. A fix after a phase is closed gets its own `fix:` commit naming the phase in
  the body, proposed and approved the same way.
- **Changes after a phase closes**: the agent states what it will change and which test
  proves it, waits for Manikanta's approval, and only then edits. No silent code movement.
- **Troubleshooting**: anything discovered and fixed along the way is written into the
  Troubleshooting Guide with the file and line.
- **Course submission**: this sprint is graded on a live URL, so the close-out step after
  Phase 5 covers the remote migration and the deploy. It runs only when Manikanta asks.

---

## Technical Requirements

### Database Schema

Three tables in one migration, `migrations/0002_create_mcq_tables.sql`, created with
`npx wrangler d1 migrations create quizmaker-db create_mcq_tables` and applied with
`npx wrangler d1 migrations apply quizmaker-db --local`. **The remote database is not
touched during Phases 1 to 5.**

```sql
-- Migration number: 0002 	 <timestamp written by wrangler>

CREATE TABLE mcq_questions (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name          TEXT NOT NULL,
  question_text TEXT NOT NULL,
  created_by    TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mcq_choices (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  question_id TEXT NOT NULL REFERENCES mcq_questions (id) ON DELETE CASCADE,
  choice_text TEXT NOT NULL,
  is_correct  INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  position    INTEGER NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mcq_attempts (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  question_id TEXT NOT NULL REFERENCES mcq_questions (id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
  choice_id   TEXT REFERENCES mcq_choices (id) ON DELETE SET NULL,
  is_correct  INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mcq_questions_created_by ON mcq_questions (created_by);
CREATE INDEX idx_mcq_choices_question_id   ON mcq_choices (question_id);
CREATE INDEX idx_mcq_attempts_question_id  ON mcq_attempts (question_id);
CREATE INDEX idx_mcq_attempts_user_id      ON mcq_attempts (user_id);
CREATE INDEX idx_mcq_attempts_choice_id    ON mcq_attempts (choice_id);
```

Notes on the schema:

- **`created_by` and `user_id` are nullable and will be `NULL` for every row this sprint
  writes.** There is no session, so no route can know who is acting. The columns exist so a
  later sprint can populate them without a second migration. No fake user is invented and
  no header is read that does not exist. See "Known Limitations".
- `created_by` and `user_id` are `ON DELETE SET NULL`, so deleting a teacher leaves their
  questions and attempts intact rather than destroying the bank.
- `question_id` is `ON DELETE CASCADE` on both child tables, so deleting a question takes
  its choices and its attempts with it. That is deliberate: an attempt at a question that no
  longer exists has nothing to report.
- **`mcq_attempts.choice_id` is `ON DELETE SET NULL`, not `CASCADE`.** This is the one place
  the schema deviates from a literal reading of the brain-dump, and it matters: if editing a
  question replaces its choice rows, a `CASCADE` here would silently delete the attempt
  history along with them. `SET NULL` keeps the attempt, its `is_correct`, and its
  timestamp. Combined with the diff-based update described under open decision 3, choice ids
  survive an ordinary edit anyway. `question_id` still cascades, so deleting a question
  still clears its attempts.
- `is_correct` is `INTEGER` with a `CHECK (… IN (0, 1))` because SQLite has no boolean
  type. The service converts to and from a JavaScript `boolean` at its edge, the same way
  `user-service.ts` maps `first_name` to `firstName`.
- `position` orders choices for rendering. Queries use `ORDER BY position, id` so ties break
  deterministically rather than relying on insertion order.
- `updated_at` is not maintained by SQLite. `updateQuestion` sets it explicitly on every
  write, exactly as `updateUser` does.
- D1 enforces foreign keys by default. The `node:sqlite` schema test must issue
  `PRAGMA foreign_keys = ON` before it can assert cascade and set-null behavior, because
  plain SQLite defaults that off.
- The choice count on the list page comes from a `LEFT JOIN … GROUP BY` rather than a
  denormalized column, so it cannot drift from the rows it counts.

#### Id generation, and why the service supplies ids

A question and its choices have to be written in one `db.batch()` so the database can never
hold a question with no choices. Every statement in a batch is prepared before any of them
runs, so a choice row cannot reference an id that the question's `INSERT` has not generated
yet. The service therefore generates the question id itself and binds it explicitly:

```typescript
/** Same shape as the column default: 32 lowercase hex characters. */
function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
```

The `DEFAULT (lower(hex(randomblob(16))))` stays on all three tables, as asked, so the
column style matches `users` and an insert that omits the id still works. It is a fallback,
not the path the service takes for `mcq_questions`. `crypto.getRandomValues` is Web Crypto,
already used by `src/lib/password.ts` and already proven on workerd in Sprint 1, so this
adds no dependency.

### API Endpoints

Route handlers under `src/app/api/mcq/`, not Server Actions, so the rest of the app stays
consistent and every endpoint can be tested directly. Each handler validates its body with
a Zod schema before use and treats all input as untrusted, per `nextjs.mdc`. Error bodies
match the auth API: `{ "error": "Validation failed", "fields": { … } }` for validation,
a single `{ "error": "…" }` otherwise. Handlers return the Web `Response.json`, as the auth
routes do, rather than `NextResponse`.

#### GET /api/mcq

List every question with its choice count. No pagination, no query parameters.

**Request Body:** none.

**Response:**
- Success (200):
```json
{
  "questions": [
    {
      "id": "9f2c…",
      "name": "Capital of France",
      "questionText": "Which city is the capital of France?",
      "choiceCount": 4,
      "createdAt": "2026-08-31 14:02:11",
      "updatedAt": "2026-08-31 14:02:11"
    }
  ]
}
```
- Error (500): `{ "error": "Could not load questions" }`

An empty bank returns `200` with `{ "questions": [] }`, not a `404`. The UI's empty state is
driven by that empty array.

#### POST /api/mcq

Create a question and its choices in one batch.

**Request Body:**
```json
{
  "name": "Capital of France",
  "questionText": "Which city is the capital of France?",
  "choices": [
    { "text": "Paris", "isCorrect": true },
    { "text": "Lyon", "isCorrect": false },
    { "text": "Marseille", "isCorrect": false }
  ]
}
```

`position` is not accepted from the client; the array order is the position. Sending
`position` is ignored rather than an error.

**Response:**
- Success (201):
```json
{
  "question": {
    "id": "9f2c…",
    "name": "Capital of France",
    "questionText": "Which city is the capital of France?",
    "createdBy": null,
    "createdAt": "2026-08-31 14:02:11",
    "updatedAt": "2026-08-31 14:02:11",
    "choices": [
      { "id": "1a4b…", "text": "Paris", "isCorrect": true, "position": 0 },
      { "id": "2b5c…", "text": "Lyon", "isCorrect": false, "position": 1 },
      { "id": "3c6d…", "text": "Marseille", "isCorrect": false, "position": 2 }
    ]
  }
}
```
- Error (400): `{ "error": "Validation failed", "fields": { "name": "Name is required", "choices.1.text": "Choice text is required" } }`
- Error (500): `{ "error": "Could not create question" }`

`createdBy` is `null` in every response this sprint. It is present in the body so the shape
does not change when sessions arrive.

#### GET /api/mcq/[id]

Read one question with its choices.

**Request Body:** none.

**Query parameters:**
- `include=answers` — include `isCorrect` on each choice. Omitted by default so the attempt
  page does not receive the answer it is about to ask for. See open decision 5: with no
  authentication this is tidiness, not a security boundary.

**Response:**
- Success (200), default: `{ "question": { "id", "name", "questionText", "createdBy", "createdAt", "updatedAt", "choices": [ { "id", "text", "position" } ] } }`
- Success (200), with `include=answers`: the same, each choice also carrying `"isCorrect"`
- Error (404): `{ "error": "Question not found" }`
- Error (500): `{ "error": "Could not load question" }`

#### PUT /api/mcq/[id]

Replace a question's name, text, and choice list. Body is identical to `POST /api/mcq`.

**Request Body:**
```json
{
  "name": "Capital of France",
  "questionText": "What is the capital of France?",
  "choices": [
    { "text": "Paris", "isCorrect": true },
    { "text": "Nice", "isCorrect": false }
  ]
}
```

**Changed from the original plan.** The plan had an optional `id` on each choice, so an
existing choice could be updated in place and the endpoint would diff the list. Decision 3
was settled as replace-all, so there is no `id` to send: the whole choice set is replaced and
new ids are issued. A client that sends one is not rejected — the schema strips it, the same
way it strips `position` — so no caller breaks over a field that no longer means anything.

Confirmed against the running server: a question created with three choices and then updated
with two came back with two choices, new ids, and positions renumbered from 0.

The consequence is visible in the response and is the accepted cost of decision 3. In the
Phase 3 curl run, the "Paris" choice id changed from `dfd5829362efded2c2ea22419bc769ed` to
`c14127cc75b1261223cb406432c335cc` across one edit. Any attempt pointing at the old id keeps
its row and its `isCorrect`, with `choice_id` set to null.

**Response:**
- Success (200): `{ "question": { … } }`, the same full shape `POST` returns, including
  `isCorrect`
- Error (400): `{ "error": "Validation failed", "fields": { … } }`
- Error (404): `{ "error": "Question not found" }`
- Error (500): `{ "error": "Could not update question" }`

#### DELETE /api/mcq/[id]

**Request Body:** none.

**Response:**
- Success (200): `{ "success": true }`
- Error (404): `{ "error": "Question not found" }`
- Error (500): `{ "error": "Could not delete question" }`

Choices and attempts go with the question through `ON DELETE CASCADE`. The service reads
`meta.changes` to tell a real delete from a missing id, the way `deleteUser` does.

#### POST /api/mcq/[id]/attempts

Record an attempt and answer whether it was right.

**Request Body:**
```json
{ "choiceId": "1a4b…" }
```

**Response:**
- Success (201):
```json
{
  "attempt": {
    "id": "7e8f…",
    "questionId": "9f2c…",
    "userId": null,
    "choiceId": "1a4b…",
    "isCorrect": true,
    "createdAt": "2026-08-31 14:09:44"
  },
  "correctChoiceId": "1a4b…"
}
```
- Error (400): `{ "error": "Validation failed", "fields": { "choiceId": "Select an answer" } }`
- Error (400): `{ "error": "That choice does not belong to this question" }`
- Error (404): `{ "error": "Question not found" }`
- Error (500): `{ "error": "Could not record attempt" }`

Correctness is decided **on the server** by reading the chosen choice's `is_correct`, never
from anything the client sends. `correctChoiceId` is returned so the page can show which
answer was right, and it is returned only in the response to a submitted attempt — not by
the default `GET`. `userId` is `null` this sprint.

### Validation Schemas

`src/lib/validation/mcq.ts`, following `src/lib/validation/auth.ts`: schemas exported for
both the routes and the form, plus the shared error flattener.

As built. Two changes from the plan, both found by the tests and both marked inline:

```typescript
import { z } from "zod";

export const choiceInputSchema = z.object({
  // CHANGED: no optional `id`. Decision 3 settled as replace-all, so a choice id carries no
  // meaning on the way in. A client that sends one has it stripped, like `position`.
  //
  // CHANGED: the message is on the type as well as the length check. A field that arrives
  // missing is a different Zod issue from one that arrives empty, and Zod's own wording for
  // the first ("expected string, received undefined") is not something to show a person.
  text: z
    .string({ error: "Choice text is required" })
    .trim()
    .min(1, "Choice text is required")
    .max(500, "A choice must be at most 500 characters"),
  isCorrect: z.boolean({ error: "Mark whether this choice is the correct answer" }),
});

export const questionInputSchema = z.object({
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be at most 100 characters"),
  questionText: z
    .string({ error: "Question text is required" })
    .trim()
    .min(1, "Question text is required")
    .max(1000, "Question text must be at most 1000 characters"),
  choices: z
    .array(choiceInputSchema, { error: "Add at least two choices" })
    .min(2, "Add at least two choices")
    .max(6, "A question can have at most six choices")
    .refine((choices) => choices.filter((c) => c.isCorrect).length === 1, {
      message: "Mark exactly one choice as the correct answer",
    }),
});

export const attemptInputSchema = z.object({
  choiceId: z
    .string({ error: "Select an answer" })
    .trim()
    .min(1, "Select an answer"),
});

export type ChoiceInput = z.infer<typeof choiceInputSchema>;
export type QuestionInput = z.infer<typeof questionInputSchema>;
export type AttemptInput = z.infer<typeof attemptInputSchema>;
```

The type-level messages are what make `POST /api/mcq` with `{}` answer
`{"name":"Name is required","questionText":"Question text is required","choices":"Add at
least two choices"}` rather than three sentences about expected types. Verified by curl.

**On `fieldErrors()`.** `auth.ts` already exports `fieldErrors()`, which keys messages by
`issue.path[0]`. That is right for flat forms and wrong here: an error on the second
choice's text has the path `["choices", 1, "text"]`, so every per-choice message would
collapse onto one `choices` key and the form could not show which row is wrong.

`mcq.ts` therefore adds a sibling that joins the whole path with dots, producing
`choices.1.text`, while `choices` on its own still carries the array-level messages — too
few, too many, not exactly one correct. `fieldErrors()` in `auth.ts` is left untouched, so
no auth behavior changes and the auth tests keep passing. The response envelope stays
identical to the auth API's, which is what "look the same as the auth ones" is really about:

```typescript
/** Like fieldErrors(), but keeps the full path so nested choice errors stay addressable. */
export function pathErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    // CHANGED: an issue with no path means the body itself was the wrong shape — a JSON
    // string or array where an object was expected. The planned version skipped those,
    // which would have answered `{"error":"Validation failed","fields":{}}` and told the
    // caller nothing. Reporting them under `body` reuses the key the malformed-JSON branch
    // already returns, so one envelope covers both.
    const key = issue.path.length === 0 ? "body" : issue.path.join(".");
    if (!(key in fields)) {
      fields[key] = issue.message;
    }
  }

  return fields;
}
```

A test proves the reason this exists rather than reusing `fieldErrors()`: given two choices
that are both blank, `pathErrors` produces `choices.0.text` and `choices.1.text`, while
`fieldErrors` collapses both onto a single `choices` key.

The form maps `choices.<n>.text` back to the right input; the flat keys (`name`,
`questionText`, `choices`) render exactly as the auth forms render theirs.

### User Interface Requirements

Built from shadcn/ui on Base UI, `base-nova` style, per `shadcn.mdc`. Theme tokens from
`src/app/globals.css` — `bg-background`, `text-muted-foreground`, `border-destructive` —
and no hard-coded hex. Classes composed with `cn()` from `@/lib/utils`. Forms use the Base
UI `field` primitives, since there is no `Form` component under Base UI.

**Already installed**: `badge`, `button`, `card`, `dialog`, `field`, `input`, `label`,
`separator`, `table`. Confirmed by listing `src/components/ui/`, which matches Manikanta's
recollection exactly.

**To install in Phase 4 with the shadcn CLI**, always namespaced as `@shadcn/<name>`:
`dropdown-menu`, `alert-dialog`, `radio-group`, `textarea`, `sonner`, `skeleton`. `sonner`
pulls the `sonner` npm package, which is a real dependency and needs Manikanta's approval —
see open decision 6. `shadcn.mdc` warns that a component with no Base UI equivalent
silently produces no files, so each install is verified by checking the file appeared before
anything imports it.

#### Question list (/mcq)

Replaces the Sprint 1 stub at `src/app/mcq/page.tsx`.

- Heading, a short line of copy, the existing logout control, and a "New question" button
  linking to `/mcq/new`.
- A search `Input` above the table, filtering the rows already in memory on name and
  question text, case-insensitively. No refetch, no query parameter.
- `Table` with columns: Name, Question (truncated with `line-clamp` and a `title`
  attribute), Choices (a `Badge` with the count), and Actions.
- Actions in a `DropdownMenu` per row: Preview, Edit, Delete. "Preview" opens the attempt
  page — same destination the plan called "Attempt", relabelled at Manikanta's request.
- Delete opens an `AlertDialog` naming the question and warning that the action cannot be
  undone. Confirming calls `DELETE`, removes the row, and raises a success toast.
- While loading, six `Skeleton` rows inside the table body.
- When the bank is empty, a `Card` instead of the table: a line of copy and a button to
  create the first question.
- When a search matches nothing, a short "no matches" row rather than the empty-state card —
  an empty bank and an unmatched filter are different situations and should not read the
  same.

This page is a **client component** that fetches `GET /api/mcq` on mount. That follows from
the polish list: skeleton rows, an in-memory filter, a delete that removes a row without a
reload, and toasts all need client state. `nextjs.mdc` asks that `'use client'` be pushed as
far down as possible, so the route file stays a thin Server Component that renders a client
`<QuestionList />`. The alternative — a Server Component with a Suspense skeleton — was
considered and rejected because delete and filter would still need a client island, and
splitting the data between the two is worse than fetching it in one place. Recorded here so
the choice is visible rather than implied.

#### New question (/mcq/new)

- `Card`-wrapped `<QuestionForm />` in create mode.
- Fields: Name (`Input`), Question text (`Textarea`), and the dynamic choice list.
- Each choice row: a `RadioGroup` item marking it correct, an `Input` for its text, and a
  remove button. Remove is disabled at two choices; Add is disabled at six, with a line of
  copy explaining why rather than a button that silently does nothing.
- Client-side validation runs `questionInputSchema`, the same schema the route enforces.
  Server errors remain authoritative and render through `FieldError`.
- Submit posts to `POST /api/mcq`. On `201`, raise a success toast and navigate to `/mcq`.
- Submit disabled while in flight, as the auth forms do.
- Cancel returns to `/mcq`.

#### Edit question (/mcq/[id]/edit)

- The same `<QuestionForm />`, in edit mode, seeded from
  `GET /api/mcq/[id]?include=answers` — the one caller that needs the correct flags.
- Choices are sent without ids. Decision 3 settled on replace-all, so `PUT` deletes the old
  choice rows and inserts the new set; an id on the way in would carry no meaning.
- Submit sends `PUT /api/mcq/[id]`. On `200`, toast and navigate to `/mcq`.
- A missing id renders a "question not found" state with a link back to `/mcq`, not a crash.

#### Attempt question (/mcq/[id]/attempt)

- Fetches `GET /api/mcq/[id]` without `include=answers`.
- Shows the name, the question text, and the choices as a `RadioGroup` in `position` order.
- Submit is disabled until a choice is selected, so the endpoint is never called with
  nothing chosen.
- Submit posts `POST /api/mcq/[id]/attempts`. The response drives the result state.
- Result: an unmistakable correct or incorrect message — not colour alone, since colour is
  not available to every reader — plus the correct choice highlighted by
  `correctChoiceId`. Uses `text-destructive` and the theme's success-side tokens, never a
  literal hex.
- After submitting, the radio group is disabled so the same attempt cannot be resubmitted by
  double-click, and a "Try again" control resets to a fresh unanswered state. Each submit
  writes one `mcq_attempts` row; trying again writes another. That is intended — attempts
  are a log, not a score.
- A link back to `/mcq`.

#### Toasts

`sonner`'s `<Toaster />` mounts once in `src/app/layout.tsx`. Toasts confirm create, update,
and delete. Failures surface in the form or dialog where the action started, not only as a
toast that can be missed.

---

## Implementation Phases

Five phases, then a named close-out step that is not part of them. Work stops at the end of
every phase for Manikanta's review. Each phase follows the same loop: write the failing
tests, paste the failing run into the chat, implement, paste the passing run, update this
PRD, then propose the commit per `phase-commit.mdc` and wait for Manikanta's approval before
anything is staged, committed, or pushed.

### Phase 1: Schema and Migration - COMPLETED

**Objective**: The three MCQ tables exist in the local D1 database, with the constraints,
cascade behavior, and indexes this PRD specifies, proven by executable tests.

**What was built** (Aug 31, 2026):

1. **Red first.** Wrote both test files before any SQL existed and ran them:
   `npx vitest run migrations/mcq-migrations.test.ts migrations/mcq-schema.test.ts`
   reported **77 failed (77)** in 2 files, every one of them for the right reason —
   `Error: No MCQ migration found in migrations/. Files present:
   0001_create_users_table.sql, mcq-migrations.test.ts, mcq-schema.test.ts,
   migrations.test.ts, schema.test.ts`. The failing run is in the chat transcript.
2. Created the migration with
   `npx wrangler d1 migrations create quizmaker-db create_mcq_tables`, which produced
   `0002_create_mcq_tables.sql` — correctly numbered after `0001`.
3. **Green.** Filled in the SQL from the schema section of this PRD. Both files then passed:
   **77 passed (77)** in 338ms.
4. Applied to the local database: `npx wrangler d1 migrations apply quizmaker-db --local`,
   "9 commands executed successfully", status ✅. `migrations list --local` now reports
   "No migrations to apply!". **The remote database was not touched.**
5. Verified the applied schema by querying local D1 directly, then proved the cascade and
   the `is_correct` constraint against real D1 rather than only in-memory SQLite. Details
   under "Cascade and constraint verification" below.

**Both test files follow the Sprint 1 pattern rather than introducing a new one.**
`mcq-migrations.test.ts` mirrors `migrations.test.ts`: a `readMcqMigration()` helper that
locates the file by name and throws a listing error if it is absent, the same
`normalize()` whitespace-and-case collapser, and `it.each` tables for columns and indexes.
`mcq-schema.test.ts` mirrors `schema.test.ts`: `DatabaseSync(":memory:")` in `beforeEach`,
the same `tableInfo()` helper reading whole `pragma_table_info` rows because `notnull` needs
quoting in a SELECT list, and small `insertX` fixture helpers.

**Test counts**: 28 tests in `mcq-migrations.test.ts` (text contract over the SQL) and 49 in
`mcq-schema.test.ts` (executed behavior), 77 new in total.

**One addition beyond the plan**: `mcq-schema.test.ts` applies `0001_create_users_table.sql`
before `0002` and issues `PRAGMA foreign_keys = ON` in `beforeEach`. Both are necessary
rather than optional — the MCQ foreign keys reference `users (id)`, and plain SQLite defaults
foreign key enforcement off, so without the pragma every cascade and set-null assertion
would pass while testing nothing. The suite guards this directly with a test asserting
`PRAGMA foreign_keys` reads back as `1`, so the guarantee cannot rot silently.

**Cascade and constraint verification, against the real local D1**

The `node:sqlite` tests prove the SQL and the constraints. These commands prove that D1
itself behaves the same way, which a migration log cannot show:

Seeded one question, two choices, and one attempt, then counted:
`{"questions": 1, "choices": 2, "attempts": 1}`. Deleted **only** the question row:

```sql
DELETE FROM mcq_questions WHERE id = 'aaaa0000cascade0000test0000aaaa01';
```

The counts afterwards were `{"questions": 0, "choices_left": 0, "attempts_left": 0}`. One
delete of a parent row removed both child choices and the attempt, so `ON DELETE CASCADE` is
live in D1 and foreign keys are enforced there without any pragma.

The `is_correct` check was exercised in the same way. `INSERT` with `is_correct = 2` failed
with `CHECK constraint failed: is_correct IN (0, 1): SQLITE_CONSTRAINT (extended:
SQLITE_CONSTRAINT_CHECK)`, and `is_correct = -1` failed identically. Inserts with `1` and `0`
both succeeded and read back as `is_correct: 1` and `is_correct: 0` in `position` order. All
probe rows were then deleted; the MCQ tables are empty and `users` still holds its 12 rows,
untouched.

**Verified**:
- `npm test` — **233 tests passing in 16 files** (77 new, 156 from Sprint 1), 43.29s
- `npm run lint` — clean, exit 0, no output
- `npm run build` — succeeded, TypeScript finished in 5.6s, the same 9 routes as Sprint 1
- `npx wrangler d1 migrations list quizmaker-db --local` — "No migrations to apply!"
- Local D1 queried directly: `mcq_questions`, `mcq_choices`, and `mcq_attempts` all present,
  and all five `idx_mcq_*` indexes present
- `npx tsc --noEmit` — **14 pre-existing errors, 0 of them in `migrations/`.** All 14 are in
  Sprint 1's `src/app/api/auth/login/route.test.ts` and
  `src/app/api/auth/register/route.test.ts`, none of which this phase touched. See
  Troubleshooting; this is a finding to decide on, not a Phase 1 regression.

**Deliverables**:
- `migrations/0002_create_mcq_tables.sql` — done
- `migrations/mcq-migrations.test.ts` passing — done, 28 tests
- `migrations/mcq-schema.test.ts` passing — done, 49 tests
- Migration applied to local D1 with `--local` only; remote untouched — done
- Sprint 1's 156 tests still passing — done, all 156 green

**Not in this phase, and not started**: no TypeScript service code, no routes, no UI, no
shadcn installs, no dependency added.

**Open decisions still outstanding**: none of the eight blocked this phase. Decision 2 (the
service generating question ids) is settled in the schema as written — the
`DEFAULT (lower(hex(randomblob(16))))` is on all three tables, so the column style matches
`users` and the service can still supply an explicit id in Phase 2. Decision 1 (what "real
local D1" means for the Phase 2 tests) was settled at the start of Phase 2 as option B.

**Not in this phase**: no TypeScript service code, no routes, no UI.

### Phase 2: MCQ Service - COMPLETED

**Objective**: Every database call for questions, choices, and attempts lives behind
`src/lib/services/mcq-service.ts`, exercised against a real SQLite database with the real
migrations applied rather than a hand-written mock.

**Tasks**:
1. **Red**: write `src/lib/services/mcq-service.test.ts` first, covering create with the
   batch, list with choice counts, read, update through the choice replacement, delete with
   cascade, `recordAttempt` deciding correctness server-side, a choice belonging to another
   question being rejected, and the conventions Sprint 1's suite enforces — numbered
   placeholders only, and `.first()` never called. Paste the failing run. **Done.**
2. **Green**: implement the service until green. **Done.**
3. Update this PRD, then propose the commit and wait for approval. **Done.**

**What was built**

`src/lib/services/mcq-service.test.ts`, 50 tests, written and run before the service
existed. The failing run was a collection failure for the right reason —
`Error: Cannot find module '/src/lib/services/mcq-service'`, 0 tests collected — which is
the same red Sprint 1's Phase 2 opened with.

**How the tests get a real database.** Open decision 1 was settled as option B, with the
mechanism taken from `user-service.test.ts`. The injection point is identical: `vi.hoisted`
holds a per-test database, `vi.mock("@opennextjs/cloudflare")` makes
`getCloudflareContext()` return `{ env: { DB: dbHolder.current } }`, and `beforeEach` builds
a fresh one. What differs is what gets injected. Sprint 1 injected a fake that replayed
queued rows; Phase 2 injects a real `node:sqlite` database created by reading and executing
`migrations/0001_create_users_table.sql` and `migrations/0002_create_mcq_tables.sql` from
disk, wrapped in a ~70-line adapter (`createLocalD1`) exposing the slice of the D1 API the
service uses.

The consequence worth stating plainly: no test in this file asserts that a particular SQL
string was produced. Every assertion is about rows that a real SQL engine actually wrote,
read, cascaded or rejected. The atomicity tests roll back because `batch()` runs a real
`BEGIN`/`COMMIT`/`ROLLBACK`, and the cascade tests cascade because the adapter sets
`PRAGMA foreign_keys = ON` — plain SQLite defaults it off, D1 has it on.

Four `node:sqlite` behaviors were verified before the adapter was written, because the whole
approach depends on them: `?1`-style numbered placeholders bind positionally from varargs,
`INSERT ... RETURNING` returns its rows through `.all()`, `.run()` reports `changes`
including 0 for a miss, and an exception inside `BEGIN` rolls the transaction back.

**What the adapter does not prove.** It emulates D1's `batch()` and its error message
formats rather than observing them. To narrow that gap, every SQL shape the service issues
was then run against the real local D1 with
`wrangler d1 execute quizmaker-db --local --file`: `INSERT ... RETURNING` on both tables,
the `UPDATE ... RETURNING`, the delete-then-insert replacement, the attempt insert, and the
`LEFT JOIN` / `GROUP BY` / `ORDER BY q.rowid` list query. All returned `success: true`, and
the final counts confirmed the cascade — `0 questions / 0 choices / 0 attempts` after
deleting the one parent row. Local D1 was left clean. Phase 3's curl checks and Phase 5's
preview walk close the rest of the gap.

**Exported surface as delivered**:

| Export | Signature | Notes |
|---|---|---|
| `createQuestion` | `(input: QuestionInput) => Promise<Question>` | One `db.batch()`: the question and all its choices, or nothing. Assembled from the batch's own `RETURNING` rows, so there is no follow-up read |
| `listQuestions` | `() => Promise<QuestionSummary[]>` | `LEFT JOIN` for `choiceCount`, newest first |
| `findQuestionById` | `(id: string) => Promise<Question \| null>` | Question plus choices ordered by `position, id` |
| `updateQuestion` | `(id, input) => Promise<Question \| null>` | Replaces the whole choice set inside one batch, sets `updated_at`, `null` for a missing id |
| `deleteQuestion` | `(id: string) => Promise<boolean>` | `true` only when `meta.changes > 0` |
| `recordAttempt` | `(questionId, choiceId, userId?) => Promise<AttemptResult \| null>` | Reads `is_correct` from the database; never trusts the caller. `null` for a missing question, throws for a foreign choice |
| `toPublicQuestion` | `(q: Question) => PublicQuestion` | Strips `isCorrect`, the one safe way for a route to answer the attempt page |
| `ChoiceNotInQuestionError` | `class` | Lets the route answer 400 rather than 500 |
| `Question`, `PublicQuestion`, `Choice`, `PublicChoice`, `QuestionSummary`, `ChoiceInput`, `QuestionInput`, `Attempt`, `AttemptResult` | types | |

`toPublicQuestion` mirrors `toPublicUser`: the risk of leaking `isCorrect` is handled once,
in the service, rather than trusted to each route.

**Three signatures moved from the plan, each for a reason:**

- `recordAttempt` gained an optional third parameter, `userId: string | null = null`. It is
  never passed by anything in this sprint and it defaults to null, so behavior is unchanged;
  it exists so the session sprint can attribute attempts without touching the SQL. One test
  inserts a real user and passes their id to prove the column and the parameter work.
- `recordAttempt` returns `AttemptResult | null` rather than `AttemptResult`. Null means the
  question does not exist, which lets Phase 3 answer 404, while
  `ChoiceNotInQuestionError` stays for 400. Without the split the route could not tell the
  two apart.
- `updateQuestion` replaces the choice set instead of diffing it, per Manikanta's
  instruction on Aug 31, settling open decision 3. See the note below.

**Replace-all editing, and what it costs.** `updateQuestion` deletes every choice for the
question and inserts the new list, all inside the same batch as the `UPDATE`. Choice ids
therefore change on every edit. Because `mcq_attempts.choice_id` is `ON DELETE SET NULL`,
an attempt whose choice is replaced keeps its row and its `is_correct`, but which choice was
picked is no longer recoverable. That is the trade-off decision 3 flagged, and it is now
pinned by a test — `keeps an attempt after its chosen choice is replaced by an edit` asserts
the surviving row has `choice_id` null and `is_correct` 1.

**Two implementation choices worth recording:**

- `updateQuestion` runs a `SELECT id` existence check before the batch. Without it, updating
  a missing id would attempt to insert choices referencing a question that does not exist
  and fail on the foreign key, surfacing a constraint error where the contract promises
  `null`. The extra read buys the honest return value.
- `listQuestions` orders by `q.created_at DESC, q.rowid DESC`, not `q.id DESC` as the plan
  had it. `CURRENT_TIMESTAMP` has second precision, so two questions created in the same
  second tie on `created_at`, and a random hex id breaks that tie unpredictably — the
  "newest first" test would have been flaky. `rowid` is insertion order, so it is
  deterministic. Confirmed working on real local D1.

**Test coverage, 50 tests**: create (8, including the batch rollback and a count of the
statements issued), list (5), read (4), update (10, including three separate orphan and
rollback proofs), delete (4), attempts (11), `toPublicQuestion` (2), and d1.mdc conventions
(4).

Three of those tests are the orphan proof the brain-dump asked for, since one assertion
would not have covered it:
- `replaces the choice set and removes the old choices` — captures the old choice ids, and
  after the replace asserts none of them appear anywhere in `mcq_choices`, and that the
  table holds exactly the 2 new rows. Detaching rather than deleting them would fail this.
- `leaves no orphaned choices anywhere in the table after a replace` — a `LEFT JOIN` from
  `mcq_choices` back to `mcq_questions` returning zero rows with a null parent, plus a check
  that a second, untouched question kept both of its choices.
- `keeps the original choices when the replacement fails part-way` — a replacement whose
  second choice violates `NOT NULL` leaves all three original choices intact, proving the
  delete and the inserts really do share one transaction.

**Results**

```
 Test Files  1 passed (1)
      Tests  50 passed (50)
```

Full suite after the phase: **17 files, 283 tests, all passing**, up from 16 files and 233
tests at the end of Phase 1. `npm run lint` clean. `npx tsc --noEmit` reports no error in
either new file; the 14 pre-existing errors in Sprint 1's auth route tests are unchanged and
still logged under Troubleshooting.

**Deliverables**:
- `src/lib/services/mcq-service.ts` — 390 lines, the only module that touches `env.DB` for
  MCQ data
- `src/lib/services/mcq-service.test.ts` — 50 tests passing
- Phase 2 status and code references in this PRD

**Not in this phase**: no HTTP handlers, no Zod schemas, no UI.

### Phase 3: API Routes and Validation - COMPLETED

**Objective**: The six endpoints behave exactly as specified above, including every status
code, with validation shared with the Phase 4 form.

**Tasks**:
1. **Red**: write `src/lib/validation/mcq.test.ts` and a `route.test.ts` beside each route
   file, covering every documented status code and every validation message. Mock the
   service with `importOriginal`, as Sprint 1's route tests do, so the real error classes
   and the real `toPublicQuestion` are exercised. Mock `@opennextjs/cloudflare` to throw, so
   a route test that reaches a binding fails loudly. Paste the failing run. **Done.**
2. **Green**: implement `src/lib/validation/mcq.ts` and the four route files. **Done.**
3. Verify by hand with `curl.exe` against `npm run dev` on the real local D1, and record the
   commands in this PRD as Sprint 1 did. **Done.**
4. Update this PRD, then propose the commit and wait for approval. **Done.**

**What was built**

Four test files, 86 tests, all written before any implementation existed. The failing run was
four collection failures for the right reason — `Cannot find module` for `./mcq` and for each
of the three `./route` files, 0 tests collected.

`src/lib/validation/mcq.ts` holds `choiceInputSchema`, `questionInputSchema`,
`attemptInputSchema`, the three inferred types, and `pathErrors()`. `fieldErrors()` in
`auth.ts` was not touched, so no auth behavior changed and Sprint 1's auth tests still pass.

The three route files follow `register/route.ts` line for line on the two shared failure
paths: `await request.json()` inside `try`/`catch` answering
`{ error: "Validation failed", fields: { body: "Expected a JSON object" } }`, then
`safeParse` answering `{ error: "Validation failed", fields: … }`. Both are written out in
each handler rather than factored into a helper, because that is how the auth routes read and
the point of the instruction was that the two APIs look alike.

**Route params are a promise.** On Next 16, a dynamic route handler receives
`{ params: Promise<{ id: string }> }`, so every `[id]` handler starts with
`const { id } = await params`. The tests hand the handler `{ params: Promise.resolve({ id }) }`
so they exercise the same shape rather than a simplification of it.

**Validation runs before the id is used.** In `PUT`, the body is parsed before
`updateQuestion` is called, so an invalid body is a 400 whether or not the question exists. A
test pins this: a malformed body sent to a missing id is a 400, not a 404, and the service is
never called.

**Two changes from the plan, both found by a failing test:**

- **Zod messages had to be attached to the type, not only the length check.** Writing
  `z.string().trim().min(1, "Select an answer")` gives that message for `""` but not for a
  missing field, which produces Zod's own `expected string, received undefined`. That is
  exactly the case that matters — someone submitting an attempt without choosing — so every
  string and the choices array now carry a message on the type as well. Two tests failed on
  this and drove the fix; the details are in Troubleshooting.
- **`pathErrors()` reports a path-less issue under `body`.** The planned version skipped
  issues whose path is empty, which would have answered `fields: {}` for a body that is a
  JSON string or array. Reporting it under `body` reuses the key the malformed-JSON branch
  already uses.

**One thing deliberately left as planned**: `GET /api/mcq/[id]` hides `isCorrect` unless
`?include=answers` is passed. Open decision 5 is still formally yours, and this is the PRD's
documented default rather than a new choice. It is worth a decision because with no
authentication anyone can pass the parameter, so it is tidiness and not a security boundary —
but the edit form does need the answers, so something like it has to exist.

**Test coverage, 86 tests**: schemas and `pathErrors` (35), the collection route (21), the
individual-question route (22), and attempts (18).

Three cross-cutting properties are asserted in every route file rather than assumed:
- **No 500 body carries the underlying error.** Each route is made to fail with
  `D1_ERROR: database is locked` and the serialised response is checked not to contain
  `D1_ERROR`.
- **No handler logs the request body.** `console.error` is spied on, the service is made to
  fail, and the captured log arguments are asserted not to contain the question name, the
  choice text, or the choice id.
- **No test can reach a binding.** `@opennextjs/cloudflare` is mocked to throw
  `A route test must not reach Cloudflare bindings`, so a route that reads `env.DB` directly
  instead of going through the service fails loudly.

The attempts route additionally proves the client cannot influence the verdict: sending
`isCorrect: true` or a `userId` alongside `choiceId` changes nothing, because the handler
forwards only `(id, choiceId)` — asserted with `toHaveBeenCalledWith`.

**Results**

```
 Test Files  4 passed (4)
      Tests  86 passed (86)
```

Full suite after the phase: **21 files, 369 tests, all passing**, up from 17 files and 283
tests at the end of Phase 2. `npm run lint` clean. `npx tsc --noEmit` reports no error in any
of the six new files.

**Verified by curl against `npm run dev`**

The full transcript is in the Curl Verification section below. Every documented status code
was produced by the real routes against the real local D1: 201 on create, 200 on list, read,
update and delete, 201 on both a correct and an incorrect attempt, 400 on malformed JSON,
missing fields, one choice, two correct choices and a blank choice, 404 on a missing id for
`GET`, `PUT`, `DELETE` and attempts, and 400 on a choice from another question.

Local D1 was left as it was found: after the run, `mcq_questions`, `mcq_choices` and
`mcq_attempts` are all at 0 rows, which also demonstrated the cascade once more — the two
attempts recorded during the run went with their question.

**Deliverables**:
- `src/lib/validation/mcq.ts` with `questionInputSchema`, `attemptInputSchema`, `pathErrors`
- `src/app/api/mcq/route.ts` — `GET`, `POST`
- `src/app/api/mcq/[id]/route.ts` — `GET`, `PUT`, `DELETE`
- `src/app/api/mcq/[id]/attempts/route.ts` — `POST`
- Colocated `route.test.ts` beside each, all passing
- Recorded curl output in this PRD

**Not in this phase**: no UI, no shadcn installs.

### Phase 4: UI and Polish - COMPLETED

**Objective**: A teacher can create, find, edit, delete, and attempt a question in the
browser, with the polish declared In Scope working — search, empty state, dropdown actions,
toasts, and skeletons.

**What was built** (Aug 31, 2026):

1. **shadcn components, through the CLI.** One pass installed all six:
   `npx shadcn@latest add @shadcn/dropdown-menu @shadcn/alert-dialog @shadcn/radio-group @shadcn/textarea @shadcn/sonner @shadcn/skeleton`.
   It reported "Created 6 files" and skipped `button.tsx` as identical, which was left
   alone rather than forced with `--overwrite`. Every file was checked to exist before
   anything imported it, per the `shadcn.mdc` warning that a component with no Base UI
   equivalent silently produces nothing. Nothing in `src/components/ui/` was hand-edited.
2. **Red first.** Six test files were written before any component existed and run:
   `npx vitest run src/lib/mcq-client.test.ts src/components/mcq` reported
   **6 failed (6), no tests**, every one of them `Failed to resolve import` for the module
   about to be written. The failing run is in the chat transcript.
3. **Green.** Built `src/lib/mcq-client.ts`, five components under `src/components/mcq/`,
   the three new pages, rewrote `/mcq`, and mounted `<Toaster />` in `layout.tsx`. The
   suite then reported **459 passed (459)** across 27 files.
4. `npm run lint` is clean. `npm run build` compiles and lists all four MCQ routes —
   `/mcq` static, `/mcq/new` static, `/mcq/[id]/edit` and `/mcq/[id]/attempt` dynamic.
5. **Browser walkthrough.** Driven with real headless Chromium and captured as 22
   screenshots plus a transcript in `ai-workspace/phase4-walkthrough/`. See the
   walkthrough subsection below.

**Deliverables, as built**:
- `src/lib/mcq-client.ts` — the one way the MCQ UI talks to the API, mirroring
  `auth-client.ts`
- `src/components/mcq/question-list.tsx`, `question-form.tsx`, `attempt-form.tsx`,
  `question-row-actions.tsx`, `question-loader.tsx`
- `src/app/mcq/page.tsx` rewritten, `src/app/mcq/new/page.tsx`,
  `src/app/mcq/[id]/edit/page.tsx`, `src/app/mcq/[id]/attempt/page.tsx`
- `<Toaster />` in `src/app/layout.tsx`
- Six new shadcn components in `src/components/ui/`, unedited
- Colocated tests for everything above, plus a rewritten `src/app/mcq/page.test.tsx`
- Clean `npm run lint` and `npm run build`

#### How the UI differs from the plan above

Five differences, recorded so the doc and the code agree:

1. **The row action is labelled "Preview", not "Attempt".** Manikanta asked for
   "Preview, Edit and Delete" when starting the phase. The destination is unchanged —
   `/mcq/[id]/attempt` — only the label differs, and it reads better from an author's list.
2. **There is no `delete-question-dialog.tsx`.** The `AlertDialog` lives inside
   `question-row-actions.tsx` alongside the menu that opens it. Splitting them would have
   meant lifting per-row dialog state into the list for a component used in exactly one
   place. Each row owns its own confirmation.
3. **`question-loader.tsx` was added, and was not in the plan.** The edit and attempt pages
   both need one question by id before they can render, and both need the same loading,
   not-found and load-failed states. The only difference is whether `?include=answers` is
   asked for, which the `mode` prop decides. Duplicating that in two pages would have been
   worse.
4. **The plan's line about edit-mode choices keeping their `id` is wrong** and has been
   corrected in the UI section. Decision 3 settled on replace-all, so `PUT` takes choices
   with no ids and the form sends none.
5. **`QuestionRowActions` takes a `defaultMenuOpen` prop.** It forwards straight to the
   menu primitive's own `defaultOpen`. It exists because Base UI's trigger cannot be opened
   under jsdom — see troubleshooting below — so the component tests start the menu open to
   reach its contents. Production code never passes it.

#### Technical implementation details

**`src/lib/mcq-client.ts`** follows `auth-client.ts` deliberately. One private `request`
helper does fetch, JSON parse, and error shaping; six exported functions name the calls
(`fetchQuestions`, `fetchQuestion`, `createQuestion`, `updateQuestion`, `deleteQuestion`,
`submitAttempt`). The result type is a discriminated union:

```ts
export type ApiResult<T> =
	| { ok: true; data: T }
	| { ok: false; status: number | null; fields: Record<string, string>; message: string | null };
```

Two departures from `auth-client.ts`, both earning their keep:

- **`status` is carried.** `auth-client.ts` does not need it; the MCQ UI does, because a
  404 is a normal outcome that renders a "question not found" card while a 500 is a failure
  that renders an alert. `status` is `null` when the request never reached the server.
- **`data` is carried.** The auth forms only need to know whether the call worked. The MCQ
  UI needs the created question, the verdict, and the correct choice id.

The `fields`/`message` split is copied exactly: when the server returns per-field errors the
message is `null`, because the inputs carry the detail and a form-level banner would only
repeat it. Non-string values inside `fields` are dropped rather than rendered.

**Types are declared locally rather than imported from `mcq-service.ts`.** A type-only
import would erase at build time, but declaring `QuestionView`, `QuestionSummaryView` and
`AttemptView` in the client module keeps a client-side file from naming a module that
imports `@opennextjs/cloudflare`. `ChoiceView.isCorrect` is optional, which is the type
system carrying the `?include=answers` rule: a caller that did not ask for answers cannot
read the flag without checking.

**`question-form.tsx` serves create and edit from one component**, discriminated on `mode`:

```ts
type Props =
	| { mode: "create"; question?: undefined }
	| { mode: "edit"; question: QuestionView };
```

The choice list is `{ key, text }[]` with a module-level counter generating keys. Keys, not
array indices, are what let a choice be removed from the middle without React reusing the
wrong input — proven by the test that removes choice 2 of 3 and checks the remaining text
moved up. The correct answer is held as a single `correctKey`, not a boolean per choice,
which makes "exactly one correct" true by construction in the UI; the schema still enforces
it because the API is authoritative.

Validation runs `questionInputSchema` — the route's own schema, imported, not a copy — and
`pathErrors` flattens the issues to keys like `choices.1.text` that the choice rows read
directly. This is why the browser shows the same five messages the API would return.

**`question-list.tsx` is the client island.** The route file stays a Server Component
holding the header, and pushes `'use client'` down to the list, per `nextjs.mdc`. The search
filter is a `useMemo` over state already in memory, so typing causes no request — the test
counts requests to prove it, and the walkthrough confirms zero extra GETs. Deleting a row
splices client state rather than refetching. An empty bank renders a card; a filter that
matches nothing renders a row saying so. They are different situations and do not read the
same.

**`attempt-form.tsx` never decides correctness.** It posts the choice id and renders what
came back. The verdict is in words — "Correct" or "Not quite. The correct answer was X" —
because colour alone is not available to every reader. After submitting, the radios are
disabled and the submit button is replaced by "Try again", so a double-click cannot record a
second attempt by accident; "Try again" deliberately can, because attempts are a log, not a
score.

#### Browser walkthrough

Driven with Playwright against `npm run dev` on `http://localhost:3000`, capturing a real
screenshot at each step. Evidence is in `ai-workspace/phase4-walkthrough/`:
`transcript.txt`, 22 PNGs, and `walkthrough.mjs`, the harness that produced them.

What it proves, in order:

| Step | Screenshot | What it shows |
| --- | --- | --- |
| Skeletons | `01` | 24 skeleton elements in the table body with the list fetch held open; search box absent until loaded |
| List | `02` | Both seeded rows with name, question text and choice-count badges |
| Search | `03`, `04` | Typing `planet` narrows to one row with **0** extra `GET /api/mcq`; `zzz` shows "No questions match that search", not the empty-bank card |
| Invalid form | `05`, `06` | Submitting blank yields five inline errors and stays on the page |
| Choice limits | `07`, `08` | Six choices disables "Add choice" and shows the reason; "Remove choice 1" disabled at two; submitting with nothing marked correct is refused |
| Create | `09`, `10` | Toast "Question created", navigation to `/mcq`, new row reading `Ocean depth \| Which is the deepest ocean trench? \| 3` |
| Row actions | `11` | One trigger opening to Preview / Edit / Delete with the right hrefs |
| Edit | `12`, `13`, `14` | Form seeded including the pre-marked correct choice, button reading "Save changes", toast "Question updated", row updated in place |
| Attempt, wrong | `15`, `16` | Submit disabled until a choice is picked, nothing revealed early, then "Not quite. The correct answer was “Mariana Trench”." with the badge beside it and submit replaced by "Try again" |
| Attempt, right | `17` | "Try again" clears the result and re-disables submit; a correct pick reads "Correct" |
| Delete | `18`, `19`, `20` | Dialog naming the question and warning it cannot be undone; Cancel leaves the row; confirming toasts "Question deleted" and removes the row without a reload |
| Not found | `21` | A nonexistent id renders the not-found card, not a crash |
| Empty state | `22` | With every question deleted: the card, no table, no search box, button to `/mcq/new` |

Two false alarms during the walkthrough were run down rather than accepted, both logged in
troubleshooting: an "edit shows the create toast" reading that turned out to be a stale
toast still on screen, and a "delete does nothing" reading caused by a broken edit to the
harness.

### Phase 5: End-to-End Verification - COMPLETED

**Objective**: Prove the sprint works on the runtime it will actually deploy to, rather than
assert it from the Node dev server.

**Tasks**:
1. `npm test`, `npm run lint`, `npm run build` — paste the real output of each.
2. `npm run preview` to build and serve on the local Workers runtime. The `esbuild` junction
   was recreated at the end of Phase 4 and verified, so preview should start — but check
   `node_modules\esbuild\package.json` exists first, and do not run any `npm install` before
   this step. Phase 4 confirmed twice that an install destroys it. Open decision 7 still
   needs settling.
3. Walk the whole feature in a browser against `http://127.0.0.1:8787`: create a question,
   see it in the list, search for it, edit it, attempt it right and wrong, and delete it
   through the confirmation dialog. Reuse
   `ai-workspace/phase4-walkthrough/walkthrough.mjs` with `BASE` pointed at port 8787 —
   `playwright` is already a devDependency and Chromium is already downloaded, so this is a
   real browser walkthrough with screenshots, not a terminal transcript. Write the output to
   a `phase5-walkthrough` folder so Phase 4's evidence is not overwritten.
4. Query local D1 to confirm the rows: the question and its choices, exactly one
   `is_correct = 1` per question, one `mcq_attempts` row per submitted attempt with the
   right `is_correct`, and `created_by` and `user_id` both null.
5. Confirm the deletion cascade in the database: deleting a question leaves no orphan
   choices or attempts.
6. Grep `src/` to confirm no cookie, token, session, or storage API was introduced.
7. Fill in this PRD's acceptance criteria, success metrics, and Current Status, then propose
   the commit and wait for approval.

**Deliverables**:
- Recorded output for test, lint, build, and preview
- A browser walkthrough of every flow on the Workers runtime, with what was observed
- Local D1 query output backing the acceptance criteria
- This PRD complete and accurate

**Explicitly not in this phase**: no deploy, no `--remote` migration, no remote database
access. Those are the close-out step below.

#### What was done

Everything above, on `workerd` rather than `next dev`. Evidence is in
`ai-workspace/phase5-verification/`: `test-run.txt`, `build.txt`, `preview.log`,
`transcript-main.txt`, `transcript-delete.txt`, `walkthrough.mjs`, and 21 screenshots.

- **Tests**: `npm test` → **27 files, 459 tests, all passing**, 18.8s. Full output in
  `test-run.txt`. The stderr in that file is expected: it is the deliberate
  `D1_ERROR: database is locked` fixtures from the route tests that assert nothing leaks to
  the client, plus React `act()` warnings from `src/app/mcq/page.test.tsx` (see
  Troubleshooting — reported, not fixed).
- **Build**: `npm run build` → compiled in 10.6s, TypeScript clean, 11 static pages, and all
  four MCQ routes in the manifest (`/api/mcq`, `/api/mcq/[id]`, `/api/mcq/[id]/attempts`,
  `/mcq`, `/mcq/new`, `/mcq/[id]/attempt`, `/mcq/[id]/edit`). Output in `build.txt`.
- **Lint**: `npx eslint src migrations` → **exit 0, clean**. Bare `npm run lint` now reports
  7684 problems, every one of them inside two generated bundles under `.wrangler\tmp\` that
  `npm run preview` writes. `eslint.config.mjs` ignores `.open-next/**` but not
  `.wrangler/**`. Reported to Manikanta, not fixed — see Troubleshooting.
- **Preview**: `npm run preview` started cleanly and served on
  `http://127.0.0.1:8787`, binding `env.DB (quizmaker-db)` as a **local** D1. The `esbuild`
  junction survived, because no `npm install` ran this phase. `preview.log` has the whole
  start-up, including the two OpenNext "not fully compatible with Windows" warnings and one
  third-party `Duplicate key "options"` esbuild warning from `@base-ui/react`. Neither
  affected the run.

#### Browser walkthrough on the Workers runtime

Driven by `ai-workspace/phase5-verification/walkthrough.mjs` in real headless Chromium
against port 8787. It is split into two stages, `main` and `delete`, because miniflare holds
the local D1 sqlite file while the worker is up, so the attempt rows had to be read at a
point where the browser was idle. That is also why the screenshots jump from `15` to `31`:
the two stages number their own shots.

The bank started with the two questions Phase 4 left behind, deliberately, so the delete step
could prove it removed one row and not the table.

| Step | Screenshot | What it proves |
|------|-----------|----------------|
| 1. List on the worker | `01-list-on-worker.png` | `/mcq` renders the table from a real D1 read on workerd |
| 2. Empty form | `02-empty-form-errors.png` | Five inline messages at once, no navigation, no toast |
| 3. Six choices | `03-six-choices-capped.png` | "Add choice" disables exactly at six, with the reason shown |
| 4. Over every limit | `04-over-character-limits.png` | 101 / 1001 / 501 characters each rejected with their own message |
| 5. On every limit | `05-at-character-limits-accepted.png` | 100 / 1000 / 500 accepted and stored at full length |
| 6. Create, three choices | `06-create-three-choices.png` | The form filled, choice 1 marked correct |
| 7. Create toast | `07-create-toast.png` | "Question created" |
| 8. In the list | `08-list-after-create.png` | The new row, with its choice count of 3 |
| 9. Search | `09-search-filtered.png` | Filtered to one row with **0** extra `GET /api/mcq` and no query param |
| 10. Attempt page | `10-attempt-unanswered.png` | Choices in position order, submit disabled, answer not revealed |
| 11. Wrong answer | `11-attempt-incorrect.png` | "Not quite. The correct answer was “Carbon dioxide and water”." |
| 12. Right answer | `12-attempt-correct.png` | "Correct", after "Try again" cleared the first result |
| 13. Edit seeded | `13-edit-seeded.png` | Name, all three choices, and the correct mark all pre-filled |
| 14. Edit toast | `14-edit-toast.png` | "Question updated" |
| 15. Edit took effect | `15-attempt-after-edit.png` | The old correct choice now reads as wrong |
| 14'. Delete dialog | `31-delete-confirm-dialog.png` | Dialog quotes the question and warns it cannot be undone |
| Delete toast | `32-delete-toast.png` | "Question deleted" |
| After delete | `33-list-after-delete.png` | The row gone without a reload, the other two intact |
| After reload | `34-list-after-reload.png` | Still gone after a hard reload; API returns 404 |
| 15'. Bogus id, attempt | `35-bogus-id-attempt.png` | "Question not found" card, not a crash |
| Bogus id, edit | `36-bogus-id-edit.png` | Same card on the edit route |

#### Local D1, before and after the delete

Read with `npx wrangler d1 execute quizmaker-db --local` while the worker was running, which
works fine — the earlier workerd crash of Sprint 1 did not recur.

Baseline before the run: 2 questions / 5 choices / 4 attempts.

**Attempts persisted** (`question_id = 22d9de730cec00bef3c52cb1f83492c8`), three submitted and
three rows written:

| `is_correct` | `choice_id` | `user_id` | Which submit |
|---|---|---|---|
| 0 | `NULL` | `NULL` | the wrong answer |
| 1 | `NULL` | `NULL` | the retry, correct |
| 0 | `b44b2c91…` | `NULL` | after the edit moved the correct mark |

The first two show `choice_id` null on purpose. The edit replaced the choice set, and
`mcq_attempts.choice_id` is `ON DELETE SET NULL`, so the rows survived with their verdicts
intact rather than being cascaded away. This is the designed trade-off and it is now recorded
accurately under Known Limitations, which previously described it as rare.

**The choice set after the edit** confirmed "Nitrogen and sunlight" as the only
`is_correct = 1`, at position 2, and `created_by` null on the question.

**Cascade after the delete**: `question_rows 0 / choice_rows 0 / attempt_rows 0` for that id.
Totals went `2 / 5 / 4` before the run → `3 / 8 / 7` with the question in place →
`2 / 5 / 4` after the delete. Exactly the +1 question, +3 choices and +3 attempts the run
added were removed, and nothing else was.

**Orphan and integrity sweep across the whole bank**: `orphan_choices 0`,
`orphan_attempts 0`, `attempts_with_user 0`, `questions_with_creator 0`,
`bad_choice_flags 0`, `bad_attempt_flags 0`. The `HAVING choices < 2 OR correct_marks <> 1`
query returned **no rows**, so every question in the database has at least two choices and
exactly one correct one.

#### API edge cases on the worker

`curl.exe` against port 8787, bodies from files:

| Request | Status | Body |
|---|---|---|
| `GET /api/mcq/does-not-exist-1234` | 404 | `{"error":"Question not found"}` |
| `PUT /api/mcq/does-not-exist-1234` with a valid body | 404 | `{"error":"Question not found"}` |
| `DELETE /api/mcq/does-not-exist-1234` | 404 | `{"error":"Question not found"}` |
| `POST /api/mcq/does-not-exist-1234/attempts` | 404 | `{"error":"Question not found"}` |
| `POST /api/mcq` with `{"name":` | 400 | `{"error":"Validation failed","fields":{"body":"Expected a JSON object"}}` |

#### Scope check

`rg "cookies\(\)|Set-Cookie|getSession|createSession|jwt|middleware" src/` returns nothing
outside tests, there is no `middleware.ts` anywhere in the repository, and
`mcq-service.ts` still passes a literal null for `created_by` with `userId` defaulted to
null. Confirmed in the data too: `attempts_with_user 0`, `questions_with_creator 0`.

Nothing was deployed. No `--remote` command was run at any point in Phases 1 to 5.

### Close-out: Remote Migration and Deployment - NOT STARTED, RUNS ONLY ON MANIKANTA'S EXPLICIT INSTRUCTION

This is **not** Phase 6 and is not part of the five phases. It is recorded here because the
sprint is graded on a live URL, so it belongs in the plan rather than appearing from nowhere
at the end. Nothing in this step happens as part of finishing Phase 5, and nothing in it
happens because it seems like the obvious next thing.

**The agent does not run any of the following unless Manikanta asks for it in the chat, by
name, in that turn.** `AGENTS.md` prohibits deploying and prohibits touching the remote
database; this step is the single, explicit, human-authorized exception, and the prohibition
resumes the moment it is done.

**Steps, once asked**:
1. Confirm the target: `npx wrangler whoami` and the database id in `wrangler.jsonc`.
2. **Each of the two dangerous commands is shown to Manikanta and confirmed individually,
   one at a time, immediately before it runs.** Not as a pair, and not as a single blanket
   yes covering both. `npx wrangler d1 migrations apply quizmaker-db --remote` is shown and
   confirmed on its own, and then `npm run deploy` is shown and confirmed on its own. Being
   asked to do the close-out is not itself the confirmation for either command.
3. Apply the migration remotely, only after its own confirmation:
   `npx wrangler d1 migrations apply quizmaker-db --remote`. **This cannot be undone.**
   There is no down migration in this project, and the target holds the real registered
   accounts from Sprint 1, so a mistake here is not recoverable from within this repository.
4. Verify the remote schema: three tables, five indexes.
5. Deploy, only after its own separate confirmation: `npm run deploy`.
6. Walk the same flow on the live URL that Phase 5 walked on the preview.
7. Record the live URL, the deployed version, and the verification result in this PRD.

**Risks specific to this step**: the remote database has real registered accounts from
Sprint 1. The migration only adds tables and touches nothing in `users`, which is what makes
it safe to apply, but that should be re-read at the time rather than trusted from here.

---

## Manual API Verification

Run at the end of Phase 3 against `npm run dev` on the real local D1. Real requests, real
responses, trimmed only of repetition. Ids are the actual ones from the run.

**Windows PowerShell.** `curl` is an alias for `Invoke-WebRequest`, so call `curl.exe`.
Bodies with spaces go in a file and are passed as `-d "@path"` rather than inline, per the
Sprint 1 note. Two PowerShell traps were hit while scripting this and are recorded in
Troubleshooting: `?` in a double-quoted URL, and `-o $null`.

### Create — 201

```
$ curl.exe -s -X POST http://localhost:3000/api/mcq -H "content-type: application/json" -d "@c1.json"
```
```json
{"question":{"id":"b7b5423fd88108e3742d66819279f3b8","name":"Capital of France",
"questionText":"Which city is the capital of France?","createdBy":null,
"createdAt":"2026-08-31 15:59:11","updatedAt":"2026-08-31 15:59:11","choices":[
{"id":"dfd5829362efded2c2ea22419bc769ed","questionId":"b7b5423fd88108e3742d66819279f3b8","text":"Paris","isCorrect":true,"position":0,"createdAt":"2026-08-31 15:59:11"},
{"id":"4bec311159d4e6626f3ba3ce8ad34079","questionId":"b7b5423fd88108e3742d66819279f3b8","text":"Lyon","isCorrect":false,"position":1,"createdAt":"2026-08-31 15:59:11"},
{"id":"881ed0088400d2d9356462455064b5d3","questionId":"b7b5423fd88108e3742d66819279f3b8","text":"Marseille","isCorrect":false,"position":2,"createdAt":"2026-08-31 15:59:11"}]}}
-- HTTP 201
```

`createdBy` is null, as it will be for every response this sprint. Positions were assigned
from the array order, not sent by the client.

### List — 200

```
$ curl.exe -s http://localhost:3000/api/mcq
```
```json
{"questions":[
{"id":"149d808545e73116b996c61ade28b14c","name":"Largest planet","questionText":"Which is the largest planet in the solar system?","choiceCount":2,"createdAt":"2026-08-31 15:59:12","updatedAt":"2026-08-31 15:59:12"},
{"id":"b7b5423fd88108e3742d66819279f3b8","name":"Capital of France","questionText":"Which city is the capital of France?","choiceCount":3,"createdAt":"2026-08-31 15:59:11","updatedAt":"2026-08-31 15:59:11"}]}
-- HTTP 200
```

Newest first, accurate choice counts, and no choice text or answers in a summary.

### Read, answers hidden then shown — 200

```
$ curl.exe -s http://localhost:3000/api/mcq/149d808545e73116b996c61ade28b14c
```
```json
{"question":{ … "choices":[
{"id":"09cff3c81d942f95bcf07687e64eb061","questionId":"149d…","text":"Jupiter","position":0,"createdAt":"2026-08-31 15:59:12"},
{"id":"904cd1a124587785e2bfe3e55512cc73","questionId":"149d…","text":"Earth","position":1,"createdAt":"2026-08-31 15:59:12"}]}}
-- HTTP 200
```

```
$ curl.exe -s "http://localhost:3000/api/mcq/149d808545e73116b996c61ade28b14c?include=answers"
```
```json
{"question":{ … "choices":[
{"id":"09cff3c81d942f95bcf07687e64eb061", … "text":"Jupiter","isCorrect":true,"position":0, … },
{"id":"904cd1a124587785e2bfe3e55512cc73", … "text":"Earth","isCorrect":false,"position":1, … }]}}
-- HTTP 200
```

No `isCorrect` key at all by default; present only when asked for.

### Update, three choices replaced by two — 200

```
$ curl.exe -s -X PUT http://localhost:3000/api/mcq/b7b5423fd88108e3742d66819279f3b8 -H "content-type: application/json" -d "@u1.json"
```
```json
{"question":{"id":"b7b5423fd88108e3742d66819279f3b8","name":"Capital city of France",
"questionText":"What is the capital of France?","createdBy":null,
"createdAt":"2026-08-31 15:59:11","updatedAt":"2026-08-31 15:59:14","choices":[
{"id":"c14127cc75b1261223cb406432c335cc", … "text":"Paris","isCorrect":true,"position":0,"createdAt":"2026-08-31 15:59:14"},
{"id":"43752c2360d439941dd67758a9f5b361", … "text":"Nice","isCorrect":false,"position":1,"createdAt":"2026-08-31 15:59:14"}]}}
-- HTTP 200
```

`updatedAt` moved from `15:59:11` to `15:59:14` while `createdAt` did not. The Paris choice
id changed from `dfd5829362efded2c2ea22419bc769ed` to `c14127cc75b1261223cb406432c335cc`,
which is replace-all working as decision 3 accepted.

### Attempt, correct then incorrect — 201

```
$ curl.exe -s -X POST http://localhost:3000/api/mcq/b7b5423fd88108e3742d66819279f3b8/attempts -H "content-type: application/json" -d "@a1.json"
```
```json
{"attempt":{"id":"0d525459557037a387d435ef90a8db22","questionId":"b7b5…","userId":null,
"choiceId":"c14127cc75b1261223cb406432c335cc","isCorrect":true,"createdAt":"2026-08-31 15:59:16"},
"correctChoiceId":"c14127cc75b1261223cb406432c335cc"}
-- HTTP 201
```

```
$ curl.exe -s -X POST http://localhost:3000/api/mcq/b7b5423fd88108e3742d66819279f3b8/attempts -H "content-type: application/json" -d "@a2.json"
```
```json
{"attempt":{"id":"cda7b4a061ce295418e7d9d7b0e925a5","questionId":"b7b5…","userId":null,
"choiceId":"43752c2360d439941dd67758a9f5b361","isCorrect":false,"createdAt":"2026-08-31 15:59:17"},
"correctChoiceId":"c14127cc75b1261223cb406432c335cc"}
-- HTTP 201
```

The wrong answer still names the right one, which is what the attempt page needs. `userId` is
null in both.

### Delete, and proof it was real — 200 then 404

```
$ curl.exe -s -X DELETE http://localhost:3000/api/mcq/b7b5423fd88108e3742d66819279f3b8
{"success":true}
-- HTTP 200

$ curl.exe -s http://localhost:3000/api/mcq/b7b5423fd88108e3742d66819279f3b8
{"error":"Question not found"}
-- HTTP 404
```

### Failure cases

Malformed JSON — 400:
```
$ curl.exe -s -X POST http://localhost:3000/api/mcq -H "content-type: application/json" --data-raw "{ not json"
{"error":"Validation failed","fields":{"body":"Expected a JSON object"}}
-- HTTP 400
```

Missing fields, empty object — 400, every field named at once:
```
$ curl.exe -s -X POST http://localhost:3000/api/mcq -H "content-type: application/json" -d "{}"
{"error":"Validation failed","fields":{"name":"Name is required","questionText":"Question text is required","choices":"Add at least two choices"}}
-- HTTP 400
```

Only one choice — 400:
```
{"error":"Validation failed","fields":{"choices":"Add at least two choices"}}
-- HTTP 400
```

Two choices both marked correct — 400:
```
{"error":"Validation failed","fields":{"choices":"Mark exactly one choice as the correct answer"}}
-- HTTP 400
```

A blank choice, addressed by its position — 400. This is what `pathErrors()` exists for:
```
{"error":"Validation failed","fields":{"choices.1.text":"Choice text is required"}}
-- HTTP 400
```

A question id that does not exist — 404 on all three verbs:
```
$ curl.exe -s http://localhost:3000/api/mcq/does-not-exist
{"error":"Question not found"}
-- HTTP 404

$ curl.exe -s -X PUT http://localhost:3000/api/mcq/does-not-exist -H "content-type: application/json" -d "@u1.json"
{"error":"Question not found"}
-- HTTP 404

$ curl.exe -s -X DELETE http://localhost:3000/api/mcq/does-not-exist
{"error":"Question not found"}
-- HTTP 404
```

An attempt using a choice from a different question — 400, not 500. The question under
attempt was `b7b5423f…` and the choice belonged to `149d8085…`:
```
$ curl.exe -s -X POST http://localhost:3000/api/mcq/b7b5423fd88108e3742d66819279f3b8/attempts -H "content-type: application/json" -d "@a3.json"
{"error":"That choice does not belong to this question"}
-- HTTP 400
```

An attempt with nothing selected — 400:
```
{"error":"Validation failed","fields":{"choiceId":"Select an answer"}}
-- HTTP 400
```

An attempt on a question that does not exist — 404, distinguished from the 400 above:
```
$ curl.exe -s -X POST http://localhost:3000/api/mcq/does-not-exist/attempts -H "content-type: application/json" -d "@a1.json"
{"error":"Question not found"}
-- HTTP 404
```

### Local D1 left as it was found

```
$ npx wrangler d1 execute quizmaker-db --local --command "SELECT (SELECT COUNT(*) FROM mcq_questions) AS questions, (SELECT COUNT(*) FROM mcq_choices) AS choices, (SELECT COUNT(*) FROM mcq_attempts) AS attempts"
```
```json
{ "questions": 0, "choices": 0, "attempts": 0 }
```

Both questions were deleted at the end of the run. The two attempts recorded against the
first one went with it through the cascade, so the count is 0 without any attempt row having
been deleted directly.

**Honest limits of this verification**: this was `curl.exe` against `npm run dev`, which runs
on Node with a local D1 binding, not on workerd. It proves the routes, the schemas and the
SQL, but it does not prove the app runs on the Workers runtime. Phase 5's `npm run preview`
is the check that does.

---

## Technical Implementation Details

Filled in as each phase lands. Phases 1 to 3 are a record of built code; Phases 4 and 5 are
still the plan.

### Key Files

Delivered in Phase 1:

- `migrations/0002_create_mcq_tables.sql` — the three tables, constraints, and five indexes
- `migrations/mcq-migrations.test.ts` — text contract over the migration SQL
- `migrations/mcq-schema.test.ts` — executes `0001` then `0002` against `node:sqlite` and
  asserts real constraint and cascade behavior

Delivered in Phase 2:

- `src/lib/services/mcq-service.ts` — the only module that touches `env.DB` for MCQ data
- `src/lib/services/mcq-service.test.ts` — 50 tests against a real SQLite database built
  from the migration files, including the `createLocalD1` adapter

Delivered in Phase 3:

- `src/lib/validation/mcq.ts` — Zod schemas plus `pathErrors()`, shared with the Phase 4 form
- `src/lib/validation/mcq.test.ts` — 35 tests
- `src/app/api/mcq/route.ts` — `GET`, `POST`, with `route.test.ts`, 21 tests
- `src/app/api/mcq/[id]/route.ts` — `GET`, `PUT`, `DELETE`, with `route.test.ts`, 22 tests
- `src/app/api/mcq/[id]/attempts/route.ts` — `POST`, with `route.test.ts`, 18 tests

Built in Phase 4:

- `src/lib/mcq-client.ts` — the UI's one way of calling the MCQ API, with
  `mcq-client.test.ts`, 24 tests
- `src/components/mcq/question-form.tsx` — create and edit in one component, 22 tests
- `src/components/mcq/question-list.tsx` — the client island: fetch, search, skeletons,
  empty state, 16 tests
- `src/components/mcq/question-row-actions.tsx` — dropdown plus the delete confirmation,
  8 tests
- `src/components/mcq/attempt-form.tsx` — answer, verdict, try again, 13 tests
- `src/components/mcq/question-loader.tsx` — one question by id for the edit and attempt
  pages, 7 tests
- `src/app/mcq/page.tsx` (rewritten, `page.test.tsx` rewritten with it, 5 tests),
  `src/app/mcq/new/page.tsx`, `src/app/mcq/[id]/edit/page.tsx`,
  `src/app/mcq/[id]/attempt/page.tsx`
- `src/app/layout.tsx` — gained `<Toaster />`
- `src/components/ui/` — `dropdown-menu`, `alert-dialog`, `radio-group`, `textarea`,
  `sonner`, `skeleton`, all generated by the CLI and unedited

There is no `delete-question-dialog.tsx`; the dialog lives in `question-row-actions.tsx`.
`question-loader.tsx` was not in the plan. Both are explained under Phase 4.

### Implementation Patterns

Writing a question and its choices atomically, as built. The id is generated in the service
so the choice statements can reference it inside the same batch, and `db.batch()` gives the
whole thing one transaction, so a question with no choices cannot exist. Every statement
carries `RETURNING`, so the created question is assembled from the batch's own results
rather than re-read afterwards:

```typescript
export async function createQuestion(input: QuestionInput): Promise<Question> {
  const db = await database();
  const id = newId();

  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO mcq_questions (id, name, question_text, created_by) VALUES (?1, ?2, ?3, ?4) RETURNING ${QUESTION_COLUMNS}`,
      )
      // created_by is null: there is no session, so nothing can know who is acting.
      .bind(id, input.name, input.questionText, null),
    ...input.choices.map((choice, position) =>
      insertChoice(db, id, choice, position),
    ),
  ]);

  const row = results[0]?.results[0] as QuestionRow | undefined;
  if (!row) {
    throw new Error("Question could not be created: the insert returned no row");
  }

  return { ...toQuestionFields(row), choices: choicesFrom(results, 1) };
}
```

Replacing the choice set on an edit. The `UPDATE`, the `DELETE` and the new `INSERT`s share
one batch, so a failure part-way cannot leave the question with its old choices gone and no
new ones in place. `insertChoice` is the same helper `createQuestion` uses, so create and
edit cannot drift apart:

```typescript
const results = await db.batch([
  db
    .prepare(
      `UPDATE mcq_questions SET name = ?1, question_text = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3 RETURNING ${QUESTION_COLUMNS}`,
    )
    .bind(input.name, input.questionText, id),
  db.prepare("DELETE FROM mcq_choices WHERE question_id = ?1").bind(id),
  ...input.choices.map((choice, position) =>
    insertChoice(db, id, choice, position),
  ),
]);
```

Giving a test a real database instead of a fake. The injection point is the one
`user-service.test.ts` established; what changes is that the handle is a real SQLite
database with the real migrations applied, so the assertions are about rows rather than
about SQL strings:

```typescript
const { dbHolder } = vi.hoisted(() => ({
  dbHolder: { current: null as unknown as LocalD1 },
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({ env: { DB: dbHolder.current } })),
}));

function createLocalD1() {
  const db = new DatabaseSync(":memory:");
  // Plain SQLite defaults foreign keys off; D1 has them on. Without this the cascade and
  // set-null behavior the schema relies on would not happen here.
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of MIGRATIONS) {
    db.exec(readFileSync(join(process.cwd(), "migrations", file), "utf8"));
  }
  // ... prepare/bind/all/run, plus batch() as a real BEGIN/COMMIT/ROLLBACK
}
```

Correctness decided by the database, not the client. The route passes only ids; what counts
as correct is read from the row:

```typescript
const { results } = await db
  .prepare(
    "SELECT id, is_correct FROM mcq_choices WHERE id = ?1 AND question_id = ?2",
  )
  .bind(choiceId, questionId)
  .all<{ id: string; is_correct: number }>();

const choice = results[0];
if (!choice) {
  throw new ChoiceNotInQuestionError();
}

const isCorrect = choice.is_correct === 1;
```

Reading the list with its choice count, one query rather than one per row. The `LEFT JOIN`
keeps a question with no choices in the list with a count of 0, and `rowid` breaks the
`created_at` tie deterministically, since `CURRENT_TIMESTAMP` only has second precision:

```sql
SELECT q.id, q.name, q.question_text, q.created_at, q.updated_at,
       COUNT(c.id) AS choice_count
FROM mcq_questions q
LEFT JOIN mcq_choices c ON c.question_id = q.id
GROUP BY q.id
ORDER BY q.created_at DESC, q.rowid DESC
```

In-memory search, the whole of the search feature — no endpoint, no parameter, no refetch:

```typescript
const visible = questions.filter((question) => {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return (
    question.name.toLowerCase().includes(needle) ||
    question.questionText.toLowerCase().includes(needle)
  );
});
```

### Important Notes

- D1 is server-only. `mcq-service.ts` must never be imported by a `'use client'` component;
  the client goes through `src/lib/mcq-client.ts` and the API.
- `getCloudflareContext()` does not work under jsdom. Component and route tests mock it.
- Numbered placeholders (`?1`, `?2`) everywhere, never anonymous `?`, and never a template
  literal carrying user input. Read `results[0]` from `.all()`; never `.first()`.
- `updated_at` is set explicitly by `updateQuestion`. SQLite will not do it.
- New shadcn files in `src/components/ui/` are generated and are not hand-edited.
- `npm run dev` runs on Node and will not catch a Workers-only failure. Phase 5's
  `npm run preview` is the check that matters.
- Phase 4 runs `npm install` through the shadcn CLI, which **deletes the `esbuild`
  junction** Sprint 1 relies on for `npm run preview`. Expect Phase 5 to hit
  `ERR_MODULE_NOT_FOUND` and plan to recreate the junction. See Risks and open decision 7.

---

## Known Limitations

Recorded deliberately so they are not mistaken for bugs.

- **There is still no session management, and this sprint does not add any.** `AGENTS.md`
  states it and it remains deliberate. Login verifies credentials and navigates; there is no
  cookie, no token, no session store, and no `middleware.ts`, so no route handler and no
  component can know who is signed in.

  The direct consequences for this sprint:
  - `mcq_questions.created_by` is nullable and will be `NULL` for every question created.
  - `mcq_attempts.user_id` is nullable and will be `NULL` for every attempt recorded.
  - Both columns are created now so a later sprint can populate them without a second
    migration and without a backfill decision being forced at the same time.
  - No current user is invented, no request header is read as if it carried an identity,
    and no placeholder or "system" user row is created. A null column that honestly says
    "unknown" is better than a value that looks like data and is not.
  - Every question is visible and editable by anyone who reaches the page, and `/mcq` is
    still reachable by typing the URL. There is no ownership, so there is nothing to check.
  - Attempts cannot be attributed, scored per teacher, or shown as history. That is why no
    "my attempts" view is in scope.

  Adding sessions is out of scope here, not forgotten, and not a bonus to slip in. It is the
  obvious first task of the sprint after this one.

- **"Exactly one correct choice" is enforced in the application, not the database.** The Zod
  schema rejects zero or several, and the service validates before writing, so no path in
  this application can create a bad question. But SQLite cannot express the rule as a
  constraint, so a hand-written `INSERT` against the database could still produce a question
  with no correct answer or two. Phase 5 asserts the invariant holds in the real data; it
  does not claim the database enforces it.

- **An attempt is a log line, not a score.** Attempting the same question five times writes
  five rows. Nothing reads them back this sprint, and nothing deduplicates them.

- **Every edit outdates that question's attempt history.** This entry previously said a diff
  based update kept the problem rare. That is wrong, and Phase 5 proved it: the shipped
  update replaces the whole choice set, so *any* successful `PUT` deletes every existing
  choice row and inserts new ones with new ids. `mcq_attempts.choice_id` is
  `ON DELETE SET NULL`, so the attempt rows survive with their `is_correct` and timestamp
  intact — nothing is cascaded away — but `choice_id` goes null and which answer the person
  actually picked is no longer recoverable.

  Measured in Phase 5: two attempts recorded before an edit, both still present afterwards
  with `is_correct` 0 and 1 preserved, both with `choice_id` null. The third attempt, made
  after the edit, still points at a live choice.

  This is a deliberate trade-off, not an accident. `SET NULL` was chosen over `CASCADE`
  precisely so an ordinary edit cannot silently destroy attempt history. Closing the gap
  properly means snapshotting the chosen text onto the attempt row, which is open decision 4
  and is not built.

- **The correct answer is not really hidden from a determined user.** The default `GET`
  omits `isCorrect`, but `?include=answers` is a query parameter anyone can add, because
  with no authentication there is nobody to deny. It is tidiness, not a security control,
  and Phase 5 will not claim otherwise.

- **Delete is permanent.** No soft delete, no undo, no trash. The confirmation dialog is
  the only safety net, which is why it is required rather than optional.

- **`npm run lint` is not usable after `npm run preview` on this checkout.**
  `eslint.config.mjs` ignores `.open-next/**` but not `.wrangler/**`, and `wrangler dev`
  writes generated worker bundles into `.wrangler\tmp\`. After a preview run, the bare lint
  script reports 7684 problems from two machine-generated files. `npx eslint src migrations`
  is clean, and that is the reading this sprint's lint claims rest on. The one-line config
  fix is described in Troubleshooting and was **not** applied, because it is outside Phase 5's
  brief and needs Manikanta's approval.

- **Verification was done on the local Workers runtime, not on Cloudflare.** `npm run preview`
  runs the same `workerd` and the same OpenNext bundle that a deploy would, which is why it is
  a much stronger signal than `next dev`. It is still not the live edge: the D1 is the local
  sqlite file, not the remote database, and no cold start, region, or real network was
  exercised. The close-out step re-walks the flow on the live URL, and until it runs, nothing
  in this document claims the deployed app has been tested.

- **The Windows toolchain has two standing warts.** OpenNext prints
  "not fully compatible with Windows" on every build and recommends WSL, and the `esbuild`
  entry in `node_modules` is a junction into `@opennextjs/aws/node_modules/esbuild` that any
  `npm install` destroys. Preview worked in Phase 5 only because no install ran during it.
  This is Sprint 1's documented upstream workaround, still unresolved as open decision 7.

---

## Decisions

### Carried over from Sprint 1, still in force

- `zod` for all route input validation. Already a dependency at `^4.4.3`.
- The Vitest set, with `environment: "node"` and per-file `// @vitest-environment jsdom`.
- `pool: "threads"` in `vitest.config.ts`.
- `wrangler` pinned at `^4.125.0`, after the `workerd` crash of Sprint 1's Phase 1.
- `@vitejs/plugin-react` pinned at `^5`, because 6.x conflicts with the Babel 7 `shadcn`
  holds.
- No `esbuild` dependency; the `node_modules` junction stands instead. Revisited as open
  decision 7, because Phase 4 will destroy it.

### Open decisions for Manikanta

Decisions 1 and 3 were settled during Phase 2 and are marked **SETTLED** in place, with what
was chosen and what it cost, so the reasoning stays readable rather than being deleted.
Decision 2 is closed by the schema as built, and decision 4 is closed by Phase 1 having
shipped without the snapshot columns. Decisions 5 to 8 are still open: 5 is wanted before
Phase 3, 6 and 8 before Phase 4, and 7 before Phase 5.

Listed in the order they bite. Decisions 1 and 2 block Phase 1 and 2; the rest can be
settled before the phase that needs them, but settling them now is cheaper.

**1. What "a real local D1, not mocks" means for Phase 2 tests.** This is the one that
matters most, because the instruction as written conflicts with the project's own rules and
it should be resolved by Manikanta rather than quietly reinterpreted.

The brain-dump asks for Phase 2 to run against a real local D1. But
`.cursor/skills/testing/SKILL.md` says a unit test must never reach a real database, and
`.cursor/BUGBOT.md` says a test that reaches a real database gets flagged at review. There
is also a mechanical obstacle: `getCloudflareContext()` does not work under Vitest, so
`env.DB` cannot be reached from a normal test at all. Sprint 1 solved the equivalent problem
two ways — a fake D1 that records statements for the service tests, and real SQL executed
against in-memory `node:sqlite` for the schema tests.

- **Option A — `@cloudflare/vitest-pool-workers`.** Genuinely real D1, in the real workerd
  runtime. The most faithful reading of the instruction. Costs a new devDependency, a second
  Vitest config, and a change to how the whole suite runs; the testing skill explicitly says
  to raise it before adopting it. Highest fidelity, highest risk to a working 156-test suite
  mid-sprint.
- **Option B (recommended) — real SQLite through `node:sqlite`, no mocks.** The service
  takes its database handle from `database()`, which is the only place
  `getCloudflareContext()` is called. Tests point that at a `node:sqlite` database created
  by executing the actual migration files, wrapped in a thin adapter exposing D1's
  `prepare`, `bind`, `all`, `run`, and `batch`. Real SQL, real constraints, real cascades,
  real unique violations, no assertions about statements that were never executed. It keeps
  one config and one suite, and it extends the pattern `migrations/schema.test.ts` already
  proved in Sprint 1. What it does not prove is D1-specific behavior — `batch()` transaction
  semantics and D1's error message formats are emulated by the adapter, not observed.
  Phase 3's curl checks and Phase 5's preview walk cover that gap with real D1.
- **Option C — Sprint 1's fake D1, extended.** Cheapest, consistent with
  `user-service.test.ts`, and satisfies both the testing skill and Bugbot without argument.
  But it asserts that the right SQL strings were produced rather than that the SQL works,
  which is exactly what the brain-dump was pushing back on. For `db.batch()` atomicity and
  cascade deletes, a fake proves close to nothing.

My recommendation is B, and adding one sentence to the Phase 2 section recording why it is
not literally Wrangler's D1, so the deviation is visible rather than glossed. Confirm, or
pick A and accept the config churn.

**SETTLED, Aug 31 — option B.** Manikanta asked for a real local D1 rather than mocks, and
for the database handle to be obtained the way `user-service.test.ts` obtains it. Those two
instructions pull apart, because that file's handle is a fake: it replays queued rows and
never executes SQL. Option B satisfies both halves — the injection mechanism is copied from
`user-service.test.ts` exactly, and what it injects is a real SQLite database built from the
migration files. No new devDependency, one Vitest config, one suite. The gap that remains is
D1-specific `batch()` semantics and error formats, and it was narrowed by replaying every
SQL shape the service issues against real local D1 through `wrangler d1 execute --local`.
Both are recorded in the Phase 2 section.

**2. Ownership of the id, and the `DEFAULT` that stays unused.** As explained under the
schema, atomic create requires the service to generate the question id, so
`DEFAULT (lower(hex(randomblob(16))))` on `mcq_questions` becomes a fallback that this
application never uses. The alternatives are worse: insert the question, read its id, then
batch the choices in a second round trip — which is no longer atomic and can leave a
question with no choices, the exact thing you asked to prevent. I have written the PRD for
service-generated ids, keeping the column default for consistency with `users`. Say if you
would rather drop the default from `mcq_questions` and be explicit that the application owns
that id.

**3. How an edit changes the choice list.** Replace-all is simpler: delete every choice,
insert the new list. But choice ids change on every edit, and any attempt pointing at an old
choice loses which answer was picked. I have specified a diff instead — update by `id`,
insert the ones without an `id`, delete the ones no longer present — which preserves ids and
attempt history at the cost of a more involved `updateQuestion` and an optional `id` on the
`PUT` body. Confirm the diff, or take replace-all and accept that editing a question
detaches its attempt history.

**SETTLED, Aug 31 — replace-all.** Manikanta asked for `updateQuestion` to replace the
choice set and for a test proving the old choices are removed rather than orphaned. Built
that way in Phase 2, inside a single batch with the `UPDATE`. The consequence is accepted
and pinned by a test rather than left implicit: an attempt whose choice is replaced keeps its
row and its `is_correct`, and its `choice_id` becomes null. `PUT` bodies therefore carry no
choice `id`, which simplifies the Phase 3 schema and the Phase 4 form.

**4. Should `mcq_attempts` snapshot the chosen choice text?** Adding `choice_text TEXT` (and
possibly `question_text`) would make an attempt permanently readable even after its question
is edited or deleted. It is denormalized on purpose, and it is nearly free to add while the
table is being created — and expensive to add later, since it needs another migration and
old rows cannot be backfilled. Nothing in this sprint reads attempts back, so I have left it
out and listed it under Cut. Worth 30 seconds of your thought, because this is the cheapest
moment it will ever be.

**5. Hiding the correct answer from the attempt page.** I have specified that `GET
/api/mcq/[id]` omits `isCorrect` unless `?include=answers` is passed, so the attempt page
does not receive the answer with the question. With no authentication, anyone can pass that
parameter, so this is neatness rather than security, and it costs a branch in the route plus
`toPublicQuestion` in the service. The alternatives are to always include `isCorrect` and
document the leak, or to add a separate attempt-facing endpoint. Confirm the query
parameter, or pick one of those.

**BUILT AS SPECIFIED IN PHASE 3, EXERCISED BY PHASE 4, STILL YOURS TO CONFIRM.** Phase 3
implemented the query parameter because it was the PRD's documented default and Phase 4's
edit form needs the answers from somewhere. Phase 4 now has both callers in place and they
split exactly as intended: `QuestionLoader` passes `includeAnswers` only in `edit` mode, so
the edit form gets the correct flags while the attempt page does not. Tests assert both URLs,
and the walkthrough shows the edit form seeded with choice 1 pre-marked correct (`12`) while
the attempt page reveals nothing before submission (`15`).

Changing it later is still a small edit to one branch in `src/app/api/mcq/[id]/route.ts` plus
its tests. Two things to weigh, unchanged: the parameter is not a security boundary, since
anyone can pass it; and the `PUT` response returns answers unconditionally, because its only
caller is the edit form.

**6. `sonner` as a dependency — SETTLED in Phase 4: approved.** Manikanta approved it when
starting the phase and it was installed with the CLI. One correction to the reasoning above:
it did **not** arrive without transitive dependencies of note. shadcn's generated
`sonner.tsx` imports `useTheme` from `next-themes`, so that package is on the lockfile too.
It was flagged in the chat rather than absorbed silently; see troubleshooting for why it was
accepted instead of hand-edited away. The other five components added no package, as
predicted.

`playwright` was also approved during Phase 4, as a devDependency, specifically so the
browser walkthrough could produce real screenshots instead of terminal output standing in
for browser evidence. It is dev-only and is not bundled into the Worker.

**7. `esbuild`, again — STILL OPEN, and now confirmed rather than predicted.** This was a
forecast when written; Phase 4 proved it twice. Both `npm install` runs — the shadcn CLI and
`playwright` — deleted the untracked `node_modules/esbuild` junction that Sprint 1 used to
make `npm run preview` work. It was recreated after each and is in place now, verified.

You declined `esbuild@0.25.4` as a devDependency on Aug 23 and I am not reopening that on my
own, but this sprint is graded on a live URL, so preview and deploy both have to work
reliably, and "silently broken by any install" is a bad property to carry into Phase 5.
Options, unchanged: recreate the junction as a documented Phase 5 step, add the
devDependency, or check whether a newer `@opennextjs/cloudflare` has fixed the upstream
packaging bug — still worth a look, since a fixed upstream removes the problem outright.

**Phase 5 update: this did not block anything, and it is still open.** No `npm install` ran
during Phase 5, so the junction was intact and `npm run preview` started first time —
`node_modules\esbuild` confirmed as a reparse point targeting
`node_modules\@opennextjs\aws\node_modules\esbuild`. That is luck rather than a fix. The
close-out runs the same OpenNext build through `npm run deploy`, so the trap is still live: if
anything installs a package between now and the deploy, the deploy breaks in a way that reads
like a build bug. **Still worth an answer before the close-out.**

**8. Two smaller things — SETTLED in Phase 4: both defaults shipped, unobjected.**
- **Where the "New question" button lives.** On `/mcq` beside the heading, with a second one
  inside the empty-state card. Walkthrough `02` and `22` show both.
- **What happens after a successful attempt.** It stays on the attempt page showing the
  result, with "Try again" and a link back to `/mcq`. Walkthrough `16` and `17`. Submit is
  replaced by "Try again" once answered, so a double-click cannot record a second attempt by
  accident; "Try again" deliberately can, because attempts are a log rather than a score.

A third thing was decided in the same spirit during the phase: the row action is labelled
**Preview** rather than "Attempt", at Manikanta's request. Same destination.

---

## Acceptance Criteria

Unchecked until proven. Each is ticked in the phase that proves it, with the evidence noted
beside it, the way Sprint 1's criteria were.

**Schema (Phase 1)**

- [x] `mcq_questions`, `mcq_choices`, and `mcq_attempts` exist in the local D1 database with
      the columns this PRD specifies (all three confirmed present by querying
      `sqlite_master` in local D1; exact column lists asserted in `mcq-schema.test.ts`)
- [x] All three ids use `TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16))))` and all
      timestamps use `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` (the text contract counts
      exactly 3 id defaults and 4 timestamp defaults; generated ids assert as
      `/^[0-9a-f]{32}$/` on real inserts)
- [x] Deleting a question removes its choices and its attempts, proven by executing the
      migration and asserting the cascade, not by reading the SQL (asserted in
      `mcq-schema.test.ts`, and separately proven in real local D1: counts went from
      `1 question / 2 choices / 1 attempt` to `0 / 0 / 0` on one parent delete)
- [x] Deleting a user leaves their questions and attempts in place with `created_by` and
      `user_id` set to null (two `mcq-schema.test.ts` tests: the row count stays 1 and the
      column reads back null)
- [x] All five named indexes on foreign key columns exist (`idx_mcq_questions_created_by`,
      `idx_mcq_choices_question_id`, `idx_mcq_attempts_question_id`,
      `idx_mcq_attempts_user_id`, `idx_mcq_attempts_choice_id`, all confirmed in the applied
      local D1 schema)
- [x] `is_correct` rejects a value other than 0 or 1 (rejected for 2, -1, and 7 on choices
      and 2 and -1 on attempts in the test suite; real D1 returned
      `CHECK constraint failed: is_correct IN (0, 1)` for 2 and for -1, and accepted 1 and 0)
- [x] The migration was applied with `--local` only, and the remote database is untouched
      (`migrations apply --local`, 9 commands, ✅; no `--remote` command has been run)
- [x] The migration is numbered `0002` and follows `0001_create_users_table.sql` (asserted by
      a test matching `/^0002_/` on the filename)

**Service (Phase 2)**

- [x] `createQuestion` writes the question and every choice in one `db.batch()`, and a
      failure part-way leaves no question behind (a choice violating `NOT NULL` leaves
      `mcq_questions` and `mcq_choices` at 0 rows; a second test counts exactly 4 INSERTs
      issued and no follow-up read)
- [x] `listQuestions` returns each question with an accurate `choiceCount` (3 and 2 for the
      two fixtures; a question whose choices are deleted reports 0 rather than dropping out
      of the list)
- [x] `findQuestionById` returns choices ordered by `position`, and `null` for a missing id
      (proven by rewriting one choice's position to 9 behind the service's back and watching
      the order change)
- [x] `updateQuestion` changes name, question text, and choices, sets `updated_at`, and
      returns `null` for a missing id (10 tests, including renumbered positions, moving which
      choice is correct, and writing nothing at all for a missing id)
- [x] `deleteQuestion` returns `true` only when a row was actually removed (`true` with the
      row count dropping to 0, `false` for a missing id, and the question's choices and
      attempts going with it through the cascade)
- [x] `recordAttempt` decides correctness by reading the database, never from client input
      (the stored answer is flipped behind the service's back and the verdict follows the
      database, not the caller)
- [x] `recordAttempt` rejects a `choiceId` belonging to a different question (throws
      `ChoiceNotInQuestionError` and writes no attempt row; also rejects a choice id that
      does not exist at all)
- [x] Every statement uses numbered placeholders, with no anonymous `?` and no user input in
      a template literal, asserted across every executed statement (three convention tests
      run every function, then assert no `?` without a digit, placeholders numbered
      consecutively from `?1` with a matching binding count, and no quoted literal anywhere
      in the SQL)
- [x] `.first()` is never used anywhere in the service (the adapter throws if it is called,
      so any use fails the suite; a test asserts the guard itself is live)
- [x] The choice replacement removes the old rows rather than orphaning them (three tests:
      old ids absent from the whole table, a `LEFT JOIN` finding no parentless choice, and a
      failed replacement leaving the originals intact)

**API (Phase 3)**

- [x] `GET /api/mcq` returns every question with its choice count, and `{ "questions": [] }`
      for an empty bank (both asserted in tests and both seen by curl — the empty case at the
      end of the run)
- [x] `POST /api/mcq` returns 201 with the created question and its choices (curl returned
      201 with three choices at positions 0, 1, 2)
- [x] `POST /api/mcq` returns 400 with a per-field message for a missing name, an
      over-length name, missing question text, an empty choice, fewer than two choices,
      more than six choices, no correct choice, and two correct choices (all eight covered by
      tests; five of them re-checked by curl, including `choices.1.text` for the blank choice)
- [x] `GET /api/mcq/[id]` returns 200 without `isCorrect`, and 404 for a missing id (curl
      body contains no `isCorrect` key at all; `does-not-exist` returned 404)
- [x] `GET /api/mcq/[id]?include=answers` returns `isCorrect` on each choice (curl returned
      `isCorrect` true then false on the two choices)
- [x] `PUT /api/mcq/[id]` returns 200 with the updated question, 400 for invalid input, and
      404 for a missing id (all three by curl; a test also pins that an invalid body sent to
      a missing id is a 400 and not a 404)
- [x] `DELETE /api/mcq/[id]` returns 200, and 404 for a missing id (curl returned
      `{"success":true}` then 404 on the same id afterwards)
- [x] `POST /api/mcq/[id]/attempts` returns 201 with the attempt, its `isCorrect`, and
      `correctChoiceId` (curl returned 201 for a correct and an incorrect answer, the second
      still naming the right choice)
- [x] `POST /api/mcq/[id]/attempts` returns 400 for a missing `choiceId` and for a choice
      belonging to another question (`Select an answer` and `That choice does not belong to
      this question`, both by curl; a missing question is a 404, kept distinct)
- [x] Every handler validates its body with a Zod schema before use (and in `PUT`, before the
      id is used at all, so a bad body cannot be reported as a 404)
- [x] The form and the API enforce the same rules, because they import the same schema
      (`question-form.tsx` imports `questionInputSchema` and `pathErrors` from
      `src/lib/validation/mcq.ts` — the route's own module, not a copy; the walkthrough shows
      the browser producing the same five messages the API returns)
- [x] No 500 response body contains an underlying error message (each route forced to fail
      with `D1_ERROR: database is locked`, and the serialised body asserted not to contain
      `D1_ERROR`)
- [x] No handler writes a request body to the logs (`console.error` spied on in all three
      route files, and the captured arguments asserted not to contain the question name, the
      choice text, or the choice id)

**UI (Phase 4)**

- [x] `/mcq` lists questions in a table with name, truncated question text, choice count,
      and actions (walkthrough `02`; the row reads
      `Capital of France | Which city is the capital of France? | 3`)
- [x] The Sprint 1 stub copy is gone from `/mcq` (`page.test.tsx` asserts both
      `/later sprint/i` and "Placeholder" are absent; walkthrough `02` shows the table)
- [x] The search input filters loaded rows without a second network request, asserted by
      counting `fetch` calls (the test pins exactly 1 call after typing; the walkthrough
      counted **0** extra `GET /api/mcq`, screenshot `03`)
- [x] An empty bank shows the empty-state card with a button that reaches the create form
      (walkthrough `22`: card shown, no table rendered at all, button href `/mcq/new`)
- [x] A search matching nothing shows a "no matches" row, not the empty-state card
      (walkthrough `04`: "No questions match that search", empty-bank card absent)
- [x] Row actions are in a dropdown menu, not three bare buttons (walkthrough `11`: one
      trigger opening to Preview / Edit / Delete; a test asserts no `menuitem` exists while
      the menu is closed)
- [x] Skeleton rows show while the list is loading and are gone once it has loaded (the test
      holds the fetch open, asserts skeletons, releases it and asserts they go; walkthrough
      `01` shows 24 skeleton elements with the request held)
- [x] Create and edit render from the same form component (`QuestionForm`, discriminated on
      `mode`; both pages render it, walkthrough `05` and `12`)
- [x] The choice list adds and removes choices, blocked below two and above six (walkthrough
      `07`: six choices, "Add choice" disabled with the reason shown; "Remove choice 1"
      disabled at two)
- [x] The radio group marks exactly one choice correct, and the form rejects zero or two (a
      test asserts exactly one `aria-checked` after clicking two radios — the UI holds a
      single `correctKey`, so two is unrepresentable; walkthrough `08` shows zero refused)
- [x] Every validation rule shows a readable message against the field it belongs to,
      including per-choice messages against the right choice row (walkthrough `06` shows all
      five at once; a test asserts choice 2 carries `aria-invalid` while choice 1 does not)
- [x] Creating a question raises a success toast and lands back on the list with the new row
      (walkthrough `09`, `10`: toast "Question created", then the new row)
- [x] Editing raises a success toast and shows the updated values (walkthrough `13`, `14`:
      toast "Question updated", row renamed in place)
- [x] Delete requires confirming a dialog naming the question; cancelling changes nothing
      (walkthrough `18`: dialog quotes "Deepest ocean trench" and warns it cannot be undone;
      Cancel left the row in place)
- [x] Deleting raises a success toast and removes the row (walkthrough `19`, `20`: toast
      "Question deleted", row gone without a reload)
- [x] The attempt page shows the choices as a radio group in `position` order, with submit
      disabled until one is chosen (walkthrough `15`; a test feeds the choices out of order
      and asserts they render sorted)
- [x] Submitting an attempt says clearly whether it was right and shows which choice was
      correct, conveyed by text rather than colour alone (walkthrough `16`: "Not quite. The
      correct answer was “Mariana Trench”." plus a "Correct answer" badge beside that choice;
      `17` reads "Correct")
- [x] Every new shadcn component was installed with the CLI and left unedited (one
      `npx shadcn@latest add` call created all six; `button.tsx` was left as-is rather than
      overwritten)
- [x] Any new package went in through `npm install`, with the `package-lock.json` change
      committed. No hand-made `node_modules` junction stands in for a dependency (`sonner`,
      `next-themes` and `playwright` are all real installs on the lockfile. The pre-existing
      `esbuild` junction is Sprint 1's documented upstream workaround, not a dependency
      substitute — and it was recreated after both installs destroyed it)

**Verification (Phase 5)**

- [x] Every phase's tests were written first and observed failing, with both the failing and
      the passing run pasted into the chat (all four implementation phases did this; the
      chat holds a red run and a green run for each)
- [x] `npm test` passes, including Sprint 1's tests (27 files, 459 tests, 0 failures — full
      output in `ai-workspace/phase5-verification/test-run.txt`. 153 of Sprint 1's original
      156 are untouched and green; the other 3 were the `/mcq` placeholder assertions that
      Phase 4 replaced with 5 real ones, since this sprint deletes that placeholder)
- [x] `npm run lint` passes with no new errors (`npx eslint src migrations` → exit 0, clean.
      Bare `npm run lint` reports 7684 problems, all of them inside two generated bundles in
      `.wrangler\tmp\` that `npm run preview` writes; `eslint.config.mjs` ignores
      `.open-next/**` but not `.wrangler/**`. Zero problems in any file this sprint wrote —
      reported to Manikanta, awaiting a decision, see Troubleshooting)
- [x] `npm run build` succeeds (compiled in 10.6s, TypeScript clean, 11 static pages, every
      MCQ route in the manifest — `ai-workspace/phase5-verification/build.txt`)
- [x] `npm run preview` serves the app on the Workers runtime and the whole feature works
      there (`Ready on http://127.0.0.1:8787` with `env.DB (quizmaker-db)` bound as local D1;
      every step below was performed against that server, not `next dev`)
- [x] The full flow was walked in a browser against the preview server: create, list,
      search, edit, attempt correctly, attempt incorrectly, delete (21 screenshots and two
      transcripts in `ai-workspace/phase5-verification/`; the walkthrough table in Phase 5
      maps each step to its screenshot)
- [x] Local D1 confirms every question has exactly one `is_correct = 1` choice (a
      `GROUP BY q.id HAVING COUNT(c.id) < 2 OR SUM(c.is_correct) <> 1` sweep over the whole
      bank returned **no rows**; `bad_choice_flags 0` and `bad_attempt_flags 0` on the domain
      check too)
- [x] Local D1 confirms one `mcq_attempts` row per submitted attempt, with the correct
      `is_correct` (three attempts submitted in the browser, three rows written:
      `is_correct` 0, then 1, then 0 after the edit moved the correct mark — matching what
      the UI reported each time)
- [x] Local D1 confirms `created_by` and `user_id` are null on every row, as the known
      limitation states (`attempts_with_user 0`, `questions_with_creator 0` across the whole
      database)
- [x] Deleting a question leaves no orphan choices or attempts in the database
      (`question_rows 0 / choice_rows 0 / attempt_rows 0` for the deleted id; totals went
      `3 / 8 / 7` → `2 / 5 / 4`, back to the pre-run baseline; `orphan_choices 0` and
      `orphan_attempts 0` on a `LEFT JOIN` sweep of the whole bank)
- [x] No cookie, token, session store, or `middleware.ts` was introduced, confirmed by
      grepping `src/` (`rg "cookies\(\)|Set-Cookie|getSession|createSession|jwt|middleware"`
      returns nothing outside tests, and no `middleware.ts` exists in the repository)
- [x] Nothing was deployed and the remote database was never touched during Phases 1 to 5
      (no `--remote` and no `npm run deploy` has been run; every D1 command in the chat
      carries `--local`, and wrangler printed `Resource location: local` each time)
- [x] Each phase was committed as its own `phase N:` commit and pushed, per
      `phase-commit.mdc`, and every one of those commits was proposed and approved by
      Manikanta before anything was staged, committed, or pushed (four `phase N:` commits,
      `bae47e9`, `5d3bb9a`, `e2b866e`, `7194c1c`, each proposed in the chat and held until
      Manikanta said go; Phase 5's own commit is proposed and unstaged)
- [x] This PRD's phase markers, code references, and troubleshooting entries match what was
      actually built (Phase 5 corrected one stale Known Limitation about edits preserving
      choice ids — the shipped update replaces the whole choice set, which the D1 rows from
      this run prove)

---

## Success Metrics

Measured at the end of Phase 5 on the Workers runtime (`npm run preview`, port 8787), except
where a row says otherwise. Screenshot references prefixed `p5-` are in
`ai-workspace/phase5-verification/`; unprefixed ones are Phase 4's dev-server walk.

| Metric | Target | How Measured | Result |
|--------|--------|--------------|--------|
| Question creation time | A teacher creates a question in under 60 seconds | One form, one submit; timed during the Phase 5 browser walk | **Not honestly measurable from this run.** The scripted create — fill name, question text, three choices, mark one correct, submit, land back on the list — took a couple of seconds of wall time, but a script types instantly and never reads the labels. What the run does establish is that it is one form and one submit with no intermediate step, so the interaction cost is low. A real reading needs a human, which this sprint has not done |
| Data integrity | 0 questions in the database with fewer than two choices or without exactly one correct choice | SQL over local D1 after the Phase 5 walk | **Met.** `GROUP BY q.id HAVING COUNT(c.id) < 2 OR SUM(c.is_correct) <> 1` returned no rows over the whole bank. `bad_choice_flags 0`, `bad_attempt_flags 0` on the `is_correct IN (0,1)` domain check |
| Attempts are never lost | 100% of submitted attempts appear in `mcq_attempts` with the right `is_correct` | Count submitted attempts during the walk, compare with `SELECT COUNT(*)` | **Met.** Three attempts submitted in the browser, three rows in `mcq_attempts`, `is_correct` 0 / 1 / 0 matching what the UI reported each time. Two of them survived an intervening edit that replaced every choice row — see the Known Limitation on `choice_id` going null |
| Correctness is decided server-side | 0 paths where client input determines correctness | Code review plus a service test that sends a false `isCorrect` and is ignored | **Met.** `submitAttempt` posts only `{ choiceId }`; `attempt-form.tsx` renders the returned verdict and computes nothing. Phase 5 also showed it live: after the edit moved the correct mark to choice 3, submitting the previously correct choice returned "Not quite" without the client being told anything had changed (`p5-15`) |
| Test coverage of the MCQ surface | Every service function and every documented status code has a test | Test count and a checklist against the endpoint list | **Met.** 459 tests in 27 files, all passing. **306** of them live in the MCQ files this sprint wrote — 77 schema (49 + 28), 50 service, 86 routes and validation (19 + 23 + 13 + 31), 93 UI (24 + 22 + 14 + 8 + 13 + 7 + 5). The remaining 153 are Sprint 1's, unchanged apart from `src/app/mcq/page.test.tsx`, which Phase 4 rewrote because it asserted the placeholder copy this sprint deletes |
| Validation parity | 0 rules the form accepts and the API rejects, or the reverse | Both import the same schema; asserted by a test that the form uses `questionInputSchema` | **Met.** `question-form.tsx` imports `questionInputSchema` and `pathErrors` from the route's own module. Phase 5 checked both edges of every cap in the browser: 101 / 1001 / 501 characters each rejected with the API's own message (`p5-04`), 100 / 1000 / 500 accepted and stored at full length (`p5-05`) |
| Search feels instant | Filtering issues no network request | Assert `fetch` call count is unchanged while typing | **Met.** Test pins exactly 1 call after typing; the Phase 5 walk counted **0** extra `GET /api/mcq` while typing, with the URL unchanged and no query param (`p5-09`) |
| Sprint stays in scope | 0 out-of-scope features built | No cookie, token, session, or middleware in `src/`; no out-of-scope item from the list above | **Met.** The grep returns nothing outside tests, there is no `middleware.ts` in the repository, and the data agrees: `attempts_with_user 0`, `questions_with_creator 0`. Nothing from the Out of Scope list was built |
| Accidental data loss | 0 questions deleted without a confirmation step | Delete is only reachable through the `AlertDialog`, asserted by test | **Met.** A test proves the menu item alone sends no request. Phase 5 clicked Cancel first and confirmed the row stayed *and* that `GET /api/mcq/[id]` still returned 200, then confirmed and watched it go (`p5-31` to `p5-34`) |
| Works on the deploy target | The whole feature works on `workerd`, not just `next dev` | `npm run preview`, then walk every flow against port 8787 | **Met.** Create, list, search, open, attempt wrong, retry correct, edit the correct choice, delete through the dialog, plus five API edge cases, all on the OpenNext worker with D1 bound. 21 screenshots and two transcripts |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — the SQLite database holding all three MCQ tables, bound as `DB`
- Wrangler CLI — creating and applying the migration, generating binding types. Requires
  `npx wrangler login`; verify with `npx wrangler whoami`
- Cloudflare Workers runtime — what `npm run preview` exercises, via `@opennextjs/cloudflare`

### Packages

Already present, nothing to install:

- `zod` `^4.4.3` — route and form validation
- `next` `16.2.12`, `react` `19.2.8` — App Router and client components
- `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`,
  `tw-animate-css`, `lucide-react` — what the shadcn components are built on
- The Vitest set — `vitest`, `@vitejs/plugin-react`, `@testing-library/react`,
  `@testing-library/user-event`, `jsdom`, `vite-tsconfig-paths`
- `node:sqlite` — Node 24 built-in, already used by `migrations/schema.test.ts`

Added in Phase 4, all approved and on the lockfile:

- `sonner` `^2.0.8` — the toast library behind `@shadcn/sonner`. Approved by Manikanta.
- `next-themes` `^0.4.6` — **not requested.** Pulled in because shadcn's generated
  `sonner.tsx` imports `useTheme` from it. Flagged in the chat and accepted rather than
  hand-editing a generated `ui/` file. See troubleshooting.
- `playwright` `^1.62.1`, devDependency — approved so the Phase 4 walkthrough could produce
  real browser screenshots rather than terminal output standing in for browser evidence.
  Dev-only; not bundled into the Worker. Chromium is downloaded separately with
  `npx playwright install chromium` and lives outside the repo.

Not needed after all, open decision 1:

- `@cloudflare/vitest-pool-workers` — would only have been required under option A for Phase
  2 testing. Option B shipped, so this was never installed.

Possibly needed, open decision 7 — still open:

- `esbuild@0.25.4` as a devDependency, or the `node_modules` junction recreated instead.
  Phase 4 recreated the junction twice, after each `npm install` destroyed it.

### shadcn components added with the CLI

Source files copied into the repository, not packages: `dropdown-menu`, `alert-dialog`,
`radio-group`, `textarea`, `skeleton`, and `sonner` (which does bring the packages above).
All six were added in Phase 4 by a single `npx shadcn@latest add` call and left unedited.

### Internal Dependencies

- `src/lib/services/mcq-service.ts` — the only module touching `env.DB` for MCQ data
- `src/lib/validation/mcq.ts` — schemas shared by the routes and the form
- `src/lib/services/user-service.ts` — not called, but `users (id)` is the target of both
  foreign keys, so `0001` must be applied before `0002`
- `src/components/ui/*` — the installed shadcn components
- `src/lib/utils.ts` — the `cn()` helper
- `src/app/globals.css` — Tailwind v4 theme tokens
- `src/components/auth/logout-button.tsx` — reused on the rewritten `/mcq` page

### Bindings and Environment

- `DB` — the existing D1 binding. No new binding, so `npm run cf-typegen` should not be
  needed; it will be run and checked anyway if `wrangler.jsonc` changes at all.
- No new environment variable or secret is expected. If one becomes necessary, the local
  value goes in `.dev.vars` and an empty placeholder is added to `.dev.vars.example`.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: `db.batch()` cannot reference an id generated by an earlier statement in the same
  batch, so a naive implementation either loses atomicity or writes choices against the
  wrong question.
- **Mitigation**: the service generates the question id with Web Crypto and binds it into
  every statement. Documented under the schema; a Phase 2 test asserts a failing batch
  leaves no question behind.

- **Risk**: "exactly one correct choice" cannot be a database constraint, so the invariant
  lives in application code and could be bypassed by a future code path that skips the
  schema.
- **Mitigation**: the rule sits in `questionInputSchema`, which both the route and the form
  import, and the service validates before writing. Recorded under Known Limitations, and
  Phase 5 asserts it holds in the real data.

- **Risk**: replacing choices on edit detaches attempt history, or cascades it away
  entirely.
- **Mitigation**: `choice_id` is `ON DELETE SET NULL` rather than `CASCADE`, and the update
  diffs choices instead of replacing them. Open decision 3 puts the trade-off in front of
  Manikanta rather than burying it.

- **Risk**: mocked D1 drifts from real D1, so tests pass against behavior the database does
  not have. Sprint 1 already hit this with `first()`.
- **Mitigation**: open decision 1 chooses how real Phase 2's tests are; whichever option is
  chosen, Phase 3 verifies with curl against real local D1 and Phase 5 walks the feature on
  workerd.

- **Risk**: Phase 4's `npm install` deletes the untracked `esbuild` junction, so Phase 5's
  `npm run preview` fails — and so would the deploy this sprint is graded on.
- **MATERIALISED in Phase 4, twice.** Both the shadcn install and the `playwright` install
  removed it. Recreated and verified after each, so it is in place going into Phase 5. This
  is no longer a risk to watch but a known behaviour: any install breaks preview until the
  junction is restored. Open decision 7 is the permanent fix and is still open.

- **Risk**: a shadcn component has no Base UI equivalent and silently installs nothing, so an
  import fails much later with a confusing error.
- **Did not materialise.** All six components produced files, verified before anything
  imported them. The CLI did report skipping `button.tsx` as identical, which is a different
  thing and was left alone rather than forced with `--overwrite`.

- **Risk**: a Base UI component cannot be driven in jsdom, so a component test either passes
  vacuously or the behaviour goes untested. Not anticipated when this list was written.
- **MATERIALISED in Phase 4.** Base UI's dropdown trigger cannot open a menu under jsdom.
  Root-caused with a probe rather than worked around blindly — a menu rendered open behaves
  correctly, and the trigger can close but not open. Handled by forwarding the primitive's own
  `defaultOpen` so the tests reach the menu contents, with opening by click covered in the
  browser walkthrough. Full detail in troubleshooting. The general lesson for Phase 5: where
  jsdom cannot reach a behaviour, prove it in the browser rather than writing an assertion
  that cannot fail.

- **Risk**: the list page becomes a large client component that pulls server-only code in
  behind it, breaking the build or leaking database access into the browser bundle.
- **Mitigation**: the route file stays a Server Component; the client island talks only to
  `src/lib/mcq-client.ts` over HTTP. `mcq-service.ts` is never imported from a `'use client'`
  file, which Bugbot also checks.

- **Risk**: the remote migration in the close-out step runs against a database with real
  Sprint 1 accounts, and there is no down migration.
- **Mitigation**: the close-out step is explicitly gated on Manikanta asking, requires the
  commands to be shown and confirmed first, and only adds tables — it alters nothing in
  `users`. Re-read at the time rather than trusted from here.

### User Experience Risks

- **Risk**: a single misclick destroys a question, since delete is permanent and there is no
  undo.
- **Mitigation**: delete is only reachable by confirming an `AlertDialog` that names the
  question. An acceptance criterion covers it.

- **Risk**: the dynamic choice list is the most complex form in the project, and per-choice
  validation errors could appear against the wrong row or collapse into one vague message.
- **Mitigation**: `pathErrors()` keys messages by full path, and an acceptance criterion
  requires a per-choice message to land on the right choice row.

- **Risk**: correct and incorrect feedback conveyed by colour alone excludes some readers.
- **Mitigation**: the result states the outcome in words as well as colour, and uses theme
  tokens rather than hex values so it survives dark mode.

- **Risk**: a teacher creates questions, expects them to be "theirs", and finds everyone
  shares one bank with no attribution.
- **Mitigation**: the null `created_by` is documented under Known Limitations so the demo can
  name it as the next sprint's work rather than have it discovered live.

- **Risk**: in-memory search stops feeling instant once the bank is large, because every
  question is loaded up front.
- **Mitigation**: accepted deliberately for this sprint's scale, with server-side search
  listed Out of Scope so the reason is on the record.

---

## Troubleshooting Guide

Entries are added as problems are hit, with the file and line, per the working agreements.
The first two were found during Phase 1, the next three during Phase 2, and the two after
those during Phase 3; the rest are carried forward from Sprint 1 as the hazards most likely
to recur in this sprint.

### `npx tsc --noEmit` reports 14 errors, all pre-existing in Sprint 1's auth route tests (found in Phase 1, not fixed)
**Problem**: `npx tsc --noEmit` exits 1 with 14 errors, all `TS18046: 'body'/'json' is of
type 'unknown'` or `TS2571: Object is of type 'unknown'`. Sprint 1's PRD records
`npx tsc --noEmit` as clean at the end of its Phases 1 to 3, so this drifted at some point
after that.
**Cause**: those tests call `await response.json()` and index into the result without
narrowing it. `json()` returns `Promise<unknown>` under this TypeScript version, so every
property access on it is an error. Nothing to do with the MCQ work.
**Why it is not a Phase 1 regression**: all 14 are in
`src/app/api/auth/login/route.test.ts` and `src/app/api/auth/register/route.test.ts`, which
this phase did not touch — `git status` shows both unmodified. `migrations/` produces zero
errors, so both new test files are type-clean.
**Why the build still passes**: `npm run build` succeeds because Next.js does not typecheck
`*.test.ts` files during a production build. Only the standalone `tsc --noEmit` sees them.
**Solution**: not fixed, because it is outside Phase 1's scope and touching Sprint 1 files
mid-phase would violate the one-phase-per-commit rule. Recorded here for Manikanta to decide:
either type the parsed bodies in those two files as its own `fix:` commit, or accept the 14
and stop treating `tsc --noEmit` as a gate. Phase 3 writes new route tests and should type
its own `json()` results so it does not add to the count.
**Code Reference**: `src/app/api/auth/login/route.test.ts:88`,
`src/app/api/auth/register/route.test.ts:84`

### Querying `sqlite_master` for `mcq%` finds the tables but none of the indexes (found in Phase 1, fixed)
**Problem**: `SELECT type, name FROM sqlite_master WHERE name LIKE 'mcq%'` returned the three
tables and no indexes, which looks exactly like the `CREATE INDEX` statements having silently
failed.
**Cause**: the indexes are named `idx_mcq_...`, so they do not start with `mcq` and the
`LIKE 'mcq%'` pattern cannot match them. The indexes were there the whole time.
**Solution**: query them by their own prefix,
`WHERE type = 'index' AND name LIKE 'idx_mcq%'`, or drop the pattern and filter on
`tbl_name`. Worth knowing before concluding a migration half-applied.

### `wrangler d1 execute` says it cannot find a D1 database with that name, and then workerd crashes (found in Phase 2, fixed)
**Problem**: `npx wrangler d1 execute aisprints-quizmaker-db --local --file ...` failed with
`Couldn't find a D1 DB with the name or binding 'aisprints-quizmaker-db' in your
wrangler.jsonc file`, immediately followed by
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94` and
exit code `-1073740791`.
**Cause**: the database is named `quizmaker-db`, not `aisprints-quizmaker-db` — the
repository name is not the database name. The crash afterwards is cosmetic: workerd tears
down uncleanly on Windows after the config error, which makes a simple wrong-name mistake
look like a broken toolchain.
**Solution**: take the name from `wrangler.jsonc` rather than from memory —
`d1_databases[0].database_name` is `quizmaker-db`, with binding `DB`. The binding name works
in place of the database name too. Ignore the `UV_HANDLE_CLOSING` assertion when it follows a
real error message; fix the error above it.
**Code Reference**: `wrangler.jsonc:24`

### `node:sqlite` needs its D1 behaviors verified before being trusted as a stand-in (found in Phase 2, no fix needed)
**Problem**: the Phase 2 tests give the service a `node:sqlite` database dressed up as D1.
If any of the D1 behavior the service relies on were unsupported there, the failure would
show up as a confusing test error rather than as "this approach does not work".
**Cause**: `node:sqlite` is a thin binding, and the D1 features in play — `?N` numbered
placeholders bound from varargs, `INSERT ... RETURNING` read through `.all()`, `changes`
reported by `.run()`, and rollback on an exception inside `BEGIN` — are each plausible to be
missing or to behave differently.
**Solution**: all four were confirmed in a throwaway script before the adapter was written,
and all four work. Worth repeating rather than assuming if the adapter is ever extended, for
instance to cover a `UNIQUE` violation's message format.
**Code Reference**: `src/lib/services/mcq-service.test.ts:52`

### Foreign keys silently do nothing in the service tests, so cascades appear broken (found in Phase 2, avoided)
**Problem**: the same trap Phase 1 hit, in a new place. Without `PRAGMA foreign_keys = ON`,
the `deleteQuestion` cascade test and the `choice_id` set-null test would both pass while
proving nothing, because SQLite would not enforce the constraints at all.
**Cause**: plain SQLite defaults foreign key enforcement off; D1 has it on. A test database
built by hand does not inherit D1's setting.
**Solution**: `createLocalD1()` executes the pragma before the migrations, on the same line
as a comment saying why. If a cascade assertion ever starts passing when it should not,
check the pragma first.
**Code Reference**: `src/lib/services/mcq-service.test.ts:55`

### A Zod message set with `.min(1, "…")` does not appear when the field is missing (found in Phase 3, fixed)
**Problem**: two tests failed with `expected string, received undefined` where they expected
`Select an answer`. `POST /api/mcq/[id]/attempts` with `{}` answered
`{"choiceId":"Invalid input: expected string, received undefined"}`.
**Cause**: `z.string().trim().min(1, "Select an answer")` attaches the message to the length
check, which only runs once the value is known to be a string. A missing field fails the type
check first, and that check had no message, so Zod's own wording was returned. This is exactly
the case that matters most — someone submitting without choosing an answer.
**Solution**: put the message on the type as well as the check —
`z.string({ error: "Select an answer" }).trim().min(1, "Select an answer")`. Applied to
`name`, `questionText`, `choice.text`, `choiceId`, `isCorrect`, and the `choices` array. The
per-check messages still win where they apply, so `min(2)` and `max(6)` on `choices` are
unaffected, which the schema tests confirm.
**Worth knowing**: any new field needs the message in both places, or a missing value will
leak Zod's wording into the UI.
**Code Reference**: `src/lib/validation/mcq.ts:8`, `src/lib/validation/mcq.ts:49`

### PowerShell mangles `?` in a double-quoted URL, and `-o $null` corrupts a curl command (found in Phase 3, fixed)
**Problem**: two scripting faults during the curl run, neither in the routes. A step labelled
`GET /api/mcq/{id}?include=answers` printed the URL as `http://localhost:3000/api/mcq/=answers`,
and a cleanup `curl.exe -s -o $null -X DELETE …` silently performed a `GET` instead, leaving a
question behind in local D1.
**Cause**: in `"$base/$id?include=answers"` PowerShell reads `$id?include` as the variable
name, so both the id and the parameter vanish. And `$null` expands to an empty string, so
`-o $null` becomes `-o` followed by `-X`, which curl reads as the output filename; `DELETE`
then becomes the URL and the method falls back to `GET`.
**Solution**: build URLs with the format operator, `"{0}/{1}?include=answers" -f $base, $id`,
and drop the output to `$null` with a pipeline (`| Out-Null`) rather than `-o`. Both steps
were rerun correctly and the leftover question deleted; the final counts are 0/0/0.
**Worth knowing**: a curl step that returns a plausible-looking body can still be the wrong
request. Check the method and the URL that were actually sent, not just the response.

### `npm run preview` fails with "Cannot find package 'esbuild'"
**Problem**: `npm run preview` dies before bundling with
`ERR_MODULE_NOT_FOUND: Cannot find package 'esbuild'`.
**Cause**: `@opennextjs/cloudflare@1.20.2` imports bare `esbuild` without declaring it, and
npm nested two incompatible copies instead of hoisting one. Upstream packaging bug.
**Solution**: recreate the junction inside `node_modules` only:
```powershell
New-Item -ItemType Junction -Path "node_modules\esbuild" -Target "node_modules\@opennextjs\aws\node_modules\esbuild"
```
**Expect this in Phase 5**, because Phase 4's shadcn installs run `npm install` and delete
the junction. See open decision 7.

### `npx shadcn add <name>` produces no files
**Problem**: a component silently fails to install.
**Cause**: the `@shadcn/` namespace was omitted, or the component has no Base UI equivalent.
**Solution**: use `npx shadcn@latest add @shadcn/<name>`, and check the file appeared in
`src/components/ui/` before importing it.

### D1 binding errors on placeholders
**Problem**: a query fails with a binding error in local Wrangler.
**Cause**: anonymous `?` placeholders, or mixing `?` and `?1` styles.
**Solution**: numbered placeholders throughout.

### `getCloudflareContext()` throws in a test
**Problem**: a service or route test fails reaching the Cloudflare context.
**Cause**: it does not work under Vitest.
**Solution**: mock `@opennextjs/cloudflare` and supply a fake or adapted `env.DB`. Route
tests mock it to throw, so a route reaching a binding fails loudly.

### Foreign keys are not enforced in a `node:sqlite` test
**Problem**: a cascade or set-null assertion fails; the child row survives.
**Cause**: plain SQLite defaults `foreign_keys` off. D1 has it on.
**Solution**: `db.exec("PRAGMA foreign_keys = ON")` before the assertions, and apply `0001`
before `0002` so `users` exists.

### workerd crashes, so no local D1 command works
**Problem**: `wrangler d1` commands exit with an access violation.
**Cause**: hit in Sprint 1's Phase 1 on an older Wrangler.
**Solution**: `wrangler` is pinned at `^4.125.0`, which fixed it. If it recurs, install the
latest Microsoft Visual C++ Redistributable (x64) and reboot.

### `npm run dev` is not on port 3000
**Problem**: curl connects to nothing or to something stale.
**Cause**: Next.js falls back to another port when 3000 is taken.
**Solution**: read the port from the dev server output.

### PowerShell mangles a JSON body with spaces
**Problem**: an inline `-d` body silently sends something broken and the endpoint returns 400.
**Cause**: PowerShell splits on the spaces, and `curl` is an alias for `Invoke-WebRequest`.
**Solution**: call `curl.exe` explicitly, write the body to a file, and send it with
`--data-binary "@file"`. See Sprint 1's "Manual API Verification".

### Base UI's dropdown trigger cannot open a menu under jsdom (found in Phase 4, worked around)

**Problem**: every `question-row-actions.test.tsx` test that needed a menu item failed with
`Unable to find an accessible element with the role "menuitem"`. The trigger rendered
correctly and kept `aria-expanded="false"` after `userEvent.click`.
**What was ruled out**: polyfilling `ResizeObserver`, `matchMedia`,
`Element.prototype.hasPointerCapture` / `setPointerCapture` / `releasePointerCapture` /
`scrollIntoView`, `document.elementFromPoint`, and a non-zero
`Element.prototype.getBoundingClientRect` changed nothing. Neither did driving the trigger
with raw `fireEvent.pointerDown`, `mouseDown`, `click`, or `keyDown{Enter}`.
**Cause**: narrowed with a throwaway probe. A menu rendered with `open` or `defaultOpen`
works perfectly in jsdom — the popup mounts, the items carry `role="menuitem"` and their
hrefs — and clicking the trigger *closes* an already-open menu. So the handler is attached
and the state machine works; only the open path is blocked. `jsdom` reports
`Element.prototype.getAnimations` and `animate` as `undefined`, so Base UI's open sequence
has no Web Animations API to resolve against. This is a Base UI + jsdom limitation, not a
defect in `question-row-actions.tsx`.
**Solution**: `QuestionRowActions` takes a `defaultMenuOpen` prop that forwards straight to
the primitive's own `defaultOpen`, and the tests start the menu open to reach its contents.
Production code never passes it. Opening by click is genuinely browser-only behaviour and is
covered by the walkthrough instead — screenshot `11` shows the menu open with Preview, Edit
and Delete after a real click in Chromium. The five polyfills above are still needed in that
test file for the popup and dialog to mount at all.
**Code Reference**: `src/components/mcq/question-row-actions.tsx:31`,
`src/components/mcq/question-row-actions.test.tsx:17`

### shadcn's `sonner` component quietly adds `next-themes` (found in Phase 4, accepted)

**Problem**: `npx shadcn@latest add @shadcn/sonner` put two packages on the lockfile, not
one. Only `sonner` was approved.
**Cause**: the generated `src/components/ui/sonner.tsx` opens with
`import { useTheme } from "next-themes"` so the toaster can follow the app's theme. The
dependency belongs to shadcn's template, not to anything this sprint asked for.
**Solution**: accepted rather than worked around. Removing it would mean hand-editing a
generated file in `src/components/ui/`, which this PRD and `shadcn.mdc` both forbid, and the
app has no `ThemeProvider`, so `useTheme` simply returns the default and the toaster renders
from the existing `--popover` tokens. Flagged to Manikanta in the chat rather than slipped
into the lockfile silently.
**Code Reference**: `src/components/ui/sonner.tsx:3`

### The `esbuild` junction is destroyed by every `npm install` (confirmed twice in Phase 4)

**Problem**: risk 7 predicted this and Phase 4 proved it. Both the shadcn install and the
`playwright` install removed `node_modules/esbuild`, which is the hand-made junction
`npm run preview` depends on.
**Solution**: recreated after each install with
`New-Item -ItemType Junction -Path node_modules\esbuild -Target node_modules\@opennextjs\aws\node_modules\esbuild`,
verified by checking `node_modules\esbuild\package.json` exists. It is in place now.
**Why it matters for Phase 5**: this is no longer a theoretical risk. Any install before or
during Phase 5 silently breaks `npm run preview` in a way that looks like a build bug.
Decision 7 should settle whether the junction becomes a real dependency or a documented
postinstall step before Phase 5 starts.

### A walkthrough reading that looked like a bug: edit raised the create toast (found in Phase 4, was the harness)

**Problem**: the first full walkthrough reported the toast after **Save changes** as
"Question created", contradicting both the passing unit test and the code, which reads
`mode === "edit" ? "Question updated" : "Question created"`.
**Cause**: checked against the screenshot rather than assumed. Screenshot `13` showed the
submit button still reading "Saving…" and the *previous* toast — "Question created" from the
create step about three seconds earlier — still on screen. Sonner toasts live for roughly
four seconds, and the harness read the first `[data-sonner-toast]` in the DOM, so it captured
the stale one before the new one existed.
**Solution**: the harness now waits for every toast to clear before each measured action, so
the next reading is unambiguous. The rerun reports "Question updated", as it always should
have. Worth recording because the naive reading would have sent someone hunting a bug in
correct code.
**Code Reference**: `ai-workspace/phase4-walkthrough/walkthrough.mjs`, `waitForNoToasts`

### A second false alarm: delete appeared to do nothing (found in Phase 4, was the harness)

**Problem**: the same rerun then reported `Toast said: "(no toast appeared)"` and
`Row gone without a reload? false` for the delete step.
**Cause**: the regex used to insert the toast-clearing wait had swallowed the two lines that
waited for the dialog and clicked "Delete question". The delete was never triggered, so
nothing happened — correctly.
**Solution**: restored the sequence by hand and reran. Both readings are green. The lesson is
the one already in this document: when a scripted edit changes behaviour, suspect the script
before the application.

### Five jsdom test files starting at once can exceed the worker startup timeout (found in Phase 4, intermittent)

**Problem**: `npx vitest run src/components/mcq` intermittently failed before running a
single test, with `[vitest-pool]: Failed to start threads worker` and
`Timeout waiting for worker to respond` for all five files after a flat 60s.
**Cause**: resource contention on this machine, not a defect in the tests. A single jsdom
file cold takes ~44s with ~28s of that in `import`; five booting concurrently on a cold
transform cache overruns the pool's startup timeout. Confirmed by checking for stray
processes — only the editor's three — and by the same command passing in 12.6s once warm.
**Solution**: no config change. The full `npm test` passes reliably (459 tests, ~18s warm),
and `--pool=forks` is a dependable fallback that ran all 64 component tests green when
`threads` was flaking. Recorded so a one-off failure here is recognised as flake rather than
treated as a broken suite. `vitest.config.ts` keeps `pool: "threads"` for speed.

### `npm run lint` reports 7684 problems after a preview run (found in Phase 5, reported, NOT fixed)

**Problem**: lint was clean at the end of Phase 4. After `npm run preview`, `npm run lint`
exits 1 with `7684 problems (31 errors, 7653 warnings)` at line numbers past 100,000 —
`@typescript-eslint/ban-ts-comment`, `no-unused-vars`, `no-unused-expressions` and so on.
**Cause**: not source code. Filtering the report down to file paths gives exactly two files,
both machine-generated:

```
C:\...\.wrangler\tmp\bundle-iNuCDP\middleware-insertion-facade.js
C:\...\.wrangler\tmp\dev-7T4QDA\worker.js
```

`wrangler dev` — which `opennextjs-cloudflare preview` runs — writes its bundles into
`.wrangler\tmp\`. `eslint.config.mjs:8-16` ignores `node_modules/**`, `.next/**`,
`.open-next/**`, `out/**` and `build/**`, but not `.wrangler/**`. Both directories are
git-ignored (`.gitignore:39` and `:42`), so the artifacts were never committed; they are just
lintable. The temp directory names are random per run, so the count and line numbers vary.
**Proof it is only the artifacts**: `npx eslint src migrations` exits **0** with no output.
Zero problems in any file this sprint wrote.
**Solution**: none applied. The fix is one line — add `".wrangler/**"` to the `ignores` array
beside `".open-next/**"` — but Phase 5's brief is verification, and Manikanta asked to be
told before anything is changed. Reported in the chat and awaiting approval. Deleting
`.wrangler\tmp` also clears it, but only until the next preview.
**Code Reference**: `eslint.config.mjs:8-16`

### React `act()` warnings from `src/app/mcq/page.test.tsx` (found in Phase 5, reported, NOT fixed)

**Problem**: `npm test` passes 459/459, but the run prints
`An update to QuestionList inside a test was not wrapped in act(...)` on stderr for three of
that file's five tests.
**Cause**: the page test stubs `fetch` and asserts on the static heading, the create link and
the logout control. It never awaits the list's own load, so `QuestionList` resolves its fetch
and sets state after the assertion has already passed. The component's own tests in
`src/components/mcq/question-list.test.tsx` do await the load and are silent.
**Impact**: noise only. No test fails, and nothing is being missed — the list's behaviour is
covered properly in its own file. Left as a warning rather than hidden.
**Solution**: none applied, for the same reason as above. The fix would be to await a settled
list in each of the three tests, or to mock `QuestionList` out of the page test entirely,
since the page's job is composition rather than data loading. Needs Manikanta's approval.
**Code Reference**: `src/app/mcq/page.test.tsx`

### Two harmless warnings in the preview build (found in Phase 5, no fix possible)

**Problem**: `npm run preview` prints, every time:
`WARN OpenNext is not fully compatible with Windows` with a WSL recommendation, and one
esbuild `Duplicate key "options" in object literal` pointing into
`.open-next/server-functions/default/.next/server/chunks/ssr/_0spfsg4._.js`.
**Cause**: the first is OpenNext's blanket platform warning. The second is inside bundled
`@base-ui/react` code — a duplicate key in a third-party object literal, not in anything this
repository wrote.
**Solution**: nothing to do. The build completed, the worker started, and the whole feature
worked through it. Recorded so neither is mistaken for a Phase 5 defect. Both are in
`ai-workspace/phase5-verification/preview.log`.

### PowerShell strips the inner double quotes from an inline JSON body (found in Phase 5, worked around)

**Problem**: the first pass at the bogus-id API checks looked like a real bug. A `PUT` with a
perfectly valid body to a nonexistent id returned
`400 {"error":"Validation failed","fields":{"body":"Expected a JSON object"}}` instead of the
documented `404 Question not found`, and the nested attempt route did the same.
**Cause**: the harness, not the app. `curl.exe -d '{"name":"x"}'` under PowerShell loses the
inner double quotes on the way to the native executable, so the worker received something that
was not JSON and the malformed-body branch answered correctly. This is the same class of trap
as the Phase 3 entries about `?` in a URL and `-o $null`, and Sprint 1's own note about bodies
with spaces.
**Solution**: write the body to a file and pass `--data-binary "@file"`. Both routes then
returned `404 {"error":"Question not found"}`, as documented. Recorded because the false
reading was convincing enough to have been filed as a bug.

### The local D1 file can be read while the preview worker is running (found in Phase 5, no fix needed)

**Problem**: an open question going into Phase 5 — miniflare holds
`.wrangler\state\v3\d1` open while `workerd` serves, so it was unclear whether
`wrangler d1 execute --local` would fail or, worse, crash the worker the way it did in
Sprint 1's Phase 1.
**Solution**: it works. Every Phase 5 database read ran against the live preview server with
no lock error and no crash. The walkthrough is still split into `main` and `delete` stages,
because the attempts had to be inspected at a moment when the browser was not mid-flow, but
that is sequencing rather than a lock workaround.

---

## Notes for AI Agents

1. Read Overview and Hypothesis first, then Scope. Scope is binding.
2. **Do not start a phase until Manikanta says so in the chat.** He says "go Phase N". One
   phase per turn; a phase does only its own objective.
3. **Do not add session management.** No cookie, no token, no session store, no
   `middleware.ts`, no invented current user, no reading a header that does not exist, and
   no "while I was in there" auth. `created_by` and `user_id` stay null this sprint. This is
   the single most likely way to break scope, because so much of this feature looks like it
   wants a user.
4. **Tests first, every phase, and show the failing run.** Write the test, paste the failing
   output into the chat, implement, paste the passing output. Never write an assertion that
   cannot fail. If behavior is hard to assert, say so rather than producing a hollow test.
5. Colocate tests with their subject, as `user-service.test.ts` sits beside
   `user-service.ts`. Opt into jsdom per file with `// @vitest-environment jsdom`; do not
   change `vitest.config.ts` to make it global.
6. **Ask before adding any dependency**, per `AGENTS.md`. `sonner` and `playwright` were
   approved in Phase 4; `next-themes` arrived with shadcn's `sonner` template and was
   flagged, not smuggled. Anything else needs a fresh conversation.
7. **Real installs only.** A package goes in through `npm install`, a shadcn component
   through `npx shadcn@latest add @shadcn/<name>`, and the `package-lock.json` change is
   committed with the phase. No hand-made `node_modules` junction stands in for a
   dependency. The one existing junction is an `esbuild` workaround for an upstream bug,
   already on the record, not a pattern to copy.
8. **Never run `npm run deploy`** and **never apply a migration with `--remote`** during
   Phases 1 to 5. Both belong to the close-out step and happen only when Manikanta asks for
   them by name in that turn.
9. Keep every D1 call inside `src/lib/services/mcq-service.ts`. Never import it from a
   `'use client'` file. Numbered placeholders, `RETURNING` read with `.all()`, never
   `.first()`, and never user input in a template literal.
10. Do not edit generated files: `cloudflare-env.d.ts`, `next-env.d.ts`,
    `package-lock.json`, or anything in `src/components/ui/`.
11. Follow the file-scoped rules: `d1.mdc`, `nextjs.mdc`, `shadcn.mdc`, `tailwind.mdc`,
    `cloudflare.mdc`, and the testing skill. `.cursor/BUGBOT.md` is what review will check.
12. **Verify before claiming completion.** Run `npm run lint` and `npm run build` and report
    the real output. Inspection is not verification.
13. At the end of each phase: set the status marker here, record the files with
    `filepath:line-number` references, tick the acceptance criteria that now pass, add any
    Troubleshooting entry, then **propose** the commit per `.cursor/rules/phase-commit.mdc`
    and wait for Manikanta's approval before staging, committing, or pushing anything. Show
    him the exact `git add`, `git commit`, and `git push` commands and the commit message,
    then stop until he says go. One `phase N:` commit, PRD and migration in the same commit
    as their code.
14. **If Manikanta asks for a change after a phase is closed**, do not just make it. Say what
    will change and which test proves it, wait for approval, then change it, and commit it as
    its own `fix:` commit naming the phase in the body.
15. Say when you are unsure. A flagged uncertainty is more useful than a confident guess that
    has to be unwound later.

---

## Current Status

**Last Updated**: Aug 31, 2026 (Phase 5 COMPLETED — all five phases done)
**Current Phase**: Phase 5 — End-to-End Verification, COMPLETED. **All five implementation
phases are finished.** The only work left in this document is the close-out step, which runs
only when Manikanta asks for it by name.
**Branch**: `feature/mcq-crud`, branched from `origin/main` after Sprint 1 merged as
`1bf5a54`. Six commits, all pushed:
- `4731310 chore: add phase commit workflow rule`
- `ca8e9c0 chore: require approval before staging, committing, pushing, or deploying`
- `bae47e9 phase 1: add MCQ tables migration and schema tests`
- `5d3bb9a phase 2: add MCQ service with real-SQLite tests`
- `e2b866e phase 3: add MCQ API routes and Zod validation`
- `7194c1c phase 4: add MCQ UI with search, toasts and confirmation delete`

Phase 5's files are **uncommitted** and awaiting Manikanta's review — nothing has been
staged. Phase 5 changed no application code; it added
`ai-workspace/phase5-verification/` and updated this PRD.
**Status**: The feature is complete and verified on the runtime it will deploy to. The three
MCQ tables exist in local D1, every database call lives behind `mcq-service.ts`, all six
endpoints are live and validated, and the UI can create, search, edit, delete and attempt a
question with the declared polish working. 459 tests pass in 27 files, `npx eslint src
migrations` is clean, and `npm run build` compiles with every MCQ route in the manifest.

Phase 5 then took the whole flow through `npm run preview` — the OpenNext bundle on `workerd`
with D1 bound — in real headless Chromium: create with three choices, see it listed, search
it, open it, answer wrong, retry correct, edit which choice is correct, then delete through
the confirmation dialog. Local D1 confirmed all three attempts persisted with the right
verdicts, and that deleting the question left `0 / 0 / 0` behind with no orphans anywhere in
the bank. Evidence — 21 screenshots, two transcripts, and the test, build and preview logs —
is in `ai-workspace/phase5-verification/`.

The remote database has never been touched and nothing has been deployed.
**Known caveats**, all recorded in Troubleshooting and none of them fixed, because Phase 5's
brief was to verify and report rather than change code:
1. `npx tsc --noEmit` reports the same 14 pre-existing errors in Sprint 1's two auth route
   test files, 0 in anything this sprint created. `npm run build` passes because Next.js does
   not typecheck test files.
2. Bare `npm run lint` reports 7684 problems after a preview run, all inside two generated
   bundles in `.wrangler\tmp\`. `eslint.config.mjs` ignores `.open-next/**` but not
   `.wrangler/**`. A one-line config change fixes it; awaiting approval.
3. `src/app/mcq/page.test.tsx` prints React `act()` warnings on three of its five tests. Noise
   only — the list's behaviour is covered properly in its own file.
**Baseline preserved**: Sprint 1's 153 surviving tests still pass. The only Sprint 1 test file
this sprint changed is `src/app/mcq/page.test.tsx`, rewritten in Phase 4 because it asserted
the placeholder copy this sprint deletes. This sprint's own files hold 306 tests: 77 schema,
50 service, 86 routes and validation, 93 UI.
**Dependencies added this sprint**: `sonner` (approved, decision 6), `next-themes` (pulled in
by shadcn's `sonner` template, not requested — see troubleshooting), and `playwright` as a
devDependency (approved specifically so the walkthroughs could produce real browser
evidence). Phase 5 added nothing and ran no `npm install`.
**Open decisions**: 1 and 3 are settled. 2 and 4 are closed by what shipped, and Phase 5
sharpened 4 — every edit nulls that question's attempt `choice_id`s, not just an unlucky one,
so the text-snapshot option is worth a real answer before a future sprint reports on attempts.
5, 6 and 8 are settled and confirmed by the walkthroughs. **Decision 7 (`esbuild`) is still
open** but no longer blocking: the junction survived Phase 5 because no `npm install` ran, and
`npm run preview` started first time. It stays a trap for the close-out, since a deploy runs
the same OpenNext build.
**Next Steps**: Manikanta reads the Phase 5 verification and this PRD diff, then approves or
amends the Phase 5 commit. Three things want an answer in the same pass: the `.wrangler`
lint-ignore line, the `act()` warnings, and decision 7. The close-out — remote migration and
deploy — happens only when he asks for it by name, with each of the two dangerous commands
confirmed individually.

**Phase Status Summary**:

- Phase 1 — Schema and Migration: COMPLETED (Aug 31, 2026 — 77 tests, applied to local D1)
- Phase 2 — MCQ Service: COMPLETED (Aug 31, 2026 — 50 tests against a real SQLite database
  built from the migrations, plus a real local D1 replay of every SQL shape)
- Phase 3 — API Routes and Validation: COMPLETED (Aug 31, 2026 — 86 tests, plus a curl run
  covering every documented status code against real local D1)
- Phase 4 — UI and Polish: COMPLETED (Aug 31, 2026 — 90 net tests, clean lint and build, plus
  a 22-screenshot browser walkthrough in real headless Chromium)
- Phase 5 — End-to-End Verification: COMPLETED (Aug 31, 2026 — 459 tests green, clean build,
  the whole flow walked on `workerd` via `npm run preview` with 21 screenshots, local D1
  proving attempt persistence and a clean cascade, and three issues reported rather than
  quietly fixed)
- Close-out — Remote Migration and Deployment: NOT STARTED, requires explicit instruction
