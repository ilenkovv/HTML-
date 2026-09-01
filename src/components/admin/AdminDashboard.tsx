import { dashboardCards, type DashboardSnapshot } from "../../lib/app-config/dashboard";

export interface AdminDashboardProps {
  snapshot: DashboardSnapshot;
  recentActivity?: Array<{ id: string; label: string; detail?: string; at: string }>;
}

export function AdminDashboard({ snapshot, recentActivity = [] }: AdminDashboardProps) {
  const cards = dashboardCards(snapshot);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Дашборд</h2>
        <p className="mt-1 text-sm text-muted-foreground">Состояние приложения и последние действия.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.key} className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">{card.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3 font-medium">Последние действия</div>
        {recentActivity.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">Событий пока нет.</div>
        ) : (
          <div className="divide-y">
            {recentActivity.slice(0, 20).map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{item.label}</div>
                  {item.detail && <div className="mt-0.5 text-muted-foreground">{item.detail}</div>}
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">{item.at}</time>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}