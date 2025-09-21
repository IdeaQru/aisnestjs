// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AisDataModule } from './ais-data/ais-data.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { TelkomsatModule } from './telkomsat/telkomsat.module';
import { WebSocketModule } from './websocket/websocket.module'; // ✅ Add this

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/ais_logger', 
      {
        retryWrites: true,
        retryAttempts: 3,
        bufferCommands: false,
      }
    ),
    AisDataModule,
    SchedulerModule,
    TelkomsatModule,
    WebSocketModule // ✅ Add this
  ],
})
export class AppModule {}
