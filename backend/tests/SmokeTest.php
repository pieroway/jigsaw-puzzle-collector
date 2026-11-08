<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
final class SmokeTest extends TestCase {
    public function testEnvironmentSupportsJson(): void {
        self::assertSame('{"ok":true}', json_encode(['ok' => true]));
    }
    public function testPhoneAndSquarePhotosWithinPixelLimitAreAccepted(): void {
        $path=tempnam(sys_get_temp_dir(),'photo-test-');
        try {
            foreach ([[3468,4624],[4500,4500],[5712,4284],[5000,5000]] as [$width,$height]) {
                $image=imagecreatetruecolor($width,$height);
                imagejpeg($image,$path,80); imagedestroy($image); clearstatcache(true,$path);
                $meta=(new \Jigsaw\ImageStore(sys_get_temp_dir()))->inspect($path,'phone.jpg');
                self::assertSame($width,$meta['width']); self::assertSame($height,$meta['height']);
            }
        } finally { unlink($path); }
    }
    public function testOversizedPhotoReportsActualReceivedDimensions(): void {
        $path=tempnam(sys_get_temp_dir(),'photo-test-');
        try {
            $image=imagecreatetruecolor(6000,4500);
            imagejpeg($image,$path,80); imagedestroy($image);
            $this->expectException(\InvalidArgumentException::class);
            $this->expectExceptionMessage('6000 × 4500 pixels (27.00 megapixels)');
            (new \Jigsaw\ImageStore(sys_get_temp_dir()))->inspect($path,'phone.jpg');
        } finally { unlink($path); }
    }
}
