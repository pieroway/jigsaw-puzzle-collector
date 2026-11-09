<?php
declare(strict_types=1);
namespace Jigsaw;
final class CopyRules {
    public const IDENTITY=['title'=>'p.title','manufacturer'=>'e.manufacturer','piece_count'=>'e.piece_count','sku'=>'e.sku','release_year'=>'e.release_year'];
    public const COPY_FIELDS=['box_condition','seal_status','completeness','storage_location','notes'];
    public static function fields(array $fields): array {
        $errors=[];$result=[];
        foreach($fields as $field=>$value) {
            if(!array_key_exists($field,self::IDENTITY)&&!in_array($field,self::COPY_FIELDS,true)) {$errors[$field]='This field cannot be edited.';continue;}
            if(in_array($field,['piece_count','release_year'],true)) {
                [$min,$max]=$field==='piece_count'?[1,100000]:[1800,2100];
                if($value!==null&&(!is_int($value)||$value<$min||$value>$max))$errors[$field]="Enter a whole number between $min and $max, or leave blank for unknown.";
            } else {
                if($value!==null&&!is_string($value)) {$errors[$field]='Enter text or leave blank for unknown.';continue;}
                $value=$value===null?null:trim($value);if($value==='')$value=null;
                if($field==='title'&&$value===null)$errors[$field]='Enter a title.';
                $max=['manufacturer'=>160,'sku'=>100,'notes'=>5000,'box_condition'=>50,'seal_status'=>50,'completeness'=>50][$field]??255;
                if($value!==null&&mb_strlen($value)>$max)$errors[$field]="Use at most $max characters.";
                $choices=['box_condition'=>['new','excellent','good','fair','poor'],'seal_status'=>['sealed','opened'],'completeness'=>['complete','incomplete','unchecked']];
                if($value!==null&&isset($choices[$field])&&!in_array($value,$choices[$field],true))$errors[$field]='Choose one of the listed options.';
            }
            $result[$field]=$value;
        }
        if($errors)throw new CopyValidationError($errors);return $result;
    }
    public static function effective(array $copy): array {
        $overrides=$copy['field_overrides']??[];if(is_string($overrides))$overrides=json_decode($overrides,true)??[];
        foreach(self::IDENTITY as $field=>$_)if(array_key_exists($field,$overrides))$copy[$field]=$overrides[$field];
        foreach(['piece_count','release_year'] as $field)if(isset($copy[$field]))$copy[$field]=(int)$copy[$field];
        $copy['edit_revision']=(int)($copy['edit_revision']??1);unset($copy['field_overrides']);return $copy;
    }
    public static function snapshot(array $copy): array {
        $copy=self::effective($copy);$fields=[];
        foreach([...array_keys(self::IDENTITY),...self::COPY_FIELDS] as $field)$fields[$field]=$copy[$field]??null;
        return $fields;
    }
    public static function sqlValue(string $field): string {
        $fallback=self::IDENTITY[$field]??throw new \InvalidArgumentException('Invalid correction field');
        $json="JSON_EXTRACT(c.field_overrides,'$.$field')";
        return "CASE WHEN JSON_CONTAINS_PATH(c.field_overrides,'one','$.$field') THEN CASE WHEN JSON_TYPE($json)='NULL' THEN NULL ELSE JSON_UNQUOTE($json) END ELSE $fallback END";
    }
}
