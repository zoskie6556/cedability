export type SenderRole = 'guest' | 'user' | 'agent' | 'system';
export type DeliveryStatus = 'queued' | 'sent' | 'failed';

export interface ChatMessage {
  id: string;
  content: string;
  senderRole: SenderRole;
  timestamp: number;
  status: DeliveryStatus;
  isOfflineDraft?: boolean;
}

export interface ChatSessionContext {
  isAuthenticated: boolean;
  guestId: string;
  userId?: string;
}

export interface ChatRoomRecord {
  id: string;
  ownerId: string;
  displayName?: string;
  status: 'open' | 'closed';
  createdAt: number;
  updatedAt: number;
}

export interface BusinessHoursConfig {
  timezone: string;
  startHour: number;
  endHour: number;
  workingDays: number[];
}

export interface AvailabilityStatus {
  isAvailable: boolean;
  reason?: string;
}