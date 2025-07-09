import { PrismaClient, WaitlistEntry, WaitlistStatus, Prisma } from '@prisma/client';
import { logger } from '@/utils/logger';
import { ApiError } from '@/middleware/errorHandler';
import { emailService } from '@/services/emailService';
import { smsService } from '@/services/smsService';
import { redis } from '@/utils/redis';

const prisma = new PrismaClient();

export interface CreateWaitlistEntryData {
  customerId: string;
  businessId: string;
  locationId?: string;
  partySize: number;
  preferredTime?: Date;
  specialRequests?: string;
}

export interface UpdateWaitlistEntryData {
  estimatedWaitTime?: number;
  specialRequests?: string;
  status?: WaitlistStatus;
}

export interface WaitlistFilters {
  businessId: string;
  locationId?: string;
  status?: WaitlistStatus;
  minPartySize?: number;
  maxPartySize?: number;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface WaitlistStats {
  totalWaiting: number;
  averageWaitTime: number;
  totalSeated: number;
  totalLeft: number;
  averagePosition: number;
}

export class WaitlistService {
  private readonly POSITION_UPDATE_INTERVAL = 300000; // 5 minutes in milliseconds
  private readonly NOTIFICATION_COOLDOWN = 600000; // 10 minutes in milliseconds

  async addToWaitlist(data: CreateWaitlistEntryData): Promise<WaitlistEntry> {
    try {
      // Validate customer exists
      const customer = await prisma.customer.findUnique({
        where: { id: data.customerId }
      });

      if (!customer) {
        throw new ApiError('Customer not found', 404);
      }

      // Check if customer is already on waitlist
      const existingEntry = await prisma.waitlistEntry.findFirst({
        where: {
          customerId: data.customerId,
          businessId: data.businessId,
          status: 'WAITING'
        }
      });

      if (existingEntry) {
        throw new ApiError('Customer is already on the waitlist', 409);
      }

      // Get next position
      const nextPosition = await this.getNextPosition(data.businessId, data.locationId);

      // Create waitlist entry
      const waitlistEntry = await prisma.waitlistEntry.create({
        data: {
          ...data,
          position: nextPosition,
          status: 'WAITING'
        },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          }
        }
      });

      // Send notification
      await this.sendWaitlistNotification(waitlistEntry);

      // Update wait time estimation
      await this.updateWaitTimeEstimates(data.businessId, data.locationId);

