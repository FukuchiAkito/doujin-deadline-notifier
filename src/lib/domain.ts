export const PRINT_SHOP_ID = "orange-koubou";

export type Progress = "not_started" | "in_progress" | "submitted";

export type Deadline = {
  id: string;
  printShopId: typeof PRINT_SHOP_ID;
  eventName: string;
  eventDate: string;
  label: string;
  deadlineCondition?: string;
  deliveryLabel?: string;
  rowLabel?: string;
  deadlineAt: string;
  sourceUrl: string;
  notes?: string;
  fetchedAt: string;
};

export type Watch = {
  deadlineId: string;
  progress: Progress;
  notifyEnabled: boolean;
  updatedAt: string;
};

export const progressLabels: Record<Progress, string> = {
  not_started: "未着手",
  in_progress: "作業中",
  submitted: "入稿済み",
};

export const progressOptions = Object.keys(progressLabels) as Progress[];
