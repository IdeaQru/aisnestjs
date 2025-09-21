// src/ais-data/ais-data.service.ts - COMPLETE WITH POI AREA
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CurrentVessel, CurrentVesselDocument } from './schemas/current-vessel.schema';
import { VesselLog, VesselLogDocument } from './schemas/vessel-log.schema';
import { CreateVesselDataDto } from './dto/create-vessel-data.dto';
import { QueryVesselLogDto } from './dto/query-vessel-log.dto';
import { QueryPOIAreaDto, POIAreaCountDto } from './dto/query-poi-area.dto';

export interface ArchiveResult {
  archivedCount: number;
  newCurrentCount: number;
  totalProcessed: number;
  duration: number;
  errors: string[];
}

export interface DataStatistics {
  currentVessels: number;
  totalLogs: number;
  lastUpdate: Date | null;
  oldestLog: Date | null;
  uniqueVessels: number;
}

@Injectable()
export class AisDataService {
  private readonly logger = new Logger(AisDataService.name);

  constructor(
    @InjectModel(CurrentVessel.name)
    private currentVesselModel: Model<CurrentVesselDocument>,
    
    @InjectModel(VesselLog.name)
    private vesselLogModel: Model<VesselLogDocument>,
  ) {}

  /**
   * 🔄 UPDATE CURRENT VESSEL DATA - WITHOUT TRANSACTIONS
   */
  async updateCurrentVesselData(vesselDataArray: CreateVesselDataDto[]): Promise<ArchiveResult> {
    const startTime = Date.now();
    this.logger.log(`Starting batch update for ${vesselDataArray.length} vessels`);

    let archivedCount = 0;
    let newCurrentCount = 0;
    const errors: string[] = [];

    // ✅ Process vessels in batches WITHOUT transactions
    const batchSize = 50; // Process 50 vessels at a time
    
    for (let i = 0; i < vesselDataArray.length; i += batchSize) {
      const batch = vesselDataArray.slice(i, i + batchSize);
      this.logger.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(vesselDataArray.length/batchSize)} (${batch.length} vessels)`);

      for (const vesselData of batch) {
        try {
          // ✅ Find existing vessel
          const existingVessel = await this.currentVesselModel.findOne({ mmsi: vesselData.mmsi });

          if (existingVessel) {
            // ✅ Archive existing data to logs (without session)
            await this.archiveVesselToLog(existingVessel, 'scheduled_update');
            archivedCount++;
          }

          // ✅ Update or create current vessel (upsert)
          await this.currentVesselModel.findOneAndUpdate(
            { mmsi: vesselData.mmsi },
            {
              ...vesselData,
              timestamp: new Date(vesselData.timestamp),
              lastUpdated: new Date(),
              updateCount: existingVessel ? existingVessel.updateCount + 1 : 1
            },
            { 
              upsert: true, 
              new: true
            }
          );
          
          newCurrentCount++;

        } catch (error) {
          const errorMsg = `Failed to process vessel ${vesselData.mmsi}: ${error.message}`;
          this.logger.warn(errorMsg);
          errors.push(errorMsg);
        }
      }

      // ✅ Small delay between batches to avoid overwhelming DB
      if (i + batchSize < vesselDataArray.length) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
      }
    }

    const duration = Date.now() - startTime;
    const result: ArchiveResult = {
      archivedCount,
      newCurrentCount,
      totalProcessed: vesselDataArray.length,
      duration,
      errors
    };

    this.logger.log(`Batch update completed: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * 📋 GET CURRENT VESSEL DATA
   */
  async getCurrentVessels(limit?: number): Promise<CurrentVessel[]> {
    const query = this.currentVesselModel
      .find()
      .sort({ lastUpdated: -1 });

    if (limit) {
      query.limit(limit);
    }

    return query.exec();
  }

  /**
   * 🔍 GET SINGLE CURRENT VESSEL
   */
  async getCurrentVesselByMMSI(mmsi: number): Promise<CurrentVessel> {
    const vessel = await this.currentVesselModel.findOne({ mmsi });
    
    if (!vessel) {
      throw new NotFoundException(`Vessel with MMSI ${mmsi} not found`);
    }
    
    return vessel;
  }

  /**
   * 📚 QUERY VESSEL LOGS
   */
  async queryVesselLogs(queryDto: QueryVesselLogDto) {
    const {
      mmsi,
      mmsis,
      startDate,
      endDate,
      page = 1,
      limit = 100,
      sortBy = 'timestamp',
      sortOrder = 'desc',
      source
    } = queryDto;

    const query: any = { status: 'archived' };

    if (mmsi) {
      query.mmsi = mmsi;
    } else if (mmsis && mmsis.length > 0) {
      query.mmsi = { $in: mmsis };
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (source) {
      query.source = source;
    }

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === 'desc' ? -1 : 1;

    const [logs, total] = await Promise.all([
      this.vesselLogModel
        .find(query)
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(limit)
        .exec(),
      
      this.vesselLogModel.countDocuments(query)
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  /**
   * 🎬 GET VESSEL PLAYBACK DATA
   */
  async getVesselPlaybackData(
    mmsi: number, 
    startDate: string, 
    endDate: string,
    intervalMinutes: number = 5
  ): Promise<any[]> {
    
    const query = {
      mmsi,
      timestamp: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      },
      status: 'archived'
    };

    this.logger.log(`🎬 Getting playback data for MMSI ${mmsi} from ${startDate} to ${endDate}`);

    const logs = await this.vesselLogModel
      .find(query)
      .sort({ timestamp: 1 })
      .lean()
      .exec();

    if (intervalMinutes <= 1) {
      return logs.map(log => this.transformVesselLogForExport(log, 'track'));
    }
    
    const sampledLogs: any[] = [];
    let lastTime = 0;
    
    logs.forEach(log => {
      const currentTime = log.timestamp.getTime();
      const timeDiff = (currentTime - lastTime) / (1000 * 60);
      
      if (timeDiff >= intervalMinutes || sampledLogs.length === 0) {
        sampledLogs.push(this.transformVesselLogForExport(log, 'track'));
        lastTime = currentTime;
      }
    });
    
    this.logger.log(`🎬 Playback data: ${logs.length} raw points, ${sampledLogs.length} sampled points`);
    return sampledLogs;
  }

  /**
   * 📊 GET DATA STATISTICS
   */
  async getDataStatistics(): Promise<DataStatistics> {
    const [
      currentVessels,
      totalLogs,
      lastCurrentUpdate,
      oldestLog,
      uniqueVessels
    ] = await Promise.all([
      this.currentVesselModel.countDocuments(),
      this.vesselLogModel.countDocuments({ status: 'archived' }),
      this.currentVesselModel.findOne().sort({ lastUpdated: -1 }).select('lastUpdated'),
      this.vesselLogModel.findOne({ status: 'archived' }).sort({ timestamp: 1 }).select('timestamp'),
      this.vesselLogModel.distinct('mmsi', { status: 'archived' })
    ]);

    return {
      currentVessels,
      totalLogs,
      lastUpdate: lastCurrentUpdate?.lastUpdated || null,
      oldestLog: oldestLog?.timestamp || null,
      uniqueVessels: uniqueVessels.length
    };
  }

  /**
   * 🗃️ ARCHIVE VESSEL TO LOG - WITHOUT SESSION
   */
  private async archiveVesselToLog(
    vessel: CurrentVesselDocument, 
    reason: string = 'scheduled_update'
  ): Promise<void> {
    
    const logData = {
      mmsi: vessel.mmsi,
      latitude: vessel.latitude,
      longitude: vessel.longitude,
      course: vessel.course,
      speed: vessel.speed,
      heading: vessel.heading,
      name: vessel.name,
      callSign: vessel.callSign,
      vesselType: vessel.vesselType,
      navStatus: vessel.navStatus,
      destination: vessel.destination,
      eta: vessel.eta,
      timestamp: vessel.timestamp,
      length: vessel.length,
      width: vessel.width,
      source: vessel.source,
      archivedAt: new Date(),
      archiveReason: reason,
      status: 'archived'
    };

    // ✅ Simple create without session
    await this.vesselLogModel.create(logData);
  }

  /**
   * 🧹 CLEANUP OLD LOGS
   */
  async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.vesselLogModel.deleteMany({
      timestamp: { $lt: cutoffDate },
      status: 'archived'
    });

    this.logger.log(`Cleaned up ${result.deletedCount} old logs older than ${daysToKeep} days`);
    return result.deletedCount;
  }

  /**
   * 📊 GET VESSEL COUNTS BY SOURCE - Enhanced with VesselLog
   */
  async getVesselCountsBySource(): Promise<any> {
    try {
      // ✅ Get counts from both current and archived
      const [currentBySource, archivedBySource] = await Promise.all([
        // Current vessels
        this.currentVesselModel.aggregate([
          {
            $group: {
              _id: '$source',
              count: { $sum: 1 },
              lastUpdate: { $max: '$lastUpdated' }
            }
          },
          { $sort: { count: -1 } }
        ]),
        
        // ✅ Archived vessels from VesselLog
        this.vesselLogModel.aggregate([
          {
            $match: { status: 'archived' }
          },
          {
            $group: {
              _id: '$source',
              count: { $sum: 1 },
              lastArchived: { $max: '$archivedAt' },
              uniqueVessels: { $addToSet: '$mmsi' }
            }
          },
          {
            $addFields: {
              uniqueVesselCount: { $size: '$uniqueVessels' }
            }
          },
          {
            $project: {
              _id: 1,
              count: 1,
              lastArchived: 1,
              uniqueVesselCount: 1
            }
          },
          { $sort: { count: -1 } }
        ])
      ]);

      // ✅ Combine results
      const sourceMap = new Map();
      
      // Process current data
      currentBySource.forEach(item => {
        sourceMap.set(item._id || 'unknown', {
          source: item._id || 'unknown',
          currentCount: item.count,
          archivedCount: 0,
          uniqueVessels: 0,
          lastUpdate: item.lastUpdate,
          lastArchived: null
        });
      });

      // Process archived data
      archivedBySource.forEach(item => {
        const source = item._id || 'unknown';
        const existing = sourceMap.get(source) || {
          source,
          currentCount: 0,
          archivedCount: 0,
          uniqueVessels: 0,
          lastUpdate: null,
          lastArchived: null
        };
        
        existing.archivedCount = item.count;
        existing.uniqueVessels = item.uniqueVesselCount;
        existing.lastArchived = item.lastArchived;
        
        sourceMap.set(source, existing);
      });

      return Array.from(sourceMap.values()).sort((a, b) => 
        (b.currentCount + b.archivedCount) - (a.currentCount + a.archivedCount)
      );

    } catch (error) {
      this.logger.error(`Failed to get vessel counts by source: ${error.message}`);
      return [];
    }
  }

  /**
   * 🔄 BULK UPSERT (Alternative method for better performance)
   */
  async bulkUpsertVessels(vesselDataArray: CreateVesselDataDto[]): Promise<ArchiveResult> {
    const startTime = Date.now();
    this.logger.log(`Starting bulk upsert for ${vesselDataArray.length} vessels`);

    try {
      // ✅ Prepare bulk operations
      const bulkOps = vesselDataArray.map(vesselData => ({
        updateOne: {
          filter: { mmsi: vesselData.mmsi },
          update: {
            $set: {
              ...vesselData,
              timestamp: new Date(vesselData.timestamp),
              lastUpdated: new Date(),
            },
            $inc: { updateCount: 1 }
          },
          upsert: true
        }
      }));

      // ✅ Execute bulk operation
      const result = await this.currentVesselModel.bulkWrite(bulkOps, { 
        ordered: false // Continue even if some operations fail
      });

      const duration = Date.now() - startTime;
      const archiveResult: ArchiveResult = {
        archivedCount: 0, // We're not archiving in bulk mode
        newCurrentCount: result.upsertedCount + result.modifiedCount,
        totalProcessed: vesselDataArray.length,
        duration,
        errors: []
      };

      this.logger.log(`Bulk upsert completed: ${JSON.stringify(archiveResult)}`);
      return archiveResult;

    } catch (error) {
      this.logger.error(`Bulk upsert failed: ${error.message}`);
      throw error;
    }
  }

  // ====================================================================
  // 🗺️ POI AREA METHODS - NEW FUNCTIONALITY
  // ====================================================================

  /**
   * 🔢 GET TOTAL COUNT FOR POI AREA
   */
  async getPOIAreaTotalCount(queryDto: POIAreaCountDto): Promise<{
    totalCount: number;
    totalPages: number;
    estimatedTime: number;
    dataBreakdown: any;
  }> {
    const geoQuery = this.buildGeoQuery(queryDto);
    
    let totalCount = 0;
    const dataBreakdown = {
      currentVessels: 0,
      archivedVessels: 0,
      totalUnique: 0
    };

    const dataType = queryDto.dataType || 'vessel';

    // ✅ Count based on data type using VesselLog schema
    switch (dataType) {
      case 'vessel':
        // Current vessels from current_vessels collection
        dataBreakdown.currentVessels = await this.currentVesselModel.countDocuments(geoQuery);
        totalCount = dataBreakdown.currentVessels;
        break;

      case 'track':
      case 'ais':
        // ✅ Use VesselLog with proper status filter
        dataBreakdown.archivedVessels = await this.vesselLogModel.countDocuments({
          ...geoQuery,
          status: 'archived'
        });
        totalCount = dataBreakdown.archivedVessels;
        break;

      case 'all':
        [dataBreakdown.currentVessels, dataBreakdown.archivedVessels] = await Promise.all([
          this.currentVesselModel.countDocuments(geoQuery),
          this.vesselLogModel.countDocuments({ 
            ...geoQuery, 
            status: 'archived' 
          })
        ]);
        totalCount = dataBreakdown.currentVessels + dataBreakdown.archivedVessels;
        break;

      default:
        dataBreakdown.currentVessels = await this.currentVesselModel.countDocuments(geoQuery);
        totalCount = dataBreakdown.currentVessels;
    }

    // ✅ Calculate unique vessels using VesselLog schema
    if (totalCount > 0) {
      const uniqueMMSIs = await this.getUniqueMMSIsInArea(geoQuery, dataType);
      dataBreakdown.totalUnique = uniqueMMSIs.length;
    }

    const pageSize = 100;
    const totalPages = Math.ceil(totalCount / pageSize);
    const estimatedTime = Math.ceil(totalCount / 100) * 0.5;

    this.logger.log(`📊 POI Area Count: ${totalCount} vessels, ${totalPages} pages`);

    return {
      totalCount,
      totalPages,
      estimatedTime,
      dataBreakdown
    };
  }

  /**
   * 📄 GET POI AREA DATA WITH PAGINATION
   */
  async getVesselsByPOIArea(queryDto: QueryPOIAreaDto) {
    const startTime = Date.now();
    const pageSize = 100;
    const page = queryDto.page || 1;
    const skip = (page - 1) * pageSize;
    const dataType = queryDto.dataType || 'vessel';

    this.logger.log(`📋 Fetching POI Area page ${page} (${pageSize} vessels per page), type: ${dataType}`);

    const geoQuery = this.buildGeoQuery(queryDto);
    let vessels: any[] = [];
    let totalCount = 0;

    // ✅ Get data based on type using VesselLog schema
    switch (dataType) {
      case 'vessel':
        // Current vessels
        [vessels, totalCount] = await Promise.all([
          this.currentVesselModel
            .find(geoQuery)
            .sort({ lastUpdated: -1 })
            .skip(skip)
            .limit(pageSize)
            .lean()
            .exec(),
          this.currentVesselModel.countDocuments(geoQuery)
        ]);
        break;

      case 'track':
        // ✅ Historical track data from VesselLog
        [vessels, totalCount] = await Promise.all([
          this.vesselLogModel
            .find({ 
              ...geoQuery, 
              status: 'archived' 
            })
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(pageSize)
            .lean()
            .exec(),
          this.vesselLogModel.countDocuments({ 
            ...geoQuery, 
            status: 'archived' 
          })
        ]);
        break;

      case 'ais':
        // ✅ Raw AIS messages from VesselLog
        [vessels, totalCount] = await Promise.all([
          this.vesselLogModel
            .find({ 
              ...geoQuery, 
              status: 'archived' 
            })
            .sort({ archivedAt: -1 })
            .skip(skip)
            .limit(pageSize)
            .lean()
            .exec(),
          this.vesselLogModel.countDocuments({ 
            ...geoQuery, 
            status: 'archived' 
          })
        ]);
        break;

      case 'all':
        // ✅ Mixed data - current + archived
        const halfPageSize = Math.floor(pageSize / 2);
        const [currentVessels, archivedVessels, currentCount, archivedCount] = await Promise.all([
          this.currentVesselModel
            .find(geoQuery)
            .sort({ lastUpdated: -1 })
            .skip(Math.floor(skip / 2))
            .limit(halfPageSize)
            .lean()
            .exec(),
          this.vesselLogModel
            .find({ 
              ...geoQuery, 
              status: 'archived' 
            })
            .sort({ timestamp: -1 })
            .skip(Math.floor(skip / 2))
            .limit(halfPageSize)
            .lean()
            .exec(),
          this.currentVesselModel.countDocuments(geoQuery),
          this.vesselLogModel.countDocuments({ 
            ...geoQuery, 
            status: 'archived' 
          })
        ]);

        vessels = [...currentVessels, ...archivedVessels];
        totalCount = currentCount + archivedCount;
        break;

      default:
        [vessels, totalCount] = await Promise.all([
          this.currentVesselModel
            .find(geoQuery)
            .sort({ lastUpdated: -1 })
            .skip(skip)
            .limit(pageSize)
            .lean()
            .exec(),
          this.currentVesselModel.countDocuments(geoQuery)
        ]);
    }

    // ✅ Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / pageSize);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // ✅ Calculate area statistics
    const areaStats = await this.calculateAreaStatistics(queryDto, totalCount, dataType);

    const result = {
      vessels: vessels.map(v => this.transformVesselLogForExport(v, dataType)),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage,
        hasPrevPage,
        currentPageCount: vessels.length
      },
      statistics: areaStats,
      processingTime: Date.now() - startTime,
      exportData: this.prepareExportData(vessels, areaStats, queryDto)
    };

    this.logger.log(`✅ POI Area page ${page} completed: ${vessels.length} vessels`);
    return result;
  }

  /**
   * 🔄 GET ALL POI AREA DATA (Auto-fetch all pages)
   */
  async getAllPOIAreaData(queryDto: QueryPOIAreaDto) {
    const startTime = Date.now();
    
    // ✅ Ensure dataType is defined
    const safeQueryDto: QueryPOIAreaDto = {
      ...queryDto,
      dataType: queryDto.dataType || 'vessel'
    };
    
    // ✅ Step 1: Get total count
    const countInfo = await this.getPOIAreaTotalCount(safeQueryDto);
    this.logger.log(`🚀 Starting auto-fetch for ${countInfo.totalCount} vessels in ${countInfo.totalPages} pages`);

    const allVessels: any[] = [];
    const pageErrors: string[] = [];
    
    // ✅ Step 2: Fetch all pages automatically
    for (let page = 1; page <= countInfo.totalPages; page++) {
      try {
        this.logger.log(`📖 Auto-fetching page ${page}/${countInfo.totalPages}`);
        
        const pageQuery: QueryPOIAreaDto = {
          ...safeQueryDto,
          page,
          pageSize: 100
        };

        const pageResult = await this.getVesselsByPOIArea(pageQuery);
        allVessels.push(...pageResult.vessels);

        // ✅ Small delay to prevent overwhelming DB
        if (page < countInfo.totalPages) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        const errorMsg = `Page ${page} failed: ${error.message}`;
        this.logger.error(errorMsg);
        pageErrors.push(errorMsg);
      }
    }

    // ✅ Final statistics
    const finalStats = await this.calculateAreaStatistics(safeQueryDto, allVessels.length, safeQueryDto.dataType);
    
    const result = {
      vessels: allVessels,
      totalFetched: allVessels.length,
      expectedTotal: countInfo.totalCount,
      totalPages: countInfo.totalPages,
      processingTime: Date.now() - startTime,
      errors: pageErrors,
      statistics: finalStats,
      exportData: this.prepareExportData(allVessels, finalStats, safeQueryDto),
      isComplete: pageErrors.length === 0
    };

    this.logger.log(`🎉 Auto-fetch completed: ${allVessels.length}/${countInfo.totalCount} vessels`);
    return result;
  }

  /**
   * 🎯 GET VESSEL COUNT IN POI AREA (Quick count)
   */
  async getVesselCountInPOIArea(bounds: {
    minLongitude: number;
    maxLongitude: number;
    minLatitude: number;
    maxLatitude: number;
  }): Promise<number> {
    
    this.logger.log(`⚡ Quick vessel count for bounds: ${JSON.stringify(bounds)}`);
    
    const geoQuery = {
      longitude: { $gte: bounds.minLongitude, $lte: bounds.maxLongitude },
      latitude: { $gte: bounds.minLatitude, $lte: bounds.maxLatitude }
    };

    try {
      const count = await this.currentVesselModel.countDocuments(geoQuery);
      this.logger.log(`⚡ Found ${count} current vessels in bounds`);
      return count;
    } catch (error) {
      this.logger.error(`Quick vessel count failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔍 GET UNIQUE MMSIs IN AREA
   */
  private async getUniqueMMSIsInArea(geoQuery: any, dataType: string): Promise<number[]> {
    let uniqueMMSIs: number[] = [];

    switch (dataType) {
      case 'vessel':
        uniqueMMSIs = await this.currentVesselModel.distinct('mmsi', geoQuery);
        break;
      
      case 'track':
      case 'ais':
        uniqueMMSIs = await this.vesselLogModel.distinct('mmsi', { 
          ...geoQuery, 
          status: 'archived' 
        });
        break;
      
      case 'all':
        const [currentMMSIs, archivedMMSIs] = await Promise.all([
          this.currentVesselModel.distinct('mmsi', geoQuery),
          this.vesselLogModel.distinct('mmsi', { 
            ...geoQuery, 
            status: 'archived' 
          })
        ]);
        uniqueMMSIs = [...new Set([...currentMMSIs, ...archivedMMSIs])];
        break;
      
      default:
        uniqueMMSIs = await this.currentVesselModel.distinct('mmsi', geoQuery);
    }

    return uniqueMMSIs;
  }

  /**
   * 📊 CALCULATE AREA STATISTICS
   */
  private async calculateAreaStatistics(queryDto: any, totalCount: number, dataType: string = 'vessel') {
    const areaKm2 = this.calculateAreaSize(
      queryDto.minLongitude,
      queryDto.maxLongitude,
      queryDto.minLatitude,
      queryDto.maxLatitude
    );

    return {
      totalVessels: totalCount,
      areaSize: `${areaKm2} km²`, 
      density: totalCount > 0 ? Math.round((totalCount / areaKm2) * 100) / 100 : 0,
      bounds: {
        minLongitude: queryDto.minLongitude,
        maxLongitude: queryDto.maxLongitude,
        minLatitude: queryDto.minLatitude,
        maxLatitude: queryDto.maxLatitude
      },
      dataType: dataType,
      timeRange: {
        startDate: queryDto.startDate,
        endDate: queryDto.endDate
      }
    };
  }

  /**
   * 🏗️ BUILD GEO QUERY HELPER
   */
  private buildGeoQuery(queryDto: any): any {
    const { 
      minLongitude, 
      maxLongitude, 
      minLatitude, 
      maxLatitude, 
      startDate, 
      endDate 
    } = queryDto;
    
    // ✅ Validate coordinates
    if (!minLongitude || !maxLongitude || !minLatitude || !maxLatitude) {
      throw new Error('All coordinate bounds are required');
    }

    const geoQuery: any = {
      longitude: { $gte: Number(minLongitude), $lte: Number(maxLongitude) },
      latitude: { $gte: Number(minLatitude), $lte: Number(maxLatitude) }
    };

    // ✅ Add date filter if provided
    if (startDate || endDate) {
      geoQuery.timestamp = {};
      if (startDate) {
        const startDateObj = typeof startDate === 'string' ? new Date(startDate) : startDate;
        geoQuery.timestamp.$gte = startDateObj;
      }
      if (endDate) {
        const endDateObj = typeof endDate === 'string' ? new Date(endDate) : endDate;
        geoQuery.timestamp.$lte = endDateObj;
      }
    }

    return geoQuery;
  }

  /**
   * 🔄 TRANSFORM VESSEL LOG FOR EXPORT
   */
  private transformVesselLogForExport(vessel: any, dataType: string = 'vessel') {
    if (!vessel) {
      return null;
    }

    // ✅ Handle different data sources (current vs VesselLog)
    const isVesselLog = vessel.archivedAt || vessel.archiveReason || vessel.status;

    return {
      mmsi: vessel.mmsi || 0,
      name: vessel.name || 'Unknown',
      latitude: typeof vessel.latitude === 'number' ? vessel.latitude : 0,
      longitude: typeof vessel.longitude === 'number' ? vessel.longitude : 0,
      speed: typeof vessel.speed === 'number' ? vessel.speed : 0,
      course: typeof vessel.course === 'number' ? vessel.course : 0,
      heading: typeof vessel.heading === 'number' ? vessel.heading : 0,
      
      // ✅ Handle vesselType (number in VesselLog schema)
      vesselType: this.getVesselTypeName(vessel.vesselType),
      vesselTypeCode: vessel.vesselType || 0,
      
      // ✅ Handle navStatus (number in VesselLog schema)
      navStatus: this.getNavStatusName(vessel.navStatus),
      navStatusCode: vessel.navStatus || 0,
      
      callSign: vessel.callSign || '',
      destination: vessel.destination || '',
      eta: vessel.eta || '',
      length: typeof vessel.length === 'number' ? vessel.length : 0,
      width: typeof vessel.width === 'number' ? vessel.width : 0,
      
      // ✅ Handle timestamps based on data source
      timestamp: vessel.timestamp || new Date(),
      lastUpdated: vessel.lastUpdated || vessel.timestamp || new Date(),
      
      // ✅ VesselLog specific fields
      ...(isVesselLog && {
        archivedAt: vessel.archivedAt,
        archiveReason: vessel.archiveReason,
        status: vessel.status
      }),
      
      source: vessel.source || 'telkomsat',
      dataSource: isVesselLog ? 'archived' : 'current'
    };
  }

  /**
   * 📋 PREPARE EXPORT DATA
   */
  private prepareExportData(vessels: any[], stats: any, queryDto: any) {
    // ✅ Filter out null vessels
    const validVessels = vessels.filter(v => v !== null);
    
    return {
      summary: {
        exportedAt: new Date(),
        totalRecords: validVessels.length,
        areaSize: stats?.areaSize || 'Unknown',
        bounds: stats?.bounds || {},
        dataType: queryDto?.dataType || 'vessel',
        timeRange: stats?.timeRange || {}
      },
      headers: [
        'MMSI', 'Vessel Name', 'Latitude', 'Longitude', 'Speed (knots)',
        'Course (°)', 'Heading (°)', 'Vessel Type', 'Navigation Status', 
        'Call Sign', 'Destination', 'ETA', 'Length (m)', 'Width (m)', 
        'Timestamp', 'Source', 'Data Source'
      ],
      records: validVessels
    };
  }

  /**
   * 📐 CALCULATE AREA SIZE
   */
  private calculateAreaSize(minLon: number, maxLon: number, minLat: number, maxLat: number): number {
    // ✅ Validate inputs
    if (!minLon || !maxLon || !minLat || !maxLat) {
      return 0;
    }

    const lonDiff = Math.abs(maxLon - minLon);
    const latDiff = Math.abs(maxLat - minLat);
    
    const lonKm = lonDiff * 111.32 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    const latKm = latDiff * 110.54;
    
    return Math.round(lonKm * latKm * 100) / 100;
  }

  /**
   * 🏷️ GET VESSEL TYPE NAME from code
   */
  private getVesselTypeName(vesselTypeCode: number): string {
    const vesselTypes: { [key: number]: string } = {
      0: 'Not available',
      30: 'Fishing',
      31: 'Towing',
      32: 'Towing: length exceeds 200m',
      33: 'Dredging or underwater ops',
      34: 'Diving ops',
      35: 'Military ops',
      36: 'Sailing',
      37: 'Pleasure Craft',
      40: 'High speed craft',
      50: 'Pilot Vessel',
      51: 'Search and Rescue vessel',
      52: 'Tug',
      53: 'Port Tender',
      54: 'Anti-pollution equipment',
      55: 'Law Enforcement',
      58: 'Medical Transport',
      59: 'Noncombatant ship',
      60: 'Passenger',
      70: 'Cargo',
      80: 'Tanker',
      90: 'Other Type'
    };

    return vesselTypes[vesselTypeCode] || `Unknown Type (${vesselTypeCode})`;
  }

  /**
   * 🧭 GET NAVIGATION STATUS NAME from code
   */
  private getNavStatusName(navStatusCode: number): string {
    const navStatuses: { [key: number]: string } = {
      0: 'Under way using engine',
      1: 'At anchor',
      2: 'Not under command',
      3: 'Restricted manoeuvrability',
      4: 'Constrained by her draught',
      5: 'Moored',
      6: 'Aground',
      7: 'Engaged in Fishing',
      8: 'Under way sailing',
      11: 'Power-driven vessel towing astern',
      12: 'Power-driven vessel pushing ahead',
      14: 'AIS-SART is active',
      15: 'Not defined (default)'
    };

    return navStatuses[navStatusCode] || `Unknown Status (${navStatusCode})`;
  }
}
