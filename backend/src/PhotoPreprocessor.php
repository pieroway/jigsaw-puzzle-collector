<?php
declare(strict_types=1);
namespace Jigsaw;
interface PhotoPreprocessor {
    /** JPEG derivatives and normalized corners in EXIF source space. Rotation is an absolute clockwise post-rectification override. */
    public function process(string $path,?array $corners=null,?int $rotation=null): array;
}
