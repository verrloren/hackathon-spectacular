import State from "./state";
import { DocumentChanges } from "../render_plugin/document_changes_listener";
import EventListener from "../event_listener";
import { v4 as uuidv4 } from "uuid";
import { Connection, Session, WsPredictRequest, WsServerResponse } from "src/websocket/types";
import { cancelSuggestion as dispatchCancelSuggestion } from "src/render_plugin/states";

class PredictingState extends State {
    private predictionPromise: Promise<void> | null = null;
    private isStillNeeded = true;
    private readonly prefix: string;
    private readonly suffix: string;
		private currentRequestId: string | null = null;

		

    constructor(context: EventListener, prefix: string, suffix: string) {
        super(context);
        this.prefix = prefix;
        this.suffix = suffix;
    }

    public static createAndStartPredicting(
			context: EventListener,
			prefix: string,
			suffix: string
	): PredictingState {
			const newState = new PredictingState(context, prefix, suffix);

			console.log("[PredictingState] Scheduling loading indicator '...' display.");
			// @ts-ignore - Accessing private method, consider making dispatchUpdateSuggestion public or adding a public wrapper
			context.dispatchUpdateSuggestion("...");

			newState.startPredicting();
			return newState;
	}


	handleCancelKeyPressed(): boolean {
		console.log("[PredictingState] handleCancelKeyPressed called."); // Log 1

		// *** Try direct dispatch FIRST ***
		if (this.context.view) {
				try {
					console.log("[PredictingState] Attempting direct dispatchCancelSuggestion..."); // Log 2
					dispatchCancelSuggestion(this.context.view);
						console.log("[PredictingState] Direct dispatchCancelSuggestion finished."); // Log 3
				} catch (e) {
					console.error("[PredictingState] Error during direct dispatch:", e); // Log 4 (Might see "update in progress" here)
				}
		} else {
				console.warn("[PredictingState] Cannot direct dispatch, view is null."); // Log 5
		}

		// Then cancel the prediction logic and transition state
		this.cancelPrediction();
		return true;
}



		
    async handleDocumentChange(
        documentChanges: DocumentChanges
    ): Promise<void> {
        if (
            documentChanges.hasCursorMoved() ||
            documentChanges.hasUserTyped() ||
            documentChanges.hasUserDeleted() ||
            documentChanges.isTextAdded()
        ) {
            this.cancelPrediction();
        }
    }


    private cancelPrediction(): void {
			if (!this.isStillNeeded) return;
			this.isStillNeeded = false;
			const requestIdToCancel = this.currentRequestId;
			this.currentRequestId = null;
			console.log(`[PredictingState] canceled current request id: ${requestIdToCancel}`);
			this.context.transitionToIdleState();
}


	startPredicting(): void {
		if (!this.isStillNeeded) return;
		console.log("[PredictingState] Starting prediction...");
		this.predictionPromise = this.predict().catch(error => {
				console.error("[PredictingState] Unexpected error during predict execution:", error);
				if (this.isStillNeeded) {
						console.log(`Spectacular: Prediction failed unexpectedly. ${error.message || 'Check console for details.'}`);
						this.context.transitionToIdleState();
				}
		});
	}


	private async predict(): Promise<void> {
		const connection: Connection | null = this.context.wsConnection;
		if (!connection) {
				console.log("Prediction skipped: No WebSocket connection.");
				this.context.transitionToIdleState(); 
				return;
		}
		const currentSession: Session | null = this.context.getSession();
		if (!currentSession) {
				console.log("Prediction skipped: WebSocket session not yet established.");
				this.context.transitionToIdleState();
				return;
		}
		this.currentRequestId = uuidv4();
		const request: WsPredictRequest = {
				id: this.currentRequestId,
				event: "predict",
				prefix: this.prefix,
				suffix: this.suffix,
				session: currentSession, 
		};
		console.log(`Sending prediction request: ${this.currentRequestId}`);
		try {
			const result: WsServerResponse = await connection.send(request);
			if (result.id !== this.currentRequestId) {
					console.log(`Prediction response received but no longer needed or ID mismatch: ${result.id}`);
					return;
			}
			if (!('prediction' in result)) {
				console.warn(`[PredictingState] Received non-prediction response for request ${result.id}:`, result);
				this.context.transitionToIdleState();
				return;
			}
			const prediction = result.prediction || ""; 
			if (prediction.trim() === "") {
					console.log("Prediction returned empty result.");
					this.context.transitionToIdleState();
					return;
			}
			this.context.transitionToSuggestingState(prediction, this.prefix, this.suffix);
		} catch (error) {
				console.log("Error sending prediction request or receiving response:", error);
				if (this.isStillNeeded) {
						console.log(`Spectacular: Failed to get prediction. ${error.message || 'Check console.'}`);
						this.context.transitionToIdleState();
				}
		} finally {
				if (this.isStillNeeded) {
					this.currentRequestId = null;
				}
		}
	}


    getStatusBarText(): string {
        return `Predicting for ${this.context.context}`;
    }
}

export default PredictingState;
