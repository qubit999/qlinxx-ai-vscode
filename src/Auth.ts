import * as vscode from 'vscode';
import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/../.env' });

export class Auth {
	// Store the token upon successful login.
	public static currentToken: string = "";
	// New field for user id.
	public static currentUserId: string = "";
	// New static property to store extension context.
	public static extensionContext: vscode.ExtensionContext | undefined;
	
	// New initialize method to load persisted credentials.
	public static initialize(context: vscode.ExtensionContext): void {
		Auth.extensionContext = context;
		Auth.currentToken = context.globalState.get<string>('currentToken') || "";
		Auth.currentUserId = context.globalState.get<string>('currentUserId') || "";
	}
  
	// Login method which returns a boolean success indicator.
	public static async login(email: string, password: string): Promise<boolean> {
		try {
			const response = await fetch(process.env.LOGIN_ENDPOINT || '', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password })
			});
			if (response.ok) {
				const data: any = await response.json();
				const token = data.token;
				if (token) {
					this.currentToken = token;
					if(data.id) {
						this.currentUserId = data.id;
					}
					console.debug('Auth: Login successful');
					// Persist credentials
					Auth.extensionContext?.globalState.update('currentToken', this.currentToken);
					Auth.extensionContext?.globalState.update('currentUserId', this.currentUserId);
					return true;
				}
			}
			vscode.window.showErrorMessage("Login failed. Check your credentials.");
			console.debug('Auth: Login failed');
			return false;
		} catch (error) {
			console.debug('Auth: Login error', error);
			vscode.window.showErrorMessage("Login error.");
			return false;
		}
	}
	
	// New logout method
	public static logout(): void {
		console.debug('Auth: Logging out');
		this.currentToken = "";
		this.currentUserId = "";
		// Clear persisted credentials
		Auth.extensionContext?.globalState.update('currentToken', "");
		Auth.extensionContext?.globalState.update('currentUserId', "");
		vscode.window.showInformationMessage("Logged out successfully.");
		console.debug('Auth: Logout complete');
	}
}
