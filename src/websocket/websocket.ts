import { default as NodeWebSocket } from 'ws';
import { Connection, Request, UserContext } from './types';

type OpenHandler = (event: NodeWebSocket.Event) => void;
type CloseHandler = (event: NodeWebSocket.CloseEvent) => void;
type ErrorHandler = (event: NodeWebSocket.ErrorEvent) => void;

class WebSocket implements Connection {
    userContext: UserContext = {};

    private _ws: NodeWebSocket;
    private _idleTimer: undefined | ReturnType<typeof setTimeout>;
    private _idleTimeoutMillis?: number;

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
            this.resetIdleTimer();
            openHandler && openHandler(event);
        };
        this._ws.onclose = this.wrapCloseHandler(closeHandler);
        this._ws.onerror = errorHandler;
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

    async send(req: Request) {

        this._ws.send(req);
        this.resetIdleTimer();
        // TODO: handle sending
				return Promise.resolve({ session: req.session, errorCode: 0 });
    }

    close(): void {
        this._ws.close();
    }

    private onmessage(event: NodeWebSocket.MessageEvent) {
			// TODO: handle message
		}

    private resetIdleTimer() {
        if (this._idleTimeoutMillis === undefined) {
            return;
        }
        clearTimeout(this._idleTimer);
        this._idleTimer = setTimeout(() => {
            this.close();
        }, this._idleTimeoutMillis);
    }

    private rejectHandlers() {
        // TODO: reject if already closed
    }

    private wrapCloseHandler(fn: CloseHandler | null): CloseHandler {
        return (event: NodeWebSocket.CloseEvent) => {
            clearTimeout(this._idleTimer);
            this.rejectHandlers();
            fn && fn(event);
        };
    }
}

export default WebSocket;
