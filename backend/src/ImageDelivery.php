<?php
declare(strict_types=1);
namespace Jigsaw;
final class ImageDelivery {
    public const SIZES=[480,960,1440];
    public static function size(mixed $value): ?int {
        if($value===null)return null;
        if(!is_string($value)||!in_array($value,array_map('strval',self::SIZES),true))throw new HttpError(422,'Invalid display image size.');
        return (int)$value;
    }
    public static function render(string $path,int $edge): string {
        if(!in_array($edge,self::SIZES,true))throw new \InvalidArgumentException('Invalid display image size');
        $image=ImageStore::oriented($path);
        try {
            $scale=min(1,$edge/max(imagesx($image),imagesy($image)));
            $thumb=imagescale($image,max(1,(int)round(imagesx($image)*$scale)),max(1,(int)round(imagesy($image)*$scale)));
            if(!$thumb)throw new \RuntimeException('Could not resize image');
            try {imagesavealpha($thumb,true);ob_start();try {if(!imagewebp($thumb,null,78))throw new \RuntimeException('Could not encode image');return ob_get_contents();}finally{ob_end_clean();}}finally{imagedestroy($thumb);}
        }finally{imagedestroy($image);}
    }
    /** Call only after checking ownership; every cached response must revalidate authentication. */
    public static function send(array $image,int $owner,?int $edge=null): never {
        $path=$image['path'];if(!is_file($path))throw new HttpError(404,'Photo unavailable.');
        // The existing oriented preview is an uncropped copy of the original, not a corrected image.
        if($edge!==null&&$edge<=800&&str_ends_with($path,'.original')&&is_file(substr($path,0,-9).'.jpg'))$path=substr($path,0,-9).'.jpg';
        if($edge!==null&&$edge>800&&str_ends_with($path,'.jpg')&&is_file(substr($path,0,-4).'.original'))$path=substr($path,0,-4).'.original';
        $etag='"'.hash('sha256',implode('|',[$owner,$path,filesize($path),filemtime($path),$edge??'full','display-webp-v1'])).'"';
        header_remove('Pragma');header_remove('Expires');
        header('Cache-Control: private, no-cache, max-age=0, must-revalidate');header('Vary: Cookie');header('ETag: '.$etag);
        header("Content-Security-Policy: default-src 'none'; sandbox");
        if(trim($_SERVER['HTTP_IF_NONE_MATCH']??'')===$etag){http_response_code(304);exit;}
        if($edge!==null){$body=self::render($path,$edge);header('Content-Type: image/webp');header('Content-Length: '.strlen($body));echo $body;}
        else {header('Content-Type: '.$image['mime']);header('Content-Length: '.filesize($path));readfile($path);}
        exit;
    }
}
