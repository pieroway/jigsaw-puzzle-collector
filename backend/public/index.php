<?php
declare(strict_types=1);
use Jigsaw\{Database,FixtureExtractor,HttpError,ImageStore,ImportService};
spl_autoload_register(function(string $class): void {
    if (str_starts_with($class,'Jigsaw\\')) { $path=__DIR__.'/../src/'.substr($class,7).'.php'; if (is_file($path)) require $path; }
});
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff');
function respond(mixed $value,int $status=200): never { http_response_code($status); echo json_encode($value,JSON_THROW_ON_ERROR); exit; }
function input(): array {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0)>65536) throw new HttpError(413,'Request is too large');
    try { $data=json_decode(file_get_contents('php://input'),true,64,JSON_THROW_ON_ERROR); }
    catch (JsonException) { throw new HttpError(422,'Send a valid JSON object'); }
    if (!is_array($data)||array_is_list($data)&&$data!==[]) throw new HttpError(422,'Send a JSON object'); return $data;
}
function sessionResult(?array $user): array { return ['user'=>$user,'csrf'=>$_SESSION['csrf']]; }
try {
    $path=parse_url($_SERVER['REQUEST_URI'] ?? '/',PHP_URL_PATH); $method=$_SERVER['REQUEST_METHOD'];
    if ($path==='/api/health') respond(['status'=>'ok','service'=>'jigsaw-api']);
    if (!preg_match('#^/api/(session|auth/|import-|collection|home)#',$path)) throw new HttpError(404,'Not found');
    ini_set('session.use_strict_mode','1'); ini_set('session.use_only_cookies','1');
    session_name('jigsaw_session');
    session_set_cookie_params(['lifetime'=>0,'path'=>'/','httponly'=>true,'samesite'=>'Lax','secure'=>getenv('SESSION_COOKIE_SECURE')==='1']);
    session_start(); $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    $db=Database::connect(); $user=null;
    if (isset($_SESSION['user_id'])) { $q=$db->prepare('SELECT id,email FROM users WHERE id=?'); $q->execute([$_SESSION['user_id']]); $user=$q->fetch() ?: null; if($user) $user['id']=(int)$user['id']; }
    if ($path==='/api/session'&&$method==='GET') respond(sessionResult($user));
    if (!in_array($method,['GET','HEAD'],true) && !hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) throw new HttpError(403,'Session verification failed. Refresh and try again.');
    if (in_array($path,['/api/auth/register','/api/auth/login'],true)&&$method==='POST') {
        $data=input(); $email=mb_strtolower(trim((string)($data['email'] ?? ''))); $password=$data['password'] ?? '';
        if (!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>254||!is_string($password)||strlen($password)<12||strlen($password)>72||str_contains($password,"\0")) throw new HttpError(422,'Use a valid email and a password of 12–72 bytes, without null characters.');
        $address=hash('sha256',$_SERVER['REMOTE_ADDR'] ?? 'unknown');
        $q=$db->prepare('INSERT INTO auth_limits(address_hash,attempts) VALUES (?,1) ON DUPLICATE KEY UPDATE attempts=IF(window_start<UTC_TIMESTAMP()-INTERVAL 1 HOUR,1,attempts+1),window_start=IF(window_start<UTC_TIMESTAMP()-INTERVAL 1 HOUR,UTC_TIMESTAMP(),window_start)'); $q->execute([$address]);
        $q=$db->prepare('SELECT attempts FROM auth_limits WHERE address_hash=?'); $q->execute([$address]); if ((int)$q->fetchColumn()>120) throw new HttpError(429,'Too many sign-in attempts. Try again in an hour.');
        if ($path==='/api/auth/register') {
            try { $q=$db->prepare('INSERT INTO users(email,password_hash) VALUES (?,?)'); $q->execute([$email,password_hash($password,PASSWORD_DEFAULT)]); $id=(int)$db->lastInsertId(); }
            catch(PDOException $e) { if ($e->getCode()==='23000') throw new HttpError(409,'An account with this email already exists. Sign in instead.'); throw $e; }
        } else {
            $q=$db->prepare('SELECT id,password_hash FROM users WHERE email=?'); $q->execute([$email]); $account=$q->fetch();
            if (!$account||!password_verify($password,$account['password_hash'])) throw new HttpError(401,'Email or password is incorrect.'); $id=(int)$account['id'];
        }
        session_regenerate_id(true); $_SESSION['user_id']=$id; $_SESSION['csrf']=bin2hex(random_bytes(32));
        respond(sessionResult(['id'=>$id,'email'=>$email]),$path==='/api/auth/register'?201:200);
    }
    if (!$user) throw new HttpError(401,'Sign in to your private collection first.'); $owner=$user['id'];
    if ($path==='/api/auth/logout'&&$method==='POST') { $_SESSION=[]; session_regenerate_id(true); $_SESSION['csrf']=bin2hex(random_bytes(32)); respond(sessionResult(null)); }
    $service=new ImportService($db,new ImageStore(getenv('PRIVATE_STORAGE_PATH') ?: '/var/lib/jigsaw/photos'),new FixtureExtractor(getenv('FIXTURE_PATH') ?: '/fixtures'));
    $deletion=new Jigsaw\BatchDeletionService($db,new ImageStore(getenv('PRIVATE_STORAGE_PATH') ?: '/var/lib/jigsaw/photos'));
    if($path==='/api/import-batches/cleanup'&&$method==='POST') respond(['cleanup_pending'=>$deletion->cleanup($owner)]);
    if ($path==='/api/collection'&&$method==='GET') respond(['copies'=>$service->collection($owner)]);
    if(preg_match('#^/api/collection-copies/([1-9][0-9]*)$#',$path,$copyMatch)) {
        $copies=new Jigsaw\CopyService($db,$service);$copyId=(int)$copyMatch[1];
        if($method==='GET')respond(['copy'=>$copies->read($copyId,$owner)]);
        if($method==='PATCH')respond(['copy'=>$copies->update($copyId,$owner,input())]);
    }
    if ($path==='/api/home'&&$method==='GET') respond([...(new Jigsaw\HomeSummary($db))->get($owner),'recent'=>$service->collection($owner,6)]);
    if ($path==='/api/import-batches') {
        if ($method==='POST') { $data=input(); respond($service->create($owner,ImportService::key($data['client_key'] ?? null)),201); }
        if ($method==='GET') respond(['batches'=>$service->batches($owner),'cleanup_pending'=>$deletion->pending($owner)]);
    }
    if (preg_match('#^/api/import-batches/([1-9][0-9]*)(?:/(photos|items|process|approve-reviewed|commit))?$#',$path,$m)) {
        $id=(int)$m[1]; $action=$m[2] ?? '';
        if($method==='DELETE'&&$action==='') respond($deletion->delete($id,$owner));
        if ($method==='GET'&&in_array($action,['','items'],true)) respond($service->status($id,$owner));
        if ($method==='POST') {
            if ($action==='photos') {
                if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0)>14*1024*1024) throw new HttpError(413,'The photo exceeds the 12 MB upload limit. Resize it and retry.');
                if (!isset($_FILES['photo'])||!is_array($_FILES['photo'])||is_array($_FILES['photo']['name'])) throw new HttpError(422,'Upload one photo per request.');
                if (($_FILES['photo']['error'] ?? 1)===0&&!is_uploaded_file($_FILES['photo']['tmp_name'])) throw new HttpError(422,'Invalid upload');
                respond($service->upload($id,$owner,ImportService::key($_POST['client_key'] ?? null),$_FILES['photo']),201);
            }
            if ($action==='process') respond($service->process($id,$owner));
            if ($action==='approve-reviewed') respond($service->approveReviewed($id,$owner));
            if ($action==='commit') respond($service->commit($id,$owner));
        }
    }
    if (preg_match('#^/api/import-items/([1-9][0-9]*)(?:/(approve|reject|retry|image|original|original-image|source-image|processed-image|catalogue-image|studio-image|studio-thumbnail|preprocessing/(?:prepare|accept|reject|studio)))?$#',$path,$m)) {
        $id=(int)$m[1]; $action=$m[2] ?? '';
        if ($method==='PATCH'&&$action==='') respond($service->edit($id,$owner,input()));
        if ($method==='POST'&&in_array($action,['approve','reject','retry'],true)) respond($service->action($id,$owner,$action));
        if ($method==='POST'&&str_starts_with($action,'preprocessing/')) respond($service->photoAction($id,$owner,substr($action,14),input()));
        if ($method==='GET'&&in_array($action,['image','original','original-image','source-image','processed-image','catalogue-image','studio-image','studio-thumbnail'],true)) {
            $image=$service->image($id,$owner,$action==='original',$action);
            if (!is_file($image['path'])) throw new HttpError(404,'Photo unavailable. Contact the administrator.');
            header('Content-Type: '.$image['mime']); header("Content-Security-Policy: default-src 'none'; sandbox");
            if ($action==='original') header('Content-Disposition: attachment; filename="original-photo"');
            readfile($image['path']); exit;
        }
    }
    throw new HttpError(404,'Not found');
} catch (HttpError $e) { respond(['error'=>$e->getMessage()],$e->status); }
catch (Jigsaw\CopyValidationError $e) { respond(['error'=>$e->getMessage(),'fields'=>$e->errors],422); }
catch (InvalidArgumentException $e) { respond(['error'=>$e->getMessage()],422); }
catch (Throwable $e) { error_log((string)$e); respond(['error'=>'The operation could not finish. Your saved records are safe; retry or contact the administrator.'],500); }
