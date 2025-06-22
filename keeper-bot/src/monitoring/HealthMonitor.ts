import express, { Express } from 'express';
import { logger } from '../utils/logger';

export class HealthMonitor {
  private app: Express;
  private server: any;
  private startTime: Date;

  constructor() {
    this.app = express();
    this.startTime = new Date();
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.get('/health', (req, res) => {
      const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
      
      res.json({
        status: 'healthy',
        uptime: uptime,
        timestamp: new Date().toISOString(),
        services: {
          aiMonitor: true,
          taxCollector: true,
          rewardDistributor: true,
        },
      });
    });

    this.app.get('/metrics', (req, res) => {
      res.set('Content-Type', 'text/plain');
      res.send(this.getMetrics());
    });
  }

  private getMetrics(): string {
    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    
    return `
# HELP keeper_bot_uptime_seconds Uptime in seconds
# TYPE keeper_bot_uptime_seconds gauge
keeper_bot_uptime_seconds ${uptime}

# HELP keeper_bot_health_status Health status (1 = healthy, 0 = unhealthy)
# TYPE keeper_bot_health_status gauge
keeper_bot_health_status 1
`;
  }

  async start() {
    const port = process.env.HEALTH_CHECK_PORT || 3000;
    this.server = this.app.listen(port, () => {
      logger.info(`Health monitor listening on port ${port}`);
    });
  }

  async stop() {
    return new Promise<void>((resolve) => {
      this.server.close(() => {
        logger.info('Health monitor stopped');
        resolve();
      });
    });
  }
}