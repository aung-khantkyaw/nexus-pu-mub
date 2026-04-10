import { Router } from "express";
import { login, logout, refreshToken, register } from "@/controllers/v1/authController";
import { uploadImage } from "@/middleware/uploadMiddleware";
import { authenticateToken } from "@/middleware/authMiddleware";
import { loginLimiter, registerLimiter } from "@/middleware/rateLimiter";

const router = Router()

router.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
})

router.post('/register', registerLimiter, uploadImage.single('avatar'), register);
router.post('/login', loginLimiter, login);
router.post('/refresh', refreshToken);
router.post('/logout', authenticateToken, logout);

export default router;