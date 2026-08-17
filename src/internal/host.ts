import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HOST_MANIFEST_RELATIVE } from "./paths.js";
import type { HostManifest, HostPlugin } from "./types.js";

export function loadHostManifest(repoRoot: string): HostManifest {
  const path = join(repoRoot, HOST_MANIFEST_RELATIVE);
  if (!existsSync(path)) {
    throw new Error(`missing ${HOST_MANIFEST_RELATIVE}`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as HostManifest;
  if (parsed.schema !== "dsh-host-manifest/v1") {
    throw new Error(`unsupported host manifest schema: ${parsed.schema}`);
  }
  return parsed;
}

export function findHostPlugin(manifest: HostManifest, pluginId: string): HostPlugin {
  const plugin = manifest.plugins.find((item) => item.id === pluginId);
  if (!plugin) {
    throw new Error(`plugin not found in host manifest: ${pluginId}`);
  }
  return plugin;
}

export function pluginEntryPath(repoRoot: string, plugin: HostPlugin): string {
  return join(repoRoot, plugin.entry);
}
