import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-create-account',
  imports: [RouterLink],
  templateUrl: './create-account.component.html',
  styleUrl: './create-account.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateAccountComponent {
  private readonly toastService = inject(ToastService);

  protected submit(event: SubmitEvent): void {
    event.preventDefault();
    this.toastService.info('Account creation is ready for Firebase Authentication integration.');
  }
}
