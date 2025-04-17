import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { IConnectionService, Session, UserContext } from './types';
import { UserSessionData } from './UserSessionData';

export class UserConnection {
    protected heartbeat: NodeJS.Timeout | undefined;
    public userSessionData: UserSessionData;

    constructor(
        public readonly connectionService: IConnectionService,
        public readonly ws: WebSocket,
        public readonly user: UserContext,
        public readonly session: Session,
    ) {
        const filePath = path.join('last-state', `${this.user.userId}`);
        this.userSessionData = new UserSessionData(filePath);
    }
    startHearbeat() {
        this.stopHeartbeat();
        this.heartbeat = setInterval(() => {
            this.ws.send('h');
        }, 30000);
    }
    stopHeartbeat() {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = undefined;
        }
    }
}

export default class Transport {
    private server: WebSocketServer;

    protected connectionService: IConnectionService = {
        sendRequest: () => Promise.reject(),
        getConnection: () => Promise.reject(),
        terminateConnection: () => undefined
    };

    constructor() {
        this.server = new WebSocketServer({ host: process.env.BACKEND_WS_HOST });
        this.server.on('listening', () => console.log("WebSocket server is listening."));
        this.server.on('connection', this.onConnection.bind(this));
        this.server.on('error', (error) => {
            console.error('WebSocket server error:', error)
            process.exit(1);
        });
    }

    setConnectionService(connectionService: IConnectionService) {
        this.connectionService = connectionService;
    }

    private async onConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
        try {
					const session = { sid: 1448 };

            const serverConnection = await this.connectionService.getConnection(session);
            serverConnection.setCloseHandler(() => ws.close());
            const user = serverConnection.userContext;

            if (!user.userId) throw new Error('userId required');


            let connection: UserConnection | null = new UserConnection(
                this.connectionService,
                ws,
                user,
                session,
            );

            connection.startHearbeat();

            const onMessage = (data) => {
                if (connection) {
                    this.onMessage(connection, data);
                }
            };

            const onError = (error: Error) => {
                if (connection) {
                    this.onError(connection, error);
                }
            };

            const onClose = () => {
                if (connection) {
                    connection.stopHeartbeat();
                    this.onClose(connection);

                    ws.off('message', onMessage);
                    ws.off('close', onClose);
                    ws.off('error', onError);

                    connection = null;
                }
            };

            ws.on('message', onMessage);
            ws.on('error', onError);
            ws.on('close', onClose);
        } catch (error) {
            ws.close(1008, 'unauthorized');
            return;
        }

        ws.send('o');
    }

    private parseRequestMessage(data: string): { event: string } | undefined {
        try {
            const json = JSON.parse(data);
            if (Array.isArray(json)) {
                for (let i = 0; i < json.length; ++i) {
                    if (typeof json[i] === 'string') {
                        try {
                            json[i] = JSON.parse(json[i]);
                        } catch {
                            //do nothing
                        }
                    }
                }
            }
            return json;
        } catch (error) {
            //do nothing
        }
        return undefined;
    }

    private onMessage(connection: UserConnection, data: Buffer): void {
        try {
            const msgData = this.parseRequestMessage(data.toString());
            if (!msgData) {
                console.error({ request: data.toString(), userId: connection.user.userId }, 'Unknown request');
                connection.ws.close();
                return;
            }
						console.log(msgData)

        } catch (error) {
            console.warn({ request: data.toString(), userId: connection.user.userId, error }, 'Client message error');
            connection.ws.close();
        }
    }

    private onClose(connection: UserConnection): void {
        if (connection.session) {
            this.connectionService.terminateConnection(connection.session);
        }
    }

    private onError(connection: UserConnection, error: Error): void {
        console.warn({ error, userId: connection.user.userId }, 'WebSocket client error');
    }

    public close(): void {
        this.server.close(() => {
            console.info('WebSocket closed');
        });
    }
}
