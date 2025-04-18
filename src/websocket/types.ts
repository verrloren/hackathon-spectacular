/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Request {
  session: Session | null;
	errorCode: number;
}

export interface Response {
	session: Session | null;
	errorCode: number;
}

export type ResponseWithContext = {
    serverResponse: Response;
    userContext: UserContext;
};

export interface WsBase {
	id: string; 
	session?: Session | null;
}

export interface WsPredictRequest extends WsBase {
	event: 'predict';
	prefix: string;
	suffix: string;
}

export interface WsPredictResponse extends WsBase {
	event: 'predictResponse'; 
	prediction?: string;
	errorCode: number;
	errorMessage?: string;
}

// Add type for server sending session info
export interface WsSessionInfoResponse extends WsBase {
	event: 'sessionInfo';
	session: Session; // Server provides the session
	errorCode: 0; // Typically 0 for success
}

export type WsClientRequest = WsPredictRequest

// Update server response union type
export type WsServerResponse = WsPredictResponse | WsSessionInfoResponse;

export interface Connection {
    userContext: UserContext;
		getSession(): Session | null;
    setCloseHandler(fn: ((event: any) => void) | null): void;
    setErrorHandler(fn: ((error: any) => void) | null): void;
    send(req: WsClientRequest): Promise<WsServerResponse>;
    close(): void;
}

export interface ConnectionFactory {
    createConnection(
        // REMOVED: session: Session, - Session is established by the server after connection
        closeHandler: (() => void) | null,
        idleTimeoutMillis?: number
    ): Promise<Connection>;
}

export interface UserContext {
	userId?: number;
}

export interface Session {
	sid: number;
}

export interface IConnectionService {
	sendRequest(session: Session, request: WsClientRequest): Promise<ResponseWithContext>;
	getConnection(session: Session): Promise<Connection>;
	terminateConnection(session: Session): void;
}
