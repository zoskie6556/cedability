import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Firestore, doc, getDoc, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { ToastService } from '../../../core/services/toast.service';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';

export interface ChatAdminSettings {
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

const ALL_DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
] as const;

@Component({
  selector: 'app-admin-settings',
  imports: [ReactiveFormsModule, IdeaLoaderComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
  private readonly firestore = inject(Firestore);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly days = ALL_DAYS;
  protected readonly loading = signal(true);
  protected readonly savingChat = signal(false);
  protected readonly activeSection = signal<'chat' | 'orb'>('chat');

  protected readonly workingDays = signal<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);

  /** Persisted to Firestore at `settings/chat` so ChatService & ChatRoomComponent can consume it. */
  protected readonly chatForm = this.fb.nonNullable.group({
    isEnabled: [true],
    openTime: ['09:00', Validators.required],
    closeTime: ['16:00', Validators.required],
    timezone: ['Africa/Gaborone', Validators.required],
    maxConcurrentChats: [3, [Validators.required, Validators.min(1), Validators.max(20)]],

    profanityEnabled: [true],
    profanityAction: ['warn_and_ban' as 'block' | 'mask' | 'warn_and_ban'],
    profanityStrikeLimit: [3, [Validators.required, Validators.min(1), Validators.max(10)]],
    banDurationHours: [24, [Validators.required, Validators.min(0), Validators.max(8760)]],
    blockedTermsRaw: [''],

    autoReplyWaitSeconds: [45, [Validators.required, Validators.min(5), Validators.max(600)]],
    waitingAutoReply: [
      'Thank you for reaching out to CEDA Support. All consultants are currently assisting other applicants—one will join you shortly.',
      [Validators.required, Validators.maxLength(500)],
    ],
    offlineAutoReply: [
      'Our live chat consultants are currently offline. Leave your message here and we will respond during working hours (09:00–16:00).',
      [Validators.required, Validators.maxLength(500)],
    ],
  });

  /** Local-only UI controls for the Accessibility Orb (not submitted to Firestore). */
  protected readonly orbForm = this.fb.nonNullable.group({
    orbEnabled: [true],
    defaultLanguage: ['en' as 'en' | 'tn'],
    autoGreetOnLanding: [false],
    voiceSpeed: [1.0],
    assistScope: ['navigation_and_ideas' as 'navigation_only' | 'navigation_and_ideas' | 'full'],
    criteriaNotes: [
      'Guide applicants through idea submission steps, eligibility checks, and Setswana/English navigation without revealing internal scoring weights.',
    ],
  });

  ngOnInit(): void {
    void this.loadChatSettings();
  }

  protected selectSection(section: 'chat' | 'orb'): void {
    this.activeSection.set(section);
  }

  protected toggleDay(dayKey: string): void {
    const current = this.workingDays();
    if (current.includes(dayKey)) {
      this.workingDays.set(current.filter((d) => d !== dayKey));
    } else {
      this.workingDays.set([...current, dayKey]);
    }
  }

  protected isDaySelected(dayKey: string): boolean {
    return this.workingDays().includes(dayKey);
  }

  protected async saveChatSettings(): Promise<void> {
    if (this.chatForm.invalid) {
      this.chatForm.markAllAsTouched();
      this.toast.error('Please review the highlighted chat configuration fields.');
      return;
    }

    if (this.workingDays().length === 0) {
      this.toast.error('Select at least one active working day for live chat.');
      return;
    }

    this.savingChat.set(true);
    try {
      const raw = this.chatForm.getRawValue();
      const blockedTerms = raw.blockedTermsRaw
        .split(/[\n,]+/)
        .map((term) => term.trim().toLowerCase())
        .filter(Boolean);

      const payload: ChatAdminSettings & { updatedAt: unknown } = {
        isEnabled: raw.isEnabled,
        openTime: raw.openTime,
        closeTime: raw.closeTime,
        workingDays: this.workingDays(),
        timezone: raw.timezone.trim(),
        maxConcurrentChats: Number(raw.maxConcurrentChats),
        profanityEnabled: raw.profanityEnabled,
        profanityAction: raw.profanityAction,
        profanityStrikeLimit: Number(raw.profanityStrikeLimit),
        banDurationHours: Number(raw.banDurationHours),
        blockedTerms,
        autoReplyWaitSeconds: Number(raw.autoReplyWaitSeconds),
        waitingAutoReply: raw.waitingAutoReply.trim(),
        offlineAutoReply: raw.offlineAutoReply.trim(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(this.firestore, 'settings/chat'), payload, { merge: true });
      this.toast.success('Live chat settings saved.');
    } catch (error) {
      console.error('[SettingsComponent] failed to save chat settings.', error);
      this.toast.error('Could not save chat settings. Please check your permissions and try again.');
    } finally {
      this.savingChat.set(false);
    }
  }

  protected previewOrbLocal(): void {
    this.toast.success('Accessibility Orb settings updated locally (not saved to database yet).');
  }

  private async loadChatSettings(): Promise<void> {
    this.loading.set(true);
    try {
      const snap = await getDoc(doc(this.firestore, 'settings/chat'));
      if (snap.exists()) {
        const data = snap.data() as Partial<ChatAdminSettings>;
        if (Array.isArray(data.workingDays) && data.workingDays.length > 0) {
          this.workingDays.set(data.workingDays);
        }
        this.chatForm.patchValue({
          isEnabled: data.isEnabled ?? true,
          openTime: data.openTime ?? '09:00',
          closeTime: data.closeTime ?? '16:00',
          timezone: data.timezone ?? 'Africa/Gaborone',
          maxConcurrentChats: data.maxConcurrentChats ?? 3,
          profanityEnabled: data.profanityEnabled ?? true,
          profanityAction: data.profanityAction ?? 'warn_and_ban',
          profanityStrikeLimit: data.profanityStrikeLimit ?? 3,
          banDurationHours: data.banDurationHours ?? 24,
          blockedTermsRaw: Array.isArray(data.blockedTerms) ? data.blockedTerms.join(', ') : '',
          autoReplyWaitSeconds: data.autoReplyWaitSeconds ?? 45,
          waitingAutoReply:
            data.waitingAutoReply ??
            'Thank you for reaching out to CEDA Support. All consultants are currently assisting other applicants—one will join you shortly.',
          offlineAutoReply:
            data.offlineAutoReply ??
            'Our live chat consultants are currently offline. Leave your message here and we will respond during working hours (09:00–16:00).',
        });
      }
    } catch (error) {
      console.error('[SettingsComponent] failed to load chat settings.', error);
      this.toast.error('Unable to load saved chat settings. Showing defaults.');
    } finally {
      this.loading.set(false);
    }
  }
}