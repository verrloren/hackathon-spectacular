/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    Connection,
    Session,
    WsClientRequest,
    WsServerResponse,
} from "./types";
import { v4 as uuidv4 } from "uuid";

type OpenHandler = (event: Event) => void;
type CloseHandler = (event: CloseEvent) => void;
type ErrorHandler = (event: ErrorEvent) => void;

class WebSocket implements Connection {
    private _session: Session | null = null;

    private _ws: globalThis.WebSocket;
    private _idleTimer: undefined | ReturnType<typeof setTimeout>;
    private _idleTimeoutMillis?: number;
    private _pendingRequests: Map<
        string,
        {
            resolve: (value: WsServerResponse) => void;
            reject: (reason?: any) => void;
						timerId: ReturnType<typeof setTimeout> | null;
        }
    > = new Map();

    private _openHandler: OpenHandler | null;
    private _closeHandler: CloseHandler | null;
    private _errorHandler: ErrorHandler | null;

    constructor(
        hostUrl: string,
        openHandler: OpenHandler | null,
        closeHandler: CloseHandler | null,
        errorHandler: ErrorHandler | null,
        idleTimeoutMillis?: number
    ) {
        try {
            new URL(hostUrl);
        } catch (e) {
            throw new Error(`Invalid WebSocket URL provided: ${hostUrl}`);
        }

        this._ws = new globalThis.WebSocket(hostUrl);

        this._idleTimeoutMillis = idleTimeoutMillis;
        this._openHandler = openHandler;
        this._closeHandler = closeHandler;
        this._errorHandler = errorHandler;

        this._ws.onopen = (event: Event) => {
            console.log("Native WebSocket opened");
            this.resetIdleTimer();
            if (this._openHandler) {
                this._openHandler(event);
            }
        };

        this._ws.onmessage = (event: MessageEvent) => {
            this.onmessage(event);
        };

        this._ws.onclose = this.wrapCloseHandler(this._closeHandler);
        this._ws.onerror = this.wrapErrorHandler(this._errorHandler);
    }

    setCloseHandler(fn: CloseHandler | null): void {
        this._closeHandler = fn;
        this._ws.onclose = this.wrapCloseHandler(fn);
    }

    setErrorHandler(fn: ErrorHandler | null): void {
        this._errorHandler = fn;
        this._ws.onerror = this.wrapErrorHandler(fn);
    }

    getSession(): Session | null {
        return this._session;
    }

    async send(req: WsClientRequest, timeoutMs = 60000): Promise<WsServerResponse> {
        if (this._ws.readyState !== globalThis.WebSocket.OPEN) {
            return Promise.reject(new Error("WebSocket is not open."));
        }

        this.resetIdleTimer();
        const id = req.id || uuidv4();
        const messageToSend = { ...req, id };

        return new Promise((resolve, reject) => {
					let timerId: ReturnType<typeof setTimeout> | null = null;

					const cleanup = () => {
							if (timerId !== null) {
									clearTimeout(timerId); 
							}
							this._pendingRequests.delete(id); 
							console.log(`[WebSocket] Cleaned up request ${id}`);
					};

					timerId = setTimeout(() => {
							if (this._pendingRequests.has(id)) {
									console.error(`[WebSocket] Request ${id} timed out after ${timeoutMs}ms.`);
									reject(new Error(`Request ${id} timed out`));
							}
					}, timeoutMs);

					this._pendingRequests.set(id, {
							resolve: (value) => { cleanup(); resolve(value); },
							reject: (reason) => { cleanup(); reject(reason); },
							timerId
					});
					console.log(`[WebSocket] Added pending request ${id} with timeout ${timeoutMs}ms`);

					try {
							this._ws.send(JSON.stringify(messageToSend));
							console.log(`[WebSocket] Sent request ${id}: ${JSON.stringify(messageToSend)}`);
					} catch (error) {
							console.error(`[WebSocket] Error sending request ${id}:`, error);
							this._pendingRequests.get(id)?.reject(error);
					}
			});
    }

