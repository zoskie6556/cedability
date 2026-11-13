import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-idea-loader',
  templateUrl: './idea-loader.component.html',
  styleUrl: './idea-loader.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdeaLoaderComponent {
  readonly label = input('Bringing ideas together');
}
