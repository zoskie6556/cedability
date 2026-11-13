import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-login',
  imports: [RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly toastService = inject(ToastService);

  protected submit(event: SubmitEvent): void {
    event.preventDefault();
    this.toastService.info('Sign-in is ready for Firebase Authentication integration.');
  }
}
