# HR Mini app V3

Self-contained PrivOS MCP app with identity `ai.privos.demo-hr-management-ws`. It preserves the existing HR interface and workflows for recruitment, CV screening, employee lifecycle, payroll, training, document drafting, and tracked email.

The application depends only on packages installed inside this directory. It has no runtime or build dependency on the former `hr-miniapp` or `privos-app-packages` directories.

## Local setup

Requirements: Node.js 22+ and npm.

```powershell
cd C:\Users\MCP_App\demo\hr-app-new\privos-mcp-app-demo
npm ci
Copy-Item .env.example .env
npm run dev
```

Development mode connects through the PrivOS Relay pairing flow. Credentials obtained from the local pairing prompt are cached in `.env`; do not use development credentials for managed production.

## Build and verification

```powershell
npm run typecheck
npm test
npm run build
npm run manifest:lint
npm run preflight
```

The source-packaging test needs a Bash-capable build host. On Windows without WSL, run the functional suites directly; build, manifest lint, runtime preflight, and all HR tests are native PowerShell-compatible.

## Runtime modes

- `npm run dev`: development Relay with live Vite UI.
- `npm start`: automatic PrivOS runtime selection.
- `npm run start:relay`: explicit development Relay entry.
- `npm run start:standalone`: paired standalone production with `NODE_ENV=production`.
- Managed PrivOS: the platform injects workload identity and installation binding; no OAuth secret is supplied by the UI.

The dashboard resource URI is `ui://ai.privos.demo-hr-management-ws/dashboard.html`. Payroll and tracked-email backend calls bind requested `roomId` to the verified runtime context before calling the Hub.

## EmailJS

Tracked email uses these optional backend environment variables:

- `EMAILJS_SERVICE_ID`
- `EMAILJS_TEMPLATE_ID`
- `EMAILJS_PUBLIC_KEY`
- `EMAILJS_PRIVATE_KEY` (secret)

When they are absent, email delivery reports a configuration error while other HR features continue to run. Email history is stored in a room-scoped PrivOS list.

## Installation agent

Room-bound backend Hub calls use `PRIVOS_AGENT_BOT_USER_ID` and the secret `PRIVOS_AGENT_BOT_CREDENTIAL`, supplied by PrivOS or an administrator. Values are never embedded in the manifest, UI bundle, or logs.

See [SCOPES.md](SCOPES.md) for the exact 15-permission feature map and `privos-app.json` for the authoritative schema-v3 manifest.
