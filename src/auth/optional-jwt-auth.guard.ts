import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const result = super.canActivate(context);
    if (result instanceof Promise) {
      return result.catch(() => true);
    }
    return result;
  }

  handleRequest<T>(err: Error | null, user: T): T | null {
    if (err || !user) {
      return null;
    }
    return user;
  }
}