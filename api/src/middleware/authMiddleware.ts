import logger from "@/config/logger";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

if (!JWT_ACCESS_SECRET) {
  logger.error("FATAL ERROR: Missing JWT secrets in environment variables. Application cannot start.");
  throw new Error("Missing JWT secrets in environment variables");
}

export interface AuthPayload {
  id: string;
  username: string;
  email: string;
  role: string;
}
export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1]; 

  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as AuthPayload;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ error: "Invalid or expired access token" });
    return;
  }
};

export const optionalAuthenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET as string) as AuthPayload;
    req.user = decoded;
  } catch (error) {
    
  }
  
  next();
};