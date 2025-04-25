/* eslint-disable @typescript-eslint/no-explicit-any */
import StatusBar from "./status_bar";
import { DocumentChanges, getPrefix, getSuffix } from "./render_plugin/document_changes_listener";
import {
    cancelSuggestion,
    clearSuggestionEffect,
    InlineSuggestionState,
    updateSuggestion,
} from "./render_plugin/states";
import { EditorView } from "@codemirror/view";
import State from "./states/state";
import { EventHandler } from "./states/types";
import InitState from "./states/init_state";
import IdleState from "./states/idle_state";
import SuggestingState from "./states/suggesting_state";
import { checkForErrors } from "./settings/utils";
import Context from "./context_detection";
import { Settings } from "./settings/versions";
import DisabledManualState from "./states/disabled_manual_state";
import DisabledFileSpecificState from "./states/disabled_file_specific_state";
import { LRUCache } from "lru-cache";
import DisabledInvalidSettingsState from "./states/disabled_invalid_settings_state";
import QueuedState from "./states/queued_state";
import PredictingState from "./states/predicting_state";
import { App, MarkdownView, TFile } from "obsidian";
import { Connection, ConnectionFactory, Session } from "./websocket/types";
import WebSocketConnectionFactory from "./websocket/factory";
import { v4 as uuidv4 } from "uuid";
import { SyncManager } from "./sync/SyncManager";
import { EditorSelection } from '@codemirror/state';

const FIVE_MINUTES_IN_MS = 1000 * 60 * 5;
const MAX_N_ITEMS_IN_CACHE = 5000;

class EventListener implements EventHandler {
    public view: EditorView | null = null;
    public state: EventHandler = new InitState();
    public statusBar: StatusBar;
    public app: App;
    context: Context = Context.Text;
    settings: Settings;
    private currentFile: TFile | null = null;
    private suggestionCache = new LRUCache<string, string>({
        max: MAX_N_ITEMS_IN_CACHE,
        ttl: FIVE_MINUTES_IN_MS,
    });

    public session: Session | null = null;
    public wsConnection: Connection | null = null;
    private wsConnectionFactory: ConnectionFactory;
    private isWsConnecting: boolean;
    private wsInitializationPromise: Promise<void> | null = null;
		private syncManager: SyncManager;

    public static fromSettings(
        settings: Settings,
        statusBar: StatusBar,
        app: App,
				syncManager: SyncManager
    ): EventListener {
        const eventListener = new EventListener(settings, statusBar, app, syncManager);

        const settingErrors = checkForErrors(settings);
        if (settings.enabled) {
            eventListener.transitionToIdleState();
        } else if (settingErrors.size > 0) {
            eventListener.transitionToDisabledInvalidSettingsState();
        } else if (!settings.enabled) {
            eventListener.transitionToDisabledManualState();
        }

        return eventListener;
    }

    private constructor(settings: Settings, statusBar: StatusBar, app: App, syncManager: SyncManager) {
			this.app = app;
      this.settings = settings;
      this.statusBar = statusBar;
			this.syncManager = syncManager;
      this.wsConnectionFactory = new WebSocketConnectionFactory();
			this.suggestionCache = new LRUCache<string, string>({ 
				max: MAX_N_ITEMS_IN_CACHE,
				ttl: settings.cacheSuggestions ? FIVE_MINUTES_IN_MS : 0, 
		});
    }
t
		private isFileAllowed(file: TFile | null): boolean {
			if (!this.settings.allowedFolder) {
					return true;
			}
			if (!file) {
					return false;
			}
			const allowedPathPrefix = this.settings.allowedFolder === "/" ? "/" : this.settings.allowedFolder + "/";
			return file.path.startsWith(allowedPathPrefix);
	}

    public createSession(): Session {
        this.session = { sid: uuidv4().substring(0, 8) };
        console.log(`[EventListener] Created and stored client-side session: ${this.session.sid}`);
        return this.session;
    }

    public getSession(): Session | null {
        return this.session;
    }

    private clearSession(): void {
        console.log(`[EventListener] Clearing client-side session: ${this.session?.sid ?? "none"}`);
        this.session = null;
    }

