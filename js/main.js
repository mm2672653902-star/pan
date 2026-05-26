// Starry Canvas Animation
function initStarfield() {
    const canvas = document.getElementById('star-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let stars = [];
    const starCount = 60;
    
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();
    
    for (let i = 0; i < starCount; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 1.5 + 0.2,
            speed: (Math.random() - 0.5) * 0.1,
            opacity: Math.random()
        });
    }
    
    function draw() {
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
        requestAnimationFrame(draw);
    }
    draw();
}

// Cryptography settings (matching the blog admin encryption keys)
const CRYPTO_CONFIG = {
    salt: "85b2cd5f7ef3cd96682bf093a7aa8909",
    iv: "84f5fee5103de2667c39e9ba",
    ciphertext: "6eee9a4adeebbf50fa0c68e4a26e99fa82020965063747c3aaa62d8efcbcd514931e36a80bd013a3",
    authTag: "684642e169e38a354d23b1fae2251897"
};

const REPO_OWNER = "mm2672653902-star";
const STORAGE_REPO = "pan-data";
const BRANCH = "main";

// State variables
let gitHubToken = "";
let cachedFilesList = []; // Holds { name, path, sha, size, type }
let isStorageRepoPrivate = true; // Cached visibility of storage repo

// Convert Hex string to Uint8Array
function hexToBytes(hex) {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < arr.length; i++) {
        arr[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return arr;
}

// Decrypt Token with User PIN
async function decryptToken(username, password) {
    const pin = `${username}:${password}`;
    const enc = new TextEncoder();
    
    try {
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(pin),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );
        
        const key = await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: hexToBytes(CRYPTO_CONFIG.salt),
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["decrypt"]
        );

        const fullCiphertext = hexToBytes(CRYPTO_CONFIG.ciphertext + CRYPTO_CONFIG.authTag);
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: hexToBytes(CRYPTO_CONFIG.iv)
            },
            key,
            fullCiphertext
        );

        return new TextDecoder().decode(decryptedBuffer);
    } catch (error) {
        console.error("Decryption failed:", error);
        return null;
    }
}

// Toast alerts helper
function showToast(message, type = "success") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === "success" ? "✅" : "❌";
    toast.innerHTML = `<span>${icon}</span><div>${message}</div>`;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Custom UTF-8 Safe Base64 Helper
function utf8_to_b64(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
        return String.fromCharCode('0x' + p1);
    }));
}

// HTTP API Wrapper
async function githubRequest(endpoint, options = {}, isRaw = false) {
    const url = `https://api.github.com${endpoint}`;
    const headers = {
        'Authorization': `token ${gitHubToken}`,
        'Accept': isRaw ? 'application/vnd.github.v3.raw' : 'application/vnd.github.v3+json',
        ...options.headers
    };

    const response = await fetch(url, { ...options, headers });
    
    if (response.status === 401) {
        showToast("凭证过期，请重新登录", "error");
        handleLogout();
        throw new Error("Unauthorized");
    }

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `API error ${response.status}`);
    }

    if (isRaw) {
        return response.blob();
    }
    return response.json();
}

// Check if logged in on load
window.addEventListener('DOMContentLoaded', async () => {
    initStarfield();
    
    const cachedToken = localStorage.getItem('MAO_PAN_TOKEN');
    if (cachedToken) {
        gitHubToken = cachedToken;
        enterApp();
    }
});

// Login Handler
const loginForm = document.getElementById('login-form');
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value;
    
    showToast("身份解密中...", "success");
    
    const decrypted = await decryptToken(user, pass);
    if (decrypted && decrypted.startsWith("ghp_")) {
        gitHubToken = decrypted;
        localStorage.setItem('MAO_PAN_TOKEN', gitHubToken);
        showToast("解密验证成功！正在进入网盘", "success");
        enterApp();
    } else {
        showToast("账号密码验证失败，解密失败！", "error");
    }
});

function handleLogout() {
    localStorage.removeItem('MAO_PAN_TOKEN');
    gitHubToken = "";
    location.reload();
}

