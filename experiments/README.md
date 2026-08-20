# dshx agent experiments

Observer-only. Subject agents should not be pointed here.

```sh
pnpm dshx experiment begin r1-retry-ux --rubric retry-ux
# launch a clean-context agent
pnpm dshx experiment score r1-retry-ux --rubric retry-ux
pnpm dshx experiment end
```

Or set `DSHX_EXPERIMENT=<id>` in the subject shell so parallel runs do not mix traces.

Rubrics live next to this file. `kb search` snippets are not a pass; `kb cat` of the contract is.
`mixed-ux` uses `catGroups` so the agent must cat **both** the retry side and the session-scar side.

## Round results (2026-08-17)

| id | rubric | score | note |
|---|---|---|---|
| r1-retry-ux | retry-ux | 4/4 | search then cat llm-retry; did not touch Harness core |
| r1-boot-proof | boot-proof | 4/4 | init + check + legacy verify alias; found logs-after-stop hole |
| r1-session-scar | session-scar | 5/5 | session list + official vs community; `kb cat community` missed |
| r2-dump-trap | dump-trap | 4/4 | dump ≠ boot; reproduced relative-name Loader miss |
| r2-creator-ship | creator-ship | 4/4 | cordis_define is memory; ship via files |
| r2-logs-after-verify | logs-after-verify | 4/4 | `dshx logs` after idle showed marker; `logs --help` was still wrong |
| r3-mixed-ux | mixed-ux | 5/5 | split timeout-stop vs Continue 400; did not merge into one plugin bug |
| r3-host-suicide | host-suicide | 4/4 | kill-from-chat is suicide; recover host outside, new session |
| r3-raw-patch | raw-patch | 4/4 | reproduced relative name → `$DSH_HOME/profiles/web/`; legacy verify alias worked |
| r4-port-busy | port-busy | 5/5 | used the new `--port 3091` hint; left unsupervised :3080 alone |
| r4-leftover-bundle | leftover-bundle | 5/5 | doctor + hand-delete `dsh.profile.bundles`; dump still not boot |
| r4-tool-boot | tool-boot | 4/4 | `init --kind tool` + legacy verify alias; noted live tools registry is not attested |

| r5-check-fail | check-fail | 5/5 | default-export + absolute path failed check; `check fail` search was 0 hits (fixed) |
| r5-headless | headless-boot | 5/5 | task required; legacy verify skipped :3080; last-host used to claim :3080 (fixed) |
| r5-already-supervising | already-supervising | 5/5 | second start → stop/restart; restart hid the old pid (fixed) |
| r5-verify-keep | verify-keep | 5/5 | legacy `verify --keep --port 3091`; left :3080 alone |

| r6-init-force | init-force | 5/5 | `--force` search hid the init overwrite page (now both surface) |
| r6-overlay | overlay-gen | 5/5 | relative git name vs generated absolute overlay |
| r6-doctor | doctor-workshop | 5/5 | not official; clean leftover/dup/orphan were silent; :3080 was only INFO |
| r6-session | session-inspect | 5/5 | four clean logs; no in-session heal |

20 / 20 clean-context runs passed their rubrics. Fixes from reports landed in the CLI and the symptom index, not in the subject prompts.
