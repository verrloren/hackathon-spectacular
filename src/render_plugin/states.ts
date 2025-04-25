import {
    EditorSelection,
    EditorState,
    SelectionRange,
    StateEffect,
    StateField,
    Transaction,
    TransactionSpec,
} from "@codemirror/state";
import {InlineSuggestion, OptionalSuggestion, Suggestion} from "./types";
import {Decoration, EditorView} from "@codemirror/view";
import { InlineSuggestionWidget } from "./render_surgestion_plugin";

const InlineSuggestionEffect = StateEffect.define<InlineSuggestion>();

export const clearSuggestionEffect = StateEffect.define<null>();

export const InlineSuggestionState = StateField.define<OptionalSuggestion>({
    create(): OptionalSuggestion {
        return null;
    },
    update(
			value: OptionalSuggestion, 
			transaction: Transaction
	): OptionalSuggestion {
			// Check for the clear effect first
			for (const effect of transaction.effects) {
					if (effect.is(clearSuggestionEffect)) {
							console.log("[InlineSuggestionState] Clear effect received. Clearing state.");
							return null; 
					}
			}

			const updateEffect = transaction.effects.find((effect) =>
					effect.is(InlineSuggestionEffect)
			);

			if (updateEffect) {
					console.log("[InlineSuggestionState] Update effect received:", updateEffect.value);
					return updateEffect.value.suggestion;
			}

			if (transaction.docChanged && value !== null) {
					console.log("[InlineSuggestionState] Document changed. Clearing state.");
					return null; 
			}

			return value;
	},
	provide: (field) =>
		EditorView.decorations.from(field, (value: OptionalSuggestion) => {
				if (value && value.render) { 
						const currentPos = editorViewRef?.state.selection.main.head;
						if (currentPos !== undefined && editorViewRef) {
								const widget = new InlineSuggestionWidget(value.value, editorViewRef); // Pass view
								return Decoration.set([
										Decoration.widget({
												widget,
												side: 1,
										}).range(currentPos), 
								]);
						}
				}
				return Decoration.none;
		}),
});


let editorViewRef: EditorView | null = null;
export function setEditorViewRefForSuggestions(view: EditorView) {
    editorViewRef = view;
}


export const updateSuggestion = (
	view: EditorView,
	suggestionValue: string 
) => {
	if (!view) {
			console.warn("updateSuggestion called with null view");
			return;
	}
	const suggestion: Suggestion = { value: suggestionValue, render: true };
	view.dispatch({
			effects: InlineSuggestionEffect.of({
					suggestion: suggestion, 
					doc: view.state.doc, 
			}),
	});
};

export const cancelSuggestion = (view: EditorView) => {
	if (!view) {
			console.warn("cancelSuggestion called with null view");
			return;
	}
	view.dispatch({
			effects: clearSuggestionEffect.of(null)
	});
};
// export const cancelSuggestion = (view: EditorView) => {
//     const doc = view.state.doc;
//     sleep(1).then(() => {
//         view.dispatch({
//             effects: InlineSuggestionEffect.of({
//                 suggestion: {
//                     value: "",
//                     render: false,
//                 },
//                 doc: doc,
//             }),
//         });
//     });
// };

export const insertSuggestion = (view: EditorView, suggestion: string) => {
    view.dispatch({
        ...createInsertSuggestionTransaction(
            view.state,
            suggestion,
            view.state.selection.main.from,
            view.state.selection.main.to
        ),
    });
};


function createInsertSuggestionTransaction(
    state: EditorState,
    text: string,
    from: number,
    to: number
): TransactionSpec {
    const docLength = state.doc.length;
    if (from < 0 || to > docLength || from > to) {
        // If the range is not valid, return an empty transaction spec.
        return {changes: []};
    }

    const createInsertSuggestionTransactionFromSelectionRange = (
        range: SelectionRange
    ) => {

        if (range === state.selection.main) {
            return {
                changes: {from, to, insert: text},
                range: EditorSelection.cursor(to + text.length),
            };
        }
        const length = to - from;
        if (hasTextChanged(from, to, state, range)) {
            return {range};
        }
        return {
            changes: {
                from: range.from - length,
                to: range.from,
                insert: text,
            },
            range: EditorSelection.cursor(range.from - length + text.length),
        };
    };

    return {
        ...state.changeByRange(
            createInsertSuggestionTransactionFromSelectionRange
        ),
        userEvent: "input.complete",
    };
}

function hasTextChanged(
    from: number,
    to: number,
    state: EditorState,
    changeRange: SelectionRange
) {
    if (changeRange.empty) {
        return false;
    }
    const length = to - from;
    if (length <= 0) {
        return false;
    }
    if (changeRange.to <= from || changeRange.from >= to) {
        return false;
    }
    // check out of bound
    if (changeRange.from < 0 || changeRange.to > state.doc.length) {
        return false;
    }

    return (
        state.sliceDoc(changeRange.from - length, changeRange.from) !=
        state.sliceDoc(from, to)
    );
}
