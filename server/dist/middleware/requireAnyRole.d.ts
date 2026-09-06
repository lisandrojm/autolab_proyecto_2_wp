import { Request, Response, NextFunction } from "express";
export declare function requireAnyRole(req: Request & {
    user?: any;
}, res: Response, next: NextFunction): Response<any, Record<string, any>>;
