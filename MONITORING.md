# ReserveHub Monitoring & Health Checks

This document describes the monitoring and health check system implemented to prevent and detect issues before they affect users.

## Health Check Endpoints

### Basic Health Check
```
GET /api/v1/health
```
Returns basic system status and database/Redis connectivity.

### Detailed Health Check
```
GET /api/v1/health/detailed
```
Returns comprehensive status of all system components:
- Database connectivity
- Redis connectivity  
- Availability service status
- WhatsApp service status
- Email service status

## Monitoring Script

### Overview
The `monitoring-check.js` script provides automated system health monitoring that can be run periodically to detect issues early.

### Usage
```bash
# Run manual check
node monitoring-check.js

# Run with custom health check URL
HEALTH_CHECK_URL="https://your-domain.com/api/v1/health/detailed" node monitoring-check.js
```

### Exit Codes
- `0`: All systems healthy
- `1`: Some services degraded but functional
- `2`: Critical services down

### Critical vs Warning Services
- **Critical**: `database`, `availability` - Core booking functionality
- **Warning**: `redis`, `email` - Important but non-blocking features

## Error Handling Improvements

### Database Connection Issues
- Added connection checks before database operations
- Graceful error handling with user-friendly messages
- Automatic retries and connection validation

### API Endpoint Improvements
- Database connectivity verification in availability endpoint
- Structured error responses with specific error codes
- Service-specific error handling for better troubleshooting

## Environment Configuration

### Required Environment Variables
```bash
DATABASE_URL=postgresql://ghazalihamzah@localhost:5432/reservehub
JWT_SECRET=your-super-secret-jwt-key-2024-reservehub-production
```

### Optional Monitoring Configuration
```bash
HEALTH_CHECK_URL=http://localhost:3000/api/v1/health/detailed
SLACK_WEBHOOK_URL=https://hooks.slack.com/your-webhook
EMAIL_ALERTS=admin@yourdomain.com
```

## Periodic Monitoring Setup

### Cron Job Example
```bash
# Check every 5 minutes
*/5 * * * * /usr/bin/node /path/to/reservehub/monitoring-check.js >> /var/log/reservehub-monitor.log 2>&1

# Check every hour with email alerts
0 * * * * EMAIL_ALERTS="admin@example.com" /usr/bin/node /path/to/reservehub/monitoring-check.js
```

### System Service Example (systemd)
```ini
[Unit]
Description=ReserveHub Health Monitor
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/bin/node /path/to/reservehub/monitoring-check.js
User=reservehub
Environment=NODE_ENV=production
Environment=HEALTH_CHECK_URL=http://localhost:3000/api/v1/health/detailed

[Install]
WantedBy=multi-user.target
```

### Timer for Periodic Execution
```ini
[Unit]
Description=Run ReserveHub Health Monitor every 5 minutes
Requires=reservehub-monitor.service

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

## Troubleshooting

### Common Issues and Solutions

#### Database Connection Errors
1. Check if PostgreSQL is running
2. Verify database owner and permissions
3. Ensure correct DATABASE_URL in .env file

#### Availability Service Issues
1. Check database connectivity
2. Verify business data exists in database
3. Check for table/location configuration

#### WhatsApp Service in Fallback Mode
- Expected behavior when API credentials are not configured
- Service generates WhatsApp links instead of sending via API
- Not a critical error - booking confirmations still work

## Preventive Measures

1. **Database Health Checks**: Automatic connection validation before operations
2. **Service Status Monitoring**: Regular checks of all system components  
3. **Error Recovery**: Graceful degradation and fallback mechanisms
4. **User-Friendly Error Messages**: Clear error communication instead of technical errors
5. **Monitoring Alerts**: Proactive notification of system issues

## Future Enhancements

- Integration with external monitoring services (DataDog, New Relic)
- Slack/Teams notifications for critical alerts
- Performance metrics and response time monitoring
- Automated recovery procedures for common issues 