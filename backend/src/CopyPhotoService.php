<?php
declare(strict_types=1);
namespace Jigsaw;
use PDO;
final class CopyPhotoService {
    public function __construct(private PDO $db,private ImageStore $store) {}
    private function query(string $sql,array $args=[]): \PDOStatement {$q=$this->db->prepare($sql);$q->execute($args);return $q;}
    private function copy(int $id,int $owner): array {
        $copy=$this->query('SELECT * FROM owned_copies WHERE id=? AND user_id=?',[$id,$owner])->fetch();
        if(!$copy)throw new HttpError(404,'Copy not found');return $copy;
    }
    public function listing(int $id,int $owner): array {
        $copy=$this->copy($id,$owner);$photos=[];
        if($copy['image_id'])$photos[]=['id'=>'original','image_url'=>'/api/import-items/'.$copy['import_item_id'].'/original-image','original'=>true];
        foreach($this->query('SELECT id FROM copy_photos WHERE copy_id=? ORDER BY id',[$id])->fetchAll() as $photo)$photos[]=['id'=>(string)$photo['id'],'image_url'=>"/api/collection-copies/$id/photos/".$photo['id'].'/image','original'=>false];
        return $photos;
    }
    public function change(int $id,int $owner,?string $photo,string $method,?array $file=null): array {
        $saved=null;$this->db->beginTransaction();
        try {
            $this->query('SELECT id FROM users WHERE id=? FOR UPDATE',[$owner]);$copy=$this->copy($id,$owner);
            if($method==='POST') {
                $count=(int)$this->query('SELECT COUNT(*) FROM copy_photos WHERE copy_id=?',[$id])->fetchColumn()+($copy['image_id']?1:0);
                if($count>=8)throw new HttpError(422,'Each box can have up to 8 photos. Remove a photo before adding another.');
                if(!$file||($file['error']??1)!==UPLOAD_ERR_OK)throw new HttpError(422,'Choose a photo up to 12 MB.');
                $meta=$this->store->inspect($file['tmp_name'],$file['name'],false);
                $used=(int)$this->query('SELECT COALESCE(SUM(bytes),0) FROM private_images WHERE user_id=?',[$owner])->fetchColumn();
                if($used+$meta['bytes']+1048576>(int)(getenv('IMPORT_STORAGE_QUOTA_BYTES')?:1073741824))throw new HttpError(413,'Your private photo storage is full.');
                $saved=bin2hex(random_bytes(24));$this->store->save($file['tmp_name'],$saved);
                $this->query('INSERT INTO private_images(user_id,storage_key,sha256,original_name,mime,bytes,width,height) VALUES (?,?,?,?,?,?,?,?)',[$owner,$saved,$meta['sha256'],$file['name'],$meta['mime'],$meta['bytes']+filesize($this->store->path($saved).'.jpg'),$meta['width'],$meta['height']]);
                $this->query("INSERT INTO copy_photos(copy_id,image_id,name) VALUES (?, ?, '')",[$id,(int)$this->db->lastInsertId()]);
            } else {
                if($photo==='original')throw new HttpError(422,'The cover photo and its corrected and studio versions cannot be deleted.');
                $row=$this->query('SELECT * FROM copy_photos WHERE id=? AND copy_id=?',[$photo,$id])->fetch();
                if(!$row)throw new HttpError(404,'Photo not found');
                $this->query('DELETE FROM copy_photos WHERE id=?',[$photo]);
                (new PhotoCleanupQueue($this->db))->remember((int)$row['image_id'],$owner,[]);
            }
            $this->query('UPDATE owned_copies SET edit_revision=edit_revision+1 WHERE id=?',[$id]);
            $result=$this->listing($id,$owner);$this->db->commit();return $result;
        }catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();if($saved)$this->store->remove($saved);throw $e;}
    }
    public function image(int $id,int $owner,string $photo): string {
        $this->copy($id,$owner);
        $key=$this->query('SELECT p.storage_key FROM copy_photos c JOIN private_images p ON p.id=c.image_id WHERE c.copy_id=? AND c.id=? AND p.user_id=?',[$id,$photo,$owner])->fetchColumn();
        if(!$key)throw new HttpError(404,'Photo not found');return $this->store->path($key).'.jpg';
    }
}
