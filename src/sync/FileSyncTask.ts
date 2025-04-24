import { App, TFile, TFolder, Vault } from "obsidian";
import { docsApi, FileData } from "src/prediction_services/api_clients/api";

export class FileSyncTask {
    private app: App;
		private vault: Vault;
    private folderPath: string;

    constructor(app: App, folderPath: string) {
        this.app = app;
				this.vault = app.vault;
        this.folderPath = folderPath;
    }

    async run(): Promise<void> {
			console.log(`[FileSyncTask] Starting sync for folder: ${this.folderPath}`);
			const folder = this.vault.getAbstractFileByPath(this.folderPath);

			if (!folder || !(folder instanceof TFolder)) {
					throw new Error(`Folder not found or invalid: ${this.folderPath}`);
			}

			const filesToSync: TFile[] = [];
			Vault.recurseChildren(folder, (file) => {
					if (file instanceof TFile && file.extension === 'md') { 
							filesToSync.push(file);
					}
			});

			if (filesToSync.length === 0) {
					console.log(`[FileSyncTask] No markdown files found in folder: ${this.folderPath}. Sync complete.`);
					return;
			}

			console.log(`[FileSyncTask] Found ${filesToSync.length} markdown files to sync.`);

			const fileDataArray: FileData[] = [];
			const docIds: string[] = [];

			for (const file of filesToSync) {
					try {
							const content = await this.vault.cachedRead(file);
							fileDataArray.push({
									path: file.path,
									content: content
							});
							docIds.push(file.path); 
							console.log(`[FileSyncTask] Read content for: ${file.path}`);
					} catch (readError) {
							console.error(`[FileSyncTask] Error reading file ${file.path}:`, readError);
					}
			}

			try {
					await docsApi.sendDocs(this.folderPath, docIds, fileDataArray);
					console.log(`[FileSyncTask] Successfully sent ${fileDataArray.length} documents via API.`);

			} catch (apiError) {
					console.error(`[FileSyncTask] API call failed for folder ${this.folderPath}:`, apiError);
					throw apiError;
			}

			console.log(`[FileSyncTask] Sync completed for folder: ${this.folderPath}`);
	}
}