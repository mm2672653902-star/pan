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
let currentPath = ""; // Track current folder path
let cachedFilesList = []; // Holds { name, path, sha, size, type } (files in current folder)
let cachedFoldersList = []; // Holds folders in current folder
let isStorageRepoPrivate = true; // Cached visibility of storage repo
let currentPreviewFile = { path: "", name: "" };
let currentPreviewObjectURL = null;

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
    const localSearchInput = document.getElementById('local-search-input');
    if (localSearchInput) localSearchInput.value = '';

    const container = document.getElementById('files-container-list');
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">正在读取文件列表...</div>';
    
    try {
        // URL encode the path segments correctly
        const encodedPath = currentPath ? currentPath.split('/').map(encodeURIComponent).join('/') : "";
        const endpoint = `/repos/${REPO_OWNER}/${STORAGE_REPO}/contents/${encodedPath}?ref=${BRANCH}`;
        const items = await githubRequest(endpoint);
        
        // Separate folders and files, filtering out .gitkeep files
        cachedFoldersList = items.filter(f => f.type === 'dir');
        cachedFilesList = items.filter(f => f.type === 'file' && f.name !== '.gitkeep');
        
        // Update the file count display
        document.getElementById('file-count').innerText = cachedFilesList.length;
        
        renderFilesList();
    } catch (err) {
        console.error(err);
        if (err.message.includes("Not Found") && currentPath !== "") {
            showToast("当前文件夹已不存在，已返回根目录", "error");
            currentPath = "";
            fetchFilesList();
            return;
        }
        
        // If the repository is empty (e.g. newly created without auto_init)
        if (err.message.includes("this repository is empty")) {
            cachedFoldersList = [];
            cachedFilesList = [];
            document.getElementById('file-count').innerText = "0";
            renderFilesList();
        } else {
            container.innerHTML = '<div style="text-align: center; color: var(--neon-red); padding: 40px 0;">加载列表失败，请点击刷新重试</div>';
        }
    }
}

// Render Go Up Helper
function renderGoUpItem(container) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
        const parts = currentPath.split('/');
        parts.pop();
        currentPath = parts.join('/');
        fetchFilesList();
    });
    item.innerHTML = `
        <div class="file-info">
            <div class="file-icon">🔙</div>
            <div class="file-meta">
                <div class="file-name">.. (返回上级)</div>
                <div class="file-specs">
                    <span>返回上层目录</span>
                </div>
            </div>
        </div>
        <div class="file-actions"></div>
    `;
    container.appendChild(item);
}

