import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VoiceAccessibilityModalComponent } from './voice-accessibility-modal';

describe('VoiceAccessibilityModalComponent', () => {
  let component: VoiceAccessibilityModalComponent;
  let fixture: ComponentFixture<VoiceAccessibilityModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VoiceAccessibilityModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VoiceAccessibilityModalComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
