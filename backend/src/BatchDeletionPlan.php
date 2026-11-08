<?php
declare(strict_types=1);
namespace Jigsaw;
final class BatchDeletionPlan {
    public static function drafts(array $items): array {
        return array_values(array_filter($items,fn($item)=>$item['state']!=='imported'&&(int)($item['copy_count'] ?? 0)===0));
    }
    public static function assetKeys(array $item): array {
        $meta=json_decode($item['preprocessing'] ?? 'null',true);
        $keys=array_values(array_filter([$item['storage_key'] ?? null,$meta['asset_key'] ?? null,$meta['studio']['asset_key'] ?? null],fn($key)=>$key!==null));
        foreach($keys as $key) if(!is_string($key)||!preg_match('/^[a-f0-9]{48}$/D',$key)) throw new \RuntimeException('Invalid stored photo key; batch was not deleted.');
        return array_values(array_unique($keys));
    }
}
