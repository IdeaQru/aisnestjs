// src/ais-data/ais-data.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AisDataService } from './ais-data.service';
import { AisDataController } from './ais-data.controller';
import { CurrentVessel, CurrentVesselSchema } from './schemas/current-vessel.schema';
import { VesselLog, VesselLogSchema } from './schemas/vessel-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CurrentVessel.name, schema: CurrentVesselSchema },
      { name: VesselLog.name, schema: VesselLogSchema }
    ])
  ],
  controllers: [AisDataController],
  providers: [AisDataService], // ✅ Hanya AisDataService
  exports: [AisDataService]
})
export class AisDataModule {}
