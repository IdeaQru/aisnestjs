// src/ais-data/ais-data.controller.ts - COMPLETE ENHANCED VERSION
import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Query, 
  Param, 
  ParseIntPipe,
  ValidationPipe,
  HttpStatus,
  HttpCode,
  BadRequestException,
  Logger
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AisDataService } from './ais-data.service';
import { CreateVesselDataDto } from './dto/create-vessel-data.dto';
import { QueryVesselLogDto } from './dto/query-vessel-log.dto';
import { QueryPOIAreaDto, POIAreaCountDto } from './dto/query-poi-area.dto';

@ApiTags('AIS Data Management')
@Controller('ais-data')
export class AisDataController {
  private readonly logger = new Logger(AisDataController.name);

  constructor(
    private readonly aisDataService: AisDataService
  ) {}

  /**
   * 🔄 UPDATE VESSEL DATA - Langsung gunakan AisDataService
   */
  @Post('update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update vessel data in batch' })
  @ApiResponse({ status: 200, description: 'Vessel data updated successfully' })
  async updateVesselData(
    @Body(new ValidationPipe({ whitelist: true })) 
    vesselDataArray: CreateVesselDataDto[]
  ) {
    try {
      const startTime = Date.now();
      const result = await this.aisDataService.updateCurrentVesselData(vesselDataArray);
      
      return {
        success: true,
        result,
        performance: {
          processingTime: Date.now() - startTime,
          vesselsPerSecond: Math.round(vesselDataArray.length / ((Date.now() - startTime) / 1000)),
          batchSize: vesselDataArray.length
        },
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`Update vessel data failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        batchSize: vesselDataArray.length,
        timestamp: new Date()
      };
    }
  }

  /**
   * 📋 GET CURRENT VESSELS
   */
  @Get('current')
  @ApiOperation({ summary: 'Get current vessel positions' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit number of vessels' })
  async getCurrentVessels(@Query('limit') limit?: string) {
    try {
      const limitNum = limit ? parseInt(limit) : undefined;
      const vessels = await this.aisDataService.getCurrentVessels(limitNum);
      
      return {
        success: true,
        count: vessels.length,
        data: vessels,
        metadata: {
          limited: !!limitNum,
          requestedLimit: limitNum,
          hasMore: limitNum ? vessels.length === limitNum : false
        },
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`Get current vessels failed: ${error.message}`);
      throw new BadRequestException(`Failed to get current vessels: ${error.message}`);
    }
  }

  /**
   * 🔍 GET VESSEL BY MMSI
   */
  @Get('current/:mmsi')
  @ApiOperation({ summary: 'Get current vessel by MMSI' })
  async getCurrentVesselByMMSI(@Param('mmsi', ParseIntPipe) mmsi: number) {
    try {
      const vessel = await this.aisDataService.getCurrentVesselByMMSI(mmsi);
      
      return {
        success: true,
        data: vessel,
        metadata: {
          mmsi,
          found: true,
          lastUpdate: vessel.lastUpdated
        },
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`Get vessel by MMSI ${mmsi} failed: ${error.message}`);
      throw new BadRequestException(`Vessel with MMSI ${mmsi} not found`);
    }
  }

  /**
   * 📚 QUERY VESSEL LOGS
   */
  @Get('logs')
  @ApiOperation({ summary: 'Query vessel historical logs' })
  async queryVesselLogs(@Query(ValidationPipe) queryDto: QueryVesselLogDto) {
    try {
      const result = await this.aisDataService.queryVesselLogs(queryDto);
      
      return {
        success: true,
        ...result,
        queryInfo: {
          filters: {
            mmsi: queryDto.mmsi,
            dateRange: queryDto.startDate && queryDto.endDate ? 
              `${queryDto.startDate} to ${queryDto.endDate}` : 'All time',
            source: queryDto.source || 'All sources'
          },
          performance: {
            page: queryDto.page || 1,
            pageSize: queryDto.limit || 100
          }
        },
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`Query vessel logs failed: ${error.message}`);
      throw new BadRequestException(`Failed to query vessel logs: ${error.message}`);
    }
  }

  /**
   * 🎬 GET PLAYBACK DATA
   */
  @Get('playback/:mmsi')
  @ApiOperation({ summary: 'Get vessel playback data for track replay' })
  @ApiQuery({ name: 'startDate', required: true, description: 'Start date (ISO string)' })
  @ApiQuery({ name: 'endDate', required: true, description: 'End date (ISO string)' })
  @ApiQuery({ name: 'interval', required: false, description: 'Sampling interval in minutes' })
  async getPlaybackData(
    @Param('mmsi', ParseIntPipe) mmsi: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('interval') interval?: string
  ) {
    try {
      const intervalMinutes = interval ? parseInt(interval) : 5;
      const data = await this.aisDataService.getVesselPlaybackData(
        mmsi, 
        startDate, 
        endDate, 
        intervalMinutes
      );
      
      // Calculate playback statistics
      const duration = new Date(endDate).getTime() - new Date(startDate).getTime();
      const durationHours = duration / (1000 * 60 * 60);
      
      return {
        success: true,
        mmsi,
        count: data.length,
        data,
        playbackInfo: {
          startDate,
          endDate,
          intervalMinutes,
          totalDuration: `${durationHours.toFixed(1)} hours`,
          trackPoints: data.length,
          samplingRate: intervalMinutes < 1 ? 'Full resolution' : `${intervalMinutes} minute intervals`
        },
        statistics: {
          avgSpeed: data.length > 0 ? 
            Math.round((data.reduce((sum, point) => sum + (point.speed || 0), 0) / data.length) * 10) / 10 : 0,
          maxSpeed: data.length > 0 ? Math.max(...data.map(point => point.speed || 0)) : 0,
          distanceCovered: this.calculateTrackDistance(data),
          timeSpan: `${durationHours.toFixed(1)} hours`
        },
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`Get playback data failed: ${error.message}`);
      throw new BadRequestException(`Failed to get playback data: ${error.message}`);
    }
  }

  /**
   * 📊 GET STATISTICS
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get AIS data statistics' })
  async getStatistics() {
    try {
      const stats = await this.aisDataService.getDataStatistics();
      
      return {
        success: true,
        data: stats,
        analysis: {
          dataHealth: stats.currentVessels > 0 ? 'Active' : 'No current data',
          archiveStatus: stats.totalLogs > 0 ? `${stats.totalLogs.toLocaleString()} archived records` : 'No archive',
          uniqueVesselRatio: stats.currentVessels > 0 ? 
            Math.round((stats.uniqueVessels / stats.currentVessels) * 100) : 0,
          dataAge: stats.lastUpdate ? 
            `Last updated ${this.getTimeAgo(stats.lastUpdate)}` : 'Unknown'
        },
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`Get statistics failed: ${error.message}`);
      throw new BadRequestException(`Failed to get statistics: ${error.message}`);
    }
  }

  /**
   * 🧹 MANUAL CLEANUP
   */
  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually cleanup old logs' })
  @ApiQuery({ name: 'days', required: false, description: 'Days to keep (default: 90)' })
  async manualCleanup(@Query('days') days?: string) {
    try {
      const daysToKeep = days ? parseInt(days) : 90;
      const startTime = Date.now();
      const deletedCount = await this.aisDataService.cleanupOldLogs(daysToKeep);
      
      return {
        success: true,
        deletedCount,
        daysToKeep,
        message: `Cleaned up ${deletedCount.toLocaleString()} old logs older than ${daysToKeep} days`,
        performance: {
          duration: Date.now() - startTime,
          recordsPerSecond: Math.round(deletedCount / ((Date.now() - startTime) / 1000))
        },
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`Manual cleanup failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  // ====================================================================
  // 🗺️ POI AREA APIs - ENHANCED WITH COMPREHENSIVE FEATURES
  // ====================================================================

  /**
   * 📊 GET POI AREA COUNT & METADATA - ENHANCED
   */
  @Get('poi-area/count')
  @ApiOperation({ summary: 'Get total count and metadata for POI area' })
  @ApiQuery({ type: POIAreaCountDto })
  @ApiResponse({ status: 200, description: 'POI area count and metadata retrieved successfully' })
  async getPOIAreaCount(@Query(ValidationPipe) queryDto: POIAreaCountDto) {
    try {
      const safeQuery: POIAreaCountDto = {
        ...queryDto,
        dataType: queryDto.dataType || 'vessel'
      };

      // ✅ ENHANCED: Validate query before processing
      this.validatePOIAreaQuery(safeQuery);

      this.logger.log(`📊 Getting POI area count for bounds: ${JSON.stringify(safeQuery)}`);
      const result = await this.aisDataService.getPOIAreaTotalCount(safeQuery);
      
      return {
        success: true,
        ...result,
        pageSize: 100,
        bounds: {
          minLongitude: safeQuery.minLongitude,
          maxLongitude: safeQuery.maxLongitude,
          minLatitude: safeQuery.minLatitude,
          maxLatitude: safeQuery.maxLatitude
        },
        // ✅ ENHANCED: Comprehensive recommendations
        recommendations: {
          approach: this.getRecommendedApproach(result.totalCount),
          estimatedDownloadTime: this.getEstimatedDownloadTime(result.totalCount),
          memoryUsage: this.getEstimatedMemoryUsage(result.totalCount),
          suggestion: this.getOptimizationSuggestion(result.totalCount)
        },
        // ✅ NEW: Area analysis
        areaAnalysis: {
          boundingBoxSize: this.calculateBoundingBoxSize(safeQuery),
          density: result.dataBreakdown.totalUnique > 0 ? 
            Math.round((result.totalCount / this.calculateBoundingBoxSize(safeQuery)) * 100) / 100 : 0,
          classification: this.classifyAreaDensity(result.totalCount, this.calculateBoundingBoxSize(safeQuery)),
          dataDistribution: {
            currentVessels: result.dataBreakdown.currentVessels,
            archivedVessels: result.dataBreakdown.archivedVessels,
            uniqueVessels: result.dataBreakdown.totalUnique,
            dataQuality: result.dataBreakdown.totalUnique > 0 ? 
              Math.round((result.dataBreakdown.totalUnique / result.totalCount) * 100) : 0
          }
        },
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`POI Area count failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to count POI area: ${error.message}`);
    }
  }

  /**
   * 📄 GET POI AREA DATA - ENHANCED WITH VALIDATION
   */
  @Get('poi-area')
  @ApiOperation({ summary: 'Get vessels in POI area with pagination (100 per page)' })
  @ApiQuery({ type: QueryPOIAreaDto })
  @ApiResponse({ status: 200, description: 'POI area vessels retrieved successfully' })
  async getVesselsByPOIArea(@Query(ValidationPipe) queryDto: QueryPOIAreaDto) {
    try {
      const safeQuery: QueryPOIAreaDto = {
        ...queryDto,
        dataType: queryDto.dataType || 'vessel',
        page: queryDto.page || 1,
        pageSize: 100,
        autoFetch: queryDto.autoFetch || false
      };

      // ✅ ENHANCED: Comprehensive validation
      this.validatePOIAreaQuery(safeQuery);

      this.logger.log(`📋 POI Area query: page=${safeQuery.page}, autoFetch=${safeQuery.autoFetch}, dataType=${safeQuery.dataType}`);

      if (safeQuery.autoFetch) {
        // ✅ Auto-fetch all pages with enhanced metrics
        this.logger.log(`🔄 Starting auto-fetch for POI area`);
        const result = await this.aisDataService.getAllPOIAreaData(safeQuery);
        
        return {
          success: true,
          mode: 'auto-fetch',
          ...result,
          // ✅ ENHANCED: Comprehensive performance metrics
          performance: {
            avgTimePerPage: result.totalPages > 0 ? Math.round(result.processingTime / result.totalPages) : 0,
            vesselsPerSecond: result.processingTime > 0 ? Math.round(result.totalFetched / (result.processingTime / 1000)) : 0,
            totalPages: result.totalPages,
            efficiency: `${((result.totalFetched / result.expectedTotal) * 100).toFixed(1)}%`,
            throughput: `${Math.round((result.totalFetched * 1000) / result.processingTime)} vessels/sec`,
            dataQuality: {
              completeness: result.isComplete,
              errorCount: result.errors.length,
              successRate: `${(((result.totalPages - result.errors.length) / result.totalPages) * 100).toFixed(1)}%`
            }
          },
          // ✅ NEW: Export readiness
          exportInfo: {
            pdfReady: result.totalFetched <= 5000,
            csvReady: true,
            recommendedFormat: result.totalFetched > 5000 ? 'CSV' : 'PDF or CSV',
            estimatedFileSize: {
              csv: this.estimateFileSize(result.totalFetched, 'csv'),
              pdf: result.totalFetched <= 5000 ? this.estimateFileSize(result.totalFetched, 'pdf') : 'Too large for PDF'
            }
          },
          timestamp: new Date()
        };
      } else {
        // ✅ Single page with enhanced navigation
        this.logger.log(`📄 Fetching single page ${safeQuery.page} for POI area`);
        const result = await this.aisDataService.getVesselsByPOIArea(safeQuery);
        
        return {
          success: true,
          mode: 'paginated',
          ...result,
          // ✅ ENHANCED: Navigation assistance
          navigation: {
            isFirstPage: result.pagination.page === 1,
            isLastPage: !result.pagination.hasNextPage,
            nextPage: result.pagination.hasNextPage ? result.pagination.page + 1 : null,
            prevPage: result.pagination.hasPrevPage ? result.pagination.page - 1 : null,
            progress: `${result.pagination.page}/${result.pagination.totalPages}`,
            completionPercentage: Math.round((result.pagination.page / result.pagination.totalPages) * 100),
            remainingPages: result.pagination.totalPages - result.pagination.page,
            remainingVessels: result.pagination.totalCount - (result.pagination.page * 100)
          },
          timestamp: new Date()
        };
      }
    } catch (error) {
      this.logger.error(`POI Area query failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to query POI area: ${error.message}`);
    }
  }

  /**
   * 🔄 GET ALL POI AREA DATA - ENHANCED WITH SAFEGUARDS
   */
  @Get('poi-area/all')
  @ApiOperation({ summary: 'Auto-fetch all vessels in POI area (all pages)' })
  @ApiQuery({ type: QueryPOIAreaDto })
  @ApiResponse({ status: 200, description: 'All POI area vessels retrieved successfully' })
  async getAllPOIAreaData(@Query(ValidationPipe) queryDto: QueryPOIAreaDto) {
    try {
      const safeQuery: QueryPOIAreaDto = {
        ...queryDto,
        dataType: queryDto.dataType || 'vessel',
        pageSize: 100
      };

      // ✅ ENHANCED: Pre-validation with safeguards
      this.validatePOIAreaQuery(safeQuery);

      // ✅ ENHANCED: Pre-check for very large datasets
      const preCheck = await this.aisDataService.getPOIAreaTotalCount(safeQuery);
      if (preCheck.totalCount > 50000) {
        throw new BadRequestException(
          `Dataset too large: ${preCheck.totalCount.toLocaleString()} vessels. Please use pagination or refine your search area. Maximum allowed: 50,000 vessels.`
        );
      }

      this.logger.log(`🚀 Auto-fetching ALL POI area data for dataType: ${safeQuery.dataType} (${preCheck.totalCount} vessels)`);
      const startTime = Date.now();
      
      const result = await this.aisDataService.getAllPOIAreaData(safeQuery);
      const totalTime = Date.now() - startTime;
      
      return {
        success: true,
        mode: 'complete-fetch',
        ...result,
        // ✅ ENHANCED: Comprehensive performance analysis
        performance: {
          totalTime,
          avgTimePerPage: result.totalPages > 0 ? Math.round(totalTime / result.totalPages) : 0,
          vesselsPerSecond: totalTime > 0 ? Math.round(result.totalFetched / (totalTime / 1000)) : 0,
          pagesPerSecond: totalTime > 0 ? (result.totalPages / (totalTime / 1000)).toFixed(2) : 0,
          throughput: `${Math.round((result.totalFetched * 1000) / totalTime)} vessels/sec`,
          efficiency: result.isComplete ? 'Optimal' : 'Partial',
          networkEfficiency: `${Math.round(result.totalPages / (totalTime / 1000))} requests/sec`
        },
        // ✅ ENHANCED: Detailed processing summary
        summary: {
          requestedAt: new Date(Date.now() - totalTime),
          completedAt: new Date(),
          totalTime: `${(totalTime / 1000).toFixed(2)} seconds`,
          efficiency: `${result.totalFetched.toLocaleString()} vessels in ${result.totalPages} pages`,
          dataIntegrity: {
            expectedVessels: result.expectedTotal,
            actualVessels: result.totalFetched,
            completeness: `${((result.totalFetched / result.expectedTotal) * 100).toFixed(1)}%`,
            errors: result.errors.length,
            successfulPages: result.totalPages - result.errors.length,
            failedPages: result.errors.length
          }
        },
        // ✅ ENHANCED: Export readiness analysis
        downloadReady: {
          csv: {
            ready: true,
            estimatedSize: this.estimateFileSize(result.totalFetched, 'csv'),
            records: result.totalFetched,
            headers: result.exportData?.headers?.length || 0
          },
          pdf: {
            ready: result.totalFetched <= 5000,
            estimatedSize: result.totalFetched <= 5000 ? this.estimateFileSize(result.totalFetched, 'pdf') : null,
            limitation: result.totalFetched > 5000 ? `Dataset too large for PDF (${result.totalFetched} > 5000)` : null,
            recommendation: result.totalFetched > 5000 ? 'Use CSV format or filter data' : 'Both PDF and CSV available'
          }
        },
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`Auto-fetch all POI area data failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to fetch all POI area data: ${error.message}`);
    }
  }

  /**
   * 🎯 GET VESSEL COUNT IN SPECIFIC BOUNDS - ENHANCED
   */
  @Get('poi-area/quick-count')
  @ApiOperation({ summary: 'Quick vessel count in specific bounds (current vessels only)' })
  @ApiQuery({ name: 'minLongitude', required: true, type: Number })
  @ApiQuery({ name: 'maxLongitude', required: true, type: Number })
  @ApiQuery({ name: 'minLatitude', required: true, type: Number })
  @ApiQuery({ name: 'maxLatitude', required: true, type: Number })
  async getQuickVesselCount(
    @Query('minLongitude') minLongitude: string,
    @Query('maxLongitude') maxLongitude: string,
    @Query('minLatitude') minLatitude: string,
    @Query('maxLatitude') maxLatitude: string
  ) {
    try {
      const bounds = {
        minLongitude: parseFloat(minLongitude),
        maxLongitude: parseFloat(maxLongitude),
        minLatitude: parseFloat(minLatitude),
        maxLatitude: parseFloat(maxLatitude)
      };

      // ✅ ENHANCED: Validate bounds
      this.validateCoordinateBounds(bounds);

      this.logger.log(`⚡ Quick count for bounds: ${JSON.stringify(bounds)}`);
      const startTime = Date.now();
      const count = await this.aisDataService.getVesselCountInPOIArea(bounds);
      const queryTime = Date.now() - startTime;
      
      return {
        success: true,
        count,
        bounds,
        // ✅ ENHANCED: Comprehensive estimates
        estimates: {
          totalPages: Math.ceil(count / 100),
          estimatedTime: this.getEstimatedDownloadTime(count),
          recommendedApproach: this.getRecommendedApproach(count),
          memoryEstimate: this.getEstimatedMemoryUsage(count),
          queryTime: `${queryTime}ms`
        },
        // ✅ ENHANCED: Detailed area analysis
        areaInfo: {
          sizeKm2: this.calculateBoundingBoxSize(bounds),
          density: count > 0 ? Math.round((count / this.calculateBoundingBoxSize(bounds)) * 100) / 100 : 0,
          classification: this.classifyAreaDensity(count, this.calculateBoundingBoxSize(bounds)),
          coordinates: {
            center: {
              latitude: (bounds.minLatitude + bounds.maxLatitude) / 2,
              longitude: (bounds.minLongitude + bounds.maxLongitude) / 2
            },
            span: {
              latitudeDegrees: bounds.maxLatitude - bounds.minLatitude,
              longitudeDegrees: bounds.maxLongitude - bounds.minLongitude
            }
          }
        },
        // ✅ NEW: Processing recommendations
        recommendations: {
          downloadMethod: this.getRecommendedApproach(count),
          estimatedFileSize: {
            csv: this.estimateFileSize(count, 'csv'),
            pdf: count <= 5000 ? this.estimateFileSize(count, 'pdf') : 'Too large for PDF'
          },
          optimization: count > 10000 ? 
            'Consider using date filters or smaller geographic area' : 
            'Area size is optimal for processing'
        },
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`Quick vessel count failed: ${error.message}`);
      throw new BadRequestException(`Failed to get quick vessel count: ${error.message}`);
    }
  }

  /**
   * 📊 GET VESSEL COUNTS BY SOURCE - ENHANCED
   */
  @Get('vessel-counts-by-source')
  @ApiOperation({ summary: 'Get vessel counts grouped by data source' })
  async getVesselCountsBySource() {
    try {
      const result = await this.aisDataService.getVesselCountsBySource();
      
      // Calculate totals and percentages
      const totalCurrent = result.reduce((sum, item) => sum + item.currentCount, 0);
      const totalArchived = result.reduce((sum, item) => sum + item.archivedCount, 0);
      
      return {
        success: true,
        data: result.map(item => ({
          ...item,
          totalVessels: item.currentCount + item.archivedCount,
          currentPercentage: totalCurrent > 0 ? Math.round((item.currentCount / totalCurrent) * 100) : 0,
          archivedPercentage: totalArchived > 0 ? Math.round((item.archivedCount / totalArchived) * 100) : 0
        })),
        summary: {
          totalSources: result.length,
          totalCurrentVessels: totalCurrent,
          totalArchivedVessels: totalArchived,
          grandTotal: totalCurrent + totalArchived,
          mostActiveSource: result.length > 0 ? 
            result.reduce((max, item) => 
              (item.currentCount + item.archivedCount) > (max.currentCount + max.archivedCount) ? item : max
            ).source : 'None'
        },
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`Get vessel counts by source failed: ${error.message}`);
      throw new BadRequestException(`Failed to get vessel counts by source: ${error.message}`);
    }
  }

  /**
   * 🔄 BULK UPSERT ALTERNATIVE - ENHANCED
   */
  @Post('bulk-upsert')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk upsert vessels (alternative method)' })
  async bulkUpsertVessels(
    @Body(new ValidationPipe({ whitelist: true })) 
    vesselDataArray: CreateVesselDataDto[]
  ) {
    try {
      // ✅ ENHANCED: Validate batch size
      if (vesselDataArray.length > 10000) {
        throw new BadRequestException(`Batch too large: ${vesselDataArray.length} vessels. Maximum allowed: 10,000 vessels per batch.`);
      }

      this.logger.log(`🔄 Bulk upserting ${vesselDataArray.length} vessels`);
      const result = await this.aisDataService.bulkUpsertVessels(vesselDataArray);
      
      return {
        success: true,
        result,
        // ✅ ENHANCED: Detailed performance metrics
        performance: {
          vesselsPerSecond: Math.round(vesselDataArray.length / (result.duration / 1000)),
          avgTimePerVessel: Math.round(result.duration / vesselDataArray.length),
          throughput: `${Math.round((vesselDataArray.length * 1000) / result.duration)} ops/sec`,
          efficiency: result.errors.length === 0 ? 'Perfect' : `${((1 - (result.errors.length / vesselDataArray.length)) * 100).toFixed(1)}%`
        },
        // ✅ NEW: Operation summary
        operation: {
          batchSize: vesselDataArray.length,
          processingTime: `${(result.duration / 1000).toFixed(2)} seconds`,
          successRate: `${(((vesselDataArray.length - result.errors.length) / vesselDataArray.length) * 100).toFixed(1)}%`,
          errorCount: result.errors.length
        },
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`Bulk upsert failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        batchSize: vesselDataArray.length,
        timestamp: new Date()
      };
    }
  }

  /**
   * 🏥 HEALTH CHECK - ENHANCED
   */
  @Get('health')
  @ApiOperation({ summary: 'Health check for AIS data service' })
  async healthCheck() {
    try {
      const stats = await this.aisDataService.getDataStatistics();
      const now = new Date();
      
      return {
        success: true,
        status: 'healthy',
        service: 'ais-data',
        version: '2.0.0',
        uptime: process.uptime(),
        data: {
          currentVessels: stats.currentVessels,
          totalLogs: stats.totalLogs,
          uniqueVessels: stats.uniqueVessels,
          lastUpdate: stats.lastUpdate,
          dataAge: stats.lastUpdate ? this.getTimeAgo(stats.lastUpdate) : 'Unknown'
        },
        systemHealth: {
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version,
          platform: process.platform
        },
        timestamp: now
      };
    } catch (error) {
      return {
        success: false,
        status: 'unhealthy',
        service: 'ais-data',
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  // ====================================================================
  // 🔧 PRIVATE HELPER METHODS - ENHANCED UTILITIES
  // ====================================================================

  /**
   * ✅ Validate POI Area Query
   */
  private validatePOIAreaQuery(query: any): void {
    // Coordinate validation
    if (query.minLongitude >= query.maxLongitude) {
      throw new BadRequestException('minLongitude must be less than maxLongitude');
    }
    
    if (query.minLatitude >= query.maxLatitude) {
      throw new BadRequestException('minLatitude must be less than maxLatitude');
    }

    // Coordinate range validation
    if (query.minLongitude < -180 || query.maxLongitude > 180) {
      throw new BadRequestException('Longitude must be between -180 and 180');
    }
    
    if (query.minLatitude < -90 || query.maxLatitude > 90) {
      throw new BadRequestException('Latitude must be between -90 and 90');
    }

    // Date validation
    if (query.startDate && query.endDate && new Date(query.startDate) >= new Date(query.endDate)) {
      throw new BadRequestException('startDate must be before endDate');
    }

    // Area size validation (prevent extremely large areas)
    const areaSize = this.calculateBoundingBoxSize(query);
    if (areaSize > 1000000) { // > 1M km²
      throw new BadRequestException(`Search area too large: ${areaSize.toFixed(0)} km². Please use a smaller area (max: 1,000,000 km²).`);
    }
  }

  /**
   * ✅ Validate Coordinate Bounds
   */
  private validateCoordinateBounds(bounds: any): void {
    const { minLongitude, maxLongitude, minLatitude, maxLatitude } = bounds;

    if (isNaN(minLongitude) || isNaN(maxLongitude) || isNaN(minLatitude) || isNaN(maxLatitude)) {
      throw new BadRequestException('All coordinate values must be valid numbers');
    }

    if (minLongitude < -180 || maxLongitude > 180) {
      throw new BadRequestException('Longitude must be between -180 and 180');
    }
    
    if (minLatitude < -90 || maxLatitude > 90) {
      throw new BadRequestException('Latitude must be between -90 and 90');
    }

    if (minLongitude >= maxLongitude) {
      throw new BadRequestException('minLongitude must be less than maxLongitude');
    }

    if (minLatitude >= maxLatitude) {
      throw new BadRequestException('minLatitude must be less than maxLatitude');
    }
  }

  /**
   * ✅ Get Recommended Approach
   */
  private getRecommendedApproach(count: number): string {
    if (count <= 100) return 'single-page';
    if (count <= 1000) return 'manual-pagination';  
    if (count <= 5000) return 'auto-fetch';
    if (count <= 20000) return 'auto-fetch-with-patience';
    return 'consider-refinement';
  }

  /**
   * ✅ Get Estimated Download Time
   */
  private getEstimatedDownloadTime(count: number): string {
    const seconds = Math.ceil(count / 100) * 0.5;
    if (seconds < 60) return `~${seconds} seconds`;
    if (seconds < 3600) return `~${Math.ceil(seconds / 60)} minutes`;
    return `~${Math.ceil(seconds / 3600)} hours`;
  }

  /**
   * ✅ Get Estimated Memory Usage
   */
  private getEstimatedMemoryUsage(count: number): string {
    const mbPerVessel = 0.002; // ~2KB per vessel
    const totalMB = Math.ceil(count * mbPerVessel);
    if (totalMB < 1) return '< 1 MB';
    if (totalMB < 1024) return `~${totalMB} MB`;
    return `~${(totalMB / 1024).toFixed(1)} GB`;
  }

  /**
   * ✅ Get Optimization Suggestion
   */
  private getOptimizationSuggestion(count: number): string {
    if (count <= 500) return 'Perfect size for quick processing';
    if (count <= 2000) return 'Good size - recommended for auto-fetch';
    if (count <= 10000) return 'Large dataset - consider smaller date range';
    return 'Very large dataset - strongly recommend area or time refinement';
  }

  /**
   * ✅ Calculate Bounding Box Size
   */
  private calculateBoundingBoxSize(bounds: any): number {
    const lonDiff = Math.abs(bounds.maxLongitude - bounds.minLongitude);
    const latDiff = Math.abs(bounds.maxLatitude - bounds.minLatitude);
    
    const lonKm = lonDiff * 111.32 * Math.cos((bounds.minLatitude + bounds.maxLatitude) / 2 * Math.PI / 180);
    const latKm = latDiff * 110.54;
    
    return Math.round(lonKm * latKm * 100) / 100;
  }

  /**
   * ✅ Classify Area Density
   */
  private classifyAreaDensity(vesselCount: number, areaKm2: number): string {
    if (areaKm2 === 0) return 'undefined';
    
    const density = vesselCount / areaKm2;
    if (density < 0.1) return 'sparse';
    if (density < 1) return 'moderate';
    if (density < 10) return 'dense';
    return 'very-dense';
  }

  /**
   * ✅ Estimate File Size
   */
  private estimateFileSize(vesselCount: number, format: 'csv' | 'pdf'): string {
    if (format === 'csv') {
      const bytesPerVessel = 200; // ~200 bytes per CSV row
      const totalBytes = vesselCount * bytesPerVessel;
      if (totalBytes < 1024) return `${Math.ceil(totalBytes)} bytes`;
      if (totalBytes < 1024 * 1024) return `${Math.ceil(totalBytes / 1024)} KB`;
      return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      const bytesPerVessel = 100; // ~100 bytes per PDF entry
      const totalBytes = vesselCount * bytesPerVessel + 50000; // Base PDF size
      if (totalBytes < 1024 * 1024) return `${Math.ceil(totalBytes / 1024)} KB`;
      return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }

  /**
   * ✅ Calculate Track Distance
   */
  private calculateTrackDistance(trackPoints: any[]): string {
    if (trackPoints.length < 2) return '0 km';

    let totalDistance = 0;
    for (let i = 1; i < trackPoints.length; i++) {
      const prev = trackPoints[i - 1];
      const curr = trackPoints[i];
      
      if (prev.latitude && prev.longitude && curr.latitude && curr.longitude) {
        const distance = this.haversineDistance(
          prev.latitude, prev.longitude,
          curr.latitude, curr.longitude
        );
        totalDistance += distance;
      }
    }

    if (totalDistance < 1) return `${Math.round(totalDistance * 1000)} m`;
    return `${totalDistance.toFixed(1)} km`;
  }

  /**
   * ✅ Haversine Distance Calculation
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * ✅ Get Time Ago
   */
  private getTimeAgo(date: Date): string {
    const now = new Date().getTime();
    const diffMs = now - new Date(date).getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${diffDays} days ago`;
  }
}
