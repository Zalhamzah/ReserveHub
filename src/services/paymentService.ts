import Stripe from 'stripe';
import { config } from '@/config/config';
import { prisma } from '@/utils/database';
import { logger } from '@/utils/logger';
import { ValidationError, ConflictError } from '@/middleware/errorHandler';

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

export class PaymentService {
  private static instance: PaymentService;
  private stripe: Stripe;

  private constructor() {
    this.stripe = new Stripe(config.payment.stripe.secretKey, {
      apiVersion: '2023-10-16',
      typescript: true
    });
  }

  public static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  /**
   * Create payment intent for booking deposit
   */
  async createBookingPaymentIntent(
    bookingId: string,
    amount: number,
    currency: string = 'usd',
    description?: string
  ): Promise<PaymentIntent> {
    try {
      // Get booking details
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          business: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      if (!booking) {
        throw new ValidationError('Booking not found');
      }

      // Create payment intent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        description: description || `Booking deposit for ${booking.bookingNumber}`,
        metadata: {
          bookingId,
          customerId: booking.customerId,
          businessId: booking.businessId,
          bookingNumber: booking.bookingNumber,
          customerEmail: booking.customer.email || '',
          customerName: `${booking.customer.firstName} ${booking.customer.lastName}`
        },
        receipt_email: booking.customer.email || undefined,
        statement_descriptor: booking.business.name.substring(0, 22) // Stripe limit
      });

      // Store payment intent in database
      await prisma.payment.create({
        data: {
          id: paymentIntent.id,
          bookingId,
          customerId: booking.customerId,
          businessId: booking.businessId,
          amount,
          currency,
          method: 'CREDIT_CARD',
          gateway: 'STRIPE',
          status: 'PENDING',
          gatewayTransactionId: paymentIntent.id,
          metadata: paymentIntent.metadata
        }
      });

      logger.info(`Payment intent created: ${paymentIntent.id} for booking ${booking.bookingNumber}`);

