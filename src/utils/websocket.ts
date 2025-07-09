import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';
import { prisma } from '@/utils/database';

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
    role: string;
    businessId: string;
  };
}

let io: SocketIOServer;

export const initializeWebSocket = (server: HttpServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: config.cors.origin,
      credentials: config.cors.credentials
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const payload = jwt.verify(token, config.jwt.secret) as any;
      
      // Verify user exists and is active
      const user = await prisma.user.findFirst({
        where: {
          id: payload.userId,
          isActive: true
        },
        select: {
          id: true,
          email: true,
          role: true,
          businessId: true
        }
      });

      if (!user) {
        return next(new Error('User not found or inactive'));
      }

      socket.user = user;
      next();
    } catch (error) {
      logger.error('WebSocket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket: AuthenticatedSocket) => {
    if (!socket.user) return;

    logger.info(`WebSocket connected: ${socket.user.email} (${socket.user.id})`);

    // Join business room for business-specific updates
    socket.join(`business:${socket.user.businessId}`);
    
    // Join user room for user-specific notifications
    socket.join(`user:${socket.user.id}`);

    // Handle booking events
    socket.on('subscribe:bookings', (data) => {
      if (data.businessId === socket.user?.businessId || socket.user?.role === 'SUPER_ADMIN') {
        socket.join(`bookings:${data.businessId}`);
        logger.debug(`User ${socket.user?.id} subscribed to bookings:${data.businessId}`);
      }
    });

    socket.on('unsubscribe:bookings', (data) => {
      socket.leave(`bookings:${data.businessId}`);
      logger.debug(`User ${socket.user?.id} unsubscribed from bookings:${data.businessId}`);
    });

    // Handle waitlist events
    socket.on('subscribe:waitlist', (data) => {
      if (data.businessId === socket.user?.businessId || socket.user?.role === 'SUPER_ADMIN') {
        socket.join(`waitlist:${data.businessId}`);
        logger.debug(`User ${socket.user?.id} subscribed to waitlist:${data.businessId}`);
      }
    });

    socket.on('unsubscribe:waitlist', (data) => {
      socket.leave(`waitlist:${data.businessId}`);
      logger.debug(`User ${socket.user?.id} unsubscribed from waitlist:${data.businessId}`);
    });

    // Handle table status events
    socket.on('subscribe:tables', (data) => {
      if (data.businessId === socket.user?.businessId || socket.user?.role === 'SUPER_ADMIN') {
        socket.join(`tables:${data.businessId}`);
        logger.debug(`User ${socket.user?.id} subscribed to tables:${data.businessId}`);
      }
    });

    socket.on('unsubscribe:tables', (data) => {
      socket.leave(`tables:${data.businessId}`);
      logger.debug(`User ${socket.user?.id} unsubscribed from tables:${data.businessId}`);
    });

    // Handle real-time ping
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket disconnected: ${socket.user?.email} (${reason})`);
    });

    // Handle connection errors
    socket.on('error', (error) => {
      logger.error('WebSocket error:', error);
    });
  });

  logger.info('WebSocket server initialized');
  return io;
};

// Event emitters for business logic
export const websocketEvents = {
  // Booking events
  bookingCreated: (businessId: string, booking: any) => {
    if (io) {
      io.to(`bookings:${businessId}`).emit('booking:created', booking);
      io.to(`business:${businessId}`).emit('notification', {
        type: 'booking_created',
        data: booking,
        timestamp: new Date().toISOString()
      });
    }
  },

  bookingUpdated: (businessId: string, booking: any) => {
    if (io) {
      io.to(`bookings:${businessId}`).emit('booking:updated', booking);
      io.to(`business:${businessId}`).emit('notification', {
        type: 'booking_updated',
        data: booking,
        timestamp: new Date().toISOString()
      });
    }
  },

  bookingCancelled: (businessId: string, booking: any) => {
    if (io) {
      io.to(`bookings:${businessId}`).emit('booking:cancelled', booking);
      io.to(`business:${businessId}`).emit('notification', {
        type: 'booking_cancelled',
        data: booking,
        timestamp: new Date().toISOString()
      });
    }
  },

  // Waitlist events
  waitlistUpdated: (businessId: string, waitlistEntry: any) => {
    if (io) {
      io.to(`waitlist:${businessId}`).emit('waitlist:updated', waitlistEntry);
      
      // Notify the specific customer
      if (waitlistEntry.customerId) {
        io.to(`user:${waitlistEntry.customerId}`).emit('waitlist:position_updated', {
          position: waitlistEntry.position,
          estimatedWaitTime: waitlistEntry.estimatedWaitTime,
          timestamp: new Date().toISOString()
        });
      }
    }
  },

  // Table events
  tableStatusChanged: (businessId: string, table: any) => {
    if (io) {
      io.to(`tables:${businessId}`).emit('table:status_changed', table);
      io.to(`business:${businessId}`).emit('notification', {
        type: 'table_status_changed',
        data: table,
        timestamp: new Date().toISOString()
      });
    }
  },

  // User notifications
  userNotification: (userId: string, notification: any) => {
    if (io) {
      io.to(`user:${userId}`).emit('notification', {
        ...notification,
        timestamp: new Date().toISOString()
      });
    }
  },

  // Business-wide notifications
  businessNotification: (businessId: string, notification: any) => {
    if (io) {
      io.to(`business:${businessId}`).emit('notification', {
        ...notification,
        timestamp: new Date().toISOString()
      });
    }
  },

  // Availability events
  availabilityUpdated: (businessId: string, update: any) => {
    if (io) {
      io.to(`business:${businessId}`).emit('availability:updated', update);
    }
  }
};

export { io }; 