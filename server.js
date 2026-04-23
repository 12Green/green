const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

const serverCode = generateCode();
let connectedPhone = null;
let screenClient = null;

const server = http.createServer((req, res) => {
  // 获取投屏码
  if (req.url === '/api/code') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: serverCode }));
    return;
  }
  
  // 屏幕端首页
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
    res.end(getScreenHTML());
    return;
  }
  
  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const type = url.searchParams.get('type');
  
  if (type === 'screen') {
    screenClient = ws;
    console.log('[屏幕端] 已连接');
    ws.send(JSON.stringify({ type: 'connected', phoneCount: connectedPhone ? 1 : 0 }));
    
    ws.on('close', () => {
      screenClient = null;
      console.log('[屏幕端] 已断开');
    });
  } else if (type === 'phone') {
    const code = url.searchParams.get('code');
    if (code === serverCode) {
      connectedPhone = ws;
      console.log('[手机端] 已连接');
      ws.send(JSON.stringify({ type: 'connected', success: true }));
      
      if (screenClient && screenClient.readyState === WebSocket.OPEN) {
        screenClient.send(JSON.stringify({ type: 'phoneconnected' }));
      }
      
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (screenClient && screenClient.readyState === WebSocket.OPEN) {
            screenClient.send(JSON.stringify(msg));
          }
        } catch (e) {
          console.error('消息解析错误:', e);
        }
      });
      
      ws.on('close', () => {
        connectedPhone = null;
        if (screenClient && screenClient.readyState === WebSocket.OPEN) {
          screenClient.send(JSON.stringify({ type: 'phonedisconnected' }));
        }
      });
    } else {
      ws.send(JSON.stringify({ type: 'error', message: '投屏码错误' }));
      ws.close();
    }
  }
});

function getScreenHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>屏幕投射</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; color: #fff; }
    .container { display: flex; min-height: 100vh; }
    .sidebar { width: 300px; background: rgba(255,255,255,0.05); padding: 30px; display: flex; flex-direction: column; align-items: center; border-right: 1px solid rgba(255,255,255,0.1); }
    .qrcode { width: 200px; height: 200px; background: #fff; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; }
    .code-label { font-size: 14px; color: rgba(255,255,255,0.6); margin-bottom: 8px; }
    .code-value { font-size: 48px; font-weight: bold; color: #00d4ff; letter-spacing: 8px; }
    .status { margin-top: 30px; padding: 12px 24px; border-radius: 24px; font-size: 14px; }
    .status.disconnected { background: rgba(255,100,100,0.2); color: #ff6464; }
    .status.connected { background: rgba(100,255,150,0.2); color: #64ff96; }
    .main { flex: 1; padding: 30px; display: flex; flex-direction: column; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .content-area { flex: 1; background: rgba(0,0,0,0.3); border-radius: 12px; padding: 30px; display: flex; flex-direction: column; overflow: hidden; }
    .placeholder { flex: 1; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.3); font-size: 18px; }
    .display-item { animation: fadeIn 0.3s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .text-content { font-size: 32px; line-height: 1.6; word-wrap: break-word; }
    .media-content { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
    .media-content video, .media-content audio { max-width: 100%; max-height: 100%; }
  </style>
</head>
<body>
  <div class="container">
    <div class="sidebar">
      <div class="qrcode" id="qrcode"></div>
      <div class="code-label">投屏码</div>
      <div class="code-value">${serverCode}</div>
      <div class="status disconnected" id="status">等待手机连接...</div>
    </div>
    <div class="main">
      <div class="header"><h1>屏幕投射</h1></div>
      <div class="content-area">
        <div class="placeholder" id="placeholder">手机扫码后显示内容</div>
        <div class="display-item" id="displayContent" style="display:none;"></div>
      </div>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
  <script>
    const ws = new WebSocket('wss://' + window.location.host + '?type=screen');
    ws.onopen = () => { generateQRCode(); };
    ws.onmessage = (event) => { const msg = JSON.parse(event.data); handleMessage(msg); };
    ws.onclose = () => { document.getElementById('status').className = 'status disconnected'; document.getElementById('status').textContent = '连接断开'; };
    function generateQRCode() {
      const url = window.location.origin + '/phone.html?code=${serverCode}';
      QRCode.toCanvas(document.createElement('canvas'), url, { width: 180 }, (err, canvas) => {
        if (!err) { document.getElementById('qrcode').innerHTML = ''; document.getElementById('qrcode').appendChild(canvas); }
      });
    }
    function handleMessage(msg) {
      if (msg.type === 'connected') { document.getElementById('status').className = 'status connected'; document.getElementById('status').textContent = '已就绪'; }
      else if (msg.type === 'phoneconnected') { document.getElementById('status').textContent = '手机已连接'; }
      else if (msg.type === 'phonedisconnected') { document.getElementById('status').textContent = '手机已断开'; }
      else if (msg.type === 'content') { displayContent(msg); }
      else if (msg.type === 'clear') { clearDisplay(); }
    }
    function displayContent(msg) {
      document.getElementById('placeholder').style.display = 'none';
      const el = document.getElementById('displayContent');
      el.style.display = 'block';
      if (msg.contentType === 'text') el.innerHTML = '<div class="text-content">' + msg.data.replace(/\\n/g, '<br>') + '</div>';
      else if (msg.contentType === 'image') el.innerHTML = '<div class="media-content"><img src="' + msg.data + '" style="max-width:100%;max-height:100%;"></div>';
      else if (msg.contentType === 'video') el.innerHTML = '<div class="media-content"><video src="' + msg.data + '" controls autoplay style="max-width:100%;max-height:100%;"></video></div>';
      else if (msg.contentType === 'audio') el.innerHTML = '<div class="media-content"><audio src="' + msg.data + '" controls autoplay></audio></div>';
    }
    function clearDisplay() {
      document.getElementById('placeholder').style.display = 'flex';
      document.getElementById('displayContent').style.display = 'none';
      document.getElementById('displayContent').innerHTML = '';
    }
  </script>
</body>
</html>`;
}

server.listen(PORT, () => {
  console.log('服务已启动，投屏码: ' + serverCode);
});
