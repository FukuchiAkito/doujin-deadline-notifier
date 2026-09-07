export const config = {
  awsRegion: process.env.AWS_REGION ?? "ap-northeast-1",
  deadlinesTable: process.env.DEADLINES_TABLE,
  userDataTable: process.env.USER_DATA_TABLE,
  sessionsTable: process.env.SESSIONS_TABLE,
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  appOrigin: process.env.APP_ORIGIN,
};

export const hasDynamoConfiguration = Boolean(
  config.deadlinesTable && config.userDataTable && config.sessionsTable,
);
