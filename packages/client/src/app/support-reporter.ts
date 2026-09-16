import type { DiagnosticEntry } from '../state/app-store.js';

export type SupportCategory = 'bug' | 'gameplay' | 'account' | 'feedback';

export interface SupportReportInput {
  readonly category: SupportCategory;
  readonly message: string;
  readonly playerId?: string;
  readonly diagnostics: readonly DiagnosticEntry[];
}

export function supportReportUrl(serverUrl: string): string | null {
  try {
    const url = new URL(serverUrl.replace(/^ws/, 'http'));
    url.protocol = url.protocol === 'https:' ? 'https:' : 'http:';
    url.pathname = '/support/reports';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export async function submitSupportReport(
  serverUrl: string,
  input: SupportReportInput,
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<string> {
  const endpoint = supportReportUrl(serverUrl);
  if (endpoint === null) throw new Error('The support endpoint is unavailable.');
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      category: input.category,
      message: input.message.trim(),
      ...(input.playerId ? { playerId: input.playerId } : {}),
      clientAtMs: Date.now(),
      diagnostics: input.diagnostics.slice(-10).map(({ level, source, message, atMs }) => ({
        level,
        source,
        message,
        atMs,
      })),
    }),
  });
  if (response.status === 429)
    throw new Error('Too many reports were sent. Please try again later.');
  if (!response.ok) throw new Error('The report could not be delivered.');
  const result = (await response.json()) as { reportId?: unknown };
  if (typeof result.reportId !== 'string')
    throw new Error('The server returned no report receipt.');
  return result.reportId;
}
