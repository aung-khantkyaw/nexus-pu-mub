import { FileCategory } from "@/types";
import multer from "multer";
import { createStorage, createFileFilter, getFileSizeLimit } from "@/config/multer";

export const uploadMiddleware = (category: FileCategory) => {
  return multer({
    storage: createStorage(category),
    fileFilter: createFileFilter(category),
    limits: {
      fileSize: getFileSizeLimit(category)
    }
  });
};

export const uploadImage = uploadMiddleware("image");
export const uploadDoc = uploadMiddleware("doc");
export const uploadVideo = uploadMiddleware("video");
export const uploadVoice = uploadMiddleware("voice");