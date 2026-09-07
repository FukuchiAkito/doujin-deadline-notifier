"use client";

import { useEffect, useMemo, useState } from "react";
import { Deadline, Progress, progressLabels, progressOptions, Watch } from "@/lib/domain";

type ApiResponse<T> = { data: T };

async function requestJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: { message?: string } } | undefined;
    throw new Error(body?.error?.message ?? "通信に失敗しました");
  }
  return (await response.json()) as T;
}

async function loadDashboardData() {
  const [deadlines] = await Promise.all([
    requestJson<ApiResponse<Deadline[]>>("/api/v1/deadlines"),
    requestJson("/api/v1/session", { method: "POST", body: "{}" }),
  ]);
  const watches = await requestJson<ApiResponse<Watch[]>>("/api/v1/watches");
  return { deadlines: deadlines.data, watches: watches.data };
}

function formatDeadline(date: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function remainingDays(deadlineAt: string) {
  return Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 86_400_000);
}

export function DeadlineDashboard({ vapidPublicKey }: { vapidPublicKey?: string }) {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string>();
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const watchByDeadlineId = useMemo(
    () => new Map(watches.map((watch) => [watch.deadlineId, watch])),
    [watches],
  );

  useEffect(() => {
    let active = true;
    void loadDashboardData()
      .then((data) => {
        if (!active) return;
        setDeadlines(data.deadlines);
        setWatches(data.watches);
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : "読み込みに失敗しました");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function addWatch(deadlineId: string) {
    try {
      const result = await requestJson<ApiResponse<Watch>>("/api/v1/watches", {
        method: "POST",
        body: JSON.stringify({ deadlineId }),
      });
      setWatches((current) => [...current.filter((watch) => watch.deadlineId !== deadlineId), result.data]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "監視対象に追加できませんでした");
    }
  }

  async function updateWatch(deadlineId: string, values: Partial<Watch>) {
    try {
      const result = await requestJson<ApiResponse<Watch>>(`/api/v1/watches/${encodeURIComponent(deadlineId)}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setWatches((current) => current.map((watch) => watch.deadlineId === deadlineId ? result.data : watch));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "進捗を更新できませんでした");
    }
  }

  async function removeWatch(deadlineId: string) {
    try {
      const response = await fetch(`/api/v1/watches/${encodeURIComponent(deadlineId)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("監視を解除できませんでした");
      setWatches((current) => current.filter((watch) => watch.deadlineId !== deadlineId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "監視を解除できませんでした");
    }
  }

  async function enablePush() {
    if (!vapidPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setMessage("このブラウザでは通知を有効にできません。");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("通知の許可が必要です。");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey,
      });
      await requestJson("/api/v1/push-subscriptions", {
        method: "POST",
        body: JSON.stringify(subscription),
      });
      setIsPushEnabled(true);
      setMessage("このブラウザで締切通知を有効にしました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "通知を有効にできませんでした");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-10 sm:px-8">
      <header className="flex flex-col gap-5 rounded-3xl bg-[var(--ink)] p-7 text-white shadow-lg sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium tracking-[0.16em] text-orange-200">DOUJIN DEADLINE NOTIFIER</p>
          <h1 className="text-3xl font-bold tracking-tight">入稿締切を、見落とさない。</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">オレンジ工房の公開締切情報を確認し、作業の進捗と通知をこのブラウザで管理します。</p>
        </div>
        <button className="button-secondary" onClick={() => void enablePush()} type="button" disabled={!vapidPublicKey || isPushEnabled}>
          {isPushEnabled ? "通知を有効化済み" : "締切通知を有効にする"}
        </button>
      </header>

      {message && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</p>}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="summary-card"><span>監視中</span><strong>{watches.length}</strong><small>このブラウザ</small></div>
        <div className="summary-card"><span>入稿済み</span><strong>{watches.filter((watch) => watch.progress === "submitted").length}</strong><small>進捗を更新できます</small></div>
        <div className="summary-card"><span>通知</span><strong>{isPushEnabled ? "ON" : "OFF"}</strong><small>7・3・1日前</small></div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <div><p className="eyebrow">OFFICIAL DEADLINES</p><h2 className="text-xl font-bold text-slate-900">オレンジ工房 締切一覧</h2></div>
          <a className="text-sm font-medium text-orange-700 underline underline-offset-4" href="https://www.orangekoubou.com/schedule/schedule_event.php" target="_blank" rel="noreferrer">公式ページを確認</a>
        </div>
        {isLoading ? <p className="text-sm text-slate-500">締切情報を読み込み中です…</p> : (
          <div className="grid gap-4">
            {deadlines.map((deadline) => {
              const watch = watchByDeadlineId.get(deadline.id);
              const remaining = remainingDays(deadline.deadlineAt);
              return (
                <article className="deadline-card" key={deadline.id}>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap gap-2"><span className="tag">{deadline.eventDate}</span><span className={remaining <= 3 ? "tag tag-urgent" : "tag"}>{remaining >= 0 ? `あと${remaining}日` : "締切済み"}</span></div>
                    <h3>{deadline.eventName}</h3><p className="mt-1 text-sm text-slate-600">{deadline.label}</p>
                    {deadline.deadlineCondition && <p className="mt-1 text-xs text-slate-500">条件: {deadline.deadlineCondition}</p>}
                    {deadline.deliveryLabel && <p className="mt-1 text-xs text-slate-500">{deadline.deliveryLabel}</p>}
                    {deadline.rowLabel && <details className="mt-2 text-xs leading-5 text-slate-500"><summary className="cursor-pointer">対象商品・公式の注意事項</summary><p>{deadline.rowLabel}</p></details>}
                    {deadline.notes && <p className="mt-3 text-xs leading-5 text-slate-500">注意: {deadline.notes}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
                    <time>{formatDeadline(deadline.deadlineAt)}</time>
                    {!watch ? <button className="button-primary" type="button" onClick={() => void addWatch(deadline.id)}>監視する</button> : <div className="flex flex-wrap items-center gap-2"><select aria-label="進捗" value={watch.progress} onChange={(event) => void updateWatch(deadline.id, { progress: event.target.value as Progress })}>{progressOptions.map((progress) => <option key={progress} value={progress}>{progressLabels[progress]}</option>)}</select><button className="button-quiet" type="button" onClick={() => void removeWatch(deadline.id)}>解除</button></div>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <p className="pb-6 text-xs leading-5 text-slate-500">締切は公式情報を定期確認した参考情報です。部数、ページ数、加工、納品方法などで変動するため、入稿前に必ず公式ページを確認してください。</p>
    </main>
  );
}
