// src/websocket/vessel-tracking.gateway.ts - INITIAL ALL + UPDATE <1MIN
import { 
  WebSocketGateway, 
  WebSocketServer, 
  SubscribeMessage, 
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { AisDataService } from '../ais-data/ais-data.service';

@WebSocketGateway({
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  namespace: '/vessel-tracking'
})
export class VesselTrackingGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() 
  server: Server;

  private readonly logger = new Logger(VesselTrackingGateway.name);
  private connectedClients = new Map<string, Socket>();

  // ✅ DIFFERENT TIME FILTERS: Initial vs Update
  private readonly INITIAL_DATA_AGE_HOURS = 24;           // Initial: All ships from 24h
  private readonly UPDATE_DATA_AGE_MINUTES = 1;           // Update: Only < 1 minute
  
  private readonly INITIAL_DATA_AGE_MS = this.INITIAL_DATA_AGE_HOURS * 60 * 60 * 1000;
  private readonly UPDATE_DATA_AGE_MS = this.UPDATE_DATA_AGE_MINUTES * 60 * 1000;

  constructor(private readonly aisDataService: AisDataService) {}

  afterInit(server: Server) {
    this.logger.log('🔌 WebSocket Gateway initialized');
    this.logger.log(`📊 Initial data: ${this.INITIAL_DATA_AGE_HOURS}h | Updates: ${this.UPDATE_DATA_AGE_MINUTES}min`);
  }

  handleConnection(client: Socket) {
    this.connectedClients.set(client.id, client);
    this.logger.log(`🔗 Client connected: ${client.id} (Total: ${this.connectedClients.size})`);

    // ✅ Send ALL vessels as initial data
    this.sendLatestDataToClient(client);
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`❌ Client disconnected: ${client.id} (Total: ${this.connectedClients.size})`);
  }

  // ✅ DUAL TIME FILTERS: Different logic for initial vs update
  private isVesselFreshForInitial(vessel: any): boolean {
    return this.checkVesselAge(vessel, this.INITIAL_DATA_AGE_MS);
  }

  private isVesselFreshForUpdate(vessel: any): boolean {
    return this.checkVesselAge(vessel, this.UPDATE_DATA_AGE_MS);
  }

  // ✅ SHARED: Age checking logic
  private checkVesselAge(vessel: any, maxAgeMs: number): boolean {
    try {
      let vesselDateTime: Date;

      // ✅ Check data_date and data_time first
      if (vessel.data_date && vessel.data_time) {
        vesselDateTime = new Date(`${vessel.data_date} ${vessel.data_time}`);
      } 
      // ✅ Fallback to timestamp field
      else if (vessel.timestamp) {
        vesselDateTime = new Date(vessel.timestamp);
      } 
      else {
        // ✅ No timestamp = exclude
        return false;
      }

      // ✅ Validate parsed date
      if (isNaN(vesselDateTime.getTime())) {
        return false;
      }

      const now = new Date();
      const ageMs = now.getTime() - vesselDateTime.getTime();

      // ✅ Future data is invalid
      if (ageMs < 0) {
        return false;
      }

      return ageMs <= maxAgeMs;
      
    } catch (error) {
      return false;
    }
  }

  // ✅ Helper to get vessel datetime
  private getVesselDateTime(vessel: any): Date {
    if (vessel.data_date && vessel.data_time) {
      try {
        return new Date(`${vessel.data_date} ${vessel.data_time}`);
      } catch (error) {
        // Continue to fallback
      }
    }
    
    if (vessel.timestamp) {
      try {
        return new Date(vessel.timestamp);
      } catch (error) {
        // Continue to fallback
      }
    }
    
    return new Date(0); // Very old date
  }

  /**
   * 📡 BROADCAST VESSEL UPDATE - Only vessels updated in last 1 MINUTE
   * ✅ This sends ONLY recent changes for real-time updates
   */
  broadcastVesselUpdate(vessels: any[]) {
    if (!vessels || vessels.length === 0) {
      this.logger.debug('📡 No vessels to process for updates');
      return;
    }

    // ✅ Filter ONLY vessels updated in last 1 minute
    const recentlyUpdatedVessels = vessels.filter(vessel => 
      this.isVesselFreshForUpdate(vessel)
    );
    
    if (recentlyUpdatedVessels.length === 0) {
      this.logger.debug(`📡 No recent updates (< ${this.UPDATE_DATA_AGE_MINUTES}min) from ${vessels.length} vessels`);
      return;
    }

    // ✅ Sort by newest first
    const sortedRecentVessels = recentlyUpdatedVessels.sort((a, b) => {
      const aTime = this.getVesselDateTime(a);
      const bTime = this.getVesselDateTime(b);
      return bTime.getTime() - aTime.getTime();
    });

    const updatePayload = {
      type: 'vessel_update',
      timestamp: new Date(),
      count: sortedRecentVessels.length,
      totalProcessed: vessels.length,
      updateWindow: `${this.UPDATE_DATA_AGE_MINUTES}min`,
      cutoffTime: new Date(Date.now() - this.UPDATE_DATA_AGE_MS),
      vessels: sortedRecentVessels
    };

    this.server.emit('vessel_update', updatePayload);
    
    this.logger.log(
      `📡 Broadcasted RECENT updates to ${this.connectedClients.size} clients: ` +
      `${sortedRecentVessels.length}/${vessels.length} vessels (< ${this.UPDATE_DATA_AGE_MINUTES}min)`
    );
  }

  /**
   * 📍 BROADCAST SINGLE VESSEL POSITION - Only if recent (< 1 minute)
   */
  broadcastVesselPosition(mmsi: number, position: any) {
    if (!mmsi || !position) {
      return;
    }

    // ✅ Check if position is recent (< 1 minute)
    if (!this.isVesselFreshForUpdate(position)) {
      this.logger.debug(`📍 Skipping old position for vessel ${mmsi} (> ${this.UPDATE_DATA_AGE_MINUTES}min)`);
      return;
    }

    const positionPayload = {
      type: 'position_update',
      mmsi,
      position,
      timestamp: new Date(),
      updateWindow: `${this.UPDATE_DATA_AGE_MINUTES}min`
    };

    this.server.emit(`vessel_${mmsi}`, positionPayload);
    this.server.emit('position_update', positionPayload);
    
    this.logger.debug(`📍 Broadcasted recent position for vessel ${mmsi}`);
  }

  /**
   * 🔄 Send ALL VESSELS as initial data (24h window)
   * ✅ This gives complete overview of all vessels
   */
  private async sendLatestDataToClient(client: Socket) {
    try {
      this.logger.log(`📤 Loading ALL vessels for initial data (client: ${client.id})`);

      // ✅ Get ALL available vessels (large limit)
      const allVessels = await this.aisDataService.getCurrentVessels(10000);
      
      if (!allVessels || allVessels.length === 0) {
        client.emit('initial_data', {
          type: 'initial_data',
          timestamp: new Date(),
          count: 0,
          totalAvailable: 0,
          dataWindow: `${this.INITIAL_DATA_AGE_HOURS}h`,
          updateWindow: `${this.UPDATE_DATA_AGE_MINUTES}min`,
          vessels: [],
          message: 'No vessel data available'
        });
        return;
      }

      // ✅ Filter vessels from last 24 hours (for initial data)
      const initialVessels = allVessels.filter(vessel => 
        this.isVesselFreshForInitial(vessel)
      );

      // ✅ Separate active (< 1 min) vs static vessels for info
      const activeVessels = initialVessels.filter(vessel => 
        this.isVesselFreshForUpdate(vessel)
      );

      // ✅ Sort by activity (active first, then by timestamp)
      const sortedVessels = initialVessels.sort((a, b) => {
        // Priority 1: Active vessels first
        const aActive = this.isVesselFreshForUpdate(a) ? 1 : 0;
        const bActive = this.isVesselFreshForUpdate(b) ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        
        // Priority 2: Newest first within same activity level
        const aTime = this.getVesselDateTime(a);
        const bTime = this.getVesselDateTime(b);
        return bTime.getTime() - aTime.getTime();
      });

      const initialDataPayload = {
        type: 'initial_data',
        timestamp: new Date(),
        count: sortedVessels.length,
        totalAvailable: allVessels.length,
        filtered: allVessels.length - initialVessels.length,
        activeCount: activeVessels.length,         // Currently moving
        staticCount: initialVessels.length - activeVessels.length, // Stationary
        dataWindow: `${this.INITIAL_DATA_AGE_HOURS}h`,
        updateWindow: `${this.UPDATE_DATA_AGE_MINUTES}min`,
        cutoffTime: new Date(Date.now() - this.INITIAL_DATA_AGE_MS),
        vessels: sortedVessels,
        message: `Initial data: ${sortedVessels.length} vessels (${activeVessels.length} active, ${initialVessels.length - activeVessels.length} static)`
      };

      client.emit('initial_data', initialDataPayload);

      this.logger.log(
        `📤 Sent ALL vessels to ${client.id}: ` +
        `${sortedVessels.length} total (${activeVessels.length} active, ${sortedVessels.length - activeVessels.length} static) ` +
        `from ${allVessels.length} available`
      );
      
    } catch (error) {
      this.logger.error(`❌ Failed to send initial data to ${client.id}: ${error.message}`);
      
      client.emit('initial_data_error', {
        type: 'initial_data_error',
        timestamp: new Date(),
        error: error.message,
        message: 'Failed to load vessel data. Please refresh and try again.'
      });
    }
  }

  /**
   * 📊 Handle client subscription to specific vessel
   */
  @SubscribeMessage('subscribe_vessel')
  handleVesselSubscription(@MessageBody() data: { mmsi: number }, client: Socket) {
    client.join(`vessel_${data.mmsi}`);
    this.logger.log(`🎯 Client ${client.id} subscribed to vessel ${data.mmsi}`);
    
    return {
      event: 'subscription_confirmed',
      data: { 
        mmsi: data.mmsi, 
        status: 'subscribed',
        updateWindow: `${this.UPDATE_DATA_AGE_MINUTES}min`,
        note: 'You will receive position updates for movements in last 1 minute only'
      }
    };
  }

  @SubscribeMessage('unsubscribe_vessel')
  handleVesselUnsubscription(@MessageBody() data: { mmsi: number }, client: Socket) {
    client.leave(`vessel_${data.mmsi}`);
    this.logger.log(`❌ Client ${client.id} unsubscribed from vessel ${data.mmsi}`);
    
    return {
      event: 'unsubscription_confirmed',
      data: { mmsi: data.mmsi, status: 'unsubscribed' }
    };
  }

  @SubscribeMessage('subscribe_area')
  handleAreaSubscription(@MessageBody() data: { 
    bounds: { north: number, south: number, east: number, west: number }
  }, client: Socket) {
    client.data.subscribedArea = data.bounds;
    this.logger.log(`🗺️ Client ${client.id} subscribed to area: ${JSON.stringify(data.bounds)}`);
    
    return {
      event: 'area_subscription_confirmed',
      data: { 
        bounds: data.bounds, 
        status: 'subscribed',
        note: 'Area filtering handled on frontend. Backend provides incremental updates only.',
        dataWindows: {
          initial: `${this.INITIAL_DATA_AGE_HOURS}h`,
          updates: `${this.UPDATE_DATA_AGE_MINUTES}min`
        }
      }
    };
  }

  // ✅ Get current filtering strategy info
  @SubscribeMessage('get_filter_strategy')
  handleFilterStrategy(client: Socket) {
    return {
      event: 'filter_strategy',
      data: {
        strategy: 'comprehensive_initial_incremental_updates',
        initialData: {
          window: `${this.INITIAL_DATA_AGE_HOURS}h`,
          description: 'All vessels from last 24 hours for complete overview'
        },
        updates: {
          window: `${this.UPDATE_DATA_AGE_MINUTES}min`,
          description: 'Only vessels with movements in last 1 minute'
        },
        benefits: [
          'Complete vessel overview on connect',
          'Minimal network usage for updates',
          'Real-time movement tracking',
          'No missing vessels'
        ],
        cutoffTimes: {
          initial: new Date(Date.now() - this.INITIAL_DATA_AGE_MS).toISOString(),
          updates: new Date(Date.now() - this.UPDATE_DATA_AGE_MS).toISOString()
        }
      }
    };
  }

  /**
   * 📈 Get connection stats with dual strategy info
   */
  getConnectionStats() {
    return {
      connectedClients: this.connectedClients.size,
      timestamp: new Date(),
      dataStrategy: {
        type: 'dual_time_windows',
        initialData: {
          window: `${this.INITIAL_DATA_AGE_HOURS}h`,
          cutoffTime: new Date(Date.now() - this.INITIAL_DATA_AGE_MS),
          description: 'All vessels for complete overview'
        },
        updates: {
          window: `${this.UPDATE_DATA_AGE_MINUTES}min`,
          cutoffTime: new Date(Date.now() - this.UPDATE_DATA_AGE_MS),
          description: 'Only recent movements for real-time'
        }
      }
    };
  }

  // ✅ Manual broadcast info about strategy
  public broadcastStrategyInfo() {
    const strategyInfo = {
      type: 'strategy_info',
      timestamp: new Date(),
      strategy: {
        initialData: `${this.INITIAL_DATA_AGE_HOURS}h - All vessels`,
        updates: `${this.UPDATE_DATA_AGE_MINUTES}min - Recent movements only`
      },
      cutoffTimes: {
        initial: new Date(Date.now() - this.INITIAL_DATA_AGE_MS),
        updates: new Date(Date.now() - this.UPDATE_DATA_AGE_MS)
      },
      connectedClients: this.connectedClients.size,
      message: 'Initial data provides complete overview, updates show only recent vessel movements'
    };

    this.server.emit('strategy_info', strategyInfo);
    this.logger.log(`📊 Broadcasted strategy info to ${this.connectedClients.size} clients`);
  }
}
