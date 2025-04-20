import { Notice, Plugin, setIcon } from "obsidian";

class StatusBar {
    private readonly statusBarItem: HTMLElement;
    private text = "";
		private textEl: HTMLElement;
		private iconEl: HTMLElement;

    private constructor(statusBarItem: HTMLElement) {
        this.statusBarItem = statusBarItem;
				this.textEl = this.statusBarItem.createSpan({ cls: "status-bar-text" });
				this.iconEl = this.statusBarItem.createSpan({ cls: "status-bar-icon clickable-icon", attr: { "aria-label": "Microphone" } });
				
				setIcon(this.iconEl, "mic")
				
				this.iconEl.addEventListener("click", () => {
					new Notice("Clicking the icon does nothing yet.");
				});
				
				this.text = "Ready"
				this.render();
    }

    public static fromApp(plugin: Plugin): StatusBar {
        const statusBarItem = plugin.addStatusBarItem();
        return new StatusBar(statusBarItem);
    }

    public render(): void {
			this.textEl.textContent = this.text;
    }

    public updateText(text: string): void {
        this.text = text.trim();
        this.render();
    }
}

export default StatusBar;
