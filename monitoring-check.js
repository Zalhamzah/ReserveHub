#!/usr/bin/env node

/**
 * ReserveHub Monitoring Script
 * 
 * This script checks the health of the ReserveHub system and reports any issues.
 * It can be run periodically via cron to ensure early detection of problems.
 * 
 * Usage: node monitoring-check.js
 * Exit codes:
 * - 0: All systems healthy
 * - 1: Some services degraded but functional
 * - 2: Critical services down
 */

const http = require('http');
const https = require('https');

const config = {
  healthCheckUrl: process.env.HEALTH_CHECK_URL || 'http://localhost:3000/api/v1/health/detailed',
  timeout: 10000, // 10 seconds
  retries: 3,
  criticalServices: ['database', 'availability'], // Services that are critical for core functionality
  warningServices: ['redis', 'email'], // Services that are important but not critical
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL, // Optional Slack notifications
  emailAlerts: process.env.EMAIL_ALERTS || 'admin@example.com' // Optional email alerts
};

/**
 * Make HTTP request to health check endpoint
 */
function makeHealthCheckRequest() {
  return new Promise((resolve, reject) => {
    const url = new URL(config.healthCheckUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      timeout: config.timeout,
      headers: {
        'User-Agent': 'ReserveHub-Monitor/1.0'
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({
            status: res.statusCode,
            data: result
          });
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Perform health check with retries
 */
async function performHealthCheck() {
  let lastError;
  
  for (let attempt = 1; attempt <= config.retries; attempt++) {
    try {
      console.log(`[${new Date().toISOString()}] Health check attempt ${attempt}/${config.retries}...`);
      const result = await makeHealthCheckRequest();
      console.log(`[${new Date().toISOString()}] Health check successful (HTTP ${result.status})`);
      return result;
    } catch (error) {
      lastError = error;
      console.log(`[${new Date().toISOString()}] Health check attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < config.retries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`[${new Date().toISOString()}] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Analyze health check results
 */
function analyzeHealth(healthData) {
  const analysis = {
    overall: healthData.status,
    timestamp: healthData.timestamp,
    issues: [],
    warnings: [],
    healthy: [],
    exitCode: 0
  };

  // Check each service
  for (const [serviceName, serviceStatus] of Object.entries(healthData.services)) {
    if (serviceStatus === 'healthy') {
      analysis.healthy.push(serviceName);
    } else if (serviceStatus === 'configured-fallback') {
      analysis.warnings.push(`${serviceName}: running in fallback mode`);
    } else if (serviceStatus === 'unhealthy') {
      if (config.criticalServices.includes(serviceName)) {
        analysis.issues.push(`CRITICAL: ${serviceName} is down`);
        analysis.exitCode = 2;
      } else if (config.warningServices.includes(serviceName)) {
        analysis.warnings.push(`WARNING: ${serviceName} is down`);
        if (analysis.exitCode === 0) {
          analysis.exitCode = 1;
        }
      } else {
        analysis.warnings.push(`${serviceName} is down`);
        if (analysis.exitCode === 0) {
          analysis.exitCode = 1;
        }
      }
    }
  }

  return analysis;
}

/**
 * Send alert notifications
 */
async function sendAlerts(analysis) {
  if (analysis.issues.length === 0 && analysis.warnings.length === 0) {
    return; // No alerts needed
  }

  const message = `
🚨 ReserveHub System Alert

Overall Status: ${analysis.overall}
Timestamp: ${analysis.timestamp}

${analysis.issues.length > 0 ? `Critical Issues:\n${analysis.issues.map(issue => `- ${issue}`).join('\n')}\n` : ''}
${analysis.warnings.length > 0 ? `Warnings:\n${analysis.warnings.map(warning => `- ${warning}`).join('\n')}\n` : ''}

Healthy Services: ${analysis.healthy.join(', ')}

Please check the system immediately.
  `.trim();

  console.log(`[${new Date().toISOString()}] Alert message prepared:\n${message}`);

  // Note: In a real environment, you would implement actual alert sending here
  // For example: Slack webhooks, email notifications, PagerDuty, etc.
  console.log(`[${new Date().toISOString()}] Alert notifications would be sent to configured channels`);
}

/**
 * Main monitoring function
 */
async function main() {
  try {
    console.log(`[${new Date().toISOString()}] Starting ReserveHub system health check...`);
    
    const healthCheckResult = await performHealthCheck();
    const analysis = analyzeHealth(healthCheckResult.data);
    
    console.log(`[${new Date().toISOString()}] Health analysis complete:`);
    console.log(`  Overall Status: ${analysis.overall}`);
    console.log(`  Healthy Services: ${analysis.healthy.join(', ')}`);
    
    if (analysis.warnings.length > 0) {
      console.log(`  Warnings: ${analysis.warnings.length}`);
      analysis.warnings.forEach(warning => console.log(`    - ${warning}`));
    }
    
    if (analysis.issues.length > 0) {
      console.log(`  Critical Issues: ${analysis.issues.length}`);
      analysis.issues.forEach(issue => console.log(`    - ${issue}`));
      await sendAlerts(analysis);
    }
    
    console.log(`[${new Date().toISOString()}] Health check completed with exit code: ${analysis.exitCode}`);
    process.exit(analysis.exitCode);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Health check failed: ${error.message}`);
    
    // Send critical alert
    const criticalAnalysis = {
      overall: 'critical',
      timestamp: new Date().toISOString(),
      issues: [`CRITICAL: Health check endpoint unreachable - ${error.message}`],
      warnings: [],
      healthy: [],
      exitCode: 2
    };
    
    await sendAlerts(criticalAnalysis);
    process.exit(2);
  }
}

// Run the monitoring check
if (require.main === module) {
  main();
}

module.exports = { performHealthCheck, analyzeHealth }; 