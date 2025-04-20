import State from "./state";
import { DocumentChanges } from "../render_plugin/document_changes_listener";
import EventListener from "../event_listener";
import { Notice } from "obsidian";
import Context from "../context_detection";
import { v4 as uuidv4 } from "uuid";
import { Connection, Session, WsPredictRequest, WsServerResponse } from "src/websocket/types";

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

    static createAndStartPredicting(
        context: EventListener,
        prefix: string,
        suffix: string
    ): PredictingState {
        const predictingState = new PredictingState(context, prefix, suffix);
        predictingState.startPredicting();
        context.setContext(Context.getContext(prefix, suffix));
        return predictingState;
    }

    handleCancelKeyPressed(): boolean {
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
			console.log(`canceled current request id: ${requestIdToCancel}`);
			this.context.transitionToIdleState();
	}

	startPredicting(): void {
		if (!this.isStillNeeded) return;
		this.predictionPromise = this.predict().catch(error => {
				new Notice("Prediction failed:", error);
				if (this.isStillNeeded) {
						new Notice(
								`Spectacular: Prediction failed. ${error.message || 'Check console for details.'}`
						);
						this.context.transitionToIdleState();
				}
		});
}

private async predict(): Promise<void> {
	const connection: Connection | null = this.context.wsConnection;

	if (!connection) {
			new Notice("Prediction skipped: No WebSocket connection.");
			this.context.transitionToIdleState(); 
			return;
	}

	const currentSession: Session | null = connection.getSession();

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

	new Notice(`Sending prediction request: ${this.currentRequestId}`);

	try {
			const result: WsServerResponse = await connection.send(request);

			if (!this.isStillNeeded || result.id !== this.currentRequestId) {
					new Notice(`Prediction response received but no longer needed or ID mismatch: ${result.id}`);
					return; // Don't process the result
			}

			if (result.errorCode !== 0 || !('prediction' in result)) { 
					this.context.transitionToIdleState();
					return;
			}

			const prediction = result.prediction || ""; 

			if (prediction.trim() === "") {
					new Notice("Prediction returned empty result.");
					this.context.transitionToIdleState();
					return;
			}

			this.context.transitionToSuggestingState(prediction, this.prefix, this.suffix);

	} catch (error) {
			new Notice("Error sending prediction request or receiving response:", error);
			if (this.isStillNeeded) { // Only show notice if still relevant
					new Notice(
							`Spectacular: Failed to get prediction. ${error.message || 'Check console.'}`
					);
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
