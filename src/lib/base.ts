// Prefix a root-relative path with the configured base (e.g. /LimitDefinitionStudio/).
// This makes the site work when deployed under a GitHub Pages subpath.
const BASE: string = ((import.meta.env?.BASE_URL as string) ?? '/').replace(/\/$/, '');

export function B(path: string): string {
  if (!path) return BASE || '/';
  if (path.startsWith('http') || path.startsWith('mailto:') || path.startsWith('#')) {
    return path;
  }
  if (path.startsWith('/')) return `${BASE}${path}`;
  return `${BASE}/${path}`;
}
