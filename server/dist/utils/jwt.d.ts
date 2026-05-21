export interface JWTPayload {
    sub: string;
    email: string;
    role?: string;
    primaryRole?: string;
    roles?: string[];
    clientIds?: string[];
    tenantId: string;
    tenantSlug?: string;
    firstName?: string;
    lastName?: string;
    scopes?: string[];
}
export declare function signJwt(payload: JWTPayload): string;
export declare function verifyJwt(token: string): JWTPayload;
