# Bootstrap Scan Checklist

When onboarding to an existing project, check each of these systematically.

## 1. Project Root Files

- [ ] README.md or README — project description
- [ ] LICENSE — licensing type
- [ ] .gitignore — what is excluded from version control
- [ ] .env.example or .env.template — environment variables needed
- [ ] docker-compose.yml or Dockerfile — containerization setup
- [ ] Makefile — build automation
- [ ] .editorconfig — editor settings (tabs/spaces, line endings)

## 2. Package Manager & Dependencies

- [ ] package.json (Node.js/JavaScript)
- [ ] requirements.txt or Pipfile or pyproject.toml (Python)
- [ ] Cargo.toml (Rust)
- [ ] go.mod (Go)
- [ ] Gemfile (Ruby)
- [ ] pom.xml or build.gradle (Java)
- [ ] pubspec.yaml (Dart/Flutter)
- [ ] composer.json (PHP)

## 3. Framework Configuration

- [ ] next.config.js/ts (Next.js)
- [ ] vite.config.ts (Vite)
- [ ] angular.json (Angular)
- [ ] nuxt.config.ts (Nuxt)
- [ ] astro.config.mjs (Astro)
- [ ] svelte.config.js (SvelteKit)
- [ ] settings.py (Django)
- [ ] config/routes.rb (Rails)
- [ ] tsconfig.json (TypeScript)
- [ ] tailwind.config.js (Tailwind CSS)

## 4. Testing Setup

- [ ] jest.config.js/ts (Jest)
- [ ] vitest.config.ts (Vitest)
- [ ] pytest.ini or conftest.py (pytest)
- [ ] .mocharc.yml (Mocha)
- [ ] cypress.config.ts (Cypress)
- [ ] playwright.config.ts (Playwright)
- [ ] test/ or tests/ or __tests__/ or spec/ directories

## 5. CI/CD

- [ ] .github/workflows/ (GitHub Actions)
- [ ] .gitlab-ci.yml (GitLab CI)
- [ ] .circleci/config.yml (CircleCI)
- [ ] Jenkinsfile (Jenkins)
- [ ] vercel.json (Vercel)
- [ ] netlify.toml (Netlify)
- [ ] fly.toml (Fly.io)

## 6. Code Quality

- [ ] .eslintrc or eslint.config.js (ESLint)
- [ ] .prettierrc (Prettier)
- [ ] .pylintrc or ruff.toml (Python linting)
- [ ] .rubocop.yml (RuboCop)
- [ ] biome.json (Biome)

## 7. Source Code Structure

- [ ] src/ or lib/ — main source directory
- [ ] app/ — application code (common in Next.js, Rails)
- [ ] components/ — UI components
- [ ] pages/ or routes/ or views/ — page/route definitions
- [ ] api/ or server/ or backend/ — server code
- [ ] models/ or entities/ or schemas/ — data models
- [ ] utils/ or helpers/ or common/ — shared utilities
- [ ] public/ or static/ or assets/ — static files
- [ ] migrations/ or prisma/ or alembic/ — database migrations

## 8. Code Style Detection (Sample 10-15 Files)

When reading source files, note:
- [ ] Indentation: tabs or spaces? How many spaces?
- [ ] Quotes: single or double?
- [ ] Semicolons: used or omitted? (JavaScript/TypeScript)
- [ ] Naming: camelCase, snake_case, PascalCase, kebab-case?
- [ ] Comments: present? What style? JSDoc? Docstrings?
- [ ] Error handling: try/catch, Result types, error callbacks?
- [ ] File naming: camelCase.ts, kebab-case.ts, PascalCase.tsx?
- [ ] Exports: named exports, default exports, barrel files (index.ts)?
