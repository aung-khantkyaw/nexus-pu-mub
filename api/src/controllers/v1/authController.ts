import { Request, Response } from "express";
import bcrypt from "bcrypt";
import logger from "@/config/logger";
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import { AuthRequest } from "@/middleware/authMiddleware";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET) {
  logger.error("FATAL ERROR: Missing JWT secrets in environment variables. Application cannot start.");
  process.exit(1);
}

export const register = async (req: Request, res: Response) => {
  const { name, username, email, password } = req.body;

  const avatarUrl = req.file ? req.file.path : null;

  if (!name || !username || !email || !password) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(err => logger.error('Error deleting file', err));
    }
    res.status(400).json({ error: 'Email, name, username and password are required' });
    return;
  }

  const hashpassword = await bcrypt.hash(password, 10);

  const data = {
    name,
    username,
    email,
    avatarUrl,
    password: hashpassword,
  }

  try {
    const user = await prisma.user.create({ data });
    logger.info(`User created: ${user.id}`);

    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json(userWithoutPassword);
  } catch (error: any) {

    if (req.file) {
      try {
        await fs.unlink(req.file.path);
        logger.info(`Cleaned up file: ${req.file.path} due to DB error`);
      } catch (unlinkError) {
        logger.error(`Failed to delete file: ${req.file.path}`, unlinkError);
      }
    }

    if (error.code === 'P2002') {
      const target = error.meta?.target as string[] | string | undefined;

      const targetString = Array.isArray(target) ? target.join(',') : String(target);

      if (targetString.includes('username')) {
        res.status(409).json({ error: 'Username already exists' });
      } else if (targetString.includes('email')) {
        res.status(409).json({ error: 'Email already exists' });
      } else {
        res.status(409).json({ error: 'A record with this data already exists' });
      }
    } else {
      logger.error('Error creating user', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }
  
  try {
    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid credentials' })
      return;
    }

    const accessToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken }
    });

    const { password: _, refreshToken: __, ...userWithoutSecrets } = user;

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 1000
    })

    res.status(200).json({
      user: userWithoutSecrets,
      accessToken
    });

  } catch (error) {
    logger.error('Error logging in user', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export const refreshToken = async (req:Request, res: Response) => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    res.status(401).json({ error: 'Refresh token is required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as { id: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });

    if (!user || user.refreshToken !== token) {
      res.status(403).json({ error: 'Invalid refresh token' });
      return;
    }

    const newAccessToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    res.status(200).json({ accessToken: newAccessToken });

  } catch (error) {
    logger.error('Error refreshing token', error);
    res.status(500).json({ error: 'invalid or expired refresh token' });
  }
}

export const logout = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(400).json({ error: 'Unauthorized: User not found' });
    return;
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null}
    });
  
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
    });

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Error logging out user', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}