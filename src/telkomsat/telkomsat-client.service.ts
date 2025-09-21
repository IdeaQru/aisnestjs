// src/telkomsat/telkomsat-client.service.ts
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { map } from 'rxjs/operators';

// ✅ INTERFACE DEFINITIONS - Add at the top of file
export interface TelkomsatVesselResponse {
  code: number;
  message: string;
  data: TelkomsatVessel[];
  count: number;
  total_count: number;
}
export interface ProcessedVessel {
  mmsi: number;
  latitude: number;
  longitude: number;
  course: number;
  speed: number;
  heading?: number;
  name?: string;
  callSign?: string;
  vesselType: number;
  navStatus: number;
  destination?: string;
  eta?: string;
  timestamp: string;
  length?: number;
  width?: number;
  source?: string;
  // ✅ Additional fields from API - LENGKAP
  imo?: string;
  flag?: string;
  vesselClass?: string;
  // ✅ Complete dimension data
  dimension?: {
    a?: number;
    b?: number;
    c?: number;
    d?: number;
    width?: number;
    length?: number;
  };
}
export interface TelkomsatVessel {
  mmsi: string;
  imo: string;
  lat: string;
  lon: string;
  cog: string | null;
  sog: string;
  heading: string | null;
  dimension: {
    a: number;
    b: number;
    c: number;
    d: number;
    width: number;
    length: number;
  } | null;
  eta: string | null;
  name: string;
  callsign: string;
  class: string;
  type: string;
  flag: string;
  status: string;
  destination: string | null;
  data_date: string;
  data_time: string;
  source: string;
}



@Injectable()
export class TelkomsatClientService {
  private readonly logger = new Logger(TelkomsatClientService.name);
  private readonly API_BASE_URL: string;
  private readonly API_KEY: string;
  private requestCount = 0;
  private successfulRequests = 0;
  private lastRequestTime: Date = new Date();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.API_BASE_URL = this.configService.get<string>(
      'TELKOMSAT_API_URL', 
      'https://ais.telkomsat.co.id/api'
    );
    this.API_KEY = this.configService.get<string>(
      'TELKOMSAT_API_KEY', 
      '7tpJTqNGgXQe3LwmhDlhUtCT0Tg9btUA89kIsG1ThJleBKuE'
    );
    
