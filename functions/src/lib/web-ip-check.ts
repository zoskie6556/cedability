import type { IdeaCategory } from '../shared/automated-review.model';

export interface WebAndIpCheckInput {
  planText: string;
  category: IdeaCategory;
}

export interface WebAndIpCheckResult {
  status: 'not-implemented';
  findings: readonly [];
}

/** TODO: implement in the later web/IP research module. */
export interface WebAndIpChecker {
  check(input: WebAndIpCheckInput): Promise<WebAndIpCheckResult>;
}
