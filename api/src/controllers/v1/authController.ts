import { Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto"
import logger from "@/config/logger";
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import { AuthRequest } from "@/middleware/authMiddleware";
import { sendMail } from "@/config/mailer";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET) {
  logger.error("FATAL ERROR: Missing JWT secrets in environment variables. Application cannot start.");
  throw new Error("Missing JWT secrets in environment variables");
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
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 1000,
      path: '/'
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

    if (!user) {
      res.status(403).json({ error: 'Invalid refresh token' });
      return;
    }

    if (user.refreshToken !== token) {
      logger.warn(`Security Alert: Refresh token reuse detected for user ID: ${user.id}. Revoking all sessions.`);

      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: null }
      });

      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/'
      });

      res.status(403).json({ error: 'Security breach detected. All sessions revoked. Please log in again.' });
      return;
    }

    const newAccessToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );


    const newRefreshToken = jwt.sign(
      { id: user.id },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d'}
    )

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken }
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 1000,
      path: '/'
    })

    res.status(200).json({ accessToken: newAccessToken });

  } catch (error) {
     if (error instanceof jwt.TokenExpiredError || error instanceof jwt.JsonWebTokenError) {
      res.status(403).json({ error: 'Invalid or expired refresh token' });
    } else {
      logger.error('Error refreshing token', error);
      res.status(500).json({ error: 'Internal server error' });
    }
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
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Error logging out user', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export const forgotPassword = async (req:Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
      return;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: tokenExpiresAt
      }
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password/${rawToken}`;

    const htmlContent = `
      <h1>Password Reset Request</h1>
      <p>Hello ${user.name},</p>
      <p>You requested a password reset. Click the link below to set a new password:</p>
      <a href="${resetUrl}" target="_blank">Reset Password</a>
      <p>This link will expire in 15 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `;

    await sendMail(user.email, 'Password Reset Request', htmlContent);

    res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (error) {
    logger.error('Error in forgot password request', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export const resetPassword = async (req: Request, res: Response) => {
  
}