// src/scheduler/scheduler.module.ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DataArchiverService } from './data-archiver.service';
import { AisDataModule } from '../ais-data/ais-data.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AisDataModule
  ],
  providers: [DataArchiverService],
  exports: [DataArchiverService]
})
export class SchedulerModule {} // ✅ PASTIKAN ada export ini
