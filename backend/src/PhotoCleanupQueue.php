<?php
declare(strict_types=1);
namespace Jigsaw;
use PDO;
final class PhotoCleanupQueue {
    public function __construct(private PDO $db) {}
    public static function mergeKeys(array $stored,array $keys): array {
        $all=array_values(array_unique([...$stored,...$keys]));
        foreach($all as $key)if(!is_string($key)||!preg_match('/^[a-f0-9]{48}$/D',$key))throw new \RuntimeException('Invalid stored photo key; cleanup was not scheduled.');
        return $all;
    }
    /** Called inside the owner's deletion transaction, before source metadata is discarded. */
    public function remember(int $image,int $owner,array $keys): void {
        $q=$this->db->prepare('SELECT storage_key,cleanup_keys FROM private_images WHERE id=? AND user_id=? FOR UPDATE');$q->execute([$image,$owner]);$photo=$q->fetch();
        if(!$photo)return;
        $keys=self::mergeKeys(json_decode($photo['cleanup_keys']??'[]',true,32,JSON_THROW_ON_ERROR),[$photo['storage_key'],...$keys]);
        $q=$this->db->prepare('UPDATE private_images SET cleanup_keys=? WHERE id=? AND user_id=?');$q->execute([json_encode($keys,JSON_THROW_ON_ERROR),$image,$owner]);
        $q=$this->db->prepare('SELECT (SELECT COUNT(*) FROM import_items WHERE image_id=?)+(SELECT COUNT(*) FROM owned_copies WHERE image_id=?)');$q->execute([$image,$image]);
        if(!(int)$q->fetchColumn()) {
            $q=$this->db->prepare('INSERT INTO image_deletion_queue(image_id,user_id,asset_keys) VALUES (?,?,?) ON DUPLICATE KEY UPDATE asset_keys=VALUES(asset_keys)');$q->execute([$image,$owner,json_encode($keys,JSON_THROW_ON_ERROR)]);
        }
    }
}
