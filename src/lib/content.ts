// Content access via Vite's import.meta.glob (avoids the Astro content layer,
// which is reliable across the Astro/Vite version matrix and needs no astro sync).

export interface WorkData {
  title: string;
  description: string;
  date: Date;
  year: number;
  status: 'released' | 'in-development' | 'prototype';
  tags: string[];
  platform: string[];
  role?: string;
  cover?: string;
  featured: boolean;
  order: number;
  draft?: boolean;
  links: { label: string; url: string }[];
}

export interface NewsData {
  title: string;
  description: string;
  pubDate: Date;
  tags: string[];
  cover?: string;
  draft: boolean;
  order: number;
}

export interface WorkEntry {
  id: string;
  Component: unknown;
  data: WorkData;
}

export interface NewsEntry {
  id: string;
  Component: unknown;
  data: NewsData;
}

const workModules = import.meta.glob('../content/works/*.md', { eager: true }) as Record<
  string,
  { default: unknown; frontmatter: Record<string, unknown> }
>;

const newsModules = import.meta.glob('../content/news/*.md', { eager: true }) as Record<
  string,
  { default: unknown; frontmatter: Record<string, unknown> }
>;

function slugFrom(file: string): string {
  const base = file.split('/').pop() ?? file;
  return base.replace(/\.md$/, '');
}

export function getWorks(): WorkEntry[] {
  return Object.entries(workModules)
    .filter(([, mod]) => !(mod.frontmatter as Record<string, unknown>).draft)
    .map(([file, mod]) => {
      const fm = mod.frontmatter as Record<string, unknown>;
      const links = Array.isArray(fm.links)
        ? (fm.links as { label: string; url: string }[])
        : [];
      return {
        id: slugFrom(file),
        Component: mod.default,
        data: {
          title: String(fm.title ?? ''),
          description: String(fm.description ?? ''),
          date: new Date((fm.date as string) ?? Date.now()),
          year: Number(fm.year ?? 0),
          status: (fm.status as WorkData['status']) ?? 'released',
          tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
          platform: Array.isArray(fm.platform) ? (fm.platform as string[]) : [],
          role: fm.role ? String(fm.role) : undefined,
          cover: fm.cover ? String(fm.cover) : undefined,
          featured: Boolean(fm.featured),
          order: Number(fm.order ?? 0),
          draft: Boolean(fm.draft),
          links,
        },
      };
    })
    .sort((a, b) => a.data.order - b.data.order);
}

export function getNews(): NewsEntry[] {
  return Object.entries(newsModules)
    .filter(([, mod]) => !mod.frontmatter.draft)
    .map(([file, mod]) => {
      const fm = mod.frontmatter as Record<string, unknown>;
      return {
        id: slugFrom(file),
        Component: mod.default,
        data: {
          title: String(fm.title ?? ''),
          description: String(fm.description ?? ''),
          pubDate: new Date((fm.pubDate as string) ?? Date.now()),
          tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
          cover: fm.cover ? String(fm.cover) : undefined,
          draft: Boolean(fm.draft),
          order: Number(fm.order ?? 0),
        },
      };
    })
    .sort((a, b) => (a.data.order - b.data.order) || (b.data.pubDate.valueOf() - a.data.pubDate.valueOf()));
}
