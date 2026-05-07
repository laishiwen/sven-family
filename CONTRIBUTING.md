# Contributing to Sven Family

[English](CONTRIBUTING.md) | [中文](CONTRIBUTING.zh-CN.md)

Thanks for your interest in contributing to Sven Family.

---

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Branch Naming](#branch-naming)
- [Commit Conventions](#commit-conventions)
- [Code Style](#code-style)
- [Testing](#testing)
- [Pull Request Checklist](#pull-request-checklist)
- [Review Process](#review-process)
- [Developer Certificate of Origin](#developer-certificate-of-origin)
- [Reporting Security Issues](#reporting-security-issues)

---

## Ways to Contribute

- Report bugs and regressions
- Suggest improvements and new features
- Submit documentation updates
- Submit code fixes and enhancements

---

## Development Setup

### Prerequisites

- **Node.js** >= 20
- **pnpm** >= 11
- **Python** >= 3.11
- **uv** (Python package manager)
- **Docker & Docker Compose** (for PostgreSQL and Redis)

### Setup Steps

1. Fork and clone the repository.

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Copy environment files and edit with your local values:

   ```bash
   cp backend/admin-backend/.env.example backend/admin-backend/.env
   cp backend/community-backend/.env.example backend/community-backend/.env
   cp backend/crawler/.env.example backend/crawler/.env
   cp backend/stats-service/.env.example backend/stats-service/.env
   ```

4. Start infrastructure services:

   ```bash
   docker compose up -d postgres redis
   ```

5. Run database migrations:

   ```bash
   cd backend/admin-backend && uv run alembic upgrade head
   ```

6. Start development:

   ```bash
   pnpm dev
   ```

---

## Development Workflow

1. Pick or create an issue to work on.
2. Create a feature branch from the default branch (see [Branch Naming](#branch-naming)).
3. Make your changes, following our [Code Style](#code-style) and [Commit Conventions](#commit-conventions).
4. Write or update tests for your changes (see [Testing](#testing)).
5. Run lint and type checks before pushing:

   ```bash
   pnpm lint
   pnpm type-check
   ```

6. Push your branch and open a pull request.
7. Respond to code review feedback.

---

## Branch Naming

Use the following prefixes for branch names:

- `feat/` — new features
- `fix/` — bug fixes
- `docs/` — documentation changes
- `refactor/` — code restructuring without behavior change
- `test/` — test additions or updates
- `chore/` — maintenance tasks (deps, CI, config)

Example: `feat/add-export-csv`, `fix/login-redirect-loop`

---

## Commit Conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/). Each commit message should be structured as:

```
<type>(<scope>): <short summary>

<optional body>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`

Examples:

- `feat(admin): add CSV export for user list`
- `fix(community): resolve redirect loop after login`
- `docs(readme): add database setup instructions`
- `refactor(data-collection): extract URL normalizer`

Keep each pull request focused on a single topic.

---

## Code Style

### Frontend (TypeScript / React)

- ESLint and Prettier are configured at the workspace root.
- Run `pnpm lint` to check and auto-fix formatting.
- Follow existing patterns in the codebase for component structure and naming.

### Backend (Python)

- Follow PEP 8 conventions.
- Use type hints on function signatures.
- Keep services aligned with the existing FastAPI patterns used across backend services.

---

## Testing

### Frontend

```bash
# Run tests for a specific package
pnpm --filter <package-name> test

# Example
pnpm --filter sven-community test
```

### Backend

```bash
# Run tests for a specific backend service
cd backend/<service-name> && uv run pytest

# Example
cd backend/admin-backend && uv run pytest
```

Make sure existing tests still pass and add new tests for your changes where appropriate.

---

## Pull Request Checklist

- [ ] Code builds successfully (`pnpm build`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Type checks pass (`pnpm type-check`)
- [ ] Tests pass (run tests for affected packages)
- [ ] New tests added for changed behavior
- [ ] Documentation updated if behavior changed
- [ ] PR description clearly explains motivation and impact
- [ ] No unrelated file changes included
- [ ] Branch is up to date with the default branch

---

## Review Process

1. After you open a PR, maintainers will review it, typically within a few business days.
2. CI checks must pass before review begins.
3. Reviewers may request changes — this is normal and collaborative.
4. Once approved, a maintainer will merge your PR.

---

## Developer Certificate of Origin

By contributing to this project, you certify that:

1. The contribution was created in whole or in part by you and you have the right to submit it under the MIT License; or
2. The contribution is based upon previous work that, to the best of your knowledge, is covered under an appropriate open source license and you have the right under that license to submit that work with modifications; or
3. The contribution was provided directly to you by some other person who certified (1) or (2) and you have not modified it.

This project does **not** require a CLA (Contributor License Agreement). You retain copyright of your contributions, which are licensed under the project's MIT License.

---

## Reporting Security Issues

**Do not open public issues for security vulnerabilities.**

See [SECURITY.md](SECURITY.md) for reporting procedures.

---

## Code of Conduct

By participating in this project, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).
