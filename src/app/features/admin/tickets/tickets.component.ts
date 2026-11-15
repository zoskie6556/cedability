import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import {
  AdminTicketRow,
  AdminTicketService,
  SupportAgent,
  TicketPriority,
  TicketStatus,
} from '../../../core/services/admin-ticket.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-admin-tickets',
  imports: [IdeaLoaderComponent],
  templateUrl: './tickets.component.html',
  styleUrl: './tickets.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketsComponent implements OnInit {
  private readonly service = inject(AdminTicketService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = this.service.loading;
  readonly error = this.service.error;
  readonly agents = signal<SupportAgent[]>([]);

  readonly search = signal('');
  readonly statusFilter = signal<'all' | TicketStatus>('all');
  readonly priorityFilter = signal<'all' | TicketPriority>('all');

  readonly statusOptions: ReadonlyArray<{ value: TicketStatus; label: string }> = [
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'closed', label: 'Closed' },
  ];

  readonly counts = computed(() => {
    const all = this.service.tickets();
    return {
      total: all.length,
      open: all.filter(ticket => ticket.status === 'open').length,
      inProgress: all.filter(ticket => ticket.status === 'in_progress').length,
      resolved: all.filter(ticket => ticket.status === 'resolved' || ticket.status === 'closed').length,
      unassigned: all.filter(
        ticket => !ticket.assignedTo && (ticket.status === 'open' || ticket.status === 'in_progress'),
      ).length,
    };
  });

  readonly filteredTickets = computed(() => {
    const query = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const priority = this.priorityFilter();

    return this.service.tickets().filter(ticket => {
      const matchesStatus = status === 'all' || ticket.status === status;
      const matchesPriority = priority === 'all' || ticket.priority === priority;
      const matchesQuery =
        !query ||
        ticket.subject.toLowerCase().includes(query) ||
        ticket.userName.toLowerCase().includes(query) ||
        ticket.id.toLowerCase().includes(query);
      return matchesStatus && matchesPriority && matchesQuery;
    });
  });

  ngOnInit(): void {
    this.service.watch(this.destroyRef);
    void this.loadAgents();
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement | null)?.value ?? '');
  }

  onStatusFilter(event: Event): void {
    this.statusFilter.set(((event.target as HTMLSelectElement | null)?.value ?? 'all') as 'all' | TicketStatus);
  }

  onPriorityFilter(event: Event): void {
    this.priorityFilter.set(((event.target as HTMLSelectElement | null)?.value ?? 'all') as 'all' | TicketPriority);
  }

  async onAssign(event: Event, ticket: AdminTicketRow): Promise<void> {
    const value = (event.target as HTMLSelectElement | null)?.value ?? '';
    const agent = this.agents().find(item => item.id === value) ?? null;

    try {
      await this.service.assign(ticket, agent);
      this.toast.success(agent ? `Assigned to ${agent.name}.` : 'Ticket unassigned.');
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to assign the ticket.'));
    }
  }

  async onStatusChange(event: Event, ticket: AdminTicketRow): Promise<void> {
    const status = (event.target as HTMLSelectElement | null)?.value as TicketStatus | undefined;
    if (!status || status === ticket.status) {
      return;
    }

    try {
      await this.service.setStatus(ticket, status);
      this.toast.success(`Ticket marked as ${this.statusLabel(status).toLowerCase()}.`);
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to update the ticket status.'));
    }
  }

  // Helpers used by the template (Angular templates cannot run regular expressions).

  shortId(ticket: AdminTicketRow): string {
    return `T-${ticket.id.slice(0, 6).toUpperCase()}`;
  }

  priorityLabel(priority: TicketPriority): string {
    return priority.charAt(0).toUpperCase() + priority.slice(1);
  }

  statusLabel(status: TicketStatus): string {
    return this.statusOptions.find(option => option.value === status)?.label ?? status;
  }

  statusClass(status: TicketStatus): string {
    return `status-${status.replace('_', '-')}`;
  }

  formatDate(date: Date | null): string {
    return date ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—';
  }

  private async loadAgents(): Promise<void> {
    try {
      this.agents.set(await this.service.loadAgents());
    } catch (error) {
      console.error('[TicketsComponent] could not load support agents', error);
    }
  }

  private messageFrom(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}