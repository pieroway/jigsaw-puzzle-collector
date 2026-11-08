<?php
declare(strict_types=1);
namespace Jigsaw;
final class CornerGeometry {
    public static function validate(array $points): array {
        if(count($points)!==4||!array_is_list($points)) throw new \InvalidArgumentException('Choose exactly four corners.');
        foreach($points as $point) {
            if(!is_array($point)||!array_is_list($point)||count($point)!==2) throw new \InvalidArgumentException('Each corner needs X and Y coordinates.');
            foreach($point as $value) if(!is_numeric($value)||!is_finite((float)$value)||$value<0||$value>1) throw new \InvalidArgumentException('Corner coordinates must be between 0 and 1.');
        }
        $points=array_map(fn($p)=>[(float)$p[0],(float)$p[1]],$points); $area=0;
        for($i=0;$i<4;$i++) {
            [$a,$b,$c]=[$points[$i],$points[($i+1)%4],$points[($i+2)%4]];
            $cross=($b[0]-$a[0])*($c[1]-$b[1])-($b[1]-$a[1])*($c[0]-$b[0]);
            if($cross<=.0001||hypot($b[0]-$a[0],$b[1]-$a[1])<.03) throw new \InvalidArgumentException('Corners must form a clockwise convex box: top-left, top-right, bottom-right, bottom-left.');
            $area+=$a[0]*$b[1]-$a[1]*$b[0];
        }
        if($area/2<.02) throw new \InvalidArgumentException('The selected box must cover at least 2% of the photograph.');
        return $points;
    }
    public static function homography(array $points): array {
        $points=self::validate($points); $matrix=[];
        foreach([[0,0],[1,0],[1,1],[0,1]] as $i=>[$u,$v]) {
            [$x,$y]=$points[$i];
            $matrix[]=[$u,$v,1,0,0,0,-$u*$x,-$v*$x,$x];
            $matrix[]=[0,0,0,$u,$v,1,-$u*$y,-$v*$y,$y];
        }
        for($column=0;$column<8;$column++) {
            $pivot=$column;
            for($row=$column+1;$row<8;$row++) if(abs($matrix[$row][$column])>abs($matrix[$pivot][$column])) $pivot=$row;
            if(abs($matrix[$pivot][$column])<1e-10) throw new \InvalidArgumentException('The perspective transform is degenerate.');
            [$matrix[$column],$matrix[$pivot]]=[$matrix[$pivot],$matrix[$column]];
            $divisor=$matrix[$column][$column];
            for($j=$column;$j<9;$j++) $matrix[$column][$j]/=$divisor;
            for($row=0;$row<8;$row++) if($row!==$column) { $factor=$matrix[$row][$column]; for($j=$column;$j<9;$j++) $matrix[$row][$j]-=$factor*$matrix[$column][$j]; }
        }
        return array_column($matrix,8);
    }
}
