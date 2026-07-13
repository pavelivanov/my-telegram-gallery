INSERT INTO "Album" ("id", "name", "createdAt") VALUES
    ('legacy_album_one', 'Legacy album one', '2025-01-01T00:00:00Z'),
    ('legacy_album_two', 'Legacy album two', '2025-02-01T00:00:00Z');

INSERT INTO "Photo" (
    "id",
    "key",
    "thumbKey",
    "previewKey",
    "mimeType",
    "size",
    "width",
    "height",
    "position",
    "albumId",
    "createdAt"
) VALUES
    (
        'legacy_photo_variants',
        'photos/legacy/original.jpg',
        'photos/legacy/thumb.webp',
        'photos/legacy/preview.webp',
        'image/jpeg',
        2048,
        1200,
        800,
        0,
        'legacy_album_one',
        '2025-01-02T00:00:00Z'
    ),
    (
        'legacy_photo_plain',
        'photos/legacy/plain.png',
        NULL,
        NULL,
        'image/png',
        1024,
        400,
        400,
        0,
        'legacy_album_two',
        '2025-02-02T00:00:00Z'
    );

INSERT INTO "UploadIntent" (
    "id",
    "key",
    "albumId",
    "expectedMimeType",
    "expectedSize",
    "status",
    "expiresAt",
    "photoId",
    "createdAt",
    "updatedAt"
) VALUES
    (
        'legacy_intent_pending',
        'photos/legacy/pending.jpg',
        'legacy_album_one',
        'image/jpeg',
        4096,
        'PENDING',
        '2030-01-01T00:00:00Z',
        NULL,
        '2025-01-03T00:00:00Z',
        '2025-01-03T00:00:00Z'
    ),
    (
        'legacy_intent_confirmed',
        'photos/legacy/original.jpg',
        'legacy_album_one',
        'image/jpeg',
        2048,
        'CONFIRMED',
        '2030-01-01T00:00:00Z',
        'legacy_photo_variants',
        '2025-01-02T00:00:00Z',
        '2025-01-02T00:00:00Z'
    );
