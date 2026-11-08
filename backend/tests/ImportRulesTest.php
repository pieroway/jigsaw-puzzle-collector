<?php
declare(strict_types=1);
use Jigsaw\ImportRules;
use Jigsaw\FixtureExtractor;
use Jigsaw\ImageStore;
use PHPUnit\Framework\TestCase;

final class ImportRulesTest extends TestCase {
    public function testNormalizationAndCandidateIdentity(): void {
        self::assertSame('ravensburger', ImportRules::normalize('  RAVENSBURGER! '));
        $a = ['title'=>'City Garden', 'manufacturer'=>'Ravensburger', 'pieces'=>500, 'product_number'=>null];
        self::assertSame(ImportRules::identity($a), ImportRules::identity([...$a, 'title'=>' CITY garden! ']));
        self::assertNull(ImportRules::identity(['title'=>null, 'manufacturer'=>null]));
    }
    public function testImportedRecordsAreImmutable(): void {
        self::assertTrue(ImportRules::canTransition('needs_review', 'approved'));
        self::assertTrue(ImportRules::canTransition('failed', 'queued'));
        self::assertFalse(ImportRules::canTransition('imported', 'needs_review'));
        self::assertFalse(ImportRules::canTransition('queued', 'imported'));
    }
    public function testFixtureUsesImageContentsAndDoesNotInventUnknowns(): void {
        $provider = new FixtureExtractor('/fixtures');
        $result = $provider->extract('/fixtures/photos/puzzle-02.jpg');
        self::assertStringContainsString('unverified', $result['title']);
        self::assertNull($result['product_number']);
        self::assertNull($result['release_year']);
        self::assertFalse($result['catalogue_verified']);
        self::assertSame('deterministic_fixture', $result['provider']);
        self::assertSame($result, $provider->extract('/fixtures/photos/puzzle-02.jpg'));
    }
    public function testInvalidFilesAndTraversalAreRejected(): void {
        $store = new ImageStore(sys_get_temp_dir() . '/import-unit');
        foreach (['evil.php', '../photo.jpg', 'photo.svg'] as $name) {
            try { $store->inspect('/fixtures/photos/puzzle-01.jpg', $name); self::fail('Unsafe filename accepted'); }
            catch (InvalidArgumentException $e) { self::assertNotEmpty($e->getMessage()); }
        }
        $file = tempnam(sys_get_temp_dir(), 'invalid');
        file_put_contents($file, '<?php echo "executable";');
        try { $store->inspect($file, 'photo.jpg'); self::fail('Non-image accepted'); }
        catch (InvalidArgumentException $e) { self::assertStringContainsString('image', $e->getMessage()); }
        finally { unlink($file); }
    }
    public function testImageLimitsAndExactHash(): void {
        $store = new ImageStore(sys_get_temp_dir() . '/import-unit');
        $a = $store->inspect('/fixtures/photos/puzzle-01.jpg', 'one.jpg');
        $b = $store->inspect('/fixtures/photos/puzzle-01.jpg', 'renamed.jpg');
        self::assertSame($a['sha256'], $b['sha256']);
        self::assertGreaterThan(0, $a['width']);
        $this->expectException(InvalidArgumentException::class);
        (new ImageStore('/tmp/unused', 10))->inspect('/fixtures/photos/puzzle-01.jpg', 'one.jpg');
    }
    public function testOrientationIsPreservedAndThumbnailMetadataStripped(): void {
        $root=sys_get_temp_dir().'/orientation-'.bin2hex(random_bytes(4));
        $file=tempnam(sys_get_temp_dir(),'orientation');
        $image=imagecreatetruecolor(40,20); ob_start(); imagejpeg($image); $jpeg=ob_get_clean(); imagedestroy($image);
        // Minimal EXIF/TIFF record with orientation 6 (90 degrees clockwise).
        $exif="Exif\0\0II".pack('vVv',42,8,1).pack('vvVv',0x112,3,1,6)."\0\0".pack('V',0);
        file_put_contents($file,substr($jpeg,0,2)."\xff\xe1".pack('n',strlen($exif)+2).$exif.substr($jpeg,2));
        $key=str_repeat('a',48); $store=new ImageStore($root);
        try {
            $store->save($file,$key); $size=getimagesize($store->path($key).'.jpg');
            self::assertSame([20,40],[$size[0],$size[1]]);
            self::assertSame(hash_file('sha256',$file),hash_file('sha256',$store->path($key).'.original'));
            $metadata=@exif_read_data($store->path($key).'.jpg') ?: [];
            self::assertArrayNotHasKey('Orientation',$metadata);
            self::assertArrayNotHasKey('GPSLatitude',$metadata);
            self::assertArrayNotHasKey('Make',$metadata);
        } finally { $store->remove($key); if(is_dir($root)) rmdir($root); unlink($file); }
    }
}
