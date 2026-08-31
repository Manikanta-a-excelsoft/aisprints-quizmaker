# AGENTS.md

Instructions for AI agents working in this repository. This file is loaded into every
agent conversation, so it describes only what is stable and true of the project.

## Project

QuizMaker lets teachers build and maintain a bank of multiple-choice questions. Several
teachers share one deployment, so every feature depends on each teacher having their own
identity: the primary user is a teacher managing their own question bank.

Current state, after Sprint 1: teachers can register, log in, and log out. Accounts live in
a Cloudflare D1 `users` table, passwords are stored as PBKDF2-SHA256 with a random per-user
salt, and `/mcq` is a stub page that only confirms the flow works. Question creation does
not exist yet.

**Sprint 1 has no session management, deliberately.** Login verifies credentials and
navigates; there is no cookie, token, session store, or middleware, so nothing downstream
knows who is signed in and `/mcq` is reachable by typing the URL. Adding real sessions is
the first task of the next sprint. Do not assume an authenticated user is available in any
route or component.

The technical PRD in `ai-workspace/` is the source of truth for what is being built and for
the current phase of work.

## Stack

- **Next.js 16** with the App Router and React 19
- **Cloudflare Workers** for hosting, via `@opennextjs/cloudflare`
- **Tailwind CSS v4**, configured in CSS rather than a JS config file
- **shadcn/ui** on Base UI, `base-nova` style, with Lucide icons
- **TypeScript** in strict mode
- **Wrangler** for Cloudflare configuration, secrets, and deployment
- **Cloudflare D1** for storage, bound as `DB` (database `quizmaker-db`)
- **Vitest** with Testing Library for tests; `zod` for input validation

Passwords are hashed with Web Crypto PBKDF2-SHA256 in `src/lib/password.ts`. No auth
library, session library, or AI SDK is installed. Do not write code that imports one
without adding it first and telling the user.

## Layout

```
src/app/            Routes, layouts, and global styles (App Router)
src/components/ui/  shadcn/ui components (generated; avoid hand-editing)
src/components/     Feature components (`auth/` holds the sign-in and sign-up forms)
src/lib/            Shared utilities and services
migrations/         D1 SQL migrations, with tests over the schema
ai-workspace/       Technical PRDs and planning documents
.cursor/rules/      File-scoped conventions
.cursor/skills/     Task-specific guidance loaded on demand
public/             Static assets
```

Import through the `@/` alias, which maps to `src/`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server on Node at `localhost:3000` |
| `npm run preview` | Build and run on the local **Workers** runtime |
| `npm run build` | Production build |
| `npm test` | Vitest, single run |
| `npm run lint` | ESLint |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` after changing bindings |

`npm run dev` runs on Node and will not surface Workers-specific problems. Verify
anything runtime-sensitive with `npm run preview`.

## Working agreements

- **Do not deploy.** Never run `npm run deploy` unless explicitly asked.
- **Do not touch the remote database.** Migrations may be applied locally only.
- **Ask before adding a dependency.** This is a teaching repository; an unexplained
  dependency is a cost. Propose it and say why.
- **Do not edit generated files.** `cloudflare-env.d.ts`, `next-env.d.ts`, and
  `package-lock.json` are generated.
- **Keep secrets out of the repo.** Local values belong in `.dev.vars`, which is
  gitignored. When adding a variable, also add an empty placeholder to
  `.dev.vars.example`. Production values go in `wrangler secret put`.
- **Verify before claiming completion.** Run `npm run lint` and `npm run build` and
  report the actual result. Do not describe work as done based on inspection alone.
- **Say when you are unsure.** A flagged uncertainty is more useful than a confident
  guess that has to be unwound later.

## Cursor Cloud specific instructions

Cloud agents have no Cloudflare credentials and no `.dev.vars`. In that environment:

- `npm run dev`, `npm run build`, and `npm run lint` work normally.
- `npm run preview`, `npm run deploy`, and any `wrangler` command that needs
  authentication will fail. This is expected. Do not try to authenticate.
- If a task genuinely requires Cloudflare access, stop and report that it must be run
  locally instead.
