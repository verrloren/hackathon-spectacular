import * as React from "react";
import {useState} from "react";
import SettingsItem from "./SettingsItem";
import {Notice} from "obsidian";
import AIApiClient from "../../prediction_services/api_clients/AIApiClient";
import {Settings} from "../versions";

interface IProps {
    settings: Settings;
}

enum Status {
    NotStarted,
    Loading,
    Success,
    Failure,
}

export default function ConnectivityCheck(props: IProps): React.JSX.Element {
    const [status, setStatus] = useState<Status>(Status.NotStarted);
    const [errors, setErrors] = useState<string[]>([]);

    React.useEffect(() => {
        setStatus(Status.NotStarted);
    }, [props.settings]);

    const createClient = () => {
        if (props.settings) {
            return AIApiClient.fromSettings(props.settings);
        }
        throw new Error(`Error connecting to the API`);
    };

    const onClickConnectionButton = async () => {
        if (status === Status.Loading) {
            return;
        }

        setStatus(Status.Loading);
        try {
            const client = createClient();
            const _errors = await client.checkIfConfiguredCorrectly();
            setErrors(_errors);
            if (_errors.length > 0) {
                new Notice(
                    `Cannot connect to the ${props.settings.AIApiSettings.url} API. Please check your settings.`
                );
                setStatus(Status.Failure);
                return;
            }

            new Notice(
                `Successfully connected to the ${props.settings.AIApiSettings.url} API.`
            );
            setStatus(Status.Success);
        } catch (e) {
            setStatus(Status.Failure);
            return
        }


    };

    const ProgressFeedback = () => {
        if (status === Status.Loading) {
            return <span className="loader-spectacular-auto-completion"/>;
        }
        if (status === Status.Success) {
            return (
                <span className={"loader-placeholder-spectacular-auto-completion"}>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="100%"
                        height="100%"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#00b344"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-check"
                    >
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </span>
            );
        }
        if (status === Status.Failure) {
            return (
                <span className={"loader-placeholder-spectacular-auto-completion"}>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#ff0000"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-x"
                    >
                        <path d="M18 6 6 18"/>
                        <path d="m6 6 12 12"/>
                    </svg>
                </span>
            );
        }

        return <span className={"loader-placeholder-spectacular-auto-completion"}/>;
    };

    return (
        <SettingsItem
            name={"Test Connection"}
            description={
                "Want to test if you configured the API correctly? Click the button below to test the connection."
            }
            errorMessage={errors.join("\n")}
        >
            {ProgressFeedback()}
            <button
                aria-label="Test Connection"
                onClick={onClickConnectionButton}
                disabled={status === Status.Loading}
            >
                Test Connection
            </button>
        </SettingsItem>
    );
}
