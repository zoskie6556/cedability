import { NgFor } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AdminDashboardService } from '../../../core/services/admin-dashboard.service';

@Component({
  selector: 'app-admin-ideas',
  imports: [NgFor],
  templateUrl: './ideas.component.html',
  styleUrl: './ideas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdeasComponent {
  readonly ideaPipeline = inject(AdminDashboardService).ideaPipeline;
}
