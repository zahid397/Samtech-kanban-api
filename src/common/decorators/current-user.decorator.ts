import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../types/jwt-payload.interface';

/**
 * Extracts the authenticated user attached to the request by JwtStrategy.
 * Usage: `@CurrentUser() user: AuthenticatedUser` or `@CurrentUser('userId') id: string`.
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthenticatedUser | undefined,
    ctx: ExecutionContext,
  ): AuthenticatedUser | string => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;
    return data ? user[data] : user;
  },
);
