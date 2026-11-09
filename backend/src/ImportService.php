<?php
declare(strict_types=1);
namespace Jigsaw;
use PDO;
final class ImportService {
    public function __construct(private PDO $db, private ImageStore $store, private ExtractionProvider $extractor) {}
    private function query(string $sql, array $args=[]): \PDOStatement { $q=$this->db->prepare($sql); $q->execute($args); return $q; }
    public function batch(int $id, int $owner, bool $lock=false): array {
        $row=$this->query('SELECT * FROM import_batches WHERE id=? AND user_id=? AND deleted_at IS NULL'.($lock?' FOR UPDATE':''),[$id,$owner])->fetch();
        if (!$row) throw new HttpError(404,'Batch not found'); return $row;
    }
    private function item(int $id,int $owner,bool $lock=false): array {
        $row=$this->query('SELECT i.* FROM import_items i JOIN import_batches b ON b.id=i.batch_id WHERE i.id=? AND b.user_id=?'.($lock?' FOR UPDATE':''),[$id,$owner])->fetch();
        if (!$row) throw new HttpError(404,'Import item not found'); return $row;
    }
    private function event(int $id,int $owner,string $action,array $payload=[]): void {
        $this->query('INSERT INTO import_events(item_id,user_id,action,payload) VALUES (?,?,?,?)',[$id,$owner,$action,json_encode($payload,JSON_THROW_ON_ERROR)]);
    }
    private function transaction(callable $work): mixed {
        $this->db->beginTransaction();
        try { $result=$work(); $this->db->commit(); return $result; }
        catch (\Throwable $e) { if ($this->db->inTransaction()) $this->db->rollBack(); throw $e; }
    }
    public static function key(mixed $key): string {
        if (!is_string($key)||!preg_match('/^[a-zA-Z0-9_-]{1,80}$/D',$key)) throw new HttpError(422,'A valid client retry key is required'); return $key;
    }
    public function create(int $owner,string $key): array {
        $this->query('INSERT INTO import_batches(user_id,client_key) VALUES (?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',[$owner,self::key($key)]);
        return $this->batch((int)$this->db->lastInsertId(),$owner);
    }
    public function batches(int $owner): array { return $this->query('SELECT id,created_at FROM import_batches WHERE user_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 100',[$owner])->fetchAll(); }
    public function upload(int $batch,int $owner,string $key,array $file): array {
        self::key($key); $saved=null;
        try {
            $id=$this->transaction(function() use($batch,$owner,$key,$file,&$saved) {
                $this->query('SELECT id FROM users WHERE id=? FOR UPDATE',[$owner]); $this->batch($batch,$owner,true);
                // Owner and batch locks already serialize retries in this batch. A locking
                // missing-key lookup adds gap locks that can deadlock unrelated uploads.
                $existing=$this->query('SELECT * FROM import_items WHERE batch_id=? AND client_key=?',[$batch,$key])->fetch();
                $name=(string)($file['name'] ?? 'photo');
                try {
                    if (($file['error'] ?? UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK) throw new \InvalidArgumentException('Upload interrupted or too large. Select the file again to retry (12 MB maximum).');
                    $meta=$this->store->inspect($file['tmp_name'],$name);
                } catch (\InvalidArgumentException $e) {
                    if ($existing && $existing['state']!=='failed') throw new HttpError(409,'This retry key already has a saved photo');
                    if (!$existing) {
                        $this->checkBatchLimit($batch);
                        $this->query("INSERT INTO import_items(batch_id,client_key,filename,state,error) VALUES (?,?,?,'failed',?)",[$batch,$key,mb_substr(basename(str_replace('\\','/',$name)),0,255),$e->getMessage()]);
                        $id=(int)$this->db->lastInsertId();
                    } else { $id=(int)$existing['id']; $this->query('UPDATE import_items SET error=? WHERE id=?',[$e->getMessage(),$id]); }
                    $this->event($id,$owner,'upload_failed',['error'=>$e->getMessage()]); return $id;
                }
                if ($existing && $existing['state']!=='failed') {
                    $hash=$this->query('SELECT sha256 FROM private_images WHERE id=?',[$existing['image_id']])->fetchColumn();
                    if (!hash_equals($hash,$meta['sha256'])) throw new HttpError(409,'Retry key belongs to another photo. Choose a new upload.');
                    return (int)$existing['id'];
                }
                if (!$existing) $this->checkBatchLimit($batch);
                $used=(int)$this->query('SELECT COALESCE(SUM(bytes),0) FROM private_images WHERE user_id=?',[$owner])->fetchColumn();
                $quota=(int)(getenv('IMPORT_STORAGE_QUOTA_BYTES') ?: 1073741824);
                // Reserve thumbnail overhead as well as the original when enforcing quota.
                if ($used+$meta['bytes']+1048576>$quota) throw new HttpError(413,'Your private photo storage is full. Contact the administrator or reduce photo sizes.');
                $saved=bin2hex(random_bytes(24)); $this->store->save($file['tmp_name'],$saved);
                $bytes=$meta['bytes']+filesize($this->store->path($saved).'.jpg');
                $this->query('INSERT INTO private_images(user_id,storage_key,sha256,original_name,mime,bytes,width,height) VALUES (?,?,?,?,?,?,?,?)',[$owner,$saved,$meta['sha256'],$name,$meta['mime'],$bytes,$meta['width'],$meta['height']]);
                $image=(int)$this->db->lastInsertId();
                if ($existing) {
                    if ($existing['image_id']) throw new HttpError(409,'Use the processing retry for an already stored photo');
                    $id=(int)$existing['id']; $this->query("UPDATE import_items SET state='queued', image_id=?, error=NULL,filename=? WHERE id=?",[$image,$name,$id]);
                } else {
                    $this->query('INSERT INTO import_items(batch_id,client_key,filename,image_id) VALUES (?,?,?,?)',[$batch,$key,$name,$image]); $id=(int)$this->db->lastInsertId();
                }
                $this->event($id,$owner,'uploaded',['image_id'=>$image,'sha256'=>$meta['sha256']]); return $id;
            });
        } catch (\Throwable $e) { if ($saved) $this->store->remove($saved); throw $e; }
        return $this->serialize($this->item($id,$owner),$owner);
    }
    private function checkBatchLimit(int $batch): void {
        if ((int)$this->query('SELECT COUNT(*) FROM import_items WHERE batch_id=?',[$batch])->fetchColumn()>=100) throw new HttpError(413,'This batch has 100 photos. Start another batch to continue.');
    }
    public function process(int $batch,int $owner): array {
        $this->batch($batch,$owner);
        $item=$this->query("SELECT * FROM import_items WHERE batch_id=? AND state IN ('queued','processing') ORDER BY id LIMIT 1",[$batch])->fetch();
        if(!$item) return $this->status($batch,$owner);
        $preprocessing=PreprocessingService::configured($this->db,$this->store);
        if(!$item['preprocessing']) {
            $preprocessing->prepare((int)$item['id'],$owner,null,null,true);
            return $this->status($batch,$owner);
        }
        $this->transaction(function() use($item,$owner,$preprocessing) {
            $item=$this->item((int)$item['id'],$owner,true);
            if(!in_array($item['state'],['queued','processing'],true)) return;
            $photo=json_decode($item['preprocessing'],true);
            if(($photo['decision'] ?? 'pending')==='pending') {
                $this->query("UPDATE import_items SET state='image_review' WHERE id=?",[$item['id']]); return;
            }
            $this->query("UPDATE import_items SET state='processing' WHERE id=?",[$item['id']]);
            $image=$this->query('SELECT * FROM private_images WHERE id=? AND user_id=?',[$item['image_id'],$owner])->fetch();
            try {
                $suggestion=$this->extractor->extract($preprocessing->selectedPath($item,$image),$image['sha256']);
                $fields=ImportRules::fields([...$suggestion,...json_decode($item['human_edits'] ?? '{}',true)]);
                $this->query("UPDATE import_items SET state='needs_review',suggestion=?,fields=?,identity_key=?,error=NULL WHERE id=?",[json_encode($suggestion),json_encode($fields),ImportRules::identity($fields),$item['id']]);
                $this->event((int)$item['id'],$owner,'extracted',[...$suggestion,'preprocessing_revision'=>$photo['revision'],'image_decision'=>$photo['decision']]);
            } catch(\Throwable $e) {
                $this->query("UPDATE import_items SET state='failed',error=? WHERE id=?",['Could not identify this image. Retry identification or contact the administrator.',$item['id']]);
                $this->event((int)$item['id'],$owner,'extraction_failed');
            }
        });
        return $this->status($batch,$owner);
    }
    public function photoAction(int $id,int $owner,string $action,array $data): array {
        $this->item($id,$owner);
        $revision=$data['revision'] ?? null;
        if($revision!==null&&!is_string($revision)) throw new HttpError(422,'Invalid image revision');
        $processor=PreprocessingService::configured($this->db,$this->store);
        if($action==='studio') {
            if(!is_array($data['settings'] ?? null)) throw new HttpError(422,'Studio settings are required.');
            $processor->studio($id,$owner,$data['settings'],$revision ?? '');
        } elseif($action==='prepare') {
            $corners=$data['corners'] ?? null;
            if($corners!==null&&!is_array($corners)) throw new HttpError(422,'Four corners are required');
            $rotation=$data['rotation'] ?? null;
            if($rotation!==null&&(!is_int($rotation)||!in_array($rotation,[0,90,180,270],true))) throw new HttpError(422,'Rotation must be 0, 90, 180 or 270 clockwise degrees.');
            $processor->prepare($id,$owner,$corners,$revision,false,$rotation);
        } else $processor->decide($id,$owner,$action==='accept'?'accepted':'rejected',$revision ?? '');
        return $this->serialize($this->item($id,$owner),$owner);
    }
    public function edit(int $id,int $owner,array $data): array {
        $this->transaction(function() use($id,$owner,$data) {
            $row=$this->item($id,$owner,true);
            if (!in_array($row['state'],['needs_review','approved'],true)) throw new HttpError(409,'Only reviewable items can be edited');
            $previous=json_decode($row['fields'],true); $input=array_intersect_key($data,array_flip(['title','manufacturer','pieces','product_number','release_year']));
            $fields=ImportRules::fields([...$previous,...$input]);
            $link=$data['linked_edition_id'] ?? null;
            if ($link!==null) {
                if (!is_int($link)) throw new HttpError(422,'Choose a valid edition');
                $this->edition($link,$owner);
            }
            $reviewed=$data['reviewed'] ?? false;
            if (!is_bool($reviewed)) throw new HttpError(422,'Review confirmation must be true or false');
            $edits=json_decode($row['human_edits'] ?? '{}',true);
            foreach ($input as $k=>$v) $edits[$k]=$fields[$k];
            $this->query("UPDATE import_items SET fields=?,human_edits=?,reviewed=?,linked_edition_id=?,identity_key=?,state='needs_review',approved_at=NULL WHERE id=?",[json_encode($fields),json_encode($edits),(int)$reviewed,$link,ImportRules::identity($fields),$id]);
            $this->event($id,$owner,'edited',['fields'=>$fields,'human_edits'=>$edits,'reviewed'=>$reviewed,'linked_edition_id'=>$link]);
        }); return $this->serialize($this->item($id,$owner),$owner);
    }
    private function edition(int $id,int $owner): array {
        $row=$this->query("SELECT e.*,p.title,p.visibility,p.catalogue_verified FROM editions e JOIN puzzles p ON p.id=e.puzzle_id WHERE e.id=? AND (p.owner_id=? OR (p.visibility='public' AND p.catalogue_verified=1))",[$id,$owner])->fetch();
        if (!$row) throw new HttpError(404,'Edition not found or not available to your collection'); return $row;
    }
    public function action(int $id,int $owner,string $action): array {
        $this->transaction(function() use($id,$owner,$action) {
            $row=$this->item($id,$owner,true);
            $target=['approve'=>'approved','reject'=>'rejected','retry'=>'queued'][$action] ?? '';
            if ($row['state']===$target) return;
            if (!ImportRules::canTransition($row['state'],$target)) throw new HttpError(409,'This item cannot perform that action');
            if ($action==='approve') {
                $fields=json_decode($row['fields'],true);
                if (!$row['reviewed'] || !$fields['title']) throw new HttpError(422,'Review the photo and provide a title before approving');
            }
            if ($action==='retry'&&!$row['image_id']) throw new HttpError(422,'Select this photo again to retry its upload');
            $this->query('UPDATE import_items SET state=?,error=NULL,approved_at=IF(?=\'approved\',UTC_TIMESTAMP(),NULL) WHERE id=?',[$target,$target,$id]);
            $this->event($id,$owner,$action,['fields'=>json_decode($row['fields'] ?? '{}',true)]);
        }); return $this->serialize($this->item($id,$owner),$owner);
    }
    public function approveReviewed(int $batch,int $owner): array {
        $this->batch($batch,$owner); $errors=[];
        $ids=$this->query("SELECT id FROM import_items WHERE batch_id=? AND state='needs_review' AND reviewed=1 ORDER BY id LIMIT 100",[$batch])->fetchAll(PDO::FETCH_COLUMN);
        foreach ($ids as $id) { try { $this->action((int)$id,$owner,'approve'); } catch (HttpError $e) { $errors[]=['id'=>(int)$id,'error'=>$e->getMessage()]; } }
        return [...$this->status($batch,$owner),'errors'=>$errors];
    }
    public function commit(int $batch,int $owner): array {
        $this->transaction(function() use($batch,$owner) {
            $this->query('SELECT id FROM users WHERE id=? FOR UPDATE',[$owner]); $this->batch($batch,$owner,true);
            $items=$this->query("SELECT * FROM import_items WHERE batch_id=? AND state='approved' ORDER BY id LIMIT 10 FOR UPDATE",[$batch])->fetchAll();
            foreach ($items as $item) {
                $fields=json_decode($item['fields'],true); $candidate=ImportRules::identity($fields);
                $identity=$candidate?hash('sha256',$candidate.'|'.($fields['release_year'] ?? 'unknown')):null;
                if ($item['linked_edition_id']) $edition=(int)$this->edition((int)$item['linked_edition_id'],$owner)['id'];
                else {
                    $edition=$identity ? $this->query('SELECT id FROM editions WHERE owner_id=? AND identity_key=?',[$owner,$identity])->fetchColumn() : false;
                    if (!$edition) {
                        $this->query("INSERT INTO puzzles(title,owner_id,visibility,catalogue_verified) VALUES (?,?,'private',0)",[$fields['title'],$owner]); $puzzle=(int)$this->db->lastInsertId();
                        $this->query('INSERT INTO editions(puzzle_id,manufacturer,sku,release_year,piece_count,owner_id,identity_key,candidate_key) VALUES (?,?,?,?,?,?,?,?)',[$puzzle,$fields['manufacturer'],$fields['product_number'],$fields['release_year'],$fields['pieces'],$owner,$identity,$candidate]); $edition=(int)$this->db->lastInsertId();
                    }
                }
                $provenance=['import_item_id'=>(int)$item['id'],'image_id'=>(int)$item['image_id'],'preprocessing'=>json_decode($item['preprocessing'] ?? 'null',true),'suggestion'=>json_decode($item['suggestion'],true),'human_edits'=>json_decode($item['human_edits'] ?? '{}',true),'approved_fields'=>$fields,'approved_at'=>$item['approved_at'],'approved_by'=>$owner,'catalogue_verified'=>false];
                $this->query("INSERT INTO owned_copies(user_id,edition_id,visibility,import_item_id,image_id,provenance) VALUES (?,?,'private',?,?,?)",[$owner,$edition,$item['id'],$item['image_id'],json_encode($provenance)]);
                $copy=(int)$this->db->lastInsertId(); $this->query("UPDATE import_items SET state='imported' WHERE id=?",[$item['id']]);
                $this->event((int)$item['id'],$owner,'imported',['copy_id'=>$copy,'edition_id'=>(int)$edition]);
            }
        }); return $this->status($batch,$owner);
    }
    private function serialize(array $row,int $owner): array {
        foreach (['suggestion','fields','human_edits'] as $key) $row[$key]=json_decode($row[$key] ?? 'null',true);
        $row['preprocessing']=json_decode($row['preprocessing'] ?? 'null',true);
        if($row['preprocessing']) {
            unset($row['preprocessing']['asset_key'],$row['preprocessing']['derivative_bytes']);
            if(isset($row['preprocessing']['studio'])) unset($row['preprocessing']['studio']['asset_key'],$row['preprocessing']['studio']['bytes']);
            $row['preprocessing']['requires_review']=$row['preprocessing']['decision']==='pending';
            $row['preprocessing']['low_confidence']=($row['preprocessing']['status'] ?? '')==='ready'&&!($row['preprocessing']['manual'] ?? false)&&$row['preprocessing']['confidence']<.65;
        }
        $row['id']=(int)$row['id']; $row['batch_id']=(int)$row['batch_id']; $row['reviewed']=(bool)$row['reviewed'];
        $row['linked_edition_id']=$row['linked_edition_id']===null?null:(int)$row['linked_edition_id'];
        $row['image_url']=$row['image_id']?'/api/import-items/'.$row['id'].'/image':null;
        $row['source_image_url']=$row['image_id']?'/api/import-items/'.$row['id'].'/source-image':null;
        $row['processed_image_url']=($row['preprocessing']['status'] ?? '')==='ready'?'/api/import-items/'.$row['id'].'/processed-image?v='.$row['preprocessing']['revision']:null;
        $row['studio_image_url']=($row['preprocessing']['studio']['status'] ?? '')==='ready'?'/api/import-items/'.$row['id'].'/studio-image?v='.$row['preprocessing']['revision']:null;
        $row['duplicates']=['exact_photo'=>[],'identity'=>[],'editions'=>[]];
        if ($row['image_id']) $row['duplicates']['exact_photo']=$this->query('SELECT i.id,i.batch_id FROM import_items i JOIN import_batches b ON b.id=i.batch_id JOIN private_images p ON p.id=i.image_id WHERE b.user_id=? AND i.id<>? AND p.sha256=(SELECT sha256 FROM private_images WHERE id=?) ORDER BY i.id LIMIT 20',[$owner,$row['id'],$row['image_id']])->fetchAll();
        $identity=$row['fields']?ImportRules::identity($row['fields']):null;
        if ($identity) {
            $row['duplicates']['editions']=$this->query("SELECT e.id,p.title,p.catalogue_verified FROM editions e JOIN puzzles p ON p.id=e.puzzle_id WHERE e.candidate_key=? AND (p.owner_id=? OR (p.visibility='public' AND p.catalogue_verified=1)) LIMIT 20",[$identity,$owner])->fetchAll();
            $row['duplicates']['identity']=array_map('intval',$this->query("SELECT i.id FROM import_items i JOIN import_batches b ON b.id=i.batch_id WHERE b.user_id=? AND i.id<>? AND i.identity_key=? AND i.state<>'rejected' ORDER BY i.id DESC LIMIT 20",[$owner,$row['id'],$identity])->fetchAll(PDO::FETCH_COLUMN));
        }
        return $row;
    }
    public function status(int $batch,int $owner): array {
        $row=$this->batch($batch,$owner); $items=$this->query('SELECT * FROM import_items WHERE batch_id=? ORDER BY id',[$batch])->fetchAll();
        $summary=array_fill_keys(['uploaded','identified','queued','processing','image_review','needs_review','approved','imported','failed','rejected'],0);
        foreach ($items as $item) { $summary['uploaded']++; $summary[$item['state']]++; if ($item['suggestion'] && json_decode($item['suggestion'],true)['title']!==null) $summary['identified']++; }
        return ['id'=>$batch,'created_at'=>$row['created_at'],'summary'=>$summary,'items'=>array_map(fn($item)=>$this->serialize($item,$owner),$items)];
    }
    public function image(int $id,int $owner,bool $original=false,string $variant='image'): array {
        $item=$this->item($id,$owner); $image=$this->query('SELECT * FROM private_images WHERE id=? AND user_id=?',[$item['image_id'],$owner])->fetch();
        if (!$image) throw new HttpError(404,'Image not found');
        if($original) return ['path'=>$this->store->path($image['storage_key']).'.original','mime'=>$image['mime']];
        $meta=json_decode($item['preprocessing'] ?? 'null',true);
        if(in_array($variant,['studio-image','studio-thumbnail'],true)) {
            if(($meta['studio']['status'] ?? '')!=='ready') throw new HttpError(404,'Studio image unavailable');
            return ['path'=>$this->store->path($meta['studio']['asset_key']).'.'.($variant==='studio-image'?'studio':'studio-thumbnail').'.webp','mime'=>'image/webp'];
        }
        if($variant==='original-image') return ['path'=>$this->store->path($image['storage_key']).'.original','mime'=>$image['mime']];
        if($variant==='image'&&($meta['decision'] ?? '')==='accepted'&&($meta['studio']['status'] ?? '')==='ready'&&($meta['studio']['settings']['enabled'] ?? true)) return ['path'=>$this->store->path($meta['studio']['asset_key']).'.studio-thumbnail.webp','mime'=>'image/webp'];
        if(in_array($variant,['processed-image','catalogue-image'],true) && isset($meta['asset_key'])) return ['path'=>$this->store->path($meta['asset_key']).'.'.($variant==='processed-image'||$meta['decision']==='accepted'?'catalogue':'source').'.jpg','mime'=>'image/jpeg'];
        if($variant==='processed-image') throw new HttpError(404,'Processed photo not available');
        if($variant==='source-image'&&isset($meta['asset_key'])) return ['path'=>$this->store->path($meta['asset_key']).'.source.jpg','mime'=>'image/jpeg'];
        if($variant==='image'&&($meta['decision'] ?? '')==='accepted') return ['path'=>$this->store->path($meta['asset_key']).'.thumbnail.jpg','mime'=>'image/jpeg'];
        return ['path'=>$this->store->path($image['storage_key']).'.jpg','mime'=>'image/jpeg'];
    }
    public function collection(int $owner,int $limit=1000,?int $copyId=null): array {
        $limit=max(1,min(1000,$limit));
        $copies=$this->query('SELECT c.*,e.manufacturer,e.sku,e.piece_count,e.release_year,p.title,i.preprocessing AS copy_preprocessing FROM owned_copies c JOIN editions e ON e.id=c.edition_id JOIN puzzles p ON p.id=e.puzzle_id LEFT JOIN import_items i ON i.id=c.import_item_id WHERE c.user_id=?'.($copyId!==null?' AND c.id=?':'').' ORDER BY c.created_at DESC,c.id DESC LIMIT '.$limit,$copyId!==null?[$owner,$copyId]:[$owner])->fetchAll();
        foreach ($copies as &$copy) {
            $copy=CopyRules::effective($copy);
            $copy['provenance']=json_decode($copy['provenance'] ?? 'null',true); $id=$copy['import_item_id']; $prefix='/api/import-items/'.$id;
            $copy['image_url']=$id?$prefix.'/image':null;
            $meta=json_decode($copy['copy_preprocessing'] ?? 'null',true); unset($copy['copy_preprocessing']);
            $copy['studio_image_url']=($meta['studio']['status'] ?? '')==='ready'?$prefix.'/studio-image':null;
            $copy['corrected_image_url']=($meta['status'] ?? '')==='ready'?$prefix.'/processed-image':null;
            $copy['original_image_url']=$id?$prefix.'/original-image':null;
            $copy['original_download_url']=$id?$prefix.'/original':null;
            $copy['studio_background']=$meta['studio']['settings']['background'] ?? 'transparent';
            $copy['uses_studio']=($meta['decision'] ?? '')==='accepted'&&($meta['studio']['status'] ?? '')==='ready'&&($meta['studio']['settings']['enabled'] ?? true);
            $copy['default_view']=$copy['uses_studio']?'studio':(($meta['decision'] ?? '')==='accepted'?'corrected':'original');
        }
        return $copies;
    }
}
