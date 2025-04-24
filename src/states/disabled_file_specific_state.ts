import State from "./state";
import {Settings} from "../settings/versions";
import { TFile } from "obsidian";


class DisabledFileSpecificState extends State {
    getStatusBarText(): string {
        return "Disabled for this file";
    }

    handleSettingChanged(settings: Settings) {
        if (!this.context.settings.enabled) {
            this.context.transitionToDisabledManualState();
        }
    }

    handleFileChange(file: TFile | null): void {
        if (this.context.settings.enabled) {
            this.context.transitionToIdleState();
        } else {
            this.context.transitionToDisabledManualState();
        }
    }
}

export default DisabledFileSpecificState;
