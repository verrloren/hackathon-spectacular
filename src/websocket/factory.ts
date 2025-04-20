import WebSocket from "./websocket";
import { Connection, ConnectionFactory } from "./types";

type ErrorHandler = (event: ErrorEvent) => void;

class WebSocketConnectionFactory implements ConnectionFactory {
    async createConnection(
				hostUrl: string,
        closeHandler: (() => void) | null,
        idleTimeoutMillis?: number
    ): Promise<Connection> {

				if (!hostUrl || typeof hostUrl !== 'string' || !hostUrl.startsWith('ws')) {
					throw new Error(`Invalid WebSocket URL provided: ${hostUrl}`);
				}

        return new Promise<Connection>((resolve, reject) => {
            let connection: WebSocket | null = null;

            const openHandler = (event: Event) => {
                console.log("WebSocket opened");
                if (connection) {
                    resolve(connection);
                } else {
                    reject(
                        new Error(
                            "Connection object not available in openHandler"
                        )
                    );
                }
            };

            const internalCloseHandler = (event: CloseEvent) => {
                console.log(`WebSocket closed: ${event.code} ${event.reason}`);
                if (!connection?.getSession()) {
                    reject(
                        new Error(
                            `WebSocket closed before session established: ${event.code} ${event.reason}`
                        )
                    );
                }
                closeHandler && closeHandler();
            };

            const errorHandler: ErrorHandler = (error: ErrorEvent) => {
                console.log(`WebSocket error during connection: ${error}`);
                reject(error);
            };

            try {
                connection = new WebSocket(
                    hostUrl,
                    openHandler,
                    internalCloseHandler,
                    errorHandler,
                    idleTimeoutMillis
                );
            } catch (error) {
                reject(error);
            }
        });
    }
}

export default WebSocketConnectionFactory;
