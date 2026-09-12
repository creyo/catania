export interface MenuItem {
  label: string;
  href: string;
}

export interface NavMenuItem extends MenuItem {
  subItems?: MenuItem[];
}

function normalizeUrl(url: string): string {
  if (!url) return '#';
  const trimmed = url.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('#')
  ) {
    return trimmed;
  }
  if (trimmed.startsWith('www.') || /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(trimmed)) {
    return 'https://' + trimmed;
  }
  const path = trimmed.replace(/^\/+/, '');
  return '/' + path;
}

export function parseMenuString(raw: string | undefined | null): NavMenuItem[] {
  if (!raw || typeof raw !== 'string') return [];

  const lines = raw.split('\n');
  const result: NavMenuItem[] = [];
  const stack: { indent: number; item: NavMenuItem }[] = [];

  for (const line of lines) {
    const stripped = line.replace(/^\s*\*\s*/, '');
    if (!stripped.trim()) continue;

    const indent = line.search(/\S/);
    if (indent < 0) continue;

    const match = stripped.match(/\[([^\]]*)\]\(([^)]*)\)/);
    if (!match) continue;

    const label = match[1].trim();
    const url = match[2].trim();
    if (!label || !url) continue;

    const item: NavMenuItem = {
      label,
      href: normalizeUrl(url),
    };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (stack.length === 0) {
      result.push(item);
    } else {
      const parent = stack[stack.length - 1].item;
      if (!parent.subItems) parent.subItems = [];
      parent.subItems.push(item);
    }

    stack.push({ indent, item });
  }

  return result;
}

export function parseFlatMenu(raw: string | undefined | null): MenuItem[] {
  return parseMenuString(raw).map(({ label, href }) => ({ label, href }));
}

/**
 * Parses a plain comma- or newline-separated list of contact field names.
 * e.g. "name, email, message" or "name\nemail\nphone\nmessage"
 * Returns a lowercase string array: ["name", "email", "message"]
 * Used by Contact components to conditionally render form fields.
 */
export function parseFieldList(raw: string | undefined | null): string[] {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[\n,]+/)
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean);
}
