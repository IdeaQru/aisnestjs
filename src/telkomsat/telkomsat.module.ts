// src/telkomsat/telkomsat.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { TelkomsatClientService } from './telkomsat-client.service';
import { TelkomsatCollectorService } from './telkomsat-collector.service';
import { TelkomsatController } from './telkomsat.controller';
import { AisDataModule } from '../ais-data/ais-data.module';
import { WebSocketModule } from '../websocket/websocket.module'; // ✅ Add this

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ScheduleModule.forRoot(),
    AisDataModule,
    WebSocketModule // ✅ Add this for WebSocket injection
  ],
  controllers: [TelkomsatController],
  providers: [TelkomsatClientService, TelkomsatCollectorService],
  exports: [TelkomsatClientService, TelkomsatCollectorService]
})
export class TelkomsatModule {}
