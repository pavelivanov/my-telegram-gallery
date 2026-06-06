import { ArrayNotEmpty, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateAlbumDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class ReorderPhotosDto {
  @ArrayNotEmpty()
  @IsString({ each: true })
  photoIds: string[];
}
