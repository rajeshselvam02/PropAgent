declare function verifyStripeSignature(payload: string, signature: string, secret: string): boolean;
declare function handleSubscriptionCreated(subscription: any): Promise<void>;
declare function handleSubscriptionUpdated(subscription: any): Promise<void>;
declare function handleSubscriptionDeleted(subscription: any): Promise<void>;
declare function handlePaymentFailed(invoice: any): Promise<void>;
declare function handleCheckoutCompleted(session: any): Promise<void>;
export { handleSubscriptionCreated, handleSubscriptionUpdated, handleSubscriptionDeleted, handlePaymentFailed, handleCheckoutCompleted, verifyStripeSignature };
//# sourceMappingURL=stripe-webhook.d.ts.map