// Render UI List
function renderFilesList(filterKeyword = "") {
    const container = document.getElementById('files-container-list');
    
    // Render Breadcrumbs
    const breadcrumbContainer = document.getElementById('breadcrumb-container');
    if (breadcrumbContainer) {
        breadcrumbContainer.innerHTML = '';
        
        const rootSpan = document.createElement('span');
        rootSpan.innerHTML = '📁 根目录';
        rootSpan.style.cursor = 'pointer';
        rootSpan.style.color = currentPath === "" ? 'var(--neon-cyan)' : 'var(--text-silver)';
        rootSpan.addEventListener('click', () => {
            if (currentPath !== "") {
                const localSearchInput = document.getElementById('local-search-input');
                if (localSearchInput) localSearchInput.value = '';
                currentPath = "";
                fetchFilesList();
            }
        });
        breadcrumbContainer.appendChild(rootSpan);
        
        if (currentPath) {
            const parts = currentPath.split('/');
            let accum = "";
            parts.forEach((part, index) => {
                const sep = document.createElement('span');
                sep.innerText = ' / ';
                sep.style.color = 'var(--text-muted)';
                breadcrumbContainer.appendChild(sep);
                
                accum = accum ? `${accum}/${part}` : part;
                const thisPath = accum;
                
                const span = document.createElement('span');
                span.innerText = part;
                span.style.cursor = 'pointer';
                span.style.color = index === parts.length - 1 ? 'var(--neon-cyan)' : 'var(--text-silver)';
                span.addEventListener('click', () => {
                    if (currentPath !== thisPath) {
                         const localSearchInput = document.getElementById('local-search-input');
                         if (localSearchInput) localSearchInput.value = '';
                         currentPath = thisPath;
                         fetchFilesList();
                    }
                });
                breadcrumbContainer.appendChild(span);
            });
        }
    }
    
    // Filter
    const kw = filterKeyword.trim().toLowerCase();
    const foldersToRender = kw ? cachedFoldersList.filter(f => f.name.toLowerCase().includes(kw)) : cachedFoldersList;
    const filesToRender = kw ? cachedFilesList.filter(f => f.name.toLowerCase().includes(kw)) : cachedFilesList;
    
    // If folder is empty
    if (foldersToRender.length === 0 && filesToRender.length === 0) {
        container.innerHTML = '';
        if (currentPath !== "") {
            renderGoUpItem(container);
        }
        
        const emptyMsg = document.createElement('div');
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.color = 'var(--text-muted)';
        emptyMsg.style.padding = '40px 0';
        emptyMsg.innerText = kw ? '没有找到匹配的文件或文件夹。' : '网盘中暂无文件或文件夹。开始上传或新建文件夹吧！';
        container.appendChild(emptyMsg);
        return;
    }
    
    container.innerHTML = '';
    
    // Prepend Go Up item if in subfolder
    if (currentPath !== "") {
        renderGoUpItem(container);
    }
    
    // Render Folders
    foldersToRender.forEach(folder => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <div class="file-info" style="cursor: pointer;">
                <div class="file-icon">📁</div>
                <div class="file-meta">
                    <div class="file-name" title="${folder.name}">${folder.name}</div>
                    <div class="file-specs">
                        <span>文件夹</span>
                    </div>
                </div>
            </div>
            <div class="file-actions">
                <button class="action-btn" onclick="renameFolder('${folder.path.replace(/'/g, "\\'")}', '${folder.name.replace(/'/g, "\\'")}')">重命名</button>
                <button class="action-btn btn-delete" onclick="deleteFolder('${folder.path.replace(/'/g, "\\'")}', '${folder.name.replace(/'/g, "\\'")}')">删除</button>
            </div>
        `;
        item.querySelector('.file-info').addEventListener('click', () => {
            const localSearchInput = document.getElementById('local-search-input');
            if (localSearchInput) localSearchInput.value = '';
            currentPath = folder.path;
            fetchFilesList();
        });
        container.appendChild(item);
    });
    
    // Render Files
    filesToRender.forEach(file => {
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
                <button class="action-btn" onclick="previewFile('${file.path.replace(/'/g, "\\'")}', '${file.name.replace(/'/g, "\\'")}')">预览</button>
                <button class="action-btn" onclick="downloadFile('${file.path.replace(/'/g, "\\'")}', '${file.name.replace(/'/g, "\\'")}')">下载</button>
                <button class="action-btn" onclick="shareFile('${file.path.replace(/'/g, "\\'")}', '${file.name.replace(/'/g, "\\'")}')">复制分享</button>
                <button class="action-btn btn-delete" onclick="deleteFile('${file.path.replace(/'/g, "\\'")}', '${file.name.replace(/'/g, "\\'")}', '${file.sha}')">删除</button>
            </div>
        `;
        container.appendChild(item);
    });
}

