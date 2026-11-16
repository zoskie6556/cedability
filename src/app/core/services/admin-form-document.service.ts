import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Unsubscribe,
} from '@angular/fire/firestore';
import { deleteObject, getDownloadURL, ref, Storage, uploadBytesResumable } from '@angular/fire/storage';

export const FORM_CATEGORIES = ['Application form', 'Supporting document', 'Guidelines', 'Template', 'Other'] as const;

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Allowed extensions and the content type we always upload them with. */
const ALLOWED_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export interface FormDocumentRow {
  id: string;
  title: string;
  description: string;
  category: string;
  fileName: string;
  storagePath: string;
  contentType: string;
  size: number;
  version: number;
  isPublished: boolean;
  updatedAt: Date | null;
}

export interface FormDocumentInput {
  title: string;
  description: string;
  category: string;
  isPublished: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminFormDocumentService {
  private readonly firestore = inject(Firestore);
  private readonly storage = inject(Storage);
  private readonly auth = inject(Auth);

  readonly documents = signal<FormDocumentRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private unsubscribe: Unsubscribe | null = null;

  /** Real-time list of uploaded documents. Pass a DestroyRef to stop listening automatically. */
  watch(destroyRef?: DestroyRef): void {
    this.stop();
    this.loading.set(true);

    this.unsubscribe = onSnapshot(
      collection(this.firestore, 'formDocuments'),
      snap => {
        const rows = snap.docs.map(document => this.toRow(document.id, document.data()));
        rows.sort((left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0));
        this.documents.set(rows);
        this.error.set(null);
        this.loading.set(false);
      },
      error => {
        console.error('[AdminFormDocumentService] could not read formDocuments', error);
        this.error.set(`Could not read documents (${error.code}).`);
        this.loading.set(false);
      },
    );

    destroyRef?.onDestroy(() => this.stop());
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Returns a message if the file is not acceptable, otherwise null. */
  validateFile(file: File): string | null {
    const extension = this.extensionOf(file.name);
    if (!extension || !(extension in ALLOWED_TYPES)) {
      return 'Only PDF and Word files (.pdf, .doc, .docx) can be uploaded.';
    }
    if (file.size === 0) {
      return 'That file is empty.';
    }
    if (file.size > MAX_FILE_BYTES) {
      return `The file is too large. The maximum size is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`;
    }
    return null;
  }

  /** Uploads a new document: file first, then the Firestore record. Cleans up if the record fails. */
  async create(input: FormDocumentInput, file: File, onProgress?: (percent: number) => void): Promise<void> {
    this.assertValid(file);

    const docRef = doc(collection(this.firestore, 'formDocuments')); // generates the ID without writing
    const { path, contentType, safeName } = this.describe(docRef.id, file);

    await this.uploadFile(path, file, contentType, onProgress);

    try {
      await setDoc(docRef, {
        ...input,
        fileName: safeName,
        storagePath: path,
        contentType,
        size: file.size,
        version: 1,
        uploadedBy: this.auth.currentUser?.uid ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      await this.deleteFile(path); // do not leave an orphan file behind
      throw error;
    }
  }

  /** Replaces the file of an existing document and increases its version. */
  async replaceFile(row: FormDocumentRow, file: File, onProgress?: (percent: number) => void): Promise<void> {
    this.assertValid(file);

    const { path, contentType, safeName } = this.describe(row.id, file);
    await this.uploadFile(path, file, contentType, onProgress);

    try {
      await updateDoc(doc(this.firestore, 'formDocuments', row.id), {
        fileName: safeName,
        storagePath: path,
        contentType,
        size: file.size,
        version: row.version + 1,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      if (path !== row.storagePath) {
        await this.deleteFile(path);
      }
      throw error;
    }

    if (path !== row.storagePath) {
      await this.deleteFile(row.storagePath); // remove the old file once the new one is in place
    }
  }

  async updateMetadata(row: FormDocumentRow, input: FormDocumentInput): Promise<void> {
    await updateDoc(doc(this.firestore, 'formDocuments', row.id), { ...input, updatedAt: serverTimestamp() });
  }

  async setPublished(row: FormDocumentRow, isPublished: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, 'formDocuments', row.id), { isPublished, updatedAt: serverTimestamp() });
  }

  async remove(row: FormDocumentRow): Promise<void> {
    await this.deleteFile(row.storagePath);
    await deleteDoc(doc(this.firestore, 'formDocuments', row.id));
  }

  /** The download link is requested when needed, so no URL is stored in the database. */
  getDownloadUrl(row: FormDocumentRow): Promise<string> {
    return getDownloadURL(ref(this.storage, row.storagePath));
  }

  // ---- Internals ----

  private assertValid(file: File): void {
    const problem = this.validateFile(file);
    if (problem) {
      throw new Error(problem);
    }
  }

  private describe(id: string, file: File): { path: string; contentType: string; safeName: string } {
    const extension = this.extensionOf(file.name) as string;
    return {
      path: `forms/${id}/${this.safeFileName(file.name)}`,
      contentType: ALLOWED_TYPES[extension],
      safeName: this.safeFileName(file.name),
    };
  }

  private uploadFile(
    path: string,
    file: File,
    contentType: string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    const task = uploadBytesResumable(ref(this.storage, path), file, { contentType });

    return new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        snapshot => onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
        error => reject(error),
        () => resolve(),
      );
    });
  }

  private async deleteFile(path: string): Promise<void> {
    try {
      await deleteObject(ref(this.storage, path));
    } catch (error) {
      // A file that is already gone is fine; anything else is worth knowing about.
      if ((error as { code?: string }).code !== 'storage/object-not-found') {
        throw error;
      }
    }
  }

  private extensionOf(name: string): string | null {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : null;
  }

  /** Removes characters that cause trouble in storage paths and URLs. Keeps the extension. */
  private safeFileName(name: string): string {
    const extension = this.extensionOf(name) ?? '';
    const base = name.slice(0, Math.max(name.lastIndexOf('.'), 0) || name.length);
    const cleaned = base
      .normalize('NFKD')
      .replace(/[^\w\- ]+/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 100);
    return `${cleaned || 'document'}.${extension}`;
  }

  private toRow(id: string, data: DocumentData): FormDocumentRow {
    const size = Number(data['size']);
    const version = Number(data['version']);
    return {
      id,
      title: (data['title'] ?? 'Untitled document') as string,
      description: (data['description'] ?? '') as string,
      category: (data['category'] ?? 'Other') as string,
      fileName: (data['fileName'] ?? '') as string,
      storagePath: (data['storagePath'] ?? '') as string,
      contentType: (data['contentType'] ?? '') as string,
      size: Number.isFinite(size) ? size : 0,
      version: Number.isFinite(version) && version > 0 ? version : 1,
      isPublished: data['isPublished'] === true,
      updatedAt: this.toDate(data['updatedAt'] ?? data['createdAt']),
    };
  }

  private toDate(value: unknown): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    const withToDate = value as { toDate?: () => Date };
    if (typeof withToDate.toDate === 'function') {
      return withToDate.toDate();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }
}
