// Thin Worksection OAuth2 API client.
//
// OAuth2 endpoints (confirmed against Worksection docs):
//   - Token:     https://worksection.com/oauth2/token
//   - Authorize: https://worksection.com/oauth2/authorize
// The token response includes `access_token`, `refresh_token`, `expires_in`
// (24h) and `account_url` — so the account domain does not need to be
// configured separately; it comes back with the token.
//
// API requests go to `${account_url}/api/oauth2?action=...` with the access
// token passed as a Bearer header (also accepted as an `access_token` query
// param). Action names follow the Worksection API reference
// (https://worksection.com/en/faq/api-start.html). If your account uses
// different action/param names, adjust callApi() callers below.

const TOKEN_URL = "https://worksection.com/oauth2/token";
export const AUTHORIZE_URL = "https://worksection.com/oauth2/authorize";

export class WorksectionClient {
  constructor({ clientId, clientSecret, refreshToken, accountUrl }) {
    if (!clientId || !clientSecret) {
      throw new Error("WS_CLIENT_ID and WS_CLIENT_SECRET are required.");
    }
    if (!refreshToken) {
      throw new Error(
        "WS_REFRESH_TOKEN is required. Run `npm run auth` once locally to obtain it."
      );
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.accountUrl = accountUrl ? accountUrl.replace(/\/+$/, "") : null;
    this.accessToken = null;
    this.expiresAt = 0; // epoch ms
  }

  async ensureToken() {
    // Refresh ~60s before expiry.
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) {
      return this.accessToken;
    }
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Token refresh failed (${res.status}): ${text}`);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Token endpoint returned non-JSON: ${text}`);
    }
    if (!data.access_token) {
      throw new Error(`Token response missing access_token: ${text}`);
    }
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    // Worksection rotates refresh tokens — keep the freshest one for this run.
    if (data.refresh_token) this.refreshToken = data.refresh_token;
    if (data.account_url) this.accountUrl = data.account_url.replace(/\/+$/, "");
    if (!this.accountUrl) {
      throw new Error(
        "No account_url available. Set WS_ACCOUNT_URL or ensure the token response includes it."
      );
    }
    return this.accessToken;
  }

  // Generic Worksection API call. `params` become query parameters alongside
  // `action`. Returns the parsed JSON `data` payload.
  async callApi(action, params = {}) {
    const token = await this.ensureToken();
    const url = new URL(`${this.accountUrl}/api/oauth2`);
    url.searchParams.set("action", action);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Worksection ${action} returned non-JSON: ${text}`);
    }
    // Worksection returns { status: "ok", data: ... } or { status: "error", message }.
    if (json.status && json.status !== "ok") {
      throw new Error(`Worksection ${action} error: ${json.message || text}`);
    }
    return json.data !== undefined ? json.data : json;
  }

  listProjects() {
    return this.callApi("get_projects");
  }

  listUsers() {
    return this.callApi("get_users");
  }

  createProject({ title }) {
    return this.callApi("post_project", { title });
  }

  createTask({ idProject, title, text, emailUserTo, priority, dateEnd }) {
    return this.callApi("post_task", {
      id_project: idProject,
      title,
      text,
      email_user_to: emailUserTo,
      priority,
      dateend: dateEnd,
    });
  }
}
