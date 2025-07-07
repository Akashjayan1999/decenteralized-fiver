import { Router } from "express";

const router = Router();

router.post("/signin", (req, res) => {
  res.send("Hello World");
});

export default router;