# ReserveHub Deployment Guide

This guide will help you deploy ReserveHub to Vercel with a free domain.

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **GitHub Account**: Your code should be in a GitHub repository
3. **Database**: We'll use a free PostgreSQL database

## Step 1: Set Up Cloud Database

Since Vercel is serverless, we need a cloud database. Here are free options:

### Option A: Neon (Recommended - Free 3GB)

1. Go to [neon.tech](https://neon.tech) and sign up
2. Create a new project
3. Choose region closest to your users
4. Copy the connection string (looks like: `postgresql://username:password@ep-xxx.us-east-1.aws.neon.tech/neondb`)

### Option B: Supabase (Free 500MB)

1. Go to [supabase.com](https://supabase.com) and sign up
2. Create a new project
3. Go to Settings > Database
4. Copy the connection string

### Option C: PlanetScale (Free 1GB)

1. Go to [planetscale.com](https://planetscale.com) and sign up
2. Create a new database
3. Create a branch (main)
4. Get connection string from Connect tab

## Step 2: Deploy to Vercel

### Method 1: Vercel CLI (Recommended)

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy from your project directory:
```bash
vercel
```

4. Follow the prompts:
   - Link to existing project? **N**
   - Project name: **reservehub** (or your preferred name)
   - Directory: **./** (current directory)
   - Auto-deploy? **Y**

### Method 2: Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "New Project"
3. Import your GitHub repository
4. Configure project:
   - **Framework Preset**: Other
   - **Root Directory**: ./
   - **Build Command**: `npm run vercel-build`
   - **Output Directory**: Leave empty
   - **Install Command**: `npm install`

## Step 3: Configure Environment Variables

In Vercel dashboard or using CLI, set these environment variables:

### Required Variables

```bash
# Database
DATABASE_URL=your_postgresql_connection_string_here

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-2024-reservehub-production

# Email Configuration (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=your-email@gmail.com

# WhatsApp (Optional)
WHATSAPP_BUSINESS_NUMBER=60142779902
BUSINESS_NAME=ReserveHub Test Restaurant

# Application
NODE_ENV=production
PORT=3000
API_VERSION=v1
```

### Using Vercel CLI to set environment variables:

```bash
vercel env add DATABASE_URL
vercel env add JWT_SECRET
vercel env add SMTP_HOST
vercel env add SMTP_PORT
vercel env add SMTP_SECURE
vercel env add SMTP_USER
vercel env add SMTP_PASSWORD
vercel env add EMAIL_FROM
vercel env add WHATSAPP_BUSINESS_NUMBER
vercel env add BUSINESS_NAME
vercel env add NODE_ENV
```

### Using Vercel Dashboard:

1. Go to your project dashboard
2. Click "Settings" tab
3. Click "Environment Variables"
4. Add each variable one by one

## Step 4: Database Migration

After deployment, you need to run database migrations:

1. Install Vercel CLI if not already done
2. Run migration on your deployed database:

```bash
# Set DATABASE_URL locally for migration
export DATABASE_URL="your_production_database_url"

# Run Prisma migrations
npx prisma db push

# Optional: Seed database with test data
npx prisma db seed
```

## Step 5: Access Your App

After successful deployment, Vercel will provide you with:

1. **Production URL**: `https://your-app-name.vercel.app`
2. **Preview URLs**: For each Git push

### Test Your Deployment

1. **Frontend**: Visit `https://your-app-name.vercel.app`
2. **Backend API**: Visit `https://your-app-name.vercel.app/health`
3. **API Documentation**: Visit `https://your-app-name.vercel.app/api-docs`

## Step 6: Custom Domain (Optional)

To add a custom domain:

1. In Vercel dashboard, go to your project
2. Click "Domains" tab
3. Add your domain name
4. Follow DNS configuration instructions

## Troubleshooting

### Common Issues

1. **Build Errors**:
   - Check build logs in Vercel dashboard
   - Ensure all dependencies are in `package.json`
   - Verify TypeScript compilation

2. **Database Connection Errors**:
   - Verify DATABASE_URL is correct
   - Ensure database allows connections from Vercel IPs
   - Check database credentials

3. **Environment Variables**:
   - Ensure all required variables are set
   - Variables are case-sensitive
   - Redeploy after adding new variables

4. **API Routes Not Working**:
   - Check `vercel.json` configuration
   - Verify API routes are properly defined

### Monitoring

- **Logs**: View function logs in Vercel dashboard
- **Analytics**: Enable Web Analytics in project settings
- **Monitoring**: Use the monitoring script: `node monitoring-check.js`

## Environment-Specific Configuration

### Development
```bash
npm run dev
```

### Production (Vercel)
- Automatically uses production environment
- Redis and other services should be cloud-based
- Static files served from `/public`

## Security Considerations

1. **Environment Variables**: Never commit secrets to Git
2. **Database**: Use connection pooling and SSL
3. **CORS**: Configure appropriate origins
4. **Rate Limiting**: Already configured for production

## Support

If you encounter issues:

1. Check Vercel function logs
2. Test locally with production environment variables
3. Verify database connectivity
4. Check API endpoint responses

## Free Tier Limitations

- **Vercel**: 100GB bandwidth, 100 serverless function invocations per day
- **Database**: Varies by provider (see options above)
- **Email**: Gmail has daily sending limits

For production use, consider upgrading to paid plans for better limits and support. 