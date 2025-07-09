import Stripe from 'stripe';
export interface PaymentIntent {
    id: string;
    amount: number;
    currency: string;
    status: string;
    clientSecret: string;
    metadata?: Record<string, string>;
}
export interface PaymentMethod {
    id: string;
    type: 'card' | 'digital_wallet' | 'bank_transfer';
    last4?: string;
    brand?: string;
    expiryMonth?: number;
    expiryYear?: number;
}
export interface RefundResult {
    id: string;
    amount: number;
    status: string;
    reason?: string;
}
export declare class PaymentService {
    private static instance;
    private stripe;
    private constructor();
    static getInstance(): PaymentService;
    /**
     * Create payment intent for booking deposit
     */
    createBookingPaymentIntent(bookingId: string, amount: number, currency?: string, description?: string): Promise<PaymentIntent>;
    /**
     * Confirm payment intent
     */
    confirmPaymentIntent(paymentIntentId: string): Promise<PaymentIntent>;
    /**
     * Get payment intent details
     */
    getPaymentIntent(paymentIntentId: string): Promise<PaymentIntent>;
    /**
     * Create customer in Stripe
     */
    createStripeCustomer(customerId: string, email: string, name: string, phone?: string): Promise<string>;
    /**
     * Save payment method for customer
     */
    savePaymentMethod(customerId: string, paymentMethodId: string): Promise<PaymentMethod>;
    /**
     * Get customer's saved payment methods
     */
    getCustomerPaymentMethods(customerId: string): Promise<PaymentMethod[]>;
    /**
     * Process full payment for booking
     */
    processBookingPayment(bookingId: string, amount: number, paymentMethodId: string, currency?: string): Promise<PaymentIntent>;
    /**
     * Refund payment
     */
    refundPayment(paymentId: string, amount?: number, reason?: string): Promise<RefundResult>;
    /**
     * Handle Stripe webhook events
     */
    handleWebhook(event: Stripe.Event): Promise<void>;
    /**
     * Get payment history for a booking
     */
    getBookingPayments(bookingId: string): Promise<any[]>;
    /**
     * Calculate booking total with taxes and fees
     */
    calculateBookingTotal(baseAmount: number, taxRate?: number): {
        subtotal: number;
        tax: number;
        total: number;
    };
    private mapStripeStatusToPaymentStatus;
    private handlePaymentIntentSucceeded;
    private handlePaymentIntentFailed;
    private handlePaymentIntentCanceled;
    private handleChargeDispute;
}
export declare const paymentService: PaymentService;
//# sourceMappingURL=paymentService.d.ts.map