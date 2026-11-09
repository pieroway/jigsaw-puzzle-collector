<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use Jigsaw\{BatchDeletionPlan,CopyDeletionService,PhotoCleanupQueue,HttpError};
final class CopyDeletionTest extends TestCase {
    public function testRememberedPhotoVariantsAreMergedAndUnsafeKeysRejected(): void {
        $first=str_repeat('a',48);$second=str_repeat('b',48);
        self::assertSame([$first,$second],PhotoCleanupQueue::mergeKeys([$first],[$first,$second]));
        $this->expectException(RuntimeException::class);PhotoCleanupQueue::mergeKeys([$first],['../outside']);
    }
    public function testOnlyExplicitlyDeletedUnreferencedImportedSourcesCanBePurged(): void {
        $items=[['id'=>1,'state'=>'imported','copy_count'=>0],['id'=>2,'state'=>'imported','copy_count'=>0,'copy_deleted'=>true],['id'=>3,'state'=>'imported','copy_count'=>1,'copy_deleted'=>true],['id'=>4,'state'=>'failed','copy_count'=>0]];
        self::assertSame([2,4],array_column(BatchDeletionPlan::drafts($items),'id'));
        self::assertFalse(CopyDeletionService::canPurgeSource(['batch_deleted_at'=>null],0));
        self::assertFalse(CopyDeletionService::canPurgeSource(['batch_deleted_at'=>'2026-11-08'],1));
        self::assertTrue(CopyDeletionService::canPurgeSource(['batch_deleted_at'=>'2026-11-08'],0));
        self::assertFalse(CopyDeletionService::canPurgeSource(null,0));
    }
    public function testStaleDeletionRollsBackWithoutRemovingAnything(): void {
        $db=$this->createMock(PDO::class);$owner=$this->createMock(PDOStatement::class);$copy=$this->createMock(PDOStatement::class);
        $db->expects(self::once())->method('beginTransaction');$db->method('inTransaction')->willReturn(true);$db->expects(self::once())->method('rollBack');$db->expects(self::never())->method('commit');
        $db->expects(self::exactly(2))->method('prepare')->willReturnOnConsecutiveCalls($owner,$copy);
        $owner->expects(self::once())->method('execute')->with([7]);$copy->expects(self::once())->method('execute')->with([12,7]);$copy->method('fetch')->willReturn(['edit_revision'=>2]);
        try {(new CopyDeletionService($db))->delete(12,7,['revision'=>1]);self::fail('Stale deletion accepted');}catch(HttpError $e){self::assertSame(409,$e->status);}
    }
    public function testRepeatedDeletionRequiresAnOwnerScopedMarkerAndDoesNotWriteAgain(): void {
        foreach([false,['copy_id'=>12]] as $marker) {
            $db=$this->createMock(PDO::class);$owner=$this->createMock(PDOStatement::class);$copy=$this->createMock(PDOStatement::class);$deleted=$this->createMock(PDOStatement::class);
            $db->method('inTransaction')->willReturn(true);$db->expects(self::once())->method('beginTransaction');
            $db->expects(self::exactly(3))->method('prepare')->willReturnOnConsecutiveCalls($owner,$copy,$deleted);
            $copy->method('fetch')->willReturn(false);$deleted->expects(self::once())->method('execute')->with([12,7]);$deleted->method('fetch')->willReturn($marker);
            if($marker){$db->expects(self::once())->method('commit');self::assertTrue((new CopyDeletionService($db))->delete(12,7,['revision'=>1])['already_deleted']);}
            else {$db->expects(self::once())->method('rollBack');try{(new CopyDeletionService($db))->delete(12,7,['revision'=>1]);self::fail('Foreign/missing copy deleted');}catch(HttpError $e){self::assertSame(404,$e->status);}}
        }
    }
    public function testCopyAndHistoryRemovalCommitTogetherOrRollBackWhenTheMarkerFails(): void {
        foreach([false,true] as $fail) {
            $db=$this->createMock(PDO::class);$db->expects(self::once())->method('beginTransaction');$db->method('inTransaction')->willReturn(true);
            $owner=$this->createMock(PDOStatement::class);$copy=$this->createMock(PDOStatement::class);$history=$this->createMock(PDOStatement::class);$remove=$this->createMock(PDOStatement::class);$marker=$this->createMock(PDOStatement::class);
            $db->expects(self::exactly(5))->method('prepare')->willReturnOnConsecutiveCalls($owner,$copy,$history,$remove,$marker);
            $copy->method('fetch')->willReturn(['edit_revision'=>1,'import_item_id'=>null,'image_id'=>null]);
            $history->expects(self::once())->method('execute')->with([12,7]);$remove->expects(self::once())->method('execute')->with([12,7,1]);$remove->method('rowCount')->willReturn(1);
            if($fail){$marker->method('execute')->willThrowException(new PDOException('Marker write failed'));$db->expects(self::once())->method('rollBack');$db->expects(self::never())->method('commit');}
            else {$marker->expects(self::once())->method('execute')->with([12,7,null]);$db->expects(self::once())->method('commit');}
            try {$result=(new CopyDeletionService($db))->delete(12,7,['revision'=>1]);self::assertFalse($fail);self::assertTrue($result['deleted']);}
            catch(PDOException $e){self::assertTrue($fail);}
        }
    }
    public function testReferencedPhotosKeepAllKnownKeysWithoutSchedulingFileDeletion(): void {
        foreach([1,0] as $references) {
            $db=$this->createMock(PDO::class);$photo=$this->createMock(PDOStatement::class);$remember=$this->createMock(PDOStatement::class);$count=$this->createMock(PDOStatement::class);$queue=$this->createMock(PDOStatement::class);
            $keys=[str_repeat('a',48),str_repeat('b',48),str_repeat('c',48)];
            $photo->method('fetch')->willReturn(['storage_key'=>$keys[0],'cleanup_keys'=>json_encode([$keys[0],$keys[1]])]);
            $remember->expects(self::once())->method('execute')->with([json_encode($keys),9,7]);$count->method('fetchColumn')->willReturn($references);
            if($references)$db->expects(self::exactly(3))->method('prepare')->willReturnOnConsecutiveCalls($photo,$remember,$count);
            else {$db->expects(self::exactly(4))->method('prepare')->willReturnOnConsecutiveCalls($photo,$remember,$count,$queue);$queue->expects(self::once())->method('execute')->with([9,7,json_encode($keys)]);}
            (new PhotoCleanupQueue($db))->remember(9,7,[$keys[2]]);
        }
    }
}
