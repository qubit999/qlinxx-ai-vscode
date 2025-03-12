import OpenAI from 'openai';
import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/../.env' });

export class AIDataInterface {
	private openai: OpenAI;
	constructor(apiKey: string, baseUrl?: string) {
		const configuration = {
			apiKey: apiKey,
			baseUrl: baseUrl,
		};
		this.openai = new OpenAI(configuration);
	}

	public async getCompletion(prompt: string, system_prompt: string, model: string): Promise<string> {
		console.log('getCompletion prompt:', prompt);
		try {
			const response = await this.openai.chat.completions.create({
				model: model,
				messages: [
					{ role: 'system', content: system_prompt || prompt },
					{ role: 'user', content: prompt }
				],
			});
			console.log('Raw response from OpenAI:', response);
			return response.choices[0].message.content || '';
		} catch (error) {
			console.error('Error in getCompletion:', error);
			return '';
		}
	}
}
