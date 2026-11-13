import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds and dismisses a notification', () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ToastService);

    const id = service.success('  Idea submitted.  ');

    expect(service.messages()).toEqual([
      { id, message: 'Idea submitted.', kind: 'success' },
    ]);

    service.dismiss(id);
    expect(service.messages()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('automatically removes a notification after five seconds', () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ToastService);

    service.info('Processing');
    vi.advanceTimersByTime(5000);

    expect(service.messages()).toEqual([]);
  });

  it('rejects empty notifications', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ToastService);

    expect(() => service.error('  ')).toThrow('Toast messages must not be empty.');
  });
});
