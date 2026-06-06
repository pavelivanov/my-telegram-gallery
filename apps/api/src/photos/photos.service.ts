import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TgUser } from '../auth/tg-init-data.guard';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../storage/r2.service';

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
  ) {}

  private upsertUser(tgUser: TgUser) {
    return this.prisma.user.upsert({
      where: { tgId: BigInt(tgUser.id) },
      create: {
        tgId: BigInt(tgUser.id),
        username: tgUser.username,
        firstName: tgUser.first_name,
      },
      update: {
        username: tgUser.username,
        firstName: tgUser.first_name,
      },
    });
  }

  /** Step 1: client asks for a presigned upload URL. */
  async createUpload(tgUser: TgUser, contentType: string) {
    const user = await this.upsertUser(tgUser);
    const key = `photos/${user.id}/${randomUUID()}`;
    const uploadUrl = await this.r2.presignUpload(key, contentType);
    return { key, uploadUrl };
  }

  /** Step 2: client confirms upload finished — persist the record. */
  async confirmUpload(
    tgUser: TgUser,
    data: { key: string; mimeType: string; size: number; width?: number; height?: number },
  ) {
    const user = await this.upsertUser(tgUser);
    return this.prisma.photo.create({ data: { ...data, userId: user.id } });
  }

  async list(tgUser: TgUser) {
    const photos = await this.prisma.photo.findMany({
      where: { user: { tgId: BigInt(tgUser.id) } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      photos.map(async (p) => ({
        ...p,
        url: await this.r2.presignDownload(p.key),
      })),
    );
  }

  async remove(tgUser: TgUser, id: string) {
    const photo = await this.prisma.photo.findFirst({
      where: { id, user: { tgId: BigInt(tgUser.id) } },
    });
    if (!photo) throw new NotFoundException();
    await this.r2.delete(photo.key);
    await this.prisma.photo.delete({ where: { id: photo.id } });
  }
}
