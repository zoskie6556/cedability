import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  message: string;
  kind: ToastKind;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _messages = signal<ToastMessage[]>([]);
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 0;

  readonly messages = this._messages.asReadonly();

  success(message: string): number {
    return this.show(message, 'success');
  }

  error(message: string): number {
    return this.show(message, 'error');
  }

  info(message: string): number {
    return this.show(message, 'info');
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }

    this._messages.update((messages) => messages.filter((message) => message.id !== id));
  }

  private show(message: string, kind: ToastKind): number {
    const content = message.trim();
    if (!content) {
      throw new Error('Toast messages must not be empty.');
    }

    const id = ++this.nextId;
    this._messages.update((messages) => [...messages, { id, message: content, kind }]);
    this.timers.set(id, setTimeout(() => this.dismiss(id), 5000));
    return id;
  }
}
