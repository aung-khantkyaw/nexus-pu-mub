import { Request, Response } from 'express';
import logger from '@/config/logger';
import { prisma } from '@/lib/prisma';

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      // Explicitly define which fields to return (leaving out 'password')
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    res.json(users);
  } catch (error) {
    logger.error('Error fetching users', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};