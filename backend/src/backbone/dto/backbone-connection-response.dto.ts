/**
 * Response shape returned by the controller.
 * Sensitive fields inside `config` are masked.
 */
export class BackboneConnectionResponseDto {
  id: string;
  account_id: string;
  backbone_type: string;
  name: string;
  description: string | null;
  /** Config with sensitive values masked (api_key -> sk-****xxxx) */
  config: Record<string, any>;
  is_default: boolean;
  is_active: boolean;
  health_status: string | null;
  health_checked_at: string | null;
  verified_at: string | null;
  total_requests: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
}
