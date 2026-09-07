import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import webpush from "web-push";
import { Deadline, Watch } from "../../src/lib/domain";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssm = new SSMClient({});
const reminderDays = new Set([7, 3, 1]);

function daysUntilJst(deadlineAt: string) {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = (date: Date) => Object.fromEntries(format.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const today = parts(new Date());
  const deadline = parts(new Date(deadlineAt));
  return Math.round((Date.UTC(Number(deadline.year), Number(deadline.month) - 1, Number(deadline.day)) - Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day))) / 86_400_000);
}

async function privateVapidKey() {
  const parameterName = process.env.VAPID_PRIVATE_KEY_PARAMETER;
  if (!parameterName) throw new Error("VAPID_PRIVATE_KEY_PARAMETER is required");
  const result = await ssm.send(new GetParameterCommand({ Name: parameterName, WithDecryption: true }));
  if (!result.Parameter?.Value) throw new Error("VAPID private key was not found");
  return result.Parameter.Value;
}

export async function handler() {
  const [deadlinesResult, vapidPrivateKey] = await Promise.all([dynamo.send(new ScanCommand({ TableName: process.env.DEADLINES_TABLE })), privateVapidKey()]);
  const userDataTable = process.env.USER_DATA_TABLE;
  if (!userDataTable || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_SUBJECT) throw new Error("Notification configuration is incomplete");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, vapidPrivateKey);
  let sent = 0;

  for (const deadline of (deadlinesResult.Items ?? []) as Deadline[]) {
    const days = daysUntilJst(deadline.deadlineAt);
    if (!reminderDays.has(days)) continue;
    const watches = await dynamo.send(new QueryCommand({ TableName: userDataTable, IndexName: "DeadlineIndex", KeyConditionExpression: "gsi1pk = :pk", ExpressionAttributeValues: { ":pk": `DEADLINE#${deadline.id}` } }));
    for (const watch of watches.Items ?? []) {
      const item = watch as Watch & { pk: string; sk: string; notifiedDays?: Record<string, string> };
      if (!item.notifyEnabled || item.progress === "submitted" || item.notifiedDays?.[String(days)]) continue;
      const subscriptions = await dynamo.send(new QueryCommand({ TableName: userDataTable, KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)", ExpressionAttributeValues: { ":pk": item.pk, ":sk": "PUSH#" } }));
      await Promise.all((subscriptions.Items ?? []).map(async (subscription) => {
        await webpush.sendNotification(subscription.subscription, JSON.stringify({ title: `${deadline.eventName}まであと${days}日`, body: `${deadline.label}: ${new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(deadline.deadlineAt))}`, url: "/" }));
        sent += 1;
      }));
      await dynamo.send(new UpdateCommand({ TableName: userDataTable, Key: { pk: item.pk, sk: item.sk }, UpdateExpression: "SET notifiedDays.#days = :sentAt", ExpressionAttributeNames: { "#days": String(days) }, ExpressionAttributeValues: { ":sentAt": new Date().toISOString() } }));
    }
  }
  return { sent };
}
