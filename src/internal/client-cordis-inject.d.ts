/** Result of statically comparing direct context reads with Cordis inject. */
export interface ClientCordisInjectInspection {
  path: string
  declared: string[]
  accessed: string[]
  missing: string[]
  staticInject: boolean
}

/** Compare direct Cordis service reads with the client entry's exported inject. */
export function inspectClientCordisInject(path: string): ClientCordisInjectInspection

/** Resolve the source entry declared by the dshx client build adapter. */
export function resolveClientSource(pluginDir: string): { path: string, declared: boolean } | undefined

/** Fail a client build before emitting a bundle with undeclared service reads. */
export function assertClientCordisInject(packageRoot: string, clientEntry: string): void
