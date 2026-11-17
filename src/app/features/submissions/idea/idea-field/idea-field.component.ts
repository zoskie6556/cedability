import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { map, startWith, switchMap } from 'rxjs';
import { SpeechService } from '../../../../core/services/speech.service';

/**
 * One labelled form field: label, plain-language hint, input or textarea, error message,
 * character counter, and optional Speak / Listen buttons.
 * Every field in the idea form uses this, so labels, error wiring (aria-describedby,
 * aria-invalid) and keyboard behaviour are identical and fixed in ONE place.
 */
@Component({
  selector: 'app-idea-field',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './idea-field.component.html',
  styleUrl: './idea-field.component.scss',
})
export class IdeaFieldComponent {
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  readonly control = input.required<FormControl<string> | FormControl<number | null>>();
  readonly hint = input('');
  readonly type = input<'text' | 'number' | 'date'>('text');
  readonly multiline = input(false);
  readonly rows = input(4);
  readonly maxLength = input<number | null>(null);
  /** Show Speak / Listen buttons (text fields only). */
  readonly voice = input(false);
  /** BCP-47 tag such as 'en-ZA'. Used for dictation and read-aloud. */
  readonly language = input('en-ZA');

  protected readonly speech = inject(SpeechService);

  protected readonly required = computed(() => this.control().hasValidator(Validators.required));
  protected readonly hintId = computed(() => `${this.id()}-hint`);
  protected readonly errorId = computed(() => `${this.id()}-error`);

  /**
   * Angular form controls are not signals, so we listen to the control's own event stream
   * (value, status and touched changes) and turn it into a signal. That is why a parent
   * calling `markAllAsTouched()` shows the errors here even under OnPush.
   */
  protected readonly view = toSignal(
    toObservable(this.control).pipe(
      switchMap((control) =>
        control.events.pipe(
          startWith(null),
          map(() => ({
            error: messageFor(control),
            length: typeof control.value === 'string' ? control.value.length : 0,
          })),
        ),
      ),
    ),
    { initialValue: { error: null as string | null, length: 0 } },
  );

  protected readonly describedBy = computed(() => {
    const ids: string[] = [];
    if (this.hint()) ids.push(this.hintId());
    if (this.view().error) ids.push(this.errorId());
    return ids.length > 0 ? ids.join(' ') : null;
  });

  /** True only while THIS field is the one being dictated into. */
  protected readonly listening = computed(
    () => this.speech.listening() && this.speech.owner() === this,
  );

  private dictationBase = '';

  constructor() {
    // Copy what the browser hears into the control while we are listening.
    effect(() => {
      const heard = this.speech.transcript();
      if (!this.listening()) return;
      untracked(() => {
        const control = this.control();
        if (typeof control.value !== 'string') return;
        (control as FormControl<string>).setValue(`${this.dictationBase} ${heard}`.trim());
        control.markAsDirty();
      });
    });
  }

  protected toggleDictation(): void {
    if (this.listening()) {
      this.speech.stop();
      return;
    }
    const value = this.control().value;
    this.dictationBase = typeof value === 'string' ? value : '';
    this.speech.start(this.language(), this);
  }

  protected readAloud(): void {
    const value = this.control().value;
    this.speech.speak(typeof value === 'string' ? value : '', this.language());
  }
}

/** Plain-language error text. Returns null until the user has touched the field. */
function messageFor(control: AbstractControl): string | null {
  if (!control.touched || !control.errors) return null;
  const errors = control.errors;
  if (errors['required'] || errors['blank'] || errors['requiredTrue']) {
    return 'Please fill in this field.';
  }
  if (errors['maxlength']) {
    const max = (errors['maxlength'] as { requiredLength: number }).requiredLength;
    return `Please keep this under ${max} characters.`;
  }
  if (errors['min']) return 'Please enter an amount above zero.';
  return 'Please check this field.';
}
