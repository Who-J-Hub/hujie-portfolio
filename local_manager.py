"""Private, loopback-only photo editor. Exported websites contain no manager code."""
import argparse
import base64
import hashlib
import hmac
import io
import json
import mimetypes
import os
import re
import secrets
import tempfile
import threading
import time
import uuid
import webbrowser
import zipfile
from functools import partial
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 256
MAX_UPLOAD = 25 * 1024 * 1024
MAX_PREVIEW = 8 * 1024 * 1024
# Both images are sent as padded base64 strings inside the JSON request.
MAX_UPLOAD_BODY = 4 * ((MAX_UPLOAD + 2) // 3 + (MAX_PREVIEW + 2) // 3) + 128 * 1024
ID = re.compile(r'^[a-f0-9]{32}$')


def image_type(data):
    if data.startswith(b'\xff\xd8\xff'): return 'jpg'
    if data.startswith(b'\x89PNG\r\n\x1a\n'): return 'png'
    if data.startswith((b'GIF87a', b'GIF89a')): return 'gif'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP': return 'webp'
    if data[4:8] == b'ftyp' and data[8:12] in (b'avif', b'avis'): return 'avif'
    raise ValueError('请选择 JPG、PNG、WebP、GIF 或 AVIF 图片。')


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False)
    try:
        with handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(handle.name, path)
    finally:
        if os.path.exists(handle.name): os.unlink(handle.name)


class Library:
    def __init__(self, root=ROOT, data=None):
        self.root = Path(root).resolve()
        self.public = self.root / 'public'
        self.export_path = self.root / 'exports' / 'hujie-public-website.zip'
        self.private = Path(data).resolve() if data else self.root / 'private'
        self.private.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.token = secrets.token_urlsafe(32)
        self.sessions = {}
        self.failed_logins = []

    def catalog(self):
        path = self.private / 'library.json'
        return json.loads(path.read_text('utf-8')) if path.exists() else {'photos': [], 'revision': 0}

    def save(self, catalog):
        catalog['revision'] += 1
        atomic_json(self.private / 'library.json', catalog)

    def auth(self):
        path = self.private / 'owner.json'
        return json.loads(path.read_text('utf-8')) if path.exists() else None

    def create_owner(self, password):
        if not isinstance(password, str) or not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
            raise ValueError(f'管理密码须为 {MIN_PASSWORD_LENGTH} 到 {MAX_PASSWORD_LENGTH} 个字符。')
        salt = secrets.token_bytes(32)
        auth = {'username': 'hujie', 'salt': salt.hex(), 'iterations': 600000,
                'hash': hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 600000).hex(),
                'generation': secrets.token_hex(16)}
        atomic_json(self.private / 'owner.json', auth)
        self.sessions.clear()
        return auth

    def password_matches(self, password):
        auth = self.auth()
        if not auth or not isinstance(password, str) or len(password) > MAX_PASSWORD_LENGTH: return False
        computed = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(auth['salt']), auth['iterations']).hex()
        return hmac.compare_digest(computed, auth['hash'])

    def public_photos(self, catalog=None):
        catalog = catalog or self.catalog()
        return [{'id': p['id'], 'title': p['title'], 'caption': p['caption'], 'category': p['category'],
                 'width': p['width'], 'height': p['height'], 'url': '/photos/' + p['id'] + '.' + p['previewType']}
                for p in catalog['photos'] if p['visible'] and not p['archived']]

    def export(self):
        with self.lock:
            catalog = self.catalog()
            photos = self.public_photos(catalog)
            exports = self.export_path.parent
            exports.mkdir(exist_ok=True)
            handle, temporary = tempfile.mkstemp(suffix='.zip', dir=exports)
            os.close(handle)
            try:
                with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
                    for file in sorted(self.public.rglob('*')):
                        if not file.is_file() or file.is_symlink(): continue
                        rel = file.relative_to(self.public)
                        if rel.parts[0] == 'photos' or rel.name == 'gallery.json': continue
                        archive.write(file, rel.as_posix())
                    archive.writestr('gallery.json', json.dumps({'photos': photos}, ensure_ascii=False))
                    for photo in photos:
                        item = next(p for p in catalog['photos'] if p['id'] == photo['id'])
                        archive.write(self.private / 'photos' / item['id'] / ('preview.' + item['previewType']), photo['url'].lstrip('/'))
                os.replace(temporary, self.export_path)
            finally:
                if os.path.exists(temporary): os.unlink(temporary)
            return self.export_path


