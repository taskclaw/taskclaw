import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  password!: string;
}

export class SignupDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password!: string;

  @IsNotEmpty()
  @IsString()
  name!: string;
}

export class UpdatePasswordDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  redirectTo?: string;
}
