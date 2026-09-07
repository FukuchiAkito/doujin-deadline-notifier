import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { collectOrangeKoubouDeadlines } from "../../src/lib/orange-koubou-scraper";

const tableName = process.env.DEADLINES_TABLE;
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function log(event: string, fields: Record<string, unknown> = {}) {
  console.info(JSON.stringify({
    component: "scraper",
    event,
    level: "INFO",
    timestamp: new Date().toISOString(),
    ...fields,
  }));
}

function logError(error: unknown) {
  const errorType = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({
    component: "scraper",
    errorType,
    event: "scrape.failed",
    level: "ERROR",
    message,
    timestamp: new Date().toISOString(),
  }));
}

function logWarning(event: string, fields: Record<string, unknown>) {
  console.warn(JSON.stringify({
    component: "scraper",
    event,
    level: "WARN",
    timestamp: new Date().toISOString(),
    ...fields,
  }));
}

export async function handler() {
  log("scrape.started");

  try {
    if (!tableName) throw new Error("DEADLINES_TABLE is required");

    const result = await collectOrangeKoubouDeadlines(fetch, {
      onFetchStarted: (targetUrl) => log("scrape.fetch.started", { targetUrl }),
      onFetchCompleted: ({ charset, htmlLength, httpStatus, tableCount, targetUrl }) => {
        log("scrape.fetch.completed", { charset, htmlLength, httpStatus, tableCount, targetUrl });
      },
    });
    const skippedCount = Object.values(result.summary.skippedByReason).reduce((total, count) => total + count, 0);

    log("scrape.extraction.completed", {
      normalizedDeadlineCount: result.summary.normalizedDeadlineCount,
      rawDeadlineCount: result.summary.rawDeadlineCount,
      targetUrlCount: result.summary.targetUrlCount,
    });
    if (result.summary.targetUrlCount > 1 && result.summary.rawDeadlineCount === 0) {
      logWarning("scrape.extraction.empty_warning", {
        detailPageCount: result.summary.targetUrlCount - 1,
        normalizedDeadlineCount: result.summary.normalizedDeadlineCount,
        rawDeadlineCount: result.summary.rawDeadlineCount,
      });
    }
    log("scrape.skipped", {
      skippedByReason: result.summary.skippedByReason,
      skippedCount,
    });

    const writes = await Promise.allSettled(result.deadlines.map((deadline) => client.send(new PutCommand({
      TableName: tableName,
      Item: { pk: `SHOP#${deadline.printShopId}`, sk: `DEADLINE#${deadline.id}`, ...deadline },
    }))));
    const writeCount = writes.filter((write) => write.status === "fulfilled").length;
    const failedWriteCount = writes.length - writeCount;

    log("scrape.dynamodb.write.completed", { failedWriteCount, writeCount });
    if (failedWriteCount > 0) {
      const failedWrite = writes.find((write) => write.status === "rejected");
      throw failedWrite?.reason;
    }

    log("scrape.completed", {
      deadlineCount: result.deadlines.length,
      skippedCount,
      writeCount,
    });
    return { count: result.deadlines.length };
  } catch (error) {
    logError(error);
    throw error;
  }
}
