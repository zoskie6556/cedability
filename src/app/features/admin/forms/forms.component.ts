import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-admin-forms',
  templateUrl: './forms.component.html',
  styleUrl: './forms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormsComponent {}
