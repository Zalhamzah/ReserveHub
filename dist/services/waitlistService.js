"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitlistService = exports.WaitlistService = void 0;
const client_1 = require("@prisma/client");
const logger_1 = require("@/utils/logger");
const errorHandler_1 = require("@/middleware/errorHandler");
const emailService_1 = require("@/services/emailService");
const smsService_1 = require("@/services/smsService");
const prisma = new client_1.PrismaClient();
class WaitlistService {
    POSITION_UPDATE_INTERVAL = 300000; // 5 minutes in milliseconds
    NOTIFICATION_COOLDOWN = 600000; // 10 minutes in milliseconds
    async addToWaitlist(data) {
        try {
            // Validate customer exists
            const customer = await prisma.customer.findUnique({
                where: { id: data.customerId }
            });
            if (!customer) {
                throw new errorHandler_1.ApiError('Customer not found', 404);
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
                throw new errorHandler_1.ApiError('Customer is already on the waitlist', 409);
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
            logger_1.logger.info(`Customer added to waitlist: ${data.customerId} at position ${nextPosition}`);
            return waitlistEntry;
        }
        catch (error) {
            logger_1.logger.error('Error adding to waitlist:', error);
            throw error;
        }
    }
    async updateWaitlistEntry(entryId, businessId, data) {
        try {
            // Check if entry exists
            const existingEntry = await prisma.waitlistEntry.findFirst({
                where: {
                    id: entryId,
                    businessId
                }
            });
            if (!existingEntry) {
                throw new errorHandler_1.ApiError('Waitlist entry not found', 404);
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
            logger_1.logger.info(`Waitlist entry updated: ${entryId}`);
            return updatedEntry;
        }
        catch (error) {
            logger_1.logger.error('Error updating waitlist entry:', error);
            throw error;
        }
    }
    async removeFromWaitlist(entryId, businessId, reason = 'LEFT') {
        try {
            // Get the entry
            const entry = await prisma.waitlistEntry.findFirst({
                where: {
                    id: entryId,
                    businessId
                }
            });
            if (!entry) {
                throw new errorHandler_1.ApiError('Waitlist entry not found', 404);
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
            await this.updatePositionsAfterRemoval(businessId, entry.locationId, entry.position);
            logger_1.logger.info(`Customer removed from waitlist: ${entryId} - ${reason}`);
        }
        catch (error) {
            logger_1.logger.error('Error removing from waitlist:', error);
            throw error;
        }
    }
    async getWaitlistByBusiness(filters, page = 1, limit = 10) {
        try {
            const skip = (page - 1) * limit;
            const whereClause = {
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
        }
        catch (error) {
            logger_1.logger.error('Error getting waitlist:', error);
            throw error;
        }
    }
    async getWaitlistStats(businessId, locationId) {
        try {
            const whereClause = {
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
        }
        catch (error) {
            logger_1.logger.error('Error getting waitlist stats:', error);
            throw error;
        }
    }
    async getCustomerPosition(customerId, businessId) {
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
        }
        catch (error) {
            logger_1.logger.error('Error getting customer position:', error);
            throw error;
        }
    }
    async updateWaitTimeEstimates(businessId, locationId) {
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
            logger_1.logger.info(`Updated wait time estimates for ${waitingEntries.length} entries`);
        }
        catch (error) {
            logger_1.logger.error('Error updating wait time estimates:', error);
        }
    }
    async notifyNext(businessId, locationId, count = 1) {
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
            logger_1.logger.info(`Notified ${nextCustomers.length} customers that their table is ready`);
        }
        catch (error) {
            logger_1.logger.error('Error notifying next customers:', error);
        }
    }
    async getNextPosition(businessId, locationId) {
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
    async updatePositionsAfterSeating(businessId, seatedPosition, locationId) {
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
    async updatePositionsAfterRemoval(businessId, removedPosition, locationId) {
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
    async calculateAverageWaitTime(businessId, locationId) {
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
    async sendWaitlistNotification(entry) {
        try {
            const business = await prisma.business.findUnique({
                where: { id: entry.businessId },
                select: { name: true, phone: true }
            });
            if (!business)
                return;
            const notificationData = {
                customerName: `${entry.customer.firstName} ${entry.customer.lastName}`,
                businessName: business.name,
                position: entry.position,
                estimatedWaitTime: entry.estimatedWaitTime,
                businessPhone: business.phone
            };
            // Send email notification
            if (entry.customer.email) {
                await emailService_1.emailService.sendWaitlistNotification({
                    ...notificationData,
                    customerEmail: entry.customer.email
                });
            }
            // Send SMS notification
            if (entry.customer.phone) {
                await smsService_1.smsService.sendWaitlistNotification({
                    ...notificationData,
                    customerPhone: entry.customer.phone
                });
            }
            // Update notification count
            await prisma.waitlistEntry.update({
                where: { id: entry.id },
                data: { notificationsSent: { increment: 1 } }
            });
        }
        catch (error) {
            logger_1.logger.error('Error sending waitlist notification:', error);
        }
    }
    async sendTableReadyNotification(entry) {
        try {
            const business = await prisma.business.findUnique({
                where: { id: entry.businessId },
                select: { name: true }
            });
            if (!business)
                return;
            const notificationData = {
                customerName: `${entry.customer.firstName} ${entry.customer.lastName}`,
                businessName: business.name,
                confirmationCode: `WL${entry.id.slice(-6).toUpperCase()}`
            };
            // Send SMS notification (more immediate for table ready)
            if (entry.customer.phone) {
                await smsService_1.smsService.sendTableReadyNotification({
                    ...notificationData,
                    customerPhone: entry.customer.phone
                });
            }
            // Update notification count
            await prisma.waitlistEntry.update({
                where: { id: entry.id },
                data: { notificationsSent: { increment: 1 } }
            });
        }
        catch (error) {
            logger_1.logger.error('Error sending table ready notification:', error);
        }
    }
    async startPeriodicUpdates() {
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
                logger_1.logger.info('Periodic waitlist updates completed');
            }
            catch (error) {
                logger_1.logger.error('Error in periodic waitlist updates:', error);
            }
        }, this.POSITION_UPDATE_INTERVAL);
    }
}
exports.WaitlistService = WaitlistService;
exports.waitlistService = new WaitlistService();
//# sourceMappingURL=waitlistService.js.map