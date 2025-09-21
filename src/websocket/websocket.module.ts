// src/websocket/websocket.module.ts
import { Module } from '@nestjs/common';
import { VesselTrackingGateway } from './vessel-tracking.gateway';
import { AisDataModule } from '../ais-data/ais-data.module';

@Module({
  imports: [AisDataModule],
  providers: [VesselTrackingGateway],
  exports: [VesselTrackingGateway]
})
export class WebSocketModule {}
