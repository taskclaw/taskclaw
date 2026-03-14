import { IsString, IsNotEmpty, IsUrl, IsOptional, IsBoolean } from 'class-validator';

export class CreateAiProviderDto {
  @IsUrl()
  @IsNotEmpty()
  api_url: string;

  @IsString()
  @IsOptional()
  api_key?: string;

  @IsString()
  @IsOptional()
  agent_id?: string;

  @IsString()
  @IsOptional()
  provider_type?: string = 'openclaw';

  @IsBoolean()
  @IsOptional()
  is_active?: boolean = true;

  // --- Sprint 7: Extended OpenClaw credentials ---

  @IsString()
  @IsOptional()
  openrouter_api_key?: string;

  @IsString()
  @IsOptional()
  telegram_bot_token?: string;

  @IsString()
  @IsOptional()
  brave_search_api_key?: string;
}
