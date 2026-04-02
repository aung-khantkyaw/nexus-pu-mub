import { Request, Response } from 'express';
import logger from '../config/logger';
import { prisma } from '../lib/prisma';

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    logger.error('Error fetching users', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createUser = async (req: Request, res: Response) => {
  const { email, name } = req.body;
  if (!email || !name) {
    res.status(400).json({ error: 'Email and name are required' });
    return;
  }
  try {
    const user = await prisma.user.create({ data: { email, name } });
    logger.info(`User created: ${user.id}`);
    res.status(201).json(user);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'Email already exists' });
    } else {
      logger.error('Error creating user', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};