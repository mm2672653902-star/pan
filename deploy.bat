@echo off
title MAO PORTAL PAN OS - Deployer
color 0b
cls
echo =========================================================
echo               MAO PORTAL PAN OS DEPLOYER
echo =========================================================
echo.
echo This script will help you deploy your private cloud drive (pan)
echo to Cloudflare Workers + R2 Storage.
echo.
echo Requirements:
echo 1. You must have a Cloudflare account.
echo 2. Node.js must be installed.
echo.
echo ---------------------------------------------------------
echo Step 1: Check Node.js installation
echo ---------------------------------------------------------
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0c
    echo [ERROR] Node.js is not installed. Please install Node.js first.
    echo Website: https://nodejs.org/
    pause
    exit /b
)
echo [SUCCESS] Node.js is installed.
echo.

echo ---------------------------------------------------------
echo Step 2: Logging in to Cloudflare wrangler CLI
echo ---------------------------------------------------------
echo A browser window will open shortly. Please log in and authorize.
echo.
call npx wrangler login
echo.
echo [SUCCESS] Authorized successfully!
echo.

echo ---------------------------------------------------------
echo Step 3: Creating Cloudflare R2 bucket
echo ---------------------------------------------------------
echo Creating S3-compatible R2 storage bucket 'pan-storage'...
call npx wrangler r2 bucket create pan-storage
echo.
echo [SUCCESS] R2 bucket checked/created.
echo.

echo ---------------------------------------------------------
echo Step 4: Deploying Serverless Worker
echo ---------------------------------------------------------
echo Deploying worker to Cloudflare network...
call npx wrangler deploy
echo.
if %errorlevel% neq 0 (
    color 0c
    echo [ERROR] Deployment failed. Please check the logs above.
    pause
    exit /b
)
echo [SUCCESS] Deployed successfully!
echo.

echo =========================================================
echo               DEPLOYMENT COMPLETE!
echo =========================================================
echo.
echo Next Steps to Bind Custom Domain:
echo 1. Go to your Cloudflare Dashboard (https://dash.cloudflare.com/)
echo 2. Navigate to "Workers & Pages" -> select "pan-worker"
echo 3. Select the "Settings" tab -> click "Triggers"
echo 4. In "Custom Domains", click "Add Custom Domain"
echo 5. Enter: pan.maoxijia.top
echo 6. Click "Save". Cloudflare will automatically bind your domain
echo    and handle SSL/TLS certificate issuing!
echo.
echo The cloud storage will then be accessible at: https://pan.maoxijia.top/
echo.
pause
