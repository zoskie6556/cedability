export type AdminUserRole = 'submitter' | 'evaluator' | 'adjudicator' | 'agent' | 'admin';
export type AdminUserStatus = 'active' | 'disabled';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  emailVerified: boolean;
  createdAt: string;
  lastActive: string;
}
