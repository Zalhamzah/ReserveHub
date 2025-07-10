#!/bin/bash

# ReserveHub Deployment Script
# This script helps automate the deployment to Vercel

set -e

echo "🚀 Starting ReserveHub deployment..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "📦 Initializing git repository..."
    git init
    git add .
    git commit -m "Initial commit - ReserveHub application"
    echo "✅ Git repository initialized"
else
    echo "✅ Git repository found"
fi

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📥 Installing Vercel CLI..."
    npm install -g vercel
    echo "✅ Vercel CLI installed"
else
    echo "✅ Vercel CLI found"
fi

# Build the project to check for errors
echo "🔨 Building project..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed. Please fix errors before deploying."
    exit 1
fi

# Check if .env file exists and warn about production environment
if [ -f ".env" ]; then
    echo "⚠️  Local .env file found. Remember to set environment variables in Vercel!"
    echo "   Required variables:"
    echo "   - DATABASE_URL (PostgreSQL connection string)"
    echo "   - JWT_SECRET"
    echo "   - SMTP_* (email configuration)"
    echo "   - WHATSAPP_* (optional)"
fi

echo ""
echo "🌟 Ready to deploy!"
echo ""
echo "Next steps:"
echo "1. Set up a cloud database (Neon, Supabase, or PlanetScale)"
echo "2. Run: vercel login"
echo "3. Run: vercel"
echo "4. Set environment variables in Vercel dashboard"
echo "5. Run database migrations"
echo ""
echo "For detailed instructions, see DEPLOYMENT.md"
echo ""

read -p "Do you want to start deployment now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Starting deployment..."
    vercel
else
    echo "👍 Deployment cancelled. Run 'vercel' when ready."
fi 