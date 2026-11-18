import { inject, Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Timestamp } from 'firebase/firestore';
import type {
  AcceptedCollaborator,
  CollaborationOverview,
  CollaborationProfile,
  CollaborationRequest,
  CollaborationRequestStatus,
  CollaborationRequestView,
} from '../../shared/models/collaboration.model';
import type { User } from '../../shared/models/user.model';

const DIRECTORY_COLLECTION = 'collaborationProfiles';
const PAIRS_COLLECTION = 'collaborationPairs';
const SEARCH_RESULT_LIMIT = 12;

@Injectable({ providedIn: 'root' })
export class CollaborationService {
  private readonly firestore = inject(Firestore);

  async getOverview(uid: string): Promise<CollaborationOverview> {
    const pairCollection = collection(this.firestore, PAIRS_COLLECTION);
    const [ownProfileSnapshot, pendingSnapshot, acceptedSnapshot] = await Promise.all([
      getDoc(doc(this.firestore, DIRECTORY_COLLECTION, uid)),
      getDocs(
        query(
          pairCollection,
          where('participants', 'array-contains', uid),
          where('status', '==', 'pending'),
        ),
      ),
      getDocs(
        query(
          pairCollection,
          where('participants', 'array-contains', uid),
          where('status', '==', 'accepted'),
        ),
      ),
    ]);

    const pending = pendingSnapshot.docs.map((snapshot) =>
      parseCollaborationRequest(snapshot.id, snapshot.data()),
    );
    const acceptedRequests = acceptedSnapshot.docs.map((snapshot) =>
      parseCollaborationRequest(snapshot.id, snapshot.data()),
    );
    const incomingRequests = pending.filter((request) => request.recipientUid === uid);
    const outgoingRequests = pending.filter((request) => request.senderUid === uid);
    const relatedUids = [
      ...new Set([
        ...pending.map((request) =>
          request.senderUid === uid ? request.recipientUid : request.senderUid,
        ),
        ...acceptedRequests.map((request) =>
          request.senderUid === uid ? request.recipientUid : request.senderUid,
        ),
      ]),
    ];
    const relatedProfiles = await Promise.all(
      relatedUids.map((relatedUid) => this.getPublicProfile(relatedUid)),
    );
    const profileByUid = new Map(
      relatedUids.map((relatedUid, index) => [relatedUid, relatedProfiles[index]]),
    );
    const collaboratorUids = acceptedRequests.map((request) =>
      request.senderUid === uid ? request.recipientUid : request.senderUid,
    );
    const collaborators: AcceptedCollaborator[] = acceptedRequests
      .map((request, index) => ({
        uid: collaboratorUids[index],
        profile: profileByUid.get(collaboratorUids[index]) ?? null,
        acceptedAt: request.respondedAt,
      }))
      .sort(
        (left, right) => (right.acceptedAt?.toMillis() ?? 0) - (left.acceptedAt?.toMillis() ?? 0),
      );

    return {
      ownProfile: ownProfileSnapshot.exists()
        ? parseCollaborationProfile(ownProfileSnapshot.id, ownProfileSnapshot.data())
        : null,
      incomingRequests: this.toRequestViews(incomingRequests, uid, profileByUid),
      outgoingRequests: this.toRequestViews(outgoingRequests, uid, profileByUid),
      collaborators,
    };
  }

