import type { Timestamp } from 'firebase/firestore';

export interface CollaborationProfile {
  uid: string;
  displayName: string;
  profession: string;
  displayNameSearch: string;
  professionSearch: string;
}

export type CollaborationRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface CollaborationRequest {
  id: string;
  participants: [string, string];
  senderUid: string;
  recipientUid: string;
  status: CollaborationRequestStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  respondedAt: Timestamp | null;
}

export interface CollaborationRequestView {
  request: CollaborationRequest;
  profile: CollaborationProfile | null;
}

export interface AcceptedCollaborator {
  uid: string;
  profile: CollaborationProfile | null;
  acceptedAt: Timestamp | null;
}

export interface CollaborationOverview {
  ownProfile: CollaborationProfile | null;
  incomingRequests: CollaborationRequestView[];
  outgoingRequests: CollaborationRequestView[];
  collaborators: AcceptedCollaborator[];
}
