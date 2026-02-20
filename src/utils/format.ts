/**
 * Response formatting utilities.
 *
 * Raw WordPress API responses include full rendered HTML, every media size,
 * and deeply nested objects — all of which eat through context windows fast.
 * These helpers strip HTML, truncate, and project only essential fields.
 */

// ── HTML Stripping ──────────────────────────────────────────────────────

/**
 * Strip HTML tags and decode common entities. Returns plain text.
 */
export function stripHtml(html: string | undefined | null): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')           // strip tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, '\n\n')        // collapse excessive newlines
    .trim();
}

/**
 * Truncate text to `max` characters, adding "…" if truncated.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

// ── Rendered field helpers ──────────────────────────────────────────────

/** Extract the string value from a WP rendered field like { rendered: "..." } */
function rendered(field: unknown): string {
  if (typeof field === 'string') return field;
  if (field && typeof field === 'object' && 'rendered' in field) {
    return String((field as Record<string, unknown>).rendered ?? '');
  }
  return '';
}

// ── Entity Formatters ───────────────────────────────────────────────────

/**
 * Format a post for list responses (compact, no full content).
 */
export function formatPostSummary(post: Record<string, unknown>) {
  return {
    id: post.id,
    title: stripHtml(rendered(post.title)),
    status: post.status,
    slug: post.slug,
    date: post.date,
    modified: post.modified,
    author: post.author,
    categories: post.categories,
    tags: post.tags,
    link: post.link,
    excerpt: truncate(stripHtml(rendered(post.excerpt)), 200),
    featured_media: post.featured_media,
  };
}

/**
 * Format a single post for detail responses (includes content, truncated).
 */
export function formatPostDetail(post: Record<string, unknown>, contentMax = 2000) {
  const raw = rendered(post.content);
  const plain = stripHtml(raw);
  return {
    ...formatPostSummary(post),
    content: truncate(plain, contentMax),
    content_raw: typeof (post.content as any)?.raw === 'string'
      ? truncate((post.content as any).raw, contentMax)
      : undefined,
    excerpt: stripHtml(rendered(post.excerpt)),
    comment_status: post.comment_status,
    meta: post.meta,
    template: post.template,
  };
}

/**
 * Format a page for list responses.
 */
export function formatPageSummary(page: Record<string, unknown>) {
  return {
    id: page.id,
    title: stripHtml(rendered(page.title)),
    status: page.status,
    slug: page.slug,
    date: page.date,
    modified: page.modified,
    author: page.author,
    parent: page.parent,
    menu_order: page.menu_order,
    template: page.template,
    link: page.link,
    excerpt: truncate(stripHtml(rendered(page.excerpt)), 200),
    featured_media: page.featured_media,
  };
}

/**
 * Format a single page detail.
 */
export function formatPageDetail(page: Record<string, unknown>, contentMax = 2000) {
  const plain = stripHtml(rendered(page.content));
  return {
    ...formatPageSummary(page),
    content: truncate(plain, contentMax),
    content_raw: typeof (page.content as any)?.raw === 'string'
      ? truncate((page.content as any).raw, contentMax)
      : undefined,
    comment_status: page.comment_status,
    meta: page.meta,
  };
}

/**
 * Format a media item for list responses.
 */
export function formatMediaSummary(media: Record<string, unknown>) {
  const details = (media.media_details ?? {}) as Record<string, unknown>;
  return {
    id: media.id,
    title: stripHtml(rendered(media.title)),
    slug: media.slug,
    media_type: media.media_type,
    mime_type: media.mime_type,
    source_url: media.source_url,
    alt_text: media.alt_text,
    date: media.date,
    author: media.author,
    width: details.width,
    height: details.height,
    filesize: details.filesize,
  };
}

/**
 * Format a media item detail.
 */
export function formatMediaDetail(media: Record<string, unknown>) {
  const details = (media.media_details ?? {}) as Record<string, unknown>;
  const sizes = (details.sizes ?? {}) as Record<string, unknown>;
  // Only include URL for each size, not all the metadata
  const sizeUrls: Record<string, string> = {};
  for (const [name, info] of Object.entries(sizes)) {
    if (info && typeof info === 'object' && 'source_url' in info) {
      sizeUrls[name] = String((info as Record<string, unknown>).source_url);
    }
  }
  return {
    ...formatMediaSummary(media),
    caption: stripHtml(rendered(media.caption)),
    description: stripHtml(rendered(media.description)),
    sizes: sizeUrls,
    post: media.post,
    link: media.link,
  };
}

/**
 * Format a user for list responses.
 */
export function formatUserSummary(user: Record<string, unknown>) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    slug: user.slug,
    roles: user.roles,
    email: user.email,
    url: user.url,
    registered_date: user.registered_date,
  };
}

/**
 * Format a user detail.
 */
export function formatUserDetail(user: Record<string, unknown>) {
  return {
    ...formatUserSummary(user),
    first_name: user.first_name,
    last_name: user.last_name,
    description: user.description,
    avatar_urls: user.avatar_urls,
  };
}

/**
 * Format a category/tag for list responses.
 */
export function formatTermSummary(term: Record<string, unknown>) {
  return {
    id: term.id,
    name: stripHtml(rendered(term.name) || String(term.name ?? '')),
    slug: term.slug,
    description: term.description,
    parent: term.parent,
    count: term.count,
    link: term.link,
  };
}

/**
 * Format a comment for list responses.
 */
export function formatCommentSummary(comment: Record<string, unknown>) {
  return {
    id: comment.id,
    post: comment.post,
    parent: comment.parent,
    author: comment.author,
    author_name: comment.author_name,
    date: comment.date,
    status: comment.status,
    content: truncate(stripHtml(rendered(comment.content)), 300),
    link: comment.link,
  };
}

/**
 * Format a comment detail.
 */
export function formatCommentDetail(comment: Record<string, unknown>) {
  return {
    ...formatCommentSummary(comment),
    content: stripHtml(rendered(comment.content)),
    author_email: comment.author_email,
    author_url: comment.author_url,
  };
}

/**
 * Format a plugin for list responses.
 */
export function formatPluginSummary(plugin: Record<string, unknown>) {
  return {
    plugin: plugin.plugin,
    name: stripHtml(rendered(plugin.name) || String(plugin.name ?? '')),
    status: plugin.status,
    version: plugin.version,
    author: stripHtml(String(plugin.author ?? '')),
    description: truncate(stripHtml(rendered(plugin.description)), 200),
    requires_wp: plugin.requires_wp,
    requires_php: plugin.requires_php,
  };
}

/**
 * Generic formatter: if we don't have a specific formatter, at least strip
 * any HTML from known rendered fields and truncate content.
 */
export function formatGeneric(obj: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && 'rendered' in value) {
      result[key] = truncate(stripHtml(rendered(value)), 500);
    } else {
      result[key] = value;
    }
  }
  return result;
}
