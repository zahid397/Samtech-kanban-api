# Security review and operating boundaries

## Access and secrets

NestJS remains the authority for user permissions and database writes. Board/task data is filtered by the authenticated owner. JWT signing requires a long secret, expiration is validated, bcrypt hashing is retained, and AI service authentication uses a separate secret. Service/database secrets are never public `VITE_` configuration.

`CORS_ORIGIN` lists exact origins. JWT bearer requests do not depend on cross-site cookies. Helmet protects API responses, public errors avoid database internals, input validation rejects unknown fields, and request throttles bound login, AI and voice traffic. Proxy trust is explicit; do not broaden it to arbitrary networks.

Sessions use browser tab storage so refresh can restore the active session. This does not protect tokens from a same-origin script compromise. The frontend uses no raw HTML injection and Vercel supplies a Content Security Policy, but dependency reviews and safe script handling remain necessary. Account recovery, verified email, MFA and JWT revocation are not implemented.

## AI and agent tools

The Python service receives only data selected by NestJS and has no database-write interface. Natural-language input cannot select arbitrary API endpoints, shell commands, filesystem paths or external tools. Outputs are drafts validated by NestJS. Approval rechecks ownership and destination permissions and uses a transaction; proposal reuse is idempotent.

Agents have named read-only analysis capabilities, bounded parallel execution, timeouts, cancellation and saved outcomes. Cancellation stops or ignores pending work; already completed read-only analysis may have consumed compute. No agent has an unrestricted shell. Research means searching authorized project tasks, not fabricated internet research.

Prompt text is untrusted data. Local instruction-model output must match the task schema before any task proposal is accepted. Prompt wording alone is not the security boundary; fixed routes, owner checks, typed DTOs and explicit approval are.

## Database and automations

Writes use PostgreSQL transactions and owner-scoped transaction locks to preserve task order under concurrent requests. Dependency edges are restricted to authorized tasks and cycle checks. Board deletion is soft; task writes refuse archived boards. Checklists, comments, labels, dependencies and audit events belong to the authorized workspace.

Rules retain an owner, enabled state, trigger cadence, condition, action configuration and execution records. Recurring task creation requires approval when enabling the rule. Actions are restricted to workspace reports and task templates; no destructive automation action or external shell is exposed. External scheduler calls require their own bearer secret. Persistent records survive process restarts; precise timing requires compute that is awake.

The migration startup guard reads schema metadata and compares untracked legacy databases against the exact original Prisma schema. A matching legacy schema is marked baselined; unexpected drift is refused. Backups and isolated staging verification remain release requirements because schema-diff support is not a data-recovery mechanism.

## Voice, files and resource limits

The app does not keep a voice recording history. Local temporary audio is deleted after processing. Browser speech recognition can use the browser provider's servers; select local recognition for offline operation. Speech-to-text and TTS availability depend on installed models and are not established by a UI toggle alone.

The file area stores bounded text notes and JSON task imports/exports. It is not arbitrary server file access or general binary object storage. Uploaded task records pass normal DTO validation and authorization before creation. Limits on file size, rule count, task analysis size, request cadence and agent concurrency reduce resource abuse.

## Dependency verification

The inspected original lockfile reported 12 advisories: 4 moderate, 7 high and 1 critical. This differs from the older reported total of 40. The working branch aligns NestJS majors, uses a deterministic lockfile and applies reviewed compatible fixes, including a Swagger YAML dependency override. Check the final verification report for the exact final audit results; advisory databases change over time.

Run `npm audit`, `npm --prefix frontend audit` and the Python environment's `pip-audit` after installation. Do not use `npm audit fix --force` or blindly update major versions. Review proposed changes, compile and rerun the relevant authorization, ordering, migration and browser tests.

## Known operational limits

- In-memory rate limits apply per process. Multiple replicas need a shared rate-limit store or an edge policy to enforce a global limit.
- Free sleeping services cannot promise uninterrupted automation, low-latency inference or continuous monitoring.
- No file malware scanner, binary attachments, email/push notifications, account recovery or multi-user board collaboration is provided.
- Historical completion timestamps imported from the original schema are approximate.
- Real microphone access, optional model quality, local voice output and offline operation must be checked on the chosen hardware/browser; they cannot be inferred from unit-test success.
