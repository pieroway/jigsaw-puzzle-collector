<?php
declare(strict_types=1);
use Jigsaw\{Database,FixtureExtractor,HttpError,ImageStore,ImportRecognition,ImportService};
use PHPUnit\Framework\TestCase;

final class ImportRecognitionTest extends TestCase {
    public function testConsentOwnershipAndQuotaWithFakeProvider(): void {
        self::assertSame('jigsaw_test',getenv('DB_NAME'));
        $db = Database::connect();
        $store = new ImageStore(getenv('PRIVATE_STORAGE_PATH'));
        $imports = new ImportService($db,$store,new FixtureExtractor(getenv('FIXTURE_PATH')));
        $key = bin2hex(random_bytes(8));
        $db->prepare('INSERT INTO users(email,password_hash) VALUES (?,?)')->execute([$key.'@recognition.test','unused']);
        $owner = (int)$db->lastInsertId();
        $batch = (int)$imports->create($owner,$key)['id'];
        $path = tempnam(sys_get_temp_dir(),'recognition');
        imagejpeg(imagecreatetruecolor(64,64),$path);
        $previousLimit = getenv('AI_RECOGNITION_USER_DAILY_LIMIT');
        putenv('AI_RECOGNITION_USER_DAILY_LIMIT=1');
        try {
            $item = $imports->upload($batch,$owner,$key,['name'=>'box.jpg','tmp_name'=>$path,'error'=>0]);
            $id = $item['id'];
            $db->prepare("UPDATE import_items SET state='needs_review' WHERE id=?")->execute([$id]);
            $calls = 0;
            $recognition = new ImportRecognition($db,$store,static function (string $jpeg) use (&$calls): array {
                $calls++;
                self::assertSame('image/jpeg',getimagesizefromstring($jpeg)['mime']);
                return ['title'=>'Evening Harbor','pieces'=>500,'product_number'=>'0012','barcode'=>'001234567890'];
            });
            $request = ['consent'=>true,'revision'=>'original'];
            $this->assertHttpError(422,fn()=>$recognition->identify($id,$owner,['revision'=>'original']));
            $this->assertHttpError(404,fn()=>$recognition->identify($id,$owner+1,$request));
            $this->assertHttpError(409,fn()=>$recognition->identify($id,$owner,['consent'=>true,'revision'=>'stale']));
            self::assertSame(0,$calls);
            $result = $recognition->identify($id,$owner,$request);
            self::assertSame('0012',$result['fields']['product_number']);
            self::assertSame('001234567890',$result['barcode']);
            self::assertNull($imports->status($batch,$owner)['items'][0]['fields']);
            $this->assertHttpError(429,fn()=>$recognition->identify($id,$owner,$request));
            self::assertSame(1,$calls);
        } finally {
            unlink($path);
            putenv($previousLimit === false ? 'AI_RECOGNITION_USER_DAILY_LIMIT' : 'AI_RECOGNITION_USER_DAILY_LIMIT='.$previousLimit);
            $db->prepare('DELETE FROM ai_recognition_usage WHERE scope_id=?')->execute([$owner]);
            if (!empty($calls)) $db->exec('UPDATE ai_recognition_usage SET attempts=attempts-1 WHERE scope_id=0 AND usage_day=UTC_DATE() AND attempts>0');
        }
    }

    private function assertHttpError(int $status, Closure $action): void {
        try {
            $action();
            self::fail("Expected HTTP status $status");
        } catch (HttpError $error) {
            self::assertSame($status,$error->status);
        }
    }
}
