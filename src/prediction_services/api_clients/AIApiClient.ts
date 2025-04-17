import {ApiClient, ChatMessage, ModelOptions} from "../types";

import {Settings} from "../../settings/versions";
import {Result} from "neverthrow";
import {makeAPIRequest} from "./utils";


class AIApiClient implements ApiClient {
    private readonly url: string;
    private readonly modelOptions: ModelOptions;

    static fromSettings(settings: Settings): AIApiClient {
        return new AIApiClient(
					settings.AIApiSettings.url,
					settings.modelOptions,
        );
    }

    constructor(
        url: string,
        modelOptions: ModelOptions
    ) {
        this.url = url;
        this.modelOptions = modelOptions;
    }

    async queryChatModel(messages: ChatMessage[]): Promise<Result<string, Error>> {
        const headers = {
            "Content-Type": "application/json",
            // Authorization: `Bearer`,
        };
        const body = {
            messages,
            ...this.modelOptions,
        }

        const data = await makeAPIRequest(this.url, "POST", body, headers);
        return data.map((data) => data.choices[0].message.content);
    }

    async checkIfConfiguredCorrectly(): Promise<string[]> {
        const errors: string[] = [];
        if (!this.url) {
            errors.push("API url is not set");
        }
        if (errors.length > 0) {
            // api check is not possible without passing previous checks so return early
            return errors;
        }
        const result = await this.queryChatModel([
            {content: "Say hello world and nothing else.", role: "user"},
        ]);

        if (result.isErr()) {
            errors.push(result.error.message);
        }
        return errors;
    }
}

export default AIApiClient;
