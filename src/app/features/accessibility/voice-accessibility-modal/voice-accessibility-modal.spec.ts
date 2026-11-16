import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VoiceAccessibilityModal } from './voice-accessibility-modal';

describe('VoiceAccessibilityModal', () => {
  let component: VoiceAccessibilityModal;
  let fixture: ComponentFixture<VoiceAccessibilityModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VoiceAccessibilityModal],
    }).compileComponents();

    fixture = TestBed.createComponent(VoiceAccessibilityModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
