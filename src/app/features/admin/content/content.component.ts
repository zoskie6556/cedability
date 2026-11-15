import { NgFor } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AdminDashboardService } from '../../../core/services/admin-dashboard.service';

@Component({
  selector: 'app-admin-content',
  imports: [NgFor],
  templateUrl: './content.component.html',
  styleUrl: './content.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentComponent {
  readonly contentItems = inject(AdminDashboardService).contentItems;
}
