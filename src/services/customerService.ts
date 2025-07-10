import { PrismaClient, Customer, VipStatus, Prisma } from '@prisma/client';
import { logger } from '@/utils/logger';
import { ApiError } from '@/middleware/errorHandler';

const prisma = new PrismaClient();

export interface CreateCustomerData {
  email?: string;
  phone?: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  preferences?: any;
  tags?: string[];
  vipStatus?: VipStatus;
  notes?: string;
  businessId: string;
}

export interface UpdateCustomerData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  preferences?: any;
  tags?: string[];
  vipStatus?: VipStatus;
  notes?: string;
  isActive?: boolean;
}

export interface CustomerSearchFilters {
  businessId: string;
  search?: string;
  email?: string;
  phone?: string;
  vipStatus?: VipStatus;
  tags?: string[];
  isActive?: boolean;
  minTotalSpent?: number;
  maxTotalSpent?: number;
  minTotalVisits?: number;
  maxTotalVisits?: number;
  lastVisitAfter?: Date;
  lastVisitBefore?: Date;
}

export interface CustomerStats {
  totalCustomers: number;
  activeCustomers: number;
  vipCustomers: number;
  averageSpent: number;
  averageVisits: number;
  newCustomersThisMonth: number;
  returningCustomers: number;
}

export class CustomerService {
  async createCustomer(data: CreateCustomerData): Promise<Customer> {
    try {
      // Validate business exists
      const business = await prisma.business.findUnique({
        where: { id: data.businessId }
      });

      if (!business) {
        throw new ApiError('Business not found', 404);
      }

      // Check for duplicate email/phone within business
      if (data.email) {
        const existingEmail = await prisma.customer.findFirst({
          where: {
            email: data.email,
            businessId: data.businessId
          }
        });
        if (existingEmail) {
          throw new ApiError('Customer with this email already exists', 409);
        }
      }

      if (data.phone) {
        const existingPhone = await prisma.customer.findFirst({
          where: {
            phone: data.phone,
            businessId: data.businessId
          }
        });
        if (existingPhone) {
          throw new ApiError('Customer with this phone already exists', 409);
        }
      }

      // Create customer
      const customer = await prisma.customer.create({
        data: {
          ...data,
          preferences: data.preferences || {},
          tags: data.tags || []
        },
        include: {
          business: {
            select: { id: true, name: true }
          },
          bookings: {
            select: {
              id: true,
              bookingNumber: true,
              bookingDate: true,
              status: true
            },
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        }
      });

      logger.info(`Customer created: ${customer.id} for business: ${data.businessId}`);
      return customer;
    } catch (error) {
      logger.error('Error creating customer:', error);
      throw error;
    }
  }

  async getCustomerById(customerId: string, businessId: string): Promise<Customer> {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          businessId
        },
        include: {
          business: {
            select: { id: true, name: true }
          },
          bookings: {
            select: {
              id: true,
              bookingNumber: true,
              bookingDate: true,
              bookingTime: true,
              partySize: true,
              status: true,
              totalAmount: true,
              confirmationCode: true
            },
            orderBy: { createdAt: 'desc' },
            take: 10
          },
          payments: {
            select: {
              id: true,
              amount: true,
              method: true,
              status: true,
              createdAt: true
            },
            orderBy: { createdAt: 'desc' },
            take: 10
          },
          waitlistEntries: {
            select: {
              id: true,
              partySize: true,
              status: true,
              position: true,
              estimatedWaitTime: true,
              joinedAt: true
            },
            orderBy: { joinedAt: 'desc' },
            take: 5
          }
        }
      });

      if (!customer) {
        throw new ApiError('Customer not found', 404);
      }

      return customer;
    } catch (error) {
      logger.error('Error getting customer:', error);
      throw error;
    }
  }

  async updateCustomer(
    customerId: string,
    businessId: string,
    data: UpdateCustomerData
  ): Promise<Customer> {
    try {
      // Check if customer exists
      const existingCustomer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          businessId
        }
      });

      if (!existingCustomer) {
        throw new ApiError('Customer not found', 404);
      }

      // Check for duplicate email/phone (excluding current customer)
      if (data.email && data.email !== existingCustomer.email) {
        const existingEmail = await prisma.customer.findFirst({
          where: {
            email: data.email,
            businessId,
            id: { not: customerId }
          }
        });
        if (existingEmail) {
          throw new ApiError('Customer with this email already exists', 409);
        }
      }

      if (data.phone && data.phone !== existingCustomer.phone) {
        const existingPhone = await prisma.customer.findFirst({
          where: {
            phone: data.phone,
            businessId,
            id: { not: customerId }
          }
        });
        if (existingPhone) {
          throw new ApiError('Customer with this phone already exists', 409);
        }
      }

      // Update customer
      const customer = await prisma.customer.update({
        where: { id: customerId },
        data,
        include: {
          business: {
            select: { id: true, name: true }
          },
          bookings: {
            select: {
              id: true,
              bookingNumber: true,
              bookingDate: true,
              status: true
            },
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        }
      });

      logger.info(`Customer updated: ${customerId} for business: ${businessId}`);
      return customer;
    } catch (error) {
      logger.error('Error updating customer:', error);
      throw error;
    }
  }

  async deleteCustomer(customerId: string, businessId: string): Promise<void> {
    try {
      // Check if customer exists and belongs to business
      const customer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          businessId
        }
      });

      if (!customer) {
        throw new ApiError('Customer not found', 404);
      }

      // Check if customer has active bookings
      const activeBookings = await prisma.booking.count({
        where: {
          customerId,
          status: {
            in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'SEATED']
          }
        }
      });

      if (activeBookings > 0) {
        throw new ApiError('Cannot delete customer with active bookings', 409);
      }

      // Soft delete (deactivate)
      await prisma.customer.update({
        where: { id: customerId },
        data: { isActive: false }
      });

      logger.info(`Customer deleted: ${customerId} for business: ${businessId}`);
    } catch (error) {
      logger.error('Error deleting customer:', error);
      throw error;
    }
  }

  async searchCustomers(
    filters: CustomerSearchFilters,
    page: number = 1,
    limit: number = 10
  ): Promise<{
    customers: Customer[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      
      const whereClause: Prisma.CustomerWhereInput = {
        businessId: filters.businessId,
        isActive: filters.isActive ?? true
      };

      // Search by name, email, or phone
      if (filters.search) {
        whereClause.OR = [
          { firstName: { contains: filters.search, mode: 'insensitive' } },
          { lastName: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
          { phone: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      // Specific filters
      if (filters.email) {
        whereClause.email = { contains: filters.email, mode: 'insensitive' };
      }
      if (filters.phone) {
        whereClause.phone = { contains: filters.phone, mode: 'insensitive' };
      }
      if (filters.vipStatus) {
        whereClause.vipStatus = filters.vipStatus;
      }
      if (filters.tags && filters.tags.length > 0) {
        whereClause.tags = { hasSome: filters.tags };
      }
      if (filters.minTotalSpent !== undefined) {
        whereClause.totalSpent = { gte: filters.minTotalSpent };
      }
      if (filters.maxTotalSpent !== undefined) {
        whereClause.totalSpent = whereClause.totalSpent && typeof whereClause.totalSpent === 'object'
          ? { ...whereClause.totalSpent, lte: filters.maxTotalSpent }
          : { lte: filters.maxTotalSpent };
      }
      if (filters.minTotalVisits !== undefined) {
        whereClause.totalVisits = { gte: filters.minTotalVisits };
      }
      if (filters.maxTotalVisits !== undefined) {
        whereClause.totalVisits = whereClause.totalVisits && typeof whereClause.totalVisits === 'object'
          ? { ...whereClause.totalVisits, lte: filters.maxTotalVisits }
          : { lte: filters.maxTotalVisits };
      }
      if (filters.lastVisitAfter) {
        whereClause.lastVisit = { gte: filters.lastVisitAfter };
      }
      if (filters.lastVisitBefore) {
        whereClause.lastVisit = whereClause.lastVisit && typeof whereClause.lastVisit === 'object'
          ? { ...whereClause.lastVisit, lte: filters.lastVisitBefore }
          : { lte: filters.lastVisitBefore };
      }

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({
          where: whereClause,
          include: {
            business: {
              select: { id: true, name: true }
            },
            bookings: {
              select: {
                id: true,
                bookingNumber: true,
                bookingDate: true,
                status: true
              },
              orderBy: { createdAt: 'desc' },
              take: 3
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.customer.count({ where: whereClause })
      ]);

      return {
        customers,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error('Error searching customers:', error);
      throw error;
    }
  }

  async getCustomerStats(businessId: string): Promise<CustomerStats> {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [
        totalCustomers,
        activeCustomers,
        vipCustomers,
        newCustomersThisMonth,
        avgStats,
        returningCustomers
      ] = await Promise.all([
        prisma.customer.count({
          where: { businessId }
        }),
        prisma.customer.count({
          where: { businessId, isActive: true }
        }),
        prisma.customer.count({
          where: { businessId, vipStatus: { not: 'REGULAR' } }
        }),
        prisma.customer.count({
          where: {
            businessId,
            createdAt: { gte: startOfMonth }
          }
        }),
        prisma.customer.aggregate({
          where: { businessId, isActive: true },
          _avg: {
            totalSpent: true,
            totalVisits: true
          }
        }),
        prisma.customer.count({
          where: {
            businessId,
            totalVisits: { gt: 1 }
          }
        })
      ]);

      return {
        totalCustomers,
        activeCustomers,
        vipCustomers,
        averageSpent: avgStats._avg.totalSpent || 0,
        averageVisits: avgStats._avg.totalVisits || 0,
        newCustomersThisMonth,
        returningCustomers
      };
    } catch (error) {
      logger.error('Error getting customer stats:', error);
      throw error;
    }
  }

  async updateCustomerVisitStats(customerId: string, amount: number): Promise<void> {
    try {
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          totalVisits: { increment: 1 },
          totalSpent: { increment: amount },
          lastVisit: new Date()
        }
      });

      // Update average spent
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { totalSpent: true, totalVisits: true }
      });

      if (customer && customer.totalVisits > 0) {
        const averageSpent = customer.totalSpent / customer.totalVisits;
        await prisma.customer.update({
          where: { id: customerId },
          data: { averageSpent }
        });
      }

      logger.info(`Customer visit stats updated: ${customerId}`);
    } catch (error) {
      logger.error('Error updating customer visit stats:', error);
      throw error;
    }
  }

  async getCustomersByTag(businessId: string, tag: string): Promise<Customer[]> {
    try {
      return await prisma.customer.findMany({
        where: {
          businessId,
          tags: { has: tag },
          isActive: true
        },
        include: {
          business: {
            select: { id: true, name: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      logger.error('Error getting customers by tag:', error);
      throw error;
    }
  }

  async addCustomerTag(customerId: string, businessId: string, tag: string): Promise<Customer> {
    try {
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, businessId }
      });

      if (!customer) {
        throw new ApiError('Customer not found', 404);
      }

      const updatedTags = [...(customer.tags || [])];
      if (!updatedTags.includes(tag)) {
        updatedTags.push(tag);
      }

      return await prisma.customer.update({
        where: { id: customerId },
        data: { tags: updatedTags },
        include: {
          business: {
            select: { id: true, name: true }
          }
        }
      });
    } catch (error) {
      logger.error('Error adding customer tag:', error);
      throw error;
    }
  }

  async removeCustomerTag(customerId: string, businessId: string, tag: string): Promise<Customer> {
    try {
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, businessId }
      });

      if (!customer) {
        throw new ApiError('Customer not found', 404);
      }

      const updatedTags = (customer.tags || []).filter(t => t !== tag);

      return await prisma.customer.update({
        where: { id: customerId },
        data: { tags: updatedTags },
        include: {
          business: {
            select: { id: true, name: true }
          }
        }
      });
    } catch (error) {
      logger.error('Error removing customer tag:', error);
      throw error;
    }
  }
}

export const customerService = new CustomerService(); 