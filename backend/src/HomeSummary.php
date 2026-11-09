<?php
declare(strict_types=1);
namespace Jigsaw;
use PDO;
final class HomeSummary {
    public function __construct(private PDO $db) {}
    public function get(int $owner): array {
        $manufacturer=CopyRules::sqlValue('manufacturer');$pieces=CopyRules::sqlValue('piece_count');
        $q=$this->db->prepare("SELECT COUNT(*) AS puzzles,COUNT(DISTINCT NULLIF(LOWER(TRIM($manufacturer)),'')) AS manufacturers,COALESCE(SUM($pieces),0) AS known_pieces FROM owned_copies c JOIN editions e ON e.id=c.edition_id WHERE c.user_id=?");
        $q->execute([$owner]); $totals=array_map('intval',$q->fetch());
        $q=$this->db->prepare("SELECT b.id,b.created_at,SUM(i.state IN ('queued','processing','image_review','needs_review','approved','failed')) AS remaining,SUM(i.state='image_review') AS image_review,SUM(i.state='needs_review') AS needs_review,SUM(i.state='failed') AS failed,SUM(i.state='approved') AS approved,SUM(i.state='queued') AS queued,SUM(i.state='processing') AS processing FROM import_batches b JOIN import_items i ON i.batch_id=b.id WHERE b.user_id=? AND b.deleted_at IS NULL GROUP BY b.id,b.created_at HAVING remaining>0 ORDER BY b.created_at DESC,b.id DESC LIMIT 3");
        $q->execute([$owner]); $batches=$q->fetchAll();
        foreach($batches as &$batch) foreach($batch as $key=>$value) if($key!=='created_at') $batch[$key]=(int)$value;
        return ['totals'=>$totals,'batches'=>$batches];
    }
}
