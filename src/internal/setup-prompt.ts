export const SETUP_PROMPT_ZH = [
  '把 https://github.com/aa2246740/dsh-external-plugin-devkit 装进我本机的 DeepSeek Harness：放到 <harness>/tools/dshx，在 Harness 根目录加上 dshx 脚本，把仓库里的 skill/dshx 装到我机器上已有的 Agent skill 目录，写入 ~/.config/dshx/harness，然后跑 dshx which 和 dshx doctor。',
  '多个 Harness checkout 就停下来问，不要猜。不要启动或杀掉 dsh。不要写死别人的机器路径。',
].join('')

export const SETUP_PROMPT_EN = [
  'Install https://github.com/aa2246740/dsh-external-plugin-devkit into my local DeepSeek Harness: place it at <harness>/tools/dshx, add the root dshx script, install skill/dshx into every Agent skill home that already exists on this machine, write ~/.config/dshx/harness, then run dshx which and dshx doctor.',
  ' If several Harness checkouts exist, stop and ask. Do not start or kill dsh. Do not hardcode another machine’s path.',
].join('')

export const DAILY_PROMPT_ZH = '用 dshx 做这个 DSH 插件：先读 contracts/live-activation，把改动归入 patch / manifest / preset / client / new-client / server / artifact 之一，再 check、按需 verify-boot / sync-artifact，并只执行该分支要求的 reload、new session 或 restart。不要把 artifact sync 当 live activation。'

export const DAILY_PROMPT_EN = 'Use dshx for this DSH plugin: read contracts/live-activation, classify the change as patch / manifest / preset / client / new-client / server / artifact, then check and use verify-boot or sync-artifact only when needed. Perform only the reload, new session, or restart required by that branch; artifact sync is not live activation.'

export const DSHX_CLONE_URL = 'https://github.com/aa2246740/dsh-external-plugin-devkit.git'

export const HARNESS_SCRIPTS = {
  dshx: 'node --import tsx/esm tools/dshx/src/cli.ts',
  'dshx:test': 'node --import tsx/esm --test tools/dshx/tests/*.spec.ts',
} as const
