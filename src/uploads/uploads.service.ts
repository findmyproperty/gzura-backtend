import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import SftpClient from 'ssh2-sftp-client';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const CONTENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const CONTENT_MIME_TO_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

const CONTENT_MIME_TO_TYPE: Record<string, 'PDF' | 'WORD' | 'EXCEL'> = {
  'application/pdf': 'PDF',
  'application/msword': 'WORD',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'WORD',
  'application/vnd.ms-excel': 'EXCEL',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'EXCEL',
};

@Injectable()
export class UploadsService {
  constructor(private readonly config: ConfigService) {}

  async saveEventThumbnail(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Only JPEG, PNG, WebP, and GIF images are allowed',
      );
    }

    const extension = MIME_TO_EXT[file.mimetype] ?? '.jpg';
    const filename = `${randomUUID()}${extension}`;
    const buffer = await this.getFileBuffer(file);
    const storage = this.config.get<string>('UPLOAD_STORAGE') || 'local';

    if (storage === 'sftp') {
      await this.uploadViaSftp(filename, buffer);
    } else {
      await this.saveLocally(filename, buffer);
    }

    const publicBase =
      this.config.get<string>('UPLOAD_PUBLIC_URL') ||
      'http://localhost:8001/uploads/events';

    return {
      url: `${publicBase.replace(/\/$/, '')}/${filename}`,
      filename,
    };
  }

  async saveEventContentFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!CONTENT_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Only PDF, Word (.doc/.docx), and Excel (.xls/.xlsx) files are allowed',
      );
    }

    const extension = CONTENT_MIME_TO_EXT[file.mimetype] ?? '';
    const filename = `${randomUUID()}${extension}`;
    const buffer = await this.getFileBuffer(file);
    const storage = this.config.get<string>('UPLOAD_STORAGE') || 'local';

    if (storage === 'sftp') {
      await this.uploadViaSftp(filename, buffer, 'content');
    } else {
      await this.saveLocally(filename, buffer, 'content');
    }

    const publicBase =
      this.config.get<string>('UPLOAD_CONTENT_PUBLIC_URL') ||
      (this.config.get<string>('UPLOAD_PUBLIC_URL') || 'http://localhost:8001/uploads/events')
        .replace(/\/events\/?$/, '/event-content');

    return {
      url: `${publicBase.replace(/\/$/, '')}/${filename}`,
      filename,
      originalName: file.originalname,
      contentType: CONTENT_MIME_TO_TYPE[file.mimetype],
    };
  }

  private async getFileBuffer(file: Express.Multer.File): Promise<Buffer> {
    if (file.buffer?.length) {
      return file.buffer;
    }

    if (file.path) {
      try {
        return await readFile(file.path);
      } finally {
        await unlink(file.path).catch(() => undefined);
      }
    }

    throw new BadRequestException('No file data received');
  }

  private getLocalUploadDir(kind: 'events' | 'content' = 'events') {
    if (kind === 'content') {
      const configured = this.config.get<string>('UPLOAD_CONTENT_LOCAL_DIR');
      return configured || join(process.cwd(), 'uploads', 'event-content');
    }

    const configured = this.config.get<string>('UPLOAD_LOCAL_DIR');
    return configured || join(process.cwd(), 'uploads', 'events');
  }

  private async saveLocally(
    filename: string,
    buffer: Buffer,
    kind: 'events' | 'content' = 'events',
  ) {
    const uploadDir = this.getLocalUploadDir(kind);
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), buffer);
  }

  private getRemotePath(kind: 'events' | 'content' = 'events') {
    if (kind === 'content') {
      return (
        this.config.get<string>('SFTP_CONTENT_REMOTE_PATH') ||
        (this.config.get<string>('SFTP_REMOTE_PATH') || '/public_html/uploads/events').replace(
          /\/events\/?$/,
          '/event-content',
        )
      );
    }

    return this.config.get<string>('SFTP_REMOTE_PATH');
  }

  private async uploadViaSftp(
    filename: string,
    buffer: Buffer,
    kind: 'events' | 'content' = 'events',
  ) {
    const host = this.config.get<string>('SFTP_HOST');
    const username = this.config.get<string>('SFTP_USER');
    const password = this.config.get<string>('SFTP_PASSWORD');
    const privateKeyPath = this.config.get<string>('SFTP_PRIVATE_KEY_PATH');
    const remotePath = this.getRemotePath(kind);

    if (!host || !username || !remotePath) {
      throw new InternalServerErrorException(
        'SFTP upload is not configured. Set SFTP_HOST, SFTP_USER, SFTP_REMOTE_PATH, and SFTP_PASSWORD or SFTP_PRIVATE_KEY_PATH.',
      );
    }

    if (!password && !privateKeyPath) {
      throw new InternalServerErrorException(
        'SFTP credentials missing. Set SFTP_PASSWORD or SFTP_PRIVATE_KEY_PATH.',
      );
    }

    const client = new SftpClient();
    const connectConfig: Record<string, unknown> = {
      host,
      port: parseInt(this.config.get<string>('SFTP_PORT') || '22', 10),
      username,
      readyTimeout: 20000,
    };

    if (privateKeyPath) {
      connectConfig.privateKey = readFileSync(privateKeyPath, 'utf8');
      const passphrase = this.config.get<string>('SFTP_PRIVATE_KEY_PASSPHRASE');
      if (passphrase) connectConfig.passphrase = passphrase;
    } else {
      connectConfig.password = password;
    }

    try {
      await client.connect(connectConfig);

      const remoteDir = remotePath.replace(/\/$/, '');
      const remoteFile = `${remoteDir}/${filename}`;

      try {
        await client.mkdir(remoteDir, true);
      } catch {
        // Directory may already exist.
      }

      await client.put(buffer, remoteFile);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'SFTP upload failed';
      throw new InternalServerErrorException(message);
    } finally {
      await client.end();
    }
  }
}
