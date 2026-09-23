# Changelog

## 0.7.9 - 2026-09-23

- Pin the desk Harness target to official `dsh-v0.1.7-rc.1` (package `0.1.7-rc.1`). `dshx update plan` without `--target` stays on that tag and does not follow a later alpha.
- Declare `@deepseek-ai/dsh` peer `>=0.1.7-rc.1 <0.1.8`, and write the same range into generated client scaffolds. The range accepts `0.1.7-rc.1` and rejects `0.1.7` alphas. `^0.1.5-rc.3` does not accept rc.1.
- Align the client-bundle inline allowlist with rc.1, including `dsh-agent-preset-registry/display`, `dsh-plugin-manager/registry`, and `dsh-native-command/types`.
- Deliver Creator+ recovery on `agent/created`. `agent/session-start` is gone.

## 0.7.8 - 2026-09-21

- Add user-confirmed Creator+ takeover with atomic, snapshot-bound claims, private single-use grants, durable revocations and ownership checks inside the activation lock.
- Add `dshx_request_takeover` to the bundled bridge; show the current owner and wait for the old session, children, jobs and terminals to stop before transferring.
- Keep fences effective across preset generations and Host module reloads. Expired leases alone never authorize a second writer.
- Add read-only `creator inspect <id> --json`; keep `creator takeover` private to the fixed bridge and preserve the managed-shell boundary.
- Pair with standalone Creator+ 0.3.8. Automated native-runtime and CLI acceptance is separate from human UI click-through, which remains unverified.
