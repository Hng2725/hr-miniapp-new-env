# HR Mini App PrivOS Runtime Migration Design

## Purpose

Migrate the existing HR Mini App into the current PrivOS MCP App runtime while preserving its user interface, user-visible behavior, business workflows, and tool names. The migrated application must build, test, and run from `privos-mcp-app-demo` alone.

The application keeps its existing identity:

- Name: `ai.privos.demo-hr-management-ws`
- Title: `HR Mini app V3`
- Version: `1.0.0`

The reference identity `ai.privos.mcp-app-demo` must not appear as the migrated app identity or UI resource namespace.

## Scope

The deliverable is the repository at `privos-mcp-app-demo`. It must not import files, install packages, or read runtime assets from either `hr-miniapp` or `privos-app-packages`.

The migration includes:

- The complete HR UI, styles, Markdown data, document templates, and public assets from `hr-miniapp`.
- Recruitment, CV screening and scoring, JD generation, lifecycle, onboarding, training, document drafting, payroll, email sending, email history, retry, and room file workflows.
- The current PrivOS development, managed, and standalone-production runtime supplied by `@privos_ai/app-server`.
- The current iframe host bridge supplied by `@privos_ai/app-react`.
- A schema-version-3 PrivOS app manifest for the existing HR app identity.
- Tests for identity, tool contracts, room binding, secrets, UI navigation, and build/runtime integration.

The migration excludes:

- Demo-only panels, tools, permissions, license examples, and copy from `privos-mcp-app-demo` that are not part of the existing HR Mini App.
- The legacy custom WebSocket relay client from `hr-miniapp`.
- Local `file:` dependencies or runtime imports from `privos-app-packages`.
- Copying `.env`, relay credentials, standalone identity files, generated credentials, or other secrets.
- Git commits, pushes, pull requests, or other GitHub operations.

## Architecture

`privos-mcp-app-demo` remains the runtime and packaging foundation. Its mode resolver, Direct HTTP server, development Relay transport, standalone pairing, workload identity, signed dispatch verification, Docker image, manifest generation, preflight checks, and Marketplace-safe packaging remain authoritative.

The application-specific demo UI and MCP handler are replaced by the HR Mini App UI and handler. The final runtime flow is:

1. PrivOS dispatches MCP requests over managed Direct HTTP or Relay.
2. `@privos_ai/app-server` resolves the runtime mode, validates transport trust, and builds `ToolCallContext`.
3. A thin application adapter passes `ApplicationMcpRequest` and the verified context to the HR MCP handler.
4. The HR handler lists HR tools, returns the inline HR dashboard resource, executes payroll/email operations, or rejects unknown tools.
5. The iframe UI uses `@privos_ai/app-react` to receive room, user, role, scope, and theme context from the host.
6. User-scoped list, file, sandbox, and AI operations continue through the iframe host bridge.
7. Server-owned operations use a room-bound installation-agent Hub client and never depend on a global WebSocket connection.

The production UI remains a Vite asset build embedded into `text/html;profile=mcp-app`. Development may use the live Vite server provided by the current runtime foundation.

## Repository Boundaries

The migrated repository uses registry packages only:

- `@privos_ai/app-server` at the version range already established by the target runtime.
- `@privos_ai/app-react` at the version range already established by the target runtime.
- HR runtime dependencies declared directly in the target `package.json`, including document, spreadsheet, PDF, icon, and email libraries actually imported by the migrated code.

The old package namespace `@privos/app-react` is replaced with `@privos_ai/app-react`. No dependency may resolve through `../privos-app-packages`, and a clean `npm ci` from the target directory must be sufficient.

All HR source, data, styles, templates, icons, tests, and configuration required at build or runtime live under `privos-mcp-app-demo`.

## UI Preservation

The migrated UI retains the existing HR Mini App shell, tab structure, labels, Vietnamese copy, visual hierarchy, CSS, interactive states, polling behavior, forms, tables, Kanban boards, dialogs, email composer, document generation, and exports.

Changes to UI code are limited to:

- SDK package namespace and type compatibility updates.
- Host-context fields required by the current SDK.
- Permission-aware errors where the new runtime requires explicit degradation.
- Build-path adjustments required by the target Vite and inline-resource pipeline.

