import * as vscode from 'vscode';
import { AIDataInterface } from './AIDataInterface';
import { Auth } from './Auth';
import { PaymentStatus } from './PaymentStatus';

export class InlineEditCommand {
  public static register(): vscode.Disposable {
    return vscode.commands.registerCommand('qlinxx-inline-edit-command', async () => {
      await InlineEditCommand.execute();
    });
  }

  public static async execute() {
    // Check for login and payment status.
    if (!Auth.currentToken) {
      vscode.window.showErrorMessage("Please login first.");
      return;
    }
    if (!(await PaymentStatus.isActive())) {
      vscode.window.showErrorMessage("Payment is inactive.");
      return;
    }
    // Get the active editor and selected text.
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor.");
      return;
    }
    const selection = editor.selection;
    if (selection.isEmpty) {
      vscode.window.showErrorMessage("Please select text to edit inline.");
      return;
    }
    const selectedText = editor.document.getText(selection);
    
    // Ask the user for an inline edit instruction.
    const instruction = await vscode.window.showInputBox({ prompt: 'Enter inline edit instruction' });
    if (!instruction) {
      vscode.window.showErrorMessage("Edit instruction cannot be empty.");
      return;
    }
    
    // Construct a prompt using the selected text and instruction.
    const prompt = `Inline Edit Request:\nInstruction: ${instruction}\n\nSelected Text:\n${selectedText}`;
    const apiKey = process.env.OPENAI_API_KEY || '';
    const baseUrl = process.env.OPENAI_BASE_URL || '';
    const aiInterface = new AIDataInterface(apiKey, baseUrl);
    
    // Show progress notification.
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Processing Inline Edit',
      cancellable: false
    }, async (progress) => {
      progress.report({ increment: 0 });
      try {
        const editedText = await aiInterface.getCompletion(
          prompt,
          process.env.SYSTEM_PROMPT_EDIT || '',
          process.env.EDIT_MODEL || ''
        );
        if (!editedText || editedText.trim() === '') {
          vscode.window.showErrorMessage("Failed to generate inline edit.");
          return;
        }
        // Replace the selection with the AI edited text.
        editor.edit(editBuilder => {
          editBuilder.replace(selection, editedText);
        });
        vscode.window.showInformationMessage("Inline edit applied successfully.");
      } catch (error) {
        vscode.window.showErrorMessage("Error during inline edit. Check the console for details.");
        console.error("Error in InlineEditCommand.execute:", error);
      }
      progress.report({ increment: 100 });
    });
  }
}