      logger.info(`Customer added to waitlist: ${data.customerId} at position ${nextPosition}`);
      return waitlistEntry;
    } catch (error) {
      logger.error('Error adding to waitlist:', error);
      throw error;
    }
  }

  async updateWaitlistEntry(
    entryId: string,
    businessId: string,
    data: UpdateWaitlistEntryData
  ): Promise<WaitlistEntry> {
    try {
      // Check if entry exists
      const existingEntry = await prisma.waitlistEntry.findFirst({
        where: {
          id: entryId,
          businessId
        }
      });

      if (!existingEntry) {
        throw new ApiError('Waitlist entry not found', 404);
      }

      // Update entry
      const updatedEntry = await prisma.waitlistEntry.update({
        where: { id: entryId },
        data,
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          }
        }
      });

      // If status changed to SEATED, update positions
      if (data.status === 'SEATED') {
        await this.updatePositionsAfterSeating(businessId, existingEntry.position, existingEntry.locationId);
      }

      logger.info(`Waitlist entry updated: ${entryId}`);
      return updatedEntry;
    } catch (error) {
      logger.error('Error updating waitlist entry:', error);
      throw error;
    }
  }

  async removeFromWaitlist(entryId: string, businessId: string, reason: string = 'LEFT'): Promise<void> {
    try {
      // Get the entry
      const entry = await prisma.waitlistEntry.findFirst({
        where: {
          id: entryId,
          businessId
        }
      });

      if (!entry) {
        throw new ApiError('Waitlist entry not found', 404);
      }

      // Update entry status
      await prisma.waitlistEntry.update({
        where: { id: entryId },
        data: {
          status: reason === 'SEATED' ? 'SEATED' : 'LEFT',
          seatedAt: reason === 'SEATED' ? new Date() : undefined,
          leftAt: reason === 'LEFT' ? new Date() : undefined
        }
      });

      // Update positions for remaining customers
      await this.updatePositionsAfterRemoval(businessId, entry.position, entry.locationId);

      logger.info(`Customer removed from waitlist: ${entryId} - ${reason}`);
    } catch (error) {
      logger.error('Error removing from waitlist:', error);
      throw error;
    }
  }

  async getWaitlistByBusiness(
    filters: WaitlistFilters,
    page: number = 1,
    limit: number = 10
  ): Promise<{
    entries: WaitlistEntry[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      
      const whereClause: Prisma.WaitlistEntryWhereInput = {
        businessId: filters.businessId
      };

      // Apply filters
      if (filters.locationId) {
        whereClause.locationId = filters.locationId;
      }
      if (filters.status) {
        whereClause.status = filters.status;
      }
      if (filters.minPartySize) {
        whereClause.partySize = { gte: filters.minPartySize };
      }
             if (filters.maxPartySize) {
         whereClause.partySize = { ...(whereClause.partySize || {}), lte: filters.maxPartySize };
       }
       if (filters.dateFrom) {
         whereClause.joinedAt = { gte: filters.dateFrom };
       }
       if (filters.dateTo) {
         whereClause.joinedAt = { ...(whereClause.joinedAt || {}), lte: filters.dateTo };
       }

      const [entries, total] = await Promise.all([
        prisma.waitlistEntry.findMany({
          where: whereClause,
          include: {
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true
              }
            }
          },
          orderBy: { position: 'asc' },
          skip,
          take: limit
        }),
        prisma.waitlistEntry.count({ where: whereClause })
      ]);

      return {
        entries,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error('Error getting waitlist:', error);
      throw error;
    }
  }

  async getWaitlistStats(businessId: string, locationId?: string): Promise<WaitlistStats> {
    try {
      const whereClause: Prisma.WaitlistEntryWhereInput = {
        businessId
      };

      if (locationId) {
        whereClause.locationId = locationId;
      }

      const [totalWaiting, totalSeated, totalLeft, avgWaitTime, avgPosition] = await Promise.all([
        prisma.waitlistEntry.count({
          where: { ...whereClause, status: 'WAITING' }
        }),
        prisma.waitlistEntry.count({
          where: { ...whereClause, status: 'SEATED' }
        }),
        prisma.waitlistEntry.count({
          where: { ...whereClause, status: 'LEFT' }
        }),
        prisma.waitlistEntry.aggregate({
          where: { ...whereClause, status: 'SEATED', actualWaitTime: { not: null } },
          _avg: { actualWaitTime: true }
        }),
        prisma.waitlistEntry.aggregate({
          where: { ...whereClause, status: 'WAITING' },
          _avg: { position: true }
        })
      ]);

      return {
        totalWaiting,
        totalSeated,
        totalLeft,
        averageWaitTime: avgWaitTime._avg.actualWaitTime || 0,
        averagePosition: avgPosition._avg.position || 0
      };
    } catch (error) {
      logger.error('Error getting waitlist stats:', error);
      throw error;
    }
  }

  async getCustomerPosition(customerId: string, businessId: string): Promise<WaitlistEntry | null> {
    try {
      return await prisma.waitlistEntry.findFirst({
        where: {
          customerId,
          businessId,
          status: 'WAITING'
        },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          }
        }
      });
    } catch (error) {
      logger.error('Error getting customer position:', error);
      throw error;
    }
  }

  async updateWaitTimeEstimates(businessId: string, locationId?: string): Promise<void> {
    try {
      // Get historical data for wait time calculation
      const avgWaitTime = await this.calculateAverageWaitTime(businessId, locationId);
      
      // Update estimates for all waiting customers
      const waitingEntries = await prisma.waitlistEntry.findMany({
        where: {
          businessId,
          locationId,
          status: 'WAITING'
        },
        orderBy: { position: 'asc' }
      });

      for (let i = 0; i < waitingEntries.length; i++) {
        const entry = waitingEntries[i];
        const estimatedWaitTime = avgWaitTime * entry.position;
        
        await prisma.waitlistEntry.update({
          where: { id: entry.id },
          data: { estimatedWaitTime }
        });
      }

      logger.info(`Updated wait time estimates for ${waitingEntries.length} entries`);
    } catch (error) {
      logger.error('Error updating wait time estimates:', error);
    }
  }

  async notifyNext(businessId: string, locationId?: string, count: number = 1): Promise<void> {
    try {
      const nextCustomers = await prisma.waitlistEntry.findMany({
        where: {
          businessId,
          locationId,
          status: 'WAITING'
        },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          }
        },
        orderBy: { position: 'asc' },
        take: count
      });

      // Send table ready notifications
      for (const entry of nextCustomers) {
        await this.sendTableReadyNotification(entry);
      }

      logger.info(`Notified ${nextCustomers.length} customers that their table is ready`);
    } catch (error) {
      logger.error('Error notifying next customers:', error);
    }
  }

  private async getNextPosition(businessId: string, locationId?: string): Promise<number> {
    const maxPosition = await prisma.waitlistEntry.findFirst({
      where: {
        businessId,
        locationId,
        status: 'WAITING'
      },
      orderBy: { position: 'desc' },
      select: { position: true }
    });

    return (maxPosition?.position || 0) + 1;
  }

  private async updatePositionsAfterSeating(businessId: string, seatedPosition: number, locationId?: string): Promise<void> {
    // Update positions for all customers after the seated customer
    await prisma.waitlistEntry.updateMany({
      where: {
        businessId,
        locationId,
        status: 'WAITING',
        position: { gt: seatedPosition }
      },
      data: {
        position: { decrement: 1 }
      }
    });
  }

  private async updatePositionsAfterRemoval(businessId: string, removedPosition: number, locationId?: string): Promise<void> {
    // Update positions for all customers after the removed customer
    await prisma.waitlistEntry.updateMany({
      where: {
        businessId,
        locationId,
        status: 'WAITING',
        position: { gt: removedPosition }
      },
      data: {
        position: { decrement: 1 }
      }
    });
  }

  private async calculateAverageWaitTime(businessId: string, locationId?: string): Promise<number> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const avgWaitTime = await prisma.waitlistEntry.aggregate({
      where: {
        businessId,
        locationId,
        status: 'SEATED',
        seatedAt: { gte: sevenDaysAgo },
        actualWaitTime: { not: null }
      },
      _avg: { actualWaitTime: true }
    });

    return avgWaitTime._avg.actualWaitTime || 20; // Default to 20 minutes if no data
  }

  private async sendWaitlistNotification(entry: WaitlistEntry & { customer: any }): Promise<void> {
    try {
      const business = await prisma.business.findUnique({
        where: { id: entry.businessId },
        select: { name: true, phone: true }
      });

      if (!business) return;

      const notificationData = {
        customerName: `${entry.customer.firstName} ${entry.customer.lastName}`,
        businessName: business.name,
        position: entry.position,
        estimatedWaitTime: entry.estimatedWaitTime,
        businessPhone: business.phone
      };

      // Send email notification
      if (entry.customer.email) {
        await emailService.sendWaitlistNotification({
          ...notificationData,
          customerEmail: entry.customer.email
        });
      }

      // Send SMS notification
      if (entry.customer.phone) {
        await smsService.sendWaitlistNotification({
          ...notificationData,
          customerPhone: entry.customer.phone
        });
      }

      // Update notification count
      await prisma.waitlistEntry.update({
        where: { id: entry.id },
        data: { notificationsSent: { increment: 1 } }
      });
    } catch (error) {
      logger.error('Error sending waitlist notification:', error);
    }
  }

  private async sendTableReadyNotification(entry: WaitlistEntry & { customer: any }): Promise<void> {
    try {
      const business = await prisma.business.findUnique({
        where: { id: entry.businessId },
        select: { name: true }
      });

      if (!business) return;

      const notificationData = {
        customerName: `${entry.customer.firstName} ${entry.customer.lastName}`,
        businessName: business.name,
        confirmationCode: `WL${entry.id.slice(-6).toUpperCase()}`
      };

      // Send SMS notification (more immediate for table ready)
      if (entry.customer.phone) {
        await smsService.sendTableReadyNotification({
          ...notificationData,
          customerPhone: entry.customer.phone
        });
      }

      // Update notification count
      await prisma.waitlistEntry.update({
        where: { id: entry.id },
        data: { notificationsSent: { increment: 1 } }
      });
    } catch (error) {
      logger.error('Error sending table ready notification:', error);
    }
  }

  async startPeriodicUpdates(): Promise<void> {
    // This would typically be called from a cron job or scheduled task
    setInterval(async () => {
      try {
        // Get all businesses with active waitlists
        const activeWaitlists = await prisma.waitlistEntry.findMany({
          where: { status: 'WAITING' },
          distinct: ['businessId', 'locationId'],
          select: { businessId: true, locationId: true }
        });

        // Update wait time estimates for each business/location
        for (const waitlist of activeWaitlists) {
          await this.updateWaitTimeEstimates(waitlist.businessId, waitlist.locationId);
        }

        logger.info('Periodic waitlist updates completed');
      } catch (error) {
        logger.error('Error in periodic waitlist updates:', error);
      }
    }, this.POSITION_UPDATE_INTERVAL);
  }
}

export const waitlistService = new WaitlistService(); 