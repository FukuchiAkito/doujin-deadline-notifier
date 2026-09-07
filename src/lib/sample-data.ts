import { Deadline, PRINT_SHOP_ID } from "@/lib/domain";

export const sampleDeadlines: Deadline[] = [
  {
    id: "orange-koubou-20260913-4-business-days",
    printShopId: PRINT_SHOP_ID,
    eventName: "TOKYO FES Sep. 2026 / 文学フリマ大阪14",
    eventDate: "2026-09-13",
    label: "4営業日仕上げ冊子（76P以下）",
    deadlineAt: "2026-09-08T10:00:00+09:00",
    sourceUrl: "https://www.orangekoubou.com/schedule/schedule_event20260913.php",
    notes: "80P以上、PP加工、オプション利用時は締切が異なります。",
    fetchedAt: "2026-09-07T00:00:00+09:00",
  },
  {
    id: "orange-koubou-20260913-5-business-days",
    printShopId: PRINT_SHOP_ID,
    eventName: "TOKYO FES Sep. 2026 / 文学フリマ大阪14",
    eventDate: "2026-09-13",
    label: "5営業日仕上げ冊子（76P以下）",
    deadlineAt: "2026-09-07T10:00:00+09:00",
    sourceUrl: "https://www.orangekoubou.com/schedule/schedule_event20260913.php",
    notes: "80P以上、PP加工、オプション利用時は締切が異なります。",
    fetchedAt: "2026-09-07T00:00:00+09:00",
  },
  {
    id: "orange-koubou-20260920-4-business-days",
    printShopId: PRINT_SHOP_ID,
    eventName: "けもケット17",
    eventDate: "2026-09-20",
    label: "4営業日仕上げ冊子",
    deadlineAt: "2026-09-15T10:00:00+09:00",
    sourceUrl: "https://www.orangekoubou.com/schedule/schedule_event.php",
    fetchedAt: "2026-09-07T00:00:00+09:00",
  },
];