      return {
        id: paymentIntent.id,
        amount,
        currency,
        status: paymentIntent.status,
        clientSecret: paymentIntent.client_secret!,
        metadata: paymentIntent.metadata
      };

    } catch (error) {
      logger.error('Error creating payment intent:', error);
      throw error;
    }
  }

  /**
   * Confirm payment intent
   */
  async confirmPaymentIntent(paymentIntentId: string): Promise<PaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId);

      // Update payment status in database
      await prisma.payment.update({
        where: { id: paymentIntentId },
        data: {
          status: this.mapStripeStatusToPaymentStatus(paymentIntent.status),
          processedAt: new Date()
        }
      });

      logger.info(`Payment intent confirmed: ${paymentIntentId}`);

      return {
        id: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        clientSecret: paymentIntent.client_secret!,
        metadata: paymentIntent.metadata
      };

    } catch (error) {
      logger.error('Error confirming payment intent:', error);
      throw error;
    }
  }

  /**
   * Get payment intent details
   */
  async getPaymentIntent(paymentIntentId: string): Promise<PaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

      return {
        id: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        clientSecret: paymentIntent.client_secret!,
        metadata: paymentIntent.metadata
      };

    } catch (error) {
      logger.error('Error retrieving payment intent:', error);
      throw error;
    }
  }

  /**
   * Create customer in Stripe
   */
  async createStripeCustomer(
    customerId: string,
    email: string,
    name: string,
    phone?: string
  ): Promise<string> {
    try {
      // Check if customer already exists
      const existingCustomer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { stripeCustomerId: true }
      });

      if (existingCustomer?.stripeCustomerId) {
        return existingCustomer.stripeCustomerId;
      }

      // Create new Stripe customer
      const stripeCustomer = await this.stripe.customers.create({
        email,
        name,
        phone,
        metadata: {
          customerId
        }
      });

      // Update customer with Stripe ID
      await prisma.customer.update({
        where: { id: customerId },
        data: { stripeCustomerId: stripeCustomer.id }
      });

      logger.info(`Stripe customer created: ${stripeCustomer.id} for customer ${customerId}`);

      return stripeCustomer.id;

    } catch (error) {
      logger.error('Error creating Stripe customer:', error);
      throw error;
    }
  }

  /**
   * Save payment method for customer
   */
  async savePaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<PaymentMethod> {
    try {
      // Get customer's Stripe ID
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { stripeCustomerId: true, email: true, firstName: true, lastName: true }
      });

      if (!customer) {
        throw new ValidationError('Customer not found');
      }

      let stripeCustomerId = customer.stripeCustomerId;

      // Create Stripe customer if doesn't exist
      if (!stripeCustomerId) {
        stripeCustomerId = await this.createStripeCustomer(
          customerId,
          customer.email || '',
          `${customer.firstName} ${customer.lastName}`
        );
      }

      // Attach payment method to customer
      await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomerId
      });

      // Get payment method details
      const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId);

      const result: PaymentMethod = {
        id: paymentMethod.id,
        type: paymentMethod.type as 'card' | 'digital_wallet' | 'bank_transfer'
      };

      if (paymentMethod.card) {
        result.last4 = paymentMethod.card.last4;
        result.brand = paymentMethod.card.brand;
        result.expiryMonth = paymentMethod.card.exp_month;
        result.expiryYear = paymentMethod.card.exp_year;
      }

      logger.info(`Payment method saved: ${paymentMethodId} for customer ${customerId}`);

      return result;

    } catch (error) {
      logger.error('Error saving payment method:', error);
      throw error;
    }
  }

  /**
   * Get customer's saved payment methods
   */
  async getCustomerPaymentMethods(customerId: string): Promise<PaymentMethod[]> {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { stripeCustomerId: true }
      });

      if (!customer?.stripeCustomerId) {
        return [];
      }

      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customer.stripeCustomerId,
        type: 'card'
      });

      return paymentMethods.data.map(pm => ({
        id: pm.id,
        type: pm.type as 'card' | 'digital_wallet' | 'bank_transfer',
        last4: pm.card?.last4,
        brand: pm.card?.brand,
        expiryMonth: pm.card?.exp_month,
        expiryYear: pm.card?.exp_year
      }));

    } catch (error) {
      logger.error('Error retrieving customer payment methods:', error);
      throw error;
    }
  }

  /**
   * Process full payment for booking
   */
  async processBookingPayment(
    bookingId: string,
    amount: number,
    paymentMethodId: string,
    currency: string = 'usd'
  ): Promise<PaymentIntent> {
    try {
      // Get booking details
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              stripeCustomerId: true
            }
          },
          business: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      if (!booking) {
        throw new ValidationError('Booking not found');
      }

      // Create payment intent with payment method
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency,
        payment_method: paymentMethodId,
        customer: booking.customer.stripeCustomerId || undefined,
        confirmation_method: 'manual',
        confirm: true,
        description: `Payment for booking ${booking.bookingNumber}`,
        metadata: {
          bookingId,
          customerId: booking.customerId,
          businessId: booking.businessId,
          bookingNumber: booking.bookingNumber,
          customerEmail: booking.customer.email || '',
          customerName: `${booking.customer.firstName} ${booking.customer.lastName}`
        },
        receipt_email: booking.customer.email || undefined,
        statement_descriptor: booking.business.name.substring(0, 22)
      });

      // Store payment in database
      await prisma.payment.create({
        data: {
          id: paymentIntent.id,
          bookingId,
          customerId: booking.customerId,
          businessId: booking.businessId,
          amount,
          currency,
          method: 'CREDIT_CARD',
          gateway: 'STRIPE',
          status: this.mapStripeStatusToPaymentStatus(paymentIntent.status),
          gatewayTransactionId: paymentIntent.id,
          processedAt: paymentIntent.status === 'succeeded' ? new Date() : undefined,
          metadata: paymentIntent.metadata
        }
      });

      logger.info(`Payment processed: ${paymentIntent.id} for booking ${booking.bookingNumber}`);

      return {
        id: paymentIntent.id,
        amount,
        currency,
        status: paymentIntent.status,
        clientSecret: paymentIntent.client_secret!,
        metadata: paymentIntent.metadata
      };

    } catch (error) {
      logger.error('Error processing booking payment:', error);
      throw error;
    }
  }

  /**
   * Refund payment
   */
  async refundPayment(
    paymentId: string,
    amount?: number,
    reason?: string
  ): Promise<RefundResult> {
    try {
      // Get payment details
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId }
      });

      if (!payment) {
        throw new ValidationError('Payment not found');
      }

      if (payment.status !== 'COMPLETED') {
        throw new ConflictError('Can only refund completed payments');
      }

      // Create refund in Stripe
      const refund = await this.stripe.refunds.create({
        payment_intent: payment.gatewayTransactionId,
        amount: amount ? Math.round(amount * 100) : undefined,
        reason: reason as any,
        metadata: {
          paymentId,
          bookingId: payment.bookingId,
          customerId: payment.customerId,
          businessId: payment.businessId
        }
      });

      // Update payment status
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: amount && amount < payment.amount ? 'COMPLETED' : 'REFUNDED',
          refundedAt: new Date(),
          refundAmount: (refund.amount / 100)
        }
      });

      logger.info(`Payment refunded: ${paymentId} - ${refund.amount / 100} ${payment.currency}`);

      return {
        id: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
        reason: refund.reason || undefined
      };

    } catch (error) {
      logger.error('Error refunding payment:', error);
      throw error;
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(event: Stripe.Event): Promise<void> {
    try {
      logger.info(`Handling Stripe webhook: ${event.type}`);

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.canceled':
          await this.handlePaymentIntentCanceled(event.data.object as Stripe.PaymentIntent);
          break;

        case 'charge.dispute.created':
          await this.handleChargeDispute(event.data.object as Stripe.Dispute);
          break;

        default:
          logger.debug(`Unhandled webhook event type: ${event.type}`);
      }

    } catch (error) {
      logger.error('Error handling Stripe webhook:', error);
      throw error;
    }
  }

  /**
   * Get payment history for a booking
   */
  async getBookingPayments(bookingId: string): Promise<any[]> {
    try {
      const payments = await prisma.payment.findMany({
        where: { bookingId },
        orderBy: { createdAt: 'desc' }
      });

      return payments.map(payment => ({
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        status: payment.status,
        processedAt: payment.processedAt,
        refundedAt: payment.refundedAt,
        refundAmount: payment.refundAmount,
        createdAt: payment.createdAt
      }));

    } catch (error) {
      logger.error('Error retrieving booking payments:', error);
      throw error;
    }
  }

  /**
   * Calculate booking total with taxes and fees
   */
  calculateBookingTotal(baseAmount: number, taxRate: number = 0.0875): {
    subtotal: number;
    tax: number;
    total: number;
  } {
    const subtotal = baseAmount;
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100
    };
  }

  // Private helper methods

  private mapStripeStatusToPaymentStatus(stripeStatus: string): any {
    switch (stripeStatus) {
      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_action':
        return 'PENDING';
      case 'processing':
        return 'PROCESSING';
      case 'succeeded':
        return 'COMPLETED';
      case 'canceled':
        return 'CANCELLED';
      case 'requires_capture':
        return 'PENDING';
      default:
        return 'FAILED';
    }
  }

  private async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    try {
      await prisma.payment.update({
        where: { id: paymentIntent.id },
        data: {
          status: 'COMPLETED',
          processedAt: new Date()
        }
      });

      // Update booking status if this was a deposit
      if (paymentIntent.metadata?.bookingId) {
        await prisma.booking.update({
          where: { id: paymentIntent.metadata.bookingId },
          data: { status: 'CONFIRMED' }
        });
      }

      logger.info(`Payment succeeded: ${paymentIntent.id}`);

    } catch (error) {
      logger.error('Error handling payment success:', error);
    }
  }

  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    try {
      await prisma.payment.update({
        where: { id: paymentIntent.id },
        data: { status: 'FAILED' }
      });

      logger.info(`Payment failed: ${paymentIntent.id}`);

    } catch (error) {
      logger.error('Error handling payment failure:', error);
    }
  }

  private async handlePaymentIntentCanceled(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    try {
      await prisma.payment.update({
        where: { id: paymentIntent.id },
        data: { status: 'CANCELLED' }
      });

      logger.info(`Payment canceled: ${paymentIntent.id}`);

    } catch (error) {
      logger.error('Error handling payment cancellation:', error);
    }
  }

  private async handleChargeDispute(dispute: Stripe.Dispute): Promise<void> {
    try {
      // Log dispute for manual review
      logger.warn(`Charge dispute created: ${dispute.id} for charge ${dispute.charge}`);

      // Could implement automated dispute handling here
      // For now, just log for manual review

    } catch (error) {
      logger.error('Error handling charge dispute:', error);
    }
  }
}

export const paymentService = PaymentService.getInstance(); 