import { Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto"
import logger from "@/config/logger";
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import { AuthRequest } from "@/middleware/authMiddleware";
import { sendMail } from "@/config/mailer";
import path from "path";

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

  const rawVerificationToken = crypto.randomBytes(32).toString('hex');
  const hashedVerificationToken = crypto.createHash('sha256').update(rawVerificationToken).digest('hex');
  const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); 

  const data = {
    name,
    username,
    email,
    avatarUrl,
    password: hashpassword,
    verificationToken: hashedVerificationToken,
    verificationExpires: verificationExpiresAt,
  }

  try {
    const user = await prisma.user.create({ data });
    logger.info(`User created: ${user.id}`);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verifyUrl = `${frontendUrl}/verify-email/${rawVerificationToken}`;

    const htmlContent = `
      <h1>Welcome to Nexus, ${user.name}!</h1>
      <p>Thank you for registering. Please click the link below to verify your email address:</p>
      <a href="${verifyUrl}" target="_blank">Verify My Email</a>
      <p>This verification link will expire in 24 hours.</p>
    `;

    await sendMail(user.email, 'Verify Your Email to Get Started', htmlContent);

    const { password: _, verificationToken: __, verificationExpires: ___, ...userWithoutPassword } = user;

    res.status(201).json({
      message: 'Registration successful. A verification email has been sent to your address.',
      user: userWithoutPassword
    });
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

export const verifyEmail = async (req: Request, res: Response) => {
  const { token } = req.params;

  if (!token) {
    res.status(400).json({ error: 'Verification token is required' });
    return;
  }

  try {
    const tokenString = Array.isArray(token) ? token[0] : token;
    const hashedToken = crypto.createHash('sha256').update(tokenString).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        verificationToken: hashedToken,
        verificationExpires: {
          gt: new Date()
        }
      }
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired verification token' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
        verificationExpires: null
      }
    });

    res.status(200).json({ message: 'Email verified successfully. You can now log in.' });
  } catch (error) {
    logger.error('Error verifying email', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const resendVerificationEmail = async (req: AuthRequest, res: Response) => {
  // Option 1: req.user.id (from authenticateToken if user is logged in)
  // Option 2: req.body.email (from manual input if user is logged out)
  const userId = req.user?.id;
  const emailFromBody = req.body?.email;

  if (!userId && !emailFromBody) {
    res.status(400).json({ error: 'User must be authenticated or an email must be provided' });
    return;
  }

  try {
    const whereCondition = userId ? { id: userId } : { email: emailFromBody };
    const user = await prisma.user.findUnique({ where: whereCondition });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.emailVerified) {
      res.status(400).json({ error: 'Email is already verified' });
      return;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: hashedToken,
        verificationExpires: tokenExpiresAt
      }
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verifyUrl = `${frontendUrl}/verify-email/${rawToken}`;

    const htmlContent = `
      <h1>Email Verification</h1>
      <p>Hello ${user.name},</p>
      <p>Please click the link below to verify your email address:</p>
      <a href="${verifyUrl}" target="_blank">Verify Email</a>
      <p>This link will expire in 24 hours.</p>
    `;

    await sendMail(user.email, 'Verify your email address', htmlContent);

    res.status(200).json({ message: 'Verification email has been resent successfully.' });
  } catch (error) {
    logger.error('Error resending verification email', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

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

    if (!user.emailVerified) {
      res.status(403).json({ error: 'Please verify your email address before logging in. If you did not receive the email, you can request a new one.' });
      return;
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
      const unlockTime = user.lockUntil.toLocaleString();
      res.status(403).json({ error: `Account is temporarily locked due to multiple failed login attempts. Please try again after ${unlockTime}` });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {

      const nextLoginAttempts = (user.loginAttempts || 0) + 1;

      let lockUntil: Date | null = null;
      let finalLoginAttempts = nextLoginAttempts;

      if (nextLoginAttempts >= 5) {
        lockUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        finalLoginAttempts = 0;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: finalLoginAttempts,
          lockUntil: lockUntil
        }
      })

      if (lockUntil) {
        res.status(403).json({ error: 'Too many failed attempts. Your account has been locked for 3 days.' });
      } else {
        const remaining = 5 - nextLoginAttempts;
        res.status(401).json({ error: `Invalid credentials. ${remaining} attempts remaining.` });
      }
      return;
    }

    const accessToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
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
      data: {
        refreshToken,
        loginAttempts: 0,
        lockUntil: null
      }
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
      { id: user.id, username: user.username, email: user.email, role: user.role },
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
  const { token } = req.params;
  const { password } = req.body;

  if (!token || !password) {
    res.status(400).json({ error: 'Token and new password are required' });
    return;
  }

  try {
    const tokenString = Array.isArray(token) ? token[0] : token;
    const hashedToken = crypto.createHash('sha256').update(tokenString).digest('hex');
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: {
          gt: new Date()
        }
      }
    });

    if (!user) {
      res.status(400).json({ error: 'Token is invalid or has expired' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires:null,
        refreshToken: null,
      }
    })

    res.status(200).json({ message: 'Password has been successfully reset' })
  } catch (error) {
    logger.error('Error in reset password', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export const changePassword = async (req:AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { currentPassword, newPassword } = req.body;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized: User not found' });
    return;
  }

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current password and new password are required' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid current password' });
      return;
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedNewPassword,
        refreshToken: null
      }
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    })

    res.status(200).json({ message: 'Password changed successfully. Please log in again.' });
  } catch (error) {
    logger.error('Error changing password', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export const requestEmailChange = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { newEmail } = req.body;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized: User not found' });
    return;
  }

  if (!newEmail) {
    res.status(400).json({ error: 'New email address is required' });
    return;
  }

  if (req.user?.email === newEmail) {
    res.status(400).json({ error: 'You are already using this email address' });
    return;
  }

  try {
    const emailExists = await prisma.user.findUnique({ where: { email: newEmail } });
    if (emailExists) {
      res.status(409).json({ error: 'Email address is already in use by another account' });
      return;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        pendingEmail: newEmail,
        emailChangeToken: hashedToken,
        emailChangeExpires: tokenExpiresAt
      }
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const confirmUrl = `${frontendUrl}/email/change/${rawToken}`;

    const htmlContent = `
      <h1>Confirm Your New Email Address</h1>
      <p>We received a request to change your account email to this address.</p>
      <p>Please click the link below to confirm the change:</p>
      <a href="${confirmUrl}" target="_blank">Confirm Email Change</a>
      <p>This link will expire in 24 hours. If you did not request this, please ignore this email.</p>
    `;

    await sendMail(newEmail, 'Confirm Your Email Change', htmlContent);

    res.status(200).json({ message: 'A confirmation link has been sent to your new email address.' });
  } catch (error) {
    logger.error('Error requesting email change', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export const confirmEmailChange = async (req: Request, res: Response) => {
  const { token } = req.params;

  if (!token) {
    res.status(400).json({ error: 'Token is required' });
    return;
  }

  try {
    const tokenString = Array.isArray(token) ? token[0] : token;
    const hashedToken = crypto.createHash('sha256').update(tokenString).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        emailChangeToken: hashedToken,
        emailChangeExpires: {
          gt: new Date()
        }
      }
    });

    if (!user || !user.pendingEmail) {
      res.status(400).json({ error: 'Invalid or expired token' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: user.pendingEmail,
        emailVerified: new Date(), 
        pendingEmail: null,
        emailChangeToken: null,
        emailChangeExpires: null
      }
    });

    res.status(200).json({ message: 'Email address updated successfully' });
  } catch (error: any) {
    if (error.code === 'P2002') { 
      res.status(409).json({ error: 'This email address is already in use' });
    } else {
      logger.error('Error confirming email change', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized: User not found' });
    return;
  }

  const { name } = req.body;
  const avatarUrl = req.file ? req.file.path : undefined;

  try {
    const dataToUpdate: any = {};
    if (name) dataToUpdate.name = name;
    if (avatarUrl) dataToUpdate.avatarUrl = avatarUrl;

    if (Object.keys(dataToUpdate).length === 0) {
      res.status(400).json({ error: 'No data provided to update' });
      return;
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true }
    });

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        avatarUrl: true,
        role: true,
      }
    });

    if (avatarUrl && currentUser?.avatarUrl) {
      try {
        await fs.unlink(currentUser.avatarUrl);
      } catch (err) {
        logger.error(`Failed to delete old avatar: ${currentUser.avatarUrl}`, err);
      }
    }

    res.status(200).json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(err => logger.error('Error deleting file', err));
    }
    logger.error('Error updating profile', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized: User not found' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        eduMail: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    logger.error('Error getting current user', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export const validateToken = async (req: AuthRequest, res: Response) => {
  // If the request reaches this controller, it means authenticateToken middleware passed.
  // We can just return success and the decoded user payload.
  if (!req.user) {
    res.status(401).json({ valid: false, error: 'User not attached to request' });
    return;
  }

  res.status(200).json({ 
    valid: true, 
    user: req.user 
  });
};

export const deleteAccount = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized: User not found' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await prisma.user.delete({
      where: { id: userId }
    });

    if (user.avatarUrl) {
      try {
        await fs.unlink(user.avatarUrl);
      } catch (err) {
        logger.error(`Failed to delete avatar during account deletion: ${user.avatarUrl}`, err);
      }
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    res.status(200).json({ message: 'Account successfully deleted' });
  } catch (error) {
    logger.error('Error deleting account', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};