    private async initializeWebSocket(): Promise<void> {
			if (!this.isFileAllowed(this.currentFile)) {
				console.log(`[EventListener] Skipping WebSocket initialization: Current file '${this.currentFile?.path ?? 'none'}' not in allowed folder '${this.settings.allowedFolder}'.`);
				if (!(this.state instanceof DisabledFileSpecificState)) {
						this.transitionToDisabledFileSpecificState();
				}
				return;
		}
        if (this.isWsConnecting) {
          console.log("WebSocket initialization already in progress. Awaiting...");
          await (this.wsInitializationPromise ?? Promise.resolve());
          return;
        }
        if (this.wsConnection && this.session) {
          console.log("WebSocket already connected with session.");
          return;
        }
        if (this.wsConnection && this.session) {
            console.warn("WebSocket connection exists but session is missing. Closing and re-initializing.");
            await this.closeWebSocketConnection();
        }
        if (!this.settings.enabled) {
            console.log("Plugin disabled, skipping WebSocket connection.");
            return;
        }
        if (!this.settings.webSocketUrl) {
            console.log(`WebSocket URL not configured in settings ${this.settings.webSocketUrl}`);
            if (!(this.state instanceof DisabledInvalidSettingsState))
                this.transitionToDisabledInvalidSettingsState();
            return;
        }

        this.isWsConnecting = true;
        this.updateStatusBarText();
        console.log("Starting WebSocket initialization process...");

        this.wsInitializationPromise = new Promise((resolve, reject) => {
            (async () => {
                let connectionAttempt: Connection | null = null;
                try {
                    console.log(
                        "Attempting to create WebSocket connection to:",
                        this.settings.webSocketUrl
                    );

                    connectionAttempt =
                      await this.wsConnectionFactory.createConnection(
                        this.settings.webSocketUrl,
                        this.handleWebSocketClose.bind(this),
                        this.settings.wsDebounceMillis
                      );
										this.wsConnection = connectionAttempt
                    console.log("WebSocket connection opened. Now waiting for session...");

                    const createdSession = this.createSession();
                    console.log(`Client session ${createdSession} created. Assigning connection.`);
                    if (this.wsConnection) {
                        this.wsConnection.setErrorHandler((error) =>
                            this.handleWebSocketError(error)
                        );
                    }
                    console.log("WebSocket fully initialized (connected + session received).");
                    if (
                        (this.state instanceof InitState ||
                        this.state instanceof DisabledInvalidSettingsState ||
                        this.state instanceof DisabledManualState ||
                        this.state instanceof DisabledFileSpecificState) &&
                        this.settings.enabled &&
                        checkForErrors(this.settings).size === 0
                    ) {
                        console.log("Transitioning to IdleState after successful initialization.");
                        this.transitionToIdleState();
                    }
                    resolve();
                } catch (error) {
                    console.error("WebSocket initialization failed:", error);
                    if (connectionAttempt && !this.wsConnection) {
                        console.log("Closing failed connection attempt.");
                        connectionAttempt.close();
                    }
                    this.wsConnection = null;
                    this.clearSession();

                    if (!(this.state instanceof DisabledInvalidSettingsState)) {
                        this.transitionToDisabledInvalidSettingsState();
                    }
                    reject(error);
                } finally {
                    this.isWsConnecting = false;
                    this.updateStatusBarText();
                    console.log(
                        "WebSocket initialization process finished (success or failure)."
                    );
                }
            })();
        });

        try {
          await this.wsInitializationPromise;
        } catch (initError) {
          console.log("Caught initialization error at top level of initializeWebSocket.");
        } finally {
          this.wsInitializationPromise = null;
        }
    }

