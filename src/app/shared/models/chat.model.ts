export type ChatStatus = 'waiting' | 'active' | 'closed' | 'offline_message';

export interface ChatSession {
  id: string;
  userId: string;
  userName: string;
  status: ChatStatus;
  handledBy: string | null;
  handledByName: string | null;
  startedAt: Date | null;
  closedAt: Date | null;
  lastMessageAt: Date | null;
  firstResponseAt: Date | null;
}

export interface ChatMessage {
  id: string;
  senderUid: string;
  senderRole: string;
  text: string;
  createdAt: Date | null;
}

/** `settings/chat`: when live chat is offered. `days` uses ISO weekday numbers (1 = Monday ... 7 = Sunday). */
export interface ChatBusinessHours {
  timezone: string;
  days: number[];
  open: string;
  close: string;
  holidays: string[];
}

/** `agentPresence/{uid}`: an agent's self-reported availability for live chat. */
export interface AgentPresence {
  uid: string;
  displayName: string;
  isAvailable: boolean;
  activeChatCount: number;
  maxConcurrentChats: number;
  updatedAt: Date | null;
}

export interface ChatAvailability {
  withinBusinessHours: boolean;
  agentAvailable: boolean;
}

export interface ChatAnalyticsSummary {
  totalChats: number;
  byStatus: Record<ChatStatus, number>;
  resolutionRate: number;
  avgFirstResponseSeconds: number | null;
  chatsPerDay: Record<string, number>;
  chatsByHour: number[];
}
