import { FileCategory } from "@/types";
import { Request } from "express";
import multer from "multer";
import path from "path";
import fs from 'fs';

const allowedMimeTypes: Record<FileCategory, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  doc: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/csv'],
  video: ['video/mp4', 'video/x-matroska', 'video/x-msvideo', 'video/webm'],
  voice: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/x-m4a', 'audio/mp4'],
};

const initializeUploadFolders = () => {
  const categories: FileCategory[] = ['image', 'doc', 'video', 'voice'];
  categories.forEach(category => {
    const folder = `uploads/${category}s/`;
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
  });
};

initializeUploadFolders();

const getFolderByCategory = (category: FileCategory) => {
  return `uploads/${category}s/`;
}

export const getFileSizeLimit = (category: FileCategory): number => {
  const MB = 1024 * 1024; 
  switch (category) {
    case "image":
      return 5 * MB;   
    case "doc":
      return 10 * MB;  
    case "video":
      return 100 * MB; 
    case "voice":
      return 20 * MB;  
    default:
      return 5 * MB;   
  }
}

export const createStorage = (category: FileCategory) => {
  return multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, getFolderByCategory(category));
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });
}

export const createFileFilter = (category: FileCategory) => {
  return (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowed = allowedMimeTypes[category];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Only ${category} files are allowed. Allowed MIME types: ${allowed.join(', ')}`));
    }
  };
}