Demo-only tabs from the reference app are not added to the HR navigation. The migrated app must not expose a visually mixed reference-demo/HR interface.

## MCP Contract

The primary UI tool remains `hr_management_dashboard`. Its UI resource URI becomes unique to the retained app identity, using `ui://ai.privos.demo-hr-management-ws/dashboard.html`.

The existing server tools and their frontend-visible response shapes remain stable:

- `debug_log`
- `hrm.payroll.query`
- `hrm.payroll.create`
- `hrm.payroll.update`
- `hrm.payroll.delete`
- `hrm.mail.send`
- `hrm.mail.retry`

The schema-v3 manifest and runtime `tools/list` both declare the complete eight-tool set: `debug_log`, `hr_management_dashboard`, four payroll tools, and two mail tools.

The handler also supports `tools/list`, `tools/call`, and `resources/read` through the SDK's application handler contract. Runtime-owned initialization and notification behavior remains with `@privos_ai/app-server`.

The handler receives `ToolCallContext`, not global relay state. Every backend action that names a room must validate a non-empty `roomId`. When the runtime supplies a trusted room or verified actor room, the argument must match it. A mismatch fails before any Hub or EmailJS call.

## Backend Hub Access

The legacy `callHubTool` function and its global pending-request WebSocket map are removed from the migrated runtime.

A new room-bound Hub tool caller uses the installation agent credential supported by the current runtime foundation. It resolves the Hub origin and installation id using the target runtime's mode-aware helpers, calls the mediated Hub tool endpoint, declares the required scope for each operation, parses MCP content consistently, and returns errors without credential data.

Email-history services are constructed per room or retrieved from a room-keyed service cache. This preserves retry locking while preventing one room's repository state or caller from being reused for another room.

Tool-to-scope mapping is explicit:

- List reads require `lists:read`.
- List creation and mutation require `lists:write`.
- Payroll database reads require `db:read`.
- Payroll database writes require `db:write`.
- Schema reads and writes require their corresponding database schema permissions when invoked.

Development may accept the explicit host-provided room when no verified actor is available in relaxed Relay compatibility mode. Managed and trusted standalone dispatch bind the request to the runtime-provided room and reject mismatches.

## Email Processing

Email delivery remains a backend operation. Existing queueing, validation, tracked-history creation, failure persistence, and retry behavior remain intact.

EmailJS configuration is read only from server environment variables:

- `EMAILJS_SERVICE_ID`
- `EMAILJS_TEMPLATE_ID`
- `EMAILJS_PUBLIC_KEY`
- `EMAILJS_PRIVATE_KEY`

The private key is declared secret. The manifest data policy declares external processing because email payloads are sent to EmailJS. Missing configuration produces the existing clear configuration error and does not stop unrelated application features or server startup.

Logs may contain safe operational metadata such as recipient address and subject only where existing behavior requires it. Logs must never contain payroll passwords, agent credentials, user tokens, private keys, relay secrets, or full environment values.

## Manifest and Permissions

`privos-app.json` is the canonical schema-version-3 manifest. Package identity fields mirror it.

The manifest declares only permissions used by the HR application and its runtime:

- `basic:information`
- `lists:read`
- `lists:write`
- `files:read`
- `files:write`
- `sandbox:skills:use`
- `sandbox:botkey:push`
- `sandbox:wake`
- `sandbox:generate`
- `sandbox:ai-chat`
- `sandbox:ai-chat:write`
- `db:read`
- `db:write`
- `db:schema:read`
- `db:schema:write`

Each permission includes valid requirement, context, execution context, feature, reason, and degraded behavior fields consistent with the current catalog. `basic:information` and `lists:read` are required. Every other permission in the list above is optional and marked recommended when the catalog supports that distinction. Missing optional write permissions produce read-only or feature-specific errors without blocking the rest of the dashboard.

The manifest declares an installation agent for server-owned Hub calls. Agent credentials are injected or configured by an administrator and are never generated, copied, displayed, or persisted by the application.

Reference-demo license tiers, bulk-export tools, whoami tools, notification demos, custom-permission demos, and their unused permissions are removed.

