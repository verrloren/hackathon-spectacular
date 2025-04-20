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

export interface WsSessionInfoResponse extends WsBase {
	event: 'sessionInfo';
	session: Session; 
	errorCode: 0;
	errorMessage?: string;
}

export type WsClientRequest = WsPredictRequest

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
				hostUrl: string,
        closeHandler: (() => void) | null,
        idleTimeoutMillis?: number
    ): Promise<Connection>;
}

export interface UserContext {
	userId?: string;
}

export interface Session {
	sid: string;
}

export interface IConnectionService {
	sendRequest(session: Session, request: WsClientRequest): Promise<ResponseWithContext>;
	getConnection(session: Session): Promise<Connection>;
	terminateConnection(session: Session): void;
}
