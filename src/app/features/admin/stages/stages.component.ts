import { NgFor } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AdminDashboardService } from '../../../core/services/admin-dashboard.service';

@Component({
  selector: 'app-admin-stages',
  imports: [NgFor],
  templateUrl: './stages.component.html',
  styleUrl: './stages.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StagesComponent {
  readonly stageProgress = inject(AdminDashboardService).stageProgress;
}
