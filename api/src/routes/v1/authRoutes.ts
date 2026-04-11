import { Router } from "express";
import { changePassword, confirmEmailChange, deleteAccount, forgotPassword, getCurrentUser, login, logout, refreshToken, register, requestEmailChange, resendVerificationEmail, resetPassword, updateProfile, validateToken, verifyEmail } from "@/controllers/v1/authController";
import { uploadImage } from "@/middleware/uploadMiddleware";
import { authenticateToken, optionalAuthenticateToken } from "@/middleware/authMiddleware";
import { emailChangeLimiter, loginLimiter, passwordChangeLimiter, passwordResetLimiter, refreshLimiter, registerLimiter } from "@/middleware/rateLimiter";

const router = Router()

router.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
})

router.post('/register', registerLimiter, uploadImage.single('avatar'), register);
router.post('/login', loginLimiter, login);
router.post('/refresh', refreshLimiter, refreshToken);
router.post('/logout', authenticateToken, logout);
router.delete('/account', authenticateToken, deleteAccount);

router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', optionalAuthenticateToken, resendVerificationEmail);

router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password/:token', passwordResetLimiter, resetPassword);
router.put('/change-password', authenticateToken, passwordChangeLimiter, changePassword);

router.get('/me', authenticateToken, getCurrentUser);
router.patch('/profile', authenticateToken, uploadImage.single('avatar'), updateProfile);

router.get('/validate-token', authenticateToken, validateToken);
router.post('/email/change-request', authenticateToken, emailChangeLimiter, requestEmailChange);
router.get('/email/change/:token', confirmEmailChange);

export default router;