// Download file via Raw Content stream
async function downloadFile(filePath, fileName) {
    showToast(`正在从安全云端读取 ${fileName}...`, "success");
    
    try {
        const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
        // Fetch raw file blob using auth header
        const blob = await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/contents/${encodedPath}?ref=${BRANCH}`, {
            method: 'GET'
        }, true);
        
        // Trigger download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
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
function shareFile(filePath, fileName) {
    if (isStorageRepoPrivate) {
        alert("【提示】\n您的存储仓库目前是“私有（Private）”状态。由于 GitHub 安全限制，私有仓库内的分享链接无法免登直接下载。\n\n【解决方法】\n如果您想开启公开分享功能：\n1. 打开您的 GitHub 仓库 pan-data 设置 (Settings)；\n2. 滚动到页面底部将 Visibility 更改为 Public (公开)；\n3. 刷新网盘，即可一键复制永久高速下载链接！");
        return;
    }

    // If repository is public, copy optimized jsDelivr CDN download link (extremely fast in China and works without VPN!)
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const cdnUrl = `https://fastly.jsdelivr.net/gh/${REPO_OWNER}/${STORAGE_REPO}@${BRANCH}/${encodedPath}`;
    navigator.clipboard.writeText(cdnUrl);
    showToast("国内直连下载链接已复制！任何人可高速免密下载", "success");
}

// Delete file
async function deleteFile(filePath, fileName, sha) {
    if (!confirm(`警告：确定要彻底删除文件 ${fileName} 吗？\n删除后不可恢复。`)) return;

    showToast("正在向云端提交删除指令...", "success");
    
    try {
        const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
        await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/contents/${encodedPath}`, {
            method: 'DELETE',
            body: JSON.stringify({
                message: `delete file ${fileName}`,
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

// Folder Creation
async function promptNewFolder() {
    const name = prompt("请输入新建文件夹的名称:");
    if (!name) return;
    const cleanName = name.trim();
    if (!cleanName) {
        showToast("文件夹名称不能为空", "error");
        return;
    }
    if (cleanName.includes('/') || cleanName.includes('\\')) {
        showToast("文件夹名称不能包含斜杠 / 或 \\", "error");
        return;
    }
    if (cleanName === "." || cleanName === "..") {
        showToast("文件夹名称非法", "error");
        return;
    }
    
    const exists = cachedFoldersList.some(f => f.name.toLowerCase() === cleanName.toLowerCase()) ||
                   cachedFilesList.some(f => f.name.toLowerCase() === cleanName.toLowerCase());
    if (exists) {
        showToast("当前目录下已存在同名文件夹或文件", "error");
        return;
    }
    
    showToast("正在创建文件夹...", "success");
    try {
        const folderPath = currentPath ? `${currentPath}/${cleanName}` : cleanName;
        const gitkeepPath = `${folderPath}/.gitkeep`;
        const encodedPath = gitkeepPath.split('/').map(encodeURIComponent).join('/');
        
        await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/contents/${encodedPath}`, {
            method: 'PUT',
            body: JSON.stringify({
                message: `create folder ${cleanName}`,
                content: "",
                branch: BRANCH
            })
        });
        
        showToast("文件夹创建成功！", "success");
        fetchFilesList();
    } catch (err) {
        console.error(err);
        showToast("创建文件夹失败，请刷新重试", "error");
    }
}

// Rename Folder (Atomic Recursive)
async function renameFolder(folderPath, folderName) {
    const newName = prompt(`请输入文件夹 "${folderName}" 的新名称:`, folderName);
    if (!newName) return;
    const cleanNewName = newName.trim();
    if (!cleanNewName || cleanNewName === folderName) return;
    
    if (cleanNewName.includes('/') || cleanNewName.includes('\\')) {
        showToast("文件夹名称不能包含斜杠 / 或 \\", "error");
        return;
    }
    
    // Check local duplicates
    const exists = cachedFoldersList.some(f => f.name.toLowerCase() === cleanNewName.toLowerCase()) ||
                   cachedFilesList.some(f => f.name.toLowerCase() === cleanNewName.toLowerCase());
    if (exists) {
        showToast("当前目录下已存在同名文件夹或文件", "error");
        return;
    }
    
    showToast("正在重命名文件夹...", "success");
    
    try {
        // Step 1: Get the current commit SHA of the branch
        const refData = await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/git/refs/heads/${BRANCH}`);
        const commitSha = refData.object.sha;
        
        // Step 2: Get the tree of that commit recursively
        const treeData = await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/git/trees/${commitSha}?recursive=true`);
        
        // Step 3: Determine the parent path and the new folder path
        const parentPathParts = folderPath.split('/');
        parentPathParts.pop();
        const parentPath = parentPathParts.join('/');
        const newFolderPath = parentPath ? `${parentPath}/${cleanNewName}` : cleanNewName;
        
        const treeUpdates = [];
        let matchedCount = 0;
        
        treeData.tree.forEach(item => {
            if (item.type === 'blob' && (item.path === folderPath || item.path.startsWith(folderPath + '/'))) {
                matchedCount++;
                // Delete old path
                treeUpdates.push({
                    path: item.path,
                    mode: item.mode,
                    type: 'blob',
                    sha: null
                });
                // Add new path
                const relativePath = item.path.substring(folderPath.length);
                const newPath = newFolderPath + relativePath;
                treeUpdates.push({
                    path: newPath,
                    mode: item.mode,
                    type: 'blob',
                    sha: item.sha
                });
            }
        });
        
        if (matchedCount === 0) {
            // Fallback: If for some reason there are no files inside, write new .gitkeep
            const encodedPath = `${newFolderPath}/.gitkeep`.split('/').map(encodeURIComponent).join('/');
            await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/contents/${encodedPath}`, {
                method: 'PUT',
                body: JSON.stringify({
                    message: `rename empty folder to ${cleanNewName}`,
                    content: "",
                    branch: BRANCH
                })
            });
            showToast("文件夹重命名成功！", "success");
            fetchFilesList();
            return;
        }
        
        // Step 4: Create new tree
        const newTreeData = await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/git/trees`, {
            method: 'POST',
            body: JSON.stringify({
                base_tree: commitSha,
                tree: treeUpdates
            })
        });
        
        // Step 5: Create new commit
        const newCommitData = await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/git/commits`, {
            method: 'POST',
            body: JSON.stringify({
                message: `rename folder ${folderName} to ${cleanNewName}`,
                tree: newTreeData.sha,
                parents: [commitSha]
            })
        });
        
        // Step 6: Update branch ref
        await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/git/refs/heads/${BRANCH}`, {
            method: 'PATCH',
            body: JSON.stringify({
                sha: newCommitData.sha,
                force: false
            })
        });
        
        // Update currentPath if it was inside the renamed folder
        if (currentPath === folderPath) {
            currentPath = newFolderPath;
        } else if (currentPath.startsWith(folderPath + '/')) {
            currentPath = newFolderPath + currentPath.substring(folderPath.length);
        }
        
        showToast("文件夹重命名成功！", "success");
        fetchFilesList();
    } catch (err) {
        console.error(err);
        showToast("重命名文件夹失败，请刷新重试", "error");
    }
}

