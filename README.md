# 🍽️ ReserveHub - Modern Restaurant Reservation System

> **Complete restaurant booking platform with WhatsApp integration, email confirmations, and smart customer management**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org/)

## ✨ Features

### 🎯 **Smart Booking System**
- **📱 Mobile-optimized** responsive design with orange gradient theme
- **🌍 International phone validation** for 12 countries (Malaysia, Singapore, US, UK, etc.)
- **🧠 Intelligent customer matching** to prevent duplicate phone conflicts
- **📧 Automatic email confirmations** with professional HTML templates
- **💬 WhatsApp integration** for instant booking confirmations
- **📝 Optional last name field** for improved user experience

### 🚀 **Technical Excellence**
- **⚡ Express.js + TypeScript** backend with comprehensive error handling
- **🗄️ PostgreSQL + Prisma ORM** for robust data management
- **📊 Real-time availability** checking and booking validation
- **🔄 WebSocket integration** for live updates
- **🛡️ Comprehensive validation** and security measures

### 🎨 **Beautiful UI/UX**
- **📱 Mobile-first design** with card-based layout
- **🎨 Modern orange theme** (#FF6B35, #FF8A50) with gradients
- **✨ Smooth animations** and loading states
- **📞 Complete phone number display** in booking forms
- **✅ Professional confirmation screens** with email & WhatsApp options

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 6+

### Installation
```bash
# Clone repository
git clone https://github.com/Zalhamzah/ReserveHub.git
cd ReserveHub

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

### 🔧 Environment Configuration
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/connectreserve"

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
EMAIL_FROM=Your Restaurant <your_email@gmail.com>

# WhatsApp Business
WHATSAPP_BUSINESS_NUMBER=60142779902
BUSINESS_NAME=Your Restaurant Name
```

## 🎯 Live Demo

- **🌐 Frontend**: `http://localhost:3000`
- **🔗 API Health**: `http://localhost:3000/api/v1/health`
- **📊 Booking API**: `http://localhost:3000/api/v1/bookings/public/reserve`

## 📱 Mobile Experience

The system is designed mobile-first with:
- **📏 420px container width** optimized for mobile screens
- **👆 Touch-friendly interactions** with appropriate button sizes
- **🔄 Responsive phone input** with country code selection
- **✨ Smooth animations** that work well on mobile devices

## 🌍 International Support

**Phone Number Validation for 12 Countries:**
- 🇲🇾 Malaysia (+60)
- 🇸🇬 Singapore (+65)
- 🇺🇸 United States (+1)
- 🇬🇧 United Kingdom (+44)
- 🇦🇺 Australia (+61)
- 🇨🇳 China (+86)
- 🇯🇵 Japan (+81)
- 🇰🇷 South Korea (+82)
- 🇮🇳 India (+91)
- 🇮🇩 Indonesia (+62)
- 🇹🇭 Thailand (+66)
- 🇻🇳 Vietnam (+84)

## 🏗️ Architecture

```
ReserveHub/
├── src/
│   ├── routes/              # API endpoints
│   │   ├── bookings.ts      # Booking management
│   │   ├── whatsapp.ts      # WhatsApp integration
│   │   └── customers.ts     # Customer management
│   ├── services/
│   │   ├── emailService.ts  # Email confirmations
│   │   ├── whatsappService.ts # WhatsApp messaging
│   │   └── customerService.ts # Customer logic
│   ├── middleware/          # Authentication & validation
│   └── utils/               # Helper functions
├── public/
│   └── index.html          # Frontend application
├── prisma/
│   └── schema.prisma       # Database schema
└── package.json
```

## 🛡️ Security Features

- **🔐 JWT authentication** for protected routes
- **📝 Input validation** with express-validator
- **🛡️ CORS protection** with configurable origins
- **⚡ Rate limiting** to prevent abuse
- **🔒 SQL injection protection** via Prisma ORM

## 📊 API Endpoints

### Public Booking
```typescript
POST /api/v1/bookings/public/reserve
{
  "firstName": "John",
  "lastName": "Doe", // Optional
  "email": "john@example.com",
  "phone": "+60123456789",
  "businessId": "business_id",
  "bookingDate": "2025-07-15",
  "bookingTime": "19:00",
  "partySize": 2,
  "specialRequests": "Window seat please"
}
```

### WhatsApp Confirmation
```typescript
POST /api/v1/whatsapp/send-confirmation
{
  "bookingId": "booking_id",
  "customerPhone": "+60123456789"
}
```

## 🚀 Deployment

### Development
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start           # Start production server
```

### Production
```bash
# Using Docker
docker-compose up -d

# Using PM2
npm install -g pm2
pm2 start dist/server.js --name "reservehub"
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

- **📧 Email**: zal.hamzah@storehub.com
- **💬 WhatsApp**: +60142779902
- **🐛 Issues**: [GitHub Issues](https://github.com/Zalhamzah/ReserveHub/issues)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for modern restaurants seeking seamless reservation management**
