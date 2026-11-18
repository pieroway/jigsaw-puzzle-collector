<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use Jigsaw\{CopyPhotoService,CopyDeletionService,Database,ImageStore,HttpError,BatchDeletionService};
final class CopyPhotosIntegrationTest extends TestCase {
    public function testPhotosLimitOwnershipAndCleanup(): void {
        self::assertSame('jigsaw_test',getenv('DB_NAME'));
        $db=Database::connect();$store=new ImageStore(getenv('PRIVATE_STORAGE_PATH'));$service=new CopyPhotoService($db,$store);
        $db->prepare('INSERT INTO users(email,password_hash) VALUES (?,?)')->execute([bin2hex(random_bytes(8)).'@photos.test','unused']);$owner=(int)$db->lastInsertId();
        $db->exec("INSERT INTO puzzles(title) VALUES ('Photo test')");$puzzle=(int)$db->lastInsertId();
        $db->prepare('INSERT INTO editions(puzzle_id) VALUES (?)')->execute([$puzzle]);$edition=(int)$db->lastInsertId();
        $db->prepare('INSERT INTO owned_copies(user_id,edition_id) VALUES (?,?)')->execute([$owner,$edition]);$copy=(int)$db->lastInsertId();
        $path=tempnam(sys_get_temp_dir(),'photo');$image=imagecreatetruecolor(32,32);imagejpeg($image,$path);imagedestroy($image);
        $file=['name'=>'box.jpg','tmp_name'=>$path,'error'=>0];$keys=[];
        try {
            for($i=0;$i<8;$i++)$photos=$service->change($copy,$owner,null,'POST',$file);
            self::assertCount(8,$photos);
            $keys=$db->query('SELECT storage_key FROM private_images WHERE user_id='.$owner)->fetchAll(PDO::FETCH_COLUMN);
            try{$service->change($copy,$owner,null,'POST',$file);self::fail('Ninth photo accepted');}catch(HttpError $e){self::assertSame(422,$e->status);}
            try{$service->listing($copy,$owner+1);self::fail('Foreign copy read');}catch(HttpError $e){self::assertSame(404,$e->status);}
            try{$service->image($copy,$owner+1,$photos[0]['id']);self::fail('Foreign image read');}catch(HttpError $e){self::assertSame(404,$e->status);}
            self::assertFileExists($service->image($copy,$owner,$photos[0]['id']));
            $photos=$service->change($copy,$owner,$photos[0]['id'],'DELETE');self::assertCount(7,$photos);
            $sourceImage=(int)$db->query('SELECT image_id FROM copy_photos WHERE copy_id='.$copy.' LIMIT 1')->fetchColumn();
            $db->prepare('UPDATE owned_copies SET image_id=? WHERE id=?')->execute([$sourceImage,$copy]);
            self::assertCount(8,$service->listing($copy,$owner));
            try{$service->change($copy,$owner,'original','DELETE');self::fail('Cover deletion accepted');}catch(HttpError $e){self::assertSame(422,$e->status);}
            self::assertCount(8,$service->listing($copy,$owner));
            self::assertSame($sourceImage,(int)$db->query('SELECT image_id FROM owned_copies WHERE id='.$copy)->fetchColumn());
            $revision=(int)$db->query('SELECT edit_revision FROM owned_copies WHERE id='.$copy)->fetchColumn();
            (new CopyDeletionService($db))->delete($copy,$owner,['revision'=>$revision]);
            self::assertSame(0,(new BatchDeletionService($db,$store))->cleanup($owner));
            self::assertSame(0,(int)$db->query('SELECT COUNT(*) FROM private_images WHERE user_id='.$owner)->fetchColumn());
            foreach($keys as $key){self::assertFileDoesNotExist($store->path($key).'.jpg');self::assertFileDoesNotExist($store->path($key).'.original');}
        } finally {unlink($path);}
    }
}