// Delete Folder (Atomic Recursive)
async function deleteFolder(folderPath, folderName) {
    if (!confirm(`警告：确定要彻底删除文件夹 "${folderName}" 及其包含的所有文件吗？\n此操作不可恢复！`)) return;
    
    showToast("正在删除文件夹...", "success");
    
    try {
        // Step 1: Get the current commit SHA of the branch
        const refData = await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/git/refs/heads/${BRANCH}`);
        const commitSha = refData.object.sha;
        
        // Step 2: Get the tree of that commit recursively
        const treeData = await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/git/trees/${commitSha}?recursive=true`);
        
        const treeUpdates = [];
        let matchedCount = 0;
        
        treeData.tree.forEach(item => {
            if (item.type === 'blob' && (item.path === folderPath || item.path.startsWith(folderPath + '/'))) {
                matchedCount++;
                // Delete path
                treeUpdates.push({
                    path: item.path,
                    mode: item.mode,
                    type: 'blob',
                    sha: null
                });
            }
        });
        
        if (matchedCount === 0) {
            showToast("文件夹为空，无需删除", "success");
            fetchFilesList();
            return;
        }
        
        // Step 3: Create new tree
        const newTreeData = await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/git/trees`, {
            method: 'POST',
            body: JSON.stringify({
                base_tree: commitSha,
                tree: treeUpdates
            })
        });
        
        // Step 4: Create new commit
        const newCommitData = await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/git/commits`, {
            method: 'POST',
            body: JSON.stringify({
                message: `delete folder ${folderName}`,
                tree: newTreeData.sha,
                parents: [commitSha]
            })
        });
        
        // Step 5: Update branch ref
        await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/git/refs/heads/${BRANCH}`, {
            method: 'PATCH',
            body: JSON.stringify({
                sha: newCommitData.sha,
                force: false
            })
        });
        
        // Reset currentPath if it was inside the deleted folder
        if (currentPath === folderPath || currentPath.startsWith(folderPath + '/')) {
            const parts = folderPath.split('/');
            parts.pop();
            currentPath = parts.join('/');
        }
        
        showToast("文件夹删除成功！", "success");
        fetchFilesList();
    } catch (err) {
        console.error(err);
        showToast("删除文件夹失败，请刷新重试", "error");
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
    
    // Check if the file already exists in the current folder to obtain its SHA
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
            const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
            const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
            
            // Push via GitHub Contents API
            await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/contents/${encodedPath}`, {
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

// 局部搜索入口
function handleLocalSearch(keyword) {
    renderFilesList(keyword);
}

// 打开全局搜索
async function openGlobalSearch() {
    const keyword = prompt("请输入全局搜索关键词（匹配文件名）：");
    if (keyword === null) return; 
    const cleanKeyword = keyword.trim();
    if (!cleanKeyword) {
        showToast("关键词不能为空", "error");
        return;
    }
    
    showToast("正在检索云端全部文件...", "success");
    const container = document.getElementById('files-container-list');
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">正在检索云端数据树...</div>';
    
    try {
        const refData = await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/git/refs/heads/${BRANCH}`);
        const commitSha = refData.object.sha;
        
        const treeData = await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/git/trees/${commitSha}?recursive=true`);
        
        const kw = cleanKeyword.toLowerCase();
        const results = treeData.tree.filter(item => {
            if (item.type !== 'blob') return false;
            const fileName = item.path.split('/').pop();
            if (fileName === '.gitkeep') return false;
            return fileName.toLowerCase().includes(kw);
        });
        
        renderSearchResults(results, cleanKeyword);
    } catch (err) {
        console.error(err);
        showToast("全局检索失败，请重试", "error");
        fetchFilesList();
    }
}

