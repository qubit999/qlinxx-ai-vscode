import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/../.env' });
import { Auth } from './Auth';

export class PaymentStatus {
	public static async isActive(): Promise<boolean> {
		const userId = Auth.currentUserId;
		if (!userId) {
			console.debug('PaymentStatus: No logged in user id.');
			return false;
		}
		const url = `${process.env.QLINXX_BASE_URL}/payments/payment_status/${userId}/vscode`;
		try {
			const response = await fetch(url);
			if (response.ok) {
				const data: any = await response.json();
				return data.status === "active";
			}
			console.debug('PaymentStatus: Non-OK response');
			return false;
		} catch (error) {
			console.debug('PaymentStatus: Error fetching payment status:', error);
			return false;
		}
	}
}
