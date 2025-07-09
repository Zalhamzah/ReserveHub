# 🎯 ReserveHub - Hackathon Project

## 🚀 Project Overview
**ReserveHub** is a comprehensive booking reservation system designed as part of a hackathon project to create an integrated business management platform. This system serves as the core booking component that seamlessly integrates with other business automation tools.

## 🎨 Live Demo
- **Application URL**: `http://localhost:3000`
- **API Documentation**: `http://localhost:3000/api-docs`
- **Health Check**: `http://localhost:3000/api/v1/health`

## 🏆 Hackathon Goals Integration

This project is designed to support the complete hackathon vision:

### ✅ **Completed Components**
1. **📅 Booking Reservation System** - Full implementation with dual business type support
2. **💬 Real-time Communications** - WebSocket integration for live updates
3. **📊 Analytics Foundation** - Booking data collection and reporting structure

### 🔄 **Ready for Integration**
4. **🤝 Sales Follow-up Process** - Customer data capture for automated follow-ups
5. **💰 Auto Quotation Generation** - Service-based pricing integration ready
6. **📝 Meeting Summarization** - Booking data structure supports meeting scheduling
7. **🧾 Invoicing System** - Transaction tracking foundation implemented

## 🎯 Features

### 🏢 **Dual Business Type Support**
- **🍽️ Restaurant Reservations**: Table booking with party size and time slot selection
- **💄 Salon Appointments**: Service selection, staff choice, and appointment scheduling

### 🎨 **Interactive User Experience**
- **📱 Mobile-responsive design** with touch-friendly interactions
- **✨ Smooth animations** and loading states
- **🎭 Dynamic UI** that adapts to business type
- **🔄 Real-time availability** checking

### 🛠️ **Technical Architecture**
- **Backend**: Node.js + TypeScript + Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Caching**: Redis for performance optimization
- **Real-time**: WebSocket integration
- **Frontend**: Vanilla JavaScript with modern CSS animations

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- Redis 6+

### Installation
```bash
# Clone repository
git clone https://github.com/Zalhamzah/hackathon.git
cd hackathon

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
npx prisma migrate dev

# Start the application
npm run dev
```

### 🔧 Environment Variables
```env
DATABASE_URL="postgresql://user:password@localhost:5432/reservehub"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-jwt-secret"
NODE_ENV="development"
PORT=3000
```

## 📚 API Documentation

### 🏪 **Public Booking Endpoints**
- `GET /api/v1/bookings/public/availability` - Get available time slots
- `POST /api/v1/bookings/public/reserve` - Create new booking

### 🔐 **Authentication Endpoints**
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - User login

### 📊 **Management Endpoints**
- `GET /api/v1/bookings` - List all bookings
- `GET /api/v1/analytics/bookings` - Booking analytics
- `GET /api/v1/health` - System health check

## 🏗️ Project Structure

```
ReserveHub/
├── src/
│   ├── routes/          # API route handlers
│   ├── services/        # Business logic services
│   ├── middleware/      # Express middleware
│   ├── utils/          # Utility functions
│   └── config/         # Configuration files
├── public/             # Frontend assets
├── prisma/             # Database schema & migrations
├── tests/              # Unit tests
└── docs/               # Documentation
```

## 🎨 User Interface

### 📱 **Mobile-First Design**
- **Responsive layouts** for all screen sizes
- **Touch-optimized** interactions
- **Progressive Web App** ready

### 🎭 **Business Type Selection**
- **Dynamic interface** switching
- **Context-aware** form validation
- **Personalized** booking flows

### ✨ **Interactive Elements**
- **Smooth hover effects** with CSS animations
- **Loading overlays** with success confirmations
- **Floating action buttons** for enhanced UX
- **Progress indicators** with completion states

## 🔌 Integration Points

### 🤝 **Sales Follow-up Integration**
- Customer data collection during booking
- Automated email/SMS notification hooks
- Booking history tracking for personalized offers

### 💰 **Quotation System Ready**
- Service-based pricing structure
- Dynamic pricing calculation hooks
- Multi-service booking support

### 📝 **Meeting & Invoicing Hooks**
- Structured booking data for invoice generation
- Payment status tracking
- Receipt generation endpoints

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Test coverage
npm run test:coverage
```

## 🚀 Deployment

### 🐳 **Docker Deployment**
```bash
# Build and run with Docker
docker-compose up -d
```

### ☁️ **Cloud Deployment**
- **Heroku** ready with `Procfile`
- **Vercel** compatible for frontend
- **Railway** deployment configuration

## 🤝 Contributing

This project is part of a hackathon submission. For development:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📊 Hackathon Metrics

- **📅 Development Time**: 2-3 days
- **💻 Lines of Code**: ~32,000+
- **🗃️ Database Tables**: 8 core tables
- **🛠️ API Endpoints**: 15+ endpoints
- **📱 Mobile Responsive**: 100%
- **✨ Animation Effects**: 10+ smooth transitions

## 🎯 Future Enhancements

- **🔗 Multi-business dashboard**
- **💳 Payment gateway integration**
- **📧 Advanced notification system**
- **📊 Advanced analytics dashboard**
- **🤖 AI-powered booking optimization**

## 📞 Support

For hackathon evaluation or technical questions:
- **GitHub Issues**: [Report bugs or features](https://github.com/Zalhamzah/hackathon/issues)
- **Email**: Contact through GitHub profile

## 📜 License

This project is part of a hackathon submission. All rights reserved.

---

**🏆 Built with ❤️ for the hackathon by Zalhamzah** 