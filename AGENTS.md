# dshx — standing orders for agents

You are developing DeepSeek Harness plugins **outside** Creator Mode.

## You have a knowledge bundle

Path: `tools/dshx/knowledge/` (OKF v0.2). Official docs were digested and shattered; do not paste whole `docs/` files into context.

Explore it yourself. Do not guess contracts from memory.

```sh
pnpm dshx kb
pnpm dshx kb cat start-here
pnpm dshx kb cat maps/symptoms
pnpm dshx kb ls contracts
pnpm dshx kb search <topic>
pnpm dshx kb cat <id-from-search>
```

`kb search` is only for finding an id. You **must** `kb cat` the hit. Search snippets are not the contract.

Open `knowledge/index.md`, then follow links. When a concept lists `resource` or `sources`, read those official files next. Skills and stale READMEs are not the runtime contract.

## Use this CLI for restart and proof

```sh
pnpm dshx check <name>
pnpm dshx verify <name>     # dump-config exit 0 is not enough
pnpm dshx start web <name>
pnpm dshx stop | restart
pnpm dshx doctor
pnpm dshx session list
```

Never `kill` the `dsh` host from inside a Harness session. That bricks the session as permanently running.

## Deliverables are files

Write to `my-plugins/<name>/`. Keep `cordis.yml` portable (relative `name`). `dshx` generates the absolute `--patch` file under `.dshx/overlays/`. Do not commit `.dshx/`, `.env`, or secrets.

`cordis_define` / `cordis_run` are process memory. They are not a shippable plugin.

## Authority

See `knowledge/contracts/authority.md`. Prefer `defineTool` names, `vendor/cordis` types, and `profile.ts` over tutorials when they disagree.

Model timeout / "stopped after two retries" is official `dsh-llm-retry` (`kb cat contracts/llm-retry`), not a reason to patch Harness core.
