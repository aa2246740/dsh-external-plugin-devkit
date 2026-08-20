# Symptom map

| Symptom | First contract | First playbook |
|---|---|---|
| `dshx check` failed | [plugin-layout](../contracts/plugin-layout.md) | [check-failed](../playbooks/check-failed.md) |
| plugin not in `ctx.plugin.list()` | [activation](../contracts/activation.md) | [activation-plan](../playbooks/activation-plan.md) |
| `Cannot find module` | [plugin-layout](../contracts/plugin-layout.md) | [cordis-name](../playbooks/cordis-name.md) |
| client plugin silent | [activation](../contracts/activation.md) | [client-bundle](../playbooks/client-bundle.md) |
| `/name` does nothing | [ctx-commands](../contracts/extension-points.md) | [ctx-commands](../playbooks/ctx-commands.md) |
| `$name` does nothing | [codex-skill](../contracts/codex-skill.md) | [codex-skill](../playbooks/codex-skill.md) |
| `/name` is a slash command, not a skill | [ctx-commands](../contracts/extension-points.md) | [ctx-commands](../playbooks/ctx-commands.md) |
| `$skill` vs `/skill` vs Codex | [codex-skill](../contracts/codex-skill.md) | [codex-skill](../playbooks/codex-skill.md) |
| slash command did not become a model turn | [ctx-commands](../contracts/extension-points.md) | [ctx-commands](../playbooks/ctx-commands.md) |
| skill not injected | [ctx-skills](../contracts/ctx-skills.md) | [ctx-skills](../playbooks/ctx-skills.md) |
| Creator mode / `cordis` preset | [cordis](../contracts/cordis.md) | [cordis-define](../playbooks/cordis-define.md) |
| `cordis_define` vanished after restart | [cordis](../contracts/cordis.md) | [cordis-define](../playbooks/cordis-define.md) |
| i18n key missing | [i18n](../contracts/i18n.md) | [ctx-i18n](../playbooks/ctx-i18n.md) |
| `ctx.ui` / `ctx.session` / `ctx.storage` missing | [extension-points](../contracts/extension-points.md) | matching `ctx-*` playbook |
