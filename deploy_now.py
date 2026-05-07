"""Full redeploy: upload backend + frontend dist, install deps, restart PM2

Credentials are read from environment variables to avoid hardcoding secrets.
Set the following before running:
    DEPLOY_HOST        - server IP/hostname  (default: 45.90.223.131)
    DEPLOY_USER        - SSH username        (default: novusdev)
    DEPLOY_PASS        - SSH password        (required)
    DEPLOY_JWT_SECRET  - JWT secret for .env (required)
    DEPLOY_NOTEIFY_KEY - Noteify API key     (required)
"""
import paramiko
import os
import sys
import subprocess
import shutil

HOST     = os.environ.get('DEPLOY_HOST', '45.90.223.131')
USER     = os.environ.get('DEPLOY_USER', 'novusdev')
PASS     = os.environ.get('DEPLOY_PASS', '')
JWT_SECRET   = os.environ.get('DEPLOY_JWT_SECRET', '')
NOTEIFY_KEY  = os.environ.get('DEPLOY_NOTEIFY_KEY', '')
APP_DIR  = '/var/www/dev.anydb.pro'
LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))

# --- Validate required secrets ---
missing = [k for k, v in [('DEPLOY_PASS', PASS), ('DEPLOY_JWT_SECRET', JWT_SECRET), ('DEPLOY_NOTEIFY_KEY', NOTEIFY_KEY)] if not v]
if missing:
    print(f"ERROR: Required environment variable(s) not set: {', '.join(missing)}")
    print("Set them before running:  $env:DEPLOY_PASS='...'  (PowerShell)")
    sys.exit(1)

