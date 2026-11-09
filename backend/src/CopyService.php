<?php
declare(strict_types=1);
namespace Jigsaw;
use PDO;
final class CopyService {
    public function __construct(private PDO $db,private ImportService $imports) {}
    public function read(int $id,int $owner): array {
        $copies=$this->imports->collection($owner,1,$id);
        if(!$copies)throw new HttpError(404,'Copy not found');return $copies[0];
    }
    public function update(int $id,int $owner,array $input): array {
        $this->db->beginTransaction();
        try {
            $q=$this->db->prepare('SELECT * FROM owned_copies WHERE id=? AND user_id=? FOR UPDATE');$q->execute([$id,$owner]);$row=$q->fetch();
            if(!$row)throw new HttpError(404,'Copy not found');
            $revision=$input['revision']??null;
            if(!is_int($revision)||$revision<1)throw new HttpError(422,'A valid edit revision is required. Reopen Edit.');
            if($revision!==(int)$row['edit_revision'])throw new HttpError(409,'This copy changed on another device. Your draft has not been saved. Load the latest saved values before trying again.');
            if(array_diff(array_keys($input),['revision','fields'])||!isset($input['fields'])||!is_array($input['fields'])||($input['fields']!==[]&&array_is_list($input['fields'])))throw new HttpError(422,'Send an object of editable fields.');
            $fields=CopyRules::fields($input['fields']);$before=CopyRules::snapshot($this->read($id,$owner));$after=$before;
            foreach($fields as $field=>$value)$after[$field]=$value;
            if($after===$before) {$copy=$this->read($id,$owner);$this->db->commit();return $copy;}
            $overrides=json_decode($row['field_overrides']??'{}',true)??[];
            foreach($fields as $field=>$value)if(array_key_exists($field,CopyRules::IDENTITY))$overrides[$field]=$value;
            $physical=[];foreach(CopyRules::COPY_FIELDS as $field)$physical[]=$after[$field];
            $q=$this->db->prepare('UPDATE owned_copies SET field_overrides=?,box_condition=?,seal_status=?,completeness=?,storage_location=?,notes=?,edit_revision=edit_revision+1 WHERE id=? AND user_id=? AND edit_revision=?');
            $q->execute([json_encode((object)$overrides,JSON_THROW_ON_ERROR),...$physical,$id,$owner,$revision]);
            if($q->rowCount()!==1)throw new HttpError(409,'This copy changed. Load the latest saved values.');
            $q=$this->db->prepare('INSERT INTO owned_copy_edits(copy_id,user_id,revision,before_values,after_values) VALUES (?,?,?,?,?)');
            $q->execute([$id,$owner,$revision+1,json_encode($before,JSON_THROW_ON_ERROR),json_encode($after,JSON_THROW_ON_ERROR)]);
            $copy=$this->read($id,$owner);$this->db->commit();return $copy;
        } catch(\Throwable $e) {if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }
}
