import State from "./state";
import {DocumentChanges} from "../render_plugin/document_changes_listener";


class IdleState extends State {

    async handleDocumentChange(
        documentChanges: DocumentChanges
    ): Promise<void> {
        if (
            !documentChanges.isDocInFocus()
            || !documentChanges.hasDocChanged()
						// Don't trigger on deletion, selection, multiple cursors, undo/redo
            || documentChanges.hasUserDeleted()
            || documentChanges.hasMultipleCursors()
            || documentChanges.hasSelection()
            || documentChanges.hasUserUndone()
            || documentChanges.hasUserRedone()
        ) {
            return;
        }

				const isTyping = documentChanges.isTextAdded()

				if(!isTyping) return;

				const prefix = documentChanges.getPrefix();
        const suffix = documentChanges.getSuffix();

        const cachedSuggestion = this.context.getCachedSuggestionFor(prefix, suffix);
        const isThereCachedSuggestion = cachedSuggestion !== undefined && cachedSuggestion.trim().length > 0;

        if (this.context.settings.cacheSuggestions && isThereCachedSuggestion) {
            this.context.transitionToSuggestingState(cachedSuggestion, prefix, suffix);
            return;
        }

				if (
					this.context.isCurrentFilePathIgnored() ||
					this.context.currentFileContainsIgnoredTag()
			) {
					return;
			}

        if (this.context.containsTriggerCharacters(documentChanges)) {
           this.context.transitionToQueuedState(prefix, suffix);
        }

				this.context.transitionToQueuedState(prefix, suffix);
    }

    handlePredictCommand(prefix: string, suffix: string): void {
        this.context.transitionToPredictingState(prefix, suffix);
    }

    getStatusBarText(): string {
        return "Idle";
    }
}

export default IdleState;
