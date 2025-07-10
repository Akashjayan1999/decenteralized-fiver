import { Router } from "express";
import jwt from "jsonwebtoken";
import { WORKER_JWT_SECRET } from "../config";
import { PrismaClient } from "@prisma/client";
import { workerMiddleware } from "../middleware";
import { getNextTask } from "../db";


const prismaClient = new PrismaClient();
const router = Router();

router.post("/signin", async (req, res) => {
  const hardCodedWalletAdderss = "rqnYjqscTdhCKDdYyaXTCygD6s1EZZohiKPKmEbmHLk";
    const existingUser = await prismaClient.worker.findFirst({
      where: {
        address: hardCodedWalletAdderss,
      },
    });
  
    if (existingUser) {
      const token = jwt.sign({ userId: existingUser.id }, WORKER_JWT_SECRET);
      res.json({ token });
    } else {
      const user = await prismaClient.worker.create({
        data: {
          address: hardCodedWalletAdderss,
          pending_amount: 0,
          locked_amount: 0,
        },
      });
      const token = jwt.sign({ userId: user.id }, WORKER_JWT_SECRET);
      res.json({ token });
    }
});

router.get("/nextTask", workerMiddleware, async (req, res) => {
    // @ts-ignore
    const userId: string = req.userId;

    const task = await getNextTask(Number(userId));

    if (!task) {
        res.status(411).json({   
            message: "No more tasks left for you to review"
        })
    } else {
        res.json({   
            task
        })
    }
})

export default router;