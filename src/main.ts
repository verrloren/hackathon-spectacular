import {
    Editor,
    MarkdownView,
    Plugin,
    TFile,
    Notice,
    TFolder,
    PluginManifest,
    App,
		TAbstractFile,
} from "obsidian";
import { SettingTab } from "./settings/SettingsTab";
import EventListener from "./event_listener";
import StatusBar from "./status_bar";
import DocumentChangesListener, {
    getPrefix,
    getSuffix,
    hasMultipleCursors,
    hasSelection,
} from "./render_plugin/document_changes_listener";
import { EditorView } from "@codemirror/view";
import RenderSuggestionPlugin from "./render_plugin/render_surgestion_plugin";
import { InlineSuggestionState } from "./render_plugin/states";
import CompletionKeyWatcher from "./render_plugin/completion_key_watcher";
import {
    DEFAULT_SETTINGS,
    Settings,
    settingsSchema,
} from "./settings/versions";
import { SyncManager } from "./sync/SyncManager";
import { SyncStatusBarUpdater } from "./sync/SyncStatusBarUpdater";
import { SyncStatus } from "./sync/SyncStatus";
import { debounce } from "lodash";

export default class SpectacularPlugin extends Plugin {
    settings: Settings;
    settingTab: SettingTab;
    eventListener: EventListener;
    statusBar: StatusBar;
    syncManager: SyncManager;

