"""Optional internal adapter. No filesystem paths, external network calls or public port."""
import base64
import hmac
import json
import os
import threading
import io
from PIL import Image
from studio import render
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pipeline import process, VERSION

slots=threading.BoundedSemaphore(2)
class Handler(BaseHTTPRequestHandler):
    def reply(self,status,payload):
        data=json.dumps(payload,allow_nan=False).encode()
        self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        self.reply(200 if self.path=='/health' else 404,{'version':VERSION})
    def do_POST(self):
        if self.path not in ['/process','/studio']: return self.reply(404,{'error':'Not found'})
        if not hmac.compare_digest(self.headers.get('X-Processor-Key',''),os.environ.get('PROCESSOR_KEY','')) or not os.environ.get('PROCESSOR_KEY'): return self.reply(403,{'error':'Unauthorized'})
        if not slots.acquire(blocking=False): return self.reply(429,{'error':'Processor busy. Retry.'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=18*1024*1024: return self.reply(413,{'error':'Request too large'})
            self.connection.settimeout(20)
            request=json.loads(self.rfile.read(length))
            if not isinstance(request,dict): raise ValueError('Object required')
            data=base64.b64decode(request['image'],validate=True)
            if self.path=='/studio':
                if len(data)>12*1024*1024: raise ValueError('Studio input too large')
                with Image.open(io.BytesIO(data)) as front: result=render(front,1200,request.get('settings'))
                fields=['presentation','thumbnail']
            else:
                result=process(data,request.get('corners'),request.get('rotation')); fields=['catalogue','thumbnail','source']
            for field in fields: result[field]=base64.b64encode(result[field]).decode('ascii')
            self.reply(200,result)
        except (ValueError,KeyError,TypeError): self.reply(422,{'error':'Invalid photo or corners'})
        except Exception: self.reply(500,{'error':'Processing failed. Retry or use the original.'})
        finally: slots.release()

if __name__=='__main__': ThreadingHTTPServer(('0.0.0.0',8091),Handler).serve_forever()
