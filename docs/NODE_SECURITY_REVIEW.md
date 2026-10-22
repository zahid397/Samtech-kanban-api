# Node.js security review — 2026-10-22

## Verified sources

The official [October 21, 2026 security advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) and release notes identify **22.23.4**, **24.22.1**, and **26.12.1** as security releases. The [24.22.1 release notes](https://nodejs.org/en/blog/release/v24.22.1), [22.23.4 release notes](https://nodejs.org/en/blog/release/v22.23.4), official distribution checksums and downloaded executables were checked directly. No CVE was inferred from a dependency audit alone.

## Runtime evidence

| Location | Observed before this change | Finding / resulting configuration |
| --- | --- | --- |
| Workspace default executable | `node --version`: **v24.19.0** | Predates the 24.x security fix; a verified **24.22.1** executable is installed in the isolated tools directory for recovery commands. The system-wide default was not replaced. |
| Checked-in local selector | `.nvmrc`: `22` | Pinned to **24.22.1**, preserving the major version already used by the application tests in this workspace. Run `nvm install && nvm use` in a normal developer checkout. |
| GitHub Actions | `actions/setup-node`: floating `22` | Pinned to **24.22.1**. A prior remote CI job's actual patch version was not available; the selector alone is not evidence it was vulnerable. |
| Current live Render deploy | Build log at **2026-10-22T01:25:46.644186257Z** explicitly selects **26.12.1** | This is already a patched security release. Live deploy `dep-dbcmc43rjlhs73e038t0` runs source commit `2748c3e403523d9a8f2e086c54ef0cfc0bb7f5d3`. The checked-in Blueprint now requests **24.22.1**, but that file has not been applied to production. |
| Older failed Render instances | Logs also contain `26.4.0` | Historical evidence only; do not attribute this version to the current live instance. |
| Vercel frontend | Project selected the `22.x` runtime previously | Its exact executed patch was not established by this audit. New builds must satisfy the frontend's patched engine range; verify the build log when releasing. |

Both package manifests and only the root engine metadata in their lockfiles now accept `^22.23.4 || ^24.22.1`. This excludes the observed unpatched 24.19.0 runtime and unsupported project majors while allowing compatible later patches. There is no Node Dockerfile in this repository; `compose.yaml` only defines PostgreSQL.

## Advisory applicability

The advisory lists DNS NUL handling (CVE-2026-105482), certificate/IP validation (CVE-2026-105483, CVE-2026-106069, CVE-2026-106072), Brotli decoding (CVE-2026-111497), HTTP keep-alive handling (CVE-2026-105481), snapshot entropy (CVE-2026-106074), and permission-model `realpathSync` checks (CVE-2026-106073) for the 24.x line. It also lists two 26.x-only issues: CVE-2026-106070 and CVE-2026-106071.

The workspace's old 24.19.0 version is below the patched release identified for its line, so updating is warranted. This does **not** prove exploitation or that every affected code path is reachable in SammTech. No evidence of exploitation was found or claimed. Current Render 26.12.1 is already among the fixed versions.

The verified 24.22.1 executable reports OpenSSL **3.5.9** and Undici **7.30.1**. The official archive SHA-256 was verified before extraction; the Linux x64 archive hash is `6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6`.

## Changes and executed checks

Changed `.nvmrc`, root/frontend `package.json`, the matching engine metadata in both lockfiles, `render.yaml`, and `.github/workflows/ci.yml`. No dependency versions were resolved or force-upgraded by this runtime change. No production settings or database schema/data were modified.

Executed with the patched 24.22.1 runtime:

- TypeScript backend production compilation: **passed**.
- Configuration, Swagger, gateway limits and task-validation unit checks: **7 passed**.
- Backend `npm audit --json`: **0 vulnerabilities**, 325 audited dependency entries.
- Frontend `npm audit --json`: **0 vulnerabilities**, 272 audited dependency entries.

These checks establish local compatibility of the existing NestJS 11 / Prisma 5.22 code with the patched runtime. The final unified verification also passed the frontend build, 9 PostgreSQL integration tests, 44 Python tests, 3 migration-safety scenarios and 10 browser tests. Production status is recorded separately in the implementation report. The runtime audit did not run a destructive migration or infer PostgreSQL compatibility from a version string alone.

## Reproduction and remaining work

In this recovery workspace, prepend `/workspace/.tools/node-security/node-v24.22.1-linux-x64/bin` to `PATH`. In a normal checkout, use the checked-in `.nvmrc`. Both are project-scoped upgrades; the preinstalled system Node executable remains unchanged.

The repository changes must be pushed and the intended release deployed before claiming that CI or Render uses the new pin. After deployment, inspect the actual runtime log, readiness endpoint, API authentication and persistence. npm audit covers published dependency advisories; it does not detect all application vulnerabilities or replace the separate Node runtime advisory review.