    private async closeWebSocketConnection(): Promise<void> {
        if (this.wsConnection) {
            console.log("Closing WebSocket connection...");
            this.wsConnection.setErrorHandler(null);
            this.wsConnection.setCloseHandler(null);
            this.wsConnection.close();
            this.wsConnection = null;
            await new Promise((resolve) => setTimeout(resolve, 50));
            console.log("WebSocket connection closed.");
        } else {
            this.clearSession();
        }
        if (
            !(
                this.state instanceof DisabledManualState ||
                this.state instanceof DisabledFileSpecificState
            )
        ) {
            const settingErrors = checkForErrors(this.settings);
            if (!this.settings.enabled) {
                this.transitionToDisabledManualState();
            } else if (settingErrors.size > 0 || !this.settings.webSocketUrl) {
                this.transitionToDisabledInvalidSettingsState();
            } else {
                this.transitionToIdleState();
            }
        }
        this.updateStatusBarText();
    }

    private handleWebSocketClose(): void {
        console.log("WebSocket connection closed (handleWebSocketClose triggered).");
        this.wsConnection = null;
				this.clearSession();
         if (
            !(
                this.state instanceof DisabledManualState ||
                this.state instanceof DisabledFileSpecificState
            )
        ) {
            console.log("[EventListener] Connection closed, transitioning state.");
            const settingErrors = checkForErrors(this.settings);
            if (!this.settings.enabled) {
              this.transitionToDisabledManualState();
            } else if (settingErrors.size > 0 || !this.settings.webSocketUrl) {
              this.transitionToDisabledInvalidSettingsState();
            } else {
              this.transitionToIdleState();
            }
        } else {
					console.log("[EventListener] Connection closed, but plugin was manually/file disabled. No state transition needed here.");
        }
        this.updateStatusBarText();
    }


    private handleWebSocketError(error: any): void {
        console.log("WebSocket error:", error);
        if (!this.isWsConnecting) {
            this.wsConnection?.close();
            this.wsConnection = null;
            this.wsInitializationPromise = null;
            this.updateStatusBarText();
        }
				if (this.wsConnection) {
					this.wsConnection.setErrorHandler(null);
					this.wsConnection.setCloseHandler(null);
				}
				this.wsConnection = null;
				this.clearSession();
				this.wsInitializationPromise = null;
    }


    public setContext(context: Context): void {
        if (context === this.context) return;
        this.context = context;
        this.updateStatusBarText();
    }


    public isSuggesting(): boolean {
        return this.state instanceof SuggestingState;
    }

    public onViewUpdate(view: EditorView): void {
        this.view = view;
    }

    async handleFileChange(file: TFile| null): Promise<void> {
			this.currentFile = file;
			console.log(`[EventListener] File changed: ${file?.path ?? 'None'}`);

			const isAllowed = this.isFileAllowed(file);

			if (!isAllowed) {
					if (!(this.state instanceof DisabledFileSpecificState)) {
							this.transitionToDisabledFileSpecificState();
							await this.closeWebSocketConnection();
					}
			} else if (this.state instanceof DisabledFileSpecificState) {
					console.log(`[EventListener] File '${file?.path}' is allowed. Re-enabling (if other settings permit).`);
					if (this.settings.enabled && checkForErrors(this.settings).size === 0) {
							this.transitionToIdleState();
							await this.initializeWebSocket();
					} else if (!this.settings.enabled) {
							this.transitionToDisabledManualState();
					} else {
							this.transitionToDisabledInvalidSettingsState();
					}
			} else {
				if (this.settings.enabled && !this.wsConnection && !this.isWsConnecting) {
					await this.initializeWebSocket();
				}
				await this.state.handleFileChange(file);
			}
			if (this.state && typeof this.state.handleFileChange === 'function') {
				await this.state.handleFileChange(file);
		}
	}

