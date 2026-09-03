# HR Mini App PrivOS Runtime Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `privos-mcp-app-demo` a self-contained PrivOS schema-v3 build of `ai.privos.demo-hr-management-ws` that preserves the HR Mini App UI, tools, and workflows on the current PrivOS runtime.

**Architecture:** Retain the target repository's `@privos_ai/app-server` runtime, pairing, workload identity, inline UI resource, Docker, and packaging infrastructure. Replace reference-demo application code with the old HR UI and services, adapt the MCP handler to `ToolCallContext`, and replace the legacy global relay caller with a room-bound installation-agent Hub caller.

**Tech Stack:** Node.js 22, TypeScript, React 18, Vite 5, Vitest, `@privos_ai/app-server`, `@privos_ai/app-react`, EmailJS REST, DOCX, XLSX.

**Spec:** `docs/superpowers/specs/2026-09-01-hr-miniapp-privos-runtime-migration-design.md`

## Global Constraints

- Make product-code changes only in `privos-mcp-app-demo`.
- The final repository must not depend on `hr-miniapp` or `privos-app-packages`; those directories are read-only migration sources.
- Keep app identity exactly `ai.privos.demo-hr-management-ws`, title exactly `HR Mini app V3`, and version exactly `1.0.0`.
- Use registry packages `@privos_ai/app-server` and `@privos_ai/app-react`; no `file:` dependencies and no `@privos/app-react` imports.
- Preserve the old HR UI, Vietnamese copy, tab structure, CSS, templates, tool names, and frontend-visible response shapes.
- Never copy `.env`, credentials, identity files, `node_modules`, `dist`, or GitNexus metadata from a source repository.
- Never log payroll passwords, agent credentials, user tokens, EmailJS private keys, or relay secrets.
- Do not commit, push, create a pull request, or perform any GitHub operation. Replace commit steps with a working-tree review checkpoint.
- Before editing an indexed symbol, run GitNexus upstream impact analysis and report HIGH or CRITICAL risk before proceeding.
- Use test-driven development: add the focused test, observe the expected failure, implement the minimum change, then rerun the focused and related suites.

---

## File Structure

### Retained runtime infrastructure

- `src/server.ts` — SDK runtime-mode selection and HTTP surface.
- `src/relay-transport.ts` — development Relay and the application handler adapter.
- `src/dev-server.ts` — live Vite UI support.
- `src/manifest.ts` — canonical manifest-to-runtime descriptor projection.
- `src/app-icon.ts` — manifest/relay icon resolution.
- `src/resolve-hub-origin.ts` — mode-aware Hub origin resolution.
- `src/resolve-own-mcp-app-id.ts` — installation id resolution.
- `scripts/` — manifest generation, pairing, preflight, package, and image scripts.
- `Dockerfile`, `vite.config.ts`, `vitest.config.ts` — current runtime/build foundation.

### Replaced or created application modules

- `src/mcp-message-handlers.ts` — HR tools and inline HR UI resource.
- `src/runtime-hub-tool-caller.ts` — room-bound installation-agent Hub calls.
- `src/hr-service-registry.ts` — one tracked-mail service per room.
- `src/email-history/email-history-model.ts` — migrated email-history model.
- `src/services/EmailHistoryRepository.ts` — migrated list-backed history repository.
- `src/services/MailService.ts` — migrated EmailJS delivery queue.
- `src/services/TrackedMailService.ts` — migrated send/retry orchestration.
- `src/utils/email-validation.ts`, `src/utils/TaskQueue.ts` — migrated backend utilities.
- `src/ui/**` — complete old HR UI, with SDK import and current host-bridge compatibility updates.
- `public/images/company-logos/logo.svg` — old HR company asset; retain a valid `public/icon.svg` for the app manifest.

### Removed reference-demo application modules

- `src/agent-bot-credential-check.ts`
- `src/app-db-demo-tool.ts`
- `src/app-objects-demo-tool.ts`
- `src/app-platform-demo-tool-defs.ts`
- `src/app-platform-tool-call.ts`
- `src/license.ts`
- All target `src/ui/*` files not present in the migrated HR UI tree.
- Tests dedicated only to removed reference-demo panels, license examples, bulk export, whoami, notification, custom permissions, app objects, or bot workload demos.
- Old scratch/manual-test modules `src/ui/scratch-test.ts`, `src/ui/test-docx-gen.ts`, `src/ui/test-upload-md.ts`, and their unused browser-only `src/ui/email-service.ts` helper.

---

### Task 1: Lock Identity, Dependency, and Self-Containment Contracts

**Files:**

- Create: `tests/migration-contract.spec.ts`
- Modify: `package.json`
- Modify mechanically: `package-lock.json`

**Interfaces:**

- Produces: exact package identity and registry-only dependency contract used by all later tasks.
- Consumes: none.

- [ ] **Step 1: Write the failing migration contract test**

