<?php
declare(strict_types=1);
namespace Jigsaw;
final class PortablePreprocessor implements PhotoPreprocessor {
    public function process(string $path,?array $corners=null,?int $rotation=null): array {
        if($rotation!==null&&!in_array($rotation,[0,90,180,270],true)) throw new \InvalidArgumentException('Invalid rotation');
        if($corners!==null) $corners=CornerGeometry::validate($corners);
        $image=ImageStore::oriented($path); $oriented=[imagesx($image),imagesy($image)];
        if(max($oriented)>1600) { $scaled=imagescale($image,(int)round($oriented[0]*1600/max($oriented)),(int)round($oriented[1]*1600/max($oriented))); imagedestroy($image); $image=$scaled; }
        $manual=$corners!==null; $corners??=$this->detect($image); $corners=CornerGeometry::validate($corners);
        $width=imagesx($image); $height=imagesy($image); $pixels=array_map(fn($p)=>[$p[0]*($width-1),$p[1]*($height-1)],$corners);
        $distance=fn($a,$b)=>hypot($a[0]-$b[0],$a[1]-$b[1]);
        $w=max($distance($pixels[0],$pixels[1]),$distance($pixels[3],$pixels[2]));
        $h=max($distance($pixels[0],$pixels[3]),$distance($pixels[1],$pixels[2]));
        $scale=min(1,1200/max($w,$h)); $w=max(16,(int)round($w*$scale)); $h=max(16,(int)round($h*$scale));
        $transform=CornerGeometry::homography($corners); $settings=$this->adjustments($image);
        $out=imagecreatetruecolor($w,$h);
        for($y=0;$y<$h;$y++) for($x=0;$x<$w;$x++) {
            $u=$x/max(1,$w-1); $v=$y/max(1,$h-1); $denominator=$transform[6]*$u+$transform[7]*$v+1;
            $sx=max(0,min($width-1,($transform[0]*$u+$transform[1]*$v+$transform[2])/$denominator*($width-1)));
            $sy=max(0,min($height-1,($transform[3]*$u+$transform[4]*$v+$transform[5])/$denominator*($height-1)));
            $ix=(int)$sx; $iy=(int)$sy; $fx=$sx-$ix; $fy=$sy-$iy;
            $samples=[imagecolorat($image,$ix,$iy),imagecolorat($image,min($width-1,$ix+1),$iy),imagecolorat($image,$ix,min($height-1,$iy+1)),imagecolorat($image,min($width-1,$ix+1),min($height-1,$iy+1))];
            $rgb=[];
            foreach([16,8,0] as $channel=>$shift) {
                $a=($samples[0]>>$shift)&255; $b=($samples[1]>>$shift)&255; $c=($samples[2]>>$shift)&255; $d=($samples[3]>>$shift)&255;
                $value=(($a*(1-$fx)+$b*$fx)*(1-$fy)+($c*(1-$fx)+$d*$fx)*$fy)*$settings['white_balance_gains'][$channel]*$settings['exposure_gain'];
                $rgb[]=(int)max(0,min(255,round(($value-128)*1.03+128)));
            }
            imagesetpixel($out,$x,$y,($rgb[0]<<16)|($rgb[1]<<8)|$rgb[2]);
        }
        imageconvolution($out,[[0,-.015,0],[-.015,1.06,-.015],[0,-.015,0]],1,0);
        if($rotation) { $rotated=imagerotate($out,-$rotation,0); imagedestroy($out); $out=$rotated; }
        [$catalogue,$catalogueSize]=$this->jpeg($out,1600,88); [$thumbnail,$thumbnailSize]=$this->jpeg($out,400,82); [$source]=$this->jpeg($image,1600,90);
        imagedestroy($image); imagedestroy($out); $area=0;
        for($i=0;$i<4;$i++) $area+=$corners[$i][0]*$corners[($i+1)%4][1]-$corners[$i][1]*$corners[($i+1)%4][0];
        return ['engine'=>'php-gd','version'=>'portable-photo-v2-orientation','manual'=>$manual,'corners'=>$corners,'confidence'=>$manual?1.:.45,'warnings'=>$manual?[]:['Portable corner detection is approximate. Check all four corners.'],'orientation'=>['angle'=>$rotation ?? 0,'source'=>$rotation!==null?'manual':'unavailable','ambiguous'=>$rotation===null,'candidates'=>[],'reason'=>$rotation!==null?'Saved manual orientation; preserved on reprocessing.':'Local OCR is unavailable in PHP-only mode. Check orientation and use Rotate Left or Rotate Right.'],'oriented_size'=>$oriented,'catalogue_size'=>$catalogueSize,'thumbnail_size'=>$thumbnailSize,'crop_fraction'=>$area/2,'settings'=>$settings,'source'=>$source,'catalogue'=>$catalogue,'thumbnail'=>$thumbnail];
    }
    private function detect(\GdImage $image): array {
        $scale=240/max(imagesx($image),imagesy($image)); $small=imagescale($image,max(16,(int)round(imagesx($image)*$scale)),max(16,(int)round(imagesy($image)*$scale)));
        $w=imagesx($small); $h=imagesy($small); $channels=[[],[],[]];
        for($y=0;$y<$h;$y+=3) foreach([0,$w-1] as $x) { $c=imagecolorat($small,$x,$y); foreach([16,8,0] as $i=>$shift) $channels[$i][]=($c>>$shift)&255; }
        for($x=0;$x<$w;$x+=3) foreach([0,$h-1] as $y) { $c=imagecolorat($small,$x,$y); foreach([16,8,0] as $i=>$shift) $channels[$i][]=($c>>$shift)&255; }
        $background=[]; foreach($channels as $values) { sort($values); $background[]=$values[(int)(count($values)/2)]; }
        $points=[];
        for($y=(int)($h*.04);$y<$h*.96;$y++) for($x=(int)($w*.04);$x<$w*.96;$x++) {
            $c=imagecolorat($small,$x,$y); $distance=0;
            foreach([16,8,0] as $i=>$shift) $distance+=((($c>>$shift)&255)-$background[$i])**2;
            if($distance>3600) $points[]=[$x/max(1,$w-1),$y/max(1,$h-1)];
        }
        imagedestroy($small);
        if(count($points)<100) return [[0.,0.],[1.,0.],[1.,1.],[0.,1.]];
        $corners=[];
        foreach([fn($p)=>$p[0]+$p[1],fn($p)=>-$p[0]+$p[1],fn($p)=>-$p[0]-$p[1],fn($p)=>$p[0]-$p[1]] as $score) {
            $best=$points[0]; $minimum=$score($best);
            foreach($points as $point) if($score($point)<$minimum) { $best=$point; $minimum=$score($point); }
            $corners[]=$best;
        }
        try { return CornerGeometry::validate($corners); } catch(\InvalidArgumentException) { return [[0.,0.],[1.,0.],[1.,1.],[0.,1.]]; }
    }
    private function adjustments(\GdImage $image): array {
        $values=[]; $sums=[0,0,0]; $neutrals=0; $total=0;
        for($y=0;$y<imagesy($image);$y+=max(1,(int)(imagesy($image)/40))) for($x=0;$x<imagesx($image);$x+=max(1,(int)(imagesx($image)/40))) {
            $c=imagecolorat($image,$x,$y); $rgb=[($c>>16)&255,($c>>8)&255,$c&255]; $luma=($rgb[0]+$rgb[1]+$rgb[2])/3; $values[]=$luma; $total++;
            if(max($rgb)-min($rgb)<18&&$luma>60&&$luma<230) { $neutrals++; foreach($rgb as $i=>$value) $sums[$i]+=$value; }
        }
        sort($values); $median=$values[(int)(count($values)/2)]; $gains=[1.,1.,1.];
        if($neutrals>$total*.02) { $mean=array_sum($sums)/3; foreach($sums as $i=>$sum) $gains[$i]=max(.92,min(1.08,$mean/max(1,$sum))); }
        return ['exposure_gain'=>max(.95,min(1.25,128/max(1,$median))),'white_balance_gains'=>$gains,'contrast'=>1.03,'sharpening'=>.06];
    }
    private function jpeg(\GdImage $image,int $max,int $quality): array {
        $scale=min(1,$max/max(imagesx($image),imagesy($image))); $copy=imagescale($image,max(1,(int)round(imagesx($image)*$scale)),max(1,(int)round(imagesy($image)*$scale)));
        imageinterlace($copy,true); ob_start(); imagejpeg($copy,null,$quality); $data=ob_get_clean(); $size=[imagesx($copy),imagesy($copy)]; imagedestroy($copy); return [$data,$size];
    }
}
