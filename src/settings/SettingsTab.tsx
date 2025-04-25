import {PluginSettingTab, TFolder, Notice} from "obsidian"; 
import {createRoot, Root} from "react-dom/client";
import SettingsView from "./SettingsView";
import * as React from "react";
import {Settings} from "./versions";
import {checkForErrors} from "./utils";
import SpectacularPlugin from "../main";


type SaveCallback = (settings: Settings) => Promise<void>;


export class SettingTab extends PluginSettingTab {
    private updatedSettingsBuffer: Partial<Settings> | undefined = undefined; // Buffer for non-folder changes
    private root: Root | undefined = undefined;
    private saveCallback: SaveCallback;
    private plugin: SpectacularPlugin;


    public constructor(
        plugin: SpectacularPlugin,
        saveCallback: SaveCallback
    ) {
        super(plugin.app, plugin); 
        this.plugin = plugin;
        this.saveCallback = saveCallback;
    }

    display(): void {
      this.containerEl.empty();
      this.root = createRoot(this.containerEl);

      const vaultFolders = this.app.vault.getAllLoadedFiles()
				.filter((file): file is TFolder => file instanceof TFolder && file.path !== "/")
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
								settings={this.plugin.settings}
                availableFolders={vaultFolders}
              />
          </React.StrictMode>
        );
    }


    hide(): void {
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
                 this.plugin.settings = { ...this.plugin.settings, ...otherUpdates };

                 const errors = checkForErrors(this.plugin.settings);
                 if (errors.size > 0) {
                     new Notice("Spectacular: Some settings have errors and might not work correctly.");
                 }
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