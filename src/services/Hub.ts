import { Connection, ConnectionFactory, ResponseWithContext, Session, UserContext, Request as WsRequest } from 'src/websocket/types';
import WebSocketConnectionFactory from 'src/websocket/factory';

const idleTimeoutMillis =
    Number(process.env.BACKEND_IDLE_TIMEOUT_MILLIS) < 0
        ? 5 * 60 * 1000 // 5 minutes
        : process.env.BACKEND_IDLE_TIMEOUT_MILLIS;

export class Hub {
    private connectionFactory: ConnectionFactory;
    private connections: Map<number, Promise<Connection>>;

    get instance(): Hub {
        return this;
    }

    constructor() {
        this.connectionFactory = new WebSocketConnectionFactory();
        this.connections = new Map<number, Promise<Connection>>();
    }

    async sendRequest(session: Session, request: WsRequest): Promise<ResponseWithContext> {
        if (!session) {
            throw new Error('unauthorized request');
        }
				

        const connection = await this.getConnection(session);
        const response = await connection.send(request);

        if (response.errorCode !== 0) {
            throw new Error(`Server error: ${response.errorCode}`);
        }

        return {
            serverResponse: response,
            userContext: connection.userContext
        };
    }

    async getConnection(session: Session): Promise<Connection> {
        const connection = this.connections.get(session.sid);
        if (connection) {
            return connection;
        }
        return this.createConnection(session);
    }

    async getUser(session: Session): Promise<UserContext | null> {
        return this.getConnection(session)
            .then((connection) => connection.userContext)
            .catch(() => null);
    }

    async terminateConnection(session: Session) {
        const connection = this.connections.get(session.sid);
        if (connection) {
            (await connection).close();
        }
    }

    private async createConnection(session: Session): Promise<Connection> {
        const conn = this.internalCreateConnection(session);
        this.connections.set(session.sid, conn);
        return conn;
    }

    private async internalCreateConnection(session: Session): Promise<Connection> {
        const closeHandler = () => this.connections.delete(session.sid);
        const connection = await this.connectionFactory.createConnection(session, closeHandler, Number(idleTimeoutMillis));

        // connection.userContext.userId

        return connection;
    }
}

export default new Hub();
