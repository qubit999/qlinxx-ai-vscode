import * as vscode from 'vscode';
import { AIDataInterface } from './AIDataInterface';
import * as dotenv from 'dotenv';
import { Auth } from './Auth';
import { PaymentStatus } from './PaymentStatus';
dotenv.config({ path: __dirname + '/../.env' });

export class AIInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    constructor(private service: AIDataInterface) {}

    public async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[]> {
        // Only work if the user is logged in and payment is active.
        if (!Auth.currentToken || !(await PaymentStatus.isActive())) {
            return [];
        }
        const text = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
        console.log('Inline request text:', text);
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (token.isCancellationRequested) {
                return [];
            }
            
            const wordRange = document.getWordRangeAtPosition(position);
            const insertRange = wordRange 
                ? new vscode.Range(position, wordRange.end) 
                : new vscode.Range(position, position);

            const suggestion = await this.service.getCompletion(text, process.env.SYSTEM_PROMPT_COMPLETION || '', process.env.COMPLETION_MODEL || '');
            if (!suggestion) {
                console.error('No suggestion returned or error occurred. Input text:', text);
            }
            
            return [
                {
                    insertText: suggestion,
                    range: insertRange
                }
            ];
        } catch (error) {
            console.error('Error in provideInlineCompletionItems:', error);
            return [];
        }
    }
}