def run_local(cmd, cwd):
    print(f"\n>>> [local] {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if result.stdout.strip():
        sys.stdout.buffer.write(result.stdout.encode('utf-8', errors='replace'))
        sys.stdout.buffer.write(b'\n')
    if result.stderr.strip():
        sys.stdout.buffer.write(result.stderr.encode('utf-8', errors='replace'))
        sys.stdout.buffer.write(b'\n')
    return result.returncode

def npm_bin():
    if os.name == 'nt':
        return shutil.which('npm.cmd') or 'npm.cmd'
    return shutil.which('npm') or 'npm'

def run(ssh, cmd, timeout=180):
    print(f"\n>>> {cmd[:200]}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    combined = out + err
    if combined.strip():
        text = combined[-3000:] if len(combined) > 3000 else combined
        sys.stdout.buffer.write(text.encode('utf-8', errors='replace'))
        sys.stdout.buffer.write(b'\n')
        sys.stdout.buffer.flush()
    return out, err, code

def sudo(ssh, cmd, timeout=120):
    """Run a sudo command safely — password sent via stdin, not shell args."""
    full_cmd = f"sudo -S bash -c '{cmd}'"
    print(f"\n>>> [sudo] {cmd[:200]}")
    stdin, stdout, stderr = ssh.exec_command(full_cmd, timeout=timeout)
    stdin.write(PASS + '\n')
    stdin.flush()
    stdin.channel.shutdown_write()
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    combined = out + err
    if combined.strip():
        text = combined[-3000:] if len(combined) > 3000 else combined
        sys.stdout.buffer.write(text.encode('utf-8', errors='replace'))
        sys.stdout.buffer.write(b'\n')
        sys.stdout.buffer.flush()
    return out, err, code

def upload_dir(sftp, local_path, remote_path, exclude=None):
    """Recursively upload a directory"""
    exclude = exclude or set()
    for item in os.listdir(local_path):
        if item in exclude:
            continue
        local = os.path.join(local_path, item)
        remote = f"{remote_path}/{item}"
        if os.path.isdir(local):
            try:
                sftp.stat(remote)
            except:
                sftp.mkdir(remote)
            upload_dir(sftp, local, remote, exclude)
        else:
            size = os.path.getsize(local)
            if size > 50 * 1024 * 1024:
                continue
            print(f"  uploading {item} ({size//1024}KB)")
            sftp.put(local, remote)

print("=" * 50)
print("  SMYTHE DEPLOYMENT TO dev.anydb.pro")
print("=" * 50)

ssh = paramiko.SSHClient()
# Load known hosts for host key verification
known_hosts_path = os.path.expanduser('~/.ssh/known_hosts')
if os.path.exists(known_hosts_path):
    ssh.load_host_keys(known_hosts_path)
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    print(f"Using known_hosts: {known_hosts_path}")
else:
    # First-time deploy: warn and accept, then save
    print("WARNING: ~/.ssh/known_hosts not found. Accepting host key for first-time deploy.")
    print("         After this run, add the server fingerprint to known_hosts for future security.")
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

print("\nConnecting to server...")
ssh.connect(HOST, username=USER, password=PASS)
sftp = ssh.open_sftp()
print("Connected!")

# --- 1. Upload backend ---
print("\n=== 1/7 Upload Backend ===")
for d in ['backend', 'backend/config', 'backend/controllers', 'backend/middleware',
          'backend/models', 'backend/routes', 'backend/services', 'backend/utils',
          'backend/scripts']:
    try:
        sftp.stat(f"{APP_DIR}/{d}")
    except:
        sftp.mkdir(f"{APP_DIR}/{d}")

upload_dir(sftp, os.path.join(LOCAL_DIR, 'backend'), f"{APP_DIR}/backend",
           exclude={'node_modules', 'uploads', '.env', 'package-lock.json'})

# --- 2. Upload frontend dist ---
print("\n=== 2/7 Upload Frontend Dist ===")
# Build frontend to ensure latest source changes are included
frontend_dir = os.path.join(LOCAL_DIR, 'frontend')
if run_local([npm_bin(), 'run', 'build'], cwd=frontend_dir) != 0:
    print("  ERROR: frontend build failed. Deployment aborted.")
    ssh.close()
    sys.exit(1)

# Clean old dist first
run(ssh, f"rm -rf {APP_DIR}/frontend/dist")
for d in ['frontend', 'frontend/dist']:
    try:
        sftp.stat(f"{APP_DIR}/{d}")
    except:
        sftp.mkdir(f"{APP_DIR}/{d}")

dist_path = os.path.join(frontend_dir, 'dist')
if os.path.exists(dist_path):
    upload_dir(sftp, dist_path, f"{APP_DIR}/frontend/dist")
else:
    print("  ERROR: frontend/dist not found! Run 'npm run build' in frontend first.")
    sys.exit(1)

# --- 3. Write production .env from env vars ---
print("\n=== 3/7 Write Production .env ===")
env_content = f"""# Server
PORT=5000
NODE_ENV=production
CLIENT_URL=https://dev.anydb.pro
ALLOWED_ORIGINS=https://dev.anydb.pro

# MongoDB
MONGO_URI=mongodb://localhost:27017/smythe

# Auth
JWT_SECRET={JWT_SECRET}
JWT_EXPIRES_IN=7d

# Email Notifications (Noteify)
NOTEIFY_API_KEY={NOTEIFY_KEY}
"""
with sftp.open(f"{APP_DIR}/backend/.env", 'w') as f:
    f.write(env_content)
print("  .env written")

sftp.close()

# --- 4. Install backend deps ---
print("\n=== 4/7 Install Backend Dependencies ===")
run(ssh, f"cd {APP_DIR}/backend && npm install --production 2>&1 | tail -10", timeout=120)

# --- 5. Ensure uploads dir ---
print("\n=== 5/7 Create uploads dir ===")
run(ssh, f"mkdir -p {APP_DIR}/backend/uploads && chmod 755 {APP_DIR}/backend/uploads")

# --- 6. Restart PM2 ---
print("\n=== 6/7 Restart Backend (PM2) ===")
run(ssh, f"cd {APP_DIR}/backend && pm2 delete smythe-api 2>/dev/null; pm2 delete scards-api 2>/dev/null; pm2 start server.js --name smythe-api && pm2 save", timeout=30)
run(ssh, "sleep 3 && pm2 logs smythe-api --lines 8 --nostream")

# --- 7. Configure & reload Nginx ---
print("\n=== 7/7 Configure Nginx ===")
nginx_conf = """server {
    listen 80;
    server_name dev.anydb.pro;

    root /var/www/dev.anydb.pro/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 30M;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
"""
run(ssh, f"""cat << 'NGINXEOF' > /tmp/smythe-nginx.conf
{nginx_conf}
NGINXEOF
""")
sudo(ssh, "cp /tmp/smythe-nginx.conf /etc/nginx/sites-available/dev.anydb.pro", 10)
sudo(ssh, "ln -sf /etc/nginx/sites-available/dev.anydb.pro /etc/nginx/sites-enabled/dev.anydb.pro", 10)
sudo(ssh, "rm -f /etc/nginx/sites-enabled/default", 10)
sudo(ssh, "nginx -t 2>&1 && systemctl reload nginx && echo nginx_ok", 15)

# Re-run certbot if SSL not already set up
sudo(ssh, "certbot --nginx -d dev.anydb.pro --non-interactive --agree-tos --email admin@anydb.pro --redirect 2>&1 | tail -5", 60)

# --- Final verification ---
print("\n=== VERIFICATION ===")
run(ssh, "curl -s http://localhost:5000/api/health")
run(ssh, "curl -sI https://dev.anydb.pro 2>/dev/null | head -5")

ssh.close()
print("\n" + "=" * 50)
print("  DEPLOYMENT COMPLETE!")
print("  App live at: https://dev.anydb.pro")
print("=" * 50)
