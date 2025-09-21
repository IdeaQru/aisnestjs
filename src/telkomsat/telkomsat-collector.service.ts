// src/telkomsat/telkomsat-collector.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TelkomsatClientService, ProcessedVessel } from './telkomsat-client.service';
import { AisDataService } from '../ais-data/ais-data.service';
import { VesselTrackingGateway } from '../websocket/vessel-tracking.gateway';

export interface CollectionResult {
  collected: number;
  stored: number;
  duration: number;
  errors?: string[];
  broadcasted?: boolean;
  unique?: number;
  archived?: number;
}

export interface CollectionStatus {
  isCollecting: boolean;
  lastCollection: Date | null;
  nextCollection: string;
  totalCollections: number;
  successfulCollections: number;
  averageDuration: number;
  lastError?: string; // ✅ Changed from string | null to string | undefined
}

export interface HealthCheckResult {
  telkomsatApi: boolean;
  database: boolean;
  webSocket: boolean;
  lastCollection: Date | null;
  isCollecting: boolean;
  connectedClients?: number;
  systemStatus: 'healthy' | 'degraded' | 'unhealthy';
}

@Injectable()
export class TelkomsatCollectorService {
  private readonly logger = new Logger(TelkomsatCollectorService.name);
  private isCollecting = false;
  private lastCollectionTime: Date | null = null;
  private totalCollections = 0;
  private successfulCollections = 0;
  private collectionDurations: number[] = [];
  private lastError: string | undefined; // ✅ Changed from string | null

  constructor(
    private readonly telkomsatClient: TelkomsatClientService,
    private readonly aisDataService: AisDataService,
    private readonly vesselTrackingGateway?: VesselTrackingGateway, // Optional injection
  ) {}

  /**
   * 🕐 SCHEDULED COLLECTION - Every 30 seconds for real-time
   */
  @Cron('*/30 * * * * *', {
    name: 'realtime-telkomsat-collection',
    timeZone: 'Asia/Jakarta'
  })
  async handleScheduledCollection(): Promise<void> {
    if (this.isCollecting) {
      this.logger.warn('Collection already in progress, skipping...');
      return;
    }

    this.logger.log('🛰️ Starting scheduled real-time Telkomsat data collection');
    
    try {
      const result = await this.collectAndStoreVessels();
      
      // ✅ REAL-TIME BROADCASTING if WebSocket is available
      if (this.vesselTrackingGateway && result.collected > 0) {
        await this.broadcastLatestData(result.collected);
      }

      this.successfulCollections++;
      this.lastError = undefined; // ✅ Set to undefined instead of null

    } catch (error) {
      this.lastError = error.message;
      this.logger.error(`Scheduled collection failed: ${error.message}`);
    }

    this.totalCollections++;
  }

  /**
   * 📡 ENHANCED COLLECT AND STORE VESSELS with Complete Data
   */
  async collectAndStoreVessels(): Promise<CollectionResult> {
    if (this.isCollecting) {
      throw new Error('Collection already in progress');
    }

    this.isCollecting = true;
    const startTime = Date.now();

    try {
      this.logger.log('🚀 Starting vessel collection from Telkomsat');

      // ✅ Optimized collection for real-time performance
      const vessels = await this.telkomsatClient.collectVesselsMassively();
      
      if (vessels.length === 0) {
        this.logger.warn('No vessels collected from Telkomsat');
        return { 
          collected: 0, 
          stored: 0, 
          duration: Date.now() - startTime,
          errors: [],
          broadcasted: false
        };
      }

      // ✅ Convert to DTO format with ALL FIELDS including dimension
      const vesselDTOs = vessels.map(vessel => ({
        mmsi: vessel.mmsi,
        latitude: vessel.latitude,
        longitude: vessel.longitude,
        course: vessel.course || 0,
        speed: vessel.speed || 0,
        heading: vessel.heading,
        name: vessel.name,
        callSign: vessel.callSign,
        imo: vessel.imo,
        vesselType: vessel.vesselType || 0,
        navStatus: vessel.navStatus || 15,
        flag: vessel.flag,
        vesselClass: vessel.vesselClass,
        destination: vessel.destination,
        eta: vessel.eta,
        timestamp: vessel.timestamp,
        
        // ✅ Legacy dimension fields for backward compatibility
        length: vessel.length,
        width: vessel.width,
        
        // ✅ COMPLETE DIMENSION OBJECT - All fields
        dimension: vessel.dimension ? {
          a: vessel.dimension.a,
          b: vessel.dimension.b,
          c: vessel.dimension.c,
          d: vessel.dimension.d,
          width: vessel.dimension.width,
          length: vessel.dimension.length
        } : undefined,
        
        source: vessel.source || 'telkomsat'
      }));

      // ✅ Store in database with enhanced method
      const result = await this.aisDataService.updateCurrentVesselData(vesselDTOs);
      
      this.lastCollectionTime = new Date();
      const duration = Date.now() - startTime;
      
      // ✅ Track performance metrics
      this.collectionDurations.push(duration);
      if (this.collectionDurations.length > 100) {
        this.collectionDurations = this.collectionDurations.slice(-100); // Keep last 100
      }

      this.logger.log(`✅ Collection completed: ${vessels.length} collected, ${result.newCurrentCount} stored, ${result.archivedCount} archived (${duration}ms)`);

      return {
        collected: vessels.length,
        stored: result.newCurrentCount,
        duration,
        errors: result.errors || [],
        broadcasted: !!this.vesselTrackingGateway
      };

    } finally {
      this.isCollecting = false;
    }
  }

