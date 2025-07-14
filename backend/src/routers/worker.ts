import { Router } from "express";
import jwt from "jsonwebtoken";
import { WORKER_JWT_SECRET } from "../config";
import { PrismaClient } from "@prisma/client";
import { workerMiddleware } from "../middleware";
import { getNextTask } from "../db";
import { createSubmissionInput } from "../types";

const TOTAL_SUBMISSIONS = 100;
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

router.get("/balance", workerMiddleware, async (req, res) => {
    // @ts-ignore
    const userId: string = req.userId;

    const worker = await prismaClient.worker.findFirst({
        where: {
            id: Number(userId)
        }
    })

    res.json({
        pendingAmount: worker?.pending_amount,
        lockedAmount: worker?.pending_amount,
    })
})


router.post("/submission", workerMiddleware, async (req, res) => {
    // @ts-ignore
    const userId = req.userId;
    const body = req.body;
    const parsedBody = createSubmissionInput.safeParse(body);

    if (parsedBody.success) {
        const task = await getNextTask(Number(userId));
        if (!task || task?.id !== Number(parsedBody.data.taskId)) {
             res.status(411).json({
                message: "Incorrect task id"
            })
            return;
        }

        const amount = (Number(task.amount) / TOTAL_SUBMISSIONS).toString();

        const submission = await prismaClient.$transaction(async tx => {
            const submission = await tx.submission.create({
                data: {
                    option_id: Number(parsedBody.data.selection),
                    worker_id: userId,
                    task_id: Number(parsedBody.data.taskId),
                    amount: Number(amount)
                }
            })

            await tx.worker.update({
                where: {
                    id: userId,
                },
                data: {
                    pending_amount: {
                        increment: Number(amount)
                    }
                }
            })

            return submission;
        })

        const nextTask = await getNextTask(Number(userId));
        res.json({
            nextTask,
            amount
        })
        

    } else {
        res.status(411).json({
            message: "Incorrect inputs"
        })
            
    }

})

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