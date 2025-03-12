import * as vscode from 'vscode';
import { AIDataInterface } from './AIDataInterface';
import { Auth } from './Auth';
import { PaymentStatus } from './PaymentStatus';
import * as path from 'path';

export class ChatPanel {
	public static currentPanel: ChatPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;

	// New field to store the active file URI as shown in "Active File:".
	private _activeFileUri: vscode.Uri | undefined;

	// Add a field to store the code context from the last active text editor
	private _codeContext: string = '';

	private _activeEditorListener: vscode.Disposable; // to hold the editor change subscription

	public static extensionContext: vscode.ExtensionContext;  // New static property for context

	public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
		// Assign the extension context to the static property.
		ChatPanel.extensionContext = context;
		const column = vscode.ViewColumn.Beside;
		if (ChatPanel.currentPanel) {
			// Reveal panel without taking focus
			ChatPanel.currentPanel._panel.reveal(column, true);
			return;
		}
		const panel = vscode.window.createWebviewPanel(
			'qlinxxChat',
			'QLINXX AI',
			{ viewColumn: column, preserveFocus: true },
			{
				enableScripts: true,
				retainContextWhenHidden: true, // <--- Retain state even when hidden
				localResourceRoots: [
					vscode.Uri.joinPath(extensionUri, 'src', 'static'),
					vscode.Uri.joinPath(extensionUri, 'dist')
				]
			}
		);
		ChatPanel.currentPanel = new ChatPanel(panel, extensionUri);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		
		// Update _codeContext and store active file URI when active editor changes.
		this._activeEditorListener = vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				this._codeContext = editor.document.getText();
				this._activeFileUri = editor.document.uri; // <--- store URI
				this._panel.webview.postMessage({ command: 'updateCurrentFile', text: path.basename(editor.document.fileName) });
			}
		});
		
		// On creation, capture the active editor and store its file URI.
		const initialEditor = vscode.window.activeTextEditor;
		this._codeContext = initialEditor ? initialEditor.document.getText() : 'No active document';
		if (initialEditor) {
			this._activeFileUri = initialEditor.document.uri; // <--- store initial URI
		}
		this._panel.webview.postMessage({ command: 'updateCurrentFile', text: initialEditor ? path.basename(initialEditor.document.fileName) : 'None' });

		// Dispose when the panel is closed.
		this._panel.onDidDispose(() => {
			this.dispose();
		}, null);

		try {
			this._panel.webview.html = this._getHtmlForWebview();
		} catch (error) {
			console.error("Error setting HTML in ChatPanel constructor:", error);
		}

		// Listen for messages from the webview.
		this._panel.webview.onDidReceiveMessage(
			async message => {
				try {
					switch (message.command) {
						case 'openFilePicker': {
								// Switch focus to the first editor group and then open quick open
								vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
									.then(() => vscode.commands.executeCommand('workbench.action.quickOpen'));
								break;
							}
						case 'requestEdit': {
							if (!Auth.currentToken || !(await PaymentStatus.isActive())) {
								this._panel.webview.postMessage({ command: 'displayEditError', text: 'Payment is inactive.' });
								return;
							}
							
							// Try to get active editor; if not available, fallback to a visible editor.
							let editor = vscode.window.activeTextEditor;
							if (!editor && vscode.window.visibleTextEditors.length > 0) {
								editor = vscode.window.visibleTextEditors[0];
							}
							if (!editor) {
								this._panel.webview.postMessage({ 
									command: 'displayEditError', 
									text: 'No active editor. Please open a file to edit.' 
								});
								return;
							}
							
							const document = editor.document;
							const originalCode = document.getText();
							const editInstruction = message.text;
							
							// Record the edit request in the webview before obtaining AI answer.
							this._panel.webview.postMessage({ command: 'recordEditRequest', text: editInstruction });
							
							const fileName = path.basename(document.fileName);
							
							// Create prompt for the AI
							const prompt = `Edit File: ${fileName}\nEdit Instruction: ${editInstruction}\n\nOriginal Code:\n${originalCode}`;
							
							// Get AI response
							const apiKey = process.env.OPENAI_API_KEY || '';
							const baseUrl = process.env.OPENAI_BASE_URL || '';
							const aiInterface = new AIDataInterface(apiKey, baseUrl);
							const editedCode = await aiInterface.getCompletion(
								prompt,
								process.env.SYSTEM_PROMPT_EDIT || '',
								process.env.CHAT_MODEL || ''
							);
							
							// Send the proposed edit to the webview
							this._panel.webview.postMessage({
								command: 'displayEditProposal',
								text: editedCode,
								originalCode: originalCode
							});
							break;
						}
						case 'acceptEdit': {
							const editedCode = message.text;
							// Use the stored active file URI instead of the current active editor.
							if (this._activeFileUri) {
								const document = await vscode.workspace.openTextDocument(this._activeFileUri);
								// Open the file in the files tab (e.g. viewColumn.One) so it's not in our extension's panel group.
								const editor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
								
								// Replace the entire document content.
								const fullRange = new vscode.Range(
									document.positionAt(0),
									document.positionAt(document.getText().length)
								);
								
								await editor.edit(editBuilder => {
									editBuilder.replace(fullRange, editedCode);
								});
								
								// Save the document after applying changes.
								await document.save();
								
								// Notify webview that the edit was accepted.
								this._panel.webview.postMessage({ command: 'editAccepted' });
							} else {
								this._panel.webview.postMessage({ 
									command: 'displayEditError', 
									text: 'Active file not found. Please open a file to edit.' 
								});
							}
							break;
						}
						case 'rejectEdit': {
							// Just notify the webview that the edit was rejected
							this._panel.webview.postMessage({ command: 'editRejected' });
							break;
						}
						case 'askQuestion': {
							if (!Auth.currentToken || !(await PaymentStatus.isActive())) {
								this._panel.webview.postMessage({ command: 'displayResponse', text: 'Payment is inactive.' });
								return;
							}
							let code = '';
							let cleanedQuestion = message.text;
							if (message.text.includes("#workspace")) {
								// Remove "#workspace" from the question
								cleanedQuestion = message.text.replace(/#workspace/g, "").trim();
								// Gather all files from the file explorer (all files in the workspace)
								const workspaceFiles = await vscode.workspace.findFiles("**/*.*", "**/{node_modules,.git}/**", 10);
								let workspaceCode = "";
								const decoder = new TextDecoder("utf8");
								for (const fileUri of workspaceFiles) {
									try {
										const fileBytes = await vscode.workspace.fs.readFile(fileUri);
										workspaceCode += `\n---- File: ${fileUri.fsPath} ----\n` + decoder.decode(fileBytes);
									} catch (e) {
										// Skip unreadable files.
									}
								}
								// Use gathered workspace code
								code = workspaceCode;
							} else {
								const editor = vscode.window.activeTextEditor;
								code = editor ? editor.document.getText() : this._codeContext;
							}
							const prompt = `Question: ${cleanedQuestion}\n\nCurrent Code:\n${code}`;
							const apiKey = process.env.OPENAI_API_KEY || '';
							const baseUrl = process.env.OPENAI_BASE_URL || '';
							const aiInterface = new AIDataInterface(apiKey, baseUrl);
							try {
								const answer = await aiInterface.getCompletion(
									prompt,
									process.env.SYSTEM_PROMPT_CHAT || '',
									process.env.CHAT_MODEL || ''
								);
								
								// Make sure we have a non-empty response
								if (!answer || answer.trim() === '') {
									console.error('Empty response received from AI');
									this._panel.webview.postMessage({ 
										command: 'displayResponse', 
										text: 'Sorry, I was unable to generate a response. Please try again.' 
									});
								} else {
									// Send valid response to webview
									console.log('Sending AI response to webview:', answer.substring(0, 100) + '...');
									this._panel.webview.postMessage({ command: 'displayResponse', text: answer });
								}
							} catch (error) {
								console.error('Error getting AI completion:', error);
								this._panel.webview.postMessage({ 
									command: 'displayResponse', 
									text: 'An error occurred while processing your request. Please try again.' 
								});
							}
							break;
							}
						case 'persistMessages': { 
							ChatPanel.extensionContext.globalState.update('chatMessages', { chat: message.chat, edit: message.edit });
							break;
						}
					}
				} catch (error) {
					console.error("Error handling message in ChatPanel:", error);
					this._panel.webview.postMessage({ command: 'displayResponse', text: `Error: ${error}` });
				}
			},
			undefined,
			[]
		);
	}

	public dispose() {
		ChatPanel.currentPanel = undefined;
		this._activeEditorListener.dispose(); // Dispose the active editor listener as well.
		this._panel.dispose();
	}

	/**
	 * Generate a nonce string for CSP security
	 */
	private _getNonce() {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}

	private _getHtmlForWebview() {
		try {
				// Retrieve stored messages from globalState
				const stored = ChatPanel.extensionContext.globalState.get<{chat: string, edit: string}>('chatMessages') || { chat: '', edit: '' };
			// Get the local paths to required scripts and styles
			const markedUri = this._panel.webview.asWebviewUri(
				vscode.Uri.joinPath(this._extensionUri, 'src', 'static', 'js', 'marked.min.js')
			);
			const scriptUri = this._panel.webview.asWebviewUri(
				vscode.Uri.joinPath(this._extensionUri, 'src', 'static', 'js', 'webview.js')
			);
			const styleUri = this._panel.webview.asWebviewUri(
				vscode.Uri.joinPath(this._extensionUri, 'src', 'static', 'css', 'webview.css')
			);

			// CSP - Content Security Policy
			const nonce = this._getNonce();
			
			return `
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${this._panel.webview.cspSource} https:;">
					<title>QLINXX AI</title>
					<link href="${styleUri}" rel="stylesheet" />
					<script nonce="${nonce}" src="${markedUri}"></script>
					<script nonce="${nonce}">
						// Inject stored messages into the webview
						window.initialChatState = ${JSON.stringify(stored.chat)};
						window.initialEditState = ${JSON.stringify(stored.edit)};
					</script>
				</head>
				<body>
					<div class="app-container">
						<header>
							<div class="tabs">
								<button id="chatTab" class="tab active">Chat</button>
								<button id="editTab" class="tab">Edit</button>
							</div>
							<div class="file-info">
								Active File: <span id="currentFile">None</span>
							</div>
							<div class="reset-context">
								<button id="resetContextBtn">Reset Context</button>
							</div>
						</header>
						
						<main>
							<!-- Chat Tab View -->
							<div id="chatView" class="chat-view">
								<div id="chatHistory" class="chat-history">
									<!-- Messages will be added here -->
									<div class="empty-state">
										<p>Start a conversation with the AI assistant. The assistant uses advanced reasoning and responses can take longer to appear.</p>
									</div>
								</div>
								
								<div class="input-container">
									<textarea id="chatInput" placeholder="Ask a question..." rows="1"></textarea>
									<button id="sendChatBtn">
										<span>Send</span>
										<div class="btn-spinner" style="display: none;"></div>
									</button>
								</div>
							</div>
							
							<!-- Edit Tab View -->
							<div id="editView" class="edit-view" style="display: none;">
								<!-- Edit History -->
								<div id="editHistory" class="edit-history">
									<!-- Empty state message -->
									<div class="empty-state">
										<p>Describe how you want to edit the current file</p>
									</div>
								</div>
								
								<!-- Edit Input View -->
								<div id="editFormView" class="edit-form-view">
									<div class="input-container">
										<button class="file-picker-btn" title="Open File (Cmd+P)">
											<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
												<path fill="currentColor" d="M13.5 1h-11c-.83 0-1.5.67-1.5 1.5v11c0 .83.67 1.5 1.5 1.5h11c.83 0 1.5-.67 1.5-1.5v-11c0-.83-.67-1.5-1.5-1.5zm.5 12.5c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5v-11c0-.28.22-.5.5-.5h11c.28 0 .5.22.5.5v11z"/>
												<path fill="currentColor" d="M4 5h8v1h-8zM4 7h8v1h-8zM4 9h4v1h-4z"/>
											</svg>
										</button>
										<textarea id="editInstruction" placeholder="Describe how you want to edit the current file..." rows="1"></textarea>
										<button id="sendEditBtn">
											<span>Generate</span>
											<div class="btn-spinner" style="display: none;"></div>
										</button>
									</div>
								</div>
								
								<!-- Edit Diff View -->
								<div id="editDiffView" class="edit-diff-view">
									<div class="diff-header">
										<h3>Proposed Changes</h3>
									</div>
									<div id="diffView" class="diff-content">
										<!-- Diff content will be inserted here -->
									</div>
									<div class="edit-actions">
										<button id="acceptEditBtn" class="primary-btn">Accept Changes</button>
										<button id="rejectEditBtn" class="secondary-btn">Discard</button>
									</div>
								</div>
								
								<!-- Loading Indicator -->
								<div id="loadingIndicator" class="loading-indicator" style="display: none;">
									<div class="spinner"></div>
									<p>Generating edit proposal...</p>
								</div>
							</div>
						</main>
					</div>
					
					<script nonce="${nonce}" src="${scriptUri}"></script>
				</body>
				</html>
			`;
		} catch (error) {
			console.error("Error generating HTML in _getHtmlForWebview:", error);
			return `<html><body><h1>Error generating webview content</h1></body></html>`;
		}
	}
}
