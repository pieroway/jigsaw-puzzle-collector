<?php
declare(strict_types=1);
namespace Jigsaw;
use PDO;
final class BatchDeletionService {
    public function __construct(private PDO $db,private ImageStore $store) {}
    private function query(string $sql,array $args=[]): \PDOStatement { $q=$this->db->prepare($sql);$q->execute($args);return $q; }
    public function pending(int $owner): int {return (int)$this->query('SELECT COUNT(*) FROM image_deletion_queue WHERE user_id=?',[$owner])->fetchColumn();}
    public function delete(int $id,int $owner): array {
        $this->db->beginTransaction();
        try {
            $this->query('SELECT id FROM users WHERE id=? FOR UPDATE',[$owner]);
            $batch=$this->query('SELECT id FROM import_batches WHERE id=? AND user_id=? FOR UPDATE',[$id,$owner])->fetch();
            if(!$batch) throw new HttpError(404,'Batch not found');
            $items=$this->query('SELECT i.*,p.storage_key,(SELECT COUNT(*) FROM owned_copies c WHERE c.import_item_id=i.id) AS copy_count,EXISTS(SELECT 1 FROM deleted_owned_copies d WHERE d.import_item_id=i.id AND d.user_id=?) AS copy_deleted FROM import_items i LEFT JOIN private_images p ON p.id=i.image_id WHERE i.batch_id=? FOR UPDATE',[$owner,$id])->fetchAll();
            $drafts=BatchDeletionPlan::drafts($items); $images=[];
            foreach($drafts as $item) {
                if($item['image_id']) $images[$item['image_id']]=array_values(array_unique([...($images[$item['image_id']] ?? []),...BatchDeletionPlan::assetKeys($item)]));
                $this->query('DELETE FROM import_events WHERE item_id=?',[$item['id']]);
                $this->query('DELETE FROM import_items WHERE id=?',[$item['id']]);
            }
            foreach($images as $image=>$keys) {
                (new PhotoCleanupQueue($this->db))->remember((int)$image,$owner,$keys);
            }
            $this->query('UPDATE import_batches SET deleted_at=COALESCE(deleted_at,UTC_TIMESTAMP()) WHERE id=?',[$id]);
            $retained=(int)$this->query('SELECT COUNT(*) FROM owned_copies c JOIN import_items i ON i.id=c.import_item_id WHERE i.batch_id=? AND c.user_id=?',[$id,$owner])->fetchColumn();
            $this->db->commit();
        } catch(\Throwable $error) {if($this->db->inTransaction()) $this->db->rollBack();throw $error;}
        return ['deleted'=>true,'batch_id'=>$id,'deleted_drafts'=>count(array_filter($drafts,fn($item)=>$item['state']!=='imported')),'deleted_sources'=>count(array_filter($drafts,fn($item)=>$item['state']==='imported')),'retained_copies'=>$retained,'cleanup_pending'=>$this->cleanup($owner)];
    }
    public function cleanup(int $owner): int {
        $ids=$this->query('SELECT image_id FROM image_deletion_queue WHERE user_id=? ORDER BY image_id LIMIT 100',[$owner])->fetchAll(PDO::FETCH_COLUMN);
        foreach($ids as $id) {
            $this->db->beginTransaction();
            try {
                $this->query('SELECT id FROM users WHERE id=? FOR UPDATE',[$owner]);
                $job=$this->query('SELECT * FROM image_deletion_queue WHERE image_id=? AND user_id=? FOR UPDATE',[$id,$owner])->fetch();
                if(!$job) {$this->db->commit();continue;}
                $references=(int)$this->query('SELECT (SELECT COUNT(*) FROM import_items WHERE image_id=?)+(SELECT COUNT(*) FROM owned_copies WHERE image_id=?)',[$id,$id])->fetchColumn();
                if(!$references) foreach(json_decode($job['asset_keys'],true,32,JSON_THROW_ON_ERROR) as $key) $this->store->removeVariants($key);
                $this->query('DELETE FROM image_deletion_queue WHERE image_id=?',[$id]);
                if(!$references) $this->query('DELETE FROM private_images WHERE id=? AND user_id=?',[$id,$owner]);
                $this->db->commit();
            } catch(\Throwable $error) {if($this->db->inTransaction()) $this->db->rollBack();error_log('Batch photo cleanup pending: '.$error->getMessage());}
        }
        return $this->pending($owner);
    }
}
