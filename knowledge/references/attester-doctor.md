---
type: Reference
title: Attester for dshx doctor
description: leftover-bundle 与 duplicate-id 为硬失败。
tags: [attester]
aliases: ["attester doctor"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
---

# Verdict

失败：任意 finding `level=error`（含 `leftover-bundle`、`duplicate-id`、`node`、`dump-config`）。
`orphan-tool-call` 为 warn：profile 仍可能 boot，但不要续那个会话。
