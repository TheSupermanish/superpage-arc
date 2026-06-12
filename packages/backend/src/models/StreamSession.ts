import mongoose, { Schema, Document } from 'mongoose';

export type StreamSessionStatus = 'open' | 'settling' | 'settled' | 'expired';

/**
 * One pay-per-second viewing session backed by an on-chain StreamPay channel.
 * The latest voucher (lastAmountWei + lastSig) is everything the backend
 * needs to settle the channel when the viewer stops watching.
 */
export interface IStreamSession extends Document {
  sessionId: string; // on-chain StreamPay session id
  resourceId: mongoose.Types.ObjectId;
  viewerAddress: string;
  sessionKey: string;
  ratePerSecondWei: string;
  depositWei: string;
  lastAmountWei: string;
  lastSig: string;
  secondsWatched: number;
  lastHeartbeatAt: Date;
  status: StreamSessionStatus;
  txHashClose?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StreamSessionSchema = new Schema<IStreamSession>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Resource',
    },
    viewerAddress: {
      type: String,
      required: true,
      lowercase: true,
    },
    sessionKey: {
      type: String,
      required: true,
      lowercase: true,
    },
    ratePerSecondWei: {
      type: String,
      required: true,
    },
    depositWei: {
      type: String,
      required: true,
    },
    lastAmountWei: {
      type: String,
      default: '0',
    },
    lastSig: {
      type: String,
      default: '',
    },
    secondsWatched: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastHeartbeatAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['open', 'settling', 'settled', 'expired'],
      default: 'open',
      index: true,
    },
    txHashClose: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// sessionId is already indexed via unique: true
StreamSessionSchema.index({ status: 1, lastHeartbeatAt: 1 });
StreamSessionSchema.index({ resourceId: 1 });
StreamSessionSchema.index({ viewerAddress: 1 });

export const StreamSession = mongoose.model<IStreamSession>('StreamSession', StreamSessionSchema);