document.getElementById('logout-btn').addEventListener('click', handleLogout);

// Initialize workspace
async function enterApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-workspace').style.display = 'block';
    
    try {
        await verifyAndCreateStorageRepo();
        await fetchFilesList();
    } catch (err) {
        console.error(err);
        showToast("初始化存储仓库失败，请刷新页面", "error");
    }
}

// Check if pan-data repository exists, if not, create it as PRIVATE
async function verifyAndCreateStorageRepo() {
    try {
        // Try fetching repo details
        const repoInfo = await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}`);
        isStorageRepoPrivate = repoInfo.private;
        console.log(`Repository ${STORAGE_REPO} exists. Private: ${isStorageRepoPrivate}`);
    } catch (err) {
        // If 404, repository doesn't exist
        if (err.message.includes("Not Found")) {
            showToast("检测到存储库不存在，正在创建私有存储库...", "success");
            try {
                const createRes = await githubRequest('/user/repos', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: STORAGE_REPO,
                        description: "Mao Portal Private Netdisk storage repository",
                        private: true,
                        auto_init: true // Creates the main branch with README
                    })
                });
                isStorageRepoPrivate = createRes.private;
                showToast("私有存储库创建成功！", "success");
            } catch (createErr) {
                console.error(createErr);
                showToast("创建存储库失败，请确认 Token 具有 repo 写入权限", "error");
                throw createErr;
            }
        } else {
            throw err;
        }
    }
}

// Fetch Files
async function fetchFilesList() {
    const container = document.getElementById('files-container-list');
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">正在读取文件列表...</div>';
    
    try {
        // Fetch contents of the root directory
        const files = await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/contents/?ref=${BRANCH}`);
        
        // Filter out folders/hidden files
        cachedFilesList = files.filter(f => f.type === 'file' && !f.name.startsWith('.'));
        document.getElementById('file-count').innerText = cachedFilesList.length;
        
        renderFilesList();
    } catch (err) {
        console.error(err);
        // If the repository is empty (e.g. newly created without auto_init)
        if (err.message.includes("this repository is empty")) {
            cachedFilesList = [];
            document.getElementById('file-count').innerText = "0";
            container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">网盘中暂无文件。开始上传您的课件吧！</div>';
        } else {
            container.innerHTML = '<div style="text-align: center; color: var(--neon-red); padding: 40px 0;">加载列表失败，请点击刷新重试</div>';
        }
    }
}

// Render UI List
function renderFilesList() {
    const container = document.getElementById('files-container-list');
    
    if (cachedFilesList.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">网盘中暂无文件。开始上传您的课件吧！</div>';
        return;
    }
    
    container.innerHTML = '';
    cachedFilesList.forEach(file => {
        const item = document.createElement('div');
        item.className = 'file-item';
        
        const icon = getFileIcon(file.name);
        const sizeStr = formatBytes(file.size);

        item.innerHTML = `
            <div class="file-info">
                <div class="file-icon">${icon}</div>
                <div class="file-meta">
                    <div class="file-name" title="${file.name}">${file.name}</div>
                    <div class="file-specs">
                        <span>${sizeStr}</span>
                    </div>
                </div>
            </div>
            <div class="file-actions">
                <button class="action-btn" onclick="downloadFile('${file.name}')">下载</button>
                <button class="action-btn" onclick="shareFile('${file.name}')">复制分享</button>
                <button class="action-btn btn-delete" onclick="deleteFile('${file.name}', '${file.sha}')">删除</button>
            </div>
        `;
        container.appendChild(item);
    });
}

