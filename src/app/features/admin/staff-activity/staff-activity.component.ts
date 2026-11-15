import { NgFor } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AdminDashboardService } from '../../../core/services/admin-dashboard.service';

@Component({
  selector: 'app-admin-staff-activity',
  imports: [NgFor],
    templateUrl: './staff-activity.component.html',
  styleUrl: './staff-activity.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffActivityComponent {
  readonly staffActivity = inject(AdminDashboardService).staffActivity;
}