class Handler(BaseHTTPRequestHandler):
    server_version = 'HujieLocal/1.0'
    sys_version = ''

    @property
    def library(self): return self.server.library

    def allowed_host(self):
        port = self.server.server_port
        return self.headers.get('Host') in (f'127.0.0.1:{port}', f'localhost:{port}')

    def respond(self, status, data=None, headers=None, content_type='application/json; charset=utf-8'):
        body = json.dumps(data, ensure_ascii=False).encode() if content_type.startswith('application/json') else data
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body or b'')))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        for key, value in (headers or {}).items(): self.send_header(key, value)
        self.end_headers()
        if self.command != 'HEAD' and body: self.wfile.write(body)

    def fail(self, status, message): self.respond(status, {'error': message})

    def session(self):
        try:
            cookie = SimpleCookie(self.headers.get('Cookie', ''))
            value = cookie.get('hj_owner')
            token = value.value if value else ''
        except Exception: return None
        record = self.library.sessions.get(token)
        auth = self.library.auth()
        if not record or not auth or record['expires'] < time.time() or record['generation'] != auth['generation']:
            self.library.sessions.pop(token, None)
            return None
        return token

    def require_owner(self):
        if not self.session():
            self.fail(401, '请先使用你的管理密码登录。')
            return False
        return True

    def issue_session(self):
        token = secrets.token_urlsafe(32)
        auth = self.library.auth()
        self.library.sessions[token] = {'expires': time.time() + 8 * 3600, 'generation': auth['generation']}
        return {'Set-Cookie': f'hj_owner={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800'}

    def file(self, path, download=False):
        if not path.is_file() or path.is_symlink(): return self.fail(404, '文件不存在。')
        try:
            source = path.open('rb')
        except FileNotFoundError:
            return self.fail(404, '文件不存在。')
        with source:
            self.send_response(200)
            self.send_header('Content-Type', mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
            self.send_header('Content-Length', str(os.fstat(source.fileno()).st_size))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('X-Frame-Options', 'SAMEORIGIN')
            if download: self.send_header('Content-Disposition', 'attachment; filename="hujie-public-website.zip"')
            self.end_headers()
            if self.command != 'HEAD':
                while chunk := source.read(128 * 1024): self.wfile.write(chunk)

    def do_HEAD(self): self.do_GET()

    def do_GET(self):
        if not self.allowed_host(): return self.fail(403, '此管理服务仅供本机访问。')
        path = unquote(urlsplit(self.path).path)
        try:
            if path == '/api/health': return self.respond(200, {'service': 'hujie-photo-manager'})
            if path == '/api/session':
                return self.respond(200, {'authenticated': bool(self.session()), 'setupRequired': not bool(self.library.auth()), 'token': self.library.token})
            if path == '/api/library':
                if not self.require_owner(): return
                with self.library.lock:
                    catalog = self.library.catalog()
                    return self.respond(200, {'photos': catalog['photos'], 'revision': catalog['revision'], 'storage': str(self.library.private)})
            if path == '/api/export':
                if not self.require_owner(): return
                return self.file(self.library.export(), download=True)
            if path == '/api/export/download':
                if not self.require_owner(): return
                return self.file(self.library.export_path, download=True)
            if path == '/gallery.json': return self.respond(200, {'photos': self.library.public_photos()})
            if path in ('/manage', '/manage/'):
                return self.file(self.library.root / 'manager' / 'index.html')
            if path in ('/manage.js', '/manage.css'):
                return self.file(self.library.root / 'manager' / path.lstrip('/'))
            match = re.fullmatch(r'/api/preview/([a-f0-9]{32})', path)
            public_match = re.fullmatch(r'/photos/([a-f0-9]{32})\.(jpg|png|gif|webp|avif)', path)
            if match or public_match:
                photo_id = (match or public_match).group(1)
                photo = next((p for p in self.library.catalog()['photos'] if p['id'] == photo_id), None)
                if not photo: return self.fail(404, '照片不存在。')
                if match or not photo['visible'] or photo['archived']:
                    if not self.require_owner(): return
                if public_match and public_match.group(2) != photo['previewType']: return self.fail(404, '照片不存在。')
                return self.file(self.library.private / 'photos' / photo_id / ('preview.' + photo['previewType']))
            if path.startswith('/api/'): return self.fail(404, '接口不存在。')
            relative = path.lstrip('/') or 'index.html'
            target = (self.library.public / relative).resolve()
            if not target.is_relative_to(self.library.public.resolve()) or any(p.startswith('.') for p in Path(relative).parts):
                return self.fail(404, '页面不存在。')
            if target.is_dir(): target = target / 'index.html'
            return self.file(target)
        except (BrokenPipeError, ConnectionResetError): pass
        except Exception:
            self.fail(500, '读取失败，请重启管理工具后重试。')

    def do_POST(self):
        if not self.allowed_host(): return self.fail(403, '此管理服务仅供本机访问。')
        expected_origin = 'http://' + self.headers.get('Host', '')
        if self.headers.get('Origin') not in (None, expected_origin): return self.fail(403, '请求来源不匹配。')
        if not secrets.compare_digest(self.headers.get('X-Local-Token', ''), self.library.token): return self.fail(403, '请刷新管理页后重试。')
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json': return self.fail(415, '请通过管理页提交。')
        path = urlsplit(self.path).path
        try:
            limit = MAX_UPLOAD_BODY if path == '/api/photos' else 128 * 1024
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > limit: return self.fail(413, '文件过大，单张原图请控制在 25 MB 内。')
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict): raise ValueError('请求格式不正确。')
            with self.library.lock:
                if path in ('/api/setup', '/api/login'):
                    now = time.time()
                    self.library.failed_logins = [t for t in self.library.failed_logins if now - t < 300]
                    if len(self.library.failed_logins) >= 8: return self.fail(429, '尝试次数较多，请 5 分钟后再试。')
                    if path == '/api/setup':
                        if self.library.auth(): return self.fail(409, '管理员已创建，请直接登录。')
                        self.library.create_owner(body.get('password'))
                    elif not self.library.password_matches(body.get('password')):
                        self.library.failed_logins.append(now)
                        return self.fail(401, '管理密码不正确。')
                    self.library.failed_logins.clear()
                    return self.respond(200, {'ok': True}, self.issue_session())
                if not self.require_owner(): return
                if path == '/api/logout':
                    self.library.sessions.pop(self.session(), None)
                    return self.respond(200, {'ok': True}, {'Set-Cookie': 'hj_owner=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'})
                if path == '/api/export/prepare':
                    self.library.export()
                    return self.respond(200, {'ok': True})
                catalog = self.library.catalog()
                if path == '/api/photos':
                    original = base64.b64decode(body.get('fileData', ''), validate=True)
                    preview = base64.b64decode(body.get('previewData', ''), validate=True)
                    if not original or len(original) > MAX_UPLOAD or not preview or len(preview) > MAX_PREVIEW:
                        raise ValueError('原图不能超过 25 MB，网页展示图不能超过 8 MB。')
                    original_type, preview_type = image_type(original), image_type(preview)
                    width, height = body.get('width'), body.get('height')
                    if type(width) is not int or type(height) is not int or width <= 0 or height <= 0 or width * height > 80000000:
                        raise ValueError('图片尺寸无效或过大，请先导出适合网页展示的尺寸。')
                    photo_id = uuid.uuid4().hex
                    folder = self.library.private / 'photos' / photo_id
                    folder.mkdir(parents=True)
                    (folder / ('original.' + original_type)).write_bytes(original)
                    (folder / ('preview.' + preview_type)).write_bytes(preview)
                    photo = {'id': photo_id, 'title': str(body.get('title') or '未命名作品')[:120], 'caption': '',
                             'category': '街头与日常', 'visible': False, 'archived': False,
                             'originalName': str(body.get('fileName', 'photo'))[:240], 'originalType': original_type,
                             'previewType': preview_type, 'width': width, 'height': height,
                             'createdAt': time.strftime('%Y-%m-%dT%H:%M:%S')}
                    catalog['photos'].append(photo)
                    self.library.save(catalog)
                    return self.respond(201, {'photo': photo})
                if path == '/api/order':
                    revision = body.get('revision')
                    if 'revision' in body and (type(revision) is not int or revision != catalog['revision']):
                        return self.fail(409, '作品列表已更新，请按最新顺序重试。')
                    ids = body.get('ids')
                    current = [p['id'] for p in catalog['photos'] if not p['archived']]
                    if not isinstance(ids, list) or len(ids) != len(current) or len(set(ids)) != len(ids) or set(ids) != set(current):
                        raise ValueError('作品顺序已变化，请刷新后重试。')
                    mapping = {photo_id: index for index, photo_id in enumerate(ids)}
                    catalog['photos'].sort(key=lambda p: mapping.get(p['id'], len(ids)))
                    self.library.save(catalog)
                    return self.respond(200, {'ok': True})
                match = re.fullmatch(r'/api/photos/([a-f0-9]{32})(?:/(archive|restore))?', path)
                if match:
                    photo = next((p for p in catalog['photos'] if p['id'] == match.group(1)), None)
                    if not photo: return self.fail(404, '照片不存在。')
                    action = match.group(2)
                    if action in ('archive', 'restore'):
                        photo['archived'] = action == 'archive'
                        photo['visible'] = False
                    else:
                        title, caption, category, visible = (body.get(k) for k in ('title', 'caption', 'category', 'visible'))
                        if not isinstance(title, str) or not title.strip() or len(title) > 120: raise ValueError('请填写 1–120 字的作品标题。')
                        if not isinstance(caption, str) or len(caption) > 2000: raise ValueError('作品说明请控制在 2000 字以内。')
                        if not isinstance(category, str) or not category.strip() or len(category) > 30: raise ValueError('分类请填写 1–30 字。')
                        if type(visible) is not bool: raise ValueError('展示状态不正确。')
                        photo.update(title=title.strip(), caption=caption, category=category.strip(), visible=visible and not photo['archived'])
                    self.library.save(catalog)
                    return self.respond(200, {'photo': photo})
                self.fail(404, '接口不存在。')
        except (ValueError, TypeError, KeyError) as error:
            self.fail(400, str(error) or '提交内容不正确。')
        except (BrokenPipeError, ConnectionResetError): pass
        except Exception:
            self.fail(500, '保存失败，请检查磁盘空间后重试。')

    def log_message(self, fmt, *args):
        # Never print request bodies, passwords, cookies, or query strings.
        print(time.strftime('%H:%M:%S'), self.command, urlsplit(self.path).path, flush=True)


