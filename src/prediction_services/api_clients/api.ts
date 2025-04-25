export interface FileData {
	path: string;
	content: string;
}

export interface DocsDto {
	message: string;
}

const backendUrl = "http://it_one_completer:8765"

export const docsApi = {
	sendDocs: async (projectId: string, docIds: string[], files: FileData[]) => {

		console.log('multipart/form-data:', {
			projectId,
			docIdCount: docIds.length,
			fileCount: files.length,
	});

	if (files.length === 0) {
			console.warn('[docsApi] Attempting to send an empty file list. Skipping API call.');
			return { message: "No files to send." };
	}

	const formData = new FormData();

	// Append project ID as a field

	// Append doc IDs as a JSON string field
	formData.append('doc_ids', JSON.stringify(docIds));

	// Append each file
	files.forEach((file) => {
			const blob = new Blob([file.content], { type: 'text/markdown' });
			formData.append('files', blob, file.path); 
	});

	console.log(formData.get('doc_ids'));
	console.log(formData.get('files'));
	console.log('Sending files:', files.map(file => file.path).join(', '));



		try {
			const response = await fetch(`${backendUrl}/load_documents`, {
				method: 'POST',
				signal: new AbortController().signal,
				body: formData,
				headers: {
					"project-id": projectId,
				}
	});
			console.log('[docsApi] Send documents response:', response);
			return response;
		} catch (error) {
			if (error.response) {
				try {
					const errorBodyText = await error.response.text();
					console.error('[docsApi] Error response body text:', errorBodyText);
				} catch (parseError) {
					console.error('[docsApi] Could not read or parse error response body.');
				}
		}
		throw new Error(`Failed to send documents: ${error.message}`);
		}
	}
};