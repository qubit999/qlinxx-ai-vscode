// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { AIDataInterface } from './AIDataInterface';
import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/../.env' }); // explicitly load .env from project root
import { AIInlineCompletionProvider } from './AIInlineCompletionProvider';
import { ChatPanel } from './ChatPanel';
import { Auth } from './Auth';
import { PaymentStatus } from './PaymentStatus';
import { InlineEditCommand } from './InlineEditCommand';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Initialize Auth with persisted credentials.
	Auth.initialize(context);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('[Extension "qlinxx-coder" is now active]');

	const apiKey = process.env.OPENAI_API_KEY || '';
	const baseUrl = process.env.OPENAI_BASE_URL || '';
	const completionService = new AIDataInterface(apiKey, baseUrl);

	// Register login command.
	const loginCommand = vscode.commands.registerCommand('qlinxx-login-command', async () => {
		const email = await vscode.window.showInputBox({ prompt: 'Enter your email' });
		if (!email) { return; }
		const password = await vscode.window.showInputBox({ prompt: 'Enter your password', password: true });
		if (!password) { return; }
		const success = await Auth.login(email, password);
		if (success) {
			vscode.window.showInformationMessage("Logged in successfully.");
		}
	});
	context.subscriptions.push(loginCommand);

	// Inline edit command.
	context.subscriptions.push(
		vscode.commands.registerCommand('qlinxx-inline-edit-command', InlineEditCommand.execute)
	);

	// Register logout command.
	const logoutCommand = vscode.commands.registerCommand('qlinxx-logout-command', () => {
		Auth.logout();
	});
	context.subscriptions.push(logoutCommand);

	// Wrap test command to check login and payment status.
	const disposable = vscode.commands.registerCommand('qlinxx-test-command', async () => {
		if (!Auth.currentToken) {
			vscode.window.showErrorMessage("Please login first.");
			return;
		}
		const active = await PaymentStatus.isActive();
		if (!active) {
			vscode.window.showErrorMessage("Payment is inactive.");
			return;
		}
		vscode.window.showInformationMessage('Hello from qlinxx-coder! 🚀 Extension is active!');
	});
	context.subscriptions.push(disposable);

	const chatPanelDisposable = vscode.commands.registerCommand('qlinxx-chat-window', async () => {
		if (!Auth.currentToken) {
			vscode.window.showErrorMessage("Please login first.");
			return;
		}
		const active = await PaymentStatus.isActive();
		if (!active) {
			vscode.window.showErrorMessage("Payment is inactive.");
			return;
		}
		// Pass both extensionUri and context to ChatPanel.createOrShow.
		ChatPanel.createOrShow(context.extensionUri, context);
	});
	context.subscriptions.push(chatPanelDisposable);

	// New command to open the registration page.
	const registerDisposable = vscode.commands.registerCommand('qlinxx-register-command', () => {
		vscode.env.openExternal(vscode.Uri.parse(process.env.REGISTER_ENDPOINT || 'https://qlinxx.com/register'));
	});
	context.subscriptions.push(registerDisposable);

	context.subscriptions.push(
		vscode.languages.registerInlineCompletionItemProvider({ scheme: '*' }, new AIInlineCompletionProvider(completionService))
	);
}

// This method is called when your extension is deactivated
export function deactivate() {
	console.log('[Extension "qlinxx-coder" is now deactivated]');
}
