# dsh-external-plugin-devkit

**CLI: `dshx`** — *dsh* + ***x**ternal*

> dshx is an **out-of-process** plugin devkit for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
> It is for Cursor / Claude Code / Codex / Grok (and humans) who need to ship **files**, not Creator Mode memory.

> dshx（dsh + xternal）是 DeepSeek Harness **进程外**的插件开发包。给任意外部 Agent（和人）写**可交付**插件，不走 Creator Mode。

This repository is **not** official `dsh`, **not** a Harness fork, and **not** a plugin pack. Official `dsh doctor` does not exist; `dshx doctor` is this workshop's command.

## One-liner for any external agent

Paste this into Cursor, Claude Code, Codex, Grok, or any other agent that can run shell commands. It does not need a skill yet.

**English**

> Install https://github.com/aa2246740/dsh-external-plugin-devkit into my local DeepSeek Harness: place it at `<harness>/tools/dshx`, add the root `dshx` script, install `skill/dshx` into every Agent skill home that already exists on this machine, write `~/.config/dshx/harness`, then run `dshx which` and `dshx doctor`. If several Harness checkouts exist, stop and ask. Do not start or kill `dsh`. Do not hardcode another machine’s path.

**中文**

> 把 https://github.com/aa2246740/dsh-external-plugin-devkit 装进我本机的 DeepSeek Harness：放到 `<harness>/tools/dshx`，在 Harness 根目录加上 `dshx` 脚本，把仓库里的 `skill/dshx` 装到我机器上已有的 Agent skill 目录，写入 `~/.config/dshx/harness`，然后跑 `dshx which` 和 `dshx doctor`。多个 Harness checkout 就停下来问，不要猜。不要启动或杀掉 `dsh`。不要写死别人的机器路径。

Canonical copy: `dshx setup --print-prompt`.

After setup, daily work is:

> Use dshx for this DSH plugin: kb first, edit `my-plugins/<name>`, then check / verify, and restart only from outside. Recopy `file:` packages with `dshx ship`; do not add-only.

## Install

`dshx` must live **inside** a DeepSeek Harness checkout.

```sh
cd /path/to/deepseek-harness
git clone https://github.com/aa2246740/dsh-external-plugin-devkit.git tools/dshx
node --import tsx/esm tools/dshx/src/cli.ts setup --harness "$PWD"
# preview: node --import tsx/esm tools/dshx/src/cli.ts setup --dry-run --harness "$PWD"
```

`setup` adds the root scripts, links the generic skill into existing agent homes (Codex / Claude / Grok / Cursor / `.agents` if present), and remembers the checkout in `~/.config/dshx/harness`. Later you can run the CLI from any cwd via `$DSHX_HARNESS` or that config file.

Manual scripts (if you skip `setup`):

```json
{
  "scripts": {
    "dshx": "node --import tsx/esm tools/dshx/src/cli.ts",
    "dshx:test": "node --import tsx/esm --test tools/dshx/tests/*.spec.ts"
  }
}
```

The generic skill lives at [`skill/dshx`](skill/dshx). It is not Grok-specific. `setup` also links [`.cursor/rules/dshx.mdc`](.cursor/rules/dshx.mdc) to the **Harness root** `.cursor/rules/` (Cursor does not read rules under `tools/dshx/`).

Node: `^22.19.0 || >=24.0.0`. Scratch plugins go in `<harness>/my-plugins/`.

## Use

```sh
pnpm dshx kb
pnpm dshx kb cat start-here
pnpm dshx kb cat maps/symptoms
pnpm dshx kb search retry
pnpm dshx kb cat contracts/llm-retry

pnpm dshx init demo
pnpm dshx init panel --kind client
pnpm dshx check demo
pnpm dshx verify demo          # dump-config exit 0 is not a boot proof
pnpm dshx ship /abs/path/to/pkg
pnpm dshx start web demo
pnpm dshx restart
pnpm dshx doctor
pnpm dshx which
```

`kb search` only finds an id. You **must** `kb cat` the hit. Search snippets are not the contract.

`dsh plugin add file:` printing **Already up to date** does not recopy `lib/`. Use `dshx ship`.

State lives in the Harness root `.dshx/` (gitignored). Do not commit overlays, logs, or `.env`.

A function-plugin sketch is in [`examples/hello`](examples/hello). Prefer `dshx init` so `cordis.yml` stays portable (relative `name`).

## Agent standing orders

Read [`AGENTS.md`](AGENTS.md). The in-repo skill is [`skill/dshx/SKILL.md`](skill/dshx/SKILL.md).

- Function plugins: named exports `name` / `inject` / `apply` (no default export).
- Never `kill` the `dsh` host from inside a Harness session.
- Same-session orphan `tool_call` after a CLOSED `turn/end reason:error` cannot be healed in-session.
- `verify` does not attest the live tools registry.

## Knowledge bundle

[`knowledge/`](knowledge/) is an [OKF v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) digest of official contracts. Official Harness docs remain authoritative when they disagree.

## 中文

把本仓库放到 `<harness>/tools/dshx`，把上面的一句话交给外部 Agent，或自己跑 `dshx setup`。先 `kb` 再写插件，用 `check` / `verify` 证明，`file:` 包用 `ship` 重拷，用 `restart` 在进程外重启。不要在 DSH 会话里杀宿主。不要把 `dump-config` 退出 0 当成 boot。

## License

MIT for **this** repository (the `dshx` CLI, knowledge bundle, skill, and tests). DeepSeek Harness is a separate product with its own license. This project is unofficial and not affiliated with DeepSeek.