// Download file via Raw Content stream
async function downloadFile(filename) {
    showToast(`正在从安全云端读取 ${filename}...`, "success");
    
    try {
        // Fetch raw file blob using auth header
        const blob = await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/contents/${encodeURIComponent(filename)}?ref=${BRANCH}`, {
            method: 'GET'
        }, true);
        
        // Trigger download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast("文件下载成功！", "success");
    } catch (err) {
        console.error(err);
        showToast("获取文件失败，请检查网络", "error");
    }
}

// Copy sharing link
function shareFile(filename) {
    if (isStorageRepoPrivate) {
        alert("【提示】\n您的存储仓库目前是“私有（Private）”状态。由于 GitHub 安全限制，私有仓库内的分享链接无法免登直接下载。\n\n【解决方法】\n如果您想开启公开分享功能：\n1. 打开您的 GitHub 仓库 pan-data 设置 (Settings)；\n2. 滚动到页面底部将 Visibility 更改为 Public (公开)；\n3. 刷新网盘，即可一键复制永久高速下载链接！");
        return;
    }

    // If repository is public, copy direct raw download link
    const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${STORAGE_REPO}/${BRANCH}/${encodeURIComponent(filename)}`;
    navigator.clipboard.writeText(rawUrl);
    showToast("公开下载链接已复制至剪贴板！任何人可高速免密下载", "success");
}

// Delete file
async function deleteFile(filename, sha) {
    if (!confirm(`警告：确定要彻底删除文件 ${filename} 吗？\n删除后不可恢复。`)) return;

    showToast("正在向云端提交删除指令...", "success");
    
    try {
        await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/contents/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
            body: JSON.stringify({
                message: `delete file ${filename}`,
                sha: sha,
                branch: BRANCH
            })
        });
        showToast("文件删除成功！", "success");
        fetchFilesList();
    } catch (err) {
        console.error(err);
        showToast("删除文件失败，请刷新重试", "error");
    }
}

// File icon selector
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

// Bytes Formatter
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Drag & Drop Upload
const dropzone = document.getElementById('upload-dropzone');
const fileInput = document.getElementById('file-input');
const progressContainer = document.getElementById('upload-progress-container');
const progressFill = document.getElementById('upload-progress-fill');
const statusText = document.getElementById('upload-status-text');
const percentText = document.getElementById('upload-percent-text');

dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => handleFilesUpload(fileInput.files));

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    handleFilesUpload(e.dataTransfer.files);
});

// Upload handler
function handleFilesUpload(files) {
    if (files.length === 0) return;
    const file = files[0];
    
    // File size safety limit (GitHub Contents API max 100MB)
    if (file.size > 100 * 1024 * 1024) {
        showToast("单个文件大小不能超过 100MB！", "error");
        return;
    }
    
    progressContainer.style.display = 'block';
    statusText.innerText = `准备读取 ${file.name}...`;
    percentText.innerText = '0%';
    progressFill.style.width = '0%';
    
    const reader = new FileReader();
    
    // Check if the file already exists to obtain its SHA
    const existingFile = cachedFilesList.find(f => f.name === file.name);
    const existingSha = existingFile ? existingFile.sha : null;
    
    reader.onload = async (e) => {
        statusText.innerText = `正在转码并安全推送到 GitHub...`;
        
        const arrayBuffer = e.target.result;
        const base64Content = btoa(
            new Uint8Array(arrayBuffer)
                .reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        
        const payload = {
            message: `upload file ${file.name}`,
            content: base64Content,
            branch: BRANCH
        };
        if (existingSha) {
            payload.sha = existingSha;
        }
        
        try {
            // Push via GitHub Contents API
            await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/contents/${encodeURIComponent(file.name)}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            
            progressFill.style.width = '100%';
            percentText.innerText = '100%';
            statusText.innerText = `文件 ${file.name} 上传成功！`;
            showToast("文件已安全存入您的私有云端", "success");
            
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 1500);
            
            fetchFilesList();
        } catch (err) {
            console.error(err);
            statusText.innerText = '上传失败';
            showToast("文件上传失败，请重试", "error");
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 2000);
        }
    };
    
    reader.onprogress = (e) => {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 50); // Reading counts as first 50%
            progressFill.style.width = percent + '%';
            percentText.innerText = percent + '%';
            statusText.innerText = `本地读取进度: ${percent * 2}%`;
        }
    };
    
    reader.readAsArrayBuffer(file);
}
