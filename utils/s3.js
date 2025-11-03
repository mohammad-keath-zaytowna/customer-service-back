const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3Client = new S3Client({
  region: process.env.BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
  },
});
const uploadToS3 = async (file) => {
  const fileName = Date.now() + "-" + file.originalname;
  const comand = new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
  });
  await s3Client.send(comand);
  return fileName;
};
const getFileUrl = async (fileName) => {
  const command = new GetObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: fileName,
  });
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
};
module.exports = { uploadToS3, getFileUrl };
