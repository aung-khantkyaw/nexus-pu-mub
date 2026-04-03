import { Router } from "express";
import { register } from "@/controllers/v1/authController";

const router = Router();

router.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
})

router.post('/register', register);

export default router;