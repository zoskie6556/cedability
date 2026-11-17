import type { EvaluatorType } from '../../../shared/models/idea-evaluation.model';

export type AdminUserRole = 'submitter' | 'evaluator' | 'adjudicator' | 'agent' | 'admin';
export type AdminUserStatus = 'active' | 'disabled';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: AdminUserRole;
  evaluatorType: EvaluatorType | null;
  organization: string | null;
  status: AdminUserStatus;
  emailVerified: boolean;
  createdAt: string;
  lastActive: string;
}
