import { App, Notice } from "obsidian";
import { Settings } from "../settings/versions";
import { SyncStatus } from "./SyncStatus";
import { SyncStatusBarUpdater } from "./SyncStatusBarUpdater";
import { FileSyncTask } from "./FileSyncTask";

export class SyncManager {
    private app: App;
    private settings: Settings;
    private isSyncing = false;
    private statusUpdater: SyncStatusBarUpdater;
    private currentStatus: SyncStatus = "disabled";

    constructor(app: App, initialSettings: Settings, statusUpdater: SyncStatusBarUpdater) {
      this.app = app;
      this.settings = initialSettings;
      this.statusUpdater = statusUpdater;
			this.currentStatus = this.settings.allowedFolder ? "idle" : "disabled";
      this.updateStatus(this.currentStatus);
    }


    private setStatus(newStatus: SyncStatus): void {
        if (this.currentStatus === newStatus) return;
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
            }
						this.updateStatus(newSettings.allowedFolder ? "idle" : "disabled");
            if (newSettings.allowedFolder) {
                this.setStatus("idle");
                this.triggerSync(); 
            } else {
                this.setStatus("disabled");
            }
        }
    }


    public async triggerSync(): Promise<void> {
        if (!this.settings.allowedFolder) {
            new Notice("Cannot sync: No 'Allowed Folder' selected in Spectacular settings.");
            this.setStatus("disabled");
            return;
        }
        if (this.isSyncing) {
            new Notice("Sync already in progress.");
            return;
        }

        this.isSyncing = true;
        this.updateStatus("syncing");
        new Notice(`Starting sync for folder: ${this.settings.allowedFolder}`);
        console.log(`[SyncManager] Starting sync process for folder: ${this.settings.allowedFolder}`);

        try {
            const syncTask = new FileSyncTask(this.app, this.settings.allowedFolder);
            await syncTask.run();

            if (this.isSyncing) {
                this.updateStatus("synced");
                new Notice(`Sync complete for folder: ${this.settings.allowedFolder}`);
                console.log(`[SyncManager] Sync process completed successfully for folder: ${this.settings.allowedFolder}`);
            } else {
                 console.log(`[SyncManager] Sync task finished, but manager state indicates it's no longer syncing (likely due to setting change or cancellation). Status not set to 'synced'.`);
            }

        } catch (error) {
            console.error(`[SyncManager] Sync process failed:`, error);
            if (this.isSyncing) {
                this.setStatus("error");
                new Notice(`Sync failed: ${error.message}`);
            } else {
                 console.log(`[SyncManager] Sync task failed, but manager state indicates it's no longer syncing.`);
            }
        } finally {
            this.isSyncing = false;

            if (this.currentStatus === "syncing") {
              console.warn("[SyncManager] Sync process ended, but status was left as 'syncing'. Resetting to 'idle'.");
              this.updateStatus("idle");
            }
        }
    }

		public notifyFileModified(): void {
			console.log("[SyncManager] Notified of file modification in allowed folder.");
			if (this.currentStatus === "synced") {
					console.log("[SyncManager] Status was 'synced', changing to 'idle'.");
					this.updateStatus("idle");
			}
	}

	private updateStatus(newStatus: SyncStatus): void {
		if (this.currentStatus === newStatus) return;

		console.log(`[SyncManager] Status changed from '${this.currentStatus}' to: ${newStatus}`);
		this.currentStatus = newStatus;
		this.statusUpdater.update(this.currentStatus, this.settings.allowedFolder);
}


    public getCurrentStatus(): SyncStatus {
        return this.currentStatus;
    }
}