	public async cleanup(): Promise<void> {
		console.log("[EventListener] Cleaning up...");
		await this.closeWebSocketConnection();
		this.suggestionCache.clear();
}

public insertCurrentSuggestion(suggestionText: string): void {
	// @ts-expect-error 3123123
	const view = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor.cm;
	if (!view) {
			console.error("insertCurrentSuggestion: Could not get active CodeMirror view.");
			return;
	}

	const suggestionField = view.state.field(InlineSuggestionState, false);
	if (!suggestionField) {
		console.error("insertCurrentSuggestion: Could not get suggestion state field.");
		return;
	}


	const currentPos = view.state.selection.main.head;
	const currentLine = view.state.doc.lineAt(currentPos);
	const currentLineIndent = currentLine.text.match(/^\s*/)?.[0] || ""; 

	const replaceFrom = suggestionField.suggestionPos ?? currentPos;
	const replaceTo = currentPos;


	const suggestionLines = suggestionText.split('\n');
	const firstLine = suggestionLines[0];
	const subsequentLines = suggestionLines.slice(1);

	let textToInsert = firstLine;
	if (subsequentLines.length > 0) {
			textToInsert += '\n' + subsequentLines.map(line => currentLineIndent + line.trimStart()).join('\n');
	}

	console.log(`[EventListener] Inserting suggestion. Indent: "${currentLineIndent}", Text:\n${textToInsert}`);

	view.dispatch({
			changes: { from: replaceFrom, to: replaceTo, insert: textToInsert },
			selection: EditorSelection.cursor(replaceFrom + textToInsert.length),
			effects: clearSuggestionEffect?.of(null)
	})
}

    cancelSuggestion(): void {
        if (this.view === null) {
            return;
        }
        cancelSuggestion(this.view);
    }

    private transitionTo(state: State): void {
        this.state = state;
        this.updateStatusBarText();
    }

    transitionToDisabledFileSpecificState(): void {
        this.transitionTo(new DisabledFileSpecificState(this));
    }

    transitionToDisabledManualState(): void {
        this.cancelSuggestion();
        this.transitionTo(new DisabledManualState(this));
    }

    transitionToDisabledInvalidSettingsState(): void {
        this.cancelSuggestion();
        this.transitionTo(new DisabledInvalidSettingsState(this));
    }

    transitionToQueuedState(prefix: string, suffix: string): void {
        this.transitionTo(
            QueuedState.createAndStartTimer(this, prefix, suffix)
        );
    }

    transitionToPredictingState(prefix: string, suffix: string): void {
        this.transitionTo(
            PredictingState.createAndStartPredicting(this, prefix, suffix)
        );
    }

    transitionToSuggestingState(
      suggestion: string,
      prefix: string,
      suffix: string,
      addToCache = true
    ): void {
			console.log("[EventListener] transitionToSuggestingState called. View:", this.view ? 'Exists' : 'NULL');
        if (this.view === null) return;
        if (suggestion.trim().length === 0) {
            this.transitionToIdleState();
            return;
        }
        if (addToCache) {
            this.addSuggestionToCache(prefix, suffix, suggestion);
        }
        this.transitionTo(
            new SuggestingState(this, suggestion, prefix, suffix)
        );
				console.log("[EventListener] Calling updateSuggestion with:", suggestion);
        updateSuggestion(this.view, suggestion);
    }

    public transitionToIdleState() {
        const previousState = this.state;

        this.transitionTo(new IdleState(this));

        if (previousState instanceof SuggestingState) {
            this.cancelSuggestion();
        }
    }

    private updateStatusBarText(): void {
        this.statusBar.updateText(this.getStatusBarText());
    }

