<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use Jigsaw\{BatchDeletionPlan,ImageStore};
final class BatchDeletionTest extends TestCase {
    public function testOnlyUnimportedUnreferencedDraftsCanBeDeleted(): void {
        $items=[['id'=>1,'state'=>'imported','copy_count'=>1],['id'=>2,'state'=>'approved','copy_count'=>0],['id'=>3,'state'=>'failed','copy_count'=>0],['id'=>4,'state'=>'needs_review','copy_count'=>1]];
        self::assertSame([2,3],array_column(BatchDeletionPlan::drafts($items),'id'));
        self::assertSame([],BatchDeletionPlan::drafts([]));
    }
    public function testCleanupCollectsOriginalCorrectedAndSeparateStudioKeysWithoutDuplicates(): void {
        $original=str_repeat('a',48);$corrected=str_repeat('b',48);$studio=str_repeat('c',48);
        self::assertSame([$original,$corrected,$studio],BatchDeletionPlan::assetKeys(['storage_key'=>$original,'preprocessing'=>json_encode(['asset_key'=>$corrected,'studio'=>['asset_key'=>$studio]])]));
        self::assertSame([$original],BatchDeletionPlan::assetKeys(['storage_key'=>$original,'preprocessing'=>json_encode(['asset_key'=>$original])]));
        self::assertSame([],BatchDeletionPlan::assetKeys([]));
    }
    public function testCleanupRemovesAllVariantsIdempotentlyWithoutTouchingOtherImages(): void {
        $root=sys_get_temp_dir().'/delete-unit-'.bin2hex(random_bytes(6));mkdir($root);
        $store=new ImageStore($root);$key=str_repeat('a',48);$keep=str_repeat('b',48);
        $suffixes=['.original','.jpg','.source.jpg','.catalogue.jpg','.thumbnail.jpg','.studio.webp','.studio-thumbnail.webp'];
        foreach($suffixes as $suffix) file_put_contents($store->path($key).$suffix,'fixture');
        file_put_contents($store->path($keep).'.original','keep');
        try {
            $store->removeVariants($key);$store->removeVariants($key);
            foreach($suffixes as $suffix) self::assertFileDoesNotExist($store->path($key).$suffix);
            self::assertSame('keep',file_get_contents($store->path($keep).'.original'));
        } finally {unlink($store->path($keep).'.original');rmdir($root);}
    }
    public function testUnsafeStoredKeysAreRejectedBeforeFileCleanup(): void {
        $this->expectException(RuntimeException::class);
        BatchDeletionPlan::assetKeys(['storage_key'=>'../outside']);
    }
}
