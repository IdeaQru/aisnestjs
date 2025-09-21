// src/scheduler/data-archiver.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AisDataService } from '../ais-data/ais-data.service';

@Injectable()
export class DataArchiverService {
  private readonly logger = new Logger(DataArchiverService.name);

  constructor(private readonly aisDataService: AisDataService) {}

  /**
   * 🕐 SCHEDULED ARCHIVING
   */
  async performScheduledArchiving(newVesselData: any[]): Promise<any> {
    this.logger.log('Starting scheduled archiving process');
    
    try {
      const result = await this.aisDataService.updateCurrentVesselData(newVesselData);
      
      this.logger.log(`Archiving completed: ${JSON.stringify(result)}`);
      return {
        success: true,
        result,
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger.error('Scheduled archiving failed', error.stack);
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * 🧹 CLEANUP OLD LOGS - Setiap hari jam 2 pagi
   */
  @Cron('0 2 * * *', {
    name: 'cleanup-old-logs',
    timeZone: 'Asia/Jakarta'
  })
  async handleLogCleanup(): Promise<void> {
    this.logger.log('Starting log cleanup process');
    
    try {
      const deletedCount = await this.aisDataService.cleanupOldLogs(90);
      this.logger.log(`Log cleanup completed. Deleted ${deletedCount} old records`);
    } catch (error) {
      this.logger.error('Log cleanup failed', error.stack);
    }
  }

  /**
   * 📊 GENERATE DAILY STATS - Setiap hari jam 1 pagi
   */
  @Cron('0 1 * * *', {
    name: 'daily-stats',
    timeZone: 'Asia/Jakarta'
  })
  async generateDailyStats(): Promise<void> {
    this.logger.log('Generating daily statistics');
    
    try {
      const stats = await this.aisDataService.getDataStatistics();
      this.logger.log(`Daily Stats: ${JSON.stringify(stats)}`);
    } catch (error) {
      this.logger.error('Daily stats generation failed', error.stack);
    }
  }
}
