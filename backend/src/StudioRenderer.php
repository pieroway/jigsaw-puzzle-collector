<?php
declare(strict_types=1);
namespace Jigsaw;
final class StudioRenderer {
    public const VERSION='studio-cuboid-v3.1-standing';
    public static function settings(array $input=[]): array {
        $value=array_replace(['depth'=>'standard','view'=>'three-quarter','background'=>'transparent','enabled'=>true,'dimensions'=>[]],$input);
        if(!in_array($value['depth'],['thin','standard','deep'],true)||!in_array($value['view'],['front','three-quarter'],true)||!in_array($value['background'],['light','dark','transparent'],true)||!is_bool($value['enabled'])||!is_array($value['dimensions'])) throw new HttpError(422,'Choose valid studio depth, view and background settings.');
        $dimensions=[];
        foreach(['width_mm','height_mm','depth_mm'] as $name) {
            $number=$value['dimensions'][$name] ?? null;
            if($number!==null) { if((!is_int($number)&&!is_float($number))||!is_finite((float)$number)||$number<5||$number>1500) throw new HttpError(422,'Dimensions must be 5–1500 mm.'); $dimensions[$name]=$number; }
        }
        if(isset($dimensions['width_mm'])!==isset($dimensions['height_mm'])) throw new HttpError(422,'Supply both measured width and height.');
        return ['depth'=>$value['depth'],'view'=>$value['view'],'background'=>$value['background'],'enabled'=>$value['enabled'],'dimensions'=>$dimensions];
    }
    public static function signature(string $jpeg,array $settings): string {
        return hash('sha256',self::VERSION.hash('sha256',$jpeg).json_encode([$settings['depth'],$settings['view'],$settings['dimensions']],JSON_THROW_ON_ERROR));
    }
    public static function generate(string $jpeg,array $settings): array {
        $size=getimagesizefromstring($jpeg); $actual=$settings['dimensions'];
        if(isset($actual['width_mm'])&&abs($actual['width_mm']/$actual['height_mm']/($size[0]/$size[1])-1)>.02) throw new HttpError(422,'Measured width/height do not match the corrected front. Check dimensions or corners.');
        $url=getenv('IMAGE_PROCESSOR_URL');
        if(!$url) return ['status'=>'unavailable','settings'=>$settings,'bytes'=>0,'error'=>'Studio rendering is unavailable in PHP-only mode. The corrected front remains available.'];
        $payload=json_encode(['image'=>base64_encode($jpeg),'settings'=>[...$settings,'dimensions'=>(object)$settings['dimensions']]],JSON_THROW_ON_ERROR);
        $context=stream_context_create(['http'=>['method'=>'POST','header'=>"Content-Type: application/json\r\nX-Processor-Key: ".(getenv('PROCESSOR_KEY') ?: ''),'content'=>$payload,'timeout'=>8,'ignore_errors'=>true,'follow_location'=>0]]);
        $body=@file_get_contents(rtrim($url,'/').'/studio',false,$context,0,8*1024*1024+1);
        if($body===false||strlen($body)>8*1024*1024||!str_contains($http_response_header[0] ?? '',' 200 ')) throw new HttpError(503,'Studio rendering failed. Check dimensions and retry; your images are unchanged.');
        $result=json_decode($body,true,32,JSON_THROW_ON_ERROR);
        foreach(['presentation'=>1200,'thumbnail'=>400] as $field=>$max) {
            $bytes=base64_decode($result[$field] ?? '',true); $size=$bytes===false?false:@getimagesizefromstring($bytes);
            if(!$size||$size['mime']!=='image/webp'||max($size[0],$size[1])>$max) throw new \RuntimeException('Invalid studio image');
            $result[$field]=$bytes;
        }
        return [...$result,'status'=>'ready','settings'=>$settings,'signature'=>self::signature($jpeg,$settings),'bytes'=>strlen($result['presentation'])+strlen($result['thumbnail'])];
    }
}
