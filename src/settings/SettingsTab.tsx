import {PluginSettingTab, TFolder, Notice} from "obsidian"; // Added Notice, App
import {createRoot, Root} from "react-dom/client";
import SettingsView from "./SettingsView";
import * as React from "react";
import {Settings} from "./versions";
import {checkForErrors} from "./utils";
// *** Import your specific plugin class ***
import SpectacularPlugin from "../main";

// Remove observer interface if not used elsewhere
// export interface SettingsObserver {
//     handleSettingChanged(settings: Settings): void;
// }

// Type for the save callback passed from main.ts
type SaveCallback = (settings: Settings) => Promise<void>;


export class SettingTab extends PluginSettingTab {
    // Settings are accessed via this.plugin.settings
    private updatedSettingsBuffer: Partial<Settings> | undefined = undefined; // Buffer for non-folder changes
    // private observers: SettingsObserver[] = []; // Remove if not used
    private root: Root | undefined = undefined;
    private saveCallback: SaveCallback;
    // *** Change the type here ***
    private plugin: SpectacularPlugin;

    // Remove static factory method if main.ts handles instantiation
    // public static addSettingsTab(...)

    public constructor(
        // *** Change the type here ***
        plugin: SpectacularPlugin,
        saveCallback: SaveCallback
    ) {
        super(plugin.app, plugin); // Use plugin.app
        this.plugin = plugin;
        this.saveCallback = saveCallback;
    }

    // Remove addObserver if not used
    // public addObserver(observer: SettingsObserver): void { ... }

    // Remove setEnable if commands handle it directly in main.ts
    // public setEnable(enabled: boolean): void { ... }

    // Remove updateObservers if not used (notification happens in main.ts callback)
    // private updateObservers(): void { ... }

    display(): void {
            this.containerEl.empty();
      this.root = createRoot(this.containerEl);

            const vaultFolders = this.app.vault.getAllLoadedFiles()
                .filter((file): file is TFolder => file instanceof TFolder)
                .map(folder => folder.path)
                .sort();

      this.root.render(
          <React.StrictMode>
              <SettingsView
                  onSettingsChanged={(changedSettings) => {
                      this.updatedSettingsBuffer = changedSettings;
                  }}
                  onFolderChanged={async (newFolder) => {
										if (this.plugin.settings.allowedFolder === newFolder) return; // No change

										console.log(`[SettingTab] Folder changed to: ${newFolder ?? 'None'}`);
										new Notice(`Spectacular: Allowed folder set to "${newFolder ?? 'All Folders'}".`);

										const settingsWithNewFolder = {
												...this.plugin.settings, 
												allowedFolder: newFolder 
										};
										await this.saveCallback(settingsWithNewFolder);
								}}
                  // Pass the plugin's current, authoritative settings
                  settings={this.plugin.settings} // *** Now this is valid ***
                  availableFolders={vaultFolders}
              />
          </React.StrictMode>
        );
    }


    hide(): void {
        // Process buffered changes for non-folder settings when tab closes
        if (this.updatedSettingsBuffer) {
            const otherUpdates = { ...this.updatedSettingsBuffer };
            delete otherUpdates.allowedFolder;

            let otherSettingsChanged = false;
            for (const key in otherUpdates) {
                 // *** Now this.plugin.settings is valid ***
                if (otherUpdates[key as keyof Settings] !== this.plugin.settings[key as keyof Settings]) {
                    otherSettingsChanged = true;
                    break;
                }
            }

            if (otherSettingsChanged) {
                 console.log("[SettingTab] Saving other setting changes on hide.");
                 // Apply the other changes to the plugin's settings
                 // *** Now this.plugin.settings is valid ***
                 this.plugin.settings = { ...this.plugin.settings, ...otherUpdates };

                 const errors = checkForErrors(this.plugin.settings);
                 if (errors.size > 0) {
                     new Notice("Spectacular: Some settings have errors and might not work correctly.");
                 }
                 // Save the merged settings using the callback from main.ts
                 this.saveCallback(this.plugin.settings);
            }
            this.updatedSettingsBuffer = undefined;
        }

        if (this.root) {
            this.root.unmount();
            this.root = undefined;
        }
        super.hide();
    }
}