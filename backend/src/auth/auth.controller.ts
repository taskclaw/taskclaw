import { Controller, Post, Body, Get, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, SignupDto, ForgotPasswordDto, UpdatePasswordDto } from './dto/auth.dto';
import type { Request } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    @ApiOperation({ summary: 'Login with email and password' })
    @ApiResponse({ status: 200, description: 'Returns session with access token' })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Post('signup')
    @ApiOperation({ summary: 'Create a new account' })
    @ApiResponse({ status: 201, description: 'Account created, returns session' })
    @ApiResponse({ status: 400, description: 'Validation error' })
    async signup(@Body() signupDto: SignupDto) {
        return this.authService.signup(signupDto);
    }

    @Post('logout')
    @ApiOperation({ summary: 'Logout and invalidate session' })
    async logout(@Req() req: Request) {
        const token = this.extractTokenFromHeader(req);
        if (!token) return { success: true };
        return this.authService.logout(token);
    }

    @Get('me')
    @ApiOperation({ summary: 'Get current authenticated user' })
    @ApiResponse({ status: 200, description: 'Returns user profile' })
    @ApiResponse({ status: 401, description: 'Not authenticated' })
    async getMe(@Req() req: Request) {
        const token = this.extractTokenFromHeader(req);
        if (!token) throw new UnauthorizedException('No token provided');
        return this.authService.getMe(token);
    }

    @Post('forgot-password')
    @ApiOperation({ summary: 'Send password reset email' })
    async forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.authService.resetPasswordForEmail(dto.email, dto.redirectTo || '');
    }

    @Post('update-password')
    @ApiOperation({ summary: 'Update password (requires valid session)' })
    async updatePassword(@Req() req: Request, @Body() dto: UpdatePasswordDto) {
        const token = this.extractTokenFromHeader(req);
        if (!token) throw new UnauthorizedException('No token provided');
        return this.authService.updateUser(token, { password: dto.password });
    }

    @Post('exchange-code')
    @ApiOperation({ summary: 'Exchange auth code for session' })
    async exchangeCode(@Body() body: { code: string }) {
        return this.authService.exchangeCodeForSession(body.code);
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }
}
