export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "disabled";

export type StatusChangeCallback = (status: SyncStatus) => void;