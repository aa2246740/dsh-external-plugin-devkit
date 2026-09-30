# dsh-external-plugin-devkit 0.9.4

Fix the npm CLI entry point: `npx dsh-external-plugin-devkit@0.9.3 --help` failed with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` because it launched TypeScript directly under `node_modules`. Version 0.9.4 uses a JavaScript launcher and the existing `tsx` runtime before loading the CLI.

```sh
npx --yes dsh-external-plugin-devkit@0.9.4 --version
npx --yes dsh-external-plugin-devkit@0.9.4 --help
```

DSHX is a development CLI, not a Host feature plugin. Do not install it through `dsh plugin add`. The target remains official DeepSeek Harness `0.2.0-rc.2`; Creator+ bridge operations are unchanged.
