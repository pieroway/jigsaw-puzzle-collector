<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use Jigsaw\PortablePreprocessor;
final class PreprocessingTest extends TestCase {
    public function testPortableGeometryAndOriginalPreservation(): void {
        $path='/fixtures/photos/puzzle-01.jpg'; $hash=hash_file('sha256',$path);
        $result=(new PortablePreprocessor())->process($path,[[.15,.12],[.87,.10],[.88,.89],[.14,.88]]);
        self::assertSame($hash,hash_file('sha256',$path));
        self::assertSame('php-gd',$result['engine']);
        self::assertCount(4,$result['corners']); self::assertLessThanOrEqual(1600,max($result['catalogue_size']));
        self::assertLessThanOrEqual(400,max($result['thumbnail_size']));
        self::assertStringStartsWith("\xff\xd8",$result['catalogue']);
    }
    public function testPortableDetectionUsesTheTenRealPhotos(): void {
        foreach(glob('/fixtures/photos/puzzle-[0-9][0-9].jpg') as $path) {
            $result=(new PortablePreprocessor())->process($path);
            self::assertCount(4,$result['corners']); self::assertLessThan(.95,$result['crop_fraction']);
            self::assertLessThan(.65,$result['confidence'],'Portable proposals always require explicit corner review');
        }
    }
    public function testCrossedCornersFailBeforeProcessing(): void {
        $this->expectException(InvalidArgumentException::class);
        (new PortablePreprocessor())->process('/fixtures/photos/puzzle-01.jpg',[[0,0],[1,1],[1,0],[0,1]]);
    }
    public function testPortableRotationAlsoRotatesThumbnailAndFlagsMissingOcr(): void {
        $processor=new PortablePreprocessor(); $corners=[[.15,.12],[.87,.10],[.88,.89],[.14,.88]];
        $plain=$processor->process('/fixtures/photos/puzzle-01.jpg',$corners);
        self::assertTrue($plain['orientation']['ambiguous']);
        $rotated=$processor->process('/fixtures/photos/puzzle-01.jpg',$corners,90);
        self::assertSame(array_reverse($plain['catalogue_size']),$rotated['catalogue_size']);
        self::assertSame(array_reverse($plain['thumbnail_size']),$rotated['thumbnail_size']);
        self::assertSame('manual',$rotated['orientation']['source']);
        self::assertSame(90,$rotated['orientation']['angle']);
        self::assertFalse($rotated['orientation']['ambiguous']);
    }
}
