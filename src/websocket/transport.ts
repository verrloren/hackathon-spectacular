import * as path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import {
    IConnectionService,
    Session,
    WsClientRequest,
    WsServerResponse,
    WsSessionInfoResponse,
} from "./types";
import { UserSessionData } from "./UserSessionData";
import { v4 as uuidv4 } from "uuid";

export class UserConnection {
    protected heartbeat: NodeJS.Timeout | undefined;
    public userSessionData: UserSessionData;

    constructor(
        public readonly connectionService: IConnectionService,
        public readonly ws: WebSocket,
        public readonly session: Session
    ) {
        const filePath = path.join("last-state", `${this.session.sid}`);
        this.userSessionData = new UserSessionData(filePath);
    }
    startHearbeat() {
        this.stopHeartbeat();
        this.heartbeat = setInterval(() => {
            this.ws.send("h");
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
        sendRequest: () =>
            Promise.reject(new Error("ConnectionService not set")),
        getConnection: () =>
            Promise.reject(new Error("ConnectionService not set")),
        terminateConnection: () => {
            console.warn("ConnectionService not set for terminateConnection");
        },
    };

    constructor() {
			const localHost = process.env.SERVER_WS_HOST || '0.0.0.0';
      const localPortEnv = process.env.SERVER_WS_PORT;
      const localPort = localPortEnv ? parseInt(localPortEnv, 10) : 8080;

			if (isNaN(localPort)) {
				console.error("[Server] Invalid SERVER_WS_PORT defined.");
				process.exit(1);
		}

		this.server = new WebSocketServer({ host: localHost, port: localPort });

      this.server.on("listening", () =>
         console.log(`[Server] WebSocket server IS LISTENING on ${localHost}:${localPort}.`)
      );
      this.server.on("connection", this.onConnection.bind(this));
      this.server.on("error", (error) => {
				console.error("[Server] WebSocket server error:", error);
        process.exit(1);
      });
    }

    setConnectionService(connectionService: IConnectionService) {
        this.connectionService = connectionService;
    }

    private async onConnection(
        ws: WebSocket,
        req: IncomingMessage
    ): Promise<void> {
        let session: Session | null = null;
				const connectionId = uuidv4().substring(0, 8);

				console.log(`[Server][${connectionId}] Connection received. ReadyState: ${ws.readyState}`);
        try {
          session = { sid: connectionId };
					console.log(`WebSocket connection received. Assigning session: ${session.sid}`);
          
					const sessionInfoResponse: WsSessionInfoResponse = {
						id: `server-session-${session.sid}`,
						event: "sessionInfo",
						session: session,
						errorCode: 0,
					};
					const sessionInfoString = JSON.stringify(sessionInfoResponse);
					console.log(`[Server] Attempting to send sessionInfo to client: ${session.sid}`);
					ws.send(sessionInfoString);
					console.log(`[Server] Sent sessionInfo to client: ${session.sid}`);
					
					const serverConnection = await this.connectionService.getConnection(session);
          serverConnection.setCloseHandler(() => ws.close());

          let connection: UserConnection | null = new UserConnection(
              this.connectionService,
              ws,
              session
          );

          connection.startHearbeat();

          const onMessage = (data: Buffer) => {
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
                  ws.off("message", onMessage);
                  ws.off("close", onClose);
                  ws.off("error", onError);
                  connection = null;
              }
          };
          ws.on("message", onMessage);
          ws.on("error", onError);
          ws.on("close", onClose);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            console.error(
                `WebSocket connection failed for session ${
                    session?.sid || "unknown"
                }: ${errorMessage}`
            );
            ws.close(1008, `unauthorized or connection error: ${errorMessage}`);
            return;
        }
    }

    private parseRequestMessage(data: string): WsClientRequest | undefined {
        try {
            const json = JSON.parse(data);
            if (typeof json === "object" && json !== null && "event" in json) {
                return json as WsClientRequest;
            }
            console.warn(
                "Parsed message is not a valid WsClientRequest:",
                json
            );
            return undefined;
        } catch (error) {
            console.error("Failed to parse request message:", error);
        }
        return undefined;
    }

    private async onMessage(
        connection: UserConnection,
        data: Buffer
    ): Promise<void> {
        // Make async if calling async service
        const rawData = data.toString();
        try {
            const msgData = this.parseRequestMessage(rawData);
            if (!msgData) {
                console.error(
                    `request: ${rawData}, session: ${connection.session.sid}, Unknown or invalid request format`
                );
                return;
            }

            // Ensure session in message matches connection session (security check)
            if (msgData.session?.sid !== connection.session.sid) {
                console.warn(
                    `Session mismatch in message! Conn: ${connection.session.sid}, Msg: ${msgData.session?.sid}. Ignoring.`
                );
                return;
            }

            console.log(
                `Received message: ${msgData.event}, session: ${connection.session.sid}`
            );

            try {
                const responseContext =
                    await this.connectionService.sendRequest(
                        connection.session,
                        msgData
                    );
                connection.ws.send(
                    JSON.stringify(responseContext.serverResponse)
                );
                console.log(
                    `Sent response: ${responseContext.serverResponse.event}, session: ${connection.session.sid}`
                );
            } catch (serviceError) {
                console.error(
                    `Error processing request (${msgData.event}) for session ${connection.session.sid}:`,
                    serviceError
                );
                const errorResponse: WsServerResponse = {
                    id: msgData.id,
                    event: "predictResponse",
                    errorCode: 500,
                    errorMessage:
                        serviceError instanceof Error
                            ? serviceError.message
                            : "Internal server error",
                    session: connection.session,
                };
                connection.ws.send(JSON.stringify(errorResponse));
            }
        } catch (error) {
            console.error(
                `request: ${rawData}, session: ${connection.session.sid}, Error in onMessage:`,
                error
            );
        }
    }

    private onClose(connection: UserConnection): void {
        console.log(`Connection closed for session: ${connection.session.sid}`);
        if (connection.session) {
            if (this.connectionService.terminateConnection) {
                this.connectionService.terminateConnection(connection.session);
            } else {
                console.warn(
                    "connectionService.terminateConnection not available."
                );
            }
        }
    }

    private onError(connection: UserConnection, error: Error): void {
        console.error(
            `WebSocket client error for session ${connection.session.sid}:`,
            error
        );
    }

    public close(): void {
        console.log("Closing WebSocket server...");
        this.server.close(() => {
            console.log("WebSocket server closed.");
        });
    }
}
