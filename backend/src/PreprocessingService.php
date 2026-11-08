<?php
declare(strict_types=1);
namespace Jigsaw;
use PDO;
final class PreprocessingService {
    public function __construct(private PDO $db,private ImageStore $store,private PhotoPreprocessor $processor) {}
    public static function configured(PDO $db,ImageStore $store): self {
        $url=getenv('IMAGE_PROCESSOR_URL');
        return new self($db,$store,$url?new OpenCvPreprocessor($url,getenv('PROCESSOR_KEY') ?: ''):new PortablePreprocessor());
    }
    private function query(string $sql,array $args=[]): \PDOStatement { $q=$this->db->prepare($sql); $q->execute($args); return $q; }
    private function lock(int $id,int $owner): array {
        $this->query('SELECT id FROM users WHERE id=? FOR UPDATE',[$owner]);
        $item=$this->query("SELECT i.* FROM import_items i JOIN import_batches b ON b.id=i.batch_id WHERE i.id=? AND b.user_id=? AND (b.deleted_at IS NULL OR i.state='imported') FOR UPDATE",[$id,$owner])->fetch();
        if(!$item) throw new HttpError(404,'Import item not found');
        if(in_array($item['state'],['imported','rejected'],true)) throw new HttpError(409,'This image review is closed.');
        return $item;
    }
    private function remove(?string $key): void {
        if(!$key) return;
        foreach(['source','catalogue','thumbnail'] as $name) { $path=$this->store->path($key).'.'.$name.'.jpg'; if(is_file($path)) unlink($path); }
        $this->removeStudio($key);
    }
    private function removeStudio(?string $key): void {
        if(!$key) return;
        foreach(['studio','studio-thumbnail'] as $name) { $path=$this->store->path($key).'.'.$name.'.webp'; if(is_file($path)) unlink($path); }
    }
    private function saveStudio(array $studio,string $key): array {
        if($studio['status']!=='ready') return $studio;
        foreach(['presentation'=>'studio','thumbnail'=>'studio-thumbnail'] as $field=>$name) {
            $path=$this->store->path($key).'.'.$name.'.webp';
            if(file_put_contents($path,$studio[$field],LOCK_EX)!==strlen($studio[$field])) throw new \RuntimeException('Cannot save studio image');
            chmod($path,0600); unset($studio[$field]);
        }
        $studio['asset_key']=$key; return $studio;
    }
    public function prepare(int $id,int $owner,?array $corners=null,?string $revision=null,bool $automatic=false,?int $rotation=null): void {
        if($corners!==null) $corners=CornerGeometry::validate($corners);
        if($rotation!==null&&!in_array($rotation,[0,90,180,270],true)) throw new HttpError(422,'Choose a quarter-turn rotation.');
        $saved=null; $oldKey=null; $this->db->beginTransaction();
        try {
            $item=$this->lock($id,$owner); $old=json_decode($item['preprocessing'] ?? 'null',true);
            if($automatic&&$old) { $this->db->commit(); return; }
            if(!$automatic && ($old['revision'] ?? null)!==$revision) throw new HttpError(409,'Image changed. Refresh this batch before editing corners.');
            // A manual zero is a real override, not the absence of a correction.
            if($rotation===null&&($old['orientation']['source'] ?? '')==='manual') $rotation=$old['orientation']['angle'];
            $image=$this->query('SELECT * FROM private_images WHERE id=? AND user_id=?',[$item['image_id'],$owner])->fetch();
            if(!$image) throw new HttpError(422,'Upload a photograph first.');
            $source=$this->store->path($image['storage_key']).'.original';
            try {
                if(!hash_equals($image['sha256'],hash_file('sha256',$source))) throw new \RuntimeException('Original photo checksum mismatch');
                $result=$this->processor->process($source,$corners,$rotation);
            } catch(\Throwable $e) {
                if($old && ($old['status'] ?? '')==='ready') throw new HttpError(503,'Image processing could not finish. Your previous image and original are safe; retry.');
                $metadata=['status'=>'failed','decision'=>'pending','revision'=>bin2hex(random_bytes(8)),'error'=>'Image processing failed. Retry processing or keep the original.','corners'=>[[0,0],[1,0],[1,1],[0,1]],'confidence'=>0,'warnings'=>[]];
                if($rotation!==null) $metadata['orientation']=['source'=>'manual','angle'=>$rotation,'ambiguous'=>false,'candidates'=>[],'reason'=>'Saved manual rotation; retry processing to apply it.'];
                $this->query("UPDATE import_items SET state='failed',preprocessing=?,error=?,reviewed=0,approved_at=NULL WHERE id=?",[json_encode($metadata),$metadata['error'],$id]);
                $this->db->commit(); return;
            }
            $settings=StudioRenderer::settings($old['studio']['settings'] ?? []);
            try { $studio=$result['engine']==='php-gd'?['status'=>'unavailable','settings'=>$settings,'bytes'=>0,'error'=>'Studio rendering needs the optional processor. Use the corrected front.']:StudioRenderer::generate($result['catalogue'],$settings); }
            catch(\Throwable $e) { $studio=['status'=>'failed','settings'=>$settings,'bytes'=>0,'error'=>'Studio rendering failed. Retry presentation or use the corrected front.']; }
            $bytes=strlen($result['source'])+strlen($result['catalogue'])+strlen($result['thumbnail'])+$studio['bytes'];
            $previousBytes=(int)($old['derivative_bytes'] ?? 0);
            $used=(int)$this->query('SELECT COALESCE(SUM(bytes),0) FROM private_images WHERE user_id=?',[$owner])->fetchColumn();
            if($used+$bytes-$previousBytes>(int)(getenv('IMPORT_STORAGE_QUOTA_BYTES') ?: 1073741824)) throw new HttpError(413,'Not enough private storage for processed images.');
            $saved=bin2hex(random_bytes(24));
            $studio=$this->saveStudio($studio,$saved);
            foreach(['source','catalogue','thumbnail'] as $field) {
                $path=$this->store->path($saved).'.'.$field.'.jpg';
                if(file_put_contents($path,$result[$field],LOCK_EX)!==strlen($result[$field])) throw new \RuntimeException('Cannot store processed photo');
                chmod($path,0600); unset($result[$field]);
            }
            $oldKey=$old['asset_key'] ?? null;
            $metadata=[...$result,'studio'=>$studio,'algorithm_version'=>$result['version'],'status'=>'ready','decision'=>'pending','revision'=>bin2hex(random_bytes(8)),'asset_key'=>$saved,'derivative_bytes'=>$bytes,'source_sha256'=>$image['sha256'],'error'=>null];
            $this->query('UPDATE private_images SET bytes=bytes+? WHERE id=?',[$bytes-$previousBytes,$image['id']]);
            $this->query("UPDATE import_items SET preprocessing=?,state='image_review',reviewed=0,approved_at=NULL,error=NULL WHERE id=?",[json_encode($metadata,JSON_THROW_ON_ERROR),$id]);
            $this->query("INSERT INTO import_events(item_id,user_id,action,payload) VALUES (?,?,'image_preprocessed',?)",[$id,$owner,json_encode($metadata)]);
            $this->db->commit(); $saved=null; $this->remove($oldKey);
            if(($old['studio']['asset_key'] ?? null)!==$oldKey) $this->removeStudio($old['studio']['asset_key'] ?? null);
        } catch(\Throwable $e) { if($this->db->inTransaction()) $this->db->rollBack(); $this->remove($saved); throw $e; }
    }
    public function studio(int $id,int $owner,array $input,string $revision): void {
        $settings=StudioRenderer::settings($input); $saved=null; $replaced=false; $this->db->beginTransaction();
        try {
            $item=$this->lock($id,$owner); $meta=json_decode($item['preprocessing'] ?? 'null',true);
            if(!$meta||$meta['status']!=='ready'||$meta['revision']!==$revision) throw new HttpError(409,'Refresh and review the current corrected photo first.');
            $jpeg=file_get_contents($this->store->path($meta['asset_key']).'.catalogue.jpg');
            $old=$meta['studio'] ?? []; $signature=StudioRenderer::signature($jpeg,$settings);
            if(($old['status'] ?? '')==='ready'&&($old['signature'] ?? '')===$signature) { $studio=[...$old,'settings'=>$settings]; }
            else {
                $replaced=true;
                $studio=StudioRenderer::generate($jpeg,$settings);
                $delta=$studio['bytes']-($old['bytes'] ?? 0);
                $used=(int)$this->query('SELECT COALESCE(SUM(bytes),0) FROM private_images WHERE user_id=?',[$owner])->fetchColumn();
                if($used+$delta>(int)(getenv('IMPORT_STORAGE_QUOTA_BYTES') ?: 1073741824)) throw new HttpError(413,'Not enough private storage for studio images.');
                if($studio['status']==='ready') { $saved=bin2hex(random_bytes(24)); $studio=$this->saveStudio($studio,$saved); }
                $this->query('UPDATE private_images SET bytes=bytes+? WHERE id=?',[$delta,$item['image_id']]);
                $meta['derivative_bytes']+=$delta;
            }
            $meta['studio']=$studio; $meta['revision']=bin2hex(random_bytes(8));
            // Presentation settings are independent of corrected pixels and identity approval.
            $this->query('UPDATE import_items SET preprocessing=? WHERE id=?',[json_encode($meta,JSON_THROW_ON_ERROR),$id]);
            $this->query("INSERT INTO import_events(item_id,user_id,action,payload) VALUES (?,?,'studio_settings',?)",[$id,$owner,json_encode($settings)]);
            $this->db->commit(); $newKey=$saved; $saved=null;
            if($replaced&&($old['asset_key'] ?? null)!==$newKey) $this->removeStudio($old['asset_key'] ?? null);
        } catch(\Throwable $e) { if($this->db->inTransaction()) $this->db->rollBack(); $this->removeStudio($saved); throw $e; }
    }
    public function decide(int $id,int $owner,string $decision,string $revision): void {
        if(!in_array($decision,['accepted','rejected'],true)) throw new HttpError(422,'Choose processed or original.');
        $this->db->beginTransaction();
        try {
            $item=$this->lock($id,$owner); $metadata=json_decode($item['preprocessing'] ?? 'null',true);
            if(!$metadata||$metadata['revision']!==$revision) throw new HttpError(409,'Image changed. Refresh and review the latest proposal.');
            if($decision==='accepted'&&$metadata['status']!=='ready') throw new HttpError(422,'No processed image is available.');
            if($metadata['decision']===$decision) { $this->db->commit(); return; }
            $metadata['decision']=$decision;
            $this->query("UPDATE import_items SET preprocessing=?,state='queued',reviewed=0,approved_at=NULL,error=NULL WHERE id=?",[json_encode($metadata),$id]);
            $this->query("INSERT INTO import_events(item_id,user_id,action,payload) VALUES (?,?,'image_decision',?)",[$id,$owner,json_encode(['decision'=>$decision,'revision'=>$revision])]);
            $this->db->commit();
        } catch(\Throwable $e) { if($this->db->inTransaction()) $this->db->rollBack(); throw $e; }
    }
    public function selectedPath(array $item,array $image): string {
        $metadata=json_decode($item['preprocessing'] ?? 'null',true);
        if(($metadata['decision'] ?? '')==='accepted') return $this->store->path($metadata['asset_key']).'.catalogue.jpg';
        return isset($metadata['asset_key'])?$this->store->path($metadata['asset_key']).'.source.jpg':$this->store->path($image['storage_key']).'.original';
    }
}