    close(): void {
        this.clearIdleTimer();
        if (this._ws && this._ws.readyState !== globalThis.WebSocket.CLOSED) {
            this._ws.close(1000, "Client initiated close");
						console.log("WebSocket closed by client.");
        }
        this.rejectPendingRequests("WebSocket closed by client.");
    }

    private onmessage(event: MessageEvent) {
			this.resetIdleTimer();
			let data: WsServerResponse | null = null;
			try {
					data = JSON.parse(event.data as string) as WsServerResponse;

					if (!data || !data.id) {
						console.warn("[WebSocket] Received message without ID:", data);
						return;
				}

					if (data.event === 'sessionInfo' && 'session' in data && data.session) {
						this._session = data.session;
						console.log("Session received:", this._session);
					}


					const pending = this._pendingRequests.get(data.id);
					if (pending) {

						if (pending.timerId !== null) {
							clearTimeout(pending.timerId);
					}

							if (data.errorCode && data.errorCode !== 1000 && data.errorCode !== 0) {
								console.error(`[WebSocket] Request ${data.id} failed with server error:`, data.errorMessage || data.errorCode);
								pending.reject(new Error(data.errorMessage || `Server error code: ${data.errorCode}`));
							} else {
								pending.resolve(data);
								console.log(`WebSocket message resolved: ${JSON.stringify(data)}`);
							}
					} else {
						console.log("Received message with no matching pending request:", data);
					}
			} catch (error) {
					console.error("Failed to parse WebSocket message or handle response:", error);
					if (data && data.id) {
						const pending = this._pendingRequests.get(data.id);
						pending?.reject(new Error("Failed to process server response"));
				}
			}
		}

    private resetIdleTimer() {
			if (!this._idleTimeoutMillis) return;
			this.clearIdleTimer();
			this._idleTimer = setTimeout(() => {
					console.log(`WebSocket idle timeout reached (${this._idleTimeoutMillis}ms). Closing.`);
					this.close();
			}, this._idleTimeoutMillis);
	}

    private clearIdleTimer() {
        if (this._idleTimer) {
            clearTimeout(this._idleTimer);
            this._idleTimer = undefined;
        }
    }

    private rejectPendingRequests(reason: any) {
			console.log(`[WebSocket] Rejecting all (${this._pendingRequests.size}) pending requests. Reason:`, reason);
			this._pendingRequests.forEach((request, id) => {
					if (request.timerId !== null) {
							clearTimeout(request.timerId);
					}
					request.reject(reason);
			});
			this._pendingRequests.clear();
	}

	private wrapCloseHandler(
		fn: CloseHandler | null
): (event: CloseEvent) => void {
		return (event: CloseEvent) => {
				console.log(`Native WebSocket closed: Code=${event.code}, Reason=${event.reason}, WasClean=${event.wasClean}`);
				this.clearIdleTimer();
				this.rejectPendingRequests(`WebSocket closed: ${event.code}`);
				this._session = null;
				if (fn) {
						fn(event);
				}
		};
}

private wrapErrorHandler(
	fn: ErrorHandler | null
): (event: Event) => void {
	return (event: Event) => {
		let errorDetails = "Unknown WebSocket error";
		if (event instanceof ErrorEvent) {
			errorDetails = `Native WebSocket error: ${event.message} (col: ${event.colno}, line: ${event.lineno}, file: ${event.filename})`;
			console.error(errorDetails, event.error);
		} else {
			console.error("Native WebSocket error (generic Event):", event);
		}

		this.clearIdleTimer();
		this.rejectPendingRequests(`WebSocket error occurred: ${errorDetails}`);
		if (fn && event instanceof ErrorEvent) { 
				fn(event);
		} else if (fn) {
				console.warn("ErrorHandler called with a non-ErrorEvent:", event);
		}
};
}
}

export default WebSocket;
