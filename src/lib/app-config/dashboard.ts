export interface DashboardSnapshot {
  users: number;
  activeUsers: number;
  records: number;
  storageBytes: number;
  aiRequests: number;
  errors: number;
  currentRelease: number | null;
  updatedAt: string;
}

export interface DashboardMetricCard {
  key: keyof Omit<DashboardSnapshot, "updatedAt">;
  label: string;
  value: string;
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

export function dashboardCards(snapshot: DashboardSnapshot): DashboardMetricCard[] {
  return [
    { key: "users", label: "Пользователи", value: String(snapshot.users) },
    { key: "activeUsers", label: "Активны сегодня", value: String(snapshot.activeUsers) },
    { key: "records", label: "Записи", value: String(snapshot.records) },
    { key: "storageBytes", label: "Файлы", value: formatStorageBytes(snapshot.storageBytes) },
    { key: "aiRequests", label: "Запросы ИИ", value: String(snapshot.aiRequests) },
    { key: "errors", label: "Ошибки", value: String(snapshot.errors) },
    { key: "currentRelease", label: "Текущая версия", value: snapshot.currentRelease ? `v${snapshot.currentRelease}` : "—" },
  ];
}