    private fileExplorerObserver: MutationObserver | null = null;
    private currentSyncStatus: SyncStatus = "disabled";
    private debouncedUpdateIcons: () => void;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
        this.debouncedUpdateIcons = debounce(
            () => this.updateFolderIcons(),
            150
        );
    }

    async onload() {
        await this.loadSettings();
        this.statusBar = StatusBar.fromApp(this);
        const syncStatusBarItem = this.addStatusBarItem();
        syncStatusBarItem.addClass("spectacular-sync-status");

        const syncStatusUpdater = new SyncStatusBarUpdater(
            syncStatusBarItem,
            (status: SyncStatus) => {
              this.currentSyncStatus = status;
              this.debouncedUpdateIcons();
            }
        );

        this.syncManager = new SyncManager(
            this.app,
            this.settings,
            syncStatusUpdater
        );

        this.currentSyncStatus = this.settings.allowedFolder
            ? "idle"
            : "disabled";

        this.eventListener = EventListener.fromSettings(
            this.settings,
            this.statusBar,
            this.app,
            this.syncManager
        );

        this.settingTab = new SettingTab(
					this, 
					async (settingsToSave: Settings) => {
						await this.saveSettings(settingsToSave); 
						this.eventListener.handleSettingChanged(this.settings);
					}
			);
        // this.settingTab.addObserver(this.eventListener);
        this.addSettingTab(this.settingTab);

        this.registerEditorExtension([
            InlineSuggestionState,
            CompletionKeyWatcher(
                this.eventListener.handleAcceptKeyPressed.bind(
                    this.eventListener
                ),
                this.eventListener.handlePartialAcceptKeyPressed.bind(
                    this.eventListener
                ),
                this.eventListener.handleCancelKeyPressed.bind(
                    this.eventListener
                )
            ),
            DocumentChangesListener(
                // Use the default export name
                this.eventListener.handleDocumentChange.bind(this.eventListener)
            ),
            RenderSuggestionPlugin(),
            // Add listener for view updates if needed by EventListener
            EditorView.updateListener.of((update) => {
                if (
                    update.docChanged ||
                    update.selectionSet ||
                    update.focusChanged
                ) {
                    this.eventListener.onViewUpdate(update.view);
                }
            }),
        ]);

        // --- Workspace Event Handlers ---
        this.app.workspace.onLayoutReady(() => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) {
                // @ts-expect-error, not typed
                const editorView = view.editor.cm as EditorView;
								if (editorView) {
									editorView.dom.addEventListener("keydown", (event) => this.eventListener.handleEditorKeyDown(event));
							}
                this.eventListener.onViewUpdate(editorView);
                this.eventListener.handleFileChange(
                    view.file instanceof TFile ? view.file : null
                );
            } else {
                this.eventListener.handleFileChange(null);
            }
            this.observeFileExplorer();
            this.debouncedUpdateIcons();
        });

        this.app.workspace.on("active-leaf-change", (leaf) => {
            if (leaf?.view instanceof MarkdownView) {
                // @ts-expect-error, not typed
                const editorView = leaf.view.editor.cm as EditorView;
                this.eventListener.onViewUpdate(editorView);
                // *** Pass TFile | null ***
                this.eventListener.handleFileChange(
                    leaf.view.file instanceof TFile ? leaf.view.file : null
                );
            } else {
                this.eventListener.handleFileChange(null);
            }
        });

        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (file instanceof TFolder) {
                    const folderPath = file.path;
                    const isCurrentlySyncedFolder =
                        this.settings.allowedFolder === folderPath;



                    if (isCurrentlySyncedFolder) {
											menu.addItem((item) => {
                        item.setTitle("Sync Folder")
                            .setIcon("sync")
                                .onClick(async () => {
                                    new Notice(
                                        `Triggering sync for "${folderPath}".`
                                    );
                                    await this.syncManager.triggerSync();
                                });
                    });

										menu.addItem((item) => {
											item.setTitle("Disconnect Folder")
													.setIcon("unlink")
													.onClick(async () => {
															const folderToDisconnect = this.settings.allowedFolder;
															if (!folderToDisconnect) return;
															new Notice(
																	`Disconnecting sync folder "${folderToDisconnect}".`
															);
															const settingsWithDisconnect = {
																	...this.settings,
																	allowedFolder: undefined 
															};
															await this.saveSettings(settingsWithDisconnect);
															this.settingTab.display();
													});
									});
                    }
                }
            })
        );

				this.registerEvent(
					this.app.vault.on('modify', (file) => {
							this.handleFileModify(file);
					})
			);

			

        // --- Commands ---
        this.addCommand({
            id: "accept",
            name: "Accept",
            editorCheckCallback: (
                checking: boolean,
                editor: Editor,
                view: MarkdownView
            ) => {
                if (checking) {
                    return (
                        this.eventListener.isSuggesting() &&
                        !this.eventListener.isDisabled()
                    );
                }
                this.eventListener.handleAcceptKeyPressed();
                return true;
            },
        });

        this.addCommand({
            id: "predict",
            name: "Predict",
            editorCheckCallback: (
                checking: boolean,
                editor: Editor,
                view: MarkdownView
            ) => {
                // @ts-expect-error, not typed
                const editorView = editor.cm as EditorView;
                const state = editorView.state;
                if (checking) {
                    return (
                        this.eventListener.isIdle() &&
                        !this.eventListener.isDisabled() &&
                        !hasMultipleCursors(state) &&
                        !hasSelection(state)
                    );
                }
                const prefix = getPrefix(state);
                const suffix = getSuffix(state);
                this.eventListener.handlePredictCommand(prefix, suffix);
                return true;
            },
        });

        this.addCommand({
            id: "toggle",
            name: "Toggle Enable/Disable",
            callback: () => {
                const newValue = !this.settings.enabled;
                this.settings.enabled = newValue;
                this.saveSettings().then(() => {
                    this.eventListener.handleSettingChanged(this.settings);
                    new Notice(
                        `Spectacular ${newValue ? "enabled" : "disabled"}.`
                    );
                });
            },
        });

        this.addCommand({
            id: "enable",
            name: "Enable",
            checkCallback: (checking) => {
                if (checking) {
                    return !this.settings.enabled;
                }
                this.settings.enabled = true;
                this.saveSettings().then(() => {
                    this.eventListener.handleSettingChanged(this.settings);
                    new Notice(`Spectacular enabled.`);
                });
                return true;
            },
        });

        this.addCommand({
            id: "disable",
            name: "Disable",
            checkCallback: (checking) => {
                // *** Access settings via this.settings ***
                if (checking) {
                    return this.settings.enabled;
                }
                // *** Update settings directly and save/notify ***
                this.settings.enabled = false;
                this.saveSettings().then(() => {
                    this.eventListener.handleSettingChanged(this.settings);
                    new Notice(`Spectacular disabled.`);
                });
                return true;
            },
        });

        // *** Add Sync Command ***
        this.addCommand({
            id: "spectacular-sync-allowed-folder",
            name: "Sync Allowed Folder",
            callback: () => {
                this.syncManager.triggerSync();
            },
        });

        // --- Initial Sync Trigger on Load ---
        // if (this.settings.allowedFolder) {
        //     console.log("[main] Triggering initial sync on load.");
        //     setTimeout(() => this.syncManager.triggerSync(), 1500);
        // }

        console.log("Spectacular plugin loaded.");
    }

		private handleFileModify(file: TAbstractFile) {
			if (!(file instanceof TFile)) {
					return;
			}

			const allowedFolder = this.settings.allowedFolder;
			if (allowedFolder && file.path.startsWith(allowedFolder + (allowedFolder === '/' ? '' : '/'))) {
				this.syncManager.notifyFileModified();
			}
	}

    observeFileExplorer() {
        this.fileExplorerObserver?.disconnect();
        const fileExplorer = this.app.workspace.containerEl.querySelector(
            ".nav-files-container"
        );
        if (!fileExplorer) {
            console.warn(
                "Spectacular: Could not find file explorer container to observe."
            );
            return;
        }
        this.fileExplorerObserver = new MutationObserver((mutations) => {
            let needsUpdate = false;
            for (const mutation of mutations) {
                if (
                    mutation.type === "childList" &&
                    (mutation.addedNodes.length > 0 ||
                        mutation.removedNodes.length > 0)
                ) {
                    needsUpdate = true;
                    break;
                }
            }
            if (needsUpdate) {
                this.debouncedUpdateIcons();
            }
        });
        this.fileExplorerObserver.observe(fileExplorer, {
            childList: true,
            subtree: true,
        });
    }

    updateFolderIcons() {
			const allowedFolderPath = this.settings.allowedFolder;
			const status = this.currentSyncStatus;
			const folderNameTextSelector = ".nav-folder-title-content";
			const folderTitleRowSelector = ".nav-folder-title";
			const pathAttributeName = "data-path";

			console.log(`[updateFolderIcons] START. Allowed: '${allowedFolderPath}', Status: '${status}'`);

			const folderTitleContents =
					this.app.workspace.containerEl.querySelectorAll(folderNameTextSelector);

			if (folderTitleContents.length === 0) {
					console.warn(`[updateFolderIcons] WARN: No elements found with selector: ${folderNameTextSelector}`);
					return;
			} else {
					console.log(`[updateFolderIcons] Found ${folderTitleContents.length} elements.`);
			}

			folderTitleContents.forEach((contentEl, index) => {
					const folderTitleEl = contentEl.closest(folderTitleRowSelector) as HTMLElement | null;
					const folderPath = folderTitleEl?.getAttribute(pathAttributeName);

					console.log(`[updateFolderIcons] Processing Element ${index}: Path='${folderPath ?? 'null'}'`);

					const previousClasses = Array.from(contentEl.classList).filter(c => c.startsWith('spectacular-sync-indicator'));

					contentEl.classList.remove(
							"spectacular-sync-indicator",
							"spectacular-sync-indicator-synced",
							"spectacular-sync-indicator-syncing",
							"spectacular-sync-indicator-error"
					);
					if (previousClasses.length > 0) {
							console.log(`[updateFolderIcons] Element ${index} ('${folderPath}'): REMOVED classes: ${previousClasses.join(', ')}`);
					}


					if (folderPath && folderPath === allowedFolderPath) {
							console.log(`[updateFolderIcons] Element ${index} ('${folderPath}'): MATCH FOUND. Applying base class and status class for '${status}'.`);
							contentEl.classList.add("spectacular-sync-indicator");

							if (status === "synced") {
									contentEl.classList.add("spectacular-sync-indicator-synced");
							} else if (status === "syncing") {
									contentEl.classList.add("spectacular-sync-indicator-syncing");
							} else if (status === "error") {
									contentEl.classList.add("spectacular-sync-indicator-error");
							}
							console.log(`[updateFolderIcons] Element ${index} ('${folderPath}'): Current classes after add: ${Array.from(contentEl.classList).join(', ')}`);
					} else {
							console.log(`[updateFolderIcons] Element ${index} ('${folderPath}'): No match.`);
					}
			});
			console.log(`[updateFolderIcons] END.`);
	}

    async loadSettings(): Promise<void> {
        const loadedData = await this.loadData();
        if (loadedData) {
					try {
							console.log("[main] Parsing loaded data with schema...");
							this.settings = settingsSchema.parse(loadedData);
							console.log("[main] Settings parsed successfully:", this.settings);
					} catch (e) {
							console.error(
									"Spectacular: Error parsing settings, falling back to defaults.",
									e
							);
							new Notice(
									"Spectacular: Settings were corrupted and have been reset to default."
							);
							this.settings = DEFAULT_SETTINGS;
							console.log("[main] Using default settings:", this.settings);
							await this.saveSettings();
							console.log("[main] Default settings saved.");
					}
			} else {
					console.log("[main] No settings data found. Using default settings.");
					this.settings = DEFAULT_SETTINGS;
					console.log("[main] Using default settings:", this.settings);
			}
    }

    async saveSettings(settingsToSave?: Settings): Promise<void> {
			const previousFolder = this.settings.allowedFolder;

			if (settingsToSave) {
					console.log("[main] Updating internal settings from settingsToSave.");
					this.settings = settingsToSave;
			} else {
					console.log("[main] saveSettings called without new settings object (e.g., from command).");
			}

			console.log("[main] Saving settings:", this.settings);
			await this.saveData(this.settings);
			console.log("[main] Settings saved to data.json.");

			if (previousFolder !== this.settings.allowedFolder) {
					console.log(`[main] Allowed folder changed ('${previousFolder}' -> '${this.settings.allowedFolder}'). Scheduling immediate icon update.`);
					setTimeout(() => {
							console.log("[main] Executing scheduled immediate icon update.");
							this.updateFolderIcons();
					}, 0);
			} else {
					console.log(`[main] Allowed folder did not change ('${previousFolder}'). No immediate icon update scheduled.`);
			}
	}


    async onunload() {
			this.fileExplorerObserver?.disconnect();
      if (this.eventListener) {
          await this.eventListener.cleanup();
      }
    }
}
