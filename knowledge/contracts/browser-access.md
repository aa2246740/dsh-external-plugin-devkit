---
type: Runtime Contract
title: Private browser authentication handoff
description: Agent browser tests attach to the existing Host through private startup authentication; HTTP proof and browser acceptance are distinct.
tags: [browser, authentication, creator, host]
aliases: [WebUI 401, browser login, 浏览器认证, browser status, browser open]
status: candidate
---

# Browser access

DSH browser authentication is a local launch-token exchange, independent of model
provider/account login. App and browser contexts may authenticate concurrently
against one Host. A new browser context needs its own cookie; copying the clean
address bar URL does not transfer authentication.

Use `dshx browser status` first. It discovers the single real Home/root/PID/start/
port identity and proves the official boot page. It does not open a browser or
claim feature acceptance. `WEB_AUTH_REQUIRED`, `WEB_HOST_CHANGED`,
`WEB_HOST_UNKNOWN`, `WEB_HOST_COLLISION`, `WEB_HANDOFF_EXPIRED`, and
`BROWSER_ADAPTER_REQUIRED` identify different recovery paths. None authorizes a
Host restart, second same-Home Host, authentication bypass, or browser-tool fallback.

## Credential sources

1. Explicit `DSHX_WEB_STARTUP_URL`, supplied privately by an external launcher.
2. DSHX's own `.dshx-browser/access.json` under the canonical DSH_HOME, created by
   `browser bind` or Creator watch/claim. Directory 0700, file 0600, owner-only,
   no symlink target, atomic replacement, eight-hour expiry, exact live-boot binding.
3. A proven DSHX-spawned Host's own official startup output. Adopted App/CLI logs
   and other applications' credential stores are not searched.

Creator watch/claim obtains the startup URL through the existing official
Connection API and refreshes the handoff automatically. Failure to refresh is
reported separately and does not disable Guardian or discard claims. The eight
model tools and fixed argv boundary remain intact. Startup secrets are removed
from assembled child output before tool results or delivery records are returned.

For plain official `dsh web` without a Creator bridge, bind its official startup
URL once through private launcher environment input. No credentials belong in
chat, command arguments, ordinary CLI output, or a committed file. Without a
source of authentication an already-running Host remains `WEB_AUTH_REQUIRED`;
port discovery alone cannot authenticate it. App shells can supply exactly the
same external bind input; no shell is a required dependency.

A stale/expired saved binding is rejected explicitly. Refresh via Creator
watch/claim or an explicit private bind; old cookies are not copied from another
browser. This cache does not revoke an already-issued official browser cookie.

## Browser adapter protocol v1

`dshx browser open` is external-supervisor work. Select an explicitly trusted
absolute executable with `DSHX_BROWSER_ADAPTER`; DSHX invokes it directly without
a shell or model-provided argv. The adapter receives one bounded JSON object on
stdin: `{version:1, host, origin, startupUrl, timeoutMs}`. The URL is absent from
argv and returned reports. The adapter must use the browser runtime permitted by
that Agent, navigate normally through the startup URL, and verify the actual UI.

On success the adapter emits only `{status:"BROWSER_AUTHENTICATED",origin}` and
exits zero. DSHX whitelists these fields and suppresses raw stderr/extra output.
Timeout, nonzero exit, missing adapter, and invalid receipt are distinct failures.
The adapter owns browser context lifetime: an interactive adapter can hand its
page to the owning Agent, while a smoke adapter closes its test contexts. A
receipt proves an authenticated browser run, not a still-open tab or feature QA.

Codex's shipped `examples/browser/codex-smoke.mjs` uses only the global pinned
Playwright runtime. It verifies two independent contexts can load the real WebUI
and then closes them. Set its absolute path as DSHX_BROWSER_ADAPTER to run it.
Missing/mismatched pins fail; it never installs browsers or uses system Chrome.
Other Agent/browser integrations implement the same stdin protocol with their own
permitted tooling. Native CUA integrations without a private handoff interface
remain unsupported; this CLI does not route around their restrictions.

## Acceptance

Keep `HTTP_AUTHENTICATED`, `BROWSER_AUTHENTICATED`, and feature/visual acceptance
separate. A browser's local-address policy (`ERR_BLOCKED_BY_CLIENT`), unsupported
private handoff, or missing runtime is a browser-adapter failure, even when HTTP
authentication succeeds. Tests cover concurrency, cancelled waiters, cross-origin
redirects/resources, owner-only storage, stale identities, expired bindings,
exact tool argv, and private adapter input/output.
