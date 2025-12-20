import { createBaseStore, type RequestStatus } from "@/stores/base";

export type Settings = Record<string, unknown>;

export type SettingsDraft = Partial<Settings>;

const initial = {
  list: [] as Settings[],
  filters: {} as Record<string, unknown>,
  sort: null,
  pagination: { page: 1, pageSize: 10, total: 0 },
  currentId: null as number | string | null,
  current: null as Settings | null,
  draft: null as SettingsDraft | null,
  mode: null,
  request: {
    detail: "idle" as RequestStatus,
    save: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

export const useSettingsStore = createBaseStore<Settings, SettingsDraft>(initial);
