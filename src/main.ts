import {
    Editor,
    MarkdownView,
    Plugin,
    TFile,
    Notice,
    TFolder,
    PluginManifest,
    App,
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
            this.settings,
            this.saveSettings.bind(this)
        );
        this.settingTab.addObserver(this.eventListener);
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
                this.eventListener.onViewUpdate(editorView);
                // Initial file check on layout ready
                // *** Pass TFile | null ***
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

                    menu.addItem((item) => {
                        item.setTitle("Sync Folder")
                            .setIcon("sync")
                            .onClick(async () => {
                                if (
                                    this.settings.allowedFolder === folderPath
                                ) {
                                    new Notice(
                                        `Folder "${folderPath}" is already selected. Triggering sync.`
                                    );
                                    await this.syncManager.triggerSync();
                                } else {
                                    new Notice(
                                        `Setting "${folderPath}" as sync folder and starting sync.`
                                    );
                                    this.settings.allowedFolder = folderPath;
                                    await this.saveSettings();
                                    this.eventListener.handleSettingChanged(
                                        this.settings
                                    );
                                    this.debouncedUpdateIcons();
                                    this.settingTab.display();
                                }
                            });
                    });

                    if (isCurrentlySyncedFolder) {
                        menu.addItem((item) => {
                            item.setTitle("Disconnect Folder")
                                .setIcon("unlink")
                                .onClick(async () => {
                                    new Notice(
                                        `Disconnecting sync folder "${folderPath}".`
                                    );
                                    this.settings.allowedFolder = undefined;
                                    await this.saveSettings();
                                    this.eventListener.handleSettingChanged(
                                        this.settings
                                    );
                                    this.settingTab.display();
                                });
                        });
                    }
                }
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
        if (this.settings.allowedFolder) {
            console.log("[main] Triggering initial sync on load.");
            setTimeout(() => this.syncManager.triggerSync(), 1500);
        }

        console.log("Spectacular plugin loaded.");
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

        const folderTitleContents =
            this.app.workspace.containerEl.querySelectorAll(
                ".nav-folder-title-content"
            );

        folderTitleContents.forEach((contentEl) => {
            const folderTitleEl = contentEl.closest(".nav-folder-title") as HTMLElement | null;
            const folderPath = folderTitleEl?.dataset.path;

            contentEl.classList.remove(
                "spectacular-sync-indicator",
                "spectacular-sync-indicator-synced",
                "spectacular-sync-indicator-syncing",
                "spectacular-sync-indicator-error"
            );

            if (folderPath && folderPath === allowedFolderPath) {
                contentEl.classList.add("spectacular-sync-indicator");

                if (status === "synced") {
                    contentEl.classList.add(
                        "spectacular-sync-indicator-synced"
                    );
                } else if (status === "syncing") {
                    contentEl.classList.add(
                        "spectacular-sync-indicator-syncing"
                    );
                } else if (status === "error") {
                    contentEl.classList.add("spectacular-sync-indicator-error");
                }
            }
        });
    }

    async saveSettings(): Promise<void> {
        const previousFolder = this.settings.allowedFolder;
        await this.saveData(this.settings);
        if (previousFolder !== this.settings.allowedFolder) {
            this.debouncedUpdateIcons();
        }
    }

    async loadSettings(): Promise<void> {
        const loadedData = await this.loadData();
        try {
          this.settings = settingsSchema.parse(
              loadedData || DEFAULT_SETTINGS
          );
          console.log("[main] Settings loaded successfully.");
        } catch (e) {
            console.warn(
                "Spectacular: Error parsing settings, falling back to defaults.",
                e
            );
            new Notice(
                "Spectacular: Settings were corrupted and have been reset to default."
            );
            this.settings = DEFAULT_SETTINGS;
            await this.saveSettings();
        }
    }

    async onunload() {
			this.fileExplorerObserver?.disconnect();
      if (this.eventListener) {
          await this.eventListener.cleanup();
      }
    }
}
