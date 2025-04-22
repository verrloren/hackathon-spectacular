import { Connection, ConnectionFactory, HubSendRequestResponse, Session, WsPredictRequest, WsServerResponse } from 'src/websocket/types';
import WebSocketConnectionFactory from 'src/websocket/factory';

const idleTimeoutMillis =
    Number(process.env.BACKEND_IDLE_TIMEOUT_MILLIS) < 0
        ? 5 * 60 * 1000 // 5 minutes
        : process.env.BACKEND_IDLE_TIMEOUT_MILLIS;

				
const targetHostUrl = process.env.SPECTACULAR_TARGET_HOST;
if (!targetHostUrl) {
	throw new Error("SPECTACULAR_TARGET_HOST environment variable is not defined. Hub cannot connect to the backend.");
}


export class Hub {
    private connectionFactory: ConnectionFactory;
    private connections: Map<string, Promise<Connection>>;

    get instance(): Hub {
        return this;
    }

    constructor() {
        this.connectionFactory = new WebSocketConnectionFactory();
        this.connections = new Map<string, Promise<Connection>>();
    }

    async sendRequest(session: Session, request: WsPredictRequest): Promise<HubSendRequestResponse> {
        if (!session) {
            throw new Error('unauthorized request');
        }
				

        const connection = await this.getConnection(session);
        const response: WsServerResponse = await connection.send(request);

				if (response.errorCode && response.errorCode !== 0) {
					throw new Error(`Server error (Code: ${response.errorCode}): ${response.errorMessage || 'Unknown error'}`);
				}

        return {
            serverResponse: response,
        };
    }

    async getConnection(session: Session): Promise<Connection> {
        const connection = this.connections.get(session.sid);
        if (connection) {
            return connection;
        }
        return this.createConnection(session);
    }

    async terminateConnection(session: Session) {
        const connection = this.connections.get(session.sid);
        if (connection) {
					try {
						(await connection).close();
					} catch (error) {
					console.error(`Error closing connection for session ${session.sid}:`, error);
					} finally {
					this.connections.delete(session.sid);
					}
        }
    }

    private async createConnection(session: Session): Promise<Connection> {
        const conn = this.internalCreateConnection(session);
        this.connections.set(session.sid, conn);
        return conn;
    }

    private async internalCreateConnection(session: Session): Promise<Connection> {
        const closeHandler = () => this.connections.delete(session.sid);
				if(!targetHostUrl) throw new Error("SPECTACULAR_TARGET_HOST environment variable is not defined. Hub cannot connect to the backend.");
        const connection = await this.connectionFactory.createConnection(
					targetHostUrl, 
					closeHandler, 
					Number(idleTimeoutMillis)
				);
        console.log(`Hub: Connection established for session ${session.sid}. User context set.`);
        return connection;
    }
}

export default new Hub();
