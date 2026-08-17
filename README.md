# dsh-external-plugin-devkit

**CLI: `dshx`** — *dsh* + ***x**ternal*

> dshx is an **out-of-process** plugin devkit for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
> It is for Cursor / Grok / Codex (and humans) who need to ship **files**, not Creator Mode memory.

> dshx（dsh + xternal）是 DeepSeek Harness **进程外**的插件开发包。给 Cursor / Grok / Codex 这类外部 Agent（和人）写**可交付**插件，不走 Creator Mode.

This repository is **not** official `dsh`, **not** a Harness fork, and **not** a plugin pack. Official `dsh doctor` does not exist; `dshx doctor` is this workshop's command.

## Install

`dshx` must live **inside** a DeepSeek Harness checkout. It looks for `apps/cli/src/bin.ts` and `tools/dshx/src/cli.ts`.

```sh
cd /path/to/deepseek-harness
git clone https://github.com/aa2246740/dsh-external-plugin-devkit.git tools/dshx
# or: git submodule add https://github.com/aa2246740/dsh-external-plugin-devkit.git tools/dshx
```

Add a root script (official Harness already has `tsx` and `js-yaml`):

```json
{
  "scripts": {
    "dshx": "node --import tsx/esm tools/dshx/src/cli.ts",
    "dshx:test": "node --import tsx/esm --test tools/dshx/tests/*.spec.ts"
  }
}
```

If you use Cursor, copy `.cursor/rules/dshx.mdc` to the Harness checkout.

Node: `^22.19.0 || >=24.0.0`. Scratch plugins go in `<harness>/my-plugins/`.

## Use

```sh
pnpm dshx kb
pnpm dshx kb cat start-here
pnpm dshx kb cat maps/symptoms
pnpm dshx kb search retry
pnpm dshx kb cat contracts/llm-retry

pnpm dshx init demo
pnpm dshx check demo
pnpm dshx verify demo          # dump-config exit 0 is not a boot proof
pnpm dshx start web demo
pnpm dshx restart
pnpm dshx doctor
```

`kb search` only finds an id. You **must** `kb cat` the hit. Search snippets are not the contract.

State lives in the Harness root `.dshx/` (gitignored). Do not commit overlays, logs, or `.env`.

A function-plugin sketch is in [`examples/hello`](examples/hello). Prefer `dshx init` so `cordis.yml` stays portable (relative `name`).

## Agent standing orders

Read [`AGENTS.md`](AGENTS.md).

- Function plugins: named exports `name` / `inject` / `apply` (no default export).
- Never `kill` the `dsh` host from inside a Harness session.
- Same-session orphan `tool_call` after a CLOSED `turn/end reason:error` cannot be healed in-session.
- `verify` does not attest the live tools registry.

## Knowledge bundle

[`knowledge/`](knowledge/) is an [OKF v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) digest of official contracts. Official Harness docs remain authoritative when they disagree.

## 中文

把本仓库放到 `<harness>/tools/dshx`，在 Harness 根目录加 `pnpm dshx` 脚本。先 `kb` 再写插件，用 `check` / `verify` 证明，用 `restart` 在进程外重启。不要在 DSH 会话里杀宿主。不要把 `dump-config` 退出 0 当成 boot。

## License

MIT for **this** repository (the `dshx` CLI, knowledge bundle, and tests). DeepSeek Harness is a separate product with its own license. This project is unofficial and not affiliated with DeepSeek.
