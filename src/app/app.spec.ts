import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should expose the primary destinations in the main navigation', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('nav[aria-label="Main navigation"] a'));

    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Home',
      'About',
      'Contact',
      'Submissions',
      'Profile',
      'Dashboard',
      'VoiceCommand',
    ]);
  });

  it('should route VoiceCommand to the accessibility feature', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const voiceCommandLink = Array.from(
      compiled.querySelectorAll('nav[aria-label="Main navigation"] a'),
    ).find((link) => link.textContent?.trim() === 'VoiceCommand');

    expect(voiceCommandLink?.getAttribute('href')).toBe('/accessibility');
  });
});
