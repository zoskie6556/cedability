import { NgFor } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AdminDashboardService } from '../../../core/services/admin-dashboard.service';

@Component({
  selector: 'app-admin-settings',
  imports: [NgFor],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  readonly settings = inject(AdminDashboardService).settings;
}
