import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe,
} from '@angular/fire/firestore';
import { deleteObject, getDownloadURL, ref, Storage, uploadBytesResumable } from '@angular/fire/storage';

/** Firestore collection holding one metadata document per uploaded form. */
const FORMS_COLLECTION = 'forms';
/** Folder in Firebase Storage that holds the files themselves. */
const FORMS_STORAGE_FOLDER = 'forms';

export const MAX_FORM_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_FORM_SIZE_LABEL = '10 MB';
/** Value for <input type="file" accept="...">. */
export const FORM_ACCEPT_ATTRIBUTE = '.pdf,.doc,.docx';

const ALLOWED_TYPES: Record<string, { kind: AdminFormKind; mime: string }> = {
  pdf: { kind: 'PDF', mime: 'application/pdf' },
  doc: { kind: 'Word', mime: 'application/msword' },
  docx: {
    kind: 'Word',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
};

export type AdminFormKind = 'PDF' | 'Word';

export interface AdminFormDocument {
  id: string;
  title: string;
  description: string;
  fileName: string;
  kind: AdminFormKind;
  sizeLabel: string;
  storagePath: string;
  downloadUrl: string;
  uploadedBy: string;
  uploadedAt: string;
}

@Injectable({ providedIn: 'root' })
export class AdminFormsService {
  private readonly firestore = inject(Firestore);
  private readonly storage = inject(Storage);
  private readonly auth = inject(Auth, { optional: true });

  // ---- Uploaded forms (live from Firestore) ----
  readonly forms = signal<AdminFormDocument[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  // ---- Upload / delete state ----
  readonly uploading = signal(false);
  /** 0-100 while a file is uploading. */
  readonly uploadProgress = signal(0);
  readonly uploadError = signal<string | null>(null);
  /** Id of the form currently being deleted, or null. */
  readonly deletingId = signal<string | null>(null);

  private unsubscribe: Unsubscribe | null = null;

  /** Starts listening to the `forms` collection. Pass inject(DestroyRef) to stop automatically. */
  startLive(destroyRef?: DestroyRef): void {
    this.stopLive();
    this.loading.set(true);
    this.error.set(null);

    this.unsubscribe = onSnapshot(
      query(collection(this.firestore, FORMS_COLLECTION), orderBy('uploadedAt', 'desc')),
      snap => {
        this.forms.set(snap.docs.map(document => this.toForm(document.id, document.data())));
        this.error.set(null);
        this.loading.set(false);
      },
      (error: FirestoreError) => {
        console.error(`[AdminFormsService] could not read "${FORMS_COLLECTION}" (${error.code})`, error);
        this.error.set(`Could not load forms (${error.code}).`);
        this.loading.set(false);
      },
    );

    destroyRef?.onDestroy(() => this.stopLive());
  }

  stopLive(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Returns a human-readable problem with the file, or null when it can be uploaded. */
  validateFile(file: File): string | null {
    if (!this.typeOf(file.name)) {
      return 'Only PDF and Word documents (.pdf, .doc, .docx) can be uploaded.';
    }
    if (file.size === 0) {
      return 'This file is empty.';
    }
    if (file.size > MAX_FORM_SIZE_BYTES) {
      return `This file is ${this.formatSize(file.size)}. The limit is ${MAX_FORM_SIZE_LABEL}.`;
    }
    return null;
  }

  /** Uploads the file to Storage, then saves its details in Firestore. Resolves true on success. */
  async uploadForm(file: File, title: string, description: string): Promise<boolean> {
    const problem = this.validateFile(file);
    if (problem) {
      this.uploadError.set(problem);
      return false;
    }

    const type = this.typeOf(file.name)!;
    const storagePath = `${FORMS_STORAGE_FOLDER}/${Date.now()}-${this.safeFileName(file.name)}`;
    const fileRef = ref(this.storage, storagePath);

    this.uploading.set(true);
    this.uploadProgress.set(0);
    this.uploadError.set(null);

    let fileUploaded = false;
    try {
      const task = uploadBytesResumable(fileRef, file, { contentType: type.mime });
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          snapshot =>
            this.uploadProgress.set(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
          reject,
          () => resolve(),
        );
      });
      fileUploaded = true;

      const downloadUrl = await getDownloadURL(fileRef);
      await addDoc(collection(this.firestore, FORMS_COLLECTION), {
        title: title.trim() || this.stripExtension(file.name),
        description: description.trim(),
        fileName: file.name,
        kind: type.kind,
        sizeBytes: file.size,
        storagePath,
        downloadUrl,
        uploadedBy: this.auth?.currentUser?.email ?? this.auth?.currentUser?.uid ?? 'Unknown',
        uploadedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      console.error('[AdminFormsService] upload failed', error);
      this.uploadError.set(this.describeError(error, 'upload'));
      if (fileUploaded) {
        // The file reached Storage but its details were not saved: remove the orphan.
        await deleteObject(fileRef).catch(() => undefined);
      }
      return false;
    } finally {
      this.uploading.set(false);
    }
  }

  /** Deletes the file from Storage and its details from Firestore. Resolves true on success. */
  async deleteForm(form: AdminFormDocument): Promise<boolean> {
    this.deletingId.set(form.id);
    this.uploadError.set(null);

    try {
      try {
        await deleteObject(ref(this.storage, form.storagePath));
      } catch (error) {
        // A file that is already gone should not block removing its record.
        if ((error as { code?: string }).code !== 'storage/object-not-found') {
          throw error;
        }
      }
      await deleteDoc(doc(this.firestore, FORMS_COLLECTION, form.id));
      return true;
    } catch (error) {
      console.error('[AdminFormsService] delete failed', error);
      this.uploadError.set(this.describeError(error, 'delete'));
      return false;
    } finally {
      this.deletingId.set(null);
    }
  }

  // ---- Helpers ----

  private toForm(id: string, data: DocumentData): AdminFormDocument {
    return {
      id,
      title: String(data['title'] ?? data['fileName'] ?? 'Untitled form'),
      description: String(data['description'] ?? ''),
      fileName: String(data['fileName'] ?? ''),
      kind: data['kind'] === 'Word' ? 'Word' : 'PDF',
      sizeLabel: this.formatSize(Number(data['sizeBytes'] ?? 0)),
      storagePath: String(data['storagePath'] ?? ''),
      downloadUrl: String(data['downloadUrl'] ?? ''),
      uploadedBy: String(data['uploadedBy'] ?? 'Unknown'),
      uploadedAt: this.formatDate(data['uploadedAt']),
    };
  }

  private typeOf(fileName: string): { kind: AdminFormKind; mime: string } | null {
    const dot = fileName.lastIndexOf('.');
    if (dot < 0) {
      return null;
    }
    return ALLOWED_TYPES[fileName.slice(dot + 1).toLowerCase()] ?? null;
  }

  private safeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private stripExtension(fileName: string): string {
    const dot = fileName.lastIndexOf('.');
    return dot > 0 ? fileName.slice(0, dot) : fileName;
  }

  private formatSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '—';
    }
    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** `uploadedAt` is null for a moment after saving, until the server confirms the timestamp. */
  private formatDate(value: unknown): string {
    const withToDate = value as { toDate?: () => Date } | null;
    if (!withToDate || typeof withToDate.toDate !== 'function') {
      return 'Just now';
    }
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
      withToDate.toDate(),
    );
  }

  private describeError(error: unknown, action: 'upload' | 'delete'): string {
    const code = (error as { code?: string } | null)?.code ?? '';
    switch (code) {
      case 'storage/unauthorized':
      case 'permission-denied':
        return `You do not have permission to ${action} forms.`;
      case 'storage/canceled':
        return 'The upload was cancelled.';
      case 'storage/quota-exceeded':
        return 'The storage quota has been reached.';
      case 'storage/retry-limit-exceeded':
        return 'The connection timed out. Check your network and try again.';
      default:
        return `Could not ${action} the form${code ? ` (${code})` : ''}.`;
    }
  }
}
