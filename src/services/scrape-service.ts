import { fetchHtmlWithBrowser } from './browser-scrape-service';
import { createHash } from './hash-service';
import { detectWafBlock, parseHolidayPage } from '../parser/holidays-parser';
import type { ScrapeResult } from '../types';

export const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8'
} as const;

interface FetchOptions {
  timeoutMs: number;
}

interface RunScrapeOptions extends FetchOptions {
  sourceUrl: string;
  maxRetries?: number;
  usePlaywrightFallback: boolean;
  browserFetch?: typeof fetchHtmlWithBrowser;
}

interface HtmlResponse {
  statusCode: number;
  html: string;
}

export async function fetchHtml(url: string, options: FetchOptions): Promise<HtmlResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      headers: DEFAULT_HEADERS,
      signal: controller.signal
    });
    const html = await response.text();

    return {
      statusCode: response.status,
      html
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchWithRetry(url: string, options: FetchOptions & { maxRetries?: number }): Promise<HtmlResponse> {
  let attempt = 0;
  let lastError: unknown = null;
  const maxRetries = options.maxRetries || 1;

  while (attempt < maxRetries) {
    try {
      return await fetchHtml(url, {
        timeoutMs: options.timeoutMs
      });
    } catch (error) {
      lastError = error;
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown fetch error');
}

export async function runScrape(options: RunScrapeOptions): Promise<ScrapeResult> {
  let response = await fetchWithRetry(options.sourceUrl, {
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries || 1
  });
  let html = response.html;
  let usedBrowserFallback = false;

  if ((response.statusCode >= 400 || detectWafBlock(html)) && options.usePlaywrightFallback) {
    html = await (options.browserFetch || fetchHtmlWithBrowser)({
      sourceUrl: options.sourceUrl,
      timeoutMs: options.timeoutMs
    });
    usedBrowserFallback = true;
    response = {
      statusCode: 200,
      html
    };
  }

  if (response.statusCode >= 400 || detectWafBlock(html)) {
    return {
      ok: false,
      usedBrowserFallback,
      statusCode: response.statusCode,
      errorCode: 'FETCH_BLOCKED',
      html
    };
  }

  const parsed = parseHolidayPage(html);
  const normalizedPayload = {
    year: parsed.year,
    holidays: parsed.holidays
  };

  return {
    ok: true,
    usedBrowserFallback,
    statusCode: response.statusCode,
    html,
    parsed,
    contentHash: createHash(html),
    normalizedHash: createHash(JSON.stringify(normalizedPayload)),
    normalizedPayload
  };
}
