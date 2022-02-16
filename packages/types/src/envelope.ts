import { Event } from './event';
import { SentryRequestType } from './request';
import { SdkInfo } from './sdkinfo';
import { Session, SessionAggregates } from './session';
import { Outcome } from './transport';
import { User } from './user';

// Based on: https://develop.sentry.dev/sdk/envelopes/

type CommonEnvelopeHeaders = {
  dsn?: string;
  sdk?: SdkInfo;
};

type CommonEnvelopeItemHeaders = {
  length?: number;
};

/**
 * 1st Item: Item headers
 * 2nd Item: Item payload
 */
type BaseEnvelopeItem<ItemHeader extends { type: string }, Payload = unknown> = [
  CommonEnvelopeItemHeaders & ItemHeader,
  Payload,
];

/**
 * 1st Item: Envelope headers
 * 2nd Item: Envelope items {@see BaseEnvelopeItem}
 */
export type BaseEnvelope<
  EnvelopeHeaders extends Record<string, unknown>,
  EnvelopeItem extends BaseEnvelopeItem<{ type: string }>,
> = [CommonEnvelopeHeaders & EnvelopeHeaders & Record<string, unknown>, EnvelopeItem[]];

export type EventEnvelopeItem = BaseEnvelopeItem<{ type: 'event' | 'transaction' }, Event>;

type AttachmentEnvelopeItem = BaseEnvelopeItem<{ type: 'attachment'; filename: 'string' }>;

type UserFeedbackEnvelopeItem = BaseEnvelopeItem<
  { type: 'user_report' },
  {
    event_id: string;
    email: User['email'];
    name: string;
    comments: string;
  }
>;

export type EventEnvelope = BaseEnvelope<
  { event_id: string; sent_at: string },
  EventEnvelopeItem | AttachmentEnvelopeItem | UserFeedbackEnvelopeItem
>;

export type SessionEnvelopeItem =
  | BaseEnvelopeItem<{ type: 'session' }, Session>
  | BaseEnvelopeItem<{ type: 'sessions' }, SessionAggregates>;

export type SessionEnvelope = BaseEnvelope<{ sent_at: string }, SessionEnvelopeItem>;

export type ClientReportEnvelopeItemHeader = { type: 'client_report' };
export type ClientReportEnvelopeItemPayload = {
  timestamp: number;
  discarded_events: Array<{ reason: Outcome; category: SentryRequestType; quantity: number }>;
};

export type ClientReportEnvelopeItem = BaseEnvelopeItem<
  ClientReportEnvelopeItemHeader,
  ClientReportEnvelopeItemPayload
>;

export type ClientReportEnvelope = BaseEnvelope<Record<string, unknown>, ClientReportEnvelopeItem>;

export type Envelope = EventEnvelope | SessionEnvelope | ClientReportEnvelope;
