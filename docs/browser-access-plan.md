# Browser access and Creator+ robustness plan

Scope: DSHX and the active standalone Creator Mode+ package. No Harness core,
App-shell, provider-account, or browser-profile changes. Keep one live Web Host
per real DSH_HOME. An authenticated HTTP response is not browser acceptance.

1. Harden the shared authentication transport: origin-bound redirects/resources,
   bounded waits, single concurrent token exchange, private errors, and no cookie
   forwarding across origins. Keep legacy unauthenticated Web support.
2. Add external `browser status`, `browser bind`, and `browser open` operations.
   Discover and bind Home/root/PID/process-start/port, recheck identity after HTTP
   proof, retain only a private owner-only expiring handoff, and invalidate stale
   boots. Accept official startup input privately; never scan App credentials.
3. Refresh the handoff during Creator watch/claim using the existing official
   Connection API. Keep the eight fixed model tools and their allowlist; do not
   expose arbitrary browser commands, paths, ports, or process control.
4. Define a browser-neutral adapter protocol over stdin. An adapter opens its own
   authorized browser context, exchanges the launch URL there, and returns a
   redacted readiness receipt. No browser/tool fallback is implicit. An unavailable
   native browser adapter stays a separate blocker from missing Host authentication.
5. Align the bundled bridge's eighth tool with the standalone bridge and test
   every tool argv. Preserve preset stamps and cross-generation lifecycle rules.
6. Run transport/identity/concurrency/argv/package gates and real browser tests
   using Codex's pinned headless runtime against a disposable authenticated fixture.
   Current-Host live acceptance is separate; never restart the user's Host to claim it.

Launcher matrix:
- DSHX-owned Host: use only that proven process's own official startup output.
- Creator+ in official CLI or an App: publish via Connection during watch/claim.
- Official CLI without a bridge: one private bind from its official startup URL.
- Unknown existing Host without a credential source: report WEB_AUTH_REQUIRED.
- App-specific startup handoff: supported through the same external bind protocol;
  implementing the user's shell adapter remains outside this two-repository change.

## Acceptance evidence

Validated against DSH 0.1.2 RC1:

- DSHX: 211 tests passed, source-only TypeScript check passed, knowledge lint passed.
- Creator+: 45 checks passed, compatibility and isolated install/managed-upgrade
  verification passed. Shipped Standard remained unchanged and composition stamps
  remained stable. Both npm package dry-runs included the new runtime helpers.
- On an existing App-launched Host, the shipped pinned headless adapter completed
  two independently authenticated browser contexts. The Host PID did not change.
- The active legacy-named preset already used the standalone Creator+ module.
  Managed asset refresh preserved composition bytes, inode and modification time.
- Preset-scoped HMR replaced the loaded module on the same Host and verified all
  six declared runtime artifacts. The existing session exposed all eight tools;
  dshx_status succeeded through the official tool execution pipeline and reported
  the private-browser-handoff capability. Temporary verification resources were
  disposed and their exact configuration rows removed.

Browser access and the existing-session status/Connection path passed. These
checks do not certify arbitrary interactive browser adapters. The user separately
confirmed the original screenshot-paste/attachment-drop workflow was fixed.
