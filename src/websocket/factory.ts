import { default as NodeWebSocket } from 'ws';

import WebSocket from './websocket';
import { Connection, ConnectionFactory, Session } from './types';

class WebSocketConnectionFactory implements ConnectionFactory {
    async createConnection(
        _: Session,
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

        return new Promise((resolve, reject) => {
            const ws = new WebSocket(
                host,
                port,
                () => {
                    ws.setCloseHandler(closeHandler);
                    ws.setErrorHandler(null);
                    resolve(ws);
                },
                () => reject(),
                (e: NodeWebSocket.ErrorEvent) => reject(e.error),
                idleTimeoutMillis
            );
        });
    }
}

export default WebSocketConnectionFactory;
