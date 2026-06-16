#!/usr/bin/env node
// One-time OAuth2 bootstrap for Worksection — RUN THIS ON YOUR LOCAL MACHINE,
// not in a headless/remote environment (the redirect goes to localhost).
//
// It performs the authorization-code flow:
//   1. Prints the authorize URL — open it in your browser and approve.
//   2. Worksection redirects back to the local callback with ?code=...
//   3. The code is exchanged for tokens at the token endpoint.
//   4. Prints the refresh_token + account_url to store as env secrets.
//
// Required env: WS_CLIENT_ID, WS_CLIENT_SECRET
// Optional env:
//   WS_REDIRECT_URI  (default http://localhost:3333/callback)
//   WS_SCOPES        (optional, space-separated)
//   WS_TLS_KEY, WS_TLS_CERT  (paths — if set, serves HTTPS for an https redirect)
//
// NOTE: your registered redirect_uri must match WS_REDIRECT_URI exactly. If you
// registered https://localhost:3333/callback you must provide TLS cert/key
// (e.g. `openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem
// -days 365 -subj "/CN=localhost"`), or simply re-register an http redirect.

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import { URL } from "node:url";
import crypto from "node:crypto";

const AUTHORIZE_URL = "https://worksection.com/oauth2/authorize";
const TOKEN_URL = "https://worksection.com/oauth2/token";

const clientId = process.env.WS_CLIENT_ID;
const clientSecret = process.env.WS_CLIENT_SECRET;
const redirectUri = process.env.WS_REDIRECT_URI || "http://localhost:3333/callback";
const scopes = process.env.WS_SCOPES || "";

if (!clientId || !clientSecret) {
  console.error("Set WS_CLIENT_ID and WS_CLIENT_SECRET in the environment first.");
  process.exit(1);
}

const state = crypto.randomBytes(16).toString("hex");
const cbUrl = new URL(redirectUri);
const port = cbUrl.port || (cbUrl.protocol === "https:" ? 443 : 80);

const authUrl = new URL(AUTHORIZE_URL);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", redirectUri);
authUrl.searchParams.set("state", state);
if (scopes) authUrl.searchParams.set("scope", scopes);

async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

const handler = async (req, res) => {
  const reqUrl = new URL(req.url, redirectUri);
  if (reqUrl.pathname !== cbUrl.pathname) {
    res.writeHead(404).end("Not found");
    return;
  }
  const code = reqUrl.searchParams.get("code");
  const returnedState = reqUrl.searchParams.get("state");
  if (!code) {
    res.writeHead(400).end("Missing ?code");
    return;
  }
  if (returnedState !== state) {
    res.writeHead(400).end("State mismatch — possible CSRF. Aborting.");
    console.error("State mismatch. Aborting.");
    process.exit(1);
  }
  try {
    const tokens = await exchangeCode(code);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h2>Worksection connected. You can close this tab and return to the terminal.</h2>");
    console.log("\n✅ Success. Store these as environment secrets (NOT in git):\n");
    console.log(`WS_REFRESH_TOKEN=${tokens.refresh_token}`);
    if (tokens.account_url) console.log(`WS_ACCOUNT_URL=${tokens.account_url}`);
    console.log(`\n(access_token expires in ${tokens.expires_in}s and is auto-refreshed by the MCP server)\n`);
    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500).end(String(err.message));
    console.error(err.message);
    process.exit(1);
  }
};

let server;
if (process.env.WS_TLS_KEY && process.env.WS_TLS_CERT) {
  server = https.createServer(
    {
      key: fs.readFileSync(process.env.WS_TLS_KEY),
      cert: fs.readFileSync(process.env.WS_TLS_CERT),
    },
    handler
  );
} else {
  server = http.createServer(handler);
}

server.listen(port, () => {
  console.log("Open this URL in your browser and approve access:\n");
  console.log(authUrl.toString());
  console.log(`\nWaiting for the redirect on ${redirectUri} ...`);
});
