import { z } from '@hono/zod-openapi';

export const ArmingLockRequestSchema = z
  .object({
    mode: z
      .enum(['global', 'home', 'away', 'night'])
      .openapi({ example: 'home', description: 'Arming lock mode to update' }),
    value: z
      .boolean()
      .openapi({ example: true, description: 'True to enable the arming lock, false to disable it' }),
  })
  .openapi('ArmingLockRequest');
