import { chromium } from 'playwright';

interface BrowserFetchOptions {
  sourceUrl: string;
  timeoutMs: number;
}

export async function fetchHtmlWithBrowser(options: BrowserFetchOptions): Promise<string> {
  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage({
      locale: 'es-PE',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    });

    await page.goto(options.sourceUrl, {
      timeout: options.timeoutMs,
      waitUntil: 'domcontentloaded'
    });

    await page.waitForSelector('.holidays__title', {
      timeout: options.timeoutMs
    });

    return page.content();
  } finally {
    await browser.close();
  }
}
