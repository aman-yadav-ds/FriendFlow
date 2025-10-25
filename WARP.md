# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Commands and workflows

Tooling status
- No root-level package.json, tsconfig.json, Tailwind config, or test config were found in this repository snapshot. The code clearly targets a React + TypeScript + Tailwind + Vite-style setup (usage of import.meta.env, Tailwind directives, and path alias @/). If your scripts live in a parent workspace, use those. Otherwise, add a Node toolchain (Vite + Tailwind) to run and build the app.

Environment variables
- Create a .env (Vite) with at least:
  - VITE_APPWRITE_ENDPOINT
  - VITE_APPWRITE_PROJECT_ID
  - VITE_APPWRITE_DATABASE_ID
  - VITE_APPWRITE_COLLECTION_GROUPS (default used in code: "groups")
  - VITE_APPWRITE_COLLECTION_MESSAGES ("messages")
  - VITE_APPWRITE_COLLECTION_POLLS ("polls")
  - VITE_APPWRITE_COLLECTION_VOTES ("votes")
  - VITE_APPWRITE_COLLECTION_USERS ("users")

If using a standard Vite toolchain (once added)
- Dev server
  - npm: npm run dev
  - pnpm: pnpm dev
  - yarn: yarn dev
- Production build
  - npm run build
- Preview build
  - npm run preview
- Lint (if ESLint config present)
  - npx eslint "src/**/*.{ts,tsx}"
- Tests
  - No test files or configuration were found. If you add Vitest:
    - Run all: npx vitest
    - Watch: npx vitest --watch
    - Single test by name: npx vitest -t "pattern"
    - Single file: npx vitest path/to/file.test.ts

Path aliases
- The code imports from @/..., which typically requires tsconfig.json/compilerOptions.paths and a Vite alias. Ensure @ resolves to ./src.

Tailwind
- Tailwind directives are present in src/index.css. You’ll need tailwind.config.[js|ts] and postcss.config.[js|cjs] once a toolchain is added.

## High-level architecture

Overview
- SPA built with React + TypeScript and wouter for routing, TanStack Query for server-state, Tailwind for styling, and Appwrite as the backend (auth + database). UI primitives mirror shadcn/ui patterns under src/components/ui.

Application shell (src/App.tsx, src/main.tsx)
- main.tsx mounts <App /> at #root and includes global CSS.
- App providers:
  - QueryClientProvider with a configured @tanstack/react-query QueryClient.
  - ThemeProvider for dark/light/system theme (storageKey: "event-planner-theme").
  - TooltipProvider.
  - AuthProvider (Appwrite-backed user context).
  - Toaster for global notifications.
- Routing via wouter <Switch>/<Route>/<Redirect> with route guards:
  - Public routes: /auth/login, /auth/register redirect authenticated users to /dashboard.
  - Protected routes wrap components to require authentication.
  - App routes include /dashboard, /groups/:id, /groups/:id/poll, /groups/:id/polls, /profile; unknown paths fall through to NotFound.

Authentication (src/lib/auth.tsx, src/lib/appwrite.ts)
- Appwrite SDK is initialized from import.meta.env. account.get() determines the current user.
- AuthContext exposes { user, setUser, loading, logout }.
- On load, getCurrentUser() runs; user is cached to localStorage when present.
- logout() deletes the current Appwrite session and clears user state.

Backend integration (Appwrite)
- appwrite.ts exports client, databases, account, and collection IDs (from env).
- Poll helpers (src/lib/pollHelpers.ts) encapsulate poll lifecycle:
  - createPoll(): deactivates existing active polls in a group, then creates a new active poll with Appwrite permissions (public read; creator can update/delete).
  - deletePoll(), deactivatePoll(), activatePoll() enforce creator-only mutations.
  - getActivePoll(), getGroupPolls(), getPollVotes() for reads.
  - castVote() upserts a user’s vote.
  - announcePoll() writes a system message into messages.
  - Some fields (e.g., metadata, reactions, lastMessage) are stored as JSON strings — callers parse when reading.

Data fetching and caching (src/lib/queryClient.ts)
- queryClient sets conservative defaults (no retries, infinite staleTime, no refetchOnWindowFocus).
- apiRequest() and getQueryFn() helpers exist for REST-style endpoints, but most data here uses Appwrite SDK directly.

UI and theming
- Tailwind token system and utility layers live in src/index.css.
- ThemeProvider toggles the document’s class list based on user/system preference. Theme is persisted via localStorage.
- UI primitives in src/components/ui/ follow headless/accessible patterns and are composed across pages.

Routing guards
- Two guard implementations exist:
  - Inline ProtectedRoute/PublicRoute in App.tsx.
  - A separate component in src/components/ProtectedRoute.tsx.
- Prefer one pattern to avoid drift; App.tsx currently owns route definitions and auth redirects via wouter.

Feature pages (examples)
- src/pages/dashboard.tsx: group listing, creation, invite-code joining, and deletion. Notable:
  - Group create permissions grant read/update to all authenticated users (Role.users()) with delete restricted to creator. This is convenient for client-side joining but is less strict than a function-mediated join.
  - lastMessage stored as JSON string.
- src/pages/auth/login.tsx and src/pages/auth/register.tsx: email/password flows using Appwrite Account; setUser immediately after session creation.

Environment and configuration expectations
- VITE_APPWRITE_* variables must be populated for auth and database operations.
- Collections expected (by default names): groups, messages, polls, votes, users.
- Path alias @/ must resolve to src.

Gotchas specific to this codebase
- JSON-in-strings: lastMessage, metadata, reactions are JSON strings — always parse before use.
- Permissions: some writes/read scopes are broad for UX; lock down via Appwrite Functions if needed.
- Aliases: missing tsconfig/alias or Vite resolve config will break @/ imports.
- Tailwind: ensure Tailwind and PostCSS configs exist; index.css assumes Tailwind is wired.
