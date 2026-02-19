# Tech Stack Signatures

Use these file signatures to quickly identify the technologies in a project.

## Languages

| Signature File | Language |
|---------------|----------|
| `*.py`, `requirements.txt`, `pyproject.toml` | Python |
| `*.js`, `*.ts`, `package.json` | JavaScript / TypeScript |
| `*.rs`, `Cargo.toml` | Rust |
| `*.go`, `go.mod` | Go |
| `*.rb`, `Gemfile` | Ruby |
| `*.java`, `pom.xml`, `build.gradle` | Java |
| `*.cs`, `*.csproj` | C# |
| `*.php`, `composer.json` | PHP |
| `*.dart`, `pubspec.yaml` | Dart |
| `*.swift`, `Package.swift` | Swift |
| `*.kt`, `build.gradle.kts` | Kotlin |

## Frontend Frameworks

| Signature File | Framework |
|---------------|-----------|
| `next.config.*` + `app/` or `pages/` | Next.js |
| `vite.config.*` + no framework config | Vite (vanilla or library) |
| `angular.json` | Angular |
| `nuxt.config.*` | Nuxt.js |
| `svelte.config.*` | SvelteKit |
| `astro.config.*` | Astro |
| `gatsby-config.*` | Gatsby |
| `remix.config.*` | Remix |

## Backend Frameworks

| Signature File | Framework |
|---------------|-----------|
| `manage.py` + `settings.py` | Django |
| `app.py` or `main.py` + FastAPI imports | FastAPI |
| `Gemfile` + `config/routes.rb` | Ruby on Rails |
| `express` in package.json dependencies | Express.js |
| `nest-cli.json` | NestJS |
| `cmd/` + `go.mod` | Go (standard layout) |
| `Cargo.toml` + `actix` or `axum` | Rust web (Actix/Axum) |

## Databases

| Signature File | Database Tool |
|---------------|---------------|
| `prisma/schema.prisma` | Prisma (usually PostgreSQL/MySQL) |
| `alembic/` or `alembic.ini` | Alembic (SQLAlchemy migrations) |
| `drizzle.config.*` | Drizzle ORM |
| `knexfile.*` | Knex.js |
| `migrations/` + Rails structure | ActiveRecord (Rails) |
| `diesel.toml` | Diesel (Rust ORM) |
| `mongodb` in dependencies | MongoDB |
| `redis` in dependencies | Redis |

## CSS / Styling

| Signature File | Tool |
|---------------|------|
| `tailwind.config.*` | Tailwind CSS |
| `*.module.css` or `*.module.scss` | CSS Modules |
| `styled-components` in dependencies | Styled Components |
| `*.sass` or `*.scss` | Sass/SCSS |
| `emotion` in dependencies | Emotion |

## Deployment / Infrastructure

| Signature File | Platform |
|---------------|----------|
| `vercel.json` or `.vercel/` | Vercel |
| `netlify.toml` | Netlify |
| `fly.toml` | Fly.io |
| `render.yaml` | Render |
| `Dockerfile` | Docker (generic) |
| `serverless.yml` | Serverless Framework |
| `terraform/` or `*.tf` | Terraform |
| `pulumi/` or `Pulumi.yaml` | Pulumi |
| `.github/workflows/` | GitHub Actions |
