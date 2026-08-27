# Filevine MCP — Claude Integration

> ### Built by [Oktopeak](https://oktopeak.com/?utm_source=github&utm_medium=readme&utm_campaign=filevine-mcp&utm_content=top-byline) — AI transformation & automation for law firms
> **Digital transformation for legal and healthcare businesses.** We build AI integrations, workflow automation, and custom software your firm owns outright — including this connector. → [Book a 30-min call](https://calendly.com/office-oktopeak/30min?utm_source=github&utm_medium=readme&utm_campaign=filevine-mcp&utm_content=top-byline-call)

An open-source MCP (Model Context Protocol) server connecting Claude to Filevine practice management platform. Access cases, contacts, documents, notes, tasks, and custom PI data from Claude with automatic rate limiting and audit logging.

**Supported Endpoints:** 15 tools covering the Filevine v2 REST API.

> [!TIP]
> **Not a developer? You don't need to be.**
>
> The README below assumes someone comfortable editing a JSON config file. If that's not you or your team, we deploy this for law firms: scoped credentials, audit log wired in, one custom workflow, training.
>
> → **[See Guided MCP Setup](https://oktopeak.com/services/mcp-guided-setup/?utm_source=github&utm_medium=readme&utm_campaign=filevine-mcp&utm_content=top-tip-svc)**, or [book a 30-min call](https://calendly.com/office-oktopeak/30min?utm_source=github&utm_medium=readme&utm_campaign=filevine-mcp&utm_content=top-tip-call)

**Jump to:** [Setup](#setup) · [Available tools](#tools-15-total) · [Compliance & security](#compliance--security) · [Need it deployed for you?](#need-more-than-the-connector) · [Other connectors](#other-connectors-by-oktopeak)

---

## Setup

### 1. Prerequisites
- Node.js 18+
- Filevine account with API access enabled
- Client ID, Client Secret, and Personal Access Token (PAT) from your firm's Filevine settings
- Claude Code, MCP client, or compatible application

### 2. Get Filevine Credentials

1. **Personal Access Token (PAT)**
   - Go to Filevine Settings → Access Tokens → Generate PAT
   - Copy and save securely

2. **Client Credentials**
   - Go to Settings → Client Secrets → Create Client ID + Client Secret
   - Valid for 1 year, can be rotated anytime
   - Copy both values

3. **Organization & User IDs** (auto-discovered on first auth call)
   - The server will discover these from `/v2/users/me` on first run

### 3. Environment Variables

Copy `.env.example` to `.env`:

```bash
# Filevine OAuth client credentials
FILEVINE_CLIENT_ID=<from Settings → Client Secrets>
FILEVINE_CLIENT_SECRET=<from Settings → Client Secrets>
FILEVINE_PAT=<from Settings → Access Tokens>

# API region (us or ca)
FILEVINE_REGION=us

# Token encryption key (generate new one)
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=<64-character-hex-string>
```

### 4. Install & Build

```bash
npm install
npm run build
```

### 5. Run the Server

```bash
# Start the server
npm start

# Or use MCP inspector for debugging
npm run inspect
```

The server listens on stdio and outputs connection status to stderr.

### 6. Authenticate

Before using any Filevine tools, call the `authenticate` tool:
```
Tool: authenticate
→ Exchanges PAT for access token
→ Discovers org_id and user_id
→ Stores encrypted tokens in ~/.oktopeak-filevine/tokens.enc
```

Tokens auto-refresh before expiry (3600s TTL). Call `logout` to clear stored tokens.

---

## Tools (15 Total)

### Authentication (3 tools)

| Tool | Purpose |
|------|---------|
| `authenticate` | Exchange PAT for access token and cache org/user IDs |
| `auth-status` | Check authentication status and token expiry |
| `logout` | Clear stored tokens |

### Cases — Projects (2 tools)

| Tool | Purpose |
|------|---------|
| `list-cases` | List cases (active, closed, pending); search by name/number |
| `get-case` | Get full case details by ID |

### Contacts (3 tools)

| Tool | Purpose |
|------|---------|
| `search-contacts` | Search contacts by name, email, or phone across all cases |
| `get-contact` | Get contact details by ID |
| `list-case-contacts` | List all contacts on a specific case |

### Notes (2 tools)

| Tool | Purpose |
|------|---------|
| `list-notes` | List case notes; supports general, phone_call, and internal types |
| `create-note` | Create a note (e.g., AI summary, findings, follow-ups) |

### Documents (1 tool)

| Tool | Purpose |
|------|---------|
| `list-documents` | List case documents with metadata (name, type, size, URL, dates) |

**Note:** Returns document metadata only — no binary content. Use returned URLs to fetch document content if needed.

### Tasks (2 tools)

| Tool | Purpose |
|------|---------|
| `list-tasks` | List case tasks by status (open, completed, overdue) |
| `create-task` | Create a new task with title, description, assignee, due date |

**Known Issue:** The `targetDate` field may be ignored by the Filevine API as of Aug 2025. Workaround: set tasks via UI.

### Custom Data — Collections (2 tools)

| Tool | Purpose |
|------|---------|
| `discover-schema` | Map your firm's custom sections (medical records, liens, settlements, etc.) |
| `get-collection` | Fetch custom collection data using discovered selectors |

**Why collections matter:** Unlike standardized case fields, each firm builds custom "Collection sections" for PI workflows. The `discover-schema` tool finds your firm's structure.

**Example workflow:**
1. Call `discover-schema` → see available sections (e.g., "MedicalRecords", "Liens")
2. Use selector from discovery → `get-collection` to fetch PI-specific data

---

## Rate Limiting & Performance

**Filevine Rate Limits:**
| Endpoint | Limit |
|----------|-------|
| Standard | 320 req/endpoint/min |
| Billing | 250 req/endpoint/min |
| Reports/Vitals | 5 req/endpoint/min |
| VineSign | 10 req/user/month |

**Implementation:**
- Token bucket at 300 req/min (conservative)
- Exponential backoff on 429 Too Many Requests (1s → 2s → 4s → ... → 30s max)
- Automatic wait before rate limit breach

---

## API Details

### Request Flow

1. **Token Exchange (on first `authenticate` call)**
   ```
   POST https://identity.filevine.com/connect/token
   client_id, client_secret, grant_type=personal_access_token, token=PAT
   → access_token (3600s), refresh_token, scopes
   ```

2. **Org/User Discovery**
   ```
   GET /v2/users/me
   Authorization: Bearer {access_token}
   → {id: user_id, org_id: org_id}
   ```

3. **Every API Request (3 required headers)**
   ```
   Authorization: Bearer {access_token}
   x-fv-orgid: {org_id}
   x-fv-userid: {user_id}
   ```

### Base URLs

- **US:** `https://api.filevine.io`
- **CA:** `https://api.filevine.ca`

Set via `FILEVINE_REGION` environment variable.

### Authentication Headers

The biggest difference from other legal APIs: **every request needs 3 headers**, not just `Authorization`. Filevine uses `x-fv-orgid` and `x-fv-userid` to scope queries to the correct organization and user context.

---

## Architecture

```
src/
├── index.ts                      # Server entry point
├── filevine-client.ts            # API client with 3-header middleware
├── auth/
│   ├── authTools.ts              # authenticate, auth-status, logout
│   ├── oauth.ts                  # PAT token exchange + org/user discovery
│   └── token-store.ts            # AES-256-GCM encrypted token storage
├── tools/
│   ├── cases.ts                  # list-cases, get-case
│   ├── contacts.ts               # search-contacts, get-contact, list-case-contacts
│   ├── notes.ts                  # list-notes, create-note
│   ├── documents.ts              # list-documents
│   ├── tasks.ts                  # list-tasks, create-task
│   └── collections.ts            # discover-schema, get-collection
├── resources/
│   ├── auth-status.ts            # Auth status resource (filevine://auth/status)
│   └── compliance.ts             # Compliance notice
├── audit/
│   └── logger.ts                 # Audit logging (JSON-lines)
└── utils/
    └── rate-limiter.ts           # Token bucket + 429 backoff
```

### Token Storage

Tokens are encrypted with AES-256-GCM and stored locally:
- **Location:** `~/.oktopeak-filevine/tokens.enc`
- **Encryption:** AES-256-GCM with random IV + auth tag
- **Key:** `ENCRYPTION_KEY` from `.env` (64-char hex)

### Audit Logging

Every tool call is logged to `~/.oktopeak-filevine/audit.log`:
- Timestamp, tool name, arguments (secrets redacted)
- Outcome (success/error), user ID, case ID, result count
- Supports ABA Opinion 512 compliance documentation

---

## Error Handling

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `ENCRYPTION_KEY is not set` | Missing env var | Generate key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PAT exchange failed (401)` | Invalid credentials | Verify Client ID, Secret, PAT from Filevine Settings |
| `Failed to discover user info` | Token doesn't have required scopes | Regenerate PAT and Client Credentials in Filevine |
| `429 Too Many Requests` | Rate limit hit | Server auto-backs off; normal behavior under load |
| `Unknown collection selector` | Selector not found | Run `discover-schema` to find available selectors |

---

## Development

### TypeScript
- Strict mode enabled
- ES2022 target, Node16 modules
- `npm run build` → `build/` directory

### Dependencies
- `@modelcontextprotocol/sdk` — MCP protocol
- `dotenv` — Environment loading
- `zod` — Schema validation for tool parameters
- `crypto`, `fs`, `http` — Node builtins

### Debugging
```bash
npm run inspect
```
Opens MCP inspector at http://localhost:3000 — test tools, check parameters, verify responses.

### Testing
```bash
npm run build
npm start
# In another terminal:
npm run inspect
```

---

## Resources

### Official Filevine
- **API Docs:** [developer.filevine.io](https://developer.filevine.io)
- **Support:** [support.filevine.com/hc/en-us](https://support.filevine.com/hc/en-us)
- **Examples:** [github.com/Filevine/filevine-api-examples](https://github.com/Filevine/filevine-api-examples) (C#, JS, Python)
- **Rate Limits:** [support.filevine.com/hc/en-us/articles/30948396130203](https://support.filevine.com/hc/en-us/articles/30948396130203)

### Reference Implementations
- **Treillage (Python):** [github.com/W1ndst0rm/Treillage](https://github.com/W1ndst0rm/Treillage) — Rate limiter + token refresh reference

---

## Compliance & Security

- **Data Handling:** All Filevine data fetched on-demand — nothing cached locally
- **Token Storage:** AES-256-GCM encrypted on disk; decryption requires `ENCRYPTION_KEY`
- **Audit Logging:** Every tool call logged with redacted secrets
- **Rate Limiting:** 300 req/min rolling window + 429 backoff protects your account
- **Write Access:** Only `create-note` and `create-task` modify data
- **Token Refresh:** Auto-refresh 5 min before expiry (3600s TTL)

See [src/resources/compliance.ts](src/resources/compliance.ts) for full compliance notice.

---

## License

MIT — Oktopeak

---

## Need more than the connector?

The open-source connector reads your Filevine data and lets Claude work with it. That handles about 20% of what most firms eventually want.

We help two ways, depending on your scope:

→ **Guided MCP Setup**: We deploy the connector in your firm with scoped credentials, audit log wired into your stack, a custom workflow designed with your team, and training. Scope and pricing tailored to your firm.
  → [oktopeak.com/services/mcp-guided-setup/](https://oktopeak.com/services/mcp-guided-setup/?utm_source=github&utm_medium=readme&utm_campaign=filevine-mcp&utm_content=footer-svc-guided)

→ **Filevine Integration**: For custom reporting, project schema work, document and intake automation, and the production software layer around Filevine.
  → [oktopeak.com/services/filevine-integration/](https://oktopeak.com/services/filevine-integration/?utm_source=github&utm_medium=readme&utm_campaign=filevine-mcp&utm_content=footer-svc-filevine)

Want a polished overview of this connector with FAQ?
→ [oktopeak.com/filevine-mcp/](https://oktopeak.com/filevine-mcp/?utm_source=github&utm_medium=readme&utm_campaign=filevine-mcp&utm_content=footer-hub)

Want to talk first? → [Book a 30-min scoping call](https://calendly.com/office-oktopeak/30min?utm_source=github&utm_medium=readme&utm_campaign=filevine-mcp&utm_content=footer-call)

---

## Other connectors by Oktopeak

We ship the same kind of connector for other practice management platforms. Each has its own overview page on oktopeak.com:

- **[Clio MCP](https://oktopeak.com/clio-mcp/?utm_source=github&utm_medium=readme&utm_campaign=filevine-mcp&utm_content=xlink-clio)**: Clio practice management. Source: [github.com/oktopeak/clio-mcp](https://github.com/oktopeak/clio-mcp). npm: `@oktopeak/clio-mcp`
- **[MyCase MCP](https://oktopeak.com/mycase-mcp/?utm_source=github&utm_medium=readme&utm_campaign=filevine-mcp&utm_content=xlink-mycase)**: MyCase legal practice management. Source: [github.com/oktopeak/mycase-mcp](https://github.com/oktopeak/mycase-mcp). npm: `@oktopeak/mycase-mcp`
- **[Lawmatics MCP](https://oktopeak.com/lawmatics-mcp/?utm_source=github&utm_medium=readme&utm_campaign=filevine-mcp&utm_content=xlink-lawmatics)**: Lawmatics legal CRM and intake. Source: [github.com/oktopeak/lawmatics-mcp](https://github.com/oktopeak/lawmatics-mcp). npm: `@oktopeak/lawmatics-mcp`
- **[IntakeQ / PracticeQ MCP](https://github.com/oktopeak/IntakeQ)**: HIPAA-aware connector for IntakeQ/PracticeQ (healthcare). Audit logging on every PHI read/write. npm: `@oktopeak/intakeq-mcp`

Same architecture, same audit logging, same encryption at rest. All MIT licensed.

---

## Supporting this project

This connector is free, MIT licensed, and maintained by [Oktopeak](https://oktopeak.com). It always will be — we don't take donations. If it saved you time, the things that actually help:

- **Star this repo.** It is genuinely how other firms find it.
- **Tell another firm** running Filevine.
- **[Leave a review](https://clutch.co/profile/oktopeak)** if we helped you directly.
- Need it deployed, extended, or maintained for your firm? **[Commercial support](https://oktopeak.com/filevine-mcp/)** — that is what funds the free work.
- **Firm-wide deployment:** rolling Claude + this connector out to a whole firm (Claude Cowork, multi-user, security review)? See [Firm Deployment](https://oktopeak.com/services/firm-deployment/?utm_source=github&utm_medium=readme&utm_campaign=filevine-mcp&utm_content=firm-deployment).

## Who we are

**[Oktopeak](https://oktopeak.com/?utm_source=github&utm_medium=readme&utm_campaign=filevine-mcp&utm_content=who-we-are) — digital transformation for law firms and healthcare.**

We're a 7-person in-house product team building AI solutions for regulated industries: AI integrations, workflow automation, and custom software our clients own outright. We maintain five open-source MCP connectors — [Clio](https://github.com/oktopeak/clio-mcp), [MyCase](https://github.com/oktopeak/mycase-mcp), Filevine, [Lawmatics](https://github.com/oktopeak/lawmatics-mcp), and [IntakeQ](https://github.com/oktopeak/IntakeQ) — and deploy them inside real practices with scoped credentials, audit logs, and workflows built around how your team actually works.

- 🌐 [oktopeak.com](https://oktopeak.com/?utm_source=github&utm_medium=readme&utm_campaign=filevine-mcp&utm_content=who-we-are)
- 📅 [Book a 30-min call](https://calendly.com/office-oktopeak/30min?utm_source=github&utm_medium=readme&utm_campaign=filevine-mcp&utm_content=who-we-are-call)
- ✉️ office@oktopeak.com — security reports welcome
- 💼 [LinkedIn](https://www.linkedin.com/company/oktopeak-tech)
