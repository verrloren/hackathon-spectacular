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

    async send(req: WsClientRequest): Promise<WsServerResponse> {
        if (this._ws.readyState !== globalThis.WebSocket.OPEN) {
            return Promise.reject(new Error("WebSocket is not open."));
        }

        this.resetIdleTimer();
        const id = req.id || uuidv4();
        const messageToSend = { ...req, id };

        return new Promise((resolve, reject) => {
            this._pendingRequests.set(id, { resolve, reject });
            try {
                this._ws.send(JSON.stringify(messageToSend));
								console.log(`WebSocket message sent: ${JSON.stringify(messageToSend)}`);
            } catch (error) {
                this._pendingRequests.delete(id);
                reject(error);
            }
            setTimeout(() => {
                if (this._pendingRequests.has(id)) {
                    this._pendingRequests.delete(id);
                    reject(new Error(`Request ${id} timed out`));
                }
            }, 30000); // 30sec
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
			try {
					const data = JSON.parse(event.data as string) as WsServerResponse;

					if (data.event === 'sessionInfo' && 'session' in data && data.session) {
						this._session = data.session;
						console.log("Session received:", this._session);
					}


					const pending = this._pendingRequests.get(data.id);
					if (pending) {
							if (data.errorCode && data.errorCode !== 0) {
								pending.reject(new Error(data.errorMessage || `Server error code: ${data.errorCode}`));
							} else {
								pending.resolve(data);
								console.log(`WebSocket message resolved: ${JSON.stringify(data)}`);
							}
							this._pendingRequests.delete(data.id);
					} else {
						console.log("Received message with no matching pending request:", data);
					}
			} catch (error) {
					console.error("Failed to parse WebSocket message or handle response:", error);
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
			this._pendingRequests.forEach((request) => {
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