## Error Handling and Degradation

- Missing room context prevents the affected operation and produces a user-readable error.
- A trusted room mismatch is rejected before side effects.
- Missing installation-agent configuration affects only server-owned Hub operations such as payroll proxying and tracked email history.
- Missing EmailJS configuration affects only email delivery.
- Missing optional permissions leave unrelated tabs and read paths available.
- Hub non-success responses are parsed and surfaced without leaking transport credentials.
- Malformed Hub tool results fail explicitly rather than being treated as empty success.
- Email retry maintains one active retry per room and item.
- Existing optimistic UI rollback behavior remains unchanged.

## Cross-Platform Development

Development and standalone scripts use `cross-env` or an equivalent Node-based environment setup so the documented commands work from Windows PowerShell/cmd and POSIX shells.

The supported local workflow is:

1. Run `npm ci` inside `privos-mcp-app-demo`.
2. Configure only local development credentials and optional EmailJS/installation-agent settings in a local ignored `.env`.
3. Run `npm run dev` for Relay plus live Vite UI.
4. Run `npm run build` and `npm start` for the built runtime surface.

No step requires `hr-miniapp` or `privos-app-packages` to remain on disk.

## Testing Strategy

Implementation follows test-driven development for behavior changes.

Characterization and contract tests cover:

- Retained package and manifest identity.
- Absence of `ai.privos.mcp-app-demo` as app identity or UI resource namespace.
- Absence of local `file:` dependencies and old SDK imports.
- HR tool list, input schemas, and unique UI resource URI.
- Existing HR navigation/tab definitions and payroll role policy.
- Manifest permission catalog conformance and EmailJS environment declarations.

Backend tests cover:

- Runtime adapter forwarding request method, id, params, and context.
- Room validation and trusted-room mismatch rejection before side effects.
- Hub tool name, scope, room, and payload mapping.
- Payroll password removal before forwarding.
- Email validation, queue success/failure, history persistence, and retry locking.
- Secret-safe error and logging behavior.

Integration verification includes:

- `npm run typecheck:strict-unused`
- `npm test`
- `npm run build`
- `npm run manifest:lint`
- `npm run preflight`
- Smoke checks for `/health`, `/ready`, and `/.well-known/mcp/manifest.json`
- GitNexus impact analysis before modifying indexed symbols.
- GitNexus change detection after implementation.

The target repository's baseline packaging tests currently fail on this Windows host because `/bin/bash` is unavailable. Functional migration failures must not be hidden by that known environment limitation. Packaging is verified in a bash-capable environment or reported separately with its exact failing command and baseline evidence.

## Migration Sequence

1. Add failing identity, dependency, manifest, and tool-contract tests.
2. Update package identity, registry dependencies, cross-platform scripts, and manifest source.
3. Add failing runtime-adapter and room-bound Hub-caller tests.
4. Implement the new handler adapter and backend Hub caller on the current runtime foundation.
5. Add failing HR UI/navigation characterization tests.
6. Copy HR UI, styles, templates, data, public assets, and supporting services into the target.
7. Update SDK imports and only the API compatibility points identified by typecheck/tests.
8. Port payroll and tracked-email backend services with room binding and secret guards.
9. Remove demo-only application modules, tools, tests, and unused dependencies while retaining runtime, security, packaging, and deployment infrastructure.
10. Run full verification, inspect the final GitNexus change map, and report any environment-only verification gap.

## Acceptance Criteria

- The final app builds and runs from `privos-mcp-app-demo` without either old directory.
- Package, manifest, MCP server info, tool metadata, and UI resource namespace identify `ai.privos.demo-hr-management-ws` / `HR Mini app V3`.
- The visible HR interface and existing HR workflows remain available without reference-demo panels.
- All existing HR tool names and frontend response contracts remain compatible.
- Managed, standalone-production, and development modes use the current SDK runtime; the legacy relay client is absent.
- No local SDK path, old SDK namespace, copied credential, or secret-bearing file is present.
- Typecheck, functional tests, build, manifest lint, preflight, endpoint smoke tests, and GitNexus change review complete successfully, except for a separately documented baseline packaging limitation that requires bash.
- No commit or GitHub operation is performed.
