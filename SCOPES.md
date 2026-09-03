# HR Mini App permission map

`privos-app.json` is authoritative. Required permissions are needed for the core HR dashboard; optional permissions disable only their associated feature when absent.

| Permission | HR usage | Degraded behavior |
|---|---|---|
| `basic:information` | Receives the installation, room, user roles, and host theme through `PrivosAppProvider`. | Installation cannot open without a trusted room context. |
| `lists:read` | Reads recruitment, CV, employee, training, template, and email-history lists. | Required; installation is cancelled if rejected. |
| `lists:write` | Creates and updates HR records, stages, templates, and email history. | HR records remain read-only. |
| `files:read` | Reads CVs, JD templates, employee documents, and training files. | File-backed previews and workflows are unavailable. |
| `files:write` | Uploads CVs/documents and writes generated Markdown or DOCX output. | Upload and generated-file actions are disabled. |
| `sandbox:skills:use` | Uses the HR screening, drafting, JD, and onboarding skills selected for the room. | Skill-driven actions are unavailable. |
| `sandbox:botkey:push` | Connects the approved room sandbox to the installation bot. | Sandbox bot connection cannot be established. |
| `sandbox:wake` | Wakes the approved room sandbox before HR generation. | Wake/state controls are unavailable. |
| `sandbox:generate` | Runs CV screening, JD generation, drafting, and related HR workloads. | Generation actions are unavailable. |
| `sandbox:ai-chat` | Reads existing room AI sessions used by HR workflows. | Existing AI history is unavailable. |
| `sandbox:ai-chat:write` | Starts, sends, and stops HR AI sessions. | AI actions become read-only or unavailable. |
| `db:read` | Reads room-scoped payroll records through `hrm.payroll.query`. | Payroll cannot be displayed. |
| `db:write` | Creates, updates, and deletes room-scoped payroll records. | Payroll mutations are disabled. |
| `db:schema:read` | Allows payroll collection schema inspection. | Schema inspection is unavailable. |
| `db:schema:write` | Registers the payroll collection schema. | Payroll initialization is unavailable. |

Backend payroll and tracked-email calls compare the requested room with the runtime `ToolCallContext` before any Hub I/O. The backend uses the installation-agent credential only; it never accepts a browser-provided credential.
