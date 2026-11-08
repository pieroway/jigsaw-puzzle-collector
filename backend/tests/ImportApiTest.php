<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;

final class ImportApiTest extends TestCase {
    private string $cookie = '';
    private string $csrf = '';
    private int $user;
    private string $email;
    private function call(string $method, string $path, array $data = [], ?string $photo = null, string $key = 'one'): array {
        $headers = ['Content-Type: application/json', 'Cookie: '.$this->cookie, 'X-CSRF-Token: '.$this->csrf];
        $body = json_encode($data);
        if ($photo !== null) {
            $boundary = 'fixtureBoundary';
            $headers[0] = 'Content-Type: multipart/form-data; boundary='.$boundary;
            $body = "--$boundary\r\nContent-Disposition: form-data; name=\"client_key\"\r\n\r\n$key\r\n--$boundary\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".file_get_contents($photo)."\r\n--$boundary--\r\n";
        }
        $context = stream_context_create(['http'=>['method'=>$method, 'header'=>implode("\r\n", $headers), 'content'=>$method === 'GET' ? '' : $body, 'ignore_errors'=>true, 'timeout'=>20]]);
        $result = file_get_contents('http://api'.$path, false, $context);
        foreach ($http_response_header as $header) {
            if (preg_match('/^Set-Cookie: ([^;]+)/i', $header, $match)) $this->cookie = $match[1];
        }
        preg_match('/\s(\d{3})\s/', $http_response_header[0], $match);
        return [(int)$match[1], json_decode($result, true),$result];
    }
    protected function setUp(): void {
        self::assertSame('jigsaw_test', getenv('DB_NAME'), 'Mutation tests must use the isolated test database');
        [, $s] = $this->call('GET', '/api/session'); $this->csrf = $s['csrf'];
        $this->email=bin2hex(random_bytes(8)).'@example.test';
        [$status, $s] = $this->call('POST', '/api/auth/register', ['email'=>$this->email, 'password'=>'collector fixture password 123']);
        self::assertSame(201, $status); $this->csrf = $s['csrf']; $this->user = $s['user']['id'];
    }
    public function testHomeSummaryHasGlobalTotalsOwnerIsolationAndBoundedRecentItems(): void {
        [$status,$empty]=$this->call('GET','/api/home');self::assertSame(200,$status);
        self::assertSame(['puzzles'=>0,'manufacturers'=>0,'known_pieces'=>0],$empty['totals']);
        $db=Jigsaw\Database::connect();
        $db->exec("INSERT INTO puzzles(title) VALUES ('Home summary fixture')");$puzzle=(int)$db->lastInsertId();
        $q=$db->prepare('INSERT INTO editions(puzzle_id,manufacturer,piece_count) VALUES (?,?,?)');$q->execute([$puzzle,' Home Maker ',500]);$edition=(int)$db->lastInsertId();
        $q=$db->prepare('INSERT INTO owned_copies(user_id,edition_id) VALUES (?,?)');
        $db->beginTransaction();for($i=0;$i<1001;$i++)$q->execute([$this->user,$edition]);$last=(int)$db->lastInsertId();$db->commit();
        $q=$db->prepare('INSERT INTO users(email,password_hash) VALUES (?,?)');$q->execute(['home-'.bin2hex(random_bytes(8)).'@example.test','not-a-login-hash']);$other=(int)$db->lastInsertId();
        $q=$db->prepare('INSERT INTO owned_copies(user_id,edition_id) VALUES (?,?)');$q->execute([$other,$edition]);
        $active=[];
        foreach(['image_review','needs_review','failed','approved','imported','rejected'] as $state) {
            $batch=$this->batch();$q=$db->prepare('INSERT INTO import_items(batch_id,client_key,filename,state) VALUES (?,?,?,?)');$q->execute([$batch,'one','fixture.jpg',$state]);
            if(!in_array($state,['imported','rejected'],true))$active[]=$batch;
        }
        $deleted=$this->batch();$q=$db->prepare("UPDATE import_batches SET deleted_at=UTC_TIMESTAMP() WHERE id=?");$q->execute([$deleted]);
        $q=$db->prepare("INSERT INTO import_items(batch_id,client_key,filename,state) VALUES (?,'one','fixture.jpg','failed')");$q->execute([$deleted]);
        $q=$db->prepare('INSERT INTO import_batches(user_id,client_key) VALUES (?,?)');$q->execute([$other,'home-summary']);$foreignBatch=(int)$db->lastInsertId();
        $q=$db->prepare("INSERT INTO import_items(batch_id,client_key,filename,state) VALUES (?,'one','fixture.jpg','failed')");$q->execute([$foreignBatch]);
        [$status,$home]=$this->call('GET','/api/home');self::assertSame(200,$status);
        self::assertSame(['puzzles'=>1001,'manufacturers'=>1,'known_pieces'=>500500],$home['totals']);
        self::assertCount(6,$home['recent']);self::assertSame($last,(int)$home['recent'][0]['id']);
        self::assertSame(array_reverse(array_slice($active,-3)),array_column($home['batches'],'id'));
        $this->cookie='';$this->csrf='';self::assertSame(401,$this->call('GET','/api/home')[0]);
    }
    private function batch(): int {
        [$status, $batch] = $this->call('POST', '/api/import-batches', ['client_key'=>bin2hex(random_bytes(12))]);
        self::assertSame(201, $status); return $batch['id'];
    }
    private function upload(int $batch, string $key = 'one', string $file = '/fixtures/photos/puzzle-01.jpg'): array {
        [$status, $item] = $this->call('POST', "/api/import-batches/$batch/photos", [], $file, $key);
        self::assertContains($status, [200,201]); return $item;
    }
    private function review(int $batch): array {
        do { [$status,$data]=$this->call('POST',"/api/import-batches/$batch/process"); self::assertSame(200,$status); } while($data['summary']['queued']+$data['summary']['processing']>0);
        foreach($data['items'] as $item) if($item['state']==='image_review') {
            [$status]=$this->call('POST','/api/import-items/'.$item['id'].'/preprocessing/accept',['revision'=>$item['preprocessing']['revision']]); self::assertSame(200,$status);
        }
        do { [$status,$data]=$this->call('POST',"/api/import-batches/$batch/process"); self::assertSame(200,$status); } while($data['summary']['queued']+$data['summary']['processing']>0);
        return $data['items'];
    }
    public function testAuthenticationOwnershipAndCsrf(): void {
        $batch = $this->batch(); $item = $this->upload($batch);
        $cookie = $this->cookie; $csrf = $this->csrf;
        $this->csrf = 'wrong'; self::assertSame(403, $this->call('POST', '/api/import-batches')[0]);
        $this->cookie = ''; $this->csrf = '';
        self::assertSame(401, $this->call('GET', "/api/import-batches/$batch")[0]);
        $this->setUp();
        self::assertSame(404, $this->call('GET', "/api/import-batches/$batch")[0]);
        self::assertSame(404, $this->call('POST', "/api/import-batches/$batch/commit")[0]);
        self::assertSame(404, $this->call('PATCH', '/api/import-items/'.$item['id'], ['title'=>'stolen'])[0]);
        self::assertSame(404, $this->call('GET', '/api/import-items/'.$item['id'].'/image')[0]);
        $this->cookie = $cookie; $this->csrf = $csrf;
        self::assertSame(200, $this->call('GET', "/api/import-batches/$batch")[0]);
    }
    public function testBatchDeletionPreservesImportedCopiesAndDeletesUnimportedPhotos(): void {
        $batch=$this->batch();$first=$this->upload($batch,'keep');$second=$this->upload($batch,'discard','/fixtures/photos/puzzle-02.jpg');
        $this->review($batch);
        self::assertSame(200,$this->call('PATCH','/api/import-items/'.$first['id'],['reviewed'=>true])[0]);
        self::assertSame(200,$this->call('POST','/api/import-items/'.$first['id'].'/approve')[0]);
        self::assertSame(200,$this->call('POST',"/api/import-batches/$batch/commit")[0]);
        $csrf=$this->csrf;$this->csrf='wrong';self::assertSame(403,$this->call('DELETE',"/api/import-batches/$batch")[0]);$this->csrf=$csrf;
        [$status,$deleted]=$this->call('DELETE',"/api/import-batches/$batch");self::assertSame(200,$status);self::assertSame(1,$deleted['retained_copies']);self::assertSame(0,$deleted['cleanup_pending']);
        self::assertSame(404,$this->call('GET',"/api/import-batches/$batch")[0]);self::assertSame(404,$this->call('GET','/api/import-items/'.$second['id'].'/image')[0]);
        self::assertSame(200,$this->call('GET','/api/import-items/'.$first['id'].'/image')[0]);
        self::assertSame(hash_file('sha256','/fixtures/photos/puzzle-01.jpg'),hash('sha256',$this->call('GET','/api/import-items/'.$first['id'].'/original')[2]));
        [, $collection]=$this->call('GET','/api/collection');self::assertCount(1,$collection['copies']);
        [, $history]=$this->call('GET','/api/import-batches');self::assertNotContains($batch,array_map('intval',array_column($history['batches'],'id')));
        self::assertSame(200,$this->call('DELETE',"/api/import-batches/$batch")[0]);
        $this->setUp();self::assertSame(404,$this->call('DELETE',"/api/import-batches/$batch")[0]);
    }
    public function testDuplicatePhotosRemainTwoCopiesAndCommitIsIdempotent(): void {
        $batch = $this->batch(); $first = $this->upload($batch);
        self::assertSame($first['id'], $this->upload($batch)['id']);
        self::assertSame(409,$this->call('POST',"/api/import-batches/$batch/photos",[],'/fixtures/photos/puzzle-02.jpg','one')[0]);
        $second = $this->upload($batch, 'two'); self::assertNotSame($first['id'], $second['id']);
        $items = $this->review($batch); self::assertCount(2, $items);
        self::assertNotEmpty($items[1]['duplicates']['exact_photo']);
        foreach ($items as $item) {
            self::assertNull($item['fields']['release_year']);
            self::assertSame(422, $this->call('POST', '/api/import-items/'.$item['id'].'/approve')[0]);
            self::assertSame(200, $this->call('PATCH', '/api/import-items/'.$item['id'], ['reviewed'=>true])[0]);
            self::assertSame(200, $this->call('POST', '/api/import-items/'.$item['id'].'/approve')[0]);
        }
        self::assertSame(200, $this->call('POST', "/api/import-batches/$batch/commit")[0]);
        self::assertSame(200, $this->call('POST', "/api/import-batches/$batch/commit")[0]);
        [, $data] = $this->call('GET', '/api/collection');
        self::assertCount(2, $data['copies']);
        self::assertSame($data['copies'][0]['edition_id'], $data['copies'][1]['edition_id']);
        foreach ($data['copies'] as $copy) { self::assertSame('private', $copy['visibility']); self::assertNull($copy['box_condition']); self::assertNull($copy['seal_status']); self::assertNull($copy['completeness']); self::assertNotEmpty($copy['provenance']); }
        self::assertSame(409,$this->call('PATCH','/api/import-items/'.$first['id'],['title'=>'changed after import'])[0]);
    }
    public function testInvalidImagePartialFailureAndResume(): void {
        $batch = $this->batch(); $this->upload($batch);
        $bad = $this->upload($batch, 'bad', '/fixtures/puzzles.json');
        self::assertSame('failed', $bad['state']);
        self::assertNotEmpty($bad['error']);
        $this->upload($batch, 'bad', '/fixtures/photos/puzzle-02.jpg');
        $items = $this->review($batch); self::assertCount(2, $items);
        self::assertSame(['needs_review', 'needs_review'], array_column($items, 'state'));
        self::assertSame(200, $this->call('POST', '/api/import-items/'.$items[0]['id'].'/reject')[0]);
        [, $data] = $this->call('GET', "/api/import-batches/$batch"); self::assertSame(1, $data['summary']['rejected']);
    }
    public function testCommitRollbackPreservesApprovalAndCatalogueRelationships(): void {
        $batch = $this->batch(); $this->upload($batch); $item = $this->review($batch)[0];
        $this->call('PATCH', '/api/import-items/'.$item['id'], ['title'=>'Rollback '.bin2hex(random_bytes(6)), 'reviewed'=>true]);
        $this->call('POST', '/api/import-items/'.$item['id'].'/approve');
        $db = new PDO('mysql:host='.getenv('DB_HOST').';dbname='.getenv('DB_NAME'), getenv('DB_USER'), getenv('DB_PASSWORD'));
        $before = (int)$db->query('SELECT COUNT(*) FROM puzzles')->fetchColumn();
        $db->exec("CREATE TRIGGER fail_import_test BEFORE INSERT ON owned_copies FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Injected copy failure'");
        try { self::assertSame(500, $this->call('POST', "/api/import-batches/$batch/commit")[0]); }
        finally { $db->exec('DROP TRIGGER fail_import_test'); }
        self::assertSame($before, (int)$db->query('SELECT COUNT(*) FROM puzzles')->fetchColumn());
        [, $data] = $this->call('GET', "/api/import-batches/$batch"); self::assertSame('approved', $data['items'][0]['state']);
        self::assertSame(200, $this->call('POST', "/api/import-batches/$batch/commit")[0]);
    }
    public function testQuotaRejectsBeforeSavingFiles(): void {
        $batch=$this->batch();
        $db=Jigsaw\Database::connect(); $root=sys_get_temp_dir().'/quota-'.bin2hex(random_bytes(4));
        $service=new Jigsaw\ImportService($db,new Jigsaw\ImageStore($root),new Jigsaw\FixtureExtractor('/fixtures'));
        $previous=getenv('IMPORT_STORAGE_QUOTA_BYTES'); putenv('IMPORT_STORAGE_QUOTA_BYTES=1');
        try {
            $service->upload($batch,$this->user,'quota',['name'=>'photo.jpg','tmp_name'=>'/fixtures/photos/puzzle-01.jpg','error'=>0]);
            self::fail('Quota should reject this upload');
        } catch(Jigsaw\HttpError $e) { self::assertSame(413,$e->status); self::assertDirectoryDoesNotExist($root); }
        finally { $previous===false?putenv('IMPORT_STORAGE_QUOTA_BYTES'):putenv('IMPORT_STORAGE_QUOTA_BYTES='.$previous); }
    }
    public function testLoginResumesBatchesAndRejectsTruncatedPasswords(): void {
        $batch=$this->batch();
        [, $loggedOut]=$this->call('POST','/api/auth/logout'); $this->csrf=$loggedOut['csrf'];
        self::assertSame(401,$this->call('GET',"/api/import-batches/$batch")[0]);
        self::assertSame(422,$this->call('POST','/api/auth/login',['email'=>$this->email,'password'=>str_repeat('x',73)])[0]);
        [$status,$signedIn]=$this->call('POST','/api/auth/login',['email'=>$this->email,'password'=>'collector fixture password 123']);
        self::assertSame(200,$status); $this->csrf=$signedIn['csrf'];
        self::assertSame(200,$this->call('GET',"/api/import-batches/$batch")[0]);
    }
    public function testBatchCreationRetryIsIdempotent(): void {
        $key=bin2hex(random_bytes(16));
        [$status,$first]=$this->call('POST','/api/import-batches',['client_key'=>$key]); self::assertSame(201,$status);
        [$status,$second]=$this->call('POST','/api/import-batches',['client_key'=>$key]); self::assertSame(201,$status);
        self::assertSame($first['id'],$second['id']);
    }
    public function testPhotoReviewCornersStaleRequestsAndUntouchedOriginal(): void {
        $batch=$this->batch(); $item=$this->upload($batch); $id=$item['id'];
        [, $data]=$this->call('POST',"/api/import-batches/$batch/process"); $item=$data['items'][0];
        self::assertSame('image_review',$item['state']); self::assertNull($item['suggestion']);
        $revision=$item['preprocessing']['revision'];
        self::assertSame(422,$this->call('POST',"/api/import-items/$id/preprocessing/prepare",['revision'=>$revision,'corners'=>[[0,0],[1,1],[1,0],[0,1]]])[0]);
        [$status,$updated]=$this->call('POST',"/api/import-items/$id/preprocessing/prepare",['revision'=>$revision,'corners'=>[[.15,.12],[.87,.10],[.88,.89],[.14,.88]]]);
        self::assertSame(200,$status); self::assertTrue($updated['preprocessing']['manual']);
        self::assertNotSame($revision,$updated['preprocessing']['revision']);
        self::assertSame(409,$this->call('POST',"/api/import-items/$id/preprocessing/accept",['revision'=>$revision])[0]);
        self::assertSame(200,$this->call('GET',"/api/import-items/$id/processed-image")[0]);
        [,,$original]=$this->call('GET',"/api/import-items/$id/original");
        self::assertSame(hash_file('sha256','/fixtures/photos/puzzle-01.jpg'),hash('sha256',$original));
        self::assertSame(200,$this->call('POST',"/api/import-items/$id/preprocessing/reject",['revision'=>$updated['preprocessing']['revision']])[0]);
        [, $data]=$this->call('POST',"/api/import-batches/$batch/process");
        self::assertSame('needs_review',$data['items'][0]['state']); self::assertSame('rejected',$data['items'][0]['preprocessing']['decision']);
        self::assertNotNull($data['items'][0]['fields']['title']);
    }
    public function testManualOrientationSurvivesReprocessingAndManualZeroIsPreserved(): void {
        $batch=$this->batch(); $item=$this->upload($batch);
        [, $data]=$this->call('POST',"/api/import-batches/$batch/process"); $item=$data['items'][0]; $id=$item['id'];
        self::assertCount(4,$item['preprocessing']['orientation']['candidates']);
        $corners=$item['preprocessing']['corners'];
        [$status,$item]=$this->call('POST',"/api/import-items/$id/preprocessing/prepare",['corners'=>$corners,'revision'=>$item['preprocessing']['revision'],'rotation'=>90]);
        self::assertSame(200,$status); self::assertSame(90,$item['preprocessing']['orientation']['angle']);
        $revision=$item['preprocessing']['revision'];
        self::assertSame(422,$this->call('POST',"/api/import-items/$id/preprocessing/prepare",['revision'=>$revision,'rotation'=>45])[0]);
        [$status,$item]=$this->call('POST',"/api/import-items/$id/preprocessing/prepare",['revision'=>$revision]);
        self::assertSame(200,$status); self::assertSame('manual',$item['preprocessing']['orientation']['source']); self::assertSame(90,$item['preprocessing']['orientation']['angle']);
        self::assertSame(409,$this->call('POST',"/api/import-items/$id/preprocessing/prepare",['revision'=>$revision,'rotation'=>180])[0]);
        [$status,$item]=$this->call('POST',"/api/import-items/$id/preprocessing/prepare",['corners'=>$corners,'revision'=>$item['preprocessing']['revision'],'rotation'=>0]); self::assertSame(200,$status);
        [$status,$item]=$this->call('POST',"/api/import-items/$id/preprocessing/prepare",['corners'=>$corners,'revision'=>$item['preprocessing']['revision']]);
        self::assertSame(200,$status); self::assertSame(0,$item['preprocessing']['orientation']['angle']); self::assertSame('manual',$item['preprocessing']['orientation']['source']);
    }
    public function testStudioSettingsPreserveCorrectedPixelsCacheAndPrivateAccess(): void {
        $batch=$this->batch(); $item=$this->upload($batch); $id=$item['id'];
        [, $data]=$this->call('POST',"/api/import-batches/$batch/process"); $item=$data['items'][0];
        self::assertSame('ready',$item['preprocessing']['studio']['status']);
        self::assertSame(40,$item['preprocessing']['studio']['dimensions']['depth_mm']);
        self::assertFalse($item['preprocessing']['studio']['dimensions']['verified']);
        self::assertArrayNotHasKey('asset_key',$item['preprocessing']['studio']);
        [$status,,$front]=$this->call('GET',"/api/import-items/$id/processed-image"); self::assertSame(200,$status);
        [$status,,$studio]=$this->call('GET',"/api/import-items/$id/studio-image"); self::assertSame(200,$status); self::assertSame('image/webp',getimagesizefromstring($studio)['mime']);
        $settings=$item['preprocessing']['studio']['settings']; $settings['background']='dark';
        [$status,$item]=$this->call('POST',"/api/import-items/$id/preprocessing/studio",['revision'=>$item['preprocessing']['revision'],'settings'=>$settings]); self::assertSame(200,$status);
        self::assertSame($studio,$this->call('GET',"/api/import-items/$id/studio-image")[2],'Background-only changes must reuse transparent artwork');
        $revision=$item['preprocessing']['revision']; $settings['depth']='deep';
        [$status,$item]=$this->call('POST',"/api/import-items/$id/preprocessing/studio",['revision'=>$revision,'settings'=>$settings]); self::assertSame(200,$status);
        self::assertSame(55,$item['preprocessing']['studio']['dimensions']['depth_mm']);
        self::assertSame($front,$this->call('GET',"/api/import-items/$id/processed-image")[2]);
        self::assertSame(409,$this->call('POST',"/api/import-items/$id/preprocessing/studio",['revision'=>$revision,'settings'=>$settings])[0]);
        $settings['depth']='invalid'; self::assertSame(422,$this->call('POST',"/api/import-items/$id/preprocessing/studio",['revision'=>$item['preprocessing']['revision'],'settings'=>$settings])[0]);
        $settings['depth']='deep'; $previous=getenv('IMAGE_PROCESSOR_URL'); putenv('IMAGE_PROCESSOR_URL=http://127.0.0.1:9');
        try {
            $db=Jigsaw\Database::connect(); $service=new Jigsaw\PreprocessingService($db,new Jigsaw\ImageStore(getenv('PRIVATE_STORAGE_PATH')),new Jigsaw\PortablePreprocessor());
            $settings['view']='front';
            try { $service->studio($id,$this->user,$settings,$item['preprocessing']['revision']); self::fail('Offline renderer must fail safely'); }
            catch(Jigsaw\HttpError $error) { self::assertSame(503,$error->status); }
        } finally { $previous===false?putenv('IMAGE_PROCESSOR_URL'):putenv('IMAGE_PROCESSOR_URL='.$previous); }
        [, $data]=$this->call('GET',"/api/import-batches/$batch"); self::assertSame($item['preprocessing']['revision'],$data['items'][0]['preprocessing']['revision']);
        self::assertSame(hash_file('sha256','/fixtures/photos/puzzle-01.jpg'),hash('sha256',$this->call('GET',"/api/import-items/$id/original")[2]));
        $this->setUp(); self::assertSame(404,$this->call('GET',"/api/import-items/$id/studio-image")[0]); self::assertSame(404,$this->call('GET',"/api/import-items/$id/original-image")[0]);
    }
    public function testOptionalProcessorFailureCanKeepOriginalAndSharedHostingFallbackWorks(): void {
        $batch=$this->batch(); $item=$this->upload($batch); $db=Jigsaw\Database::connect();
        $bad=new class implements Jigsaw\PhotoPreprocessor { public function process(string $path,?array $corners=null,?int $rotation=null): array { throw new RuntimeException('Offline'); } };
        $service=new Jigsaw\PreprocessingService($db,new Jigsaw\ImageStore(getenv('PRIVATE_STORAGE_PATH')),$bad);
        $service->prepare($item['id'],$this->user,null,null,true);
        [, $data]=$this->call('GET',"/api/import-batches/$batch"); $failed=$data['items'][0];
        self::assertSame('failed',$failed['preprocessing']['status']);
        self::assertSame(422,$this->call('POST','/api/import-items/'.$item['id'].'/preprocessing/accept',['revision'=>$failed['preprocessing']['revision']])[0]);
        $portable=new Jigsaw\PreprocessingService($db,new Jigsaw\ImageStore(getenv('PRIVATE_STORAGE_PATH')),new Jigsaw\PortablePreprocessor());
        $portable->prepare($item['id'],$this->user,[[.15,.12],[.87,.10],[.88,.89],[.14,.88]],$failed['preprocessing']['revision']);
        [, $data]=$this->call('GET',"/api/import-batches/$batch"); self::assertSame('php-gd',$data['items'][0]['preprocessing']['engine']);
    }
}
