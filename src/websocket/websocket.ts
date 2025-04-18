/* eslint-disable @typescript-eslint/no-explicit-any */
import { default as NodeWebSocket } from 'ws';
import { Connection, Session, UserContext, WsClientRequest, WsServerResponse } from './types';

type OpenHandler = (event: NodeWebSocket.Event) => void;
type CloseHandler = (event: NodeWebSocket.CloseEvent) => void;
type ErrorHandler = (event: NodeWebSocket.ErrorEvent) => void;

class WebSocket implements Connection {
    userContext: UserContext = {};
		private _session: Session | null = null;

    private _ws: NodeWebSocket;
    private _idleTimer: undefined | ReturnType<typeof setTimeout>;
    private _idleTimeoutMillis?: number;
		private _pendingRequests: Map<string, { resolve: (value: WsServerResponse) => void; reject: (reason?: any) => void }> = new Map();

    constructor(
        host: string,
        port: number | undefined,
        openHandler: OpenHandler | null,
        closeHandler: CloseHandler | null,
        errorHandler: ErrorHandler | null,
        idleTimeoutMillis?: number
    ) {
        const url = new URL(host);
        if (port !== undefined) {
            url.port = port.toString();
        }
        this._ws = new NodeWebSocket(url);

        this._ws.onopen = (event: NodeWebSocket.Event) => {
					console.log("Internal: WebSocket opened");
            this.resetIdleTimer();
            openHandler && openHandler(event);
        };
        this._ws.onclose = this.wrapCloseHandler(closeHandler);
        this._ws.onerror = this.wrapErrorHandler(errorHandler);

        this._ws.onmessage = this.onmessage.bind(this);
        this._idleTimeoutMillis = idleTimeoutMillis;
    }

    setCloseHandler(fn: CloseHandler | null): void {
        this._ws.onclose = this.wrapCloseHandler(fn);
    }

    setErrorHandler(fn: ErrorHandler | null): void {
        this._ws.onerror = fn
            ? (event: NodeWebSocket.ErrorEvent) => {
                  fn(event.error);
              }
            : null;
    }

		getSession(): Session | null {
			return this._session;
	}


	async send(req: WsClientRequest): Promise<WsServerResponse> {
		// Return a promise that resolves when the specific response is received
		return new Promise((resolve, reject) => {
				if (this._ws.readyState !== NodeWebSocket.OPEN) {
						return reject(new Error("WebSocket is not open."));
				}

				try {
						const message = JSON.stringify(req);
						this._pendingRequests.set(req.id, { resolve, reject });
						this._ws.send(message, (err) => {
								if (err) {
										// Handle send error immediately
										this._pendingRequests.delete(req.id);
										reject(err);
								} else {
										this.resetIdleTimer();
								}
						});
				} catch (error) {
						this._pendingRequests.delete(req.id); // Clean up if stringify fails
						reject(error);
				}
		});
}

    close(): void {
			if (this._ws.readyState === NodeWebSocket.OPEN || this._ws.readyState === NodeWebSocket.CONNECTING) {
					this._ws.close();
			}
			this.clearIdleTimer(); 
			this.rejectPendingRequests(new Error("WebSocket closed explicitly."));
	}

    private onmessage(event: NodeWebSocket.MessageEvent) {
			this.resetIdleTimer(); // Reset idle timer on any message
			try {
					const messageString = event.data.toString();
					if (messageString === 'o') {
							console.log("Received server open confirmation ('o')");
							return; // Don't process 'o' as JSON
					}
					if (messageString === 'h') {
							return; // Don't process 'h' as JSON
					}

					const response = JSON.parse(messageString) as WsServerResponse | { event: string, session: Session }; // Type assertion

					if ('event' in response && response.event === 'sessionInfo' && response.session) {
							this._session = response.session as Session;
							console.log("Client received session:", this._session);
					} else if ('id' in response && this._pendingRequests.has(response.id)) {
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							const { resolve } = this._pendingRequests.get(response.id)!;
							resolve(response as WsServerResponse); 
							this._pendingRequests.delete(response.id); 
					} else {
							console.warn("Received unexpected message or message without matching request ID:", response);
					}
			} catch (e) {
					console.error("Failed to parse server message or handle response:", e, "Raw data:", event.data.toString());
			}
	}

    private resetIdleTimer() {
			if (this._idleTimeoutMillis === undefined) {
					return;
			}
			this.clearIdleTimer(); 
			this._idleTimer = setTimeout(() => {
					console.log("WebSocket idle timeout reached. Closing connection.");
					this.close();
			}, this._idleTimeoutMillis);
	}

    private rejectHandlers() {
        // TODO: reject if already closed
    }

		private clearIdleTimer() {
			if (this._idleTimer) {
					clearTimeout(this._idleTimer);
					this._idleTimer = undefined;
			}
	}

	private rejectPendingRequests(reason: any) {
		this._pendingRequests.forEach(({ reject }) => reject(reason));
		this._pendingRequests.clear();
}

private wrapCloseHandler(fn: CloseHandler | null): (event: NodeWebSocket.CloseEvent) => void {
	return (event: NodeWebSocket.CloseEvent) => {
			console.log(`Internal: WebSocket closed (${event.code})`);
			this.clearIdleTimer(); 
			this.rejectPendingRequests(new Error(`WebSocket closed with code ${event.code}.`)); // Reject pending
			fn && fn(event); 
	};
}

		private wrapErrorHandler(fn: ErrorHandler | null): (event: NodeWebSocket.ErrorEvent) => void {
			return (event: NodeWebSocket.ErrorEvent) => {
					console.error("Internal: WebSocket error:", event.error);
					this.clearIdleTimer(); 
					this.rejectPendingRequests(event.error);
					fn && fn(event.error);
			};
	}
}

export default WebSocket;
