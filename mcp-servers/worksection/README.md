# Worksection MCP server

An MCP server that talks to the [Worksection](https://worksection.com) API over
OAuth2. Lets the assistant list projects/users and create projects/tasks.

## Tools
- `worksection_list_projects`
- `worksection_list_users`
- `worksection_create_project` — `{ title }`
- `worksection_create_task` — `{ id_project, title, text?, email_user_to?, priority?, dateend? }`

## Credentials (env vars — never commit these)
| Var | Required | Notes |
|-----|----------|-------|
| `WS_CLIENT_ID` | yes | OAuth2 app client id |
| `WS_CLIENT_SECRET` | yes | OAuth2 app client secret |
| `WS_REFRESH_TOKEN` | yes | Obtained once via the auth bootstrap (below) |
| `WS_ACCOUNT_URL` | optional | e.g. `https://youraccount.worksection.com`; auto-discovered from the token response if omitted |

Store these as **environment secrets** of your Claude Code environment, not in
git. `.mcp.json` references them as `${WS_...}`.

## One-time authorization (run locally, not in a remote container)
The OAuth flow redirects to `localhost`, so do this on your own machine:

```bash
cd mcp-servers/worksection
npm install
WS_CLIENT_ID=... WS_CLIENT_SECRET=... \
WS_REDIRECT_URI=http://localhost:3333/callback \
npm run auth
```

1. Open the printed authorize URL and approve access.
2. The helper exchanges the code and prints `WS_REFRESH_TOKEN` (and
   `WS_ACCOUNT_URL`). Save them as environment secrets.

> If your OAuth app is registered with an **https** redirect
> (`https://localhost:3333/callback`), either re-register it as `http`, or
> provide a self-signed cert via `WS_TLS_KEY`/`WS_TLS_CERT`:
> ```bash
> openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem \
>   -days 365 -subj "/CN=localhost"
> WS_TLS_KEY=key.pem WS_TLS_CERT=cert.pem WS_REDIRECT_URI=https://localhost:3333/callback npm run auth
> ```

## Notes
- Access tokens last ~24h and are refreshed automatically by the server.
- API action/parameter names follow the Worksection API reference; if your
  account differs, adjust the callers in `worksection.js`.
