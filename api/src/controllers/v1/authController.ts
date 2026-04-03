import { Request, Response } from "express";
import bcrypt from "bcrypt";
import logger from "@/config/logger";
import { prisma } from "@/lib/prisma";

export const register = async (req: Request, res: Response) => {
  const { name, username, email, avatarUrl, password } = req.body;

  if (!name || !username || !email || !password) {
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

  
}