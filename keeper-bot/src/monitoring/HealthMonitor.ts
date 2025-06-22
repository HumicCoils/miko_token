import express, { Express } from 'express';
import { logger } from '../utils/logger';

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    aiMonitor: boolean;
    taxDistributor: boolean;
    holderRegistry: boolean;
  };
  metrics: {
    lastTaxCollection: Date | null;
    lastRewardDistribution: Date | null;
    totalHolders: number;
    eligibleHolders: number;
  };
}

export class HealthMonitor {
  private app: Express;
  private server: any;
  private startTime: Date;
  private status: HealthStatus;

  constructor(port: number) {
    this.app = express();
    this.startTime = new Date();
    this.status = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: 0,
      services: {
        aiMonitor: true,
        taxDistributor: true,
        holderRegistry: true,
      },
      metrics: {
        lastTaxCollection: null,
        lastRewardDistribution: null,
        totalHolders: 0,
        eligibleHolders: 0,
      },
    };

    this.setupRoutes();
    this.server = this.app.listen(port, () => {
      logger.info(`Health monitor listening on port ${port}`);
    });
  }

  private setupRoutes(): void {
    this.app.get('/health', (req, res) => {
      this.updateStatus();
      res.json(this.status);
    });

    this.app.get('/metrics', (req, res) => {
      const metrics = this.getPrometheusMetrics();
      res.set('Content-Type', 'text/plain');
      res.send(metrics);
    });
  }

  private updateStatus(): void {
    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    this.status.uptime = uptime;
    this.status.timestamp = new Date().toISOString();
  }

  private getPrometheusMetrics(): string {
    const metrics = [
      `# HELP miko_keeper_uptime_seconds Uptime in seconds`,
      `# TYPE miko_keeper_uptime_seconds gauge`,
      `miko_keeper_uptime_seconds ${this.status.uptime}`,
      '',
      `# HELP miko_keeper_eligible_holders Number of eligible holders`,
      `# TYPE miko_keeper_eligible_holders gauge`,
      `miko_keeper_eligible_holders ${this.status.metrics.eligibleHolders}`,
      '',
      `# HELP miko_keeper_total_holders Total number of holders`,
      `# TYPE miko_keeper_total_holders gauge`,
      `miko_keeper_total_holders ${this.status.metrics.totalHolders}`,
    ];

    return metrics.join('\n');
  }

  updateServiceStatus(service: keyof typeof this.status.services, healthy: boolean): void {
    this.status.services[service] = healthy;
    this.status.status = Object.values(this.status.services).every(s => s) ? 'healthy' : 'unhealthy';
  }

  updateMetrics(metrics: Partial<typeof this.status.metrics>): void {
    this.status.metrics = { ...this.status.metrics, ...metrics };
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        logger.info('Health monitor stopped');
        resolve();
      });
    });
  }
}