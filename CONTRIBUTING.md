# Contributing

Thanks for your interest! Flooper is a passion project, maintained when time
allows, so replies to issues and PRs may take a while.

## Getting set up

Follow **Local development** in the [README](README.md). Before opening a PR, run:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm size
```

CI runs the same checks.

## How changes reach production

`main` is protected, and every commit on it deploys automatically. So:

1. Work on a branch: `git switch -c fix/short-description`.
2. Push it and open a pull request (`gh pr create --fill` works).
3. CI must pass before GitHub allows the merge, and the branch must be up to
   date with `main`. Direct pushes to `main` are rejected.
4. PRs are squash-merged, so each one becomes a single commit on `main`, titled
   with the PR's title. Merging deploys it, and the branch is deleted.

Tip: `gh pr merge --auto --squash` merges a PR by itself as soon as CI passes.

## Guidelines

- **Small PRs** are much easier to review. For anything big, open an issue first to discuss it.
- **The SDK runs on other people's websites.** Keep it dependency-free and within its size budget, and never let it break the host page.
- **Database changes** go in a new numbered file in `apps/api/migrations/`. Never edit an existing migration.
- **API changes** start in `packages/shared`, so the SDK, API and portal stay in sync.
- **Decisions with real trade-offs** get a short record in `docs/decisions/`.

## Reporting security issues

Please don't open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
