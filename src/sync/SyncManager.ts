import { App, Notice } from "obsidian";
import { Settings } from "../settings/versions";
import { SyncStatus } from "./SyncStatus";
import { SyncStatusBarUpdater } from "./SyncStatusBarUpdater";
import { FileSyncTask } from "./FileSyncTask";

export class SyncManager {
    private app: App;
    private settings: Settings;
    private statusUpdater: SyncStatusBarUpdater;
    private currentStatus: SyncStatus = "disabled";
    private isSyncing = false;

    constructor(app: App, initialSettings: Settings, statusUpdater: SyncStatusBarUpdater) {
        this.app = app;
        this.settings = initialSettings;
        this.statusUpdater = statusUpdater;
        this.setStatus(this.settings.allowedFolder ? "idle" : "disabled");
    }


    private setStatus(newStatus: SyncStatus): void {
        if (this.currentStatus === newStatus) return; // Avoid redundant updates
        this.currentStatus = newStatus;
        console.log(`[SyncManager] Status changed to: ${newStatus}`);
        this.statusUpdater.update(this.currentStatus, this.settings.allowedFolder);
    }

    public updateSettings(newSettings: Settings): void {
        const oldFolder = this.settings.allowedFolder;
        this.settings = newSettings;

        if (oldFolder !== newSettings.allowedFolder) {
            console.log(`[SyncManager] Allowed folder setting changed from '${oldFolder ?? 'None'}' to '${newSettings.allowedFolder ?? 'None'}'`);
            if (this.isSyncing) {
                // TODO: Implement cancellation logic if needed for the FileSyncTask
                console.warn("[SyncManager] Setting changed during sync. Sync will continue but status might reset after.");
                // Optionally, attempt to cancel the ongoing sync here if FileSyncTask supports it.
            }

            if (newSettings.allowedFolder) {
                // A folder is now selected or changed
                this.setStatus("idle"); // Reset status to idle before starting
                this.triggerSync(); // Automatically trigger sync for the new/selected folder
            } else {
                // No folder is selected anymore
                this.setStatus("disabled");
            }
        }
        // Note: Other setting changes (like 'enabled') are handled by EventListener
        // This manager only cares about the allowedFolder for triggering sync.
    }

    /**
     * Initiates the sync process for the currently configured allowedFolder.
     * Handles checks for folder selection and ongoing syncs.
     */
    public async triggerSync(): Promise<void> {
        if (!this.settings.allowedFolder) {
            new Notice("Cannot sync: No 'Allowed Folder' selected in Spectacular settings.");
            this.setStatus("disabled"); // Ensure status reflects this
            return;
        }
        if (this.isSyncing) {
            new Notice("Sync already in progress.");
            return;
        }

        this.isSyncing = true;
        this.setStatus("syncing");
        new Notice(`Starting sync for folder: ${this.settings.allowedFolder}`);
        console.log(`[SyncManager] Starting sync process for folder: ${this.settings.allowedFolder}`);

        try {
            // Create and run the task responsible for finding and "syncing" files
            const syncTask = new FileSyncTask(this.app, this.settings.allowedFolder);
            await syncTask.run(); // This performs the dummy sync logic

            // Check if we are still supposed to be syncing (e.g., settings didn't change mid-sync)
            if (this.isSyncing) {
                this.setStatus("synced");
                new Notice(`Sync complete for folder: ${this.settings.allowedFolder}`);
                console.log(`[SyncManager] Sync process completed successfully for folder: ${this.settings.allowedFolder}`);
            } else {
                 console.log(`[SyncManager] Sync task finished, but manager state indicates it's no longer syncing (likely due to setting change or cancellation). Status not set to 'synced'.`);
            }

        } catch (error) {
            console.error(`[SyncManager] Sync process failed:`, error);
             // Check if we are still supposed to be syncing
            if (this.isSyncing) {
                this.setStatus("error");
                new Notice(`Sync failed: ${error.message}`);
            } else {
                 console.log(`[SyncManager] Sync task failed, but manager state indicates it's no longer syncing.`);
            }
        } finally {
            // Always ensure isSyncing is reset
            this.isSyncing = false;

            // Fallback: If the status somehow remained 'syncing' after the try/catch/finally,
            // reset it to 'idle' to avoid getting stuck. This shouldn't normally happen
            // if the try/catch correctly sets 'synced' or 'error'.
            if (this.currentStatus === "syncing") {
                 console.warn("[SyncManager] Sync process ended, but status was left as 'syncing'. Resetting to 'idle'.");
                 this.setStatus("idle");
            }
        }
    }

    /**
     * Returns the current sync status.
     */
    public getCurrentStatus(): SyncStatus {
        return this.currentStatus;
    }
}