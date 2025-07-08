import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { JWT_SECRET } from "../config";
import { authMiddleware } from "../middleware";
import { createTaskInput } from "../types";
const router = Router();
const prismaClient = new PrismaClient();
const s3Client = new S3Client({
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.ACCESS_SECRET ?? "",
    },
    region: "us-east-1"
})
const PARENT_WALLET_ADDRESS = "2KeovpYvrgpziaDsq8nbNMP4mc48VNBVXb5arbqrg9Cq";
    
const DEFAULT_TITLE = "Select the most clickable thumbnail";




/**
 * Sign in user
 * uses wallet address to sign in
 * @method POST
 * @route /v1/user/signin
 * @param {string} address - wallet address
 * @returns {object} user
 */


router.post("/signin", async (req, res) => {
  const hardCodedWalletAdderss = "rqnYjqscTdhCKDdYyaXTCygD6s1EZZohiKPKmEbmHLf";
  const existingUser = await prismaClient.user.findFirst({
    where: {
      address: hardCodedWalletAdderss,
    },
  });

  if (existingUser) {
    const token = jwt.sign({ userId: existingUser.id }, JWT_SECRET);
    res.json({ token });
  } else {
    const user = await prismaClient.user.create({
      data: {
        address: hardCodedWalletAdderss,
      },
    });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ token });
  }
}); 

router.get("/presignedUrl", authMiddleware, async (req, res) => {
  // @ts-ignore
  const userId = req.userId;

  const { url, fields } = await createPresignedPost(s3Client, {
    Bucket: 'hkirat-cms',
    Key: `fiver/${userId}/${Math.random()}/image.jpg`,
    Conditions: [
      ['content-length-range', 0, 5 * 1024 * 1024] // 5 MB max
    ],
    Expires: 3600
  });

  res.json({
    preSignedUrl: url,
    fields
  });
});


router.post("/task", authMiddleware, async (req, res) => {
    //@ts-ignore
    const userId = req.userId
    // validate the inputs from the user;
    const body = req.body;

    const parseData = createTaskInput.safeParse(body);

    const user = await prismaClient.user.findFirst({
        where: {
            id: userId
        }
    })

    if (!parseData.success) {
         res.status(411).json({
            message: "You've sent the wrong inputs"
        })
        return;
    }

    const transaction = await connection.getTransaction(parseData.data.signature, {
        maxSupportedTransactionVersion: 1
    });

    console.log(transaction);

    if ((transaction?.meta?.postBalances[1] ?? 0) - (transaction?.meta?.preBalances[1] ?? 0) !== 100000000) {
         res.status(411).json({
            message: "Transaction signature/amount incorrect"
        })
        return;
    }

    if (transaction?.transaction.message.getAccountKeys().get(1)?.toString() !== PARENT_WALLET_ADDRESS) {
         res.status(411).json({
            message: "Transaction sent to wrong address"
        })
        return;
    }

    if (transaction?.transaction.message.getAccountKeys().get(0)?.toString() !== user?.address) {
         res.status(411).json({
            message: "Transaction sent to wrong address"
        })

        return;
    }
    // was this money paid by this user address or a different address?

    // parse the signature here to ensure the person has paid 0.1 SOL
    // const transaction = Transaction.from(parseData.data.signature);

    let response = await prismaClient.$transaction(async tx => {

        const response = await tx.task.create({
            data: {
                title: parseData.data.title ?? DEFAULT_TITLE,
                amount: 0.1 * TOTAL_DECIMALS,
                //TODO: Signature should be unique in the table else people can reuse a signature
                signature: parseData.data.signature,
                user_id: userId
            }
        });

        await tx.option.createMany({
            data: parseData.data.options.map(x => ({
                image_url: x.imageUrl,
                task_id: response.id
            }))
        })

        return response;

    })

    res.json({
        id: response.id
    })

})

router.get("/task", authMiddleware, async (req, res) => {
    // @ts-ignore
    const taskId: string = req.query.taskId;
    // @ts-ignore
    const userId: string = req.userId;

    const taskDetails = await prismaClient.task.findFirst({
        where: {
            user_id: Number(userId),
            id: Number(taskId)
        },
        include: {
            options: true
        }
    })

    if (!taskDetails) {
       res.status(411).json({
            message: "You dont have access to this task"
        });
        return;
    }

    // Todo: Can u make this faster?
    const responses = await prismaClient.submission.findMany({
        where: {
            task_id: Number(taskId)
        },
        include: {
            option: true
        }
    });

    const result: Record<string, {
        count: number;
        option: {
            imageUrl: string
        }
    }> = {};

    taskDetails.options.forEach(option => {
        result[option.id] = {
            count: 0,
            option: {
                imageUrl: option.image_url
            }
        }
    })

    responses.forEach(r => {
        result[r.option_id].count++;
    });

    res.json({
        result,
        taskDetails
    })

})

export default router;