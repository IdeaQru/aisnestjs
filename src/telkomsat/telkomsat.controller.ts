// src/telkomsat/telkomsat.controller.ts
import { Controller, Get, Post, HttpCode, HttpStatus, Query, ParseIntPipe } from '@nestjs/common';
import { TelkomsatCollectorService } from './telkomsat-collector.service';
import { TelkomsatClientService } from './telkomsat-client.service';

@Controller('api/telkomsat')
export class TelkomsatController {
  constructor(
    private readonly collectorService: TelkomsatCollectorService,
    private readonly clientService: TelkomsatClientService,
  ) {}

  /**
   * 🔄 MANUAL COLLECTION TRIGGER
   * POST /api/telkomsat/collect
   */
  @Post('collect')
  @HttpCode(HttpStatus.OK)
  async triggerCollection() {
    try {
      const result = await this.collectorService.manualCollection();
      return {
        success: true,
        data: result,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * ⚡ AGGRESSIVE COLLECTION
   * POST /api/telkomsat/collect/aggressive
   */
  @Post('collect/aggressive')
  @HttpCode(HttpStatus.OK)
  async triggerAggressiveCollection() {
    try {
      const result = await this.collectorService.forceAggressiveCollection();
      return {
        success: true,
        data: result,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * 📊 COLLECTION STATUS
   * GET /api/telkomsat/status
   */
  @Get('status')
  async getStatus() {
    const status = this.collectorService.getCollectionStatus();
    return {
      success: true,
      data: status,
      timestamp: new Date()
    };
  }

  /**
   * 🏥 HEALTH CHECK
   * GET /api/telkomsat/health
   */
  @Get('health')
  async healthCheck() {
    const health = await this.collectorService.healthCheck();
    return {
      success: true,
      data: health,
      timestamp: new Date()
    };
  }

  /**
   * 🧪 TEST API CONNECTION
   * GET /api/telkomsat/test
   */
  @Get('test')
  async testConnection(
    @Query('limit') limit?: number
  ) {
    try {
      const vessels = await this.clientService.fetchVesselsFromTelkomsat({
        limit: limit || 10
      });

      return {
        success: true,
        data: {
          vessels_count: vessels.length,
          sample_vessels: vessels.slice(0, 3),
          api_responsive: true
        },
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        api_responsive: false,
        timestamp: new Date()
      };
    }
  }
}
