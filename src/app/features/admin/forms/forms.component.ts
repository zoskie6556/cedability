import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';

import {
  AdminFormDocumentService,
  FORM_CATEGORIES,
  FormDocumentRow,
  MAX_FILE_BYTES,
} from '../../../core/services/admin-form-document.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-admin-forms',
  imports: [ReactiveFormsModule, IdeaLoaderComponent],
  templateUrl: './forms.component.html',
  styleUrl: './forms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormsComponent implements OnInit {
  private readonly service = inject(AdminFormDocumentService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly categories = FORM_CATEGORIES;
  readonly maxMb = MAX_FILE_BYTES / (1024 * 1024);

  readonly documents = this.service.documents;
  readonly loading = this.service.loading;
  readonly error = this.service.error;

  readonly activeView = signal<'available' | 'upload'>('available');
  readonly selectedFile = signal<File | null>(null);
  readonly editing = signal<FormDocumentRow | null>(null);
  readonly dragging = signal(false);
  readonly saving = signal(false);

  /** Which document is currently being replaced or uploaded, and how far along it is. */
  readonly busyId = signal<string | null>(null);
  readonly progress = signal(0);

  readonly search = signal('');
  readonly visibleDocuments = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.documents().filter(
      row =>
        !query ||
        row.title.toLowerCase().includes(query) ||
        row.category.toLowerCase().includes(query) ||
        row.fileName.toLowerCase().includes(query),
    );
  });

  private replaceTarget: FormDocumentRow | null = null;

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', Validators.maxLength(500)],
    category: [FORM_CATEGORIES[0] as string, Validators.required],
    isPublished: [true],
  });

  ngOnInit(): void {
    this.service.watch(this.destroyRef);
  }

  // ------------------------------------------------------------------ View switching

  setView(view: 'available' | 'upload'): void {
    this.activeView.set(view);
  }

  editAndOpenForm(row: FormDocumentRow): void {
    this.edit(row);
    this.activeView.set('upload');
  }

  // ------------------------------------------------------------------ Choosing a file

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.acceptFile(input?.files?.[0] ?? null);
    if (input) {
      input.value = ''; // lets the same file be chosen again later
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.acceptFile(event.dataTransfer?.files?.[0] ?? null);
  }

  clearFile(): void {
    this.selectedFile.set(null);
  }

  // ------------------------------------------------------------------ Save (upload or edit)

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Please complete the title and category.');
      return;
    }

    const raw = this.form.getRawValue();
    const input = {
      title: raw.title.trim(),
      description: raw.description.trim(),
      category: raw.category,
      isPublished: raw.isPublished,
    };

    const editing = this.editing();
    if (!editing && !this.selectedFile()) {
      this.toast.error('Choose a PDF or Word file to upload.');
      return;
    }

    this.saving.set(true);
    this.progress.set(0);
    try {
      if (editing) {
        await this.service.updateMetadata(editing, input);
        this.toast.success('Document details updated.');
      } else {
        await this.service.create(input, this.selectedFile() as File, percent => this.progress.set(percent));
        this.toast.success(input.isPublished ? 'Document uploaded and published.' : 'Document uploaded as a draft.');
      }
      this.resetForm();
      this.activeView.set('available');
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to save the document.'));
    } finally {
      this.saving.set(false);
    }
  }

  edit(row: FormDocumentRow): void {
    this.editing.set(row);
    this.selectedFile.set(null);
    this.form.reset({
      title: row.title,
      description: row.description,
      category: row.category,
      isPublished: row.isPublished,
    });
  }

  cancelEdit(): void {
    this.resetForm();
    this.activeView.set('available');
  }

  // ------------------------------------------------------------------ Row actions

  async download(row: FormDocumentRow): Promise<void> {
    // The tab is opened immediately (a direct click), because browsers block pop-ups opened after a delay.
    const tab = window.open('', '_blank');
    try {
      const url = await this.service.getDownloadUrl(row);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (error) {
      tab?.close();
      this.toast.error(this.messageFrom(error, 'Unable to open the file.'));
    }
  }

  startReplace(row: FormDocumentRow, picker: HTMLInputElement): void {
    this.replaceTarget = row;
    picker.click();
  }

  async onReplaceSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    const target = this.replaceTarget;
    if (input) {
      input.value = '';
    }
    this.replaceTarget = null;

    if (!file || !target) {
      return;
    }

    const problem = this.service.validateFile(file);
    if (problem) {
      this.toast.error(problem);
      return;
    }

    this.busyId.set(target.id);
    this.progress.set(0);
    try {
      await this.service.replaceFile(target, file, percent => this.progress.set(percent));
      this.toast.success(`File replaced. "${target.title}" is now version ${target.version + 1}.`);
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to replace the file.'));
    } finally {
      this.busyId.set(null);
    }
  }

  async togglePublished(row: FormDocumentRow): Promise<void> {
    try {
      await this.service.setPublished(row, !row.isPublished);
      this.toast.success(row.isPublished ? 'Document moved to drafts.' : 'Document published.');
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to change the publish state.'));
    }
  }

  async remove(row: FormDocumentRow): Promise<void> {
    if (!confirm(`Delete "${row.title}" and its file? This cannot be undone.`)) {
      return;
    }
    try {
      await this.service.remove(row);
      if (this.editing()?.id === row.id) {
        this.resetForm();
      }
      this.toast.success('Document deleted.');
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to delete the document.'));
    }
  }

  // ------------------------------------------------------------------ Template helpers

  typeLabel(row: FormDocumentRow): string {
    return row.contentType === 'application/pdf' ? 'PDF' : 'Word';
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  formatDate(date: Date | null): string {
    return date ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—';
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement | null)?.value ?? '');
  }

  // ------------------------------------------------------------------ Internals

  private acceptFile(file: File | null): void {
    if (!file) {
      return;
    }

    const problem = this.service.validateFile(file);
    if (problem) {
      this.toast.error(problem);
      return;
    }

    this.selectedFile.set(file);
    this.editing.set(null);

    // Suggest a title from the file name if none has been typed yet.
    if (!this.form.controls.title.value.trim()) {
      const suggestion = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      this.form.controls.title.setValue(suggestion.slice(0, 150));
    }
  }

  private resetForm(): void {
    this.editing.set(null);
    this.selectedFile.set(null);
    this.progress.set(0);
    this.form.reset({ title: '', description: '', category: FORM_CATEGORIES[0], isPublished: true });
  }

  private messageFrom(error: unknown, fallback: string): string {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'storage/unauthorized' || code === 'permission-denied') {
      return 'You do not have permission to do that. Check the Storage and Firestore rules and that your account is an admin.';
    }
    if (code === 'storage/quota-exceeded') {
      return 'The storage quota has been reached.';
    }
    if (code === 'storage/retry-limit-exceeded') {
      return 'The upload took too long. Check your connection and try again.';
    }
    return error instanceof Error && error.message ? error.message : fallback;
  }
}