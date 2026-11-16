import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import { AdminContentService, AnnouncementRow, FaqRow } from '../../../core/services/admin-content.service';
import { ToastService } from '../../../core/services/toast.service';

type ContentTab = 'announcements' | 'faqs';

const TITLE_MAX = 150;
const BODY_MAX = 5000;
const QUESTION_MAX = 300;
const ANSWER_MAX = 3000;

@Component({
  selector: 'app-admin-content',
  imports: [ReactiveFormsModule, IdeaLoaderComponent],
  templateUrl: './content.component.html',
  styleUrl: './content.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentComponent implements OnInit {
  private readonly service = inject(AdminContentService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly titleMax = TITLE_MAX;
  readonly bodyMax = BODY_MAX;
  readonly questionMax = QUESTION_MAX;
  readonly answerMax = ANSWER_MAX;

  readonly announcements = this.service.announcements;
  readonly faqs = this.service.faqs;
  readonly loading = this.service.loading;
  readonly error = this.service.error;

  readonly activeTab = signal<ContentTab>('announcements');
  readonly saving = signal(false);
  readonly editingAnnouncement = signal<AnnouncementRow | null>(null);
  readonly editingFaq = signal<FaqRow | null>(null);

  readonly announcementForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(TITLE_MAX)]],
    body: ['', [Validators.required, Validators.maxLength(BODY_MAX)]],
    isPublished: [false],
  });

  readonly faqForm = this.fb.nonNullable.group({
    question: ['', [Validators.required, Validators.maxLength(QUESTION_MAX)]],
    answer: ['', [Validators.required, Validators.maxLength(ANSWER_MAX)]],
    category: ['General', Validators.required],
    order: [0],
    isPublished: [true],
    contactAuthority: [''],
    contactEmail: ['', Validators.email],
    contactPhone: ['', Validators.pattern(/^(?:\+[1-9]\d{1,14})?$/)],
  });

  ngOnInit(): void {
    this.service.watch(this.destroyRef);
  }

  selectTab(tab: ContentTab): void {
    this.activeTab.set(tab);
  }

  // ---------------------------------------------------------------- Announcements

  /**
   * Paste handling for the message box.
   * If both fields are empty and the pasted text has several lines, the first line becomes
   * the title and the rest becomes the message. In every other case the browser pastes normally.
   */
  onAnnouncementPaste(event: ClipboardEvent): void {
    const pasted = event.clipboardData?.getData('text/plain') ?? '';
    if (!pasted) {
      return;
    }

    const { title, body } = this.announcementForm.controls;
    if (title.value.trim() || body.value.trim()) {
      return;
    }

    const split = this.splitPasted(pasted);
    if (!split) {
      return;
    }

    event.preventDefault();
    this.announcementForm.patchValue({ title: split.title, body: split.body });
    this.announcementForm.markAsDirty();
  }

  /** "Paste from clipboard" button, with a clear message if the browser blocks it. */
  async pasteFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        this.toast.error('The clipboard is empty.');
        return;
      }

      const { title, body } = this.announcementForm.controls;
      const split = !title.value.trim() && !body.value.trim() ? this.splitPasted(text) : null;

      if (split) {
        this.announcementForm.patchValue({ title: split.title, body: split.body });
      } else {
        const joined = body.value ? `${body.value}\n\n${text}` : text;
        body.setValue(this.clean(joined).slice(0, BODY_MAX));
      }
      this.announcementForm.markAsDirty();
      this.cdr.markForCheck();
    } catch {
      this.toast.error('The browser blocked clipboard access. Click in the message box and press Ctrl+V instead.');
    }
  }

  async saveAnnouncement(): Promise<void> {
    if (this.announcementForm.invalid) {
      this.announcementForm.markAllAsTouched();
      this.toast.error('Please complete the title and message.');
      return;
    }

    const raw = this.announcementForm.getRawValue();
    const input = {
      title: this.clean(raw.title).slice(0, TITLE_MAX),
      body: this.clean(raw.body).slice(0, BODY_MAX),
      isPublished: raw.isPublished,
    };
    if (!input.title || !input.body) {
      this.toast.error('The title and message cannot be empty.');
      return;
    }

    this.saving.set(true);
    try {
      const editing = this.editingAnnouncement();
      if (editing) {
        await this.service.updateAnnouncement(editing, input);
        this.toast.success('Announcement updated.');
      } else {
        await this.service.createAnnouncement(input);
        this.toast.success(input.isPublished ? 'Announcement published.' : 'Draft saved.');
      }
      this.resetAnnouncementForm();
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to save the announcement.'));
    } finally {
      this.saving.set(false);
    }
  }

  editAnnouncement(row: AnnouncementRow): void {
    this.editingAnnouncement.set(row);
    this.announcementForm.reset({ title: row.title, body: row.body, isPublished: row.isPublished });
  }

  cancelAnnouncementEdit(): void {
    this.resetAnnouncementForm();
  }

  async toggleAnnouncement(row: AnnouncementRow): Promise<void> {
    try {
      await this.service.setAnnouncementPublished(row, !row.isPublished);
      this.toast.success(row.isPublished ? 'Announcement moved to drafts.' : 'Announcement published.');
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to change the publish state.'));
    }
  }

  async deleteAnnouncement(row: AnnouncementRow): Promise<void> {
    if (!confirm(`Delete the announcement "${row.title}"? This cannot be undone.`)) {
      return;
    }
    try {
      await this.service.deleteAnnouncement(row);
      if (this.editingAnnouncement()?.id === row.id) {
        this.resetAnnouncementForm();
      }
      this.toast.success('Announcement deleted.');
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to delete the announcement.'));
    }
  }

  // ------------------------------------------------------------------------ FAQs

  async saveFaq(): Promise<void> {
    if (this.faqForm.invalid) {
      this.faqForm.markAllAsTouched();
      this.toast.error('Please correct the highlighted FAQ details.');
      return;
    }

    const raw = this.faqForm.getRawValue();
    const input = {
      question: this.clean(raw.question).slice(0, QUESTION_MAX),
      answer: this.clean(raw.answer).slice(0, ANSWER_MAX),
      category: this.clean(raw.category) || 'General',
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0,
      isPublished: raw.isPublished,
      contactAuthority: this.clean(raw.contactAuthority),
      contactEmail: raw.contactEmail.trim(),
      contactPhone: raw.contactPhone.trim(),
    };
    if (!input.question || !input.answer) {
      this.toast.error('The question and answer cannot be empty.');
      return;
    }

    this.saving.set(true);
    try {
      const editing = this.editingFaq();
      if (editing) {
        await this.service.updateFaq(editing, input);
        this.toast.success('FAQ updated.');
      } else {
        await this.service.createFaq(input);
        this.toast.success('FAQ added.');
      }
      this.resetFaqForm();
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to save the FAQ.'));
    } finally {
      this.saving.set(false);
    }
  }

  editFaq(row: FaqRow): void {
    this.editingFaq.set(row);
    this.faqForm.reset({
      question: row.question,
      answer: row.answer,
      category: row.category,
      order: row.order,
      isPublished: row.isPublished,
      contactAuthority: row.contactAuthority,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
    });
  }

  cancelFaqEdit(): void {
    this.resetFaqForm();
  }

  async toggleFaq(row: FaqRow): Promise<void> {
    try {
      await this.service.setFaqPublished(row, !row.isPublished);
      this.toast.success(row.isPublished ? 'FAQ moved to drafts.' : 'FAQ published.');
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to change the publish state.'));
    }
  }

  async deleteFaq(row: FaqRow): Promise<void> {
    if (!confirm(`Delete the FAQ "${row.question}"? This cannot be undone.`)) {
      return;
    }
    try {
      await this.service.deleteFaq(row);
      if (this.editingFaq()?.id === row.id) {
        this.resetFaqForm();
      }
      this.toast.success('FAQ deleted.');
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to delete the FAQ.'));
    }
  }

  // ---------------------------------------------------------------------- Helpers

  formatDate(date: Date | null): string {
    return date ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—';
  }

  private resetAnnouncementForm(): void {
    this.editingAnnouncement.set(null);
    this.announcementForm.reset({ title: '', body: '', isPublished: false });
  }

  private resetFaqForm(): void {
    this.editingFaq.set(null);
    this.faqForm.reset({
      question: '',
      answer: '',
      category: 'General',
      order: 0,
      isPublished: true,
      contactAuthority: '',
      contactEmail: '',
      contactPhone: '',
    });
  }

  /**
   * Cleans text that was pasted from Word, email, WhatsApp or a web page:
   * unifies line endings, replaces non-breaking and zero-width characters, removes control characters,
   * collapses long runs of blank lines and trims the ends. Line breaks are kept.
   */
  private clean(text: string): string {
    return text
      .replace(/\r\n?/g, '\n')
      .replace(/[\u00A0\u2007\u202F]/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** Multi-line text becomes title (first line) plus message (the rest). Single lines are not split. */
  private splitPasted(text: string): { title: string; body: string } | null {
    const lines = this.clean(text).split('\n');
    if (lines.length < 2) {
      return null;
    }

    const title = lines[0]
      .replace(/^[#>*\-\s]+/, '')
      .replace(/[*_:\s]+$/, '')
      .slice(0, TITLE_MAX);
    const body = lines.slice(1).join('\n').trim().slice(0, BODY_MAX);

    return title && body ? { title, body } : null;
  }

  private messageFrom(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}