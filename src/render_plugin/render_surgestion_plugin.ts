import {
    Decoration,
    DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    WidgetType,
} from "@codemirror/view";
import {cancelSuggestion, InlineSuggestionState} from "./states";
import {Prec} from "@codemirror/state";
import {OptionalSuggestion} from "./types";

const RenderSuggestionPlugin = () =>
    Prec.lowest(
        ViewPlugin.fromClass(
            class RenderPlugin {
                decorations: DecorationSet;

                constructor(view: EditorView) {
                    this.decorations = Decoration.none;
                }

                async update(update: ViewUpdate) {
                    const currentSuggestionState: OptionalSuggestion | undefined = update.state.field(
                        InlineSuggestionState,
												false
                    );

                    this.decorations = inlineSuggestionDecoration(
											update.view,
											currentSuggestionState 
									);
                }
            },
            {
                decorations: (v) => v.decorations,
            }
        )
    );

function inlineSuggestionDecoration(
    view: EditorView,
    suggestionState: OptionalSuggestion | undefined
) {

    if (suggestionState == null || !suggestionState.render) {
        console.log("[inlineSuggestionDecoration] State is null/undefined or render=false. Returning Decoration.none."); // Add Log
        return Decoration.none;
}

    const post = view.state.selection.main.head;

    try {
			const widget = new InlineSuggestionWidget(suggestionState.value, view);
			const decoration = Decoration.widget({
					widget,
					side: 1, 
			});

			return Decoration.set([decoration.range(post)]);
	} catch (e) {
			console.error("[inlineSuggestionDecoration] Error creating widget:", e);
			return Decoration.none;
	}

}

export class InlineSuggestionWidget extends WidgetType {
    constructor(readonly display_suggestion: string, readonly view: EditorView) {
        super();
        this.display_suggestion = display_suggestion;
        this.view = view;
    }

    eq(other: InlineSuggestionWidget) {
        return other.display_suggestion == this.display_suggestion;
    }

    toDOM() {
        const span = document.createElement("span");
        span.textContent = this.display_suggestion;
				span.classList.add("cm-spectacular-suggestion");
        span.onclick = (event) => {
					event.stopPropagation(); 
					console.log("[Widget] Clicked, calling cancelSuggestion.");
					cancelSuggestion(this.view);
			};
        // span.onselect = () => {
        //     cancelSuggestion(this.view);
        // }

        return span;
    }

		ignoreEvent(event: Event): boolean {
			return event.type === 'mousedown' || event.type === 'click';
	}

    destroy(dom: HTMLElement) {
        super.destroy(dom);
    }

}

export default RenderSuggestionPlugin;
