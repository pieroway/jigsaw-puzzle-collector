<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use Jigsaw\{ImageDelivery,ImageStore,HttpError};
final class ImageDeliveryTest extends TestCase {
    public function testResponsiveImageIsSmallerAndOriginalIsUntouched(): void {
        $source='/fixtures/photos/puzzle-01.jpg';$hash=hash_file('sha256',$source);
        $body=ImageDelivery::render($source,480);$size=getimagesizefromstring($body);
        self::assertSame('image/webp',$size['mime']);self::assertLessThanOrEqual(480,max($size[0],$size[1]));
        self::assertLessThan(filesize($source),strlen($body));self::assertSame($hash,hash_file('sha256',$source));
    }
    public function testNoUpscalingAndTransparentStudioBackgroundIsPreserved(): void {
        $path=tempnam(sys_get_temp_dir(),'display');$image=imagecreatetruecolor(40,20);imagealphablending($image,false);imagesavealpha($image,true);imagefill($image,0,0,imagecolorallocatealpha($image,0,0,0,127));imagesetpixel($image,20,10,imagecolorallocatealpha($image,200,80,20,0));imagepng($image,$path);imagedestroy($image);
        try {$body=ImageDelivery::render($path,960);$result=imagecreatefromstring($body);self::assertSame(40,imagesx($result));self::assertSame(20,imagesy($result));self::assertSame(127,(imagecolorat($result,0,0)>>24)&127);imagedestroy($result);}finally{unlink($path);}
    }
    public function testOnlyBoundedSizesAreAccepted(): void {
        self::assertNull(ImageDelivery::size(null));self::assertSame(480,ImageDelivery::size('480'));
        foreach(['1','999999',[],480] as $value){try{ImageDelivery::size($value);self::fail('Invalid size accepted');}catch(HttpError $e){self::assertSame(422,$e->status);}}
    }
    public function testSingleDecodeUploadStillRejectsDamagedImageBeforeSaving(): void {
        $root=sys_get_temp_dir().'/display-test-'.bin2hex(random_bytes(6));$store=new ImageStore($root);$path=tempnam(sys_get_temp_dir(),'broken');file_put_contents($path,'not an image');$key=bin2hex(random_bytes(24));
        try {try{$store->save($path,$key);self::fail('Broken image accepted');}catch(InvalidArgumentException){self::assertFileDoesNotExist($store->path($key).'.original');self::assertFileDoesNotExist($store->path($key).'.jpg');}}finally{unlink($path);if(is_dir($root))rmdir($root);}
    }
}
