import State from "./state";
import { DocumentChanges } from "../render_plugin/document_changes_listener";
import EventListener from "../event_listener";
import Context from "../context_detection";


class QueuedState extends State {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private currentPrefix: string;
    private currentSuffix: string;


    private constructor(
        context: EventListener,
        prefix: string,
        suffix: string
    ) {
        super(context);
        this.currentPrefix = prefix;
        this.currentSuffix = suffix;
    }

    static createAndStartTimer(
        context: EventListener,
        prefix: string,
        suffix: string
    ): QueuedState {
        const state = new QueuedState(context, prefix, suffix);
        state.startTimer();
        context.setContext(Context.getContext(prefix, suffix));
        return state;
    }

    handleCancelKeyPressed(): boolean {
        this.cancelTimer();
        this.context.transitionToIdleState();
        return true;
    }

    async handleDocumentChange(
        documentChanges: DocumentChanges
    ): Promise<void> {
			if (
				!documentChanges.isDocInFocus() ||
				documentChanges.hasCursorMoved() || // Cursor moved without typing
				documentChanges.hasSelection() ||
				documentChanges.hasMultipleCursors() ||
				documentChanges.hasUserDeleted() || // Deletion cancels queue
				documentChanges.hasUserUndone() ||
				documentChanges.hasUserRedone()
		) {
				this.cancelTimer();
				this.context.transitionToIdleState();
				return;
		}
		const isTyping = documentChanges.isTextAdded() || documentChanges.hasUserTyped();

		if (isTyping) {
				this.currentPrefix = documentChanges.getPrefix();
				this.currentSuffix = documentChanges.getSuffix();

				const cachedSuggestion = this.context.getCachedSuggestionFor(this.currentPrefix, this.currentSuffix);
				if (this.context.settings.cacheSuggestions && cachedSuggestion !== undefined && cachedSuggestion.trim().length > 0) {
						this.cancelTimer();
						this.context.transitionToSuggestingState(cachedSuggestion, this.currentPrefix, this.currentSuffix, false);
						return;
				}

				this.startTimer();
    }}

    startTimer(): void {
        this.cancelTimer();
        this.timer = setTimeout(() => {
            this.context.transitionToPredictingState(this.currentPrefix, this.currentSuffix);
        }, this.context.settings.delay);
    }

    private cancelTimer(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

		destructor(): void {
			this.cancelTimer();
	}

    getStatusBarText(): string {
        return `Queued (${this.context.settings.delay} ms)`;
    }
}

export default QueuedState;
