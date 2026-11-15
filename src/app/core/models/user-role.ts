<<<<<<< HEAD
export const USER_ROLES = ['submitter', 'evaluator', 'adjudicator', 'agent', 'admin'] as const;
=======
export const USER_ROLES = ['user', 'evaluator', 'admin'] as const;
>>>>>>> 65eedde6ea6ed75d8ef3a93b55c4ac03ca0a8c0a

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.some(role => role === value);
}
