import { App, TFile, TFolder } from "obsidian";

export class FileSyncTask {
    private app: App;
    private folderPath: string;

    constructor(app: App, folderPath: string) {
        this.app = app;
        this.folderPath = folderPath;
    }

    public async run(): Promise<void> {
        console.log(`[FileSyncTask] Starting sync for folder: ${this.folderPath}`);

        const folder = this.app.vault.getAbstractFileByPath(this.folderPath);
        if (!(folder instanceof TFolder)) {
            throw new Error(`Allowed folder "${this.folderPath}" not found or is not a folder.`);
        }

        const filesToSync: TFile[] = [];
        const collectFiles = (currentFolder: TFolder) => {
            currentFolder.children.forEach(child => {
                if (child instanceof TFile && child.extension === 'md') { 
                    filesToSync.push(child);
                } else if (child instanceof TFolder) {
                    collectFiles(child); 
                }
            });
        };
        collectFiles(folder);

        console.log(`[FileSyncTask] Found ${filesToSync.length} files to sync.`);

        for (const file of filesToSync) {
            console.log(`[FileSyncTask] Syncing: ${file.path}`);
            await new Promise(resolve => setTimeout(resolve, 50));
            // TODO: Replace with actual backend API call, e.g.,
            // await this.backendApi.syncFile(file.path, await this.app.vault.read(file));
        }

        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate backend processing

        console.log(`[FileSyncTask] Sync completed for folder: ${this.folderPath}`);
    }
}