def make_server(port=4173, root=ROOT, data=None):
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.library = Library(root, data)
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4173)
    parser.add_argument('--open', action='store_true')
    parser.add_argument('--reset-password', action='store_true')
    args = parser.parse_args()
    if args.reset_password:
        from getpass import getpass
        password = getpass(f'New management password (at least {MIN_PASSWORD_LENGTH} characters): ')
        confirmation = getpass('Confirm new password: ')
        if password != confirmation:
            print('Passwords do not match. Nothing changed.')
            raise SystemExit(1)
        try:
            Library().create_owner(password)
        except ValueError:
            print(f'Use {MIN_PASSWORD_LENGTH} to {MAX_PASSWORD_LENGTH} characters. Nothing changed.')
            raise SystemExit(1)
        print('Management password updated. Existing sessions have been invalidated.')
        raise SystemExit(0)
    try:
        server = make_server(args.port)
    except OSError:
        if args.open:
            try:
                from urllib.request import build_opener, ProxyHandler
                opener = build_opener(ProxyHandler({}))
                with opener.open(f'http://127.0.0.1:{args.port}/api/health', timeout=2) as response:
                    existing = json.load(response)
                if existing.get('service') == 'hujie-photo-manager':
                    webbrowser.open(f'http://127.0.0.1:{args.port}/manage')
                    raise SystemExit(0)
            except (OSError, ValueError):
                pass
        print(f'Port {args.port} is in use. Close the old preview or choose --port 4174.')
        raise SystemExit(1)
    url = f'http://127.0.0.1:{args.port}'
    print(f'Homepage: {url}/\nPhoto manager: {url}/manage\nKeep this process running while editing.', flush=True)
    if args.open: threading.Timer(.6, lambda: webbrowser.open(url + '/manage')).start()
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
