# CLAUDE.md

This project scrapes all the public tee times in Saskatoon and displays them in one unified dashboard. See `docs/prd.md` for more information.

## Tech Stack

### Application

Note: This list is preliminary and not exhaustive; I am open to exploring other tools and libraries as the project requires.

| Layer    | Technologies                                                     |
| -------- | ---------------------------------------------------------------- |
| Codebase | pnpm workspaces & turborepo monorepo                             |
| Scrapers | TypeScript, `fetch`, Cheerio, Playwright, Zod                    |
| API      | TypeScript, Node.js, Hono                                        |
| Frontend | TypeScript, Next.js (static export), TailwindCSS, TanStack Query |
| Database | AWS DynamoDB                                                     |
| Testing  | Vitest                                                           |

### Infrastructure & Deployment

| Concern            | Technology                                                             |
| ------------------ | ---------------------------------------------------------------------- |
| Scraper runtime    | AWS Lambda Container + Docker + ECR                                    |
| Scraper scheduling | prod: AWS EventBridge Scheduler (every 15 min); local: in-process cron |
| API runtime        | prod: AWS Lambda with Function URL; local: http server                 |
| Frontend hosting   | AWS S3 + CloudFront                                                    |
| API routing        | Second CloudFront origin at `/api/*` → API Lambda Function URL         |
| IaC                | OpenTofu, remote state via S3                                          |
| CI/CD              | GitHub Actions (public repo) with OIDC — no long-lived AWS credentials |
| Observability      | AWS CloudWatch                                                         |
| Domain registrar   | Namecheap (`saskatoonteetimes.ca`)                                     |

## Coding Style

- Use descriptive variable names and filenames over brief ones
- Use kebab casing for filenames
- Keep code co-located and organized by feature
- Limit the number of comments written. Only use comments to explain non-intuitive code
- Logically organize tests using the Arrange-Act-Assert pattern. DO NOT literally label the sections "Arrange", "Act", and "Assert"
- Don't use barrel files for a package's external API; manually define the relevant files to export inside the relevant `package.json` `exports` map
- JSDoc example format:
  ````
  /**
  * Short description of the function's purpose.
  *
  * Longer paragraph explaining complex internal logic or behavior IF necessary.
  *
  * @param id - Description of the user's unique identifier.
  * @param options - Configuration options.
  * @returns Description of what the function resolves or returns.
  *
  * @example
  * ```typescript
  * const user = await fetchUserData(42, { verbose: true });
  * ```
  */
  export async function fetchUserData(id: number, options?: { verbose: boolean }): Promise<User> {
  // Implementation
  }
  ````
  - JSDoc's in TS should omit data types inside the curly braces {} since TS already handles this

## Core Principles

- OOP paradigm: write classes with pure, testable methods
- Separation of concerns and dependency injection: think in terms of domain, application, and infrastructure layers, with dependencies pointing inwards; use hexagonal architecture
- Use explicit configuration over magic/implicit defaults: fail loudly and early if something isn't configured properly
- Test behaviours, not implementation details

## Processes

- Follow spec driven development via OpenSpec
- Run `pnpm format`, `pnpm check-types`, and `pnpm lint` after every change. Fix any errors
- Use Conventional Commits for commit messages

## Other Notes

- A technical spike was done in `.../saskatoon-tee-times/` to determine project feasability. This repository acts as its successor. While the end results will be similar, the spike's codebase was messy and hard to understand (spaghetti code). You can use it for a reference and additional context, but purely for filling in knowledge gaps; NEVER blindly copy code or logic or names from here; ALWAYS think through the projects goals from a fresh perspective and prioritize creating clean code that scales.
