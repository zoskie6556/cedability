export type ChatStatus = 'waiting' | 'active' | 'closed' | 'offline_message';

export interface ChatSession {
  id: string;
  userId: string;
  userName: string;
  status: ChatStatus;
  handledBy: string | null;
  handledByName: string | null;
  startedAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderUid: string;
  senderRole: string; // 'submitter' | 'agent' | 'admin' | 'system' ...
  text: string;
  createdAt: Date | null;
}

export interface AgentPresence {
  uid: string;
  name: string;
  isAvailable: boolean;
  maxConcurrentChats: number;
}

export interface ChatBusinessHours {
  enabled: boolean;
  open: string; // 'HH:mm'
  close: string; // 'HH:mm'
  workingDays: string[]; // 'mon'..'sun'
  timezone: string;
}

export interface ChatAvailability {
  withinBusinessHours: boolean;
  agentAvailable: boolean;
}

/** Mirrors the document the admin Settings page writes to `settings/chat`. */
export interface ChatSettings {
  isEnabled: boolean;
  openTime: string;
  closeTime: string;
  workingDays: string[];
  timezone: string;
  maxConcurrentChats: number;
  profanityEnabled: boolean;
  profanityAction: 'block' | 'mask' | 'warn_and_ban';
  profanityStrikeLimit: number;
  banDurationHours: number;
  blockedTerms: string[];
  autoReplyWaitSeconds: number;
  waitingAutoReply: string;
  offlineAutoReply: string;
}