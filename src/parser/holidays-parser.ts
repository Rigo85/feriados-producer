import * as cheerio from 'cheerio';

import type { HolidayRecord, ParsedHolidayPage } from '../types';

const MONTHS: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12'
};

function padDay(day: string | number): string {
  return String(day).padStart(2, '0');
}

function normalizeWhitespace(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function buildIsoDate(year: number, day: string, monthName: string): string {
  const normalizedMonthName = String(monthName || '').toLowerCase().replace(/[:.]/g, '').trim();
  const month = MONTHS[normalizedMonthName];
  if (!month) {
    throw new Error(`Unknown month name: ${monthName}`);
  }

  return `${year}-${month}-${padDay(day)}`;
}

function parseRecentHoliday($: cheerio.CheerioAPI, year: number): HolidayRecord | null {
  const partialDate = normalizeWhitespace($('.holidays__recent-holiday-date').text());
  const name = normalizeWhitespace($('.holidays__recent-holiday-name').text());

  if (!partialDate || !name) {
    return null;
  }

  const match = partialDate.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)/i);
  if (!match) {
    throw new Error(`Unexpected recent holiday format: ${partialDate}`);
  }

  const day = match[1]!;
  const monthName = match[2]!;

  return {
    date: buildIsoDate(year, day, monthName),
    year,
    month: Number(MONTHS[monthName.toLowerCase()]!),
    day: Number(day),
    name,
    scope: 'national'
  };
}

function parseHolidayList($: cheerio.CheerioAPI, year: number): HolidayRecord[] {
  return $('.holidays__list-item')
    .toArray()
    .map((element): HolidayRecord => {
      const parts = $(element)
        .find('.holidays__list-item-date')
        .toArray()
        .map((node) => normalizeWhitespace($(node).text()));

      const name = normalizeWhitespace($(element).find('.holidays__list-item-name').text());
      const joinedDate = normalizeWhitespace(parts.join(' '));
      const match = joinedDate.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)/i);

      if (!match || !name) {
        throw new Error(`Unexpected holiday list item format: ${joinedDate} ${name}`);
      }

      const day = match[1]!;
      const monthName = match[2]!;

      return {
        date: buildIsoDate(year, day, monthName),
        year,
        month: Number(MONTHS[monthName.toLowerCase()]!),
        day: Number(day),
        name,
        scope: 'national'
      };
    });
}

function dedupeByDate(items: HolidayRecord[]): HolidayRecord[] {
  const byDate = new Map<string, HolidayRecord>();

  for (const item of items) {
    byDate.set(item.date, item);
  }

  return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

export function detectWafBlock(html: string): boolean {
  const raw = String(html || '');
  return raw.includes('The access is blocked') || raw.includes('访问被拦截') || raw.includes('HWWAF');
}

export function parseHolidayPage(html: string): ParsedHolidayPage {
  if (detectWafBlock(html)) {
    throw new Error('Blocked by WAF');
  }

  const $ = cheerio.load(html);
  const title = normalizeWhitespace($('.holidays__title').text());
  const yearMatch = title.match(/(\d{4})/);

  if (!yearMatch) {
    throw new Error('Unable to determine holiday year from page title');
  }

  const year = Number(yearMatch[1]);
  const recentHoliday = parseRecentHoliday($, year);
  const holidayList = parseHolidayList($, year);
  const holidays = dedupeByDate([recentHoliday, ...holidayList].filter((value): value is HolidayRecord => Boolean(value)));

  return {
    year,
    title,
    holidays
  };
}
