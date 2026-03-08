import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Decorator to restrict route access to specific roles.
 * Use with RolesGuard after JwtAuthGuard so req.user is set.
 * @example @Roles('ADMIN') or @Roles('USER', 'ADMIN')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
