import request from 'supertest';
import app from '../server';
import { prisma } from '../utils/database';
import { hashPassword } from '../utils/auth';

describe('Authentication API', () => {
  beforeAll(async () => {
    // Setup test database
    await prisma.$connect();
  });

  afterAll(async () => {
    // Clean up
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await prisma.user.deleteMany({
      where: { email: { contains: 'test' } }
    });
    await prisma.business.deleteMany({
      where: { name: { contains: 'Test' } }
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        businessName: 'Test Restaurant',
        phone: '+1234567890'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.firstName).toBe(userData.firstName);
      expect(response.body.data.user.lastName).toBe(userData.lastName);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('should reject registration with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        businessName: 'Test Restaurant'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('Validation failed');
    });

    it('should reject registration with short password', async () => {
      const userData = {
        email: 'test@example.com',
        password: '123',
        firstName: 'Test',
        lastName: 'User',
        businessName: 'Test Restaurant'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('Validation failed');
    });

    it('should reject registration with duplicate email', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        businessName: 'Test Restaurant'
      };

      // First registration
      await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      // Second registration with same email
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('Email already exists');
    });

    it('should reject registration with missing required fields', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123'
        // Missing firstName, lastName, businessName
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('Validation failed');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      // Create test user
      const hashedPassword = await hashPassword('password123');
      
      const business = await prisma.business.create({
        data: {
          name: 'Test Restaurant',
          type: 'RESTAURANT',
          status: 'ACTIVE',
          phone: '+1234567890',
          email: 'test@example.com',
          timezone: 'America/New_York',
          currency: 'USD'
        }
      });

      await prisma.user.create({
        data: {
          email: 'test@example.com',
          password: hashedPassword,
          firstName: 'Test',
          lastName: 'User',
          role: 'BUSINESS_OWNER',
          businessId: business.id,
          isActive: true
        }
      });
    });

    it('should login successfully with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(loginData.email);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('should reject login with invalid email', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('Invalid credentials');
    });

    it('should reject login with invalid password', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('Invalid credentials');
    });

    it('should reject login with missing credentials', async () => {
      const loginData = {
        email: 'test@example.com'
        // Missing password
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('Validation failed');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Create test user and get refresh token
      const hashedPassword = await hashPassword('password123');
      
      const business = await prisma.business.create({
        data: {
          name: 'Test Restaurant',
          type: 'RESTAURANT',
          status: 'ACTIVE',
          phone: '+1234567890',
          email: 'test@example.com',
          timezone: 'America/New_York',
          currency: 'USD'
        }
      });

      await prisma.user.create({
        data: {
          email: 'test@example.com',
          password: hashedPassword,
          firstName: 'Test',
          lastName: 'User',
          role: 'BUSINESS_OWNER',
          businessId: business.id,
          isActive: true
        }
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      refreshToken = loginResponse.body.data.refreshToken;
    });

    it('should refresh token successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('should reject refresh with invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid_token' })
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('Invalid refresh token');
    });

    it('should reject refresh with missing token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('Validation failed');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let authToken: string;

    beforeEach(async () => {
      // Create test user and get auth token
      const hashedPassword = await hashPassword('password123');
      
      const business = await prisma.business.create({
        data: {
          name: 'Test Restaurant',
          type: 'RESTAURANT',
          status: 'ACTIVE',
          phone: '+1234567890',
          email: 'test@example.com',
          timezone: 'America/New_York',
          currency: 'USD'
        }
      });

      await prisma.user.create({
        data: {
          email: 'test@example.com',
          password: hashedPassword,
          firstName: 'Test',
          lastName: 'User',
          role: 'BUSINESS_OWNER',
          businessId: business.id,
          isActive: true
        }
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      authToken = loginResponse.body.data.token;
    });

    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logout successful');
    });

    it('should reject logout without token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('No token provided');
    });

    it('should reject logout with invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('Invalid token');
    });
  });
}); 