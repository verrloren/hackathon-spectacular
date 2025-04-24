import * as React from "react";
import {useState} from "react";

import {checkForErrors} from "./utils";
import SliderSettingsItem from "./components/SliderSettingsItem";

import TriggerSettings from "./components/TriggerSettings";
import CheckBoxSettingItem from "./components/CheckBoxSettingItem";
import {
    Settings
} from "./versions"
import { MAX_DELAY, MAX_MAX_CHAR_LIMIT, MIN_DELAY, MIN_MAX_CHAR_LIMIT } from "./versions/v1/v1";

interface IProps {
  onSettingsChanged(settings: Settings): void;
	onFolderChanged(folderPath: string | undefined): void;
  settings: Settings;
	availableFolders: string[];
}

export default function SettingsView(props: IProps): React.JSX.Element {
    const [settings, _setSettings] = useState<Settings>(props.settings);
    const errors = checkForErrors(settings);

    React.useEffect(() => {
			_setSettings(props.settings);
	}, [props.settings]);

    const updateSettings = (update: Partial<Settings>) => {
        _setSettings((currentSettings: Settings) => {
            const newSettings = {...currentSettings, ...update};
            props.onSettingsChanged(newSettings);
            return newSettings;
        });
    };

		const handleFolderChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
      const newFolder = event.target.value === "" ? undefined : event.target.value;
      props.onFolderChanged(newFolder);
      _setSettings(current => ({...current, allowedFolder: newFolder}));
    };

    return (
        <div>
					<h1>Spectacular</h1>
					<p className="setting-item-description">The plugin for analitics autocompletion.</p>

						<div className="setting-item">
                <div className="setting-item-info">
                    <div className="setting-item-name">Select Folder</div>
                    <div className="setting-item-description">
                        Restrict plugin functionality to files within this folder (and its subfolders). Select 'All Folders' to disable restriction.
                    </div>
                </div>
                <div className="setting-item-control">
                    <select
                        className="dropdown"
                        value={settings.allowedFolder || ""}
                        onChange={handleFolderChange}
                    >
                        <option value="">All Folders</option>
                        {props.availableFolders.map(folderPath => {
                            const displayPath = folderPath === "/" ? "/" : folderPath;
                            return (
                                <option key={folderPath} value={folderPath}>
                                    {displayPath}
                                </option>
                            );
                        })}
                    </select>
                </div>
            </div>

            <h2 >General</h2>
            <CheckBoxSettingItem
                name={"Enable"}
                description={
                    "If disabled, nothing will trigger the extension or can result in an API call."
                }
                enabled={settings.enabled}
                setEnabled={(value) => updateSettings({enabled: value})}
            />
            <CheckBoxSettingItem
                name={"Cache completions"}
                description={
                    "If disabled, the plugin will not cache the completions. After accepting or rejecting a completion, the plugin will not remember it. This might result in more API calls."
                }
                enabled={settings.cacheSuggestions}
                setEnabled={(value) => updateSettings({cacheSuggestions: value})}
            />
            <CheckBoxSettingItem
                name={"Debug mode"}
                description={
                    "If enabled, various debug messages will be logged to the console, such as the complete response from the API, including the chain of thought tokens."
                }
                enabled={settings.debugMode}
                setEnabled={(value) => updateSettings({debugMode: value})}
            />


            <h2>Preprocessing</h2>
            <CheckBoxSettingItem
                name={"Don't include dataviews"}
                description={
                    "Dataview(js) blocks can be quite long while not providing much value to the AI. If this setting is enabled, data view blocks will be removed promptly to reduce the number of tokens. This could save you some money in the long run."
                }
                enabled={settings.dontIncludeDataviews}
                setEnabled={(value) =>
                    updateSettings({dontIncludeDataviews: value})
                }
            />
            <SliderSettingsItem
                name={"Maximum Prefix Length"}
                description={
                    "The maximum number of characters that will be included in the prefix. A larger value will increase the context for the completion, but it can also increase the cost or push you over the token limit."
                }
                value={settings.maxPrefixCharLimit}
                errorMessage={errors.get("maxPrefixCharLimit")}
                setValue={(value: number) =>
                    updateSettings({maxPrefixCharLimit: value})
                }
                min={MIN_MAX_CHAR_LIMIT}
                max={MAX_MAX_CHAR_LIMIT}
                step={100}
                suffix={" chars"}
            />
            <SliderSettingsItem
                name={"Maximum Suffix Length"}
                description={
                    "The maximum number of characters that will be included in the suffix. A larger value will increase the context for the completion, but it can also increase the cost or push you over the token limit."
                }
                value={settings.maxSuffixCharLimit}
                errorMessage={errors.get("maxSuffixCharLimit")}
                setValue={(value: number) =>
                    updateSettings({maxSuffixCharLimit: value})
                }
                min={MIN_MAX_CHAR_LIMIT}
                max={MAX_MAX_CHAR_LIMIT}
                step={100}
                suffix={" chars"}
            />

            <h2>Trigger</h2>
            <SliderSettingsItem
                name={"Delay"}
                description={
                    "Delay in ms between the last character typed and the completion request."
                }
                value={settings.delay}
                errorMessage={errors.get("delay")}
                setValue={(value: number) => updateSettings({delay: value})}
                min={MIN_DELAY}
                max={MAX_DELAY}
                step={100}
                suffix={"ms"}
            />
            <TriggerSettings
                name={"Trigger words"}
                description={
                    "Completions will be triggered if the text before the matches any of these words or characters. This can either be a direct string match or a regex match. When using a regex, make sure to include the end of line character ($)."
                }
                triggers={settings.triggers}
                setValues={(triggers) => updateSettings({triggers})}
                errorMessage={errors.get("triggerWords")}
                errorMessages={errors}
            />
        </div>
    );
}
