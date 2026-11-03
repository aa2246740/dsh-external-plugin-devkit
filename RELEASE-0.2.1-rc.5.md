# Release notes — dshx 0.9.7 (Harness 0.2.1-rc.5)

Built and tested against DeepSeek Harness `0.2.1-rc.5` (`dsh-v0.2.1-rc.5`, commit `b830ec950faba0a46dda564be3e2d854afed94f1`).

`dshx` (`dsh-external-plugin-devkit`) is an external plugin workbench and CLI — **not** a Host feature plugin. Do **not** install this repository with `dsh plugin add`.

- Run the CLI directly via `npx --yes dsh-external-plugin-devkit@0.9.7 --help`, or clone this repository into `<harness>/tools/dshx` and run `node --import tsx/esm tools/dshx/src/cli.ts setup`.
- To install or upgrade the optional Creator Mode+ user preset, run `npm --prefix tools/dshx run install:creator-plus -- --upgrade`.

