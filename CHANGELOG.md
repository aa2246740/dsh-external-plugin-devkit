# Changelog

## 0.7.8 - 2026-09-21

- Add user-confirmed Creator+ takeover with atomic, snapshot-bound claims, private single-use grants, durable revocations and ownership checks inside the activation lock.
- Add `dshx_request_takeover` to the bundled bridge; show the current owner and wait for the old session, children, jobs and terminals to stop before transferring.
- Keep fences effective across preset generations and Host module reloads. Expired leases alone never authorize a second writer.
- Add read-only `creator inspect <id> --json`; keep `creator takeover` private to the fixed bridge and preserve the managed-shell boundary.
- Pair with standalone Creator+ 0.3.8. Automated native-runtime and CLI acceptance is separate from human UI click-through, which remains unverified.
