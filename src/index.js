// Cloudflare Worker: pan-worker
// Self-contained Private Cloud Drive with Web UI + S3-like API

const AUTH_HASH = "MjY3MjY1MzkwMjpxd2UxMjM0NTY="; // Base64 of '2672653902:qwe123456'
const SHARE_SECRET = "mao_cyber_pan_key_2026"; // Secret for signing share links

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Serve HTML frontend
        if (url.pathname === "/") {
            return new Response(getHTMLPage(), {
                headers: { "Content-Type": "text/html; charset=utf-8" }
            });
        }

        // --- PUBLIC FILE ACCESS (DOWNLOAD) ---
        if (url.pathname.startsWith("/file/")) {
            const filename = decodeURIComponent(url.pathname.substring(6));
            const token = url.searchParams.get("token");

            // Verify authentication
            let authorized = false;

            // Method A: Check Share Token
            if (token) {
                const expectedToken = await generateHash(filename + SHARE_SECRET);
                if (token === expectedToken) {
                    authorized = true;
                }
            }

            // Method B: Check Basic Auth Header
            if (!authorized) {
                const authHeader = request.headers.get("Authorization");
                if (authHeader && authHeader === `Basic ${AUTH_HASH}`) {
                    authorized = true;
                }
            }

            if (!authorized) {
                return new Response("Unauthorized", {
                    status: 401,
                    headers: { "WWW-Authenticate": 'Basic realm="Mao Private Cloud"' }
                });
            }

            // Fetch from R2
            try {
                const object = await env.BUCKET.get(filename);
                if (object === null) {
                    return new Response("File Not Found", { status: 404 });
                }

                const headers = new Headers();
                object.writeHttpMetadata(headers);
                headers.set("etag", object.httpEtag);
                
                // Force download disposition for generic files, inline for images/PDFs
                const ext = filename.split(".").pop().toLowerCase();
                const inlineExts = ["jpg", "jpeg", "png", "gif", "pdf", "txt", "mp3", "mp4"];
                if (!inlineExts.includes(ext)) {
                    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
                }

                return new Response(object.body, { headers });
            } catch (err) {
                return new Response("Storage Error: " + err.message, { status: 500 });
            }
        }

        // --- API GATEWAY (REQUIRES AUTH) ---
        const authHeader = request.headers.get("Authorization");
        if (!authHeader || authHeader !== `Basic ${AUTH_HASH}`) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }

        // API: List Files
        if (url.pathname === "/api/list") {
            try {
                const objects = await env.BUCKET.list();
                const list = objects.objects.map(obj => ({
                    key: obj.key,
                    size: obj.size,
                    uploaded: obj.uploaded
                }));
                return new Response(JSON.stringify({ files: list }), {
                    headers: { "Content-Type": "application/json" }
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), { status: 500 });
            }
        }

        // API: Upload File
        if (url.pathname === "/api/upload") {
            if (request.method !== "POST") {
                return new Response("Method not allowed", { status: 405 });
            }
            const filename = url.searchParams.get("name");
            if (!filename) {
                return new Response("Missing file name parameter", { status: 400 });
            }

            try {
                const contentType = request.headers.get("Content-Type") || "application/octet-stream";
                await env.BUCKET.put(filename, request.body, {
                    httpMetadata: { contentType: contentType }
                });
                return new Response(JSON.stringify({ success: true }), {
                    headers: { "Content-Type": "application/json" }
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), { status: 500 });
            }
        }

        // API: Delete File
        if (url.pathname === "/api/delete") {
            if (request.method !== "DELETE" && request.method !== "POST") {
                return new Response("Method not allowed", { status: 405 });
            }
            const filename = url.searchParams.get("name");
            if (!filename) {
                return new Response("Missing file name parameter", { status: 400 });
            }

            try {
                await env.BUCKET.delete(filename);
                return new Response(JSON.stringify({ success: true }), {
                    headers: { "Content-Type": "application/json" }
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), { status: 500 });
            }
        }

        // API: Generate Share Link
        if (url.pathname === "/api/share") {
            const filename = url.searchParams.get("name");
            if (!filename) {
                return new Response("Missing file name parameter", { status: 400 });
            }

            const token = await generateHash(filename + SHARE_SECRET);
            const shareUrl = `${url.origin}/file/${encodeURIComponent(filename)}?token=${token}`;
            return new Response(JSON.stringify({ url: shareUrl }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response("Endpoint not found", { status: 404 });
    }
};

// Cryptographic hash helper (SHA-256)
async function generateHash(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Client HTML Dashboard template
function getHTMLPage() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mao Portal OS - 赛博云盘</title>
    <!-- Modern Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Noto+Sans+SC:wght@300;400;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-black: #030306;
            --bg-glass: rgba(10, 10, 20, 0.72);
            --border-cyan: rgba(0, 229, 255, 0.18);
            --border-glow-cyan: 0 0 10px rgba(0, 229, 255, 0.25);
            --border-glow-green: 0 0 10px rgba(100, 255, 218, 0.25);
            --neon-cyan: #00e5ff;
            --neon-green: #64ffda;
            --neon-red: #ff3366;
            --text-primary: #ffffff;
            --text-secondary: #9ba0c0;
            --text-muted: #5e647c;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background-color: var(--bg-black);
            color: var(--text-primary);
            font-family: 'Outfit', 'Noto Sans SC', sans-serif;
            overflow-x: hidden;
            min-height: 100vh;
            position: relative;
        }

        /* Starry background */
        #bg-canvas {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            z-index: -2; pointer-events: none;
        }
        .bg-grid {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background-image: linear-gradient(rgba(0, 229, 255, 0.02) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(0, 229, 255, 0.02) 1px, transparent 1px);
            background-size: 40px 40px;
            z-index: -1; pointer-events: none;
        }

        /* Main structure */
        header {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 70px;
            background: rgba(4, 4, 8, 0.7);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-bottom: 1px solid var(--border-cyan);
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 40px;
            z-index: 100;
        }
        .logo {
            font-size: 20px;
            font-weight: 800;
            letter-spacing: 2px;
        }
        .logo span { color: var(--neon-cyan); text-shadow: var(--border-glow-cyan); }
        
        .nav-btn {
            background: transparent;
            border: 1px solid var(--border-cyan);
            color: var(--neon-cyan);
            padding: 8px 16px;
            font-weight: 600;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.3s ease;
            text-decoration: none;
            font-size: 13px;
        }
        .nav-btn:hover {
            box-shadow: var(--border-glow-cyan);
            background: rgba(0, 229, 255, 0.05);
        }
        .btn-logout { border-color: var(--neon-red); color: var(--neon-red); }
        .btn-logout:hover {
            box-shadow: 0 0 10px rgba(255, 51, 102, 0.25);
            background: rgba(255, 51, 102, 0.05);
        }

        /* Container */
        .container {
            max-width: 1000px;
            margin: 110px auto 40px;
            padding: 0 20px;
            display: flex;
            flex-direction: column;
            gap: 30px;
        }

        /* Card panels */
        .glass-card {
            background: var(--bg-glass);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--border-cyan);
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            position: relative;
        }

        /* Drag Upload area */
        .upload-zone {
            border: 2px dashed rgba(0, 229, 255, 0.3);
            border-radius: 6px;
            padding: 40px 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            background: rgba(0,0,0,0.2);
        }
        .upload-zone:hover, .upload-zone.dragover {
            border-color: var(--neon-green);
            box-shadow: var(--border-glow-green);
            background: rgba(100, 255, 218, 0.02);
        }
        .upload-icon { font-size: 38px; color: var(--neon-cyan); }
        .upload-zone:hover .upload-icon { color: var(--neon-green); }
        .upload-title { font-weight: 700; font-size: 15px; }
        .upload-sub { font-size: 12px; color: var(--text-muted); }
        #file-input { display: none; }

        /* Progress bars */
        .progress-container {
            margin-top: 15px;
            display: none;
        }
        .progress-bar-bg {
            background: rgba(255,255,255,0.05);
            height: 6px;
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 8px;
        }
        .progress-bar-fill {
            background: var(--neon-green);
            box-shadow: var(--border-glow-green);
            height: 100%;
            width: 0%;
            transition: width 0.1s ease;
        }
        .progress-text {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: var(--text-secondary);
        }

        /* File listing */
        .file-list-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px dashed rgba(255,255,255,0.06);
            padding-bottom: 15px;
            margin-bottom: 15px;
        }
        .file-list-title { font-size: 16px; font-weight: 800; letter-spacing: 0.5px; }
        
        .files-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
            max-height: 500px;
            overflow-y: auto;
            padding-right: 4px;
        }
        .file-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 20px;
            background: rgba(0,0,0,0.25);
            border: 1px solid rgba(255,255,255,0.02);
            border-radius: 6px;
            transition: all 0.2s ease;
        }
        .file-item:hover {
            border-color: var(--border-cyan);
            background: rgba(0, 229, 255, 0.02);
        }
        .file-info {
            display: flex;
            align-items: center;
            gap: 16px;
            overflow: hidden;
            width: 60%;
        }
        .file-icon {
            font-size: 24px;
            display: flex;
            align-items: center;
        }
        .file-meta {
            display: flex;
            flex-direction: column;
            gap: 4px;
            overflow: hidden;
        }
        .file-name {
            font-size: 14px;
            font-weight: 600;
            color: #ffffff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .file-specs {
            font-size: 11px;
            color: var(--text-muted);
            font-family: var(--font-mono);
            display: flex;
            gap: 10px;
        }

        .file-actions {
            display: flex;
            gap: 12px;
        }
        .action-btn {
            background: none;
            border: 1px solid var(--text-muted);
            color: var(--text-secondary);
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .action-btn:hover {
            border-color: var(--neon-cyan);
            color: var(--neon-cyan);
            box-shadow: var(--border-glow-cyan);
        }
        .action-btn.btn-delete:hover {
            border-color: var(--neon-red);
            color: var(--neon-red);
            box-shadow: 0 0 8px rgba(255,51,102,0.2);
        }

        /* Toasts */
        .toast-container {
            position: fixed;
            top: 24px; right: 24px;
            z-index: 1000;
            display: flex; flex-direction: column; gap: 10px;
        }
        .toast {
            background: #090912;
            border: 1px solid var(--border-cyan);
            padding: 12px 24px;
            border-radius: 4px;
            box-shadow: 0 10px 20px rgba(0,0,0,0.6);
            transform: translateX(120%);
            transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            font-size: 13.5px;
            display: flex; align-items: center; gap: 10px;
        }
        .toast.show { transform: translateX(0); }
        .toast.success { border-left: 4px solid var(--neon-green); }
        .toast.error { border-left: 4px solid var(--neon-red); }

        /* Login layout */
        #login-screen {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
        }
        .login-card {
            width: 100%;
            max-width: 400px;
            background: var(--bg-glass);
            border: 1px solid var(--border-cyan);
            border-radius: 8px;
            padding: 35px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.6);
        }
        .login-header {
            text-align: center;
            margin-bottom: 30px;
        }
        .login-header h2 {
            font-size: 22px;
            font-weight: 800;
            letter-spacing: 1px;
            margin-bottom: 8px;
            color: var(--neon-cyan);
            text-shadow: var(--border-glow-cyan);
        }
        .login-header p { font-size: 12px; color: var(--text-secondary); }
        .form-group {
            margin-bottom: 20px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .form-group label {
            font-size: 12px;
            color: var(--text-secondary);
            font-weight: 600;
            text-transform: uppercase;
        }
        .form-input {
            width: 100%;
            background: rgba(0,0,0,0.4);
            border: 1px solid var(--border-cyan);
            color: #ffffff;
            padding: 12px;
            border-radius: 4px;
            outline: none;
            font-family: inherit;
            transition: all 0.3s ease;
        }
        .form-input:focus {
            border-color: var(--neon-cyan);
            box-shadow: 0 0 6px rgba(0,229,255,0.15);
        }
        .login-btn {
            width: 100%;
            background: transparent;
            border: 1px solid var(--neon-cyan);
            color: var(--neon-cyan);
            padding: 12px;
            font-weight: 700;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 10px;
        }
        .login-btn:hover {
            background: rgba(0, 229, 255, 0.05);
            box-shadow: var(--border-glow-cyan);
        }
    </style>
</head>
<body>

    <div class="bg-grid"></div>
    <canvas id="bg-canvas"></canvas>
    <div id="toast-container" class="toast-container"></div>

    <!-- Login Screen -->
    <section id="login-screen">
        <div class="login-card">
            <div class="login-header">
                <h2>PORTAL PAN OS</h2>
                <p>宿舍与实验室 · 私有跨设备网盘</p>
            </div>
            <form id="login-form">
                <div class="form-group">
                    <label>管理账号</label>
                    <input type="text" id="username" class="form-input" placeholder="输入账号" required>
                </div>
                <div class="form-group">
                    <label>验证密码</label>
                    <input type="password" id="password" class="form-input" placeholder="输入密码" required>
                </div>
                <button type="submit" class="login-btn">解密登录</button>
            </form>
        </div>
    </section>

    <!-- Main Workspace -->
    <div id="app-workspace" style="display: none;">
        <header>
            <div class="logo">MAO_PAN<span>_OS</span></div>
            <div>
                <button class="nav-btn btn-logout" id="logout-btn">退出网盘</button>
            </div>
        </header>

        <main class="container">
            <!-- Upload Panel -->
            <section class="glass-card">
                <div class="upload-zone" id="upload-dropzone">
                    <div class="upload-icon">📤</div>
                    <div class="upload-title">点击或拖拽文件到此处上传</div>
                    <div class="upload-sub">支持课件、实验数据等任意大小文件 (最大 10GB 免费空间)</div>
                    <input type="file" id="file-input">
                </div>

                <!-- Progress container -->
                <div class="progress-container" id="upload-progress-container">
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" id="upload-progress-fill"></div>
                    </div>
                    <div class="progress-text">
                        <span id="upload-status-text">准备上传...</span>
                        <span id="upload-percent-text">0%</span>
                    </div>
                </div>
            </section>

            <!-- File List Panel -->
            <section class="glass-card">
                <div class="file-list-header">
                    <h2 class="file-list-title">文件库列表 (<span id="file-count">0</span>)</h2>
                    <button class="nav-btn" onclick="fetchFilesList()">🔄 刷新列表</button>
                </div>
                <div class="files-container" id="files-container-list">
                    <div style="text-align: center; color: var(--text-muted); padding: 40px 0;">
                        列表加载中...
                    </div>
                </div>
            </section>
        </main>
    </div>

    <script>
        // Starry background canvas
        function initStars() {
            const canvas = document.getElementById('bg-canvas');
            if(!canvas) return;
            const ctx = canvas.getContext('2d');
            let stars = [];
            
            function resize() {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }
            window.addEventListener('resize', resize);
            resize();

            for (let i = 0; i < 60; i++) {
                stars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    size: Math.random() * 1.5 + 0.2,
                    speed: (Math.random() - 0.5) * 0.1,
                    opacity: Math.random()
                });
            }

            function animate() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#ffffff';
                stars.forEach(star => {
                    ctx.globalAlpha = star.opacity;
                    ctx.beginPath();
                    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
                    ctx.fill();
                    star.x += star.speed;
                    if (star.x < 0) star.x = canvas.width;
                    if (star.x > canvas.width) star.x = 0;
                    star.opacity += (Math.random() - 0.5) * 0.05;
                    if (star.opacity < 0.1) star.opacity = 0.1;
                    if (star.opacity > 0.9) star.opacity = 0.9;
                });
                requestAnimationFrame(animate);
            }
            animate();
        }
        initStars();

        // Global state variables
        let authToken = "";

        // Alerts / Toasts
        function showToast(message, type = "success") {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = 'toast ' + type;
            
            const icon = type === "success" ? "✅" : "❌";
            toast.innerHTML = '<span>' + icon + '</span><div>' + message + '</div>';
            
            container.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        // Login Handler
        const loginForm = document.getElementById('login-form');
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = document.getElementById('username').value.trim();
            const pass = document.getElementById('password').value;
            
            // Generate basic auth token
            const token = btoa(user + ":" + pass);
            
            // Verify token
            showToast("凭证校验中...", "success");
            const verifySuccess = await verifyCredentials(token);
            if (verifySuccess) {
                authToken = token;
                localStorage.setItem('pan_auth_token', token);
                showToast("解密登录成功！进入极客文件管理", "success");
                enterApp();
            } else {
                showToast("管理员账号或密码验证失败，请重新输入", "error");
            }
        });

        // Verification call
        async function verifyCredentials(token) {
            try {
                const res = await fetch("/api/list", {
                    headers: { "Authorization": "Basic " + token }
                });
                return res.status === 200;
            } catch (err) {
                return false;
            }
        }

        // Page check on load
        window.addEventListener('DOMContentLoaded', async () => {
            const cachedToken = localStorage.getItem('pan_auth_token');
            if (cachedToken) {
                const valid = await verifyCredentials(cachedToken);
                if (valid) {
                    authToken = cachedToken;
                    enterApp();
                } else {
                    localStorage.removeItem('pan_auth_token');
                }
            }
        });

        function enterApp() {
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('app-workspace').style.display = 'block';
            fetchFilesList();
        }

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => {
            localStorage.removeItem('pan_auth_token');
            location.reload();
        });

        // Format File Size
        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        // Format Date
        function formatDate(dateStr) {
            const d = new Date(dateStr);
            return d.getFullYear() + '-' + 
                   (d.getMonth() + 1).toString().padStart(2, '0') + '-' + 
                   d.getDate().toString().padStart(2, '0') + ' ' + 
                   d.getHours().toString().padStart(2, '0') + ':' + 
                   d.getMinutes().toString().padStart(2, '0');
        }

        // Get file type icon
        function getFileIcon(filename) {
            const ext = filename.split('.').pop().toLowerCase();
            const pdf = ["pdf"];
            const img = ["jpg", "jpeg", "png", "gif", "svg", "webp"];
            const doc = ["doc", "docx", "txt", "md"];
            const ppt = ["ppt", "pptx"];
            const xls = ["xls", "xlsx", "csv"];
            const zip = ["zip", "rar", "7z", "tar", "gz"];
            const media = ["mp3", "wav", "mp4", "mkv", "avi"];

            if (pdf.includes(ext)) return '📕';
            if (img.includes(ext)) return '🖼️';
            if (doc.includes(ext)) return '📄';
            if (ppt.includes(ext)) return '📙';
            if (xls.includes(ext)) return '📊';
            if (zip.includes(ext)) return '📦';
            if (media.includes(ext)) return '🎬';
            return '📁';
        }

        // Fetch List
        async function fetchFilesList() {
            const container = document.getElementById('files-container-list');
            try {
                const res = await fetch('/api/list', {
                    headers: { "Authorization": "Basic " + authToken }
                });
                const data = await res.json();
                
                if (data.error) {
                    throw new Error(data.error);
                }

                const files = data.files || [];
                document.getElementById('file-count').innerText = files.length;

                if (files.length === 0) {
                    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">网盘中暂无文件。开始上传您的课件吧！</div>';
                    return;
                }

                container.innerHTML = '';
                files.forEach(file => {
                    const item = document.createElement('div');
                    item.className = 'file-item';
                    
                    const icon = getFileIcon(file.key);
                    const size = formatBytes(file.size);
                    const date = formatDate(file.uploaded);

                    item.innerHTML = `
                        <div class="file-info">
                            <div class="file-icon">${icon}</div>
                            <div class="file-meta">
                                <div class="file-name" title="${file.key}">${file.key}</div>
                                <div class="file-specs">
                                    <span>${size}</span>
                                    <span>•</span>
                                    <span>${date}</span>
                                </div>
                            </div>
                        </div>
                        <div class="file-actions">
                            <button class="action-btn" onclick="downloadFile('${file.key}')">下载</button>
                            <button class="action-btn" onclick="shareFile('${file.key}')">复制分享</button>
                            <button class="action-btn btn-delete" onclick="deleteFile('${file.key}')">删除</button>
                        </div>
                    `;
                    container.appendChild(item);
                });
            } catch (err) {
                console.error(err);
                container.innerHTML = '<div style="text-align: center; color: var(--neon-red); padding: 40px 0;">加载列表失败，请刷新重试</div>';
            }
        }

        // Download
        function downloadFile(filename) {
            // Trigger direct file download with basic auth
            const link = document.createElement('a');
            link.href = '/file/' + encodeURIComponent(filename);
            
            // We download using window fetch + blob to inject the basic auth header!
            showToast("正在请求数据...", "success");
            fetch(link.href, {
                headers: { "Authorization": "Basic " + authToken }
            })
            .then(res => {
                if (!res.ok) throw new Error("Fetch failed");
                return res.blob();
            })
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            })
            .catch(err => {
                showToast("下载失败", "error");
            });
        }

        // Copy Share Link
        async function shareFile(filename) {
            try {
                const res = await fetch('/api/share?name=' + encodeURIComponent(filename), {
                    headers: { "Authorization": "Basic " + authToken }
                });
                const data = await res.json();
                if (data.url) {
                    navigator.clipboard.writeText(data.url);
                    showToast("分享链接已复制到剪贴板！可免登直接下载", "success");
                } else {
                    throw new Error("Missing url");
                }
            } catch (err) {
                showToast("复制分享链接失败", "error");
            }
        }

        // Delete
        async function deleteFile(filename) {
            if (!confirm('您确定要彻底删除文件 ' + filename + ' 吗？此操作不可逆。')) return;

            showToast("正在删除文件...", "success");
            try {
                const res = await fetch('/api/delete?name=' + encodeURIComponent(filename), {
                    method: 'POST', // Supports POST/DELETE
                    headers: { "Authorization": "Basic " + authToken }
                });
                const data = await res.json();
                if (data.success) {
                    showToast("文件已删除", "success");
                    fetchFilesList();
                } else {
                    throw new Error(data.error);
                }
            } catch (err) {
                showToast("删除失败", "error");
            }
        }

        // Drag and Drop Upload logic
        const dropzone = document.getElementById('upload-dropzone');
        const fileInput = document.getElementById('file-input');
        const progressContainer = document.getElementById('upload-progress-container');
        const progressFill = document.getElementById('upload-progress-fill');
        const statusText = document.getElementById('upload-status-text');
        const percentText = document.getElementById('upload-percent-text');

        dropzone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => handleFiles(fileInput.files));

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            handleFiles(e.dataTransfer.files);
        });

        function handleFiles(files) {
            if (files.length === 0) return;
            const file = files[0];
            
            progressContainer.style.display = 'block';
            statusText.innerText = '正在上传 ' + file.name + '...';
            percentText.innerText = '0%';
            progressFill.style.width = '0%';

            const xhr = new XMLHttpRequest();
            const uploadUrl = '/api/upload?name=' + encodeURIComponent(file.name);
            
            xhr.open('POST', uploadUrl, true);
            xhr.setRequestHeader('Authorization', 'Basic ' + authToken);
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    progressFill.style.width = percent + '%';
                    percentText.innerText = percent + '%';
                }
            };

            xhr.onload = () => {
                if (xhr.status === 200) {
                    showToast("文件上传成功！", "success");
                    statusText.innerText = '上传完成！';
                    setTimeout(() => progressContainer.style.display = 'none', 1000);
                    fetchFilesList();
                } else {
                    showToast("上传失败", "error");
                    statusText.innerText = '上传失败';
                }
            };

            xhr.onerror = () => {
                showToast("上传发生错误", "error");
                statusText.innerText = '上传错误';
            };

            xhr.send(file);
        }
    </script>
</body>
</html>`;
}
