import WebSocket from './websocket';
import { Connection, ConnectionFactory } from './types';

class WebSocketConnectionFactory implements ConnectionFactory {
    async createConnection(
        closeHandler: (() => void) | null,
        idleTimeoutMillis?: number
    ): Promise<Connection> {
        const host = process.env.PG_BRIDGE_TARGET_HOST;
        const port = process.env.PG_BRIDGE_TARGET_PORT ? Number(process.env.PG_BRIDGE_TARGET_PORT) : undefined;

				if (!host) {
						throw new Error('PG_BRIDGE_TARGET_HOST is not defined');
				}
        if (!port) {
            throw new Error('PG_BRIDGE_TARGET_PORT is not defined or is not a valid number');
        }

				return new Promise<Connection>((resolve, reject) => {
					let connection: WebSocket | null = null;

					const openHandler = (event: Event) => {
							console.log("WebSocket opened");
							if (connection) {
									resolve(connection);
							} else {
									reject(new Error("Connection object not available in openHandler"));
							}
					};

					const internalCloseHandler = (event: CloseEvent) => {
							console.log(`WebSocket closed: ${event.code} ${event.reason}`);
							if (!connection?.getSession()) { 
									reject(new Error(`WebSocket closed before session established: ${event.code} ${event.reason}`));
							}
							closeHandler && closeHandler(); 
					};

					const errorHandler = (error: Error) => {
							console.error("WebSocket error during connection:", error);
							reject(error); 
					};

					try {
							const host = "ws://localhost"; 
							const port = 8080;

							connection = new WebSocket(
									host,
									port,
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