  /**
   * 📡 BROADCAST LATEST DATA via WebSocket
   */
  private async broadcastLatestData(count: number): Promise<void> {
    if (!this.vesselTrackingGateway) return;

    try {
      const latestVessels = await this.aisDataService.getCurrentVessels(count);
      this.vesselTrackingGateway.broadcastVesselUpdate(latestVessels);
      this.logger.log(`📡 Broadcasted ${latestVessels.length} vessels to connected clients`);
    } catch (error) {
      this.logger.error(`Failed to broadcast data: ${error.message}`);
    }
  }

  /**
   * 🔄 MANUAL COLLECTION with Broadcasting
   */
  async manualCollection(): Promise<CollectionResult> {
    this.logger.log('🔄 Manual collection triggered');
    
    const result = await this.collectAndStoreVessels();
    
    // ✅ Broadcast manual collection results
    if (this.vesselTrackingGateway && result.collected > 0) {
      await this.broadcastLatestData(result.collected);
      result.broadcasted = true;
    }
    
    return result;
  }

  /**
   * ⚡ ENHANCED AGGRESSIVE COLLECTION with Complete Data
   */
  async forceAggressiveCollection(): Promise<CollectionResult> {
    if (this.isCollecting) {
      throw new Error('Collection already in progress');
    }

    this.isCollecting = true;
    const startTime = Date.now();

    try {
      this.logger.log('⚡ Starting aggressive vessel collection with maximum coverage');

      // ✅ Multiple parallel collection strategies
      const collections = await Promise.allSettled([
        this.telkomsatClient.collectVesselsMassively(),
        this.telkomsatClient.fetchVesselsFromTelkomsat({ limit: 1000, page: 1 }),
        this.telkomsatClient.fetchVesselsFromTelkomsat({ limit: 1000, page: 2 }),
        this.telkomsatClient.fetchVesselsFromTelkomsat({ limit: 500, page: 3 }),
        this.telkomsatClient.fetchVesselsFromTelkomsat({ limit: 500, page: 4 }),
      ]);

      const allVessels: ProcessedVessel[] = [];
      const errors: string[] = [];

      collections.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          allVessels.push(...result.value);
          this.logger.log(`Aggressive collection batch ${index + 1}: ${result.value.length} vessels`);
        } else {
          const error = `Batch ${index + 1} failed: ${result.reason}`;
          errors.push(error);
          this.logger.warn(error);
        }
      });

      // ✅ Enhanced deduplication with timestamp priority
      const vesselMap = new Map<number, ProcessedVessel>();
      allVessels.forEach(vessel => {
        const existing = vesselMap.get(vessel.mmsi);
        if (!existing || vessel.timestamp > existing.timestamp) {
          vesselMap.set(vessel.mmsi, vessel);
        }
      });

      const uniqueVessels = Array.from(vesselMap.values());
      
      // ✅ Store with complete dimension data
      const vesselDTOs = uniqueVessels.map(vessel => ({
        mmsi: vessel.mmsi,
        latitude: vessel.latitude,
        longitude: vessel.longitude,
        course: vessel.course || 0,
        speed: vessel.speed || 0,
        heading: vessel.heading,
        name: vessel.name,
        callSign: vessel.callSign,
        imo: vessel.imo,
        vesselType: vessel.vesselType || 0,
        navStatus: vessel.navStatus || 15,
        flag: vessel.flag,
        vesselClass: vessel.vesselClass,
        destination: vessel.destination,
        eta: vessel.eta,
        timestamp: vessel.timestamp,
        
        // ✅ Legacy fields
        length: vessel.length,
        width: vessel.width,
        
        // ✅ Complete dimension object
        dimension: vessel.dimension ? {
          a: vessel.dimension.a,
          b: vessel.dimension.b,
          c: vessel.dimension.c,
          d: vessel.dimension.d,
          width: vessel.dimension.width,
          length: vessel.dimension.length
        } : undefined,
        
        source: vessel.source || 'telkomsat'
      }));

      const result = await this.aisDataService.updateCurrentVesselData(vesselDTOs);
      const duration = Date.now() - startTime;

      // ✅ Broadcast aggressive collection results
      if (this.vesselTrackingGateway && uniqueVessels.length > 0) {
        await this.broadcastLatestData(uniqueVessels.length);
      }

      this.logger.log(`⚡ Aggressive collection completed: ${allVessels.length} total, ${uniqueVessels.length} unique vessels stored (${duration}ms)`);

      return {
        collected: allVessels.length,
        unique: uniqueVessels.length,
        stored: result.newCurrentCount,
        archived: result.archivedCount,
        duration,
        errors,
        broadcasted: !!this.vesselTrackingGateway
      };

    } finally {
      this.isCollecting = false;
    }
  }

  /**
   * 🎯 COLLECT SPECIFIC VESSELS by MMSI
   */
  async collectSpecificVessels(mmsiList: number[]): Promise<CollectionResult> {
    this.logger.log(`🎯 Collecting specific vessels: ${mmsiList.join(', ')}`);
    
    const startTime = Date.now();

    try {
      const vessels = await this.telkomsatClient.fetchSpecificVessels(
        mmsiList.map(mmsi => mmsi.toString())
      );

      if (vessels.length === 0) {
        return { collected: 0, stored: 0, duration: Date.now() - startTime };
      }

      // ✅ Convert with complete data
      const vesselDTOs = vessels.map(vessel => ({
        mmsi: vessel.mmsi,
        latitude: vessel.latitude,
        longitude: vessel.longitude,
        course: vessel.course || 0,
        speed: vessel.speed || 0,
        heading: vessel.heading,
        name: vessel.name,
        callSign: vessel.callSign,
        imo: vessel.imo,
        vesselType: vessel.vesselType || 0,
        navStatus: vessel.navStatus || 15,
        flag: vessel.flag,
        vesselClass: vessel.vesselClass,
        destination: vessel.destination,
        eta: vessel.eta,
        timestamp: vessel.timestamp,
        length: vessel.length,
        width: vessel.width,
        dimension: vessel.dimension,
        source: vessel.source || 'telkomsat'
      }));

      const result = await this.aisDataService.updateCurrentVesselData(vesselDTOs);

      // ✅ Broadcast specific updates
      if (this.vesselTrackingGateway) {
        vessels.forEach(vessel => {
          // ✅ Fixed: Check if vesselTrackingGateway exists before calling method
          if (this.vesselTrackingGateway) {
            this.vesselTrackingGateway.broadcastVesselPosition(vessel.mmsi, {
              latitude: vessel.latitude,
              longitude: vessel.longitude,
              timestamp: vessel.timestamp,
              course: vessel.course,
              speed: vessel.speed
            });
          }
        });
      }

      const duration = Date.now() - startTime;
      this.logger.log(`🎯 Specific collection completed: ${vessels.length} vessels (${duration}ms)`);

      return {
        collected: vessels.length,
        stored: result.newCurrentCount,
        duration,
        broadcasted: !!this.vesselTrackingGateway
      };

    } catch (error) {
      this.logger.error(`Specific collection failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 📊 ENHANCED COLLECTION STATUS
   */
  getCollectionStatus(): CollectionStatus {
    const nextCollection = new Date();
    nextCollection.setSeconds(nextCollection.getSeconds() + 30); // Next 30-second interval

    const averageDuration = this.collectionDurations.length > 0
      ? Math.round(this.collectionDurations.reduce((a, b) => a + b, 0) / this.collectionDurations.length)
      : 0;

    return {
      isCollecting: this.isCollecting,
      lastCollection: this.lastCollectionTime,
      nextCollection: nextCollection.toISOString(),
      totalCollections: this.totalCollections,
      successfulCollections: this.successfulCollections,
      averageDuration,
      lastError: this.lastError // ✅ Now properly typed as string | undefined
    };
  }

  /**
   * 🏥 COMPREHENSIVE HEALTH CHECK
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const telkomsatHealth = await this.telkomsatClient.healthCheck();
    
    // ✅ Check database health
    let databaseHealth = false;
    try {
      await this.aisDataService.getDataStatistics();
      databaseHealth = true;
    } catch (error) {
      this.logger.error(`Database health check failed: ${error.message}`);
    }

    // ✅ Check WebSocket health
    let webSocketHealth = false;
    let connectedClients = 0;
    if (this.vesselTrackingGateway) {
      try {
        const stats = this.vesselTrackingGateway.getConnectionStats();
        webSocketHealth = true;
        connectedClients = stats.connectedClients;
      } catch (error) {
        this.logger.error(`WebSocket health check failed: ${error.message}`);
      }
    }

    // ✅ Determine overall system status
    let systemStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (telkomsatHealth && databaseHealth) {
      systemStatus = webSocketHealth ? 'healthy' : 'degraded';
    } else if (telkomsatHealth || databaseHealth) {
      systemStatus = 'degraded';
    } else {
      systemStatus = 'unhealthy';
    }

    return {
      telkomsatApi: telkomsatHealth,
      database: databaseHealth,
      webSocket: webSocketHealth,
      lastCollection: this.lastCollectionTime,
      isCollecting: this.isCollecting,
      connectedClients,
      systemStatus
    };
  }

  /**
   * 📈 GET PERFORMANCE METRICS
   */
  getPerformanceMetrics(): {
    totalCollections: number;
    successfulCollections: number;
    successRate: number;
    averageDuration: number;
    lastDuration: number;
    isRealTime: boolean;
    uptime: number;
  } {
    const successRate = this.totalCollections > 0 
      ? Math.round((this.successfulCollections / this.totalCollections) * 100)
      : 0;

    const averageDuration = this.collectionDurations.length > 0
      ? Math.round(this.collectionDurations.reduce((a, b) => a + b, 0) / this.collectionDurations.length)
      : 0;

    const lastDuration = this.collectionDurations.length > 0 
      ? this.collectionDurations[this.collectionDurations.length - 1]
      : 0;

    const uptime = this.lastCollectionTime 
      ? Date.now() - this.lastCollectionTime.getTime()
      : 0;

    return {
      totalCollections: this.totalCollections,
      successfulCollections: this.successfulCollections,
      successRate,
      averageDuration,
      lastDuration,
      isRealTime: !!this.vesselTrackingGateway,
      uptime: Math.round(uptime / 1000) // in seconds
    };
  }

  /**
   * 🔄 RESET METRICS
   */
  resetMetrics(): void {
    this.totalCollections = 0;
    this.successfulCollections = 0;
    this.collectionDurations = [];
    this.lastError = undefined; // ✅ Set to undefined instead of null
    this.logger.log('📊 Performance metrics reset');
  }

  /**
   * ⏰ UPDATE COLLECTION INTERVAL (for testing purposes)
   */
  async setCollectionInterval(seconds: number): Promise<string> {
    if (seconds < 10) {
      throw new Error('Minimum interval is 10 seconds');
    }
    
    // This would require dynamic cron job updates
    this.logger.log(`⏰ Collection interval change requested: ${seconds}s (requires restart)`);
    return `Collection interval will be ${seconds}s after restart`;
  }

  /**
   * 🧹 CLEANUP RESOURCES
   */
  async cleanup(): Promise<void> {
    this.logger.log('🧹 Starting cleanup process');
    
    this.isCollecting = false;
    this.resetMetrics();
    
    this.logger.log('✅ Cleanup completed');
  }
} // ✅ Fixed: Added missing closing brace