Create `tests/migration-contract.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

const dependencyEntries = Object.entries({
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
});

describe('HR Mini App migration contract', () => {
  it('retains the old package identity', () => {
    expect(pkg.name).toBe('ai.privos.demo-hr-management-ws');
    expect(pkg.title).toBe('HR Mini app V3');
    expect(pkg.version).toBe('1.0.0');
  });

  it('uses only registry PrivOS SDK packages', () => {
    expect(pkg.dependencies?.['@privos_ai/app-server']).toBeTruthy();
    expect(pkg.devDependencies?.['@privos_ai/app-react']).toBeTruthy();
    expect(dependencyEntries.some(([name]) => name === '@privos/app-react')).toBe(false);
    expect(dependencyEntries.some(([, version]) => String(version).startsWith('file:'))).toBe(false);
  });

});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/migration-contract.spec.ts`

Expected: FAIL because the package still identifies `ai.privos.mcp-app-demo`.

- [ ] **Step 3: Update package identity, scripts, and direct dependencies**

Set these exact package fields:

```json
{
  "name": "ai.privos.demo-hr-management-ws",
  "version": "1.0.0",
  "title": "HR Mini app V3",
  "description": "HR management app for recruitment, CV screening, lifecycle, payroll, training, documents, and tracked email workflows on PrivOS.",
  "engines": { "node": ">=22.0.0" }
}
```

Keep `@privos_ai/app-server` at `^0.9.0` and `@privos_ai/app-react` at `^0.6.0`. Add the HR imports as registry dependencies: `@ant-design/icons`, `docx`, and `xlsx`. EmailJS delivery uses the existing backend `fetch` implementation, so do not add the unused browser SDK or PDF.js package. Add `cross-env` as a development dependency and define cross-platform scripts:

```json
{
  "dev": "cross-env PRIVOS_TRANSPORT=relay PRIVOS_DEV_UI=1 tsx src/server.ts",
  "start:relay": "cross-env PRIVOS_TRANSPORT=relay npm start",
  "start:standalone": "cross-env NODE_ENV=production npm start"
}
```

Regenerate only the target lockfile with `npm install --package-lock-only` after the JSON edit.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- tests/migration-contract.spec.ts`

Expected: PASS. Package identity and registry-only dependencies are now independently verified.

- [ ] **Step 5: Review the task working tree**

Run: `git diff --check; git diff -- package.json package-lock.json tests/migration-contract.spec.ts`

Expected: no whitespace errors, no `file:` dependency, and no changes outside the listed files plus previously approved docs/GitNexus metadata.

---

### Task 2: Replace the Demo Manifest with the HR Schema-v3 Contract

**Files:**

- Modify: `privos-app.json`
- Modify: `tests/manifest.spec.ts`
- Modify: `tests/permission-catalog.spec.ts`
- Delete: `tests/license.spec.ts`
- Delete: `tests/scope-audit.spec.ts`

**Interfaces:**

- Produces: `createManifest()` input, `buildRelayAppDescriptor()` identity/permissions, UI resource metadata, EmailJS env contract.
- Consumes: package identity from Task 1.

- [ ] **Step 1: Run GitNexus impact analysis before changing manifest consumers**

Run:

```powershell
gitnexus impact createManifest --repo privos-mcp-app-demo --direction upstream
gitnexus impact buildRelayAppDescriptor --repo privos-mcp-app-demo --direction upstream
```

Review direct callers in `src/server.ts`, `scripts/generate-manifest.ts`, `scripts/pair.ts`, and `scripts/preflight.ts`. Report before editing if risk is HIGH or CRITICAL.

- [ ] **Step 2: Extend the failing contract tests**

Add to `tests/migration-contract.spec.ts`:

```ts
import manifest from '../privos-app.json';

it('mirrors the old identity in the manifest', () => {
  expect(manifest.name).toBe(pkg.name);
  expect(manifest.title).toBe(pkg.title);
  expect(manifest.version).toBe(pkg.version);
});

it('uses a unique HR UI resource namespace', () => {
  const resourceUris = manifest.tools.flatMap((tool) => tool.ui?.resourceUri ? [tool.ui.resourceUri] : []);
  expect(resourceUris).toContain('ui://ai.privos.demo-hr-management-ws/dashboard.html');
  expect(resourceUris.some((uri) => uri.includes('ai.privos.mcp-app-demo'))).toBe(false);
});

it('declares only the approved HR permission set', () => {
  const scopes = manifest.permissions.map((permission) => permission.scope).sort();
  expect(scopes).toEqual([
    'basic:information', 'db:read', 'db:schema:read', 'db:schema:write', 'db:write',
    'files:read', 'files:write', 'lists:read', 'lists:write',
    'sandbox:ai-chat', 'sandbox:ai-chat:write', 'sandbox:botkey:push',
    'sandbox:generate', 'sandbox:skills:use', 'sandbox:wake',
  ].sort());
});

