import { FastifyRequest, FastifyReply } from 'fastify';
declare module 'fastify' {
    interface FastifyRequest {
        user?: {
            id: string;
            tenant_id: string;
            role: 'agent' | 'manager';
            name: string;
        };
    }
}
export declare function authMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void>;
export declare function requireRole(...roles: string[]): (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
export declare function tenantScope(req: FastifyRequest, reply: FastifyReply, done: () => void): void;
export declare function requestIdMiddleware(req: FastifyRequest, reply: FastifyReply, done: () => void): void;
export declare function auditLog(tenantId: string, actorUserId: string | undefined, action: string, entityType: string, entityId: string, metadata: any, ipAddress: string): Promise<void>;
export declare function rateLimit(maxRequests: number, windowMs: number): (req: FastifyRequest, reply: FastifyReply, done: () => void) => void;
//# sourceMappingURL=middleware.d.ts.map