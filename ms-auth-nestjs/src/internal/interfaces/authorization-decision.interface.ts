export interface AuthorizationDecision {
  subject_id: string;
  action: string;
  allowed: boolean;
  reason: string;
}
