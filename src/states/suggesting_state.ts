import State from "./state";
import {DocumentChanges} from "../render_plugin/document_changes_listener";
import EventListener from "../event_listener";
import {Settings} from "../settings/versions";
import {extractNextWordAndRemaining} from "../utils";
import { cancelSuggestion as dispatchCancelSuggestion } from "../render_plugin/states";

class SuggestingState extends State {
    private readonly suggestion: string;
    private readonly prefix: string;
    private readonly suffix: string;


    constructor(context: EventListener, suggestion: string, prefix: string, suffix: string) {
        super(context);
        this.suggestion = suggestion;
        this.prefix = prefix;
        this.suffix = suffix;
    }


    async handleDocumentChange(
        documentChanges: DocumentChanges
    ): Promise<void> {

        if (
            documentChanges.hasCursorMoved()
            || documentChanges.hasUserUndone()
            || documentChanges.hasUserDeleted()
            || documentChanges.hasUserRedone()
            || !documentChanges.isDocInFocus()
            || documentChanges.hasSelection()
            || documentChanges.hasMultipleCursors()
        ) {
            this.clearPrediction();
            return;
        }

        if (
            documentChanges.noUserEvents()
            || !documentChanges.hasDocChanged()
        ) {
            return;
        }

        if (this.hasUserAddedPartOfSuggestion(documentChanges)) {
            this.acceptPartialAddedText(documentChanges);
            return
        }

        const currentPrefix = documentChanges.getPrefix();
        const currentSuffix = documentChanges.getSuffix();
        const suggestion = this.context.getCachedSuggestionFor(currentPrefix, currentSuffix);
        const isThereCachedSuggestion = suggestion !== undefined;
        const isCachedSuggestionDifferent = suggestion !== this.suggestion;

        if (!isCachedSuggestionDifferent) {
            return;
        }

        if (isThereCachedSuggestion) {
            this.context.transitionToSuggestingState(suggestion, currentPrefix, currentSuffix);
            return;
        }
        this.clearPrediction();
    }


    hasUserAddedPartOfSuggestion(documentChanges: DocumentChanges): boolean {
        const addedPrefixText = documentChanges.getAddedPrefixText();
        const addedSuffixText = documentChanges.getAddedSuffixText();

        return addedPrefixText !== undefined
            && addedSuffixText !== undefined
            && this.suggestion.toLowerCase().startsWith(addedPrefixText.toLowerCase())
            && this.suggestion.toLowerCase().endsWith(addedSuffixText.toLowerCase());
    }

    acceptPartialAddedText(documentChanges: DocumentChanges): void {
        const addedPrefixText = documentChanges.getAddedPrefixText();
        const addedSuffixText = documentChanges.getAddedSuffixText();
        if (addedSuffixText === undefined || addedPrefixText === undefined) {
            return;
        }

        const startIdx = addedPrefixText.length;
        const endIdx = this.suggestion.length - addedSuffixText.length
        const remainingSuggestion = this.suggestion.substring(startIdx, endIdx);

        if (remainingSuggestion.trim() === "") {
            this.clearPrediction();
        } else {
            this.context.transitionToSuggestingState(remainingSuggestion, documentChanges.getPrefix(), documentChanges.getSuffix());
        }
    }

    private clearPrediction(): void {
        this.context.transitionToIdleState();
    }

    handleAcceptKeyPressed(): boolean {
        this.accept();
        return true;
    }

    private accept() {
        this.addPartialSuggestionCaches(this.suggestion);
        this.context.insertCurrentSuggestion(this.suggestion);
        this.context.transitionToIdleState();
    }

    handlePartialAcceptKeyPressed(): boolean {
        this.acceptNextWord();
        return true;
    }

    private acceptNextWord() {
        const [nextWord, remaining] = extractNextWordAndRemaining(this.suggestion);

        if (nextWord !== undefined && remaining !== undefined) {
            const updatedPrefix = this.prefix + nextWord;

            this.addPartialSuggestionCaches(nextWord, remaining);
            this.context.insertCurrentSuggestion(nextWord);
            this.context.transitionToSuggestingState(remaining, updatedPrefix, this.suffix, false);
        } else {
            this.accept();
        }
    }

    private addPartialSuggestionCaches(acceptSuggestion: string, remainingSuggestion = "") {
        // store the sub-suggestions in the cache
        // so that we can have partial suggestions if the user edits a part
        for (let i = 0; i < acceptSuggestion.length; i++) {
            const prefix = this.prefix + acceptSuggestion.substring(0, i);
            const suggestion = acceptSuggestion.substring(i) + remainingSuggestion;
            this.context.addSuggestionToCache(prefix, this.suffix, suggestion);
        }
    }

    private getNextWordAndRemaining(): [string | undefined, string | undefined] {
        const words = this.suggestion.split(" ");
        if (words.length === 0) {
            return ["", ""];
        }

        if (words.length === 1) {
            return [words[0] + " ", ""];
        }

        return [words[0] + " ", words.slice(1).join(" ")];
    }

    handleCancelKeyPressed(): boolean {
			console.log("[SuggestingState] handleCancelKeyPressed called."); // Log 6

			// *** Try direct dispatch FIRST ***
			if (this.context.view) {
					try {
							console.log("[SuggestingState] Attempting direct dispatchCancelSuggestion..."); // Log 7
							dispatchCancelSuggestion(this.context.view);
							console.log("[SuggestingState] Direct dispatchCancelSuggestion finished."); // Log 8
					} catch (e) {
							console.error("[SuggestingState] Error during direct dispatch:", e); // Log 9 (Might see "update in progress" here)
					}
			} else {
					console.warn("[SuggestingState] Cannot direct dispatch, view is null."); // Log 10
			}

			this.context.transitionToIdleState();
			this.context.clearSuggestionsCache(); // Keep cache clear if desired
			return true;
	}

    handleAcceptCommand() {
        this.accept();
    }

    getStatusBarText(): string {
        return `Suggesting for ${this.context.context}`;
    }

    handleSettingChanged(settings: Settings): void {
        if (!settings.cacheSuggestions) {
            this.clearPrediction();
        }
    }

}

export default SuggestingState;
