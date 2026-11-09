<?php
declare(strict_types=1);
namespace Jigsaw;
use PDO;
final class CopyDeletionService {
    public function __construct(private PDO $db) {}
    public static function canPurgeSource(?array $source,int $remainingCopies): bool {
        return $source!==null&&$source['batch_deleted_at']!==null&&$remainingCopies===0;
    }
    public function delete(int $id,int $owner,array $input): array {
        $revision=$input['revision']??null;
        if(!is_int($revision)||$revision<1||array_diff(array_keys($input),['revision']))throw new HttpError(422,'A valid deletion revision is required. Review the copy before deleting.');
        $this->db->beginTransaction();
        try {
            $q=$this->db->prepare('SELECT id FROM users WHERE id=? FOR UPDATE');$q->execute([$owner]);
            $q=$this->db->prepare('SELECT * FROM owned_copies WHERE id=? AND user_id=? FOR UPDATE');$q->execute([$id,$owner]);$copy=$q->fetch();
            if(!$copy) {
                $q=$this->db->prepare('SELECT copy_id FROM deleted_owned_copies WHERE copy_id=? AND user_id=?');$q->execute([$id,$owner]);
                if(!$q->fetch())throw new HttpError(404,'This copy is no longer available in your collection.');
                $this->db->commit();return ['deleted'=>true,'copy_id'=>$id,'already_deleted'=>true];
            }
            if((int)$copy['edit_revision']!==$revision)throw new HttpError(409,'This copy changed on another device. Review the latest copy before deleting.');
            $source=null;
            if($copy['import_item_id']) {
                $q=$this->db->prepare('SELECT i.*,b.deleted_at AS batch_deleted_at FROM import_items i JOIN import_batches b ON b.id=i.batch_id WHERE i.id=? AND b.user_id=? FOR UPDATE');$q->execute([$copy['import_item_id'],$owner]);$source=$q->fetch()?:null;
            }
            $q=$this->db->prepare('DELETE FROM owned_copy_edits WHERE copy_id=? AND user_id=?');$q->execute([$id,$owner]);
            $q=$this->db->prepare('DELETE FROM owned_copies WHERE id=? AND user_id=? AND edit_revision=?');$q->execute([$id,$owner,$revision]);
            if($q->rowCount()!==1)throw new HttpError(409,'This copy changed. Review it before deleting.');
            $q=$this->db->prepare('INSERT INTO deleted_owned_copies(copy_id,user_id,import_item_id) VALUES (?,?,?)');$q->execute([$id,$owner,$copy['import_item_id']]);
            if($source) {
                $q=$this->db->prepare('SELECT COUNT(*) FROM owned_copies WHERE import_item_id=?');$q->execute([$source['id']]);$references=(int)$q->fetchColumn();
                if(self::canPurgeSource($source,$references)) {
                    $q=$this->db->prepare('DELETE FROM import_events WHERE item_id=?');$q->execute([$source['id']]);
                    $q=$this->db->prepare('DELETE FROM import_items WHERE id=?');$q->execute([$source['id']]);
                } else {
                    $q=$this->db->prepare("INSERT INTO import_events(item_id,user_id,action,payload) VALUES (?,?,'copy_deleted',?)");$q->execute([$source['id'],$owner,json_encode(['copy_id'=>$id],JSON_THROW_ON_ERROR)]);
                }
            }
            $images=[];
            if($copy['image_id'])$images[(int)$copy['image_id']]=BatchDeletionPlan::assetKeys(['preprocessing'=>json_encode(json_decode($copy['provenance']??'{}',true)['preprocessing']??null)]);
            if($source&&$source['image_id'])$images[(int)$source['image_id']]=array_values(array_unique([...($images[(int)$source['image_id']]??[]),...BatchDeletionPlan::assetKeys($source)]));
            $queue=new PhotoCleanupQueue($this->db);foreach($images as $image=>$keys)$queue->remember($image,$owner,$keys);
            $this->db->commit();return ['deleted'=>true,'copy_id'=>$id,'already_deleted'=>false];
        } catch(\Throwable $error) {if($this->db->inTransaction())$this->db->rollBack();throw $error;}
    }
}