  async searchDirectory(uid: string, searchTerm: string): Promise<CollaborationProfile[]> {
    const prefix = searchTerm.trim().toLowerCase();
    if (!prefix) {
      return [];
    }
    if (prefix.length > 80) {
      throw new Error('Search terms must be 80 characters or fewer.');
    }

    const directory = collection(this.firestore, DIRECTORY_COLLECTION);

    // Simplified queries targeting only the collection and the search range field.
    // This avoids complex Firestore composite index errors.
    const searchField = (field: 'displayNameSearch' | 'professionSearch') =>
      query(
        directory,
        where(field, '>=', prefix),
        where(field, '<=', `${prefix}\uf8ff`),
        limit(SEARCH_RESULT_LIMIT),
      );

    const [byName, byProfession] = await Promise.all([
      getDocs(searchField('displayNameSearch')),
      getDocs(searchField('professionSearch')),
    ]);

    const profiles = new Map<string, CollaborationProfile>();

    for (const snapshot of [...byName.docs, ...byProfession.docs]) {
      // Exclude the current user
      if (snapshot.id !== uid) {
        try {
          const profile = parseCollaborationProfile(snapshot.id, snapshot.data());
          
          // Ensure they are discoverable in-memory
          const data = snapshot.data();
          if (data['discoverable'] === true) {
            profiles.set(profile.uid, profile);
          }
        } catch (e) {
          console.warn(`Skipping invalid profile ${snapshot.id}:`, e);
        }
      }
    } 

    return [...profiles.values()].sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );
  }

  async setDiscoverable(uid: string, user: User, discoverable: boolean): Promise<void> {
    const profileRef = doc(this.firestore, DIRECTORY_COLLECTION, uid);
    if (!discoverable) {
      await deleteDoc(profileRef);
      return;
    }

    const profile = makeDirectoryProfile(uid, user);
    await runTransaction(this.firestore, async (transaction) => {
      const current = await transaction.get(profileRef);
      transaction.set(profileRef, {
        ...profile,
        discoverable: true,
        createdAt: current.exists() ? current.data()['createdAt'] : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  }

  async syncDiscoverableProfile(uid: string, user: User): Promise<void> {
    const profileRef = doc(this.firestore, DIRECTORY_COLLECTION, uid);
    await runTransaction(this.firestore, async (transaction) => {
      const current = await transaction.get(profileRef);
      if (!current.exists() || current.data()['discoverable'] !== true) {
        return;
      }

      const profile = makeDirectoryProfile(uid, user);
      const data = current.data();
      if (
        data['displayName'] === profile.displayName &&
        data['profession'] === profile.profession
      ) {
        return;
      }

      transaction.update(profileRef, {
        displayName: profile.displayName,
        profession: profile.profession,
        displayNameSearch: profile.displayNameSearch,
        professionSearch: profile.professionSearch,
        updatedAt: serverTimestamp(),
      });
    });
  }

  async sendRequest(senderUid: string, recipientUid: string): Promise<void> {
    if (senderUid === recipientUid) {
      throw new Error('You cannot send a collaboration request to yourself.');
    }

    const participants = sortParticipants(senderUid, recipientUid);
    const pairRef = doc(this.firestore, PAIRS_COLLECTION, pairDocumentId(participants));
    await runTransaction(this.firestore, async (transaction) => {
      const current = await transaction.get(pairRef);
      if (!current.exists()) {
        transaction.set(pairRef, {
          participants,
          senderUid,
          recipientUid,
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          respondedAt: null,
        });
        return;
      }

      const existing = parseCollaborationRequest(pairRef.id, current.data());
      if (existing.status === 'accepted') {
        throw new Error('You are already collaborators.');
      }
      if (existing.status === 'pending') {
        throw new Error('A collaboration request is already pending.');
      }

      transaction.update(pairRef, {
        senderUid,
        recipientUid,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        respondedAt: null,
      });
    });
  }

  async respondToRequest(
    request: CollaborationRequest,
    status: 'accepted' | 'declined',
  ): Promise<void> {
    await updateDoc(doc(this.firestore, PAIRS_COLLECTION, request.id), {
      status,
      updatedAt: serverTimestamp(),
      respondedAt: serverTimestamp(),
    });
  }

  async cancelRequest(requestId: string): Promise<void> {
    await updateDoc(doc(this.firestore, PAIRS_COLLECTION, requestId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
      respondedAt: serverTimestamp(),
    });
  }

  private toRequestViews(
    requests: CollaborationRequest[],
    uid: string,
    profileByUid: Map<string, CollaborationProfile | null>,
  ): CollaborationRequestView[] {
    return requests.sort(compareRequestsNewestFirst).map((request) => {
      const otherUid = request.senderUid === uid ? request.recipientUid : request.senderUid;
      return {
        request,
        profile: profileByUid.get(otherUid) ?? null,
      };
    });
  }

  private async getPublicProfile(uid: string): Promise<CollaborationProfile | null> {
    const snapshot = await getDoc(doc(this.firestore, DIRECTORY_COLLECTION, uid));
    return snapshot.exists() ? parseCollaborationProfile(snapshot.id, snapshot.data()) : null;
  }
}

function makeDirectoryProfile(uid: string, user: User): CollaborationProfile {
  const displayName = user.fullName.trim();
  const profession = user.profile.profession.trim();
  if (!displayName || displayName.length > 120 || !profession || profession.length > 200) {
    throw new Error(
      'Add a valid name and profession to your profile before becoming discoverable.',
    );
  }

  return {
    uid,
    displayName,
    profession,
    displayNameSearch: displayName.toLowerCase(),
    professionSearch: profession.toLowerCase(),
  };
}

function parseCollaborationProfile(uid: string, value: unknown): CollaborationProfile {
  const data = requireRecord(value, 'collaboration profile');
  const profile: CollaborationProfile = {
    uid: requireString(data['uid'], 'uid'),
    displayName: requireString(data['displayName'], 'displayName'),
    profession: requireString(data['profession'], 'profession'),
    displayNameSearch: requireString(data['displayNameSearch'], 'displayNameSearch'),
    professionSearch: requireString(data['professionSearch'], 'professionSearch'),
  };
  if (
    profile.uid !== uid ||
    data['discoverable'] !== true ||
    profile.displayNameSearch !== profile.displayName.trim().toLowerCase() ||
    profile.professionSearch !== profile.profession.trim().toLowerCase()
  ) {
    throw new Error('The Firestore collaboration profile is invalid.');
  }

  return profile;
}

function parseCollaborationRequest(id: string, value: unknown): CollaborationRequest {
  const data = requireRecord(value, 'collaboration request');
  const rawParticipants = data['participants'];
  if (
    !Array.isArray(rawParticipants) ||
    rawParticipants.length !== 2 ||
    typeof rawParticipants[0] !== 'string' ||
    typeof rawParticipants[1] !== 'string'
  ) {
    throw new Error('The Firestore collaboration request participants are invalid.');
  }

  const participants: [string, string] = [rawParticipants[0], rawParticipants[1]];
  const request: CollaborationRequest = {
    id,
    participants,
    senderUid: requireString(data['senderUid'], 'senderUid'),
    recipientUid: requireString(data['recipientUid'], 'recipientUid'),
    status: requireRequestStatus(data['status']),
    createdAt: requireTimestampOrNull(data['createdAt'], 'createdAt'),
    updatedAt: requireTimestampOrNull(data['updatedAt'], 'updatedAt'),
    respondedAt: requireTimestampOrNull(data['respondedAt'], 'respondedAt'),
  };

  if (
    participants[0] >= participants[1] ||
    id !== pairDocumentId(participants) ||
    request.senderUid === request.recipientUid ||
    !participants.includes(request.senderUid) ||
    !participants.includes(request.recipientUid)
  ) {
    throw new Error('The Firestore collaboration request is invalid.');
  }

  return request;
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`The Firestore ${fieldName} data is not a valid object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`The Firestore ${fieldName} value is not a string.`);
  }
  return value;
}

function requireRequestStatus(value: unknown): CollaborationRequestStatus {
  if (
    value === 'pending' ||
    value === 'accepted' ||
    value === 'declined' ||
    value === 'cancelled'
  ) {
    return value;
  }
  throw new Error('The Firestore collaboration request status is invalid.');
}

function requireTimestampOrNull(value: unknown, fieldName: string): Timestamp | null {
  if (value === null || value instanceof Timestamp) {
    return value;
  }
  throw new Error(`The Firestore ${fieldName} value is not a timestamp.`);
}

function sortParticipants(firstUid: string, secondUid: string): [string, string] {
  return firstUid < secondUid ? [firstUid, secondUid] : [secondUid, firstUid];
}

function pairDocumentId(participants: [string, string]): string {
  return `${participants[0]}~${participants[1]}`;
}

function compareRequestsNewestFirst(
  left: CollaborationRequest,
  right: CollaborationRequest,
): number {
  return (right.createdAt?.toMillis() ?? 0) - (left.createdAt?.toMillis() ?? 0);
}
