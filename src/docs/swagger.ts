import swaggerJSDoc from 'swagger-jsdoc';
import { config } from '@/config/config';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'ReserveHub API',
    version: '1.0.0',
    description: 'POS-integrated restaurant reservation system with real-time availability management',
    contact: {
      name: 'ReserveHub API Support',
      email: 'support@reservehub.com'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: `http://${config.host}:${config.port}/api/${config.apiVersion}`,
      description: 'Development server'
    },
    {
      url: `https://api.reservehub.com/${config.apiVersion}`,
      description: 'Production server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas: {
      // Authentication Schemas
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'firstName', 'lastName', 'businessName'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address'
          },
          password: {
            type: 'string',
            minLength: 8,
            description: 'User password (minimum 8 characters)'
          },
          firstName: {
            type: 'string',
            minLength: 1,
            maxLength: 50,
            description: 'User first name'
          },
          lastName: {
            type: 'string',
            minLength: 1,
            maxLength: 50,
            description: 'User last name'
          },
          businessName: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: 'Business name'
          },
          phone: {
            type: 'string',
            description: 'User phone number'
          }
        }
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address'
          },
          password: {
            type: 'string',
            description: 'User password'
          }
        }
      },
      AuthResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          data: {
            type: 'object',
            properties: {
              token: {
                type: 'string',
                description: 'JWT access token'
              },
              refreshToken: {
                type: 'string',
                description: 'JWT refresh token'
              },
              user: {
                $ref: '#/components/schemas/User'
              }
            }
          },
          message: {
            type: 'string',
            example: 'Login successful'
          },
          timestamp: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      
      // User Schema
      User: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'User ID'
          },
          email: {
            type: 'string',
            format: 'email'
          },
          firstName: {
            type: 'string'
          },
          lastName: {
            type: 'string'
          },
          phone: {
            type: 'string'
          },
          role: {
            type: 'string',
            enum: ['SUPER_ADMIN', 'BUSINESS_OWNER', 'MANAGER', 'STAFF', 'CUSTOMER']
          },
          isActive: {
            type: 'boolean'
          },
          createdAt: {
            type: 'string',
            format: 'date-time'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      
      // Customer Schemas
      Customer: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Customer ID'
          },
          email: {
            type: 'string',
            format: 'email'
          },
          phone: {
            type: 'string'
          },
          firstName: {
            type: 'string'
          },
          lastName: {
            type: 'string'
          },
          dateOfBirth: {
            type: 'string',
            format: 'date'
          },
          vipStatus: {
            type: 'string',
            enum: ['REGULAR', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM']
          },
          totalVisits: {
            type: 'integer',
            minimum: 0
          },
          totalSpent: {
            type: 'number',
            minimum: 0
          },
          averageSpent: {
            type: 'number',
            minimum: 0
          },
          lastVisit: {
            type: 'string',
            format: 'date-time'
          },
          tags: {
            type: 'array',
            items: {
              type: 'string'
            }
          },
          notes: {
            type: 'string'
          },
          isActive: {
            type: 'boolean'
          },
          createdAt: {
            type: 'string',
            format: 'date-time'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      
      CreateCustomerRequest: {
        type: 'object',
        required: ['firstName', 'lastName', 'businessId'],
        properties: {
          firstName: {
            type: 'string',
            minLength: 1,
            maxLength: 50
          },
          lastName: {
            type: 'string',
            minLength: 1,
            maxLength: 50
          },
          businessId: {
            type: 'string'
          },
          email: {
            type: 'string',
            format: 'email'
          },
          phone: {
            type: 'string'
          },
          dateOfBirth: {
            type: 'string',
            format: 'date'
          },
          vipStatus: {
            type: 'string',
            enum: ['REGULAR', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM']
          },
          tags: {
            type: 'array',
            items: {
              type: 'string'
            }
          },
          notes: {
            type: 'string',
            maxLength: 1000
          }
        }
      },
      
      // Booking Schemas
      Booking: {
        type: 'object',
        properties: {
          id: {
            type: 'string'
          },
          bookingNumber: {
            type: 'string'
          },
          customerId: {
            type: 'string'
          },
          businessId: {
            type: 'string'
          },
          locationId: {
            type: 'string'
          },
          tableId: {
            type: 'string'
          },
          bookingDate: {
            type: 'string',
            format: 'date'
          },
          bookingTime: {
            type: 'string',
            format: 'date-time'
          },
          duration: {
            type: 'integer',
            minimum: 30,
            maximum: 480
          },
          partySize: {
            type: 'integer',
            minimum: 1,
            maximum: 20
          },
          status: {
            type: 'string',
            enum: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']
          },
          confirmationCode: {
            type: 'string'
          },
          specialRequests: {
            type: 'string'
          },
          notes: {
            type: 'string'
          },
          totalAmount: {
            type: 'number',
            minimum: 0
          },
          depositAmount: {
            type: 'number',
            minimum: 0
          },
          createdAt: {
            type: 'string',
            format: 'date-time'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      
      CreateBookingRequest: {
        type: 'object',
        required: ['customerId', 'businessId', 'bookingDate', 'bookingTime', 'partySize'],
        properties: {
          customerId: {
            type: 'string'
          },
          businessId: {
            type: 'string'
          },
          locationId: {
            type: 'string'
          },
          tableId: {
            type: 'string'
          },
          bookingDate: {
            type: 'string',
            format: 'date'
          },
          bookingTime: {
            type: 'string',
            format: 'date-time'
          },
          duration: {
            type: 'integer',
            minimum: 30,
            maximum: 480,
            default: 90
          },
          partySize: {
            type: 'integer',
            minimum: 1,
            maximum: 20
          },
          specialRequests: {
            type: 'string',
            maxLength: 500
          },
          notes: {
            type: 'string',
            maxLength: 1000
          }
        }
      },
      
      // Waitlist Schemas
      WaitlistEntry: {
        type: 'object',
        properties: {
          id: {
            type: 'string'
          },
          customerId: {
            type: 'string'
          },
          businessId: {
            type: 'string'
          },
          locationId: {
            type: 'string'
          },
          partySize: {
            type: 'integer',
            minimum: 1,
            maximum: 20
          },
          position: {
            type: 'integer',
            minimum: 1
          },
          status: {
            type: 'string',
            enum: ['WAITING', 'SEATED', 'LEFT']
          },
          estimatedWaitTime: {
            type: 'integer',
            minimum: 0
          },
          actualWaitTime: {
            type: 'integer',
            minimum: 0
          },
          specialRequests: {
            type: 'string'
          },
          joinedAt: {
            type: 'string',
            format: 'date-time'
          },
          seatedAt: {
            type: 'string',
            format: 'date-time'
          },
          leftAt: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      
      CreateWaitlistRequest: {
        type: 'object',
        required: ['customerId', 'businessId', 'partySize'],
        properties: {
          customerId: {
            type: 'string'
          },
          businessId: {
            type: 'string'
          },
          locationId: {
            type: 'string'
          },
          partySize: {
            type: 'integer',
            minimum: 1,
            maximum: 20
          },
          preferredTime: {
            type: 'string',
            format: 'date-time'
          },
          specialRequests: {
            type: 'string',
            maxLength: 500
          }
        }
      },
      
      // Common Response Schemas
      SuccessResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          data: {
            type: 'object'
          },
          message: {
            type: 'string'
          },
          timestamp: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              message: {
                type: 'string'
              },
              code: {
                type: 'string'
              },
              timestamp: {
                type: 'string',
                format: 'date-time'
              },
              details: {
                type: 'array',
                items: {
                  type: 'object'
                }
              }
            }
          }
        }
      },
      
      PaginatedResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          data: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object'
                }
              },
              total: {
                type: 'integer'
              },
              page: {
                type: 'integer'
              },
              limit: {
                type: 'integer'
              },
              totalPages: {
                type: 'integer'
              }
            }
          },
          timestamp: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      
      // Health Check Schema
      HealthCheck: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['healthy', 'unhealthy']
          },
          timestamp: {
            type: 'string',
            format: 'date-time'
          },
          version: {
            type: 'string'
          },
          environment: {
            type: 'string'
          },
          uptime: {
            type: 'number'
          },
          services: {
            type: 'object',
            properties: {
              database: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    enum: ['healthy', 'unhealthy']
                  },
                  responseTime: {
                    type: 'string'
                  }
                }
              },
              redis: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    enum: ['healthy', 'unhealthy']
                  },
                  responseTime: {
                    type: 'string'
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  
  // Security applied globally
  security: [
    {
      bearerAuth: []
    }
  ],
  
  // Tags for organization
  tags: [
    {
      name: 'Authentication',
      description: 'User authentication and authorization'
    },
    {
      name: 'Customers',
      description: 'Customer management operations'
    },
    {
      name: 'Bookings',
      description: 'Booking and reservation management'
    },
    {
      name: 'Waitlist',
      description: 'Waitlist queue management'
    },
    {
      name: 'Health',
      description: 'System health and monitoring'
    }
  ],
  
  // Paths will be automatically generated from JSDoc comments
  paths: {}
};

const options = {
  definition: swaggerDefinition,
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts'
  ]
};

export const swaggerSpec = swaggerJSDoc(options);
export default swaggerSpec; 