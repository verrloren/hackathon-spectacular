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

export interface Connection {
    userContext: UserContext;
    setCloseHandler(fn: ((event: any) => void) | null): void;
    setErrorHandler(fn: ((error: any) => void) | null): void;
    send(req: Request): Promise<Response>;
    close(): void;
}

export interface ConnectionFactory {
    createConnection(
        session: Session,
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
	sendRequest(session: Session, request: Request): Promise<ResponseWithContext>;
	getConnection(session: Session): Promise<Connection>;
	terminateConnection(session: Session): void;
}
