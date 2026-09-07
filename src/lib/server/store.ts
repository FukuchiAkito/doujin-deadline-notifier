import { createHash } from "crypto";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { Deadline, Progress, Watch, PRINT_SHOP_ID } from "@/lib/domain";
import { sampleDeadlines } from "@/lib/sample-data";
import { hasDynamoConfiguration, config } from "@/lib/server/config";
import { dynamo } from "@/lib/server/dynamo";

type StoredSession = { deviceId: string; expiresAt: number };
type PushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

const developmentSessions = new Map<string, StoredSession>();
const developmentWatches = new Map<string, Watch>();
const developmentSubscriptions = new Map<string, PushSubscription>();

function developmentStoreEnabled() {
  if (!hasDynamoConfiguration && process.env.NODE_ENV === "production") {
    throw new Error("DynamoDB table configuration is required in production");
  }
  return !hasDynamoConfiguration;
}

function withoutKeys(item: Record<string, unknown>, keys: string[]) {
  const result = { ...item };
  for (const key of keys) delete result[key];
  return result;
}

function watchKey(deviceId: string, deadlineId: string) {
  return `${deviceId}:${deadlineId}`;
}

function subscriptionKey(deviceId: string, endpoint: string) {
  return `${deviceId}:${createHash("sha256").update(endpoint).digest("hex")}`;
}

export async function listDeadlines(): Promise<Deadline[]> {
  if (developmentStoreEnabled()) {
    return sampleDeadlines;
  }

  const result = await dynamo.send(
    new QueryCommand({
      TableName: config.deadlinesTable,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": `SHOP#${PRINT_SHOP_ID}` },
    }),
  );

  return (result.Items ?? [])
    .map((item) => withoutKeys(item, ["pk", "sk"]) as Deadline)
    .sort((left, right) => left.deadlineAt.localeCompare(right.deadlineAt));
}

export async function getDeadline(deadlineId: string) {
  return (await listDeadlines()).find((deadline) => deadline.id === deadlineId);
}

export async function createSession(tokenHash: string, deviceId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90;
  if (developmentStoreEnabled()) {
    developmentSessions.set(tokenHash, { deviceId, expiresAt });
    return;
  }

  await dynamo.send(
    new PutCommand({
      TableName: config.sessionsTable,
      Item: { tokenHash, deviceId, expiresAt },
      ConditionExpression: "attribute_not_exists(tokenHash)",
    }),
  );
}

export async function findSession(tokenHash: string): Promise<StoredSession | undefined> {
  if (developmentStoreEnabled()) {
    return developmentSessions.get(tokenHash);
  }

  const result = await dynamo.send(
    new GetCommand({
      TableName: config.sessionsTable,
      Key: { tokenHash },
    }),
  );
  return result.Item as StoredSession | undefined;
}

export async function listWatches(deviceId: string): Promise<Watch[]> {
  if (developmentStoreEnabled()) {
    return [...developmentWatches.entries()]
      .filter(([key]) => key.startsWith(`${deviceId}:`))
      .map(([, watch]) => watch);
  }

  const result = await dynamo.send(
    new QueryCommand({
      TableName: config.userDataTable,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":pk": `DEVICE#${deviceId}`,
        ":sk": "WATCH#",
      },
    }),
  );

  return (result.Items ?? []).map((item) => withoutKeys(item, ["pk", "sk"]) as Watch);
}

export async function upsertWatch(
  deviceId: string,
  deadlineId: string,
  progress: Progress,
  notifyEnabled: boolean,
) {
  const updatedAt = new Date().toISOString();
  const watch: Watch = { deadlineId, progress, notifyEnabled, updatedAt };
  if (developmentStoreEnabled()) {
    developmentWatches.set(watchKey(deviceId, deadlineId), watch);
    return watch;
  }

  await dynamo.send(
    new PutCommand({
      TableName: config.userDataTable,
      Item: {
        pk: `DEVICE#${deviceId}`,
        sk: `WATCH#${deadlineId}`,
        gsi1pk: `DEADLINE#${deadlineId}`,
        gsi1sk: `DEVICE#${deviceId}`,
        ...watch,
      },
    }),
  );
  return watch;
}

export async function deleteWatch(deviceId: string, deadlineId: string) {
  if (developmentStoreEnabled()) {
    developmentWatches.delete(watchKey(deviceId, deadlineId));
    return;
  }

  await dynamo.send(
    new DeleteCommand({
      TableName: config.userDataTable,
      Key: { pk: `DEVICE#${deviceId}`, sk: `WATCH#${deadlineId}` },
      ConditionExpression: "attribute_exists(pk)",
    }),
  );
}

export async function savePushSubscription(deviceId: string, subscription: PushSubscription) {
  const endpointHash = createHash("sha256").update(subscription.endpoint).digest("hex");
  if (developmentStoreEnabled()) {
    developmentSubscriptions.set(subscriptionKey(deviceId, subscription.endpoint), subscription);
    return;
  }

  await dynamo.send(
    new PutCommand({
      TableName: config.userDataTable,
      Item: {
        pk: `DEVICE#${deviceId}`,
        sk: `PUSH#${endpointHash}`,
        endpointHash,
        subscription,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
}