    getStatusBarText(): string {
        return `Spectacular: ${this.state.getStatusBarText()}`;
    }
    handleSettingChanged(newSettings: Settings): void {
			console.log("[EventListener] Settings changed. Updating internal state and notifying SyncManager.");
			this.settings = newSettings; // Update EventListener's internal settings

			// *** Crucial: Update SyncManager's settings ***
			this.syncManager.updateSettings(newSettings);

			// ... rest of handleSettingChanged logic (state transitions, etc.) ...
			if (!this.settings.cacheSuggestions) {
					this.clearSuggestionsCache();
			}
			if (this.state instanceof IdleState && !this.wsConnection && !this.isWsConnecting) {
					this.initializeWebSocket();
			}
			// Pass change to current state if needed
			if (this.state && typeof this.state.handleSettingChanged === 'function') {
					this.state.handleSettingChanged(newSettings);
			}
			this.updateStatusBarText();
	}
    async handleDocumentChange(
        documentChanges: DocumentChanges
    ): Promise<void> {
        let needsInit = false;
        if (
						(!this.wsConnection || !this.session) &&
            !this.isWsConnecting &&
            this.settings.enabled &&
            this.settings.webSocketUrl &&
            !(
                this.state instanceof DisabledManualState ||
                this.state instanceof DisabledFileSpecificState ||
								this.state instanceof DisabledInvalidSettingsState
            )
        ) {
            needsInit = true;
            console.log("Document change requires WebSocket initialization.");
        }

        if (needsInit || this.isWsConnecting) {
            if (this.isWsConnecting) {
              console.log("Document change occurred while WebSocket is connecting. Awaiting completion...");
            }
            try {
                await this.initializeWebSocket();
                if (!this.wsConnection || !this.session) {
                    console.warn(
                        "Initialization awaited, but connection/session still not ready. Skipping document change handling for this event."
                    );
                    return;
                }
                console.log(
                    "Initialization complete, proceeding with document change handling."
                );
            } catch (err) {
                console.error(
                    "WebSocket initialization failed during document change:",
                    err
                );
                return;
            }
        }
        await this.state.handleDocumentChange(documentChanges);
    }

    handleAcceptKeyPressed(): boolean {
			const handled = this.state.handleAcceptKeyPressed();
			if (handled && this.view && this.settings.enabled && !this.isDisabled()) {
					const currentState = this.view.state;
					const newPrefix = getPrefix(currentState);
					const newSuffix = getSuffix(currentState);
					console.log("[EventListener] Suggestion accepted. Triggering new prediction.");
					this.transitionToPredictingState(newPrefix, newSuffix);
			}
			return handled;
	}
    handlePartialAcceptKeyPressed(): boolean {
        return this.state.handlePartialAcceptKeyPressed();
    }

    handleCancelKeyPressed(): boolean {
        return this.state.handleCancelKeyPressed();
    }

    handlePredictCommand(prefix: string, suffix: string): void {
			if (this.isIdle() && !this.isDisabled()) {
				this.transitionToPredictingState(prefix, suffix);
			}
    }

    handleAcceptCommand(): void {
        this.state.handleAcceptCommand();
    }

    containsTriggerCharacters(documentChanges: DocumentChanges): boolean {
        for (const trigger of this.settings.triggers) {
            if (
                trigger.type === "string" &&
                documentChanges.getPrefix().endsWith(trigger.value)
            ) {
                return true;
            }
            if (
                trigger.type === "regex" &&
                documentChanges.getPrefix().match(trigger.value)
            ) {
                return true;
            }
        }
        return false;
    }

    public isDisabled(): boolean {
			const fileAllowed = this.isFileAllowed(this.currentFile);
			if (!fileAllowed && !(this.state instanceof DisabledFileSpecificState)) {
				console.log(`[EventListener] Disabled: Current file '${this.currentFile?.path}' not in allowed folder '${this.settings.allowedFolder}'.`);
			}
			return (
					!fileAllowed || 
					this.state instanceof DisabledManualState ||
					this.state instanceof DisabledInvalidSettingsState ||
					this.state instanceof DisabledFileSpecificState
			);
		}

    public isIdle(): boolean {
        return this.state instanceof IdleState;
    }

    public getCachedSuggestionFor(
        prefix: string,
        suffix: string
    ): string | undefined {
        return this.suggestionCache.get(this.getCacheKey(prefix, suffix));
    }

    private getCacheKey(prefix: string, suffix: string): string {
        const nCharsToKeepPrefix = prefix.length;
        const nCharsToKeepSuffix = suffix.length;

        return `${prefix.substring(
            prefix.length - nCharsToKeepPrefix
        )}<mask/>${suffix.substring(0, nCharsToKeepSuffix)}`;
    }

    public clearSuggestionsCache(): void {
        this.suggestionCache.clear();
    }

    public addSuggestionToCache(
        prefix: string,
        suffix: string,
        suggestion: string
    ): void {
        if (!this.settings.cacheSuggestions) {
            return;
        }
        this.suggestionCache.set(this.getCacheKey(prefix, suffix), suggestion);
    }
}

export default EventListener;