// 渲染全局搜索结果
function renderSearchResults(results, keyword) {
    const container = document.getElementById('files-container-list');
    
    const breadcrumbContainer = document.getElementById('breadcrumb-container');
    if (breadcrumbContainer) {
        breadcrumbContainer.innerHTML = '';
        
        const rootSpan = document.createElement('span');
        rootSpan.innerHTML = '📁 返回根目录';
        rootSpan.style.cursor = 'pointer';
        rootSpan.style.color = 'var(--text-silver)';
        rootSpan.addEventListener('click', () => {
            currentPath = "";
            fetchFilesList();
        });
        breadcrumbContainer.appendChild(rootSpan);
        
        const sep = document.createElement('span');
        sep.innerText = ' / ';
        sep.style.color = 'var(--text-muted)';
        breadcrumbContainer.appendChild(sep);
        
        const searchSpan = document.createElement('span');
        searchSpan.innerText = `🔍 全局搜索结果: "${keyword}" (${results.length} 项)`;
        searchSpan.style.color = 'var(--neon-cyan)';
        breadcrumbContainer.appendChild(searchSpan);
    }
    
    if (results.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 40px 0;">
                未找到与 "${keyword}" 相关的匹配文件。
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    results.forEach(item => {
        const fileName = item.path.split('/').pop();
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        const icon = getFileIcon(fileName);
        const sizeStr = formatBytes(item.size || 0);
        const displayPath = item.path;
        
        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-icon">${icon}</div>
                <div class="file-meta">
                    <div class="file-name" title="${fileName}">${fileName}</div>
                    <div class="search-result-path" title="${displayPath}">${displayPath}</div>
                </div>
            </div>
            <div class="file-actions">
                <button class="action-btn" onclick="previewFile('${item.path.replace(/'/g, "\\'")}', '${fileName.replace(/'/g, "\\'")}')">预览</button>
                <button class="action-btn" onclick="locateFile('${item.path.replace(/'/g, "\\'")}')">定位</button>
                <button class="action-btn" onclick="downloadFile('${item.path.replace(/'/g, "\\'")}', '${fileName.replace(/'/g, "\\'")}')">下载</button>
            </div>
        `;
        container.appendChild(fileItem);
    });
}

// 定位文件所在目录
async function locateFile(filePath) {
    const parts = filePath.split('/');
    parts.pop(); 
    const parentPath = parts.join('/');
    
    currentPath = parentPath;
    showToast("已成功定位到文件夹", "success");
    fetchFilesList();
}

// 在线预览辅助：获取 MIME 类型
function getMimeType(ext) {
    const mimeMap = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'pdf': 'application/pdf',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mkv': 'video/x-matroska',
        'avi': 'video/x-msvideo',
        'txt': 'text/plain;charset=utf-8',
        'md': 'text/markdown;charset=utf-8',
        'js': 'application/javascript;charset=utf-8',
        'css': 'text/css;charset=utf-8',
        'html': 'text/html;charset=utf-8',
        'py': 'text/x-python;charset=utf-8',
        'json': 'application/json;charset=utf-8',
        'c': 'text/x-c;charset=utf-8',
        'cpp': 'text/x-c++;charset=utf-8',
        'h': 'text/x-c;charset=utf-8',
        'java': 'text/x-java-source;charset=utf-8',
        'go': 'text/x-go;charset=utf-8',
        'sh': 'application/x-sh;charset=utf-8',
        'yaml': 'text/yaml;charset=utf-8',
        'yml': 'text/yaml;charset=utf-8',
        'ini': 'text/plain;charset=utf-8',
        'sql': 'text/x-sql;charset=utf-8'
    };
    return mimeMap[ext] || 'application/octet-stream';
}

// 在线预览主入口
async function previewFile(filePath, fileName) {
    showToast(`正在从安全云端加载预览 ${fileName}...`, "success");
    
    try {
        if (currentPreviewObjectURL) {
            URL.revokeObjectURL(currentPreviewObjectURL);
            currentPreviewObjectURL = null;
        }
        
        currentPreviewFile = { path: filePath, name: fileName };
        
        const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
        const ext = fileName.split('.').pop().toLowerCase();
        
        const isImage = ["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext);
        const isPdf = ext === "pdf";
        const isAudio = ["mp3", "wav", "ogg"].includes(ext);
        const isVideo = ["mp4", "webm", "ogg", "mkv", "avi"].includes(ext);
        const isText = ["txt", "md", "js", "css", "html", "py", "json", "c", "cpp", "h", "java", "go", "sh", "yaml", "yml", "ini", "sql"].includes(ext);
        
        const modal = document.getElementById('preview-modal');
        const modalTitle = document.getElementById('preview-modal-title');
        const modalBody = document.getElementById('preview-modal-body');
        
        modalTitle.innerText = fileName;
        modalBody.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">正在加载内容...</div>';
        modal.style.display = 'flex';
        
        if (isImage || isPdf || isAudio || isVideo || isText) {
            const rawBlob = await githubRequest(`/repos/${REPO_OWNER}/${STORAGE_REPO}/contents/${encodedPath}?ref=${BRANCH}`, {
                method: 'GET'
            }, true);
            
            // 使用正确的 MIME 类型重新构造 Blob
            const mimeType = getMimeType(ext);
            const blob = new Blob([rawBlob], { type: mimeType });
            
            modalBody.innerHTML = ''; 
            
            if (isImage) {
                currentPreviewObjectURL = URL.createObjectURL(blob);
                const img = document.createElement('img');
                img.src = currentPreviewObjectURL;
                modalBody.appendChild(img);
            } else if (isPdf) {
                currentPreviewObjectURL = URL.createObjectURL(blob);
                const iframe = document.createElement('iframe');
                iframe.src = currentPreviewObjectURL;
                modalBody.appendChild(iframe);
            } else if (isAudio) {
                currentPreviewObjectURL = URL.createObjectURL(blob);
                const audio = document.createElement('audio');
                audio.controls = true;
                audio.src = currentPreviewObjectURL;
                modalBody.appendChild(audio);
            } else if (isVideo) {
                currentPreviewObjectURL = URL.createObjectURL(blob);
                const video = document.createElement('video');
                video.controls = true;
                video.src = currentPreviewObjectURL;
                modalBody.appendChild(video);
            } else if (isText) {
                const text = await blob.text();
                if (ext === "md" && typeof marked !== "undefined") {
                    const mdDiv = document.createElement('div');
                    mdDiv.className = 'markdown-body';
                    mdDiv.innerHTML = marked.parse(text);
                    modalBody.appendChild(mdDiv);
                } else {
                    const pre = document.createElement('pre');
                    const code = document.createElement('code');
                    code.textContent = text;
                    pre.appendChild(code);
                    modalBody.appendChild(pre);
                }
            }
        } else {
            modalBody.innerHTML = `
                <div class="preview-unsupported">
                    <p>📂 该文件类型 (.${ext}) 暂不支持在线预览。</p>
                    <button class="nav-btn" onclick="previewDownloadCurrent()">⬇ 直接下载文件</button>
                </div>
            `;
        }
    } catch (err) {
        console.error(err);
        showToast("加载预览失败，请重试", "error");
        closePreview();
    }
}

// 关闭预览弹窗
function closePreview() {
    const modal = document.getElementById('preview-modal');
    if (modal) modal.style.display = 'none';
    
    if (currentPreviewObjectURL) {
        URL.revokeObjectURL(currentPreviewObjectURL);
        currentPreviewObjectURL = null;
    }
    currentPreviewFile = { path: "", name: "" };
}

// 点击背景关闭
function closePreviewOnBackdrop(event) {
    if (event.target.id === 'preview-modal') {
        closePreview();
    }
}

// 弹窗内直接下载
function previewDownloadCurrent() {
    if (currentPreviewFile.path && currentPreviewFile.name) {
        downloadFile(currentPreviewFile.path, currentPreviewFile.name);
    }
}
