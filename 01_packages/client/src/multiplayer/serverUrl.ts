/**
 * The multiplayer socket's URL: same host as the page, path /ws (Vite proxies it to the server),
 * secure when the page is. See 01_docs/multiplayer.md#client.
 */
export function serverUrl(page: { readonly protocol: string; readonly host: string }): string {
  return `${page.protocol === 'https:' ? 'wss' : 'ws'}://${page.host}/ws`;
}
