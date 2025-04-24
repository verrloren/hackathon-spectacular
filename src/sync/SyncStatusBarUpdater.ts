/* eslint-disable @typescript-eslint/no-explicit-any */
import { SyncStatus } from "./SyncStatus"; // Import SyncStatus

// *** Add type for the callback function ***
type StatusChangeCallback = (status: SyncStatus) => void;

export class SyncStatusBarUpdater {
    private statusBarItem: HTMLElement;
    // *** Add callback property ***
    private onStatusChange: StatusChangeCallback;

    // *** Update constructor to accept the callback ***
    constructor(statusBarItem: HTMLElement, onStatusChange: StatusChangeCallback) {
        this.statusBarItem = statusBarItem;
        this.onStatusChange = onStatusChange;
    }

    public update(status: SyncStatus, folderPath: string | undefined): void {
        let icon = "sync"; // Default/idle
        let text = folderPath ? ` ${folderPath.split('/').pop()}` : " No folder"; // Show last part of path or "No folder"
        let tooltip = folderPath ? `Sync: ${folderPath}` : "Sync: No folder selected";
        let spin = false;

        switch (status) {
            case "disabled":
                icon = "ban"; // Use 'ban' icon for disabled/no folder
                text = " No folder";
                tooltip = "Sync: Select a folder to sync";
                break;
            case "idle":
                icon = "sync"; // Standard sync icon for idle but configured
                tooltip += " (Idle)";
                break;
            case "syncing":
                icon = "refresh-cw"; // Use rotating arrow for syncing
                tooltip += " (Syncing...)";
                spin = true;
                break;
            case "synced":
                icon = "check"; // Checkmark for synced
                tooltip += " (Synced)";
                break;
            case "error":
                icon = "alert-circle"; // Warning icon for error
                tooltip += " (Error)";
                break;
        }

        this.statusBarItem.empty(); // Clear previous content
        const iconEl = this.statusBarItem.createEl("span", { cls: "sync-icon" });
        // Use setIcon from Obsidian API if available, otherwise set class for Lucide icons
        // Assuming you have access to 'setIcon' helper or use classes directly
        if (typeof (this.statusBarItem as any).setIcon === 'function') {
             (this.statusBarItem as any).setIcon(icon); // If setIcon helper exists
        } else {
             iconEl.addClass(`lucide-${icon}`); // Use Lucide class names
        }

        if (spin) {
            iconEl.addClass("spin"); // Add spin class if needed (ensure CSS for .spin exists)
        }
        this.statusBarItem.createEl("span", { text: text });
        this.statusBarItem.setAttribute("aria-label", tooltip);
        this.statusBarItem.setAttribute("data-tooltip-position", "top");

        // *** Call the callback to notify main plugin ***
        this.onStatusChange(status);
    }
}
