import { load } from "cheerio";
import { Deadline, PRINT_SHOP_ID } from "@/lib/domain";

const baseUrl = "https://www.orangekoubou.com";
const scheduleUrl = `${baseUrl}/schedule/schedule_event.php`;
const userAgent = "DoujinDeadlineNotifier/0.1 (+https://example.com/contact)";

export type FetchObservation = {
  charset: string;
  htmlLength: number;
  httpStatus: number;
  tableCount: number;
  targetUrl: string;
};

export type ScrapeObserver = {
  onFetchCompleted?: (observation: FetchObservation) => void;
  onFetchStarted?: (targetUrl: string) => void;
};

export type ScrapeSummary = {
  normalizedDeadlineCount: number;
  rawDeadlineCount: number;
  skippedByReason: Record<string, number>;
  targetUrlCount: number;
};

export type ScrapeResult = {
  deadlines: Deadline[];
  summary: ScrapeSummary;
};

class ScrapeHttpError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly targetUrl: string,
  ) {
    super(`Request failed with status ${httpStatus}: ${targetUrl}`);
    this.name = "ScrapeHttpError";
  }
}

function normalize(text: string) {
  return text.replace(/\s+/g, " ").replace(/　/g, " ").trim();
}

function dateFromScheduleUrl(url: string) {
  const match = url.match(/schedule_event(\d{4})(\d{2})(\d{2})\.php$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

function deadlineAt(eventDate: string, month: string, day: string) {
  const eventYear = Number(eventDate.slice(0, 4));
  const eventMonth = Number(eventDate.slice(5, 7));
  const sourceMonth = Number(month);
  const year = sourceMonth > eventMonth ? eventYear - 1 : eventYear;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T10:00:00+09:00`;
}

function charsetFrom(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const match = contentType.match(/charset\s*=\s*([^;\s]+)/i);
  return match?.[1]?.toLowerCase() === "euc-jp" ? "euc-jp" : "utf-8";
}

function deadlineLabel(heading: string, deadlineCell: string) {
  const category = heading.match(/【[^】]+】/)?.[0] ?? heading;
  const qualifier = normalize(deadlineCell.replace(/\d{1,2}\/\d{1,2}\s*[（(][^）)]*[）)]\s*午前\s*10時/, ""));
  return qualifier ? `${category} / ${qualifier}` : category;
}

type TableCell = {
  className: string;
  columnIndex: number;
  columnSpan: number;
  tagName: "td" | "th";
  text: string;
};

function tableSpan(value: string | undefined) {
  const span = Number(value);
  return Number.isInteger(span) && span > 0 ? span : 1;
}

function tableRows($: ReturnType<typeof load>, table: ReturnType<ReturnType<typeof load>>): TableCell[][] {
  const rows: TableCell[][] = [];
  const occupiedColumns = new Map<number, number>();

  table.find("tr").each((_, row) => {
    const cells: TableCell[] = [];
    let columnIndex = 0;

    $(row).children("th,td").each((__, cell) => {
      while (occupiedColumns.has(columnIndex)) columnIndex += 1;

      const cellElement = $(cell);
      const columnSpan = tableSpan(cellElement.attr("colspan"));
      const rowSpan = tableSpan(cellElement.attr("rowspan"));
      const tagName = cell.tagName.toLowerCase();
      if (tagName !== "th" && tagName !== "td") return;

      cells.push({
        className: cellElement.attr("class") ?? "",
        columnIndex,
        columnSpan,
        tagName,
        text: normalize(cellElement.text()),
      });

      if (rowSpan > 1) {
        for (let offset = 0; offset < columnSpan; offset += 1) {
          occupiedColumns.set(columnIndex + offset, rowSpan);
        }
      }
      columnIndex += columnSpan;
    });

    for (const [occupiedColumn, remainingRows] of occupiedColumns) {
      if (remainingRows <= 1) occupiedColumns.delete(occupiedColumn);
      else occupiedColumns.set(occupiedColumn, remainingRows - 1);
    }
    rows.push(cells);
  });

  return rows;
}

function deadlineConditions(rows: TableCell[][]) {
  const headerRow = rows.find((row) => row.length > 0 && row.every((cell) => cell.tagName === "th") && row.some((cell) => !cell.className.split(/\s+/).includes("booklet")));
  const conditions = new Map<number, string>();

  for (const cell of headerRow ?? []) {
    for (let offset = 0; offset < cell.columnSpan; offset += 1) {
      conditions.set(cell.columnIndex + offset, cell.text);
    }
  }
  return conditions;
}

async function fetchHtml(
  fetcher: typeof fetch,
  observer: ScrapeObserver | undefined,
  targetUrl: string,
) {
  observer?.onFetchStarted?.(targetUrl);
  const response = await fetcher(targetUrl, {
    headers: { Accept: "text/html", "User-Agent": userAgent },
  });

  if (!response.ok) {
    observer?.onFetchCompleted?.({
      charset: charsetFrom(response),
      htmlLength: 0,
      httpStatus: response.status,
      tableCount: 0,
      targetUrl,
    });
    throw new ScrapeHttpError(response.status, targetUrl);
  }

  const charset = charsetFrom(response);
  const html = new TextDecoder(charset).decode(await response.arrayBuffer());
  observer?.onFetchCompleted?.({
    charset,
    htmlLength: html.length,
    httpStatus: response.status,
    tableCount: load(html)("table").length,
    targetUrl,
  });
  return html;
}

function collectRows(html: string, sourceUrl: string, eventDate: string): Deadline[] {
  const $ = load(html);
  const eventName = normalize($("h3").filter((_, element) => /(?:通常|特別)〆切スケジュール/.test($(element).text())).first().text()) || `イベント合わせ ${eventDate}`;
  const entries: Deadline[] = [];
  const table = $("table.schedule_booklet").first();
  const deliveryLabel = normalize(table.parent().prevAll().filter((_, element) => /^(?:納品日|発送日)/.test(normalize($(element).text()))).first().text()) || undefined;
  const rows = tableRows($, table);
  const conditionsByColumn = deadlineConditions(rows);
  let activeHeading: string | undefined;

  rows.forEach((row, rowIndex) => {
    const heading = row.find((cell) => cell.tagName === "th" && cell.className.split(/\s+/).includes("booklet"))?.text;
    if (heading) activeHeading = heading;
    if (!activeHeading) return;
    const headingForRow = activeHeading;

    row.filter((cell) => cell.tagName === "td").forEach((cell, cellIndex) => {
      const deadlineCell = cell.text;
      const match = deadlineCell.match(/(\d{1,2})\/(\d{1,2})\s*[（(][^）)]*[）)]\s*午前\s*10時/);
      if (!match) return;
      const deadlineCondition = conditionsByColumn.get(cell.columnIndex);
      if (!deadlineCondition) return;

      const label = deadlineLabel(headingForRow, deadlineCell);
      const deadlineAtValue = deadlineAt(eventDate, match[1], match[2]);
      const eventId = `${PRINT_SHOP_ID}-${eventDate.replaceAll("-", "")}-${rowIndex}-${cellIndex}-${label}-${deadlineAtValue}`.replaceAll(" ", "-");
      entries.push({
        id: eventId,
        printShopId: PRINT_SHOP_ID,
        eventName,
        eventDate,
        label,
        deadlineCondition,
        ...(deliveryLabel ? { deliveryLabel } : {}),
        rowLabel: headingForRow,
        deadlineAt: deadlineAtValue,
        sourceUrl,
        notes: "公式ページの締切区分・ページ数表記・締切日時をそのまま記録しています。",
        fetchedAt: new Date().toISOString(),
      });
    });
  });
  return entries;
}

export async function collectOrangeKoubouDeadlines(
  fetcher: typeof fetch = fetch,
  observer?: ScrapeObserver,
): Promise<ScrapeResult> {
  const scheduleHtml = await fetchHtml(fetcher, observer, scheduleUrl);
  const $ = load(scheduleHtml);
  const links = [...new Set($("a[href]").map((_, element) => $(element).attr("href")).get())]
    .filter((href): href is string => Boolean(href && /schedule_event\d{8}\.php$/.test(href)))
    .map((href) => new URL(href, scheduleUrl).toString())
    .slice(0, 20);
  const skippedByReason: Record<string, number> = {};
  const skip = (reason: string) => {
    skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1;
  };

  if (links.length === 0) skip("schedule_links_not_found");

  const deadlines = await Promise.all(links.map(async (targetUrl) => {
    const eventDate = dateFromScheduleUrl(targetUrl);
    if (!eventDate) {
      skip("invalid_event_schedule_url");
      return [];
    }

    const entries = collectRows(await fetchHtml(fetcher, observer, targetUrl), targetUrl, eventDate);
    if (entries.length === 0) skip("no_matching_deadline_in_event_page");
    return entries;
  }));

  const rawDeadlines = deadlines.flat();
  const normalizedDeadlines = rawDeadlines.filter((deadline) => new Date(deadline.deadlineAt).getTime() > Date.now() - 86_400_000);
  const expiredDeadlineCount = rawDeadlines.length - normalizedDeadlines.length;
  if (expiredDeadlineCount > 0) skippedByReason.expired_deadline = expiredDeadlineCount;

  return {
    deadlines: normalizedDeadlines,
    summary: {
      normalizedDeadlineCount: normalizedDeadlines.length,
      rawDeadlineCount: rawDeadlines.length,
      skippedByReason,
      targetUrlCount: links.length + 1,
    },
  };
}
