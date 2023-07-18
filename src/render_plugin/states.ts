import {
    EditorSelection,
    EditorState,
    SelectionRange,
    StateEffect,
    StateField,
    Transaction,
    TransactionSpec,
} from "@codemirror/state";
import { InlineSuggestion, OptionalSuggestion, Suggestion } from "./types";
import { EditorView } from "@codemirror/view";
import { sleep } from "../utils";

const InlineSuggestionEffect = StateEffect.define<InlineSuggestion>();

export const InlineSuggestionState = StateField.define<OptionalSuggestion>({
    create(): OptionalSuggestion {
        return null;
    },
    update(
        value: OptionalSuggestion,
        transaction: Transaction
    ): OptionalSuggestion {
        const inlineSuggestion = transaction.effects.find((effect) =>
            effect.is(InlineSuggestionEffect)
        );

        if (
            inlineSuggestion?.value?.doc !== undefined &&
            transaction?.state?.doc === inlineSuggestion?.value?.doc
        ) {
            return inlineSuggestion.value.suggestion;
        }
        return null;
    },
});

export const updateSuggestion = (
    view: EditorView,
    suggestion: OptionalSuggestion
) => {
    const doc = view.state.doc;
    // else we cannot do state updates in the callback.
    sleep(5).then(() => {
        view.dispatch({
            effects: InlineSuggestionEffect.of({
                suggestion: suggestion,
                doc: doc,
            }),
        });
    });
};

export function cancelSuggestion(view: EditorView) {
    const doc = view.state.doc;
    // else we cannot do state updates in the callback.
    sleep(5).then(() => {
        view.dispatch({
            effects: InlineSuggestionEffect.of({
                suggestion: "",
                doc: doc,
            }),
        });
    });
}

export function insertSuggestion(view: EditorView, suggestion: Suggestion) {
    view.dispatch({
        ...createInsertSuggestionTransaction(
            view.state,
            suggestion,
            view.state.selection.main.from,
            view.state.selection.main.to
        ),
    });
}

function createInsertSuggestionTransaction(
    state: EditorState,
    text: string,
    from: number,
    to: number
): TransactionSpec {
    const createInsertSuggestionTransactionFromSelectionRange = (
        range: SelectionRange
    ) => {
        if (range === state.selection.main) {
            return {
                changes: { from, to, insert: text },
                range: EditorSelection.cursor(to + text.length),
            };
        }
        const length = to - from;
        if (hasTextChanged(from, to, state, range)) {
            return { range };
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

    return (
        state.sliceDoc(changeRange.from - length, changeRange.from) !=
        state.sliceDoc(from, to)
    );
}