it('declares EmailJS processing without embedding secrets', () => {
  expect(manifest.dataPolicy.externalProcessing).toBe(true);
  const env = Object.fromEntries(manifest.env.map((entry) => [entry.key, entry]));
  expect(env.EMAILJS_SERVICE_ID.secret).toBe(false);
  expect(env.EMAILJS_TEMPLATE_ID.secret).toBe(false);
  expect(env.EMAILJS_PUBLIC_KEY.secret).toBe(false);
  expect(env.EMAILJS_PRIVATE_KEY.secret).toBe(true);
  expect(JSON.stringify(manifest)).not.toMatch(/CLIENT_SECRET|PRIVATE_KEY=.*|accessToken/i);
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npm test -- tests/migration-contract.spec.ts tests/manifest.spec.ts tests/permission-catalog.spec.ts`

Expected: FAIL on identity, permission set, EmailJS env, and demo-only tool assertions.

- [ ] **Step 4: Write the exact HR manifest contract**

Update `privos-app.json` with:

- `schemaVersion: 3`, `kind: "mcp-app"`.
- Identity fields from Task 1.
- `dataPolicy.externalProcessing: true` and retention text describing room HR records and email history.
- `stateless: true`, port/resources retained from the target runtime.
- The exact eight-tool set: `debug_log`, `hr_management_dashboard`, four `hrm.payroll.*` tools, and two `hrm.mail.*` tools. Only `hr_management_dashboard` carries resource URI `ui://ai.privos.demo-hr-management-ws/dashboard.html`.
- The exact 15-scope set asserted above.
- `basic:information` and `lists:read` use `requirement: "required"`; all remaining entries use `requirement: "optional"` with `degradedBehavior` and `recommended: true` where accepted.
- An installation agent:

```json
{
  "agentBot": {
    "name": "HR Mini App Assistant",
    "slug": "hr-mini-app-assistant"
  }
}
```

- These exact env declarations, all optional so missing email config degrades only email delivery:

```json
[
  { "key": "EMAILJS_SERVICE_ID", "description": "EmailJS service id used by tracked HR email delivery.", "required": false, "secret": false },
  { "key": "EMAILJS_TEMPLATE_ID", "description": "EmailJS template id used by tracked HR email delivery.", "required": false, "secret": false },
  { "key": "EMAILJS_PUBLIC_KEY", "description": "EmailJS public key used by tracked HR email delivery.", "required": false, "secret": false },
  { "key": "EMAILJS_PRIVATE_KEY", "description": "EmailJS private access token used only by the backend.", "required": false, "secret": true },
  { "key": "PRIVOS_AGENT_BOT_CREDENTIAL", "description": "Installation-agent Hub credential configured by an administrator.", "required": false, "secret": true },
  { "key": "PRIVOS_AGENT_BOT_USER_ID", "description": "Installation-agent Hub user id configured by an administrator.", "required": false, "secret": false }
]
```

Remove demo license tiers and demo tools (`hr_whoami`, `hr_bulk_export`, credential check, app object/db demo tools). Keep `debug_log` because the migrated lifecycle service calls it.

- [ ] **Step 5: Update manifest tests and permission catalog fixtures**

Make `tests/manifest.spec.ts` assert package/manifest field parity and this exact ordered tool set: `debug_log`, `hr_management_dashboard`, `hrm.payroll.query`, `hrm.mail.send`, `hrm.mail.retry`, `hrm.payroll.create`, `hrm.payroll.update`, `hrm.payroll.delete`. Keep the existing catalog entries for the retained 15 scopes and remove assertions that require demo-only scopes.

- [ ] **Step 6: Verify GREEN**

Run: `npm test -- tests/migration-contract.spec.ts tests/manifest.spec.ts tests/permission-catalog.spec.ts`

Expected: PASS.

Run: `npm run manifest:lint`

Expected: PASS with the schema-v3 HR manifest.

- [ ] **Step 7: Review the task working tree**

Run: `git diff --check; git diff -- privos-app.json tests/migration-contract.spec.ts tests/manifest.spec.ts tests/permission-catalog.spec.ts`

---

### Task 3: Adapt the Current Runtime to a Context-Aware HR Handler

**Files:**

- Modify: `src/relay-transport.ts`
- Replace: `src/mcp-message-handlers.ts`
- Modify: `tests/relay-actor-verification.spec.ts`
- Modify: `tests/mcp.spec.ts`

**Interfaces:**

- Produces: `handleMcpMessage(method, id, params, context)` and `relayMcpHandler(request, context)`.
- Consumes: `ToolCallContext` and `ApplicationMcpRequest` from `@privos_ai/app-server`.

- [ ] **Step 1: Run GitNexus impact analysis**

Run:

```powershell
gitnexus impact handleMcpMessage --repo privos-mcp-app-demo --direction upstream
gitnexus impact relayMcpHandler --repo privos-mcp-app-demo --direction upstream
```

Review the Direct HTTP, Relay, MCP test, and actor-verification paths. Report before editing if HIGH or CRITICAL.

- [ ] **Step 2: Write the failing adapter test**

Change the actor test into a context-forwarding contract. The essential assertion is:

```ts
function baseContext(overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  return {
    transport: 'relay', appId: 'ai.privos.demo-hr-management-ws',
    sessionScope: 'test-session', identityState: 'missing',
    ...overrides,
  };
}

it('forwards the runtime context to the HR handler', async () => {
  const context = baseContext({
    roomId: 'room-1',
    actor: {
      userId: 'user-1', username: 'alice', roomId: 'room-1',
      claims: Object.freeze({}), provenance: 'dispatch-assertion',
    },
  });
  const fakeHandler = vi.fn(async (_method, _id, _params, seenContext) => ({
    roomId: seenContext?.roomId,
    userId: seenContext?.actor?.userId,
  }));
  const result = await relayMcpHandler(
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'hrm.context.inspect', arguments: {} } },
    context,
    fakeHandler,
  );
  expect(result).toMatchObject({ roomId: 'room-1', userId: 'user-1' });
  expect(fakeHandler).toHaveBeenCalledWith('tools/call', 4, { name: 'hrm.context.inspect', arguments: {} }, context);
});
```

`hrm.context.inspect` exists only in the test request handled by `fakeHandler`; do not add it as a production tool. Implement the adapter with an optional handler argument:

```ts
export async function relayMcpHandler(
  request: ApplicationMcpRequest,
  context: ToolCallContext,
  handler = handleMcpMessage,
): Promise<unknown> {
  const id = typeof request.id === 'number' ? request.id : 0;
  return handler(request.method, id, request.params, context);
}
```

In the test, pass a fake handler that returns the context fields; do not add `hrm.context.inspect` to production.

- [ ] **Step 3: Run the adapter test and verify RED**

Run: `npm test -- tests/relay-actor-verification.spec.ts`

Expected: FAIL because the current adapter forwards only `context.actor` and accepts no handler dependency.

- [ ] **Step 4: Implement the minimal context-aware adapter**

Change the HR handler signature to:

```ts
export async function handleMcpMessage(
  method: string,
  id: number,
  params: unknown,
  context?: ToolCallContext,
): Promise<unknown>
```

Keep runtime-owned initialization semantics unchanged; application code handles only `tools/list`, `tools/call`, and `resources/read` in normal SDK dispatch.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- tests/relay-actor-verification.spec.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS for the adapter before adding HR service imports.

- [ ] **Step 6: Review the task working tree**

Run: `git diff --check; git diff -- src/relay-transport.ts src/mcp-message-handlers.ts tests/relay-actor-verification.spec.ts tests/mcp.spec.ts`

---

### Task 4: Add the Room-Bound Installation-Agent Hub Caller

**Files:**

- Create: `src/runtime-hub-tool-caller.ts`
- Create: `tests/runtime-hub-tool-caller.spec.ts`
- Retain: `src/resolve-hub-origin.ts`
- Retain: `src/resolve-own-mcp-app-id.ts`

**Interfaces:**

- Produces: `assertRoomBinding(roomId, context)`, `requiredScopeForHubTool(toolName)`, and `callRuntimeHubTool(input, dependencies?)`.
- Consumes: `ToolCallContext`, installation id, Hub origin, and `createAgentBotHubClient`.

- [ ] **Step 1: Run GitNexus impact analysis on reused resolvers**

Run:

```powershell
gitnexus impact resolveHubOrigin --repo privos-mcp-app-demo --direction upstream
gitnexus impact resolveOwnMcpAppId --repo privos-mcp-app-demo --direction upstream
```

- [ ] **Step 2: Write failing room and payload tests**

Create tests with injected dependencies:

```ts
import { describe, expect, it, vi } from 'vitest';
import { assertRoomBinding, callRuntimeHubTool, requiredScopeForHubTool } from '../src/runtime-hub-tool-caller';

describe('runtime Hub tool caller', () => {
  it('rejects a trusted room mismatch before creating a client', async () => {
    const createClient = vi.fn();
    await expect(callRuntimeHubTool({
      roomId: 'room-2', toolName: 'privos.lists.getAll', arguments: {},
      context: { transport: 'direct', appId: 'app', sessionScope: 's', identityState: 'verified', roomId: 'room-1' },
    }, { resolveOwnMcpAppId: async () => 'install-1', resolveHubOrigin: async () => 'https://hub.test', createClient }))
      .rejects.toThrow('Room context mismatch');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('sends the installation id, tool, arguments, and bound room', async () => {
    const authorizedFetch = vi.fn(async () => new Response(JSON.stringify({
      success: true, content: [{ type: 'text', text: JSON.stringify({ lists: [] }) }],
    }), { status: 200 }));
    const result = await callRuntimeHubTool({
      roomId: 'room-1', toolName: 'privos.lists.getAll', arguments: {},
      context: { transport: 'relay', appId: 'app', sessionScope: 's', identityState: 'missing' },
    }, {
      resolveOwnMcpAppId: async () => 'install-1',
      resolveHubOrigin: async () => 'https://hub.test',
      createClient: () => ({ authorizedFetch }),
    });
    expect(result).toEqual({ lists: [] });
    expect(requiredScopeForHubTool('privos.lists.getAll')).toBe('lists:read');
    expect(authorizedFetch).toHaveBeenCalledWith('/api/v1/mcp-apps.tool-call', expect.objectContaining({ requiredScope: 'lists:read' }));
    expect(JSON.parse(authorizedFetch.mock.calls[0][1].body as string)).toEqual({
      mcpAppId: 'install-1', toolName: 'privos.lists.getAll', arguments: {}, roomId: 'room-1',
    });
  });
});
```

- [ ] **Step 3: Run the tests and verify RED**

Run: `npm test -- tests/runtime-hub-tool-caller.spec.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement the minimal caller**

Implement exact scope mapping:

```ts
export function requiredScopeForHubTool(name: string): string {
  if (/\.(get|query|search|read)/i.test(name)) {
    if (name.startsWith('privos.db.')) return 'db:read';
    return 'lists:read';
  }
  if (name === 'privos.db.registerCollection') return 'db:schema:write';
  if (name.startsWith('privos.db.')) return 'db:write';
  return 'lists:write';
}
```

`assertRoomBinding` rejects an empty room. It compares the requested room with `context.roomId` and `context.actor?.roomId` when either trusted value exists. `callRuntimeHubTool` resolves installation id and Hub origin, creates `createAgentBotHubClient({ resolveHubOrigin })`, calls `/api/v1/mcp-apps.tool-call`, parses `content[0].text` as JSON, and throws a credential-safe error on missing identity, malformed content, or non-success response.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- tests/runtime-hub-tool-caller.spec.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Review the task working tree**

Run: `git diff --check; git diff -- src/runtime-hub-tool-caller.ts tests/runtime-hub-tool-caller.spec.ts`

---

### Task 5: Port Tracked Email Services and HR MCP Tools

**Files:**

- Create from old source: `src/email-history/email-history-model.ts`
- Create from old source: `src/services/EmailHistoryRepository.ts`
- Create from old source: `src/services/MailService.ts`
- Create from old source: `src/services/TrackedMailService.ts`
- Create from old source: `src/utils/email-validation.ts`
- Create from old source: `src/utils/TaskQueue.ts`
- Create: `src/hr-service-registry.ts`
- Modify: `src/mcp-message-handlers.ts`
- Replace: `tests/mcp.spec.ts`
- Create: `tests/tracked-mail-service.spec.ts`

**Interfaces:**

- Produces: HR tool list and implementations for dashboard, payroll, send, and retry.
- Consumes: `callRuntimeHubTool`, room-bound context, EmailJS env, old service contracts.

- [ ] **Step 1: Run GitNexus impact analysis on old service symbols and the target handler**

Run from the old repository for migration-source risk, then from the target:

```powershell
gitnexus impact EmailHistoryRepository --repo hr-miniapp --direction upstream
gitnexus impact TrackedMailService --repo hr-miniapp --direction upstream
gitnexus impact handleMcpMessage --repo privos-mcp-app-demo --direction upstream
```

- [ ] **Step 2: Write failing MCP tool-contract tests**

Replace demo assertions in `tests/mcp.spec.ts` with:

```ts
function baseContext(overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  return {
    transport: 'relay', appId: 'ai.privos.demo-hr-management-ws',
    sessionScope: 'mcp-test', identityState: 'missing',
    ...overrides,
  };
}

it('lists only the retained HR tools', async () => {
  const listed: any = await handleMcpMessage('tools/list', 1, {});
  expect(listed.tools.map((tool: any) => tool.name)).toEqual([
    'debug_log', 'hr_management_dashboard',
    'hrm.payroll.query', 'hrm.mail.send', 'hrm.mail.retry',
    'hrm.payroll.create', 'hrm.payroll.update', 'hrm.payroll.delete',
  ]);
  expect(listed.tools[1]._meta.ui.resourceUri).toBe('ui://ai.privos.demo-hr-management-ws/dashboard.html');
});

it('removes the password and forwards an explicit payroll room', async () => {
  const callHub = vi.fn(async () => ({ records: [] }));
  const result = await handleMcpMessage('tools/call', 2, {
    name: 'hrm.payroll.query',
    arguments: { roomId: 'room-1', password: 'never-forward', collection: 'payroll_records', where: [] },
  }, baseContext({ roomId: 'room-1' }), { callHub });
  expect(callHub).toHaveBeenCalledWith(expect.objectContaining({
    roomId: 'room-1', toolName: 'privos.db.query',
    arguments: { collection: 'payroll_records', where: [] },
  }));
  expect(JSON.stringify(result)).not.toContain('never-forward');
});
```

Add an optional dependency parameter to `handleMcpMessage` for test-only gateways:

```ts
type HrHandlerDependencies = {
  callHub?: typeof callRuntimeHubTool;
  services?: HrServiceRegistry;
};
```

- [ ] **Step 3: Write failing mail orchestration tests**

Test `TrackedMailService` with real service logic and fake gateways: delivery success creates a `sent` history record; delivery failure creates a `failed` record and rethrows; two simultaneous retries for the same `roomId:itemId` reject the second with the existing Vietnamese retry message.

- [ ] **Step 4: Run tests and verify RED**

Run: `npm test -- tests/mcp.spec.ts tests/tracked-mail-service.spec.ts`

Expected: FAIL because HR tools/services are not present in the target.

- [ ] **Step 5: Copy and minimally adapt the old backend modules**

Copy only the listed source files. Preserve service behavior and Vietnamese messages. Update imports only for their new target-relative paths. Do not copy `src/relay-client.ts`, `src/server.ts`, or the old `src/mcp-message-handlers.ts` wholesale.

Create `HrServiceRegistry` with a `Map<string, TrackedMailService>`. `forRoom(roomId, context)` creates an `EmailHistoryRepository` whose `HubToolCaller` closure invokes `callRuntimeHubTool({ roomId, context, toolName, arguments })`; the same room reuses one `TrackedMailService`, preserving retry locking.

- [ ] **Step 6: Implement the HR handler branches**

Use the old tool definitions and response shapes. For payroll:

1. Read outer `arguments.roomId`.
2. Call `assertRoomBinding` before any other work.
3. Remove outer `roomId` and `password` from the forwarded arguments.
4. Map `hrm.payroll.<operation>` to `privos.db.<operation>`.
5. Return the Hub result in the same MCP content envelope expected by `PayrollService`.

For mail send/retry, validate `roomId`, email fields, source, and room binding before obtaining the room service. Preserve tracked/untracked delivery behavior from the old handler.

- [ ] **Step 7: Verify GREEN**

Run: `npm test -- tests/mcp.spec.ts tests/tracked-mail-service.spec.ts tests/runtime-hub-tool-caller.spec.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Review the task working tree**

Run: `git diff --check; git diff -- src/mcp-message-handlers.ts src/runtime-hub-tool-caller.ts src/hr-service-registry.ts src/email-history src/services src/utils tests/mcp.spec.ts tests/tracked-mail-service.spec.ts`

---

### Task 6: Transplant the HR UI Without Reference-Demo Panels

**Files:**

- Replace mechanically: `src/ui/**` with the old `hr-miniapp/src/ui/**` tree.
- Preserve and merge: `src/ui/privos-rest.ts` current error classes plus old HR file/folder helpers.
- Copy: `public/images/company-logos/logo.svg`
- Create: `tests/hr-ui-contract.spec.ts`
- Modify: `src/ui/payroll/services/PayrollService.ts`
- Modify: every migrated source import of `@privos/app-react`.

**Interfaces:**

- Produces: the complete HR UI and host-bridge integration.
- Consumes: `@privos_ai/app-react`, HR MCP tools from Task 5, target Vite asset layout.

- [ ] **Step 1: Run GitNexus impact analysis on UI roots and shared REST helper**

Run:

```powershell
gitnexus impact App --repo hr-miniapp --direction upstream
gitnexus impact restCall --repo privos-mcp-app-demo --direction upstream
gitnexus impact PayrollService --repo hr-miniapp --direction upstream
```

- [ ] **Step 2: Write a failing HR UI contract test**

Create `tests/hr-ui-contract.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/ui/main.tsx', import.meta.url), 'utf8');

describe('migrated HR UI', () => {
  it('retains the HR navigation and excludes reference-demo panels', () => {
    for (const label of ['Trang chủ', 'Tuyển dụng', 'Chấm điểm CV', 'Vòng đời nhân sự', 'Đào tạo', 'Soạn thảo', 'Bảng lương', 'Email']) {
      expect(appSource).toContain(label);
    }
    for (const removed of ['Who am I', 'Bulk export', 'Custom permissions', 'App Objects']) {
      expect(appSource).not.toContain(removed);
    }
  });

  it('loads the HR premium stylesheet', () => {
    expect(mainSource).toContain("import './hr-premium-styles.css'");
  });
});
```

- [ ] **Step 3: Run the UI contract test and verify RED**

Run: `npm test -- tests/hr-ui-contract.spec.ts`

Expected: FAIL because the target still contains reference-demo navigation.

- [ ] **Step 4: Replace the UI tree safely and mechanically**

Resolve and verify the absolute target is exactly `<repo>\src\ui` before removing its contents. Copy the old `src/ui` tree without following links and without copying `node_modules`, build output, env files, or repository metadata. Exclude `scratch-test.ts`, `test-docx-gen.ts`, `test-upload-md.ts`, and `email-service.ts`, which are unreferenced manual-test/browser-email artifacts rather than product UI. This is a mechanical source transplant; all semantic edits happen in later steps.

Replace every migrated `@privos/app-react` import with `@privos_ai/app-react`. Do not change component names, labels, layout, or CSS during this pass.

- [ ] **Step 5: Merge the current REST error semantics into the old helper surface**

Keep these target exports unchanged: `OptionalFeatureUnavailableError`, `PrivosRestError`, `safeFeatureError`, and the current `restCall` status/error parsing. Append the old exports required by HR code: `getFileContent`, `ensureFolderPath`, and `createOrUpdateFile`.

- [ ] **Step 6: Bind every payroll tool call to the room explicitly**

Update `PayrollService` so `initializeSchema`, query, create, update, and delete include outer `roomId: this.roomId`. Keep the existing record-level `data.roomId` and query `where` filter. Example:

```ts
await this.app.callServerTool({
  name: 'hrm.payroll.delete',
  arguments: { roomId: this.roomId, collection: this.collectionName, id },
});
```

- [ ] **Step 7: Copy the HR public asset and keep the app icon**

Copy `hr-miniapp/public/images/company-logos/logo.svg` to the same target-relative path. Keep or replace `public/icon.svg` only with a valid app icon; manifest icon remains `/public/icon.svg`.

- [ ] **Step 8: Run UI tests, typecheck, and build**

Run: `npm test -- tests/hr-ui-contract.spec.ts tests/privos-rest.spec.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: initial failures identify only concrete SDK/type compatibility gaps. Fix each gap without changing visible behavior, rerunning until PASS.

Run: `npm run build`

Expected: Vite emits `dist/ui/assets` and the inline-resource build completes.

- [ ] **Step 9: Review the task working tree**

Run: `rg -n "@privos/app-react|\.\./privos-app-packages|ai\.privos\.mcp-app-demo" src package.json privos-app.json`

Expected: no old SDK import, local package path, or reference-demo identity.

Run: `git diff --check`

---

### Task 7: Migrate the Old Payroll Policy Test and Remove Demo-Only Code

**Files:**

- Create: `tests/payroll-access-context.spec.ts`
- Delete: `tests/payroll-access-context.test.ts` if copied into the target.
- Delete demo-only backend files listed in File Structure.
- Delete demo-only target tests while retaining: migration contract, manifest, permission catalog, MCP, runtime security, relay adapter, REST helper, packaging, HR UI, Hub caller, tracked mail, and payroll policy tests.

**Interfaces:**

- Produces: a target test suite aligned only with the HR app and retained runtime infrastructure.
- Consumes: migrated payroll access policy and current Vitest setup.

- [ ] **Step 1: Write the Vitest payroll policy test before deleting the node:test source**

Port the four existing assertions to Vitest:

```ts
import { describe, expect, it } from 'vitest';
import { isPayrollOwnerFromContextResult } from '../src/ui/payroll/access/payroll-access-context';

describe('payroll owner context', () => {
  it('allows only the exact owner role', () => {
    expect(isPayrollOwnerFromContextResult({ content: [{ text: JSON.stringify({ userRoles: ['owner'] }) }] })).toBe(true);
    expect(isPayrollOwnerFromContextResult({ content: [{ text: JSON.stringify({ userRoles: ['admin'] }) }] })).toBe(false);
  });
  it('fails closed for malformed or failed context', () => {
    expect(isPayrollOwnerFromContextResult({ content: [{ text: '{bad' }] })).toBe(false);
    expect(isPayrollOwnerFromContextResult(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Verify the ported payroll test passes**

Run: `npm test -- tests/payroll-access-context.spec.ts`

Expected: PASS against the unchanged migrated policy.

- [ ] **Step 3: Remove demo-only modules and tests**

Delete only the exact demo files enumerated in File Structure and tests whose imported production module was removed. Keep runtime security, manifest, permission-catalog, relay, packaging, and HR tests. Verify no remaining import points at a deleted file:

Run: `rg -n "agent-bot-credential-check|app-db-demo|app-objects-demo|app-platform-demo|license-panel|whoami-panel|custom-permissions-panel|notification-panel" src tests`

Expected: no matches.

- [ ] **Step 4: Verify target independence**

Run:

```powershell
rg -n "hr-miniapp|privos-app-packages|@privos/app-react|file:\.\." src tests scripts package.json privos-app.json vite.config.ts tsconfig.json
```

Expected: no runtime/build dependency match. Comments in migration documentation are outside this check.

- [ ] **Step 5: Run the full functional suite**

Run: `npm test -- --exclude tests/packaging.spec.ts`

Expected: all functional and runtime tests PASS.

- [ ] **Step 6: Review the task working tree**

Run: `git diff --check; git status --short`

Confirm deleted files are demo-only and no retained runtime infrastructure was removed.

---

### Task 8: Align Preflight, Documentation, and Cross-Platform Commands

**Files:**

- Modify: `scripts/preflight.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `PRIVOS.md`
- Modify: `SCOPES.md`
- Modify: `tests/runtime-security.spec.ts`
- Create: `tests/documentation-contract.spec.ts`

**Interfaces:**

- Produces: accurate operational instructions and preflight assertions for the HR app.
- Consumes: manifest, scripts, and runtime from Tasks 1–7.

- [ ] **Step 1: Run GitNexus impact analysis before changing preflight**

Run: `gitnexus impact main --repo privos-mcp-app-demo --file scripts/preflight.ts --direction upstream`

- [ ] **Step 2: Write failing preflight identity assertions**

Extend `tests/runtime-security.spec.ts` with package-script assertions and create `tests/documentation-contract.spec.ts` with an exact documentation identity assertion:

```ts
expect(pkg.scripts.dev).toContain('cross-env PRIVOS_TRANSPORT=relay PRIVOS_DEV_UI=1');
expect(pkg.scripts['start:standalone']).toContain('cross-env NODE_ENV=production');
expect(JSON.stringify(pkg)).not.toContain('file:../privos-app-packages');
```

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('HR runtime documentation', () => {
  it('documents the migrated identity and self-contained directory', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    expect(readme).toContain('HR Mini app V3');
    expect(readme).toContain('ai.privos.demo-hr-management-ws');
    expect(readme).not.toContain('PrivOS Demo MCP App');
    expect(readme).not.toContain('git clone');
  });
});
```

Run: `npm test -- tests/runtime-security.spec.ts tests/documentation-contract.spec.ts`

Expected: runtime script assertions PASS after Task 1 and documentation assertions FAIL because README still describes the reference demo.

- [ ] **Step 3: Update preflight to the HR contract**

Keep manifest digest, runtime security, workload identity, and package-safety checks. Replace demo-only expected tools/env/license fields with:

- exact HR identity parity,
- the exact eight retained HR tools and unique dashboard resource URI,
- exact 15-scope permission set,
- four EmailJS env fields with private-key secrecy,
- no local/file dependencies,
- no old SDK namespace.

- [ ] **Step 4: Update runtime documentation**

Document `npm ci`, `npm run dev`, `npm run build`, `npm start`, managed runtime, standalone pairing, EmailJS settings, installation-agent settings, and feature-specific permission degradation. Remove reference-demo panel/license instructions and all GitHub clone/publish steps from the primary local migration instructions.

Update `.env.example` with commented optional EmailJS and installation-agent variables only; never insert real values.

- [ ] **Step 5: Verify documentation and preflight**

Run: `npm test -- tests/runtime-security.spec.ts tests/documentation-contract.spec.ts`

Expected: PASS.

Run: `npm run preflight`

Expected: PASS.

Run: `npm run manifest:lint`

Expected: PASS.

Run: `rg -n "ai\.privos\.mcp-app-demo|PrivOS Demo MCP App" README.md PRIVOS.md SCOPES.md .env.example scripts src package.json privos-app.json`

Expected: no stale app identity or title. Historical changelog entries may retain their original text only if clearly historical and not used by build/runtime checks.

- [ ] **Step 6: Review the task working tree**

Run: `git diff --check; git diff -- scripts/preflight.ts .env.example README.md PRIVOS.md SCOPES.md package.json`

---

### Task 9: Full Verification, Smoke Test, and GitNexus Change Audit

**Files:**

- Verify all changed files.
- Do not create commits or GitHub artifacts.

**Interfaces:**

- Consumes: every deliverable from Tasks 1–8.
- Produces: fresh evidence that the target is self-contained and runnable.

- [ ] **Step 1: Re-index the changed target and inspect GitNexus status**

Run: `gitnexus analyze .`

Run: `gitnexus status`

Expected: index points at `privos-mcp-app-demo` and includes the migrated HR symbols.

- [ ] **Step 2: Run strict type verification**

Run: `npm run typecheck:strict-unused`

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 3: Run the complete functional test suite**

Run: `npm test -- --exclude tests/packaging.spec.ts`

Expected: all functional tests PASS with zero failures.

- [ ] **Step 4: Run the complete test command and classify packaging evidence**

Run: `npm test`

Expected on a bash-capable environment: all tests PASS. On this Windows host, the pre-existing packaging test may fail only because `/bin/bash` is unavailable; record the exact two packaging failures and confirm all other test files pass. Do not suppress or convert functional failures into skips.

- [ ] **Step 5: Build and validate the manifest**

Run:

```powershell
npm run build
npm run manifest:lint
npm run preflight
```

Expected: all three commands exit 0.

- [ ] **Step 6: Smoke-test the runtime surface**

Start `npm start` in a hidden background process with a temporary non-production port and development mode. Poll up to 30 seconds for:

- `GET /health` returns 200.
- `GET /ready` returns the documented development readiness result.
- `GET /.well-known/mcp/manifest.json` returns name `ai.privos.demo-hr-management-ws`, title `HR Mini app V3`, and version `1.0.0`.

Stop only the exact process started by the smoke test; do not terminate unrelated Node processes.

- [ ] **Step 7: Prove target independence**

Run:

```powershell
rg -n "@privos/app-react|file:.*privos-app-packages|\.\./hr-miniapp|\.\./privos-app-packages" src tests scripts package.json package-lock.json privos-app.json vite.config.ts tsconfig.json
```

Expected: no matches.

- [ ] **Step 8: Run GitNexus change detection and assess blast radius**

Run: `gitnexus detect-changes --repo privos-mcp-app-demo`

Review affected symbols and flows against this plan. Expected areas: manifest/runtime descriptor, MCP dispatch, inline UI, HR navigation, payroll, email history, and runtime tests. Investigate any unrelated high-risk flow before completion.

- [ ] **Step 9: Final working-tree review**

Run: `git diff --check; git status --short; git diff --stat`

Confirm:

- changes are confined to `privos-mcp-app-demo`,
- no secret or identity file is present,
- no modification was made to the pre-existing `privos-app-packages/app-react/package-lock.json`,
- no commit or GitHub operation occurred.

---

## Execution Handoff

This plan intentionally contains no commit steps. Execute it in the current working tree with review checkpoints after every task. If parallel-agent execution is explicitly authorized later, task boundaries may be delegated only where they do not share files; otherwise use inline execution in this session.
