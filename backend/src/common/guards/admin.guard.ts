import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../../users/user.enums';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      // This guard should be used after AuthGuard, so user should exist.
      // If not, we can return false or throw.
      return false;
    }

    // Check app_metadata for system role
    // We assume the role is stored in app_metadata.role
    const role = user.app_metadata?.role;

    if (role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Access denied. Requires SUPER_ADMIN role.');
    }

    return true;
  }
}
