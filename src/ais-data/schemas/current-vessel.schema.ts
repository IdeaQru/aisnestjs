// src/ais-data/schemas/current-vessel.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CurrentVesselDocument = CurrentVessel & Document;

@Schema({ 
  timestamps: true,
  collection: 'current_vessels'
})
export class CurrentVessel {
  @Prop({ required: true, unique: true }) // ✅ HAPUS index: true untuk menghindari duplicate
  mmsi: number;

  @Prop({ required: true })
  latitude: number;

  @Prop({ required: true })
  longitude: number;

  @Prop({ required: true })
  course: number;

  @Prop({ required: true })
  speed: number;

  @Prop()
  heading?: number;

  @Prop()
  name?: string;

  @Prop()
  callSign?: string;

  @Prop({ required: true })
  vesselType: number;

  @Prop({ required: true })
  navStatus: number;

  @Prop()
  destination?: string;

  @Prop()
  eta?: string;

  @Prop({ required: true })
  timestamp: Date;

  @Prop()
  length?: number;

  @Prop()
  width?: number;

  @Prop({ required: true, default: 'telkomsat' })
  source: string;

  @Prop()
  data_time?: string;

  @Prop()
  data_date?: string;

  @Prop({ required: true, default: Date.now })
  lastUpdated: Date;

  @Prop({ required: true, default: 0 })
  updateCount: number;
}

export const CurrentVesselSchema = SchemaFactory.createForClass(CurrentVessel);

// ✅ Hanya buat index yang diperlukan tanpa duplikasi
CurrentVesselSchema.index({ timestamp: -1 });
CurrentVesselSchema.index({ lastUpdated: -1 });
CurrentVesselSchema.index({ 
  latitude: 1, 
  longitude: 1 
}, { 
  name: 'geo_location_index' 
});
