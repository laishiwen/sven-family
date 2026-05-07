/**
 * Electron bridge helper — works in both web and desktop contexts.
 */

export const isDesktop = !!window.__electron__
export const electron = window.__electron__

/** Open native file picker (desktop only). Fallback: trigger <input type=file>. */
export async function pickFile(options?: {
  filters?: { name: string; extensions: string[] }[]
  fallbackAccept?: string
}): Promise<File | string | null> {
  if (electron) {
    const filePath = await electron.openFile({ filters: options?.filters })
    return filePath
  }
  // Web fallback — return a File object via hidden input
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (options?.fallbackAccept) input.accept = options.fallbackAccept
    input.onchange = () => resolve(input.files?.[0] || null)
    input.click()
  })
}

/** Open native directory picker */
export async function pickDirectory(): Promise<string | null> {
  if (electron) return electron.openDirectory()
  return null
}

/** Get sidecar status (desktop only) */
export async function getSidecarStatus() {
  if (!electron) return null
  return electron.getSidecarStatus()
}