    this.logger.log(`🛰️ Telkomsat Client initialized`);
    this.logger.log(`📡 API Base URL: ${this.API_BASE_URL}`);
    this.logger.log(`🔑 API Key: ${this.API_KEY.substring(0, 8)}...`);
  }

  /**
   * 🛰️ FETCH VESSELS - Using form-data like Postman
   */
  async fetchVesselsFromTelkomsat(options: {
    limit?: number;
    offset?: number;
    page?: number;
    timeout?: number;
  } = {}): Promise<ProcessedVessel[]> {
    const { limit = 10, offset = 0, page = 1, timeout: requestTimeout = 30000 } = options;

    this.logger.log(`🚀 Fetching vessels: limit=${limit}, page=${page}, offset=${offset}`);
    this.requestCount++;
    this.lastRequestTime = new Date();

    try {
      // ✅ Use form-data exactly like in Postman
      const formData = new FormData();
      formData.append('key', this.API_KEY);
      formData.append('page', page.toString());
      formData.append('limit', limit.toString());
      
      // Optional: Add offset if needed
      if (offset > 0) {
        formData.append('offset', offset.toString());
      }

      this.logger.debug(`📡 Making request with key: ${this.API_KEY.substring(0, 8)}...`);

      const responseData = await firstValueFrom(
        this.httpService.post<TelkomsatVesselResponse>(
          `${this.API_BASE_URL}/vesselArea`,
          formData,
          {
            headers: {
              // ✅ Don't set Content-Type - let axios handle multipart/form-data
              'User-Agent': 'AIS-Backend/1.0',
              'Accept': 'application/json',
            },
            timeout: requestTimeout,
          }
        ).pipe(
          timeout(requestTimeout),
          map(response => {
            this.logger.log(`📊 Response: status=${response.status}, code=${response.data?.code}, count=${response.data?.count}`);
            return response.data;
          }),
          catchError((error) => {
            this.logger.error(`❌ API request failed:`, {
              status: error.response?.status,
              statusText: error.response?.statusText,
              data: error.response?.data,
              message: error.message,
              url: error.config?.url,
              key_used: this.API_KEY.substring(0, 8) + '...'
            });
            
            throw new HttpException(
              `Telkomsat API error: ${error.response?.data?.message || error.message}`,
              error.response?.status || HttpStatus.SERVICE_UNAVAILABLE
            );
          })
        )
      );

      // ✅ Validate response
      if (!responseData) {
        throw new HttpException('No response data received', HttpStatus.BAD_GATEWAY);
      }

      if (responseData.code !== 200) {
        this.logger.error(`⚠️ API error: ${responseData.code} - ${responseData.message}`);
        throw new HttpException(
          `Telkomsat API error: ${responseData.message}`,
          HttpStatus.BAD_GATEWAY
        );
      }

      if (!responseData.data || !Array.isArray(responseData.data)) {
        this.logger.warn('📭 No vessel data in response');
        return [];
      }

      // ✅ Process vessels
      const processedVessels = this.processTelkomsatVessels(responseData.data);
      
      this.successfulRequests++;
      this.logger.log(`✅ Successfully processed ${processedVessels.length}/${responseData.data.length} vessels (${responseData.total_count} total available)`);
      
      return processedVessels;

    } catch (error) {
      this.logger.error(`💥 Fetch failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔄 OPTIMIZED COLLECTION - Multiple pages
   */
  async collectVesselsMassively(): Promise<ProcessedVessel[]> {
    this.logger.log('🚀 Starting optimized vessel collection with pagination');

    try {
      // ✅ Start with page 1, limit 100
      const page1Vessels = await this.fetchVesselsFromTelkomsat({ 
        limit: 100, 
        page: 1 
      });

      if (page1Vessels.length === 0) {
        this.logger.warn('📭 No vessels from page 1, trying smaller batch');
        return await this.fetchVesselsFromTelkomsat({ limit: 10, page: 1 });
      }

      // ✅ Try additional pages in parallel
      const additionalPages = await Promise.allSettled([
        this.fetchVesselsFromTelkomsat({ limit: 100, page: 2 }),
        this.fetchVesselsFromTelkomsat({ limit: 100, page: 3 }),
        this.fetchVesselsFromTelkomsat({ limit: 100, page: 4 }),
      ]);

      const allVessels = [...page1Vessels];
      
      additionalPages.forEach((result, index) => {
        const pageNum = index + 2;
        if (result.status === 'fulfilled' && result.value.length > 0) {
          allVessels.push(...result.value);
          this.logger.log(`📦 Page ${pageNum}: ${result.value.length} vessels`);
        } else if (result.status === 'rejected') {
          this.logger.warn(`⚠️ Page ${pageNum} failed: ${result.reason}`);
        }
      });

      const uniqueVessels = this.deduplicateVessels(allVessels);
      this.logger.log(`🎯 Collection complete: ${uniqueVessels.length} unique vessels from ${allVessels.length} total`);
      
      return uniqueVessels;

    } catch (error) {
      this.logger.error(`💥 Collection failed: ${error.message}`);
      
      // ✅ Fallback: minimal request
      try {
        this.logger.log('🔄 Attempting fallback minimal request...');
        return await this.fetchVesselsFromTelkomsat({ limit: 10, page: 1 });
      } catch (fallbackError) {
        this.logger.error(`💥 Fallback also failed: ${fallbackError.message}`);
        return [];
      }
    }
  }

  /**
   * 🔄 PROCESS VESSELS - Handle the actual API response format
   */
// src/telkomsat/telkomsat-client.service.ts


/**
 * 🔄 ENHANCED PROCESSING - Save ALL fields with dimension
 */
private processTelkomsatVessels(telkomsatVessels: TelkomsatVessel[]): ProcessedVessel[] {
  if (!Array.isArray(telkomsatVessels)) {
    this.logger.warn('⚠️ Invalid vessel data format');
    return [];
  }

  let processed = 0;
  let filtered = 0;
  let errors = 0;

  const validVessels = telkomsatVessels
    .filter(tv => {
      // ✅ Enhanced validation - allow zero coordinates for completeness
      const isValid = tv && 
                     tv.mmsi && tv.mmsi !== '' &&
                     tv.lat && tv.lat !== '' &&
                     tv.lon && tv.lon !== '';
      
      if (!isValid) {
        filtered++;
        this.logger.debug(`Filtered vessel: mmsi=${tv?.mmsi}, lat=${tv?.lat}, lon=${tv?.lon}`);
      }
      return isValid;
    })
    .map(tv => {
      try {
        const vessel: ProcessedVessel = {
          // ✅ Core vessel data
          mmsi: parseInt(tv.mmsi, 10),
          latitude: parseFloat(tv.lat),
          longitude: parseFloat(tv.lon),
          
          // ✅ Navigation data - handle null/empty values
          course: tv.cog && tv.cog !== null ? parseFloat(tv.cog) : 0,
          speed: tv.sog && tv.sog !== null ? parseFloat(tv.sog) : 0,
          heading: tv.heading && tv.heading !== '511' && tv.heading !== null 
            ? parseFloat(tv.heading) : undefined,
          
          // ✅ Vessel identification - preserve empty strings as undefined
          name: tv.name && tv.name.trim() !== '' ? tv.name.trim() : undefined,
          callSign: tv.callsign && tv.callsign.trim() !== '' ? tv.callsign.trim() : undefined,
          imo: tv.imo && tv.imo.trim() !== '' ? tv.imo.trim() : undefined,
          
          // ✅ Classification data
          vesselType: this.mapVesselTypeToNumber(tv.type),
          navStatus: this.mapStatusToNumber(tv.status),
          flag: tv.flag && tv.flag.trim() !== '' ? tv.flag.trim() : undefined,
          vesselClass: tv.class && tv.class.trim() !== '' ? tv.class.trim() : undefined,
          
          // ✅ Journey data
          destination: tv.destination && tv.destination.trim() !== '' ? tv.destination.trim() : undefined,
          eta: tv.eta && tv.eta.trim() !== '' ? tv.eta.trim() : undefined,
          
          // ✅ Temporal data
          timestamp: this.parseDateTime(tv.data_date, tv.data_time),
          source: tv.source || 'telkomsat',
          
          // ✅ COMPLETE DIMENSION DATA - save all dimension fields
          dimension: tv.dimension ? {
            a: tv.dimension.a || undefined,
            b: tv.dimension.b || undefined,
            c: tv.dimension.c || undefined,
            d: tv.dimension.d || undefined,
            width: tv.dimension.width || undefined,
            length: tv.dimension.length || undefined,
          } : undefined,
          
          // ✅ Legacy dimension fields for backward compatibility
          length: tv.dimension?.length || undefined,
          width: tv.dimension?.width || undefined,
        };
        
        processed++;
        return vessel;
        
      } catch (error) {
        errors++;
        this.logger.debug(`⚠️ Failed to process vessel ${tv.mmsi}: ${error.message}`);
        return null;
      }
    })
    .filter((vessel): vessel is ProcessedVessel => {
      if (!vessel) return false;
      
      // ✅ Enhanced validation - more permissive for completeness
      const isValid = typeof vessel.mmsi === 'number' &&
        !isNaN(vessel.mmsi) && 
        !isNaN(vessel.latitude) && 
        !isNaN(vessel.longitude) &&
        vessel.latitude >= -90 && vessel.latitude <= 90 &&
        vessel.longitude >= -180 && vessel.longitude <= 180 &&
        vessel.mmsi > 0;
      
      if (!isValid) {
        this.logger.debug(`Invalid vessel data: mmsi=${vessel.mmsi}, lat=${vessel.latitude}, lon=${vessel.longitude}`);
      }
      
      return isValid;
    });

  this.logger.log(`📊 Processing results: ${processed} processed, ${filtered} filtered, ${errors} errors, ${validVessels.length} valid vessels`);
  return validVessels;
}


  /**
   * 🧹 DEDUPLICATION
   */
  private deduplicateVessels(vessels: ProcessedVessel[]): ProcessedVessel[] {
    if (!vessels || vessels.length === 0) return [];

    const vesselMap = new Map<number, ProcessedVessel>();
    let duplicatesFound = 0;
    
    vessels.forEach(vessel => {
      if (vessel && vessel.mmsi && vessel.mmsi > 0) {
        const existing = vesselMap.get(vessel.mmsi);
        
        if (!existing) {
          vesselMap.set(vessel.mmsi, vessel);
        } else {
          if (vessel.timestamp > existing.timestamp) {
            vesselMap.set(vessel.mmsi, vessel);
          }
          duplicatesFound++;
        }
      }
    });
    
    const uniqueVessels = Array.from(vesselMap.values());
    
    if (duplicatesFound > 0) {
      this.logger.log(`🧹 Removed ${duplicatesFound} duplicates, ${uniqueVessels.length} unique vessels remain`);
    }
    
    return uniqueVessels;
  }

  /**
   * 🏥 HEALTH CHECK
   */
  async healthCheck(): Promise<boolean> {
    try {
      this.logger.log('🏥 Performing health check...');

      const formData = new FormData();
      formData.append('key', this.API_KEY);
      formData.append('limit', '1');
      formData.append('page', '1');

      const responseData = await firstValueFrom(
        this.httpService.post<TelkomsatVesselResponse>(
          `${this.API_BASE_URL}/vesselArea`,
          formData,
          {
            timeout: 10000,
          }
        ).pipe(
          timeout(10000),
          map(response => response.data)
        )
      );

      const isHealthy = responseData && responseData.code === 200;
      this.logger.log(`🏥 Health check: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
      
      if (isHealthy && responseData.total_count) {
        this.logger.log(`📊 API reports ${responseData.total_count} total vessels available`);
      }

      return isHealthy;

    } catch (error) {
      this.logger.error(`💥 Health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 🎯 FETCH SPECIFIC VESSELS BY MMSI
   */
  async fetchSpecificVessels(mmsiList: string[]): Promise<ProcessedVessel[]> {
    if (!mmsiList || mmsiList.length === 0) return [];

    this.logger.log(`🎯 Fetching ${mmsiList.length} specific vessels`);
    
    const formData = new FormData();
    formData.append('key', this.API_KEY);
    
    // Add MMSIs as separate parameters
    mmsiList.forEach(mmsi => {
      formData.append('mmsi[]', mmsi.toString());
    });

    try {
      const responseData = await firstValueFrom(
        this.httpService.post<TelkomsatVesselResponse>(
          `${this.API_BASE_URL}/vessel`,
          formData,
          {
            timeout: 15000,
          }
        ).pipe(
          timeout(15000),
          map(response => response.data)
        )
      );

      if (responseData.code === 200 && responseData.data) {
        const vessels = this.processTelkomsatVessels(responseData.data);
        this.logger.log(`✅ Retrieved ${vessels.length} specific vessels`);
        return vessels;
      }

      return [];

    } catch (error) {
      this.logger.error(`❌ Failed to fetch specific vessels: ${error.message}`);
      return [];
    }
  }

  /**
   * 📊 ENHANCED STATS
   */
  async getVesselStats(): Promise<{
    totalRequests: number;
    successfulRequests: number;
    successRate: number;
    lastRequestTime: Date;
    apiHealth: boolean;
    connectionInfo: any;
  }> {
    const health = await this.healthCheck();
    const successRate = this.requestCount > 0 ? 
      Math.round((this.successfulRequests / this.requestCount) * 100) : 0;
    
    return {
      totalRequests: this.requestCount,
      successfulRequests: this.successfulRequests,
      successRate,
      lastRequestTime: this.lastRequestTime,
      apiHealth: health,
      connectionInfo: {
        apiUrl: this.API_BASE_URL,
        hasApiKey: !!this.API_KEY,
        keyPreview: this.API_KEY.substring(0, 8) + '...'
      }
    };
  }

  /**
   * 🛠️ UTILITY METHODS
   */
  private mapVesselTypeToNumber(type: string): number {
    if (!type) return 0;
    
    const typeMap: {[key: string]: number} = {
      'Cargo': 70, 'Tanker': 80, 'Tankers': 80, 'Passenger': 60, 
      'Fishing': 30, 'Tug': 52, 'Pilot': 50, 'Search and Rescue': 51,
      'Pleasure Craft': 37, 'High Speed Craft': 40, 'Other': 90, 
      'Military': 35, 'Sailing': 36, 'Unknown': 0
    };
    return typeMap[type] || 0;
  }

  private mapStatusToNumber(status: string): number {
    if (!status) return 15;
    
    const statusMap: {[key: string]: number} = {
      'Under Way Using Engine': 0, 'At Anchor': 1, 'Not Under Command': 2,
      'Restricted Manoeuvrability': 3, 'Constrained by Draught': 4,
      'Moored': 5, 'Aground': 6, 'Engaged in Fishing': 7,
      'Under Way Sailing': 8, 'Not Defined Default': 15, 'Not Defined': 15
    };
    return statusMap[status] || 15;
  }

private parseDateTime(date: string, time: string): string {
  
    // ✅ Parsing sebagai local time tanpa Z
    const dateTime = `${date} ${time}`;
   
    
    return dateTime;
 
}

  /**
   * 🔄 RESET STATS
   */
  resetStats(): void {
    this.requestCount = 0;
    this.successfulRequests = 0;
    this.lastRequestTime = new Date();
    this.logger.log('📊 Stats reset');
  }

  /**
   * 🔍 GET CONNECTION INFO
   */
  getConnectionInfo(): {
    apiUrl: string;
    hasApiKey: boolean;
    totalRequests: number;
    lastRequest: Date;
  } {
    return {
      apiUrl: this.API_BASE_URL,
      hasApiKey: !!this.API_KEY,
      totalRequests: this.requestCount,
      lastRequest: this.lastRequestTime,
    };
  }
}
