import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { JWT_SECRET } from "../config";
import { authMiddleware } from "../middleware";
const router = Router();
const prismaClient = new PrismaClient();
const s3Client = new S3Client({
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.ACCESS_SECRET ?? "",
    },
    region: "us-east-1"
